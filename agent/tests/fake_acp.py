"""Explicit protocol fixture. Never selected by the live runtime by default."""
import json
import os
import sys

session = "fake-" + os.path.basename(os.path.dirname(os.getcwd()))
pending = None


def send(value):
    print(json.dumps({"jsonrpc": "2.0", **value}), flush=True)


def update(value):
    send({"method": "session/update", "params": {"sessionId": session, "update": value}})


def reply(rid, value):
    send({"id": rid, "result": value})


for line in sys.stdin:
    message = json.loads(line)
    method, params = message.get("method"), message.get("params", {})
    rid = message.get("id")
    if method == "initialize":
        reply(rid, {"protocolVersion": 1, "agentInfo": {"name": "EXPLICIT TEST FIXTURE", "version": "1"},
                    "agentCapabilities": {"loadSession": True, "promptCapabilities": {"image": True}, "sessionCapabilities": {"resume": {}}}})
    elif method in {"session/new", "session/resume", "session/load"}:
        if "sessionId" in params:
            session = params["sessionId"]
            update({"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": "REPLAY MUST NOT DUPLICATE"}})
        reply(rid, {"sessionId": session, "models": {"currentModelId": "test-fixture"}})
    elif method == "session/prompt":
        text = " ".join(block.get("text", "") for block in params["prompt"])
        if text == "crash":
            os._exit(3)
        if text in {"slow", "permission"}:
            pending = rid
            if text == "permission":
                send({"id": "permission-1", "method": "session/request_permission", "params": {"sessionId": session,
                    "toolCall": {"toolCallId": "permission-tool", "title": "Test action"},
                    "options": [{"optionId": "allow", "name": "Allow once", "kind": "allow_once"}, {"optionId": "deny", "name": "Deny", "kind": "reject_once"}]}})
            continue
        update({"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": "Fixture "}})
        update({"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": "reply."}})
        update({"sessionUpdate": "tool_call", "toolCallId": rid + "-tool", "title": "List images", "status": "in_progress",
                "rawInput": {"server": "crafty_images", "tool": "list_images", "arguments": {"keep": True}}})
        update({"sessionUpdate": "tool_call_update", "toolCallId": rid + "-tool", "status": "completed",
                "rawOutput": {"result": {"structuredContent": {"schema_version": 1, "summary": "Fixture MCP result"}}, "error": None}})
        if any(block.get("type") == "image" for block in params["prompt"]):
            update({"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": "Fixture received image block."}})
        reply(rid, {"stopReason": "end_turn"})
    elif method == "session/cancel" and pending:
        reply(pending, {"stopReason": "cancelled"})
        pending = None
    elif rid == "permission-1" and pending:
        reply(pending, {"stopReason": "end_turn"})
        pending = None
    elif rid:
        reply(rid, {})
