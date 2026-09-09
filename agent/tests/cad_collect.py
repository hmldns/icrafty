# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Read-only collector for one dedicated live chat; never submits agent work.

uv run --script agent/tests/cad_collect.py --session ID --output FRESH_DIRECTORY
Optional --state-root retains that session's native operations, not Codex homes.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlparse
from urllib.request import urlopen


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", required=True)
    parser.add_argument("--base-url", default="http://127.0.0.1:8807")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--state-root", type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r"[a-zA-Z0-9_.-]{1,120}", args.session):
        parser.error("Invalid session ID")
    parsed = urlparse(args.base_url)
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost"} or parsed.path not in {"", "/"}:
        parser.error("Use the dedicated loopback backend")
    args.output.mkdir(parents=True, exist_ok=False)
    prefix = "/api/agent/sessions/" + args.session
    files = []

    def write(name, data):
        path = args.output / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        files.append({"path": name, "sha256": sha(data), "sizeBytes": len(data)})

    def fetch(path, maximum=32 * 1024 * 1024):
        if not path.startswith(prefix) or ".." in path or "\\" in path:
            raise ValueError("Refuse a URL outside the selected session")
        with urlopen(args.base_url.rstrip("/") + path, timeout=30) as response:
            data = response.read(maximum + 1)
            if len(data) > maximum:
                raise ValueError("Evidence exceeds collector byte limit")
            return data

    snapshot = fetch(prefix)
    write("snapshot.json", snapshot)
    state = json.loads(snapshot)
    if state["session"]["id"] != args.session:
        raise ValueError("Backend returned another session")
    records = [r for r in state["records"] if r.get("name") == "cad.result" and r.get("completionSource") == "application"]
    if not records:
        raise ValueError("No backend-owned CAD operation exists in this saved chat yet")
    assets = {item["id"]: item for item in state.get("images", state.get("assets", []))}
    seen = set()
    operations = []
    downloads = 0
    for record in records:
        result = record["rawOutput"]
        oid = result["operationId"]
        if not re.fullmatch(r"[a-zA-Z0-9_.-]{1,120}", oid):
            raise ValueError("Invalid operation identity")
        if oid in seen:
            continue
        seen.add(oid)
        current = fetch(prefix + "/cad/operations/" + oid)
        write("operations/" + oid + ".json", current)
        result = json.loads(current)
        operations.append(result)
        for output in result["outputs"]:
            if output["status"] != "ready":
                continue
            if output["kind"] == "png":
                asset = assets[output["image"]["assetId"]]
                if asset["digest"] != output["sha256"] or asset["versionId"] != output["image"]["versionId"]:
                    raise ValueError("Published CAD image does not match its immutable catalog record")
                data = fetch(asset["url"])
                if sha(data) != output["sha256"] or len(data) != output["sizeBytes"]:
                    raise ValueError("PNG download differs from evaluated bytes")
                write("artifacts/" + oid + "/" + output["id"] + ".png", data)
                downloads += 1
            for metadata in (output.get("file"), output.get("annotations", {}).get("file")):
                if not metadata:
                    continue
                data = fetch(metadata["downloadUrl"], 128 * 1024 * 1024)
                if sha(data) != metadata["sha256"] or len(data) != metadata["sizeBytes"]:
                    raise ValueError("STEP/sidecar download differs from published bytes")
                write("artifacts/" + oid + "/" + metadata["filename"], data)
                downloads += 1
        if args.state_root:
            source = args.state_root / "cad/operations" / oid
            total = 0
            for path in sorted(source.rglob("*")):
                if path.is_symlink():
                    raise ValueError("Unexpected symlink in native operation evidence")
                if path.is_file():
                    data = path.read_bytes()
                    total += len(data)
                    if total > 256 * 1024 * 1024:
                        raise ValueError("Native operation evidence exceeds collector budget")
                    write("native/" + oid + "/" + str(path.relative_to(source)), data)
    report = {"schema_version": 1, "sessionId": args.session, "conversationAcpSessionId": state["session"]["acpSessionId"],
              "activeTurnId": state["session"]["activeTurnId"], "backend": args.base_url, "operations": operations,
              "files": files, "allDownloadsVerified": downloads > 0, "downloadCount": downloads,
              "acceptance": "evidence collection only; inspect actual images, agent route and outcomes separately"}
    (args.output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(args.output / "report.json")


if __name__ == "__main__":
    main()
