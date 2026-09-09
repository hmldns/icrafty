"""Deterministic assertions against the public file/state contract.

Test-only fault injection replaces service I/O at named seams; it is never a
request field and generated model code cannot choose it. No model calls occur.
"""

from dataclasses import replace
import copy
import hashlib
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

from PIL import Image, ImageDraw, ImageFont

from crafty_cad.contract import REQUEST_SCHEMA, compare, validate_request, validate_result
from crafty_cad.files import CadError, atomic_bytes, atomic_json, canonical, digest, load_json, record, verify_record
from crafty_cad.harness.api import CAD_ROOT, Case
from crafty_cad.process import process_tree


CASES = []


def case(suite, name, classification="expected_good", native=True):
    def register(function):
        CASES.append(Case(suite, name, function, classification, native))
        return function
    return register


def base_request():
    return {"schema_version": 1, "source": "model.py", "parameters": {}, "inputs": {}, "outputs": [], "metrics": []}


def png(identity="iso", part="cap", preset="isometric", flags=None):
    return {"id": identity, "kind": "png", "parts": [part],
            "annotations": flags or {"json": True, "inline": True},
            "view": {"preset": preset, "width": 640, "height": 480}}


def grid(flags=None, presets=("isometric", "bottom", "front")):
    return {"id": "grid", "kind": "png", "parts": ["cap"],
            "annotations": flags or {"json": True, "inline": True},
            "grid": {"columns": 2, "views": [{"id": p, "preset": p, "width": 640, "height": 480} for p in presets]}}


def scalar(identity, kind, part, unit, value=None, **extra):
    metric = {"id": identity, "kind": kind, "target": {"part": part}, "unit": unit, **extra}
    if value is not None:
        metric["criterion"] = {"equals": value}
        if kind not in ("validity", "solid_count"):
            metric["criterion"]["absolute_tolerance"] = 0.001
    return metric


def cap_request(ctx, parameters=None):
    folder, request = ctx.input("cap", parameters)
    request["metrics"] = load_json(CAD_ROOT / "fixtures/cap/criteria.json")
    request["outputs"] = [png(), png("bottom", preset="bottom"), png("side", preset="front"), grid()]
    return folder, request


def ready(ctx, result, code):
    ctx.expect(code == 0 and result["execution"]["status"] == "completed", "Evaluation completed", 0, code)
    for artifact in result["artifacts"]:
        ctx.expect(artifact["status"] == "ready", "Requested artifact ready: " + artifact["id"], "ready", artifact["status"])
        if artifact["kind"] == "png":
            ctx.expect(all(v["status"] == "ready" for v in artifact["views"]), "All requested panels rendered")
            if artifact["annotations"]["json"]:
                ctx.expect(artifact["annotations"]["status"] == "ready", "Requested sidecar ready")


@case("contract", "schema-and-examples", native=False)
def schema_examples(ctx):
    from jsonschema import Draft202012Validator
    Draft202012Validator.check_schema(REQUEST_SCHEMA)
    for path in sorted((CAD_ROOT / "examples/cylinder").glob("request*.json")):
        ctx.expect(bool(validate_request(load_json(path))), "Example validates: " + path.name)
    ctx.expect("FreeCAD" not in sys.modules, "Contract process never imported FreeCAD")
    from crafty_cad.schemas import RESULT_SCHEMA, BUNDLE_SCHEMA
    for name, schema in [("request", REQUEST_SCHEMA), ("result", RESULT_SCHEMA), ("bundle", BUNDLE_SCHEMA)]:
        ctx.expect(load_json(CAD_ROOT/"schemas"/(name+"-v1.schema.json")) == schema, "Published schema matches runtime: " + name)


INVALID_REQUESTS = {
    "version": lambda r: r.update(schema_version=2),
    "unknown-field": lambda r: r.update(secret=True),
    "both-source-geometry": lambda r: r.update(geometry={"handle": "x"}),
    "both-geometry-locators": lambda r: (r.pop("source"), r.update(geometry={"handle": "x", "path": "x.json"})),
    "absolute-source": lambda r: r.update(source="/tmp/model.py"),
    "escape-source": lambda r: r.update(source="../model.py"),
    "windows-path": lambda r: r.update(source="..\\model.py"),
    "nonfinite": lambda r: r.update(parameters={"radius": float("inf")}),
    "unknown-output": lambda r: r["outputs"].append({"id": "x", "kind": "glb", "parts": ["cap"]}),
    "unsupported-view": lambda r: r["outputs"].append(png(preset="perspective")),
    "duplicate-output": lambda r: r["outputs"].extend([png(), png()]),
    "duplicate-metric": lambda r: r["metrics"].extend([scalar("x", "volume", "cap", "mm^3")]*2),
    "selection-field": lambda r: r["metrics"].append(scalar("x", "volume", "cap", "mm^3", target={"part": "cap", "face_index": 1})),
    "unsupported-method": lambda r: r["metrics"].append(scalar("x", "wall_thickness", "cap", "mm")),
    "wrong-unit": lambda r: r["metrics"].append(scalar("x", "volume", "cap", "mm")),
    "missing-axis": lambda r: r["metrics"].append(scalar("x", "bbox_extent", "cap", "mm")),
    "spurious-axis": lambda r: r["metrics"].append(scalar("x", "volume", "cap", "mm^3", axis="z")),
    "missing-distance-target": lambda r: r["metrics"].append(scalar("x", "distance", "cap", "mm")),
    "negative-tolerance": lambda r: r["metrics"].append(scalar("x", "volume", "cap", "mm^3", criterion={"equals": 1, "absolute_tolerance": -1})),
    "implicit-tolerance": lambda r: r["metrics"].append(scalar("x", "volume", "cap", "mm^3", criterion={"equals": 1})),
    "vector-criterion": lambda r: r["metrics"].append(scalar("x", "centroid", "cap", "mm", criterion={"equals": 1})),
    "range-order": lambda r: r["metrics"].append(scalar("x", "volume", "cap", "mm^3", criterion={"min": 2, "max": 1})),
    "count-tolerance": lambda r: r["metrics"].append(scalar("x", "solid_count", "cap", "1", criterion={"equals": 1, "absolute_tolerance": 0})),
    "oversized-grid": lambda r: r["outputs"].append({**grid(), "grid": {"columns": 8, "views": [{"id": "x", "preset": "top", "width": 4096, "height": 4096}]}}),
}
for identity, mutate in INVALID_REQUESTS.items():
    def invalid(ctx, mutate=mutate):
        request = base_request()
        mutate(request)
        try:
            validate_request(request)
        except CadError as exc:
            ctx.expect(True, "Request rejected before native work", actual=exc.code)
        else:
            ctx.expect(False, "Invalid request was accepted")
    case("contract", identity, "intended_negative", False)(invalid)


@case("contract", "paths-digests-json", "intended_negative", False)
def paths(ctx):
    from crafty_cad.files import contained
    atomic_bytes(ctx.root / "data", b"original")
    item = record(ctx.root / "data", ctx.root)
    (ctx.root / "data").write_bytes(b"modified")
    (ctx.root / "alias").symlink_to(ctx.root / "data")
    for action in (lambda: verify_record(ctx.root, item), lambda: contained(ctx.root, "alias")):
        try:
            action()
        except CadError as exc:
            ctx.expect(True, "Unsafe or changed file rejected", actual=exc.code)
        else:
            ctx.expect(False, "Unsafe file accepted")
    for index, text in enumerate(['{"a":1,"a":2}', '{"value":NaN}']):
        path = ctx.root / f"invalid-{index}.json"
        path.write_text(text)
        try:
            load_json(path)
        except CadError:
            ctx.expect(True, "Malformed JSON rejected")
        else:
            ctx.expect(False, "Malformed JSON accepted")


@case("contract", "metric-outcome-semantics", native=False)
def outcomes(ctx):
    for value, criterion, expected, difference in [(8, {"equals": 10, "absolute_tolerance": .01}, "fail", -2),
        (10, {"min": 10, "max": 12}, "pass", 0), (9, {"min": 10}, "fail", -1), (13, {"max": 12}, "fail", 1)]:
        metric = scalar("m", "volume", "cap", "mm^3", criterion=criterion)
        result = compare(metric, {"value": value, "status": "measured"})
        ctx.expect((result["status"], result["difference"]) == (expected, difference), "Criterion and signed difference")
    for status in ("measured", "unavailable", "error"):
        result = compare(scalar("m", "volume", "cap", "mm^3"), {"value": 2 if status == "measured" else None, "status": status})
        ctx.expect(result["status"] == status, "Outcome preserved independently: " + status)


@case("contract", "manifest-finalization", native=False)
def manifests(ctx):
    result = {"schema_version": 1, "run_id": "contract", "execution": {"status": "completed"},
              "provenance": {}, "geometry": None, "artifacts": [], "metrics": [], "diagnostics": {}}
    atomic_bytes(ctx.root / "image.png", b"completed-bytes")
    result["artifacts"] = [{"id": "image", "kind": "png", "status": "ready", **record(ctx.root / "image.png", ctx.root)}]
    validate_result(result, ctx.root)
    ctx.expect(True, "Completed file digest verified")
    for status in ("error", "unavailable"):
        result["artifacts"][0]["status"] = status
        try:
            validate_result(result, ctx.root)
        except CadError:
            ctx.expect(True, "Incomplete file cannot receive a verified path")
        else:
            ctx.expect(False, "Incomplete path exposed")


@case("geometry", "cylinder")
def cylinder(ctx):
    folder, request = ctx.input("cylinder")
    request["metrics"] = load_json(CAD_ROOT / "examples/cylinder/request.json")["metrics"]
    request["metrics"] += [scalar("area", "surface_area", "body", "mm^2", 600*math.pi),
                            scalar("center", "centroid", "body", "mm")]
    request["outputs"] = [png(part="body")]
    result, code = ctx.evaluate(ctx.runtime(), folder, request)
    ready(ctx, result, code)
    ctx.expect(all(m["status"] == "pass" for m in result["metrics"][:-1]), "Independent cylinder criteria pass")
    ctx.expect(abs(result["metrics"][-1]["value"][2]-10) < 1e-8, "Cylinder centroid is measured at z=10")
    ctx.expect(not list(ctx.root.rglob("*.step")), "PNG and metrics require no STEP")


@case("geometry", "sleeve")
def sleeve(ctx):
    folder, request = ctx.input("sleeve")
    request["metrics"] = [scalar("valid", "validity", "sleeve", "1", True), scalar("solids", "solid_count", "sleeve", "1", 1),
        scalar("volume", "volume", "sleeve", "mm^3", 912*math.pi), scalar("area", "surface_area", "sleeve", "mm^2", 1064*math.pi),
        scalar("bore", "cylinder_diameter", "sleeve", "mm", 36, target={"part": "sleeve", "feature": "bore"}),
        scalar("cavity", "bbox_extent", "sleeve", "mm", 12, target={"part": "sleeve", "feature": "bore"}, axis="z")]
    request["outputs"] = [png(part="sleeve", preset="bottom")]
    result, code = ctx.evaluate(ctx.runtime(), folder, request)
    ready(ctx, result, code)
    ctx.expect(all(m["status"] == "pass" for m in result["metrics"]), "Sleeve dimensions and aggregates pass")


@case("geometry", "nurbs-bounds-serial-mesh")
def nurbs_bounds(ctx):
    folder, request = ctx.input("nurbs-cap")
    request["metrics"] = [scalar("valid", "validity", "cap", "1", True),
        scalar("solids", "solid_count", "cap", "1", 1),
        *[scalar("extent_" + axis, "bbox_extent", "cap", "mm", value, axis=axis)
          for axis, value in (("x", 70), ("y", 70), ("z", 16))],
        scalar("volume", "volume", "cap", "mm^3", (35**2 * 16 - 33**2 * 14) * math.pi)]
    runtime = ctx.runtime()
    first, code = ctx.evaluate(runtime, folder, request, "nurbs-built")
    ready(ctx, first, code)
    handle = first["geometry"]["handle"]
    before = runtime.inspect_geometry(handle)
    ctx.expect(all(m["status"] == "pass" for m in first["metrics"]),
               "B-spline bounds use geometric extrema, not control-pole enclosure")
    ctx.expect(all(m["method"] == "bbox_extent@2" for m in first["metrics"] if m["kind"] == "bbox_extent"),
               "Corrected bound method is explicitly versioned")
    query = {**request, "geometry": {"handle": handle}, "outputs": [png(), {"id": "nurbs", "kind": "step", "parts": ["cap"]}]}
    query.pop("source")
    result, code = ctx.evaluate(runtime, folder, query, "nurbs-warm")
    ready(ctx, result, code)
    ctx.expect(before == runtime.inspect_geometry(handle), "Serial meshing/export cannot mutate retained NURBS")
    ctx.expect(runtime.counts["source_executions"] == 1 and runtime.counts["loads"] == 1,
               "NURBS evidence/export reuses the ensured shape")
    ctx.expect(all(m["status"] == "pass" for m in result["metrics"]), "Independent NURBS criteria pass after rendering")
    ctx.expect(result["provenance"]["effective_settings"]["memory_bytes"] == 1024**3,
               "Serial meshing preserves the 1 GiB memory limit")


for identity, parameters, intended in [("cap", {}, {}), ("wrong-bore", {"bore_radius": 17}, {"bore": "fail", "volume": "fail"}),
        ("missing-roof", {"roof": 0}, {"roof": "unavailable", "cavity": "fail", "volume": "fail"}),
        ("extra-solid", {"extra_solid": True}, {"solids": "fail", "width": "fail", "volume": "fail"})]:
    def cap(ctx, parameters=parameters, intended=intended):
        folder, request = cap_request(ctx, parameters)
        result, code = ctx.evaluate(ctx.runtime(), folder, request)
        ready(ctx, result, code)
        metrics = {m["id"]: m for m in result["metrics"]}
        for name, status in intended.items():
            ctx.expect(metrics[name]["status"] == status, "Intended geometry defect: " + name, status, metrics[name]["status"])
        if not intended:
            ctx.expect(all(m["status"] == "pass" for m in result["metrics"] if m["criterion"]), "All cap criteria pass")
            ctx.expect(abs(metrics["centroid"]["value"][2]-105/13) < 1e-8, "Cap analytic centroid agrees")
    case("geometry", identity, "intended_negative" if intended else "expected_good")(cap)


@case("geometry", "placed-features")
def placed(ctx):
    folder, request = ctx.input("placed-cylinder")
    request["metrics"] = [scalar("diameter", "cylinder_diameter", "body", "mm", 20, target={"part": "body", "feature": "side"}),
        scalar("length", "distance", "body", "mm", 20, target={"part": "body", "feature": "upper"}, other_target={"part": "body", "feature": "lower"}),
        scalar("center", "centroid", "body", "mm"), scalar("foreign", "cylinder_diameter", "body", "mm", target={"part": "body", "feature": "foreign"})]
    result, code = ctx.evaluate(ctx.runtime(), folder, request)
    ready(ctx, result, code)
    ctx.expect([m["status"] for m in result["metrics"]] == ["pass", "pass", "measured", "unavailable"], "Membership and methods use actual frozen subshapes")
    expected = [7, -9, 3+10*math.cos(math.pi/6)]
    actual = result["metrics"][2]["value"]
    ctx.expect(all(abs(a-b) < 1e-8 for a, b in zip(expected, actual)), "Placement survives roundtrip", expected, actual)


@case("geometry", "method-suitability", "intended_negative")
def unsuitable(ctx):
    folder, request = cap_request(ctx)
    request["outputs"] = []
    request["metrics"] = [scalar("wrong-face", "cylinder_diameter", "cap", "mm", target={"part": "cap", "feature": "outer_roof"}),
        scalar("face-volume", "volume", "cap", "mm^3", target={"part": "cap", "feature": "bore"}),
        scalar("missing", "volume", "unknown", "mm^3"), scalar("not-feature", "cylinder_diameter", "cap", "mm")]
    result, code = ctx.evaluate(ctx.runtime(), folder, request)
    ready(ctx, result, code)
    ctx.expect(all(m["status"] == "unavailable" and m["value"] is None for m in result["metrics"]), "No unsuitable or missing evidence is guessed")


def check_annotations(ctx, result, result_root):
    for artifact in result["artifacts"]:
        with Image.open(result_root / artifact["path"]) as image:
            image.load()
            ctx.expect(image.size == (artifact["width"], artifact["height"]), "PNG dimensions match manifest")
            flags = artifact["annotations"]
            if flags["json"]:
                sidecar = load_json(result_root / flags["path"])
                ctx.expect(sidecar["image_sha256"] == artifact["sha256"], "Sidecar names exact PNG bytes")
                ctx.expect(sidecar["views"] == artifact["views"], "Raster and JSON share view lineage")
                for annotation in sidecar["records"]:
                    view = next(v for v in artifact["views"] if v["view_id"] == annotation["view_id"])
                    x, y, width, height = view["panel"]
                    if annotation["kind"] != "camera_title":
                        ctx.expect(annotation["kind"] in ("measurement", "diagnostic"), "Named annotation record has explicit provenance")
                        if annotation["kind"] == "measurement":
                            metric = next(m for m in result["metrics"] if m["id"] == annotation["provenance"]["metric_id"])
                            ctx.expect(metric["value"] == annotation["provenance"]["value"], "Callout uses clean measured value")
                        continue
                    ctx.expect(annotation["anchor"] == [x+12, y+8], "Title anchor maps into final image")
                    camera = annotation["provenance"]["camera"]
                    ctx.expect(camera == view["camera"] and camera["projection"] == "orthographic", "Title derives from resolved camera")
                    if flags["inline"]:
                        from crafty_cad.render import PANEL, INK
                        expected = Image.new("RGB", (width, ctx.settings.title_height), PANEL)
                        draw = ImageDraw.Draw(expected)
                        draw.multiline_text((12,8), annotation["text"], font=ImageFont.truetype(ctx.settings.font,15), fill=INK, spacing=4)
                        actual = image.crop((x,y,x+width,y+ctx.settings.title_height))
                        ctx.expect(expected.tobytes() == actual.tobytes(), "Exact normalized JSON text/positions match raster title")


for layout in ("separate", "grid", "both"):
    for mode, flags in [("json", {"json": True, "inline": False}), ("inline", {"json": False, "inline": True}),
                        ("both", {"json": True, "inline": True})]:
        def views(ctx, layout=layout, flags=flags):
            folder, request = cap_request(ctx)
            request["metrics"] = []
            individual = [png("iso", flags=flags), png("bottom", preset="bottom", flags=flags), png("side", preset="front", flags=flags)]
            request["outputs"] = individual if layout == "separate" else [grid(flags)] if layout == "grid" else individual + [grid(flags)]
            result, code = ctx.evaluate(ctx.runtime(), folder, request)
            ready(ctx, result, code)
            check_annotations(ctx, result, ctx.results[-1].parent)
            ctx.expect([a["id"] for a in result["artifacts"]] == [o["id"] for o in request["outputs"]], "Declared output ordering preserved")
            for artifact in result["artifacts"]:
                if artifact["id"] == "grid":
                    ctx.expect([v["view_id"] for v in artifact["views"]] == ["isometric", "bottom", "front"], "Grid order preserved")
                    ctx.expect([v["panel"][:2] for v in artifact["views"]] == [[12,12],[664,12],[12,504]], "Final panel coordinates follow fixed cells")
        case("views", f"{layout}-{mode}")(views)


@case("views", "presets-and-annotation-framing")
def all_presets(ctx):
    folder, request = cap_request(ctx)
    runtime = ctx.runtime()
    request["outputs"] = [grid(presets=("isometric", "top", "bottom", "front", "right"))]
    request["metrics"] = []
    images = []
    for mode, flags in [("json", {"json": True, "inline": False}), ("both", {"json": True, "inline": True})]:
        request["outputs"][0]["annotations"] = flags
        result, code = ctx.evaluate(runtime, folder, request, mode)
        ready(ctx, result, code)
        images.append((Image.open(ctx.results[-1].parent/result["artifacts"][0]["path"]), result["artifacts"][0]))
    for a, b in zip(images[0][1]["views"], images[1][1]["views"]):
        ctx.expect(a["camera"] == b["camera"] and a["viewport"] == b["viewport"], "Annotation flags do not alter camera or framing")
        x,y,w,h = a["viewport"]
        ctx.expect(images[0][0].crop((x,y,x+w,y+h)).tobytes() == images[1][0].crop((x,y,x+w,y+h)).tobytes(), "Geometry pixels agree across annotation modes")
    for image, _ in images:
        image.close()


for phase in ("view", "composition", "sidecar"):
    def view_failure(ctx, phase=phase):
        def fault(at, identity):
            selected = "grid:bottom" if phase == "view" else "grid"
            if at == phase and identity == selected:
                raise OSError(f"injected {phase} write/render failure")
        folder, request = cap_request(ctx)
        request["outputs"] = [png(), grid()]
        result, code = ctx.evaluate(ctx.runtime(fault=fault), folder, request)
        ctx.expect(code == 0, "Independent output failure preserves completed orchestration")
        ctx.expect(result["artifacts"][0]["status"] == "ready", "Independent individual PNG preserved")
        artifact = result["artifacts"][1]
        if phase == "composition":
            ctx.expect(artifact["status"] == "error" and "path" not in artifact, "Failed composition exposes no ready file")
        elif phase == "sidecar":
            ctx.expect(artifact["status"] == "ready" and artifact["annotations"]["status"] == "error", "Ready PNG survives sidecar failure")
        else:
            ctx.expect(artifact["status"] == "ready" and [v["status"] for v in artifact["views"]] == ["ready", "error", "ready"], "Failed panel keeps its slot and status")
            check_annotations(ctx, result, ctx.results[-1].parent)
    case("views", "failed-"+phase, "intended_negative")(view_failure)


@case("exports", "requested-only-and-clean-reopen")
def export_roundtrip(ctx):
    folder, request = cap_request(ctx)
    runtime = ctx.runtime()
    request["outputs"] = [png()]
    first, code = ctx.evaluate(runtime, folder, request, "images")
    ready(ctx, first, code)
    ctx.expect(not list((ctx.root/"images").rglob("*.step")), "Images query did not export STEP")
    request.pop("source")
    request["parameters"] = {}
    request["geometry"] = {"handle": first["geometry"]["handle"]}
    request["outputs"] = []
    second, code = ctx.evaluate(runtime, folder, request, "metrics")
    ready(ctx, second, code)
    ctx.expect(not list((ctx.root/"metrics").rglob("*.png")) and not list((ctx.root/"metrics").rglob("*.step")), "Metrics-only query exports no public files")
    request["outputs"] = [{"id": "cap", "kind": "step", "parts": ["cap"]}]
    third, code = ctx.evaluate(runtime, folder, request, "step")
    ready(ctx, third, code)
    report = load_json(ctx.root/"step"/third["artifacts"][0]["comparison"]["path"])
    ctx.expect(report["passed"] and all(report["checks"].values()), "Clean STEP reopen passes units, validity, count, bounds and volume")
    ctx.expect(runtime.counts["source_executions"] == 1, "On-demand export shares original frozen geometry")


@case("exports", "failed-export-preserves-evidence", "intended_negative")
def failed_export(ctx):
    def fault(phase, identity):
        if phase == "export":
            raise OSError("injected export failure")
    folder, request = cap_request(ctx)
    request["outputs"] = [png(), {"id": "step", "kind": "step", "parts": ["cap"]}, png("bottom", preset="bottom")]
    result, code = ctx.evaluate(ctx.runtime(fault=fault), folder, request)
    ctx.expect(code == 0 and [a["status"] for a in result["artifacts"]] == ["ready", "error", "ready"], "Independent images survive failed export")
    ctx.expect(all(m["status"] == "pass" for m in result["metrics"] if m["criterion"]), "Independent checks remain available")


@case("reuse", "ensure-query-restore")
def reuse(ctx):
    folder, request = cap_request(ctx)
    runtime = ctx.runtime()
    atomic_json(folder / "ensure.json", request)
    ensured = runtime.ensure_geometry(folder/"ensure.json")
    handle = ensured["handle"]
    before = runtime.inspect_geometry(handle)
    same = runtime.ensure_geometry(folder/"ensure.json")
    ctx.expect(same["handle"] == handle, "Ensure returns existing live state")
    request.pop("source")
    request["parameters"] = {}
    request["geometry"] = {"handle": handle}
    for name, artifacts in [("images", [png()]), ("metrics", []), ("camera", [png("top", preset="top")]),
                             ("step", [{"id": "step", "kind": "step", "parts": ["cap"]}])]:
        request["outputs"] = artifacts
        if name == "camera":
            request["outputs"][0]["view"]["span_mm"] = 70
            request["metrics"][2]["criterion"]["equals"] = 39
        result, code = ctx.evaluate(runtime, folder, request, name)
        ready(ctx, result, code)
        ctx.expect(result["geometry"]["geometry_digest"] == ensured["geometry_digest"], "Query geometry identity unchanged")
    after = runtime.inspect_geometry(handle)
    ctx.expect(before == after, "Warm queries cannot mutate geometry")
    ctx.expect(runtime.counts["source_executions"] == 1 and runtime.counts["loads"] == 1, "Exactly one build and one native parse across evidence queries")
    ctx.expect(runtime.native.call({"op": "stats"})["source_executions"] == 0, "Clean verifier executes no source")
    build_logs = list(runtime.directory.rglob("build.log"))
    ctx.expect(sum(p.read_text().count("CRAFTY_FIXTURE_BUILD cap") for p in build_logs) == 1, "Instrumented source body executed once")
    released = runtime.release_geometry(handle)
    ctx.expect(released["status"] == "released", "Release is explicit")
    stale, code = ctx.evaluate(runtime, folder, request, "released")
    ctx.expect(code == 1 and stale["execution"]["reason"] == "geometry_unavailable", "Released handle cannot silently rebuild")
    snapshot = Path(ensured["snapshot_path"])
    restore_request = {**request, "geometry": {"path": snapshot.relative_to(ctx.root).as_posix()}, "outputs": []}
    atomic_json(ctx.root/"restore.json", restore_request)
    runtime.restart()
    restored = runtime.ensure_geometry(ctx.root/"restore.json")
    ctx.expect(restored["handle"] != handle and restored["geometry_digest"] == ensured["geometry_digest"], "Snapshot restoration returns new handle for same geometry")
    ctx.expect(runtime.counts["source_executions"] == 1 and runtime.counts["restores"] == 1, "Restore executes source zero times")
    fresh = ctx.runtime()
    other = fresh.ensure_geometry(ctx.root/"restore.json")
    ctx.expect(fresh.counts["source_executions"] == 0 and fresh.counts["restores"] == 1, "New supervisor restores snapshot with no source execution")


@case("reuse", "scope-expiry-pins-and-restart", "intended_negative")
def lifetime(ctx):
    folder, request = cap_request(ctx)
    request["outputs"] = []
    atomic_json(folder/"ensure.json", request)
    runtime = ctx.runtime(settings=replace(ctx.settings, idle_seconds=0.2))
    ensured = runtime.ensure_geometry(folder/"ensure.json", scope="owner")
    handle = ensured["handle"]
    for scope in ("other",):
        try:
            runtime.inspect_geometry(handle, scope=scope)
        except CadError as exc:
            ctx.expect(exc.code == "geometry_unavailable" and "snapshot_path" not in exc.details, "Wrong scope cannot use handle or discover private snapshot path")
        else:
            ctx.expect(False, "Wrong-scope access accepted")
    time.sleep(0.25)
    try:
        runtime.inspect_geometry(handle, scope="owner")
    except CadError as exc:
        ctx.expect(exc.details["reason"] == "expired" and "snapshot_path" in exc.details, "Expiry explicitly preserves known snapshot reference")
    else:
        ctx.expect(False, "Expired handle remained usable")
    runtime.restart()
    try:
        runtime.inspect_geometry(handle, scope="owner")
    except CadError as exc:
        ctx.expect(exc.code == "geometry_unavailable", "Runtime replacement invalidates previous generation")


@case("reuse", "changed-source-bytes")
def changed_source(ctx):
    folder, request = ctx.input("cylinder")
    runtime = ctx.runtime()
    request["metrics"] = [scalar("width", "bbox_extent", "body", "mm", 20, axis="x")]
    first, _ = ctx.evaluate(runtime, folder, request, "first")
    source = folder/"model.py"
    source.write_text(source.read_text().replace('parameters["radius_mm"]', 'parameters["radius_mm"] - 1'))
    second, _ = ctx.evaluate(runtime, folder, request, "changed")
    ctx.expect(first["geometry"]["build_key"] != second["geometry"]["build_key"], "Same filename with changed bytes changes build identity")
    ctx.expect(runtime.counts["source_executions"] == 2 and second["metrics"][0]["value"] == 18, "Changed source executes explicitly and changes measured geometry")


for name, source, reason in [
    ("invalid-python", "def build(:\n", "build_error"),
    ("build-exception", "def build(parameters, inputs):\n    raise ValueError('deliberate build exception')\n", "build_error"),
    ("empty-geometry", "def build(parameters, inputs):\n    import Part\n    return {'parts': {'empty': Part.Shape()}, 'features': {}}\n", "build_error"),
    ("return-contract", "def build(parameters, inputs):\n    return {'claimed_pass': True}\n", "build_error"),
]:
    def bad_source(ctx, source=source, reason=reason):
        folder, request = ctx.input("cylinder")
        (folder/"model.py").write_text(source)
        request["outputs"] = [png(part="body")]
        request["metrics"] = [scalar("v", "volume", "body", "mm^3", 1)]
        result, code = ctx.evaluate(ctx.runtime(), folder, request)
        ctx.expect(code == 1 and result["execution"]["reason"] == reason, "Build failure remains a failed execution", reason, result["execution"].get("reason"))
        ctx.expect(result["metrics"][0]["status"] == "unavailable" and result["artifacts"][0]["status"] == "unavailable", "Dependent work has explicit unavailability")
        ctx.expect((ctx.results[-1].parent/"frozen/source/model.py").read_text() == source, "Failed build retains exact submitted source")
    case("failures", name, "intended_negative")(bad_source)


@case("failures", "path-and-digest-rejection", "intended_negative")
def rejected_input(ctx):
    folder, request = ctx.input("cylinder")
    runtime = ctx.runtime()
    for name, source in [("escape", "../model.py"), ("absolute", "/etc/passwd")]:
        request["source"] = source
        result, code = ctx.evaluate(runtime, folder, request, name)
        ctx.expect(code == 2 and result["execution"]["status"] == "rejected", "Invalid input finalized as rejected")
    request["source"] = "model.py"
    result, _ = ctx.evaluate(runtime, folder, request, "build")
    snapshot = ctx.root/"build/geometry"
    (snapshot/"body.brep").write_bytes(b"tampered")
    restore = {**request, "geometry": {"path": "build/geometry/manifest.json"}, "parameters": {}}
    restore.pop("source")
    result, code = ctx.evaluate(runtime, ctx.root, restore, "tampered")
    ctx.expect(code == 2 and result["execution"]["reason"] == "digest_mismatch", "Snapshot digest failure precedes native parse")


@case("failures", "timeout-process-tree", "intended_negative")
def timeout_tree(ctx):
    folder, request = ctx.input("cylinder")
    source = """def build(parameters, inputs):
    import subprocess, time, os
    child = subprocess.Popen(['/usr/bin/sleep', '120'])
    print('CHILD_PID=' + str(child.pid), flush=True)
    time.sleep(120)
"""
    (folder/"model.py").write_text(source)
    runtime = ctx.runtime(settings=replace(ctx.settings, wall_seconds=0.6))
    result, code = ctx.evaluate(runtime, folder, request)
    ctx.expect(code == 1 and result["execution"]["reason"] == "timeout", "Wall-time limit stops source process tree")
    ctx.expect(result["execution"]["duration_seconds"] < 3, "Timeout cleanup is bounded")
    logs = list(runtime.directory.rglob("build.log"))
    pid = int(logs[0].read_text().split("CHILD_PID=")[1].splitlines()[0])
    stat = Path(f"/proc/{pid}/stat")
    ctx.expect(not stat.exists(), "Descendant is terminated and reaped after timeout")


@case("failures", "cancel-query-keeps-geometry", "intended_negative")
def cancel_query(ctx):
    folder, request = cap_request(ctx)
    local_cancel = threading.Event()
    def fault(phase, identity):
        if phase == "view":
            local_cancel.set()
    runtime = ctx.runtime(fault=fault)
    atomic_json(folder/"ensure.json", request)
    ensured = runtime.ensure_geometry(folder/"ensure.json")
    request.pop("source")
    request["geometry"] = {"handle": ensured["handle"]}
    request["outputs"] = [png()]
    atomic_json(folder/"query.json", request)
    path, code = runtime.evaluate_geometry(ensured["handle"], folder/"query.json", ctx.root/"cancelled", cancel=local_cancel)
    ctx.results.append(path)
    result = load_json(path)
    ctx.expect(code == 1 and result["execution"]["status"] == "cancelled", "Query cancellation is explicit")
    runtime.fault = lambda *_: None
    request["outputs"] = []
    result, code = ctx.evaluate(runtime, folder, request, "after-cancel")
    ready(ctx, result, code)
    ctx.expect(runtime.counts["source_executions"] == 1 and runtime.counts["loads"] == 1, "Cooperative cancellation preserves loaded immutable geometry")


@case("failures", "pins-and-deferred-release", "intended_negative")
def pinned_release(ctx):
    folder, request = cap_request(ctx)
    runtime = ctx.runtime()
    atomic_json(folder/"ensure.json", request)
    ensured = runtime.ensure_geometry(folder/"ensure.json")
    handle = ensured["handle"]
    observed = []
    def fault(phase, identity):
        if phase == "view" and not observed:
            observed.append(runtime.release_geometry(handle))
    runtime.fault = fault
    request.pop("source")
    request["geometry"] = {"handle": handle}
    request["outputs"] = [png()]
    result, code = ctx.evaluate(runtime, folder, request, "pinned")
    ready(ctx, result, code)
    ctx.expect(observed[0]["status"] == "deferred" and observed[0]["active_uses"] == 1, "Pinned geometry cannot be released during query")
    result, code = ctx.evaluate(runtime, folder, request, "released")
    ctx.expect(code == 1 and result["execution"]["reason"] == "geometry_unavailable", "Deferred release takes effect after pin clears")


@case("failures", "interrupted-finalization", "intended_negative")
def finalization(ctx):
    def fault(phase, identity):
        if phase == "finalization":
            raise OSError("injected interruption before result rename")
    folder, request = ctx.input("cylinder")
    request["outputs"] = [png(part="body")]
    runtime = ctx.runtime(fault=fault)
    atomic_json(folder/"request.json", request)
    try:
        runtime.evaluate(folder/"request.json", ctx.root/"interrupted")
    except OSError:
        ctx.expect(not (ctx.root/"interrupted/result.json").exists(), "Interrupted finalization has no success manifest")
        ctx.expect((ctx.root/"interrupted/artifacts/iso.png").is_file(), "Completed evidence survives finalization interruption")
    else:
        ctx.expect(False, "Injected finalization failure was ignored")
    runtime.fault = lambda *_: None
    result, code = ctx.evaluate(runtime, folder, request, "retry")
    ready(ctx, result, code)
    try:
        runtime.evaluate(folder/"request.json", ctx.root/"retry")
    except FileExistsError:
        ctx.expect(True, "Existing finalized result directory cannot be reused")
    else:
        ctx.expect(False, "Existing result overwritten")


@case("failures", "source-cannot-author-criteria", "intended_negative")
def source_authority(ctx):
    folder, request = ctx.input("cylinder")
    (folder/"model.py").write_text("""def build(parameters, inputs):
    import Part, json
    with open('result.json', 'w') as stream:
        json.dump({'execution': {'status': 'completed'}, 'claimed_pass': True}, stream)
    return {'parts': {'body': Part.makeCylinder(9,20)}, 'features': {}}
""")
    request["metrics"] = [scalar("width", "bbox_extent", "body", "mm", 20, axis="x")]
    result, code = ctx.evaluate(ctx.runtime(), folder, request)
    ctx.expect(code == 0 and result["metrics"][0]["status"] == "fail" and result["metrics"][0]["value"] == 18,
               "Supervisor criteria use clean measured geometry despite source-authored report")
    ctx.expect("claimed_pass" not in result, "Generated result text is not authoritative")


@case("failures", "output-and-process-budgets", "intended_negative")
def budgets(ctx):
    for name, source, settings, reasons in [
        ("output-limit", "def build(parameters,inputs):\n    open('huge','wb').write(b'x' * 2000000)\n", replace(ctx.settings, output_bytes=1000000), {"build_error", "output_limit"}),
        ("process-limit", "", ctx.settings, set()),
    ]:
        if name == "process-limit":
            source = "def build(parameters,inputs):\n    import subprocess,time\n    children=[subprocess.Popen(['/usr/bin/sleep','120']) for i in range(5)]\n    time.sleep(120)\n"
            settings = replace(ctx.settings, process_count=3)
            reasons = {"process_limit"}
        folder, request = ctx.input("cylinder")
        (folder/"model.py").write_text(source)
        result, code = ctx.evaluate(ctx.runtime(settings=settings), folder, request, name)
        ctx.expect(code == 1 and result["execution"]["reason"] in reasons, "Effective native resource budget enforced: " + name, list(reasons), result["execution"].get("reason"))


def cli(ctx, args, env=None):
    return subprocess.run([sys.executable, "-m", "crafty_cad.harness", "run", *args],
        cwd=CAD_ROOT, env={**os.environ, **(env or {})}, capture_output=True, text=True, timeout=20)


@case("failures", "harness-outcomes-and-json", "intended_negative", native=False)
def harness_outcomes(ctx):
    for name, args, expected, classification, env in [
        ("good", ["--suite", "diagnostic", "--case", "good"], 0, "expected_good", {}),
        ("negative", ["--suite", "diagnostic", "--case", "negative"], 0, "intended_negative", {}),
        ("unexpected", ["--suite", "diagnostic", "--case", "unexpected"], 1, "unexpected_failure", {}),
        ("empty", ["--suite", "contract", "--case", "does-not-exist"], 2, "invalid_setup", {}),
        ("missing", ["--suite", "geometry", "--case", "cylinder"], 2, "missing_prerequisite", {"CRAFTY_NATIVE_PYTHON": "/nonexistent/python"}),
    ]:
        run = cli(ctx, [*args, "--json", "--output", str(ctx.root/name)], env)
        summary = json.loads(run.stdout)
        ctx.expect(run.returncode == expected, "Harness preserves direct CLI exit code: " + name, expected, run.returncode)
        ctx.expect(summary["cases"][0]["classification"] == classification, "Retained harness outcome classification: " + name)
        ctx.expect((ctx.root/name/"index.html").is_file(), "Failure/success gallery retained")


@case("failures", "harness-interruption", "intended_negative", native=False)
def harness_interrupt(ctx):
    directory = ctx.root/"cancelled-harness"
    process = subprocess.Popen([sys.executable, "-m", "crafty_cad.harness", "run", "--suite", "diagnostic",
        "--case", "wait", "--json", "--output", str(directory)], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, cwd=CAD_ROOT)
    deadline = time.monotonic()+5
    while not (directory/"diagnostic/wait/started").exists() and time.monotonic() < deadline:
        time.sleep(.02)
    process.send_signal(signal.SIGINT)
    stdout, stderr = process.communicate(timeout=10)
    summary = json.loads(stdout)
    ctx.expect(process.returncode == 130 and summary["exit_code"] == 130, "Harness interruption preserves exit 130")
    ctx.expect(summary["cases"][0]["classification"] == "interrupted", "Interrupted outcome retained")


@case("diagnostic", "good", native=False)
def diagnostic_good(ctx):
    ctx.expect(True, "Harness expected-good control")


@case("diagnostic", "negative", "intended_negative", False)
def diagnostic_negative(ctx):
    result = compare(scalar("width", "bbox_extent", "body", "mm", 20, axis="x"), {"value": 18, "status": "measured"})
    ctx.expect(result["status"] == "fail", "Harness intended-negative control observes failed metric")


@case("diagnostic", "unexpected", native=False)
def diagnostic_unexpected(ctx):
    ctx.expect(False, "Deliberate unexpected assertion failure to verify harness classification")


@case("diagnostic", "wait", native=False)
def diagnostic_wait(ctx):
    (ctx.root/"started").write_text("ready")
    while not ctx.cancel.wait(.02):
        pass
    raise KeyboardInterrupt


@case('exports', 'reopen-rejects-wrong-unit', 'intended_negative')
def wrong_step_unit(ctx):
    def fault(phase, identity):
        if phase == 'step_candidate':
            path = Path(identity)
            path.write_text(path.read_text().replace('.MILLI.', '.CENTI.'))
    folder, request = cap_request(ctx)
    request['outputs'] = [png(), {'id': 'step', 'kind': 'step', 'parts': ['cap']}]
    result, code = ctx.evaluate(ctx.runtime(fault=fault), folder, request)
    ctx.expect(code == 0 and result['artifacts'][0]['status'] == 'ready', 'PNG survives failed STEP gate')
    artifact = result['artifacts'][1]
    ctx.expect(artifact['status'] == 'error' and 'path' not in artifact, 'Wrong-unit STEP cannot become ready')
    comparison = load_json(ctx.results[-1].parent / artifact['comparison']['path'])
    ctx.expect(not comparison['passed'] and not comparison['checks']['units_mm'], 'Actual clean reopen detects changed length unit')


@case('reuse', 'cache-count-memory-and-idle', 'intended_negative')
def cache_bounds(ctx):
    folder, request = ctx.input('cylinder')
    runtime = ctx.runtime(settings=replace(ctx.settings, cache_entries=1, idle_seconds=0.3))
    atomic_json(folder/'ensure.json', request)
    first = runtime.ensure_geometry(folder/'ensure.json')
    request['parameters']['radius_mm'] = 9
    atomic_json(folder/'second.json', request)
    second = runtime.ensure_geometry(folder/'second.json')
    try:
        runtime.inspect_geometry(first['handle'])
    except CadError as exc:
        ctx.expect(exc.code == 'geometry_unavailable', 'Cache-count eviction invalidates old handle')
    else:
        ctx.expect(False, 'Old cache handle was not evicted')
    time.sleep(0.6)
    ctx.expect(not runtime.entries[second['handle']].native_loaded, 'Idle expiry unloads native shape without another query')
    tiny = ctx.runtime(settings=replace(ctx.settings, cache_bytes=1))
    try:
        tiny.ensure_geometry(folder/'ensure.json')
    except CadError as exc:
        ctx.expect(exc.code == 'memory_limit', 'Oversized geometry cannot remain in cache')
    else:
        ctx.expect(False, 'Geometry ignored cache memory bound')


@case('failures', 'forced-native-cancel-and-recovery', 'intended_negative')
def forced_cancel(ctx):
    folder, request = cap_request(ctx)
    runtime = ctx.runtime()
    atomic_json(folder/'ensure.json', request)
    ensured = runtime.ensure_geometry(folder/'ensure.json')
    handle = ensured['handle']
    request.pop('source')
    request['geometry'] = {'handle': handle}
    request['outputs'] = []
    atomic_json(folder/'query.json', request)
    os.kill(runtime.native.process.pid, signal.SIGSTOP)
    cancel = threading.Event()
    timer = threading.Timer(0.1, cancel.set)
    timer.start()
    path, code = runtime.evaluate_geometry(handle, folder/'query.json', ctx.root/'forced-cancel', cancel=cancel)
    timer.join()
    ctx.results.append(path)
    ctx.expect(code == 1 and load_json(path)['execution']['status'] == 'cancelled', 'Unresponsive native query is terminated on cancellation')
    ctx.expect(runtime.native is None, 'Killed retained process cannot continue serving handles')
    request['geometry'] = {'path': Path(ensured['snapshot_path']).relative_to(ctx.root).as_posix()}
    atomic_json(ctx.root/'restore.json', request)
    restored = runtime.ensure_geometry(ctx.root/'restore.json')
    ctx.expect(restored['handle'] != handle and runtime.counts['source_executions'] == 1, 'Forced native cancellation recovers explicitly without source execution')


@case('failures', 'declared-inputs-and-ambient-dependencies', 'intended_negative')
def declared_input(ctx):
    folder, request = ctx.input('cylinder')
    (folder/'radius.txt').write_text('10')
    request['inputs'] = {'radius': 'radius.txt'}
    (folder/'model.py').write_text("def build(parameters,inputs):\n    import Part\n    return {'parts': {'body': Part.makeCylinder(float(open(inputs['radius']).read()),20)}, 'features': {}}\n")
    request['metrics'] = [scalar('width', 'bbox_extent', 'body', 'mm', 20, axis='x')]
    runtime = ctx.runtime()
    first, code = ctx.evaluate(runtime, folder, request, 'declared')
    ready(ctx, first, code)
    (folder/'radius.txt').write_text('9')
    second, code = ctx.evaluate(runtime, folder, request, 'changed-input')
    ctx.expect(second['metrics'][0]['value'] == 18 and first['geometry']['build_key'] != second['geometry']['build_key'], 'Changed declared input bytes change frozen build identity')
    (folder/'model.py').write_text("def build(parameters,inputs):\n    open('/etc/hostname').read()\n")
    result, code = ctx.evaluate(runtime, folder, request, 'ambient')
    ctx.expect(code == 1 and 'Undeclared model file dependency' in result['execution']['message'], 'Ordinary undeclared ambient file read is rejected')


@case('failures', 'native-memory-cpu-and-bounded-logs', 'intended_negative')
def native_limits(ctx):
    sources = [
        ('memory', "def build(parameters,inputs):\n    data=bytearray(2*1024*1024*1024)\n", replace(ctx.settings, memory_bytes=256*1024*1024)),
        ('cpu', "def build(parameters,inputs):\n    while True: pass\n", replace(ctx.settings, cpu_seconds=1, wall_seconds=4)),
        ('logs', "def build(parameters,inputs):\n    print('x'*400000,flush=True)\n    raise ValueError('after log flood')\n", replace(ctx.settings, log_bytes=2048)),
    ]
    for name, source, settings in sources:
        folder, request = ctx.input('cylinder')
        (folder/'model.py').write_text(source)
        runtime = ctx.runtime(settings=settings)
        result, code = ctx.evaluate(runtime, folder, request, name)
        ctx.expect(code == 1 and result['execution']['status'] == 'failed', 'Native limit produces retained failure: ' + name)
        ctx.expect(all(p.stat().st_size <= settings.log_bytes for p in runtime.directory.rglob('*.log')), 'Native logs remain bounded')


@case('views', 'different-panel-sizes-and-depth-edge')
def varied_views(ctx):
    folder, request = cap_request(ctx)
    requested = grid()
    requested['grid']['views'][0].update(width=800, height=600)
    request['outputs'] = [requested]
    result, code = ctx.evaluate(ctx.runtime(), folder, request)
    ready(ctx, result, code)
    artifact = result['artifacts'][0]
    ctx.expect([v['panel'] for v in artifact['views']] == [[12,12,800,600],[824,12,640,480],[12,624,640,480]], 'Grid uses largest fixed cell without resizing requested panels')
    image = Image.open(ctx.results[-1].parent/artifact['path'])
    view = artifact['views'][1]
    x,y,w,h = view['viewport']
    cx,cy = x+w//2,y+h//2
    radius = round(18/view['camera']['span_mm'][0]*w)
    pixels = [image.getpixel((cx+dx,cy)) for dx in range(radius-3, radius+4)]
    ctx.expect((29,69,90) in pixels, 'Bottom PNG exposes actual bore depth boundary')
    image.close()


@case('contract', 'trial-collector-freeze-and-missing-agent', 'intended_negative', False)
def collector_contract(ctx):
    from crafty_cad.trial import prepared, locked
    root = ctx.root/'collector-control-no-agent'
    state = prepared(root)
    ctx.expect(state['budget'] == {'max_evaluations': 8, 'seconds': 1200}, 'Correction trial defaults are bounded')
    ctx.expect(state['started_at'] is None and not state['iterations'], 'Preparation launches no agent or evaluation')
    run = subprocess.run([sys.executable, '-m', 'crafty_cad.trial', 'verify', '--trial', str(root)], capture_output=True, text=True)
    ctx.expect(run.returncode == 2 and json.loads(run.stdout)['outcome'] == 'missing_prerequisite', 'Missing separate agent evidence cannot pass')
    (root/'frozen/criteria.json').write_text('[]')
    try:
        with locked(root):
            pass
    except CadError as exc:
        ctx.expect(exc.code == 'digest_mismatch', 'Collector rejects changed external criteria')
    else:
        ctx.expect(False, 'Collector accepted changed criteria')


@case('failures', 'collector-public-cli-negative-and-budget', 'intended_negative')
def collector_public(ctx):
    from crafty_cad.trial import prepared, evaluate
    root = ctx.root/'collector-control-no-agent'
    prepared(root, max_evaluations=1)
    iteration, code = evaluate(root, root/'workspace/model.py', False)
    result_path = root/iteration['result']['path']
    ctx.results.append(result_path)
    result = load_json(result_path)
    ctx.expect(code == 0 and result['execution']['status'] == 'completed', 'Public CLI returns 0 for completed failing criteria')
    ctx.expect(any(m['status'] == 'fail' for m in result['metrics']), 'Original wrong cap fails immutable criteria')
    ctx.expect((root/'iterations/001/stdout.log').read_text().strip() == str(result_path), 'Public evaluator stdout is only its result path')
    try:
        evaluate(root, root/'workspace/model.py', False)
    except CadError as exc:
        ctx.expect(exc.code == 'budget_exhausted', 'Collector enforces reserved evaluation count')
    else:
        ctx.expect(False, 'Collector exceeded its budget')
    ctx.expect(load_json(root/'trial.json')['state'] == 'exhausted', 'Exhaustion is recorded without claiming an agent correction')


@case('failures', 'malformed-native-response', 'intended_negative')
def malformed_native(ctx):
    folder, request = cap_request(ctx)
    runtime = ctx.runtime()
    atomic_json(folder/'ensure.json', request)
    ensured = runtime.ensure_geometry(folder/'ensure.json')
    request.pop('source')
    request['geometry'] = {'handle': ensured['handle']}
    request['outputs'] = []
    call = runtime.native.call
    def malformed(job, *args, **kwargs):
        if job['op'] == 'metrics':
            return {'metrics': []}
        return call(job, *args, **kwargs)
    runtime.native.call = malformed
    result, code = ctx.evaluate(runtime, folder, request)
    ctx.expect(code == 1 and result['execution']['reason'] == 'malformed_native_output', 'Malformed native response cannot silently omit requested metrics')
    ctx.expect(len(result['metrics']) == len(request['metrics']) and all(m['status'] == 'unavailable' for m in result['metrics']), 'Every interrupted metric remains represented')


@case('geometry', 'invalid-topology', 'intended_negative')
def invalid_topology(ctx):
    folder, request = ctx.input('cylinder')
    (folder/'model.py').write_text("def build(parameters,inputs):\n    import Part, FreeCAD as A\n    points=[A.Vector(*p) for p in [(0,0,0),(10,10,0),(0,10,0),(10,0,0),(0,0,0)]]\n    shape=Part.Face(Part.makePolygon(points))\n    return {'parts': {'body': shape}, 'features': {}}\n")
    request['metrics'] = [scalar('valid', 'validity', 'body', '1', True), scalar('solids', 'solid_count', 'body', '1', 1), scalar('volume', 'volume', 'body', 'mm^3', 1)]
    result, code = ctx.evaluate(ctx.runtime(), folder, request)
    ctx.expect(code == 0 and [m['status'] for m in result['metrics']] == ['fail','fail','unavailable'], 'Actual invalid topology fails validity/count and has no invented solid volume')
    ctx.expect(result['metrics'][0]['value'] is False, 'Native validity reports false from persisted geometry')
