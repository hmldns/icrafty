"""Published schema definitions and the deterministic checked-in schema writer."""

from pathlib import Path

from .contract import CRITERION, NAME, REQUEST_SCHEMA, TARGET, obj
from .files import atomic_json


SHA = {"type": "string", "pattern": "^[0-9a-f]{64}$"}
PATH = {"type": "string", "minLength": 1, "pattern": "^(?!/)(?!.*(?:^|/)\\.\\.(?:/|$))(?!.*\\\\).+$"}
FILE_FIELDS = {"path": PATH, "size_bytes": {"type": "integer", "minimum": 0}, "sha256": SHA,
               "media_type": {"type": "string", "minLength": 1}}
FILE = obj(FILE_FIELDS)
RECT = {"type": "array", "items": {"type": "integer", "minimum": 0}, "minItems": 4, "maxItems": 4}
VEC = {"type": "array", "items": {"type": "number"}, "minItems": 3, "maxItems": 3}
MATRIX = {"type": "array", "items": VEC, "minItems": 3, "maxItems": 3}
CAMERA = obj({"projection": {"const": "orthographic"}, "direction": VEC, "up": VEC, "right": VEC,
    "target_mm": VEC, "span_mm": {"type": "array", "items": {"type": "number", "exclusiveMinimum": 0}, "minItems": 2, "maxItems": 2},
    "world_to_view": MATRIX, "view_origin_mm": VEC, "preset": {"enum": ["isometric", "top", "bottom", "front", "right"]}})
VIEW = obj({"view_id": NAME, "status": {"enum": ["ready", "error", "unavailable"]}, "title": {"type": "string"},
    "camera": CAMERA, "parts": {"type": "array", "items": NAME}, "panel": RECT, "viewport": RECT,
    "view_to_image": MATRIX, "reason": {"type": "string"}},
    ["view_id", "status", "title", "camera", "parts", "panel", "viewport", "view_to_image"])
ANNOTATIONS = obj({**FILE_FIELDS, "status": {"enum": ["ready", "error", "unavailable"]},
    "inline": {"type": "boolean"}, "json": {"type": "boolean"}, "reason": {"type": "string"}}, ["inline", "json"])
ARTIFACT = obj({**FILE_FIELDS, "id": NAME, "kind": {"enum": ["png", "step"]},
    "status": {"enum": ["ready", "error", "unavailable"]}, "reason": {"type": "string"},
    "width": {"type": "integer", "minimum": 1}, "height": {"type": "integer", "minimum": 1},
    "views": {"type": "array", "items": VIEW}, "grid_padding": {"type": "integer", "minimum": 0},
    "annotations": ANNOTATIONS, "comparison": FILE}, ["id", "kind", "status"],
    allOf=[{"if": {"properties": {"status": {"const": "ready"}}},
            "then": {"required": list(FILE_FIELDS)}, "else": {"not": {"required": ["path"]}}}])
METRIC = obj({"id": NAME, "kind": REQUEST_SCHEMA["properties"]["metrics"]["items"]["properties"]["kind"],
    "target": TARGET, "other_target": TARGET, "unit": {"enum": ["1", "mm", "mm^2", "mm^3"]},
    "axis": {"enum": ["x", "y", "z"]}, "method": {"type": "string"}, "frame": {"const": "world"},
    "criterion": {"oneOf": [CRITERION, {"type": "null"}]},
    "value": {"oneOf": [{"type": ["number", "boolean", "null"]}, VEC]},
    "difference": {"type": "number"}, "status": {"enum": ["measured", "pass", "fail", "unavailable", "error"]},
    "reason": {"type": "string"}, "evidence_artifact_ids": {"type": "array", "items": NAME}},
    ["id", "kind", "target", "unit", "method", "frame", "criterion", "value", "status"])
NATIVE = obj({"freecad": {"type": "array", "items": {"type": "string"}}, "occt": {"type": "string"},
    "abi": {"type": "string"}, "executable": {"type": "string"}, "freecad_module": {"type": "string"}, "python": {"type": "string"},
    "properties_bridge": {"type": "object"}}, ["freecad", "occt", "abi", "executable", "freecad_module", "python"])
FEATURE = {"oneOf": [obj({"status": {"const": "ready"}, "type": {"enum": ["Face", "Edge", "Vertex", "Wire", "Shell", "Solid"]},
    "index": {"type": "integer", "minimum": 0}, "sha256": SHA}),
    obj({"status": {"const": "unavailable"}, "reason": {"type": "string"}})]}
PART = obj({"path": PATH, "size_bytes": {"type": "integer", "minimum": 1}, "sha256": SHA,
    "placement_matrix": {"type": "array", "items": {"type": "number"}, "minItems": 16, "maxItems": 16},
    "features": {"type": "object", "propertyNames": NAME, "additionalProperties": FEATURE}})
PARTS = {"type": "object", "minProperties": 1, "propertyNames": NAME, "additionalProperties": PART}
BUNDLE_SCHEMA = {"$schema": "https://json-schema.org/draft/2020-12/schema", **obj({
    "schema_version": {"const": 1, "type": "integer"}, "encoding": {"const": "occt-brep-world-placement-v1"},
    "units": {"const": "mm"}, "frame": {"const": "right-handed-Z-up"}, "native": NATIVE,
    "parts": PARTS, "source_executions": {"const": 1, "type": "integer"}, "geometry_digest": SHA,
    "build_key": SHA, "provenance": {"type": "object"}, "frozen_files": {"type": "array", "items": FILE}},
    ["schema_version", "encoding", "units", "frame", "native", "parts", "source_executions", "geometry_digest"])}
BASELINE = obj({"bounds": {"type": "array", "items": {"type": "number"}, "minItems": 6, "maxItems": 6},
    "centroid": {"oneOf": [VEC, {"type": "null"}]}, "memory_bytes": {"type": "integer", "minimum": 0},
    "solid_count": {"type": "integer", "minimum": 0}, "surface_area": {"type": "number"},
    "validity": {"type": "boolean"}, "volume": {"type": "number"}})
GEOMETRY = obj({"handle": {"type": "string"}, "runtime_generation": {"type": "string"}, "scope": {"type": "string"},
    "geometry_digest": SHA, "build_key": SHA, "snapshot": FILE, "active_uses": {"type": "integer", "minimum": 0},
    "expires_at": {"type": "string"}, "parts": PARTS, "baseline": {"type": "object", "additionalProperties": BASELINE}})
RESULT_SCHEMA = {"$schema": "https://json-schema.org/draft/2020-12/schema", **obj({
    "schema_version": {"const": 1, "type": "integer"}, "run_id": {"type": "string"},
    "execution": obj({"status": {"enum": ["completed", "failed", "cancelled", "rejected"]},
        "started_at": {"type": "string"}, "finished_at": {"type": "string"}, "duration_seconds": {"type": "number", "minimum": 0},
        "reason": {"type": "string"}, "message": {"type": "string"}, "details": {"type": "object"}}, ["status"]),
    "provenance": {"type": "object"}, "geometry": {"oneOf": [GEOMETRY, {"type": "null"}]},
    "artifacts": {"type": "array", "items": ARTIFACT}, "metrics": {"type": "array", "items": METRIC},
    "diagnostics": {"type": "object"}})}


def main():
    root = Path(__file__).resolve().parents[2] / "schemas"
    for name, schema in (("request", REQUEST_SCHEMA), ("result", RESULT_SCHEMA), ("bundle", BUNDLE_SCHEMA)):
        atomic_json(root / (name+"-v1.schema.json"), schema)


if __name__ == "__main__":
    main()
