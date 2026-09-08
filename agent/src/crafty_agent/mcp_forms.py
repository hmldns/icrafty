"""Session-scoped forms MCP, separate from image and CAD tools."""
from __future__ import annotations

from mcp.server.fastmcp import FastMCP

from .mcp_server import call
from .measurements import DimensionField, DimensionRequest

mcp = FastMCP("Crafty measurement forms")


@mcp.tool()
def request_dimensions(title: str, fields: list[DimensionField], caption: str = "", image_ids: list[str] | None = None) -> dict:
    """Ask for dimensions or short text answers in an inline form. Link existing chat images by ID.

    Each field has a unique id, label, kind (number/text), unit (mm/cm/in/degrees)
    and optional measurement hint. Use text fields for fit/function questions.
    Leave values unknown until the user measures them. Returns immediately: end
    this turn; submitting the form sends the answers as the next user message.
    """
    request = DimensionRequest(title=title, fields=fields, caption=caption, image_ids=image_ids or [])
    return call("/dimensions", method="POST", body=request.model_dump_json().encode(), content_type="application/json")


if __name__ == "__main__":
    mcp.run(transport="stdio")
