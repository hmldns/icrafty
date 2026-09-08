"""Private container entry point; JSON/file operations, never a network server."""

import argparse
import json
import os
from pathlib import Path
import signal
import sys
import threading
import time
import traceback
import uuid

from .files import CadError, atomic_json
from .runtime import GeometryRuntime
from .settings import Settings


def ownership(root, uid):
    for directory, dirs, files in os.walk(root, followlinks=False):
        for name in dirs + files:
            try:
                os.chown(Path(directory)/name, uid, uid, follow_symlinks=False)
            except FileNotFoundError:
                pass
        os.chown(directory, uid, uid, follow_symlinks=False)


def environment():
    def read(path):
        return Path(path).read_text().strip()
    return {'uid':os.getuid(), 'pid':os.getpid(), 'environment_names':sorted(os.environ),
            'network_interfaces':sorted(p.name for p in Path('/sys/class/net').iterdir()),
            'mountinfo':read('/proc/self/mountinfo'), 'process_status':read('/proc/self/status'),
            'cgroup':{name:read('/sys/fs/cgroup/'+name) for name in
                      ('memory.max','memory.swap.max','memory.peak','memory.events','cpu.max','cpu.stat','pids.max','pids.events')},
            'forbidden_paths':{p:Path(p).exists() for p in
                  ('/var/run/docker.sock','/run/docker.sock','/root/.aws','/root/.config','/root/.codex','/home/hmldns','.env')}}


def session(root):
    runtime = GeometryRuntime(root, Settings.environment())
    cancel = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: cancel.set())
    try:
        for line in sys.stdin:
            cancel.clear()
            try:
                request = json.loads(line)
                op = request['op']
                scope = request.get('scope','docker')
                if op == 'ensure_geometry':
                    result = runtime.ensure_geometry(request['request'],scope=scope,cancel=cancel)
                elif op == 'evaluate_geometry':
                    path, code = runtime.evaluate_geometry(request['handle'],request['request'],request['output'],scope=scope,cancel=cancel)
                    result = {'path':str(path),'exit_code':code}
                elif op == 'evaluate':
                    path, code = runtime.evaluate(request['request'],request['output'],scope=scope,cancel=cancel)
                    result = {'path':str(path),'exit_code':code}
                elif op == 'release_geometry':
                    result = runtime.release_geometry(request['handle'],scope=scope)
                elif op == 'inspect_geometry':
                    result = runtime.inspect_geometry(request['handle'],scope=scope)
                elif op == 'restart':
                    runtime.restart()
                    result = runtime.diagnostics()
                elif op == 'diagnostics':
                    result = runtime.diagnostics()
                elif op == 'close':
                    break
                else:
                    raise CadError('invalid_operation','Unknown retained operation')
                message = {'ok':True,'data':result}
            except Exception as exc:
                message = {'ok':False,'code':getattr(exc,'code','container_error'),'error':str(exc),
                           'details':getattr(exc,'details',{})}
            print('CRAFTY_CONTAINER:'+json.dumps(message,allow_nan=False),flush=True)
    finally:
        runtime.close()
    return 0


def probe(kind):
    if kind == 'environment':
        print(json.dumps(environment()),flush=True)
        return 0
    if kind == 'memory':
        blocks=[]
        while True:
            blocks.append(bytearray(4*1024*1024))
    if kind == 'pids':
        children=[]
        try:
            while True:
                pid=os.fork()
                if pid == 0:
                    time.sleep(30)
                    os._exit(0)
                children.append(pid)
        except OSError as exc:
            print(json.dumps({'children':len(children),'errno':exc.errno,'environment':environment()}),flush=True)
        finally:
            for pid in children:
                os.kill(pid,signal.SIGKILL)
                os.waitpid(pid,0)
        return 0
    if kind == 'cpu':
        children=[]
        for _ in range(4):
            pid=os.fork()
            if pid == 0:
                end=time.monotonic()+1.5
                while time.monotonic()<end:
                    pass
                os._exit(0)
            children.append(pid)
        for pid in children:
            os.waitpid(pid,0)
        print(json.dumps(environment()),flush=True)
        return 0
    if kind in ('wait','output'):
        child=os.fork()
        if child == 0:
            os.setsid()  # Cleanup must also cover detached descendants.
            time.sleep(120)
            os._exit(0)
        if kind == 'output':
            with Path('/output/growth').open('wb') as out:
                while True:
                    out.write(b'x'*(1024*1024))
                    out.flush()
                    time.sleep(.01)
        time.sleep(120)
        return 0
    raise CadError('invalid_probe','Unknown acceptance probe')


def main():
    if os.environ.get('CRAFTY_CONTAINER') != '1' or os.getpid() != 1:
        print('This entry point belongs inside the packaged CAD container',file=sys.stderr)
        return 2
    parser=argparse.ArgumentParser()
    parser.add_argument('command',choices=['evaluate','harness','session','probe'])
    args, rest=parser.parse_known_args()
    output=Path('/output')
    code=2
    def interrupt(*_):
        raise KeyboardInterrupt
    for sig in (signal.SIGINT,signal.SIGTERM):
        signal.signal(sig,interrupt)
    try:
        atomic_json(output/'container-environment.json',environment())
        if args.command == 'evaluate':
            from .__main__ import main as evaluate
            code=evaluate(['evaluate',*rest])
        elif args.command == 'harness':
            from .harness.__main__ import main as harness
            code=harness(['run',*rest])
        elif args.command == 'session':
            code=session(output/('runtime-'+uuid.uuid4().hex))
        else:
            code=probe(rest[0])
    except KeyboardInterrupt:
        code=130
    except Exception:
        traceback.print_exc()
    finally:
        # PID 1 owns only this container. Reap also any detached model descendant
        # before freezing files for the host's bounded data-only capture.
        for proc in Path('/proc').iterdir():
            if proc.name.isdigit() and int(proc.name) != os.getpid():
                try:
                    os.kill(int(proc.name),signal.SIGKILL)
                except ProcessLookupError:
                    pass
        while True:
            try:
                pid,_=os.waitpid(-1,os.WNOHANG)
                if not pid:
                    break
            except ChildProcessError:
                break
        try:
            atomic_json(output/'container-final-environment.json',environment())
        except OSError as exc:
            print(f'Container report finalization: {exc}',file=sys.stderr)
    print('CRAFTY_DONE:'+str(code),flush=True)
    # Keep the private bounded tmpfs alive until the host has captured evidence.
    # The host's wall/cancellation watchdog also owns this capture handshake.
    signal.signal(signal.SIGTERM,lambda *_: None)
    sys.stdin.readline()
    return code


if __name__ == '__main__':
    sys.exit(main())
