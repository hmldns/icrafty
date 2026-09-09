"""Service-owned native process. Build mode exits before a clean verifier starts.

Invoked by absolute filename in an isolated native Python (not the uv interpreter).
Only build mode imports a submitted file. The retained verifier accepts data only.
"""

import argparse
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import resource
import sys
import sysconfig
import traceback


def sha(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def write_json(path, value):
    Path(path).write_bytes(json_bytes(value))


def versions():
    result = {"freecad": FreeCAD.Version(), "occt": Part.OCC_VERSION,
            "python": sys.version, "abi": sysconfig.get_config_var("SOABI"),
            "executable": sys.executable, "freecad_module": FreeCAD.__file__}
    if PROPERTIES is not None:
        result["properties_bridge"] = PROPERTIES_VERSION
    return result


def bounds(shape):
    # OCCT's ordinary BoundBox can enclose B-spline control poles, substantially
    # overstating actual dimensions. Exclude triangulation and tolerance padding.
    box = shape.optimalBoundingBox(False, False)
    return [box.XMin, box.YMin, box.ZMin, box.XMax, box.YMax, box.ZMax]


def baseline(shape):
    solids = shape.Solids
    properties = native_properties.measure(PROPERTIES, Part, shape)
    return {"validity": shape.isValid(), "solid_count": len(solids),
            "bounds": bounds(shape),
            **properties,
            "memory_bytes": shape.MemSize}


SUBSHAPES = {"Face": "Faces", "Edge": "Edges", "Vertex": "Vertexes",
             "Wire": "Wires", "Shell": "Shells", "Solid": "Solids"}
NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]{0,79}$")


def build(job):
    # Helpful deterministic-input enforcement for ordinary Python I/O. This is
    # not a sandbox for hostile native code; Docker supplies the isolation gate.
    allowed_reads = {Path(job["source"]).resolve(), *(Path(p).resolve() for p in job["inputs"].values())}
    work = Path.cwd().resolve()
    module_roots = [Path(sys.base_prefix).resolve() / "lib", Path(FreeCAD.__file__).resolve().parent]
    def audit(event, args):
        if event in ("socket.connect", "socket.bind"):
            raise PermissionError("Model network dependencies are undeclared")
        if event == "open" and isinstance(args[0], (str, bytes, os.PathLike)):
            path = Path(os.fsdecode(args[0])).resolve()
            mode = args[1] or ""
            flags = args[2] or 0
            writing = any(c in mode for c in "wa+") or bool(flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT))
            permitted = path.is_relative_to(work) if writing else (path in allowed_reads or path.is_relative_to(work)
                or any(path.is_relative_to(root) for root in module_roots))
            if not permitted:
                raise PermissionError(f"Undeclared model file dependency: {path}")
    sys.dont_write_bytecode = True
    sys.addaudithook(audit)
    spec = importlib.util.spec_from_file_location("submitted_model", job["source"])
    model = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(model)
    result = model.build(job["parameters"], job["inputs"])
    if not isinstance(result, dict) or set(result) != {"parts", "features"}:
        raise ValueError("build must return exactly parts and features")
    parts, features = result["parts"], result["features"]
    if not isinstance(parts, dict) or not parts or not isinstance(features, dict):
        raise ValueError("parts must be nonempty and features must be an object")
    if set(features) - set(parts):
        raise ValueError("Features refer to an unknown part")
    directory = Path(job["bundle"])
    directory.mkdir()
    manifest = {"schema_version": 1, "encoding": "occt-brep-world-placement-v1",
                "units": "mm", "frame": "right-handed-Z-up", "native": versions(),
                "parts": {}, "source_executions": 1}
    for name, shape in parts.items():
        if not isinstance(name, str) or not NAME.fullmatch(name):
            raise ValueError("Invalid part name")
        if not isinstance(shape, Part.Shape) or shape.isNull():
            raise ValueError(f"Part {name} is not a nonempty TopoShape")
        data = shape.exportBrepToString().encode()
        path = directory / (name + ".brep")
        path.write_bytes(data)
        # OCCT normalizes boolean-generated subshape serialization on BRep read.
        # Bind the feature digest to the exact persisted part, while membership
        # is established against the submitted shape before serialization.
        persisted = Part.Shape()
        persisted.importBrepFromString(data.decode())
        resolved = {}
        if not isinstance(features.get(name, {}), dict):
            raise ValueError("Named features must be an object")
        for label, feature in features.get(name, {}).items():
            if not isinstance(label, str) or not NAME.fullmatch(label):
                raise ValueError("Invalid feature name")
            kind = getattr(feature, "ShapeType", None)
            matches = ([i for i, candidate in enumerate(getattr(shape, SUBSHAPES[kind]))
                        if candidate.isSame(feature)] if kind in SUBSHAPES else [])
            if len(matches) != 1:
                resolved[label] = {"status": "unavailable", "reason": "feature_not_unique_member"}
            else:
                member = getattr(persisted, SUBSHAPES[kind])[matches[0]]
                resolved[label] = {"status": "ready", "type": kind, "index": matches[0],
                                   "sha256": sha(member.exportBrepToString().encode())}
        manifest["parts"][name] = {"path": path.name, "sha256": sha(data), "size_bytes": len(data),
            "placement_matrix": list(shape.Placement.toMatrix().A), "features": resolved}
    manifest["geometry_digest"] = sha(json_bytes(manifest["parts"]))
    write_json(directory / "manifest.json", manifest)
    return {"bundle": str(directory / "manifest.json"), "source_executions": 1}


def load_bundle(path):
    directory = Path(path).parent
    manifest = json.loads(Path(path).read_bytes())
    parts = {}
    for name, item in manifest["parts"].items():
        data = (directory / item["path"]).read_bytes()
        if sha(data) != item["sha256"]:
            raise ValueError("BRep digest mismatch")
        shape = Part.Shape()
        shape.importBrepFromString(data.decode())
        if shape.isNull():
            raise ValueError("Null native geometry")
        matrix = list(shape.Placement.toMatrix().A)
        if any(abs(a-b) > 1e-10 for a, b in zip(matrix, item["placement_matrix"])):
            raise ValueError("BRep placement differs from manifest")
        resolved = {}
        for label, feature in item["features"].items():
            if feature["status"] != "ready":
                resolved[label] = None
                continue
            selected = getattr(shape, SUBSHAPES[feature["type"]])[feature["index"]]
            if sha(selected.exportBrepToString().encode()) != feature["sha256"]:
                raise ValueError("Feature no longer matches snapshot member")
            resolved[label] = selected
        parts[name] = {"shape": shape, "features": resolved}
    return {"parts": parts, "manifest": manifest}


class Unavailable(Exception):
    pass


def select(geometry, target):
    if target["part"] not in geometry["parts"]:
        raise Unavailable("unknown_part")
    item = geometry["parts"][target["part"]]
    if "feature" not in target:
        return item["shape"]
    shape = item["features"].get(target["feature"])
    if shape is None:
        raise Unavailable("missing_or_ambiguous_feature")
    return shape


def measure(geometry, request, properties_cache):
    try:
        shape = select(geometry, request["target"])
        kind = request["kind"]
        if kind == "validity":
            value = shape.isValid()
        elif kind == "solid_count":
            value = len(shape.Solids)
        elif kind == "bbox_extent":
            value = getattr(shape.optimalBoundingBox(False, False), request["axis"].upper() + "Length")
        elif kind == "surface_area":
            if not shape.Faces:
                raise Unavailable("requires_faces")
            key = tuple(sorted(request["target"].items()))
            if key not in properties_cache:
                properties_cache[key] = native_properties.measure(PROPERTIES, Part, shape)
            value = properties_cache[key]["surface_area"]
        elif kind in ("volume", "centroid"):
            if not shape.Solids or not shape.isValid() or not shape.isClosed():
                raise Unavailable("requires_valid_closed_solid_geometry")
            key = tuple(sorted(request["target"].items()))
            if key not in properties_cache:
                properties_cache[key] = native_properties.measure(PROPERTIES, Part, shape)
            value = properties_cache[key][kind]
        elif kind == "cylinder_diameter":
            if shape.ShapeType != "Face" or not isinstance(shape.Surface, Part.Cylinder):
                raise Unavailable("requires_identified_cylindrical_face")
            value = 2 * shape.Surface.Radius
        elif kind == "distance":
            other = select(geometry, request["other_target"])
            if "feature" not in request["target"] or "feature" not in request["other_target"]:
                raise Unavailable("requires_selected_subshapes")
            value = shape.distToShape(other)[0]
        else:
            raise Unavailable("unsupported_method")
        json_bytes(value)
        return {"value": value, "status": "measured"}
    except Unavailable as exc:
        return {"value": None, "status": "unavailable", "reason": str(exc)}
    except Exception as exc:
        return {"value": None, "status": "error", "reason": str(exc)}


def selected_shape(geometry, names):
    shapes = [select(geometry, {"part": name}).copy() for name in names]
    return shapes[0] if len(shapes) == 1 else Part.makeCompound(shapes)


def serve():
    geometries = {}
    counts = {"source_executions": 0, "loads": 0, "queries": 0}
    for line in sys.stdin:
        try:
            job = json.loads(line)
            op = job["op"]
            if op == "hello":
                answer = {"native": versions(), "pid": os.getpid()}
            elif op == "load":
                geometry = load_bundle(job["path"])
                geometries[job["key"]] = geometry
                counts["loads"] += 1
                answer = {"baseline": {n: baseline(p["shape"]) for n, p in geometry["parts"].items()}}
            elif op == "release":
                geometries.pop(job["key"], None)
                answer = {}
            elif op == "metrics":
                counts["queries"] += 1
                properties_cache = {}
                answer = {"metrics": [measure(geometries[job["key"]], m, properties_cache) for m in job["metrics"]]}
            elif op == "mesh":
                shape = selected_shape(geometries[job["key"]], job["parts"])
                # TopoShape.tessellate forces OCCT parallel meshing and can
                # exhaust address space allocating its machine-sized pool.
                # MeshPart's standard mesher is serial, on this disposable copy.
                import MeshPart
                mesh = MeshPart.meshFromShape(Shape=shape, LinearDeflection=job["deflection"],
                    AngularDeflection=job.get("angular_deflection", 0.5), Relative=False)
                vertices, triangles = mesh.Topology
                if len(triangles) > 250_000:
                    raise ValueError("tessellation triangle limit")
                answer = {"vertices": [[v.x, v.y, v.z] for v in vertices], "triangles": triangles,
                          "baseline": {"bounds": bounds(shape)}}
            elif op == "export":
                shape = selected_shape(geometries[job["key"]], job["parts"])
                # Preserve exact trimming curves. The default omits p-curves;
                # STEP reopen then approximates their projection on NURBS faces.
                Part.setStaticValue("write.surfacecurve.mode", 1)
                shape.exportStep(job["path"])
                answer = {"baseline": baseline(shape)}
            elif op == "inspect":
                geometry = geometries[job["key"]]
                answer = {"baseline": {n: baseline(p["shape"]) for n, p in geometry["parts"].items()},
                          "brep_digests": {n: sha(p["shape"].exportBrepToString().encode())
                                           for n, p in geometry["parts"].items()}}
            elif op == "stats":
                answer = counts.copy()
            else:
                raise ValueError("Unknown native operation")
            response = {"ok": True, "data": answer}
        except Exception as exc:
            response = {"ok": False, "error": str(exc), "code": "selection_unavailable" if isinstance(exc, Unavailable) else "native_error",
                        "traceback": traceback.format_exc()[-4000:]}
        print("CRAFTY_RPC:" + json.dumps(response, allow_nan=False), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["build", "serve", "step-check"])
    parser.add_argument("--lib", required=True)
    parser.add_argument("--job")
    parser.add_argument("--memory", type=int, required=True)
    parser.add_argument("--cpu", type=int, required=True)
    parser.add_argument("--output-limit", type=int, required=True)
    args = parser.parse_args()
    resource.setrlimit(resource.RLIMIT_AS, (args.memory, args.memory))
    resource.setrlimit(resource.RLIMIT_CPU, (args.cpu, args.cpu))
    resource.setrlimit(resource.RLIMIT_FSIZE, (args.output_limit, args.output_limit))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    sys.path.insert(0, args.lib)
    global FreeCAD, Part, PROPERTIES, PROPERTIES_VERSION, native_properties
    import FreeCAD
    import Part
    PROPERTIES = None
    if args.mode != "build":
        spec = importlib.util.spec_from_file_location("native_properties", Path(__file__).with_name("native_properties.py"))
        native_properties = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(native_properties)
        PROPERTIES, PROPERTIES_VERSION = native_properties.load(Part.OCC_VERSION)
    if args.mode == "serve":
        serve()
    else:
        job = json.loads(Path(args.job).read_bytes())
        try:
            if args.mode == "build":
                answer = build(job)
            else:
                shape = Part.Shape()
                shape.read(job["step"])
                text = Path(job["step"]).read_text()
                units = re.findall(r"SI_UNIT\s*\(\s*([^,]+),\s*\.METRE\.\s*\)", text)
                answer = {"baseline": baseline(shape), "length_units": units, "native": versions()}
            write_json(job["response"], {"ok": True, "data": answer})
        except Exception as exc:
            write_json(job["response"], {"ok": False, "error": str(exc),
                                        "traceback": traceback.format_exc()[-4000:]})
            raise


if __name__ == "__main__":
    main()
