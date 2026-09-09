"""Build a pinned, offline image from the accepted native dependency closure.

Only explicit runtime/code/license roots are copied. No home/config/credential
tree, package cache, Docker socket, compiler or unrelated application is included.
Run through this project's locked uv environment. See docker/README.md.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time


CAD = Path(__file__).resolve().parents[1]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def main():
    if sys.version_info[:3] != (3,13,9):
        raise SystemExit('Pinned image packaging requires the cad/.python-version CPython 3.13.9 environment')
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--refresh-lock', action='store_true', help='Explicit maintainer update of native/runtime byte lock')
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    root = output/'rootfs'
    root.mkdir()
    native_files = {}
    elf = set()

    def copy(source, destination=None, native=True):
        source = Path(source)
        if source.suffix in ('.o','.a'):
            return  # Build-time objects are not runtime dependencies.
        destination = destination or source.as_posix()
        target = root/destination.lstrip('/')
        if source.is_dir():
            for path in sorted(source.iterdir()):
                if path.name in ('__pycache__', 'site-packages', 'test', 'tests', 'idlelib', 'turtledemo', 'ensurepip'):
                    continue
                copy(path, destination+'/'+path.name, native)
            return
        data = source.read_bytes()  # Dereference only explicitly selected runtime links.
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        target.chmod(0o755 if source.stat().st_mode & 0o111 else 0o644)
        if native:
            native_files[destination] = {'sha256':sha(data), 'bytes':len(data), 'mode':target.stat().st_mode & 0o777}
        if data.startswith(b'\x7fELF') and int.from_bytes(data[16:18],'little') in (2,3):
            elf.add(source.resolve())

    native_python = Path('/usr/bin/python3').resolve()
    copy(native_python, '/usr/bin/python3')
    native_stdlib = subprocess.check_output([str(native_python), '-I', '-c', 'import sysconfig; print(sysconfig.get_path("stdlib"))'],text=True).strip()
    copy(native_stdlib)
    for name in ('FreeCAD.so', 'Part.so', 'MeshPart.so', 'Mesh.so'):
        copy('/usr/lib/freecad/lib/'+name)
    bridge = json.loads((CAD/'native/build/manifest.json').read_bytes())
    for name, expected in bridge['files'].items():
        source = CAD/'native/build'/name
        if sha(source.read_bytes()) != expected:
            raise SystemExit('Native measurement bridge changed; run make -C cad native-setup')
        copy(source, '/opt/cad/native/build/'+name, native=False)
    copy(CAD/'native/build/manifest.json', '/opt/cad/native/build/manifest.json', native=False)
    copy(CAD/'native/properties.i', '/opt/cad/native/properties.i', native=False)
    for name in ('build.py', 'build.py.lock'):
        copy(CAD/'native'/name, '/opt/cad/native/'+name, native=False)
    # Part.makeCompound lazily imports this Python helper from the FreeCAD
    # module directory; ELF-only dependency discovery cannot discover it.
    copy('/usr/lib/freecad/Mod/Part/PartEnums.py','/usr/lib/freecad/lib/PartEnums.py')
    copy('/usr/bin/sleep')  # Process-tree acceptance fixture; no shell is packaged.
    copy('/usr/share/fonts/liberation/LiberationSans-Regular.ttf')
    copy(Path(sys.base_prefix), '/opt/python')
    sites = Path(sys.prefix)/'lib'/f'python{sys.version_info.major}.{sys.version_info.minor}'/'site-packages'
    for child in sorted(sites.iterdir()):
        if child.name == '__pycache__' or child.name == 'crafty_cad.pth':
            continue
        copy(child, '/opt/venv/lib/python3.13/site-packages/'+child.name,
             native=not child.name.startswith('crafty_cad-'))
    # ldd resolves the full transitive ELF closure, including each Python extension.
    seen = set()
    while elf-seen:
        batch = sorted(elf-seen)
        seen.update(batch)
        response = subprocess.run(['ldd', *map(str,batch)],capture_output=True,text=True)
        (output/'ldd.log').open('a').write(response.stdout+response.stderr)
        if response.returncode:
            raise SystemExit('ELF dependency inspection failed; see ldd.log (no partial closure is accepted)')
        if '=> not found' in response.stdout:
            raise SystemExit('Native dependency missing; see ldd.log')
        dependencies = set(re.findall(r'(?:=>\s+|^\s*)(/[^\s()]+)',response.stdout,re.M))
        for path in sorted(dependencies):
            if path.endswith(':'):
                continue  # ldd's per-object headings, not dependencies.
            # Managed Python's private libraries are copied with that distribution.
            if Path(path).is_relative_to(Path(sys.base_prefix)):
                continue
            if Path(path).resolve().is_relative_to(Path(sys.prefix).resolve()):
                continue  # Wheel-private libraries are already beside their modules.
            if path not in native_files:
                copy(path)
    proc = subprocess.run(['pacman','-Qqo',*[file for file in native_files if file.startswith('/usr/')]],capture_output=True,text=True)
    owners=set(proc.stdout.splitlines())
    packages = subprocess.check_output(['pacman','-Q',*sorted(owners)],text=True).splitlines()
    for owner in sorted(owners):
        license_dir = Path('/usr/share/licenses')/owner
        if license_dir.is_dir():
            copy(license_dir)
    manifest = {'schema_version':1,'platform':'linux/amd64','packages':packages,
                'native_tree_sha256':sha(canonical(native_files)),
                'native_files':len(native_files),'uv_lock_sha256':sha((CAD/'uv.lock').read_bytes()),
                'supervisor_python':sys.version,'packager_uv':subprocess.check_output(['uv','--version'],text=True).strip(),
                'properties_bridge': {'abi':bridge['abi'], 'files':bridge['files'], 'source_sha256':bridge['source_sha256']}}
    lock = CAD/'docker/runtime-lock.json'
    if args.refresh_lock:
        lock.write_text(json.dumps(manifest,indent=2,sort_keys=True)+'\n')
    elif not lock.is_file() or json.loads(lock.read_text()) != manifest:
        raise SystemExit('Installed runtime differs from docker/runtime-lock.json; refusing unpinned build. Review and explicitly --refresh-lock.')
    (output/'native-files.json').write_text(json.dumps(native_files,indent=2,sort_keys=True)+'\n')
    for name in ('src','tests','fixtures','examples','schemas'):
        copy(CAD/name,'/opt/cad/'+name,native=False)
    for name in ('pyproject.toml','uv.lock'):
        copy(CAD/name,'/opt/cad/'+name,native=False)
    copy(lock,'/opt/cad/docker/runtime-lock.json',native=False)
    (root/'opt/venv/bin').mkdir(parents=True)
    (root/'opt/venv/bin/python').symlink_to('/opt/python/bin/python3.13')
    (root/'opt/venv/pyvenv.cfg').write_text('home = /opt/python/bin\ninclude-system-site-packages = false\nversion = 3.13.9\n')
    (root/'opt/venv/lib/python3.13/site-packages/crafty_cad.pth').write_text('/opt/cad/src\n')
    for directory in ('tmp','output','inputs','etc','proc','dev','sys'):
        (root/directory).mkdir(exist_ok=True)
    (root/'tmp').chmod(0o1777)
    (root/'etc/passwd').write_text('root:x:0:0:service:/nonexistent:/nonexistent\nmodel:x:65532:65532:submitted model:/nonexistent:/nonexistent\n')
    (root/'etc/group').write_text('root:x:0:\nmodel:x:65532:\n')
    (root/'etc/nsswitch.conf').write_text('passwd: files\ngroup: files\nhosts: files\n')
    # Record all image bytes, not only the pinned native/runtime portion.
    image_files = {str(p.relative_to(root)):sha(p.read_bytes()) if not p.is_symlink() else 'link:'+os.readlink(p)
                   for p in sorted(root.rglob('*')) if p.is_file() or p.is_symlink()}
    content_sha = sha(canonical(image_files))
    (output/'image-files.json').write_text(json.dumps(image_files,indent=2,sort_keys=True)+'\n')
    shutil.copyfile(CAD/'docker/Dockerfile',output/'Dockerfile')
    report={'schema_version':1,'created_at':time.time(),'context':str(output),'runtime_lock':manifest,
            'content_sha256':content_sha,'tag':'crafty-cad:'+content_sha[:16],
            'files':len(image_files),'bytes':sum(p.stat().st_size for p in root.rglob('*') if p.is_file() and not p.is_symlink())}
    from crafty_cad.docker import service_digest
    report['service_sha256']=service_digest()
    (output/'package.json').write_text(json.dumps(report,indent=2,sort_keys=True)+'\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
