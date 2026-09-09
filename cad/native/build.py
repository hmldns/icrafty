# /// script
# requires-python = ">=3.11"
# dependencies = ["swig==4.4.1"]
# ///
"""Explicit build of the service-owned native measurement bridge, never at query time."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--python", default=os.environ.get("CRAFTY_NATIVE_PYTHON", "/usr/bin/python3"))
    parser.add_argument("--occt-include", default="/usr/include/opencascade")
    parser.add_argument("--compiler", default="g++")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    config = json.loads(subprocess.check_output([args.python, "-I", "-c",
        "import json,sysconfig; print(json.dumps({k:sysconfig.get_config_var(k) for k in ('SOABI','EXT_SUFFIX','INCLUDEPY')}))"], text=True))
    swig = shutil.which("swig")
    if not swig or not Path(args.occt_include, "BRepGProp.hxx").is_file():
        raise SystemExit("Native setup requires pinned SWIG, a C++17 compiler and matching OCCT development headers")
    commands = []
    with tempfile.TemporaryDirectory(prefix=".build-", dir=root) as temporary:
        work = Path(temporary)
        wrapper = work / "properties_wrap.cxx"
        module = work / ("_crafty_properties" + config["EXT_SUFFIX"])
        commands.append([swig, "-c++", "-python", "-o", str(wrapper), str(root / "properties.i")])
        commands.append([args.compiler, "-O2", "-std=c++17", "-shared", "-fPIC",
            "-ffile-prefix-map=" + str(root) + "=crafty-cad/native",
            "-ffile-prefix-map=" + str(work) + "=crafty-cad/native/build",
            "-I" + config["INCLUDEPY"], "-I" + args.occt_include, str(wrapper), "-o", str(module),
            "-lTKBRep", "-lTKTopAlgo", "-lTKG3d", "-lTKMath", "-lTKernel"])
        for command in commands:
            subprocess.run(command, check=True, timeout=120)
        files = {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                 for p in (module, work / "crafty_properties.py")}
        report = {"schema_version": 1, "abi": config["SOABI"], "files": files,
            "source_sha256": hashlib.sha256((root / "properties.i").read_bytes()).hexdigest(),
            "commands": commands, "swig": subprocess.check_output([swig, "-version"], text=True).strip(),
            "compiler": subprocess.check_output([args.compiler, "--version"], text=True).splitlines()[0]}
        destination = root / "build"
        destination.mkdir(exist_ok=True)
        # Publish the manifest last; startup verifies every file before importing.
        for name in files:
            os.replace(work / name, destination / name)
        manifest = work / "manifest.json"
        manifest.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
        os.replace(manifest, destination / "manifest.json")
    print(destination / "manifest.json")


if __name__ == "__main__":
    main()
