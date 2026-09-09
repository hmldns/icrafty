"""Versioned public file contract, without native imports or process startup."""

from __future__ import annotations

import copy
import math
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from .files import CadError, contained, load_json, relative_path, verify_record


def obj(properties: dict, required: list | None = None, **extra) -> dict:
    return {"type": "object", "properties": properties,
            "required": list(properties) if required is None else required,
            "additionalProperties": False, **extra}


NAME = {"type": "string", "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,79}$"}
NUMBER = {"type": "number"}
TARGET = obj({"part": NAME, "feature": NAME}, ["part"])
CRITERION = obj({"equals": {"type": ["number", "boolean"]},
                 "absolute_tolerance": {"type": "number", "minimum": 0},
                 "min": NUMBER, "max": NUMBER}, [],
                oneOf=[{"required": ["equals"], "not": {"anyOf": [{"required": ["min"]}, {"required": ["max"]}]}},
                       {"anyOf": [{"required": ["min"]}, {"required": ["max"]}],
                        "not": {"anyOf": [{"required": ["equals"]}, {"required": ["absolute_tolerance"]}]}}])
VIEW_FIELDS = {"preset": {"enum": ["isometric", "top", "bottom", "front", "right"]},
    "width": {"type": "integer", "minimum": 320, "maximum": 4096},
    "height": {"type": "integer", "minimum": 240, "maximum": 4096},
    "title": {"type": "string", "maxLength": 48, "pattern": "^[^\\n\\r\\t]*$"},
    "span_mm": {"type": "number", "exclusiveMinimum": 0}}
VIEW = obj(VIEW_FIELDS, ["preset", "width", "height"])
GRID_VIEW = obj({"id": NAME, **VIEW_FIELDS}, ["id", "preset", "width", "height"])
OUTPUT_COMMON = {"id": NAME, "parts": {"type": "array", "items": NAME, "minItems": 1, "uniqueItems": True}}
PNG = obj({**OUTPUT_COMMON, "kind": {"const": "png"}, "view": VIEW,
    "grid": obj({"columns": {"type": "integer", "minimum": 1, "maximum": 8},
                 "views": {"type": "array", "items": GRID_VIEW, "minItems": 1, "maxItems": 16}}),
    "annotations": obj({"json": {"type": "boolean"}, "inline": {"type": "boolean"}})},
    ["id", "kind", "parts"], oneOf=[{"required": ["view"]}, {"required": ["grid"]}])
STEP = obj({**OUTPUT_COMMON, "kind": {"const": "step"}})
UNITS = {"validity": "1", "solid_count": "1", "bbox_extent": "mm", "volume": "mm^3",
         "surface_area": "mm^2", "centroid": "mm", "cylinder_diameter": "mm", "distance": "mm"}
METRIC = obj({"id": NAME, "kind": {"enum": list(UNITS)}, "target": TARGET,
              "other_target": TARGET, "axis": {"enum": ["x", "y", "z"]},
              "unit": {"enum": ["1", "mm", "mm^2", "mm^3"]}, "criterion": CRITERION,
              "evidence_artifact_ids": {"type": "array", "items": NAME, "uniqueItems": True}},
             ["id", "kind", "target", "unit"])
REQUEST_SCHEMA = {"$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://crafty.local/cad/request-v1.schema.json",
    **obj({"schema_version": {"const": 1, "type": "integer"}, "source": {"type": "string", "minLength": 1},
           "geometry": obj({"handle": {"type": "string", "minLength": 1},
                            "path": {"type": "string", "minLength": 1}}, [],
                           oneOf=[{"required": ["handle"]}, {"required": ["path"]}]),
           "parameters": {"type": "object"}, "inputs": {"type": "object", "propertyNames": NAME,
                                                      "additionalProperties": {"type": "string"}},
           "outputs": {"type": "array", "maxItems": 32, "items": {"oneOf": [PNG, STEP]}},
           "metrics": {"type": "array", "maxItems": 128, "items": METRIC}},
          ["schema_version", "parameters", "inputs", "outputs", "metrics"],
          oneOf=[{"required": ["source"]}, {"required": ["geometry"]}])}


def finite(value: Any) -> None:
    if isinstance(value, float) and not math.isfinite(value):
        raise CadError("nonfinite_number", "All numeric values must be finite")
    if isinstance(value, dict):
        for child in value.values():
            finite(child)
    elif isinstance(value, list):
        for child in value:
            finite(child)


def validate_request(value: Any, *, max_pixels: int = 16_000_000, padding: int = 12) -> dict:
    finite(value)
    errors = sorted(Draft202012Validator(REQUEST_SCHEMA).iter_errors(value), key=lambda e: str(e.path))
    if errors:
        error = errors[0]
        raise CadError("invalid_request", f"{'/'.join(map(str, error.path)) or 'request'}: {error.message}")
    request = copy.deepcopy(value)
    for collection in (request["outputs"], request["metrics"]):
        ids = [entry["id"] for entry in collection]
        if len(set(ids)) != len(ids):
            raise CadError("duplicate_id", "IDs must be unique within each collection")
    if "source" in request:
        relative_path(request["source"])
        for path in request["inputs"].values():
            relative_path(path)
    else:
        if request["parameters"] or request["inputs"]:
            raise CadError("invalid_request", "Geometry requests require empty parameters and inputs")
        if "path" in request["geometry"]:
            relative_path(request["geometry"]["path"])
    image_ids = {o["id"] for o in request["outputs"] if o["kind"] == "png"}
    for output in request["outputs"]:
        if output["kind"] != "png":
            continue
        output.setdefault("annotations", {"json": True, "inline": True})
        if "grid" in output:
            grid = output["grid"]
            views = grid["views"]
            if len({v["id"] for v in views}) != len(views):
                raise CadError("duplicate_id", "View IDs must be unique within a grid")
            width = max(v["width"] for v in views)*grid["columns"] + padding*(grid["columns"]+1)
            rows = math.ceil(len(views)/grid["columns"])
            height = max(v["height"] for v in views)*rows + padding*(rows+1)
        else:
            width, height = output["view"]["width"], output["view"]["height"]
        if width*height > max_pixels:
            raise CadError("output_limit", f"PNG {output['id']} exceeds {max_pixels} pixels")
    for metric in request["metrics"]:
        kind = metric["kind"]
        if metric["unit"] != UNITS[kind]:
            raise CadError("invalid_unit", f"{kind} requires unit {UNITS[kind]}")
        if ("axis" in metric) != (kind == "bbox_extent"):
            raise CadError("invalid_metric", "Only bbox_extent requires axis")
        if ("other_target" in metric) != (kind == "distance"):
            raise CadError("invalid_metric", "Only distance requires other_target")
        if set(metric.get("evidence_artifact_ids", [])) - image_ids:
            raise CadError("invalid_metric", "Evidence must name requested PNG IDs")
        criterion = metric.get("criterion")
        if not criterion:
            continue
        if kind == "centroid":
            raise CadError("invalid_criterion", "Vector criteria are unsupported")
        if kind in ("validity", "solid_count"):
            expected_type = bool if kind == "validity" else int
            if set(criterion) != {"equals"} or type(criterion["equals"]) is not expected_type:
                raise CadError("invalid_criterion", f"{kind} requires exact {expected_type.__name__} equals")
        elif "equals" in criterion:
            if isinstance(criterion["equals"], bool) or "absolute_tolerance" not in criterion:
                raise CadError("invalid_criterion", "Scalar equals requires explicit absolute_tolerance")
        if "min" in criterion and "max" in criterion and criterion["min"] > criterion["max"]:
            raise CadError("invalid_criterion", "Range minimum exceeds maximum")
    return request


def compare(metric: dict, measurement: dict) -> dict:
    result = {**metric, "criterion": metric.get("criterion"), "frame": "world",
              "method": metric["kind"] + ("@2" if metric["kind"] in {"bbox_extent", "volume", "surface_area", "centroid"} else "@1"), **measurement}
    if measurement["status"] != "measured" or "criterion" not in metric:
        return result
    criterion, value = metric["criterion"], measurement["value"]
    if "equals" in criterion:
        target = criterion["equals"]
        difference = int(value) - int(target) if isinstance(value, bool) else value - target
        passed = abs(difference) <= criterion.get("absolute_tolerance", 0)
    else:
        difference = value-criterion["min"] if "min" in criterion and value < criterion["min"] else (
            value-criterion["max"] if "max" in criterion and value > criterion["max"] else 0)
        passed = difference == 0
    return {**result, "status": "pass" if passed else "fail", "difference": difference}


def validate_result(result: dict, root: Path) -> None:
    from .schemas import RESULT_SCHEMA
    errors = list(Draft202012Validator(RESULT_SCHEMA).iter_errors(result))
    if errors:
        raise CadError("invalid_result", errors[0].message)
    required = {"schema_version", "run_id", "execution", "provenance", "geometry", "artifacts", "metrics", "diagnostics"}
    if set(result) != required or result["schema_version"] != 1:
        raise CadError("invalid_result", "Invalid result envelope")
    finite(result)
    if result["execution"]["status"] not in ("completed", "failed", "cancelled", "rejected"):
        raise CadError("invalid_result", "Invalid execution status")
    for artifact in result["artifacts"]:
        if artifact["status"] not in ("ready", "error", "unavailable"):
            raise CadError("invalid_result", "Invalid artifact status")
        if artifact["status"] == "ready":
            verify_record(root, artifact)
        elif "path" in artifact:
            raise CadError("invalid_result", "Incomplete artifact must not expose a file path")
        sidecar = artifact.get("annotations", {})
        if "comparison" in artifact:
            verify_record(root, artifact["comparison"])
        if sidecar.get("status") == "ready":
            verify_record(root, sidecar)
        elif "path" in sidecar:
            raise CadError("invalid_result", "Incomplete sidecar must not expose a file path")
    for metric in result["metrics"]:
        if metric["status"] not in ("measured", "pass", "fail", "unavailable", "error"):
            raise CadError("invalid_result", "Invalid metric status")
        if (metric["value"] is None) != (metric["status"] in ("unavailable", "error")):
            raise CadError("invalid_result", "Metric value does not agree with status")
    if result["geometry"]:
        snapshot = result["geometry"]["snapshot"]
        path = verify_record(root, snapshot)
        bundle = load_json(path)
        for part in bundle["parts"].values():
            verify_record(path.parent, part)
        for item in bundle.get("frozen_files", []):
            verify_record(path.parent, item)
    if "request" in result["provenance"]:
        verify_record(root, result["provenance"]["request"])
