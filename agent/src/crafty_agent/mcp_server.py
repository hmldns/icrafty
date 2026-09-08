"""Small session-local MCP facade. Domain writes go through the scoped API."""
from __future__ import annotations
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Crafty images")


def call(path: str, *, method="GET", body: bytes | None = None, query: dict | None = None):
    url = os.environ["CRAFTY_MCP_URL"] + "/internal/mcp/" + os.environ["CRAFTY_MCP_SESSION"] + path
    if query:
        url += "?" + urlencode(query)
    request = Request(url, data=body, method=method, headers={"Authorization": "Bearer " + os.environ["CRAFTY_MCP_TOKEN"], "Content-Type": "application/octet-stream"})
    try:
        with urlopen(request, timeout=30) as response:
            return json.load(response)
    except HTTPError as error:
        detail = json.loads(error.read()).get("detail", "MCP operation failed")
        raise ValueError(detail) from error


@mcp.tool()
def list_images() -> dict:
    """List immutable image IDs in this chat, including uploaded and published images."""
    return call("/images")


@mcp.tool()
def fetch_image(asset_id: str) -> dict:
    """Fetch a chat image into this session workspace. Returns a local_path to inspect with the image-view tool and an image card."""
    if not asset_id.isalnum():
        raise ValueError("Use an image ID returned by list_images or publication")
    return call("/images/" + asset_id)


def readable_image_path(local_path: str) -> Path:
    workspace = Path(os.environ["CRAFTY_MCP_WORKSPACE"]).resolve()
    generated = Path(os.environ["CRAFTY_MCP_GENERATED_ROOT"]).resolve()
    path = Path(local_path).expanduser()
    if not path.is_absolute():
        path = workspace / path
    path = path.resolve(strict=True)
    if not any(path.is_relative_to(root) for root in (workspace, generated)) or not path.is_file():
        raise ValueError("Publish a completed image from this session workspace or its generated-image directory")
    if path.stat().st_size > 20 * 1024 * 1024:
        raise ValueError("Image exceeds 20 MiB")
    return path


@mcp.tool()
def publish_image(local_path: str, title: str, caption: str = "") -> dict:
    """Publish an actual completed local image as an inline, downloadable chat asset. After native image generation, pass its actual saved path. Does not generate images itself."""
    path = readable_image_path(local_path)
    return call("/publish", method="POST", body=path.read_bytes(), query={"title": title[:160], "caption": caption[:2000]})


@mcp.tool()
def request_camera(caption: str) -> dict:
    """Mount a camera card asking the user for a new photo. Returns immediately; end the turn and let the user capture and send an image later."""
    return call("/camera", method="POST", body=b"", query={"caption": caption[:2000]})


if __name__ == "__main__":
    mcp.run(transport="stdio")
