"""Normalize the pinned Codex ACP adapter once, before domain projection."""
from __future__ import annotations
import json


def compact(value, depth=0):
    if depth > 12:
        return "[nested content omitted]"
    if isinstance(value, dict):
        return {k: ("[binary omitted]" if k == "data" or (k == "result" and isinstance(v, str) and len(v) > 16000)
                    else "[redacted]" if any(word in k.lower() for word in ("token", "password", "authorization", "secret"))
                    else compact(v, depth + 1)) for k, v in value.items()}
    if isinstance(value, list):
        return [compact(v, depth + 1) for v in value[:100]]
    if isinstance(value, str):
        return value[:16000]
    return value


def tool_result(raw):
    if not isinstance(raw, dict):
        return raw
    if raw.get("error"):
        return {"error": compact(raw["error"])}
    result = raw.get("result", raw)
    if not isinstance(result, dict):
        return result
    if isinstance(result.get("structuredContent"), dict):
        return result["structuredContent"]
    for block in result.get("content", []):
        if isinstance(block, dict) and block.get("type") == "text":
            try:
                value = json.loads(block.get("text", ""))
                if isinstance(value, dict):
                    return value
            except (ValueError, TypeError):
                pass
    return result


def merge_tool(previous: dict | None, update: dict) -> dict:
    record = dict(previous or {"type": "tool_call", "toolCallId": update["toolCallId"],
                               "name": "tool", "title": "Agent activity", "status": "pending"})
    for field in ("title", "status", "kind"):
        if field in update:
            record[field] = update[field]
    if "rawInput" in update and update["rawInput"] is not None:
        raw = update["rawInput"]
        if isinstance(raw, dict) and raw.get("server") and raw.get("tool"):
            record.update(server=raw["server"], tool=raw["tool"], name=f'{raw["server"]}.{raw["tool"]}', rawInput=compact(raw.get("arguments", {})))
        else:
            record["rawInput"] = compact(raw)
    if "rawOutput" in update and update["rawOutput"] is not None:
        record["rawOutput"] = compact(tool_result(update["rawOutput"]))
    if "content" in update:
        record["content"] = compact(update["content"])
    if record.get("server") == "crafty_images":
        record["name"] = {"publish_image": "images.show", "fetch_image": "images.show", "request_camera": "camera.capture"}.get(record.get("tool"), record["name"])
    result = record.get("rawOutput")
    if isinstance(result, dict) and (result.get("error") or result.get("isError")):
        record["status"] = "failed"
    return record
