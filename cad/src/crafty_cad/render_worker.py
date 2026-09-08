"""Disposable, resource-limited raster process using the locked uv interpreter."""

import argparse
import json
from pathlib import Path
import resource
import sys
import time
import traceback


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode")
    parser.add_argument("--lib")
    parser.add_argument("--job", required=True)
    parser.add_argument("--memory", type=int, required=True)
    parser.add_argument("--cpu", type=int, required=True)
    parser.add_argument("--output-limit", type=int, required=True)
    args = parser.parse_args()
    resource.setrlimit(resource.RLIMIT_AS, (args.memory, args.memory))
    resource.setrlimit(resource.RLIMIT_CPU, (args.cpu, args.cpu))
    resource.setrlimit(resource.RLIMIT_FSIZE, (args.output_limit, args.output_limit))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from crafty_cad.files import CadError
    from crafty_cad.render import render_output, versions
    from crafty_cad.settings import Settings
    job = json.loads(Path(args.job).read_bytes())
    def check():
        if time.monotonic() >= job["deadline"]:
            raise CadError("timeout", "Raster deadline exhausted")
    def fault(phase, identity):
        if phase+":"+identity in job["faults"]:
            raise CadError("render_error", job["faults"][phase+":"+identity])
    try:
        settings = Settings(**job["settings"])
        artifact = render_output(job["output"], job["mesh"], Path(job["directory"]), job["geometry_digest"], settings, check, fault,
                                 job.get("callouts", []))
        response = {"ok": True, "data": {"artifact": artifact, "render_versions": versions(settings)}}
    except Exception as exc:
        response = {"ok": False, "error": str(exc), "traceback": traceback.format_exc()[-4000:]}
    Path(job["response"]).write_text(json.dumps(response, allow_nan=False))
    return 0 if response["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
