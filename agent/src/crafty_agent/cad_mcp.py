"""Separate role-scoped MCP surface for conversational delegation and CAD work."""
import asyncio
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool

from .cad_files import atomic, canonical, capture_request, contained, digest, read
from .cad_protocol import DESCRIPTIONS, SCHEMAS, validate_tool


def http(path, body=None, *, binary=False, maximum=128 * 1024 * 1024):
    base = os.environ["CRAFTY_CAD_URL"]
    request = Request(base + path, data=canonical(body) if body is not None else None,
                      headers={"Authorization": "Bearer " + os.environ["CRAFTY_CAD_TOKEN"], "Content-Type": "application/json"})
    try:
        with urlopen(request, timeout=30) as response:
            data = response.read(maximum + 1)
            if len(data) > maximum:
                raise ValueError("CAD transfer exceeds its byte budget")
            return data if binary else json.loads(data)
    except HTTPError as error:
        detail = json.loads(error.read(4096)).get("detail", "CAD request failed")
        raise ValueError(str(detail)) from error


def materialize(result):
    files = result.pop("files", [])
    if not files:
        return result
    workspace = Path(os.environ["CRAFTY_CAD_WORKSPACE"]).resolve()
    folder = contained(workspace, "evidence/" + result["evaluationId"])
    total = 0
    for item in files:
        total += item["size_bytes"]
        if total > 128 * 1024 * 1024:
            raise ValueError("Evaluation exceeds materialization budget")
        path = contained(folder, item["path"])
        if path.exists() and digest(read(path, item["size_bytes"])) == item["sha256"]:
            continue
        data = http(item["url"], binary=True, maximum=item["size_bytes"])
        if len(data) != item["size_bytes"] or digest(data) != item["sha256"]:
            raise ValueError("Downloaded CAD evidence failed digest validation")
        atomic(path, data)
    result["result_path"] = str(folder / "result.json") if (folder / "result.json").is_file() else None
    if result.get("geometry") and (folder / "geometry/manifest.json").is_file():
        result["snapshot_path"] = str(folder / "geometry/manifest.json")
        if "snapshot_path" in result["geometry"]:
            result["geometry"]["snapshot_path"] = result["snapshot_path"]
    result["artifact_paths"] = [{"id": item["id"], "kind": item["kind"], "path": str(contained(folder, item["path"]))}
                                for item in result.get("artifacts", []) if item.get("status") == "ready"]
    return result


def dispatch(name, arguments):
    role = os.environ["CRAFTY_CAD_ROLE"]
    server = "crafty_cad" if role == "chat" else "crafty_cad_model"
    validate_tool(server, name, arguments)
    sid = os.environ["CRAFTY_CAD_SESSION"]
    prefix = f"/internal/cad/{role}/{sid}"
    if role == "model" and name in {"cad_evaluate", "cad_ensure"}:
        bundle = capture_request(os.environ["CRAFTY_CAD_WORKSPACE"], arguments["request_path"])
        return http(prefix + "/" + name, {"arguments": arguments, "bundle": bundle})
    result = http(prefix + "/" + name, {"arguments": arguments})
    if role == "model" and name in {"cad_status", "cad_wait"}:
        return materialize(result)
    if role == "model" and name == "fetch_image":
        metadata = result.pop("asset")
        data = http(result.pop("fetchUrl"), binary=True, maximum=20 * 1024 * 1024)
        if digest(data) != metadata["digest"]:
            raise ValueError("Fetched image digest mismatch")
        folder = Path(os.environ["CRAFTY_CAD_WORKSPACE"]) / "inputs"
        path = contained(folder, metadata["id"] + metadata["extension"])
        atomic(path, data)
        result.update(local_path=str(path), asset=metadata)
    return result


async def main():
    role = os.environ["CRAFTY_CAD_ROLE"]
    prefix = "crafty_cad" if role == "chat" else "crafty_cad_model"
    server = Server(prefix)

    @server.list_tools()
    async def list_tools():
        return [Tool(name=key.split(".")[1], description=DESCRIPTIONS[key.split(".")[1]], inputSchema=value)
                for key, value in SCHEMAS.items() if key.startswith(prefix + ".")]

    @server.call_tool()
    async def call_tool(name, arguments):
        return await asyncio.to_thread(dispatch, name, arguments)

    async with stdio_server() as (incoming, outgoing):
        await server.run(incoming, outgoing, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
