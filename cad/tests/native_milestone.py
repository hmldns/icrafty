"""First native gate, kept runnable separately from the expanding suite harness."""

import argparse
import json
import math
from pathlib import Path
import shutil

from crafty_cad.files import CadError, atomic_json, load_json
from crafty_cad.runtime import GeometryRuntime


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    root = args.output.resolve()
    root.mkdir(parents=True, exist_ok=False)
    source = root / "model.py"
    shutil.copyfile(Path(__file__).resolve().parents[1] / "fixtures/placed-cylinder/model.py", source)
    request = {"schema_version": 1, "source": "model.py", "parameters": {}, "inputs": {},
               "outputs": [], "metrics": []}
    atomic_json(root / "build.json", request)
    with GeometryRuntime(root / "runtime") as runtime:
        ensured = runtime.ensure_geometry(root / "build.json", scope="milestone")
        handle = ensured["handle"]
        baseline = runtime.inspect_geometry(handle, scope="milestone")
        request.pop("source")
        request["geometry"] = {"handle": handle}
        request["metrics"] = [
            {"id": "diameter", "kind": "cylinder_diameter", "target": {"part": "body", "feature": "side"},
             "unit": "mm", "criterion": {"equals": 20, "absolute_tolerance": 0.001}},
            {"id": "height", "kind": "distance", "target": {"part": "body", "feature": "upper"},
             "other_target": {"part": "body", "feature": "lower"}, "unit": "mm",
             "criterion": {"equals": 20, "absolute_tolerance": 0.001}},
            {"id": "volume", "kind": "volume", "target": {"part": "body"}, "unit": "mm^3",
             "criterion": {"equals": 2000*math.pi, "absolute_tolerance": 0.001}},
            {"id": "area", "kind": "surface_area", "target": {"part": "body"}, "unit": "mm^2",
             "criterion": {"equals": 600*math.pi, "absolute_tolerance": 0.001}},
            {"id": "centroid", "kind": "centroid", "target": {"part": "body"}, "unit": "mm"},
            {"id": "foreign", "kind": "cylinder_diameter", "target": {"part": "body", "feature": "foreign"}, "unit": "mm"},
        ]
        outputs = []
        for index, artifacts in enumerate([
            [{"id": "iso", "kind": "png", "parts": ["body"],
              "view": {"preset": "isometric", "width": 800, "height": 600}}],
            [{"id": "top", "kind": "png", "parts": ["body"],
              "view": {"preset": "top", "width": 800, "height": 600, "span_mm": 55}}],
            [{"id": "part", "kind": "step", "parts": ["body"]}],
        ]):
            request["outputs"] = artifacts
            path = root / f"query-{index}.json"
            atomic_json(path, request)
            result, code = runtime.evaluate_geometry(handle, path, root / f"query-{index}", scope="milestone")
            report = load_json(result)
            assert code == 0, report["execution"]
            assert all(a["status"] == "ready" for a in report["artifacts"]), report["artifacts"]
            assert [m["status"] for m in report["metrics"]] == ["pass"]*4 + ["measured", "unavailable"], report["metrics"]
            outputs.append(str(result))
        after = runtime.inspect_geometry(handle, scope="milestone")
        assert after == baseline, "Query mutated retained BRep or placement"
        expected_center = [7, -9, 3+10*math.cos(math.pi/6)]
        assert all(abs(a-b) < 1e-8 for a, b in zip(baseline["baseline"]["body"]["centroid"], expected_center))
        assert runtime.counts["source_executions"] == 1 and runtime.counts["loads"] == 1
        native_counts = runtime.native.call({"op": "stats"})
        assert native_counts["source_executions"] == 0 and native_counts["loads"] == 1
        snapshot = Path(ensured["snapshot_path"])
        runtime.restart()
        stale, code = runtime.evaluate_geometry(handle, root / "query-0.json", root / "stale", scope="milestone")
        assert code == 1 and load_json(stale)["execution"]["reason"] == "geometry_unavailable"
        request["geometry"] = {"path": snapshot.relative_to(root).as_posix()}
        request["outputs"] = []
        atomic_json(root / "restore.json", request)
        restored = runtime.ensure_geometry(root / "restore.json", scope="milestone")
        assert restored["handle"] != handle
        assert restored["geometry_digest"] == ensured["geometry_digest"]
        request["geometry"] = {"handle": restored["handle"]}
        atomic_json(root / "restored-query.json", request)
        result, code = runtime.evaluate_geometry(restored["handle"], root / "restored-query.json",
                                                 root / "restored-query", scope="milestone")
        assert code == 0 and runtime.counts["source_executions"] == 1
        assert runtime.counts["restores"] == 1 and runtime.counts["loads"] == 2
        summary = {"schema_version": 1, "status": "passed", "results": outputs+[str(stale), str(result)],
                   "baseline": baseline, "ensured": ensured, "restored": restored,
                   "clean_verifier_counts_before_restart": native_counts, **runtime.diagnostics()}
        logs = list((root / "runtime").rglob("build.log"))
        assert sum(p.read_text().count("CRAFTY_FIXTURE_BUILD placed-cylinder") for p in logs) == 1
        atomic_json(root / "summary.json", summary)
    print(root / "summary.json")


if __name__ == "__main__":
    main()
