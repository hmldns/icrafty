"""Explicit ACP lifecycle fixture; never used by a live backend configuration."""
import json
import os
from pathlib import Path
import sys

session = "fixture-" + Path.cwd().parent.name
pending = None


def send(value):
    print(json.dumps({"jsonrpc": "2.0", **value}), flush=True)


for line in sys.stdin:
    message = json.loads(line)
    method, params, rid = message.get("method"), message.get("params", {}), message.get("id")
    if method == "initialize":
        send({"id": rid, "result": {"protocolVersion": 1, "agentInfo": {"name": "CAD TEST FIXTURE", "version": "1"},
            "agentCapabilities": {"loadSession": True, "sessionCapabilities": {"resume": {}}}}})
    elif method in {"session/new", "session/resume"}:
        session = params.get("sessionId", session)
        with Path("fixture-setup.jsonl").open("a") as stream:
            stream.write(json.dumps({"method": method, "sessionId": session, "cwd": params["cwd"],
                "codexHome": os.environ["CODEX_HOME"], "servers": [s["name"] for s in params["mcpServers"]]}) + "\n")
        send({"id": rid, "result": {"sessionId": session, "models": {"currentModelId": "test-fixture"}}})
    elif method == "session/prompt":
        pending = rid
        send({"id": "permission", "method": "session/request_permission", "params": {"sessionId": session,
            "toolCall": {"toolCallId": "fixture-action", "title": "Explicit CAD test action"},
            "options": [{"optionId": "allow", "name": "Allow once", "kind": "allow_once"}, {"optionId": "deny", "name": "Deny", "kind": "reject_once"}]}})
    elif method == "session/cancel" and pending:
        send({"id": pending, "result": {"stopReason": "cancelled"}})
        pending = None
    elif rid == "permission":
        # Stay active until the test cancels; this fixture never publishes evidence.
        Path("fixture-permission.json").write_text(json.dumps(message["result"]))
