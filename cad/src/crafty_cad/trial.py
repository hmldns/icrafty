"""Bounded evidence collector. It never launches or impersonates a correction agent."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import fcntl
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import uuid

from .contract import validate_result
from .files import CadError, atomic_bytes, atomic_json, canonical, contained, digest, load_json, read_bytes, record, verify_record
from .process import process_tree


CAD_ROOT = Path(__file__).resolve().parents[2]


def prepared(root: Path, max_evaluations: int = 8, seconds: float = 1200) -> dict:
    if not 1 <= max_evaluations <= 100 or seconds <= 0:
        raise CadError("invalid_budget", "Trial needs a positive explicit budget")
    root.mkdir(parents=True, exist_ok=False)
    (root/"workspace").mkdir()
    files = {"task.md": CAD_ROOT/"fixtures/trial-cap/TASK.md", "wrong-cap.py": CAD_ROOT/"fixtures/trial-cap/wrong-cap.py",
             "criteria.json": CAD_ROOT/"fixtures/cap/criteria.json"}
    frozen = {}
    for name, source in files.items():
        destination = root/"frozen"/name
        atomic_bytes(destination, read_bytes(source))
        frozen[name] = record(destination, root)
    atomic_bytes(root/"workspace/model.py", read_bytes(root/"frozen/wrong-cap.py"))
    state = {"schema_version": 1, "trial_id": root.name, "state": "ready", "frozen": frozen,
             "budget": {"max_evaluations": max_evaluations, "seconds": seconds}, "started_at": None,
             "iterations": [], "events": [{"event": "prepared", "time": time.time()}]}
    atomic_json(root/"trial.json", state)
    return state


@contextmanager
def locked(root):
    with (root/"collector.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise CadError("trial_busy", "Another collector operation owns this trial") from exc
        state = load_json(root/"trial.json")
        for item in state["frozen"].values():
            verify_record(root, item)
        # Verify against committed canonical criteria, not an agent-written copy.
        if digest(read_bytes(CAD_ROOT/"fixtures/cap/criteria.json")) != state["frozen"]["criteria.json"]["sha256"]:
            raise CadError("criteria_changed", "Trial criteria differ from service fixture criteria")
        yield state


def save(root, state):
    atomic_json(root/"trial.json", state)


def trial_outputs(step):
    views = [("iso", "isometric"), ("bottom", "bottom"), ("side", "front")]
    outputs = [{"id": identity, "kind": "png", "parts": ["cap"], "annotations": {"json": True, "inline": True},
                "view": {"preset": preset, "width": 800, "height": 600}} for identity, preset in views]
    outputs.append({"id": "grid", "kind": "png", "parts": ["cap"], "annotations": {"json": True, "inline": True},
                    "grid": {"columns": 2, "views": [{"id": identity, "preset": preset, "width": 640, "height": 480} for identity, preset in views]}})
    if step:
        outputs.append({"id": "cap", "kind": "step", "parts": ["cap"]})
    return outputs


def evaluate(root: Path, source: Path, step: bool) -> tuple[dict, int]:
    with locked(root) as state:
        if state["state"] in ("finished", "exhausted"):
            raise CadError("trial_closed", "Trial is already finished or exhausted")
        if state["started_at"] is None:
            state["started_at"] = time.time()
        elapsed = time.time()-state["started_at"]
        if len(state["iterations"]) >= state["budget"]["max_evaluations"] or elapsed >= state["budget"]["seconds"]:
            state["state"] = "exhausted"
            save(root, state)
            raise CadError("budget_exhausted", "Trial evaluation/time budget exhausted")
        source = source.resolve()
        if not source.is_relative_to(root/"workspace"):
            raise CadError("invalid_path", "Trial source must be in its assigned workspace")
        data = read_bytes(source)
        if not state["iterations"] and digest(data) != state["frozen"]["wrong-cap.py"]["sha256"]:
            raise CadError("baseline_changed", "First evaluation must use the original wrong source")
        if state["iterations"] and "observation" not in state["iterations"][-1]:
            raise CadError("inspection_missing", "Record inspection of the previous result before evaluating again")
        number = len(state["iterations"])+1
        directory = root/"iterations"/f"{number:03d}"
        directory.mkdir(parents=True)
        atomic_bytes(directory/"input/model.py", data)
        request = {"schema_version": 1, "source": "model.py", "parameters": {}, "inputs": {},
                   "outputs": trial_outputs(step), "metrics": load_json(root/"frozen/criteria.json")}
        atomic_json(directory/"input/request.json", request)
        command = [sys.executable, "-m", "crafty_cad", "evaluate", "--request", str(directory/"input/request.json"),
                   "--output", str(directory/"result")]
        iteration = {"iteration": number, "state": "running", "started_at": time.time(), "command": command,
                     "source": record(directory/"input/model.py", root), "request": record(directory/"input/request.json", root)}
        state["iterations"].append(iteration)
        state["state"] = "running"
        state["events"].append({"event": "evaluate", "iteration": number, "time": time.time()})
        save(root, state)
        with (directory/"stdout.log").open("w") as stdout, (directory/"stderr.log").open("w") as stderr:
            process = subprocess.Popen(command, cwd=CAD_ROOT, stdout=stdout, stderr=stderr, start_new_session=True)
            remaining = max(0.01, state["budget"]["seconds"]-(time.time()-state["started_at"]))
            try:
                exit_code = process.wait(timeout=min(remaining, 40))
            except (subprocess.TimeoutExpired, KeyboardInterrupt):
                descendants = process_tree(process.pid)
                process.send_signal(signal.SIGTERM)
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    for pid, _ in descendants:
                        try:
                            os.kill(pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                    process.wait()
                exit_code = 130
        iteration.update(exit_code=exit_code, duration_seconds=time.time()-iteration["started_at"], state="recorded")
        result_path = directory/"result/result.json"
        if result_path.is_file():
            validate_result(load_json(result_path), result_path.parent)
            iteration["result"] = record(result_path, root, "application/json")
        else:
            iteration["state"] = "interrupted"
        state["state"] = "active"
        state["events"].append({"event": "evaluated", "iteration": number, "time": time.time(), "exit_code": exit_code})
        save(root, state)
        return iteration, exit_code


def observe(root, number, notes, images):
    with locked(root) as state:
        if not 1 <= number <= len(state["iterations"]):
            raise CadError("invalid_iteration", "Unknown evaluation")
        iteration = state["iterations"][number-1]
        if "observation" in iteration:
            raise CadError("observation_exists", "Observation is immutable once recorded")
        result_path = verify_record(root, iteration["result"])
        result = load_json(result_path)
        selected = [a for a in result["artifacts"] if a["id"] in images and a["kind"] == "png" and a["status"] == "ready"]
        if not {"iso", "bottom"} <= set(images) or len(selected) != len(set(images)):
            raise CadError("images_missing", "Inspect at least the ready iso and bottom PNGs")
        text = read_bytes(notes)
        if len(text.strip()) < 20:
            raise CadError("notes_missing", "Record substantive visual and metric observations")
        destination = root/"iterations"/f"{number:03d}"/"observation.md"
        atomic_bytes(destination, text)
        iteration["observation"] = {"notes": record(destination, root, "text/markdown"),
            "images": [{"id": a["id"], "sha256": a["sha256"]} for a in selected], "result_sha256": iteration["result"]["sha256"],
            "recorded_at": time.time(), "attestation": "External correction worker reports opening these actual PNGs and reading metrics; transcript supplies tool evidence."}
        state["events"].append({"event": "observed", "iteration": number, "time": time.time()})
        save(root, state)
        return iteration["observation"]


def assessment(root, state):
    reasons = []
    iterations = state["iterations"]
    if len(iterations) < 2:
        reasons.append("Trial needs baseline evidence and an actual source revision")
    if not iterations:
        return {"outcome": "missing_prerequisite", "reasons": reasons+["No separate correction worker evaluations collected"]}, 2
    expected_metrics = load_json(root/"frozen/criteria.json")
    for iteration in iterations:
        verify_record(root, iteration["source"])
        request = load_json(verify_record(root, iteration["request"]))
        if request["metrics"] != expected_metrics:
            reasons.append("Iteration criteria changed")
        if "result" not in iteration or "observation" not in iteration:
            reasons.append(f"Iteration {iteration['iteration']} lacks finalized result or inspection evidence")
            continue
        result_path = verify_record(root, iteration["result"])
        validate_result(load_json(result_path), result_path.parent)
        verify_record(root, iteration["observation"]["notes"])
    final = iterations[-1]
    if len({i["source"]["sha256"] for i in iterations}) < 2:
        reasons.append("No source revision was collected")
    if "result" in final:
        result = load_json(verify_record(root, final["result"]))
        if result["execution"]["status"] != "completed":
            reasons.append("Final evaluation did not complete")
        expected_ids = {m["id"] for m in expected_metrics if "criterion" in m}
        passed_ids = {m["id"] for m in result["metrics"] if m["status"] == "pass"}
        if not expected_ids <= passed_ids:
            reasons.append("Final fixed criteria did not all pass")
        if not all(a["status"] == "ready" and all(v["status"] == "ready" for v in a.get("views", [])) for a in result["artifacts"]):
            reasons.append("Final requested evidence is incomplete")
        if not any(a["kind"] == "step" and a["status"] == "ready" for a in result["artifacts"]):
            reasons.append("Final validated STEP is missing")
    duration = (state.get("finished_at") or time.time()) - state["started_at"] if state["started_at"] else 0
    exhausted = duration > state["budget"]["seconds"] or len(iterations) > state["budget"]["max_evaluations"]
    if exhausted:
        reasons.append("Trial exceeded its fixed budget")
    outcome = "passed" if not reasons else "exhausted" if exhausted or len(iterations) >= state["budget"]["max_evaluations"] else "failed"
    return {"outcome": outcome, "reasons": reasons, "duration_seconds": duration, "evaluation_count": len(iterations)}, 0 if outcome == "passed" else 1


def main(argv=None):
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    prep = commands.add_parser("prepare")
    prep.add_argument("--output", required=True, type=Path)
    prep.add_argument("--max-evaluations", type=int, default=8)
    prep.add_argument("--seconds", type=float, default=1200)
    for name in ("evaluate", "observe", "finish", "verify"):
        command = commands.add_parser(name)
        command.add_argument("--trial", type=Path, default=os.environ.get("CRAFTY_CAP_TRIAL"))
        if name == "evaluate":
            command.add_argument("--source", required=True, type=Path)
            command.add_argument("--step", action="store_true")
        if name == "observe":
            command.add_argument("--iteration", type=int, required=True)
            command.add_argument("--notes", type=Path, required=True)
            command.add_argument("--images", nargs="+", required=True)
        if name == "finish":
            command.add_argument("--transcript", type=Path, required=True)
            command.add_argument("--unresolved", action="append", default=[])
    args = parser.parse_args(argv)
    try:
        if args.command == "prepare":
            prepared(args.output.resolve(), args.max_evaluations, args.seconds)
            print(args.output.resolve()/"trial.json")
            return 0
        if args.trial is None:
            output = CAD_ROOT/"runs/trials"/("missing-"+uuid.uuid4().hex[:8])
            output.mkdir(parents=True)
            atomic_json(output/"trial-result.json", {"schema_version": 1, "outcome": "missing_prerequisite",
                "reason": "Set --trial or CRAFTY_CAP_TRIAL to a separately collected correction trial; no agent was launched."})
            print(output/"trial-result.json")
            return 2
        root = args.trial.resolve()
        if args.command == "evaluate":
            result, code = evaluate(root, args.source, args.step)
        elif args.command == "observe":
            result, code = observe(root, args.iteration, args.notes, args.images), 0
        else:
            with locked(root) as state:
                if args.command == "finish":
                    if (root/"trial-result.json").exists():
                        raise CadError("trial_closed", "Final trial result is immutable")
                    text = read_bytes(args.transcript)
                    if len(text.strip()) < 20:
                        raise CadError("transcript_missing", "Separate worker transcript is required")
                    atomic_bytes(root/"transcript.md", text)
                    state.update(finished_at=time.time(), transcript=record(root/"transcript.md", root, "text/markdown"),
                                 unresolved_questions=args.unresolved, state="finished")
                    save(root, state)
                assessment_result, code = assessment(root, state)
                if "transcript" not in state:
                    assessment_result["outcome"] = "missing_prerequisite"
                    assessment_result["reasons"].append("Separate worker transcript and finish record missing")
                    code = 2
                else:
                    verify_record(root, state["transcript"])
                result = {"schema_version": 1, **assessment_result, "trial": state}
                if args.command == "finish":
                    atomic_json(root/"trial-result.json", result)
                else:
                    atomic_json(root/("verification-"+uuid.uuid4().hex[:8]+".json"), result)
        print(json.dumps(result, allow_nan=False))
        return code
    except (CadError, OSError, ValueError, KeyError) as exc:
        print(json.dumps({"schema_version": 1, "outcome": "failed", "reason": str(exc), "code": getattr(exc, "code", "collector_error")}))
        return 1 if isinstance(exc, CadError) and exc.code in ("budget_exhausted", "trial_closed") else 2


if __name__ == "__main__":
    sys.exit(main())
