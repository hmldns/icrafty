"""Validate native manifest data without importing a CAD module."""

import re
from .files import CadError, relative_path


def validate_part(name: str, part: dict):
    pattern = r"[A-Za-z][A-Za-z0-9_.-]{0,79}"
    if not re.fullmatch(pattern, name):
        raise CadError("invalid_bundle", "Invalid part name")
    if set(part) != {"path", "sha256", "size_bytes", "placement_matrix", "features"}:
        raise CadError("invalid_bundle", "Invalid part record")
    relative_path(part["path"])
    if part["path"] != name + ".brep":
        raise CadError("invalid_bundle", "Each part must name its own BRep file")
    if len(part["placement_matrix"]) != 16:
        raise CadError("invalid_bundle", "Expected 4x4 placement matrix")
    for label, feature in part["features"].items():
        if not re.fullmatch(pattern, label):
            raise CadError("invalid_bundle", "Invalid feature label")
        if feature.get("status") == "unavailable":
            if set(feature) != {"status", "reason"}:
                raise CadError("invalid_bundle", "Invalid unavailable feature")
        elif (set(feature) != {"status", "type", "index", "sha256"} or feature["status"] != "ready"
              or feature["type"] not in {"Face", "Edge", "Vertex", "Wire", "Shell", "Solid"}
              or type(feature["index"]) is not int or feature["index"] < 0):
            raise CadError("invalid_bundle", "Invalid resolved feature")
