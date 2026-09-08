"""Run deterministic cases with Rich progress, exact exit codes, and retained files."""

import argparse
from collections import Counter
import fnmatch
import importlib.util
import json
import os
from pathlib import Path
import signal
import sys
import threading
import time
import traceback
import uuid

from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, TimeElapsedColumn
from rich.table import Table
from rich.tree import Tree

from .api import CAD_ROOT, Context
from .reports import publish
from .presentation import case_details
from ..files import CadError
from ..runtime import GeometryRuntime
from ..settings import Settings


SUITES = ["contract", "geometry", "views", "exports", "reuse", "failures"]


def main(argv=None):
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    run = commands.add_parser("run")
    run.add_argument("--suite", required=True)
    run.add_argument("--case", action="append", default=[])
    run.add_argument("--runtime", choices=["local", "docker"], default="local")
    run.add_argument("--output", type=Path)
    run.add_argument("--json", action="store_true")
    run.add_argument("--no-color", action="store_true")
    args = parser.parse_args(argv)
    if args.runtime == "docker":
        from .docker_run import run
        return run(args)
    root = (args.output or CAD_ROOT / "runs" / "verification" / (time.strftime("%Y%m%d-%H%M%S")+"-"+uuid.uuid4().hex[:8])).resolve()
    console = Console(stderr=True, no_color=args.no_color or bool(os.environ.get("NO_COLOR")),
                      force_terminal=False if args.json or not sys.stderr.isatty() else None)
    started = time.monotonic()
    cancellation = threading.Event()
    old = {sig: signal.signal(sig, lambda *_: cancellation.set()) for sig in (signal.SIGINT, signal.SIGTERM)}
    summary = {"schema_version": 1, "run_id": root.name, "runtime": args.runtime,
               "selection": {"suite": args.suite, "case": args.case}, "order": [], "cases": [],
               "effective_settings": Settings.environment().manifest(), "native": None,
               "outcome": "failed", "exit_code": 2}
    code = 0
    reserved = False
    try:
        root.mkdir(parents=True, exist_ok=False)
        reserved = True
        spec = importlib.util.spec_from_file_location("cad_fixture_assertions", CAD_ROOT / "tests" / "suites.py")
        tests = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(tests)
        suites = SUITES if args.suite == "all" else [args.suite]
        if any(s not in SUITES + ["diagnostic"] for s in suites):
            raise CadError("invalid_selection", "Unknown suite")
        cases = [case for suite in suites for case in tests.CASES if case.suite == suite]
        if any(not any(case.suite == suite for case in cases) for suite in suites):
            raise CadError("invalid_selection", "A required suite has no implementation; no tests ran")
        if args.case:
            if any(not any(fnmatch.fnmatch(case.name, pattern) for case in cases) for pattern in args.case):
                raise CadError("invalid_selection", "Unknown or empty case selection")
            cases = [case for case in cases if any(fnmatch.fnmatch(case.name, pattern) for pattern in args.case)]
        if not cases:
            raise CadError("invalid_selection", "No cases selected; no tests ran")
        summary["order"] = [case.suite+"/"+case.name for case in cases]
        settings = Settings.environment()
        if any(case.native for case in cases):
            with GeometryRuntime(root / "preflight", settings) as runtime:
                runtime._start()
                summary["native"] = runtime.native_versions
        console.print(f"Crafty CAD | {args.runtime} | {len(cases)} cases | {root}")
        with Progress(SpinnerColumn(), TextColumn("{task.description}"), TextColumn("{task.completed}/{task.total} cases"), TimeElapsedColumn(),
                      console=console, disable=args.json or not console.is_terminal) as progress:
            task = progress.add_task("Starting", total=len(cases))
            for case in cases:
                began = time.monotonic()
                if cancellation.is_set():
                    code = 130
                    break
                def phase(name):
                    progress.update(task, description=f"{case.suite}/{case.name}: {name}")
                context = Context(root / case.suite / case.name, settings, cancellation, phase)
                row = {"suite": case.suite, "case": case.name, "classification": case.classification,
                       "outcome": "passed", "assertions": context.assertions}
                try:
                    case.run(context)
                    if not context.assertions:
                        raise AssertionError("No assertions ran")
                    if cancellation.is_set():
                        raise KeyboardInterrupt
                except KeyboardInterrupt:
                    row.update(outcome="interrupted", classification="interrupted", reason="Run interrupted")
                    code = 130
                except AssertionError as exc:
                    row.update(outcome="failed", classification="unexpected_failure", reason=str(exc))
                    code = max(code, 1)
                except Exception as exc:
                    row.update(outcome="error", classification="unexpected_failure", reason=str(exc),
                               traceback=traceback.format_exc()[-8000:])
                    code = max(code, 2)
                finally:
                    context.close()
                    row["results"] = [p.relative_to(root).as_posix() for p in context.results]
                    row["runtime_diagnostics"] = [r.diagnostics() for r in context.runtimes]
                    row["duration_seconds"] = time.monotonic()-began
                    summary["cases"].append(row)
                progress.advance(task)
                console.print(f"{row['outcome']}: {case.suite}/{case.name} ({row['duration_seconds']:.3f}s)")
                case_details(console,row,root)
                if code == 130:
                    break
    except KeyboardInterrupt:
        code = 130
        summary["cases"].append({"suite": args.suite, "case": "interruption", "outcome": "interrupted", "classification": "interrupted"})
    except Exception as exc:
        code = 2
        summary["cases"].append({"suite": args.suite, "case": "preflight", "outcome": "error",
            "classification": "missing_prerequisite" if isinstance(exc, CadError) and exc.code in
            ("missing_native", "native_lost", "missing_prerequisite") else "invalid_setup",
            "reason": str(exc), "traceback": traceback.format_exc()[-8000:]})
    finally:
        for sig, handler in old.items():
            signal.signal(sig, handler)
    summary.update(exit_code=code, outcome="passed" if code == 0 else "interrupted" if code == 130 else "failed",
                   duration_seconds=time.monotonic()-started,
                   counts=dict(Counter(row["outcome"] for row in summary["cases"])))
    try:
        if not reserved:
            print(f"Cannot reserve fresh report directory: {root}", file=sys.stderr)
            return 2
        publish(root, summary)
    except Exception as exc:
        print(f"Cannot publish fresh report: {exc}", file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(summary, allow_nan=False))
    else:
        table = Table("Outcome", "Cases", "Report")
        for outcome, count in summary["counts"].items():
            table.add_row(outcome, str(count), str(root / "summary.json"))
        console.print(table)
        tree = Tree(str(root))
        for name in ("summary.json", "index.html"):
            tree.add(name)
        artifacts = tree.add("retained evaluator artifacts")
        for path in list(root.rglob("artifacts/*"))[:40]:
            if path.is_file():
                artifacts.add(path.relative_to(root).as_posix())
        console.print(tree)
    console.print(f"CAD verification {summary['outcome']}; {len(summary['cases'])} cases; exit {code}; {root / 'summary.json'}")
    return code


if __name__ == "__main__":
    sys.exit(main())
