"""Application-owned IPC adapter, executed with the locked CAD interpreter.

The deterministic package has no dependency on this application or ACP/MCP.
"""
import argparse
import json
from pathlib import Path
import signal
import sys
import threading

from crafty_cad.contract import validate_request, validate_result
from crafty_cad.files import CadError, load_json
from crafty_cad.runtime import GeometryRuntime


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--scope", required=True)
    args = parser.parse_args()
    cancelled = threading.Event()
    stopping = threading.Event()
    signal.signal(signal.SIGUSR1, lambda *_: cancelled.set())
    def terminate(*_):
        stopping.set()
        cancelled.set()
    signal.signal(signal.SIGTERM, terminate)
    with GeometryRuntime(args.directory) as runtime:
        for line in sys.stdin:
            if stopping.is_set():
                break
            cancelled.clear()
            try:
                message = json.loads(line)
                op = message["op"]
                if op == "close":
                    break
                if op == "validate":
                    result = validate_request(message["request"])
                elif op == "ensure":
                    result = runtime.ensure_geometry(message["request"], scope=args.scope, cancel=cancelled)
                elif op == "evaluate":
                    path, code = runtime.evaluate(message["request"], message["output"], scope=args.scope, cancel=cancelled)
                    result = load_json(path)
                    validate_result(result, Path(path).parent)
                    result = {"result": result, "result_path": str(path), "exit_code": code}
                elif op == "release":
                    result = runtime.release_geometry(message["handle"], scope=args.scope)
                elif op == "inspect":
                    result = runtime.inspect_geometry(message["handle"], scope=args.scope)
                elif op == "diagnostics":
                    result = runtime.diagnostics()
                else:
                    raise ValueError("Unknown CAD bridge operation")
                response = {"ok": True, "result": result, "diagnostics": runtime.diagnostics()}
            except Exception as error:
                response = {"ok": False, "error": {"code": getattr(error, "code", "bridge_error"),
                            "message": str(error)[:1000]}, "diagnostics": runtime.diagnostics()}
            print(json.dumps(response, allow_nan=False), flush=True)
            if stopping.is_set():
                break


if __name__ == "__main__":
    main()
