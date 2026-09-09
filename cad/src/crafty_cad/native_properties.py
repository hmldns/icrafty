"""Native-interpreter-only adapter; shares loaded TopoDS geometry without parsing."""
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys
import sysconfig


def load(occt_version):
    root = Path(__file__).resolve().parents[2] / "native"
    try:
        manifest = json.loads((root / "build/manifest.json").read_bytes())
        if manifest["abi"] != sysconfig.get_config_var("SOABI"):
            raise ValueError("Native measurement bridge Python ABI changed")
        if hashlib.sha256((root / "properties.i").read_bytes()).hexdigest() != manifest["source_sha256"]:
            raise ValueError("Native measurement bridge source changed")
        expected = {"crafty_properties.py", "_crafty_properties" + sysconfig.get_config_var("EXT_SUFFIX")}
        if set(manifest["files"]) != expected:
            raise ValueError("Native measurement bridge manifest has unexpected files")
        for name, sha in manifest["files"].items():
            if hashlib.sha256((root / "build" / name).read_bytes()).hexdigest() != sha:
                raise ValueError("Native measurement bridge digest mismatch")
        for name, filename in (("_crafty_properties", next(n for n in expected if n.startswith("_"))),
                               ("crafty_properties", "crafty_properties.py")):
            spec = importlib.util.spec_from_file_location(name, root / "build" / filename)
            module = importlib.util.module_from_spec(spec)
            sys.modules[name] = module
            spec.loader.exec_module(module)
        if module.occt_version() != occt_version:
            raise ValueError("Native measurement bridge OCCT ABI changed")
    except (OSError, ValueError, ImportError, KeyError) as error:
        raise RuntimeError("Native measurement setup required: make -C cad native-setup; " + str(error)) from error
    return module, {"method": "occt-adaptive-properties@1", "files": manifest["files"],
        "abi": manifest["abi"], "occt": occt_version, "source_sha256": manifest["source_sha256"],
        "volume_relative_epsilon": 1e-11, "area_relative_epsilon": 1e-15}


def measure(bridge, part, shape):
    proxy = part.__toPythonOCC__(shape)
    try:
        values = list(bridge.properties(proxy))
    finally:
        bridge.dispose(proxy)
    if len(values) != 7 or not all(math.isfinite(v) for v in values):
        raise ValueError("Nonfinite native mass properties")
    return {"volume": values[0], "surface_area": values[1],
        "centroid": values[2:5] if values[0] > 0 else None}
