"""Host-owned Docker execution and bounded capture. No daemon socket enters CAD."""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
import json
import os
from pathlib import Path, PurePosixPath
import selectors
import shutil
import signal
import subprocess
import sys
import tarfile
import threading
import time
import uuid

from .contract import compare, validate_request, validate_result
from .files import CadError, atomic_bytes, atomic_json, canonical, contained, digest, load_json, read_bytes, record
from .runtime import now


CAD=Path(__file__).resolve().parents[2]


def service_digest():
    files=[]
    for name in ('src','tests','fixtures','examples','schemas'):
        files.extend(p for p in (CAD/name).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
    files.extend([CAD/'uv.lock',CAD/'pyproject.toml',CAD/'.python-version'])
    return digest(canonical({p.relative_to(CAD).as_posix():digest(read_bytes(p)) for p in sorted(files)}))


@dataclass(frozen=True)
class Limits:
    memory_bytes: int=2*1024**3
    cpus: float=2.0
    processes: int=64
    output_bytes: int=512*1024**2
    temporary_bytes: int=128*1024**2
    file_bytes: int=128*1024**2
    seconds: float=300.0
    log_bytes: int=2*1024**2


def cli(argv, **kwargs):
    return subprocess.run(['docker',*argv],capture_output=True,text=True,timeout=kwargs.pop('timeout',30),**kwargs)


def resolve_image():
    image=os.environ.get('CRAFTY_DOCKER_IMAGE')
    if not image:
        saved=CAD/'runs/docker/current-image.json'
        if not saved.is_file():
            raise CadError('missing_prerequisite','Build the pinned CAD image first; see docker/README.md')
        metadata=load_json(saved)
        if metadata.get('service_sha256')!=service_digest():
            raise CadError('missing_prerequisite','Pinned CAD image predates current service/fixture bytes; run make -C cad image-docker')
        image=metadata['image_id']
    proc=cli(['image','inspect',image])
    if proc.returncode:
        raise CadError('missing_prerequisite','Docker daemon or pinned CAD image unavailable: '+proc.stderr.strip())
    inspected=json.loads(proc.stdout)[0]
    return inspected['Id'],inspected


class DockerJob:
    """One owned container with private, hard-bounded tmpfs outputs.

    Supervisor and clean verifier run as UID 0; submitted source runs as 65532
    without capabilities. The image and sole input bind are read-only. No other
    host directory, credentials, database or Docker socket is mounted.
    """

    def __init__(self, root: Path, inputs: Path, command: list[str], *, limits=None, image=None, stderr_sink=None):
        self.root=root.resolve()
        self.root.mkdir(parents=True,exist_ok=False)
        self.inputs=inputs.resolve()
        self.limits=limits or Limits()
        self.image=image or resolve_image()[0]
        self.stderr_sink=stderr_sink
        self.name='crafty-cad-'+uuid.uuid4().hex
        self.started=time.monotonic()
        self.cancel_reason=None
        self.removed=False
        self.buffer=b''
        self.messages=[]
        self.snapshots={}
        self.logs={key:(self.root/(key+'.log')).open('wb') for key in ('stdout','stderr')}
        self.log_sizes=dict.fromkeys(self.logs,0)
        # Root needs only these capabilities to supervise a distinct unprivileged
        # modeling UID. No new privileges prevents a model regaining them.
        self.command=['create','--pull=never','--name',self.name,'--label','crafty.cad.owned='+self.name,
            '--interactive','--read-only','--network','none','--ipc','private','--shm-size','16777216','--cgroupns','private',
            '--cap-drop','ALL','--cap-add','SETUID','--cap-add','SETGID','--cap-add','CHOWN','--cap-add','KILL',
            '--security-opt','no-new-privileges=true','--memory',str(self.limits.memory_bytes),
            '--memory-swap',str(self.limits.memory_bytes),'--cpus',str(self.limits.cpus),
            '--pids-limit',str(self.limits.processes),'--ulimit','core=0:0','--ulimit','nofile=256:256',
            '--ulimit',f'fsize={self.limits.file_bytes}:{self.limits.file_bytes}',
            '--tmpfs',f'/output:rw,noexec,nosuid,nodev,size={self.limits.output_bytes},mode=0755',
            '--tmpfs',f'/tmp:rw,noexec,nosuid,nodev,size={self.limits.temporary_bytes},mode=1777',
            '--mount',f'type=bind,source={self.inputs},target=/inputs,readonly',
            '--hostname','crafty-cad','--log-driver','none']
        if command[0]=='harness':
            for name in ('fixtures','examples'):
                self.command.extend(['--mount',f'type=bind,source={self.inputs/name},target=/opt/cad/{name},readonly'])
        self.command.extend([self.image,*command])
        created=cli(self.command)
        self.report={'schema_version':1,'name':self.name,'image':self.image,'command':['docker',*self.command],
                     'limits':asdict(self.limits),'create_exit':created.returncode,'create_stderr':created.stderr}
        atomic_json(self.root/'docker.json',self.report)
        if created.returncode:
            self.close()
            raise CadError('missing_prerequisite','Cannot create CAD container: '+created.stderr)
        self.report['container_id']=created.stdout.strip()
        self.report['initial_inspect']=json.loads(cli(['inspect',self.name]).stdout)[0]
        self.process=subprocess.Popen(['docker','start','--attach','--interactive',self.name],
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
        self.selector=selectors.DefaultSelector()
        for label,stream in [('stdout',self.process.stdout),('stderr',self.process.stderr)]:
            os.set_blocking(stream.fileno(),False)
            self.selector.register(stream,selectors.EVENT_READ,label)

    def signal(self, sig='TERM'):
        return cli(['kill','--signal',sig,self.name],timeout=10)

    def _read(self, deadline, cancel=None):
        while True:
            if self.messages:
                return self.messages.pop(0)
            if (cancel and cancel.is_set()) or time.monotonic()>=deadline:
                self.cancel_reason='cancelled' if cancel and cancel.is_set() else 'timeout'
                self.signal()
                # Let the service cancel its active native operation and finalize
                # useful independent evidence; force the container after grace.
                deadline=time.monotonic()+5
                cancel=None
                if getattr(self,'termination_requested',False):
                    self.signal('KILL')
                    return ('lost',None)
                self.termination_requested=True
            for key,_ in self.selector.select(.05):
                data=os.read(key.fileobj.fileno(),65536)
                if not data:
                    self.selector.unregister(key.fileobj)
                    continue
                label=key.data
                room=self.limits.log_bytes-self.log_sizes[label]
                if room>0:
                    self.logs[label].write(data[:room]); self.logs[label].flush()
                    self.log_sizes[label]+=min(room,len(data))
                    if label=='stderr' and self.stderr_sink:
                        self.stderr_sink(data[:room])
                if label=='stdout':
                    self.buffer+=data
                    if len(self.buffer)>self.limits.log_bytes:
                        self.signal('KILL')
                        raise CadError('output_limit','Container response exceeds bounded buffer')
                    while b'\n' in self.buffer:
                        line,self.buffer=self.buffer.split(b'\n',1)
                        if line.startswith(b'CRAFTY_CONTAINER:'):
                            self.messages.append(('response',json.loads(line.split(b':',1)[1])))
                        elif line.startswith(b'CRAFTY_DONE:'):
                            self.messages.append(('done',int(line.split(b':',1)[1])))
            if self.process.poll() is not None and not self.selector.get_map():
                return ('lost',None)

    def capture(self):
        """Safely copy regular data from live tmpfs; never execute returned files."""
        target=self.root/('capture-'+uuid.uuid4().hex[:8])
        target.mkdir()
        # docker cp archives the underlying layer and can omit tmpfs mounts.
        # This fixed service-owned reader runs while PID 1 holds tmpfs alive.
        command=['docker','exec',self.name,'/opt/venv/bin/python','-c',
                 'import sys,tarfile; t=tarfile.open(fileobj=sys.stdout.buffer,mode="w|"); t.add("/output",arcname=".",recursive=True); t.close()']
        process=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        watchdog=threading.Timer(30,process.kill)
        watchdog.start()
        total=0
        files=0
        rejected=[]
        try:
            with tarfile.open(fileobj=process.stdout,mode='r|*') as archive:
                for item in archive:
                    files+=1
                    if files>100_000:
                        raise CadError('output_limit','Container capture exceeds 100000 entries')
                    path=PurePosixPath(item.name)
                    if path.is_absolute() or '..' in path.parts or not (item.isdir() or item.isfile()):
                        rejected.append(item.name)
                        continue
                    destination=target/Path(*path.parts)
                    if item.isdir():
                        destination.mkdir(parents=True,exist_ok=True)
                    else:
                        total+=item.size
                        if total>self.limits.output_bytes or item.size>self.limits.file_bytes:
                            raise CadError('output_limit','Captured files exceed container output limits')
                        destination.parent.mkdir(parents=True,exist_ok=True)
                        with archive.extractfile(item) as src, destination.open('wb') as out:
                            shutil.copyfileobj(src,out,length=65536)
            stderr=process.stderr.read(65536).decode(errors='replace')
            code=process.wait(timeout=15)
            if code:
                raise CadError('capture_error',stderr)
        finally:
            watchdog.cancel()
            if process.poll() is None:
                process.kill(); process.wait()
            process.stdout.close(); process.stderr.close()
        atomic_json(target/'capture.json',{'schema_version':1,'bytes':total,'entries':files,'capture_seconds_limit':30,
                                         'excluded_nonregular_or_unsafe_paths':rejected,
                                         'command':command})
        self.report.setdefault('captures',[]).append(str(target))
        return target

    def call(self, request, *, cancel=None, seconds=40):
        handle=request.get('handle',request.get('geometry',{}).get('handle'))
        if self.removed or self.process.poll() is not None:
            raise CadError('geometry_unavailable','Container runtime is no longer live',
                           snapshot_path=self.snapshots.get(handle))
        self.process.stdin.write(json.dumps(request,allow_nan=False).encode()+b'\n')
        self.process.stdin.flush()
        kind,response=self._read(min(self.started+self.limits.seconds,time.monotonic()+seconds),cancel)
        if kind!='response':
            raise CadError('geometry_unavailable','Container runtime lost; restore a retained snapshot explicitly',
                           snapshot_path=self.snapshots.get(handle))
        if self.cancel_reason:
            self.report.setdefault('query_interruptions',[]).append({'operation':request['op'],'reason':self.cancel_reason})
            self.cancel_reason=None
            self.termination_requested=False
        if not response['ok']:
            raise CadError(response['code'],response['error'],**response.get('details',{}))
        data=response['data']
        if request['op']=='ensure_geometry':
            capture=self.capture()
            self.snapshots[data['handle']]=str(capture/Path(data['snapshot_path']).relative_to('/output'))
            data['durable_snapshot_path']=self.snapshots[data['handle']]
        return data

    def run(self, cancel=None):
        try:
            kind,code=self._read(self.started+self.limits.seconds,cancel)
            capture=self.capture() if kind=='done' else None
            self.report.update(service_exit=code,cancel_reason=self.cancel_reason,capture=str(capture) if capture else None)
            if kind=='done':
                self.process.stdin.write(b'exit\n'); self.process.stdin.flush()
                self.process.wait(timeout=15)
            self.report['final_inspect']=json.loads(cli(['inspect',self.name]).stdout)[0]
            code=130 if self.cancel_reason=='cancelled' else 1 if self.cancel_reason else code if code is not None else 2
            return capture,code
        finally:
            self.close()

    def close(self):
        if self.removed:
            return
        self.removed=True
        if hasattr(self,'process'):
            if self.process.poll() is None:
                self.signal('KILL')
                self.process.wait(timeout=15)
            for stream in (self.process.stdin,self.process.stdout,self.process.stderr):
                stream.close()
            self.selector.close()
        inspected=cli(['inspect',self.name])
        if inspected.returncode==0:
            self.report['final_inspect']=json.loads(inspected.stdout)[0]
        removed=cli(['rm','--force',self.name])
        absent=cli(['inspect',self.name])
        self.report.update(remove_exit=removed.returncode,removed=absent.returncode!=0,
                           duration_seconds=time.monotonic()-self.started)
        atomic_json(self.root/'docker.json',self.report)
        for log in self.logs.values():
            log.close()


def freeze_request(request_path, destination):
    """Mount only declared, frozen bytes, including a self-contained native bundle."""
    request=validate_request(load_json(request_path))
    destination.mkdir(parents=True,exist_ok=False)
    atomic_bytes(destination/request_path.name,read_bytes(request_path))
    total=0
    def frozen_file(source, target):
        nonlocal total
        data=read_bytes(source)
        total+=len(data)
        if total>16*1024**2:
            raise CadError('input_limit','Combined frozen Docker input bytes exceed 16 MiB')
        atomic_bytes(target,data)
    if 'source' in request:
        for relative in [request['source'],*request['inputs'].values()]:
            frozen_file(contained(request_path.parent,relative),contained(destination,relative))
    else:
        if 'handle' in request['geometry']:
            return request_path.name  # Fresh runtime explicitly rejects an unknown live handle.
        relative=request['geometry']['path']
        original=contained(request_path.parent,relative)
        bundle=load_json(original)
        from jsonschema import Draft202012Validator
        from .schemas import BUNDLE_SCHEMA
        errors=list(Draft202012Validator(BUNDLE_SCHEMA).iter_errors(bundle))
        if errors:
            raise CadError('invalid_bundle',errors[0].message)
        atomic_bytes(contained(destination,relative),read_bytes(original))
        for item in [*bundle['parts'].values(),*bundle.get('frozen_files',[])]:
            from .files import verify_record
            path=verify_record(original.parent,item)
            frozen_file(path,contained(contained(destination,relative).parent,item['path']))
    return request_path.name


def main(argv=None):
    parser=argparse.ArgumentParser()
    commands=parser.add_subparsers(dest='command',required=True)
    evaluate=commands.add_parser('evaluate')
    evaluate.add_argument('--request',type=Path,required=True)
    evaluate.add_argument('--output',type=Path,required=True)
    args=parser.parse_args(argv)
    cancel=threading.Event()
    for sig in (signal.SIGINT,signal.SIGTERM):
        signal.signal(sig,lambda *_:cancel.set())
    started=time.monotonic()
    started_at=now()
    reserved=False
    control=None
    try:
        output=args.output.resolve()
        output.mkdir(parents=True,exist_ok=False)
        reserved=True
        original=read_bytes(args.request.resolve())
        atomic_bytes(output/'frozen/request.json',original)
        control=output.parent/('.docker-'+uuid.uuid4().hex)
        control.mkdir(parents=True)
        frozen_request=freeze_request(args.request.resolve(),control/'inputs')
        job=DockerJob(control/'job',control/'inputs',['evaluate','--request','/inputs/'+frozen_request,'--output','/output/result'])
        capture,code=job.run(cancel)
        if not capture or not (capture/'result').is_dir():
            raise CadError('container_lost',f'Container did not finalize output; diagnostics: {control}')
        # Transport publication preserves the supervisor's final-manifest rule:
        # copy data first, validate every advertised file, then atomically publish.
        for path in (capture/'result').iterdir():
            if path.name=='result.json':
                continue
            if path.is_dir():
                shutil.copytree(path,output/path.name,dirs_exist_ok=True)
            else:
                atomic_bytes(output/path.name,read_bytes(path,Limits().file_bytes))
        result=output/'result.json'
        if (capture/'result/result.json').is_file():
            manifest=load_json(capture/'result/result.json')
            validate_result(manifest,output)
            atomic_json(result,manifest)
            print(result)
        else:
            print(f'Interrupted result; retained partial evidence: {output}',file=sys.stderr)
        return 1 if code==130 else code
    except (CadError,OSError,subprocess.SubprocessError) as exc:
        print(str(exc),file=sys.stderr)
        if reserved:
            reason=getattr(exc,'code','docker_setup')
            code=1 if reason=='container_lost' else 2
            request=None
            try: request=validate_request(load_json(output/'frozen/request.json'))
            except (CadError,OSError): pass
            provenance={}
            if (output/'frozen/request.json').is_file():
                provenance['request']=record(output/'frozen/request.json',output,'application/json')
            result={'schema_version':1,'run_id':uuid.uuid4().hex,'execution':{'status':'failed' if code==1 else 'rejected',
                'reason':reason,'message':str(exc),'started_at':started_at,'finished_at':now(),'duration_seconds':time.monotonic()-started},
                'provenance':provenance,'geometry':None,'artifacts':[], 'metrics':[],
                'diagnostics':{'docker_control_path':str(control) if control else None}}
            if request:
                result['artifacts']=[{'id':a['id'],'kind':a['kind'],'status':'unavailable','reason':reason} for a in request['outputs']]
                result['metrics']=[compare(m,{'value':None,'status':'unavailable','reason':reason}) for m in request['metrics']]
            validate_result(result,output)
            atomic_json(output/'result.json',result)
            print(output/'result.json')
            return code
        return 2


if __name__=='__main__':
    sys.exit(main())
