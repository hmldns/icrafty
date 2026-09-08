"""Machine boundary: one result path on stdout, diagnostics on stderr."""

import argparse
from pathlib import Path
import signal
import sys
import threading
import uuid

from .files import CadError
from .runtime import GeometryRuntime
from .settings import Settings


def main(argv=None):
    parser = argparse.ArgumentParser()
    command = parser.add_subparsers(dest="command", required=True)
    evaluate = command.add_parser("evaluate")
    evaluate.add_argument("--request", required=True, type=Path)
    evaluate.add_argument("--output", required=True, type=Path)
    args = parser.parse_args(argv)
    cancellation = threading.Event()
    previous = {sig: signal.signal(sig, lambda *_: cancellation.set()) for sig in (signal.SIGINT, signal.SIGTERM)}
    try:
        if args.output.exists():
            raise CadError("output_exists", f"Output directory already exists: {args.output}")
        runtime_dir = args.output.absolute().parent / (".runtime-" + uuid.uuid4().hex)
        with GeometryRuntime(runtime_dir, Settings.environment()) as runtime:
            result, code = runtime.evaluate(args.request, args.output, cancel=cancellation)
        print(result)
        return code
    except (CadError, OSError) as exc:
        print(str(exc), file=sys.stderr)
        return 2
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)


if __name__ == "__main__":
    sys.exit(main())
