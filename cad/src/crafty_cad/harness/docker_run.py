"""Execute the same suites in Docker, plus measured isolation and recovery gates."""

from collections import Counter
import importlib.util
import json
import math
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import threading
import time
import traceback
import uuid

from rich.console import Console

from .api import CAD_ROOT
from .reports import publish
from .presentation import artifact_tree
from ..docker import DockerJob, Limits, resolve_image
from ..files import CadError, atomic_json, load_json


def compare(local, docker, root):
    checks=[]
    def equal(a,b):
        if isinstance(a,list) and isinstance(b,list):
            return len(a)==len(b) and all(equal(x,y) for x,y in zip(a,b))
        if type(a) in (int,float) and type(b) in (int,float):
            return math.isclose(a,b,abs_tol=1e-8,rel_tol=1e-9)
        return a==b
    assert local['order']==docker['order'],'Local and container case selections differ'
    for left,right in zip(local['cases'],docker['cases'],strict=True):
        assert left['outcome']==right['outcome'],f"Case outcome differs: {left['suite']}/{left['case']}"
        assert len(left.get('results',[]))==len(right.get('results',[])),'Result counts differ'
        for lp,rp in zip(left.get('results',[]),right.get('results',[]),strict=True):
            a=load_json(root/'local'/lp)
            b=load_json(root/rp)
            assert a['execution']['status']==b['execution']['status'],'Execution outcomes differ'
            for am,bm in zip(a['metrics'],b['metrics'],strict=True):
                passed=(am['id']==bm['id'] and am['status']==bm['status'] and equal(am['value'],bm['value'])
                        and am['criterion']==bm['criterion'] and am['method']==bm['method'] and am['target']==bm['target'])
                checks.append({'case':left['suite']+'/'+left['case'],'metric':am['id'],'local':am['value'],
                               'docker':bm['value'],'status':am['status'],'passed':passed})
                assert passed,f"Numerical/criterion outcome differs: {lp} {am['id']}"
            for aa,ba in zip(a['artifacts'],b['artifacts'],strict=True):
                assert (aa['id'],aa['kind'],aa['status'])==(ba['id'],ba['kind'],ba['status']),'Requested artifact availability differs'
                if aa['kind']=='png':
                    assert [(v['view_id'],v['status']) for v in aa.get('views',[])]==[(v['view_id'],v['status']) for v in ba.get('views',[])],'Panel availability differs'
    return checks


def run(args):
    started=time.monotonic()
    root=(args.output or CAD_ROOT/'runs/verification'/('docker-'+time.strftime('%Y%m%d-%H%M%S')+'-'+uuid.uuid4().hex[:8])).resolve()
    console=Console(stderr=True,no_color=args.no_color or bool(os.environ.get('NO_COLOR')))
    cancel=threading.Event()
    old={sig:signal.signal(sig,lambda *_:cancel.set()) for sig in (signal.SIGINT,signal.SIGTERM)}
    summary={'schema_version':1,'run_id':root.name,'runtime':'docker','selection':{'suite':args.suite,'case':args.case},
             'cases':[],'order':[],'outcome':'failed','exit_code':2}
    code=2
    baseline=None
    reserved=False
    try:
        root.mkdir(parents=True,exist_ok=False); reserved=True
        image,inspected=resolve_image()
        summary['image']={'id':image,'created':inspected['Created'],'size_bytes':inspected['Size']}
        inputs=root/'inputs'; inputs.mkdir()
        for name in ('fixtures','examples'):
            shutil.copytree(CAD_ROOT/name,inputs/name)
        (inputs/'sentinel').write_text('frozen input remains unchanged\n')
        selection=['--suite',args.suite,*[v for pattern in args.case for v in ('--case',pattern)]]
        local_command=[sys.executable,'-m','crafty_cad.harness','run',*selection,'--runtime','local','--json','--output',str(root/'local')]
        summary['local_command']=local_command
        with (root/'local.stdout.log').open('wb') as out,(root/'local.stderr.log').open('wb') as err:
            baseline=subprocess.Popen(local_command,stdout=out,stderr=err,start_new_session=True)
            console.print(f'Crafty CAD | docker | same fixture suites plus isolation | {root}')
            def native_progress(data):
                sys.stderr.buffer.write(data); sys.stderr.buffer.flush()
            job=DockerJob(root/'deterministic',inputs,['harness',*selection,'--json','--no-color','--output','/output/verification'],image=image,
                          stderr_sink=native_progress)
            capture,code=job.run(cancel)
            baseline.wait(timeout=300)
        if not capture or not (capture/'verification/summary.json').is_file():
            raise CadError('container_execution','Container failed before a finalized suite report; inspect deterministic/docker.json')
        inner=load_json(capture/'verification/summary.json')
        prefix=(capture/'verification').relative_to(root)
        for row in inner['cases']:
            row['results']=[str(prefix/p) for p in row.get('results',[])]
        summary.update(cases=inner['cases'],order=inner['order'],native=inner.get('native'),
                       effective_settings=inner['effective_settings'],container_limits=job.report['limits'])
        if inner['exit_code'] or baseline.returncode:
            code=130 if cancel.is_set() else max(inner['exit_code'],baseline.returncode)
        if inner['order'] and baseline.returncode==0:
            comparison={'suite':'docker','case':'local-numerical-and-availability-comparison','outcome':'passed',
                        'classification':'expected_good','assertions':[]}
            try:
                checks=compare(load_json(root/'local/summary.json'),inner,root)
                atomic_json(root/'local-docker-comparison.json',{'schema_version':1,'passed':True,
                    'absolute_tolerance':1e-8,'relative_tolerance':1e-9,'measurements':checks})
                comparison['assertions']=[{'passed':True,'message':f'{len(checks)} metric records and every requested artifact/panel agree'}]
            except AssertionError as exc:
                comparison.update(outcome='failed',classification='unexpected_failure',reason=str(exc))
                atomic_json(root/'local-docker-comparison.json',{'schema_version':1,'passed':False,'reason':str(exc)})
                code=max(code,1)
            summary['cases'].append(comparison)
        # Additional isolation gates belong to the full Docker selection; a
        # failed fixture does not prevent these independent assertions running.
        if args.suite=='all' and not args.case and inner['order']:
            spec=importlib.util.spec_from_file_location('cad_docker_assertions',CAD_ROOT/'tests/docker_suite.py')
            tests=importlib.util.module_from_spec(spec); spec.loader.exec_module(tests)
            for name,function in tests.CASES:
                if cancel.is_set():
                    code=130; break
                began=time.monotonic()
                row={'suite':'docker','case':name,'outcome':'passed','classification':'expected_good','results':[],'assertions':[]}
                try:
                    function(root/name,inputs,image,row,cancel)
                    assert row['assertions'],'No Docker assertions ran'
                except Exception as exc:
                    row.update(outcome='failed',classification='unexpected_failure',reason=str(exc),traceback=traceback.format_exc()[-8000:])
                    code=max(code,1)
                row['duration_seconds']=time.monotonic()-began
                summary['cases'].append(row)
                console.print(f"{row['outcome']}: docker/{name} ({row['duration_seconds']:.3f}s)")
        summary['order']=[r['suite']+'/'+r['case'] for r in summary['cases']]
    except Exception as exc:
        code=130 if cancel.is_set() else 2
        summary['cases'].append({'suite':'docker','case':'setup-or-execution','outcome':'error',
            'classification':'missing_prerequisite' if isinstance(exc,CadError) and exc.code=='missing_prerequisite' else 'unexpected_failure',
            'reason':str(exc),'traceback':traceback.format_exc()[-8000:]})
    finally:
        if baseline and baseline.poll() is None:
            os.killpg(baseline.pid,signal.SIGTERM)
            try:
                baseline.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(baseline.pid,signal.SIGKILL); baseline.wait()
        for sig,handler in old.items():
            signal.signal(sig,handler)
    summary.update(exit_code=code,outcome='passed' if code==0 else 'interrupted' if code==130 else 'failed',
                   duration_seconds=time.monotonic()-started,counts=dict(Counter(r['outcome'] for r in summary['cases'])))
    if reserved:
        publish(root,summary)
    if args.json:
        print(json.dumps(summary,allow_nan=False))
    elif reserved:
        artifact_tree(console,root,summary)
    console.print(f"CAD Docker verification {summary['outcome']}; {summary['counts']}; exit {code}; {root/'summary.json'}")
    return code
