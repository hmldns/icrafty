"""Offline pinned Docker build; preserve commands, context and immutable image ID."""

import argparse
import json
from pathlib import Path
import subprocess
import sys
import time
import uuid

from crafty_cad.files import atomic_json, load_json


def main():
    cad=Path(__file__).resolve().parents[1]
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    root=(args.output or cad/'runs/docker'/('build-'+time.strftime('%Y%m%d-%H%M%S')+'-'+uuid.uuid4().hex[:8])).resolve()
    root.mkdir(parents=True,exist_ok=False)
    commands=[[sys.executable,str(cad/'docker/package.py'),'--output',str(root/'context')]]
    with (root/'package.stdout.log').open('w') as out,(root/'package.stderr.log').open('w') as err:
        packaged=subprocess.run(commands[-1],stdout=out,stderr=err)
    if packaged.returncode:
        print(f'Pinned packaging failed: {root}/package.stderr.log',file=sys.stderr)
        return 2
    package=load_json(root/'context/package.json')
    commands.append(['docker','build','--network=none','--pull=false','--tag',package['tag'],'--iidfile',str(root/'image-id'),str(root/'context')])
    with (root/'build.stdout.log').open('w') as out,(root/'build.stderr.log').open('w') as err:
        built=subprocess.run(commands[-1],stdout=out,stderr=err)
    report={'schema_version':1,'commands':commands,'package':package,'exit_code':built.returncode}
    if built.returncode==0:
        image=(root/'image-id').read_text().strip()
        report['image_id']=image
        report['docker_version']=json.loads(subprocess.check_output(['docker','version','--format','{{json .}}'],text=True))
        atomic_json(cad/'runs/docker/current-image.json',{'image_id':image,'service_sha256':package['service_sha256'],
                    'build_report':str(root/'build.json'),'package':str(root/'context/package.json')})
    atomic_json(root/'build.json',report)
    print(root/'build.json')
    return 0 if built.returncode==0 else 2


if __name__=='__main__':
    sys.exit(main())
