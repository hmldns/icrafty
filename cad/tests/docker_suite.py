"""Real container gates. All expected failures are executed, never skipped."""

from dataclasses import replace
import errno
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import time

from crafty_cad.contract import validate_result
from crafty_cad.docker import DockerJob, Limits
from crafty_cad.files import CadError, atomic_json, load_json


CASES=[]


def case(name):
    def register(function):
        CASES.append((name,function))
        return function
    return register


def expect(row,condition,message,actual=None):
    row['assertions'].append({'passed':bool(condition),'message':message,'actual':actual})
    assert condition,message+': '+repr(actual)


def completed(job,row):
    expect(row,job.report['removed'],'Only the owned container was stopped and removed')
    expect(row,not job.report['final_inspect']['State']['Running'],'No container process remains running')


@case('public-cli-exits-frozen-names-and-finalization')
def public_cli(root,inputs,image,row,cancel):
    row['classification']='intended_negative'
    root.mkdir()
    source=root/'inputs';source.mkdir()
    # A source named request.json is legal when the request has a different name.
    shutil.copyfile(inputs/'fixtures/trial-cap/wrong-cap.py',source/'request.json')
    req={'schema_version':1,'source':'request.json','parameters':{},'inputs':{},'outputs':[],
         'metrics':load_json(inputs/'fixtures/cap/criteria.json')}
    for name,request,expected in [
        ('completed-negative',req,0),
        ('bad-path',{**req,'source':'../outside.py'},2),
        ('unsupported',{**req,'outputs':[{'id':'model','kind':'glb','parts':['cap']}]},2),
        ('bad-bundle',{'schema_version':1,'geometry':{'path':'malformed.json'},'parameters':{},'inputs':{},'outputs':[],'metrics':[]},2),
        ('unknown-handle',{'schema_version':1,'geometry':{'handle':'unknown-handle'},'parameters':{},'inputs':{},'outputs':[],'metrics':[]},1),
        ('bad-code',{**req,'source':'invalid.py'},1),
    ]:
        atomic_json(source/f'{name}.json',request)
        (source/'invalid.py').write_text('def broken(:\n')
        (source/'malformed.json').write_text('{}')
        command=[sys.executable,'-m','crafty_cad.docker','evaluate','--request',str(source/f'{name}.json'),'--output',str(root/name)]
        run=subprocess.run(command,capture_output=True,text=True,env={**os.environ,'CRAFTY_DOCKER_IMAGE':image},timeout=45)
        (root/(name+'.stdout.log')).write_text(run.stdout)
        (root/(name+'.stderr.log')).write_text(run.stderr)
        expect(row,run.returncode==expected,'Docker evaluator preserves direct exit code: '+name,run.returncode)
        result_path=root/name/'result.json'
        expect(row,run.stdout.strip()==str(result_path),'Docker evaluator stdout is only finalized result path: '+name,run.stdout)
        result=load_json(result_path);validate_result(result,result_path.parent)
        row['results'].append(str(result_path.relative_to(root.parent)))
        if name=='completed-negative':
            expect(row,sum(m['status']=='fail' for m in result['metrics'])==7,'Completed orchestration preserves seven measured failing checks')
            expect(row,(result_path.parent/'frozen/request.json').read_bytes()==(source/f'{name}.json').read_bytes(),'Original request bytes survive isolated transfer')
        if name=='unknown-handle':
            expect(row,result['execution']['reason']=='geometry_unavailable','Unknown container handle never causes source execution')
    before=(root/'completed-negative/result.json').read_bytes()
    run=subprocess.run([sys.executable,'-m','crafty_cad.docker','evaluate','--request',str(source/'completed-negative.json'),
                        '--output',str(root/'completed-negative')],capture_output=True,text=True,env={**os.environ,'CRAFTY_DOCKER_IMAGE':image})
    expect(row,run.returncode==2 and not run.stdout and (root/'completed-negative/result.json').read_bytes()==before,'Fresh-directory guard preserves an existing completed result')


@case('mounts-network-and-kernel-limits')
def environment(root,inputs,image,row,cancel):
    root.mkdir()
    job=DockerJob(root/'job',inputs,['probe','environment'],image=image)
    captured,code=job.run(cancel)
    env=load_json(captured/'container-environment.json')
    config=job.report['initial_inspect']['HostConfig']
    expect(row,code==0,'Environment probe completed',code)
    expect(row,config['ReadonlyRootfs'] and config['NetworkMode']=='none','Read-only image and isolated no-network namespace')
    expect(row,all(not m['RW'] and m['Destination']=='/inputs' for m in job.report['initial_inspect']['Mounts']),'Only the frozen read-only host input is bound')
    expect(row,'size=536870912' in config['Tmpfs']['/output'],'Private output is a kernel-bounded 512 MiB tmpfs')
    expect(row,env['network_interfaces']==['lo'],'No external network interface',env['network_interfaces'])
    expect(row,not any(env['forbidden_paths'].values()),'No Docker socket, home credentials, project environment or host home')
    expect(row,not any(any(s in key.upper() for s in ('TOKEN','SECRET','API_KEY','PASSWORD','DATABASE','CREDENTIAL','OPENAI','ANTHROPIC')) for key in env['environment_names']),'Provider/database credentials are not inherited',env['environment_names'])
    cg=env['cgroup']
    expect(row,cg['memory.max']=='2147483648' and cg['memory.swap.max']=='0','Kernel memory limit 2 GiB with no swap',cg)
    expect(row,cg['cpu.max']=='200000 100000' and cg['pids.max']=='64','Kernel CPU quota and process/task limit',cg)
    expect(row,'NoNewPrivs:\t1' in env['process_status'] and 'Seccomp:\t2' in env['process_status'],'No-new-privileges and Docker seccomp active')
    completed(job,row)


@case('actual-memory-cpu-process-output-time-and-cancellation')
def budgets(root,inputs,image,row,cancel):
    row['classification']='intended_negative'
    root.mkdir()
    for kind,limits in [('memory',replace(Limits(),memory_bytes=64*1024**2)),
                        ('cpu',replace(Limits(),cpus=.5)),('pids',replace(Limits(),processes=16)),
                        ('output',replace(Limits(),output_bytes=2*1024**2)),
                        ('wait',replace(Limits(),seconds=1.0)),('cancel',Limits())]:
        job=DockerJob(root/kind,inputs,['probe','wait' if kind=='cancel' else kind],image=image,limits=limits)
        event=threading.Event()
        timer=threading.Timer(1.0,event.set) if kind=='cancel' else None
        if timer: timer.start()
        captured,code=job.run(event if timer else cancel)
        if timer: timer.cancel()
        if kind=='memory':
            expect(row,job.report['final_inspect']['State']['OOMKilled'],'Memory pressure triggers cgroup OOM kill',job.report['final_inspect']['State'])
            expect(row,captured is None and code!=0,'Interrupted OOM has no fabricated ready files')
        elif kind=='cpu':
            env=load_json(captured/'container-final-environment.json')
            stats=dict(line.split() for line in env['cgroup']['cpu.stat'].splitlines())
            expect(row,code==0 and int(stats['nr_throttled'])>0 and int(stats['throttled_usec'])>0,'Busy processes are actually throttled by CPU quota',stats)
        elif kind=='pids':
            env=load_json(captured/'container-final-environment.json')
            expect(row,code==0 and int(env['cgroup']['pids.events'].split()[1])>0,'Fork attempts hit the actual cgroup process limit',env['cgroup'])
        elif kind=='output':
            expect(row,code!=0 and 'No space left on device' in (root/kind/'stderr.log').read_text(),'Private tmpfs output limit causes ENOSPC')
            expect(row,captured is not None and (captured/'growth').stat().st_size<2*1024**2,'Output failure retains bounded partial files')
        elif kind=='wait':
            expect(row,code==1 and job.cancel_reason=='timeout' and job.report['duration_seconds']<8,'Outer wall deadline cleans detached descendants',job.report['duration_seconds'])
        else:
            expect(row,code==130 and job.cancel_reason=='cancelled','Outer cancellation preserves exit 130',code)
            expect(row,captured is not None,'Cancellation retains completed diagnostic files')
        completed(job,row)


@case('generated-source-cannot-author-supervisor-evidence')
def authority(root,inputs,image,row,cancel):
    root.mkdir()
    frozen=root/'inputs'; frozen.mkdir()
    (frozen/'sentinel').write_text('immutable input\n')
    (frozen/'sentinel').chmod(0o666)  # Mount protection must hold even with writable DAC permissions.
    source='''def build(parameters,inputs):
    import ctypes, errno, json, os, socket, struct, Part
    libc=ctypes.CDLL(None,use_errno=True)
    report={'uid':os.getuid(),'gid':os.getgid(),'write_attempts':{},'environment_names':sorted(os.environ)}
    for path in ['/inputs/sentinel','/opt/cad/src/crafty_cad/runtime.py','/output/container-environment.json']:
        fd=libc.open(path.encode(),os.O_WRONLY)
        report['write_attempts'][path]={'fd':fd,'errno':ctypes.get_errno()}
        if fd>=0: libc.close(fd)
    report['signal_parent']=libc.kill(os.getppid(),0)
    report['signal_errno']=ctypes.get_errno()
    fd=libc.open(b'/proc/self/status',0)
    buffer=ctypes.create_string_buffer(8192)
    size=libc.read(fd,buffer,8192); libc.close(fd)
    report['status']=buffer.raw[:size].decode()
    fd=libc.socket(2,1|os.O_NONBLOCK,0)
    address=struct.pack('H',2)+struct.pack('!H',9)+socket.inet_aton('198.51.100.1')+b'\\0'*8
    report['network_connect']=libc.connect(fd,address,len(address))
    report['network_errno']=ctypes.get_errno(); libc.close(fd)
    with open('isolation-probe.json','w') as f: json.dump(report,f)
    shape=Part.makeCylinder(10,20)
    return {'parts':{'body':shape},'features':{}}
'''
    (frozen/'model.py').write_text(source)
    req={'schema_version':1,'source':'model.py','parameters':{},'inputs':{},'outputs':[
        {'id':'iso','kind':'png','parts':['body'],'annotations':{'json':True,'inline':True},'view':{'preset':'isometric','width':640,'height':480}}],
        'metrics':[{'id':'volume','kind':'volume','target':{'part':'body'},'unit':'mm^3','criterion':{'equals':2000*math.pi,'absolute_tolerance':.001}}]}
    atomic_json(frozen/'request.json',req)
    job=DockerJob(root/'job',frozen,['evaluate','--request','/inputs/request.json','--output','/output/result'],image=image)
    capture,code=job.run(cancel)
    result=load_json(capture/'result/result.json'); validate_result(result,capture/'result')
    row['results'].append(str((capture/'result/result.json').relative_to(root.parent)))
    expect(row,code==0 and result['metrics'][0]['status']=='pass','Clean native verifier measured real cylinder after hostile I/O attempts',result['execution'])
    proof=load_json(next(capture.rglob('isolation-probe.json')))
    atomic_json(root/'proof.json',proof)
    expect(row,proof['uid']==65532 and proof['gid']==65532,'Submitted source has distinct unprivileged identity',proof)
    expect(row,all(x['fd']==-1 for x in proof['write_attempts'].values()),'Kernel rejects writes to input, service code and authoritative supervisor output',proof['write_attempts'])
    expect(row,proof['write_attempts']['/inputs/sentinel']['errno']==errno.EROFS,'Input mount is actually read-only')
    expect(row,proof['signal_parent']==-1 and proof['signal_errno']==errno.EPERM,'Model cannot signal the retained supervisor')
    expect(row,'CapEff:\t0000000000000000' in proof['status'] and 'NoNewPrivs:\t1' in proof['status'],'Model has zero effective capabilities and cannot regain privilege')
    expect(row,proof['network_connect']==-1 and proof['network_errno']==errno.ENETUNREACH,'Raw native connect is blocked by namespace routing',proof['network_errno'])
    completed(job,row)


@case('retained-operations-and-cross-container-snapshot-restore')
def retained(root,inputs,image,row,cancel):
    root.mkdir()
    frozen=root/'inputs'; frozen.mkdir()
    shutil.copyfile(inputs/'fixtures/placed-cylinder/model.py',frozen/'model.py')
    req={'schema_version':1,'source':'model.py','parameters':{},'inputs':{},'outputs':[],'metrics':[]}
    atomic_json(frozen/'build.json',req)
    job=DockerJob(root/'first',frozen,['session'],image=image)
    try:
        before_time=time.monotonic()
        ensured=job.call({'op':'ensure_geometry','request':'/inputs/build.json','scope':'repair-A'})
        timings={'cold_ensure_seconds':time.monotonic()-before_time}
        handle=ensured['handle']
        initial=job.call({'op':'inspect_geometry','handle':handle,'scope':'repair-A'})
        query={k:v for k,v in req.items() if k!='source'}
        query['geometry']={'handle':handle}
        query['metrics']=[{'id':'bore','kind':'cylinder_diameter','target':{'part':'body','feature':'side'},'unit':'mm','criterion':{'equals':20,'absolute_tolerance':.001}},
                          {'id':'volume','kind':'volume','target':{'part':'body'},'unit':'mm^3','criterion':{'equals':2000*math.pi,'absolute_tolerance':.001}}]
        for index,outputs in enumerate([
            [{'id':'iso','kind':'png','parts':['body'],'annotations':{'json':True,'inline':True},'view':{'preset':'isometric','width':640,'height':480}}],
            [],[{'id':'top','kind':'png','parts':['body'],'annotations':{'json':True,'inline':True},'view':{'preset':'top','span_mm':70,'width':640,'height':480}}],
            [{'id':'step','kind':'step','parts':['body']}]]):
            query['outputs']=outputs
            if index==2: query['metrics'][0]['criterion']['equals']=19
            atomic_json(frozen/f'query-{index}.json',query)
            began=time.monotonic()
            answer=job.call({'op':'evaluate_geometry','handle':handle,'scope':'repair-A','request':f'/inputs/query-{index}.json','output':f'/output/query-{index}'})
            timings[f'query_{index}_seconds']=time.monotonic()-began
            expect(row,answer['exit_code']==0,'Warm evidence query completed',answer)
        after=job.call({'op':'inspect_geometry','handle':handle,'scope':'repair-A'})
        expect(row,initial==after,'Camera/criteria/export queries do not mutate retained placed geometry')
        query['outputs']=[{'id':'cancel-image','kind':'png','parts':['body'],'annotations':{'json':True,'inline':True},
                           'view':{'preset':'isometric','width':3840,'height':3840}}]
        atomic_json(frozen/'cancel-query.json',query)
        query_cancel=threading.Event()
        timer=threading.Timer(.3,query_cancel.set); timer.start()
        try:
            cancelled=job.call({'op':'evaluate_geometry','handle':handle,'scope':'repair-A',
                               'request':'/inputs/cancel-query.json','output':'/output/query-cancelled'},cancel=query_cancel)
        finally: timer.cancel()
        expect(row,cancelled['exit_code']==1,'Host cancellation interrupts the active render query',cancelled)
        expect(row,job.call({'op':'inspect_geometry','handle':handle,'scope':'repair-A'})==initial,
               'Cancelling a disposable render leaves retained native geometry usable')
        diagnostics=job.call({'op':'diagnostics'})
        expect(row,diagnostics['counts']['source_executions']==1 and diagnostics['counts']['loads']==1,'One source execution and one native parse across all warm queries',diagnostics['counts'])
        try:
            job.call({'op':'inspect_geometry','handle':handle,'scope':'wrong-scope'})
        except CadError as exc:
            expect(row,exc.code=='geometry_unavailable','Wrong scope explicitly rejects live handle')
        else: raise AssertionError('Wrong scope accepted')
        capture=job.capture()
        for p in sorted(capture.glob('query-*/result.json')):
            validate_result(load_json(p),p.parent)
            row['results'].append(str(p.relative_to(root.parent)))
        expect(row,sum(p.read_text().count('CRAFTY_FIXTURE_BUILD placed-cylinder') for p in capture.glob('runtime-*/build-*/worker/build.log'))==1,'Instrumented source log proves exactly one execution')
        snapshot=Path(ensured['durable_snapshot_path'])
        shutil.copytree(snapshot.parent,frozen/'snapshot')
        atomic_json(root/'retained-evidence.json',{'ensured':ensured,'before':initial,'after':after,'diagnostics':diagnostics,'timings':timings})
    finally:
        job.close()  # Force whole container loss after a durable snapshot capture.
    completed(job,row)
    try:
        job.call({'op':'inspect_geometry','handle':handle,'scope':'repair-A'})
    except CadError as exc:
        expect(row,exc.code=='geometry_unavailable' and exc.details['snapshot_path']==str(snapshot),'Lost container handle reports known retained snapshot')
    else: raise AssertionError('Lost container handle accepted')
    restore={k:v for k,v in req.items() if k!='source'}
    restore['geometry']={'path':'snapshot/manifest.json'}
    atomic_json(frozen/'restore.json',restore)
    fresh=DockerJob(root/'restored',frozen,['session'],image=image)
    try:
        began=time.monotonic()
        recovered=fresh.call({'op':'ensure_geometry','request':'/inputs/restore.json','scope':'repair-A'})
        restored_seconds=time.monotonic()-began
        expect(row,recovered['handle']!=handle and recovered['geometry_digest']==ensured['geometry_digest'],'New container restores same immutable geometry with a new handle')
        diagnostics=fresh.call({'op':'diagnostics'})
        expect(row,diagnostics['counts']['source_executions']==0 and diagnostics['counts']['restores']==1,'Cross-container snapshot restoration executes no source',diagnostics['counts'])
        query.update(geometry={'handle':recovered['handle']},outputs=[])
        atomic_json(frozen/'restored-query.json',query)
        result=fresh.call({'op':'evaluate_geometry','handle':recovered['handle'],'scope':'repair-A','request':'/inputs/restored-query.json','output':'/output/restored-query'})
        expect(row,result['exit_code']==0,'Recovered native geometry supports measured queries')
        released=fresh.call({'op':'release_geometry','handle':recovered['handle'],'scope':'repair-A'})
        expect(row,released['status']=='released','Container geometry release is explicit')
        try: fresh.call({'op':'inspect_geometry','handle':recovered['handle'],'scope':'repair-A'})
        except CadError as exc: expect(row,exc.code=='geometry_unavailable','Released container handle cannot silently rebuild')
        else: raise AssertionError('Released handle accepted')
        capture=fresh.capture()
        path=capture/'restored-query/result.json'
        validate_result(load_json(path),path.parent)
        row['results'].append(str(path.relative_to(root.parent)))
        atomic_json(root/'restore-evidence.json',{'descriptor':recovered,'diagnostics':diagnostics,'restore_seconds_including_container_start_and_capture':restored_seconds})
    finally: fresh.close()
    completed(fresh,row)
