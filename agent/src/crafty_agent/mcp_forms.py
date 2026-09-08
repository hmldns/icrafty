"""Session-scoped forms MCP, separate from image and CAD tools."""
from __future__ import annotations

from mcp.server.fastmcp import FastMCP

from .mcp_server import call, readable_image_path
from .measurements import DimensionField, DimensionRequest, MeasurementGuide

mcp = FastMCP("Crafty measurement forms")


@mcp.tool()
def publish_measurement_guide(local_path: str, title: str, caption: str = "") -> dict:
    """Save a completed generated measurement sketch for a form, without a duplicate image card.

    Generate the sketch first with native image generation. Show where to place
    caliper jaws/depth rod, with letter labels matching the forthcoming field labels
    and no invented measurements. Pass its actual saved local path. Use the returned
    image assetId in request_dimensions.guides with the corresponding field_ids.
    """
    path = readable_image_path(local_path)
    published = call("/publish", method="POST", body=path.read_bytes(), query={"title": title[:160], "caption": caption[:2000]})
    return {**published, "view": "measurement_guide", "summary": "Measurement sketch saved for the form"}


@mcp.tool()
def request_dimensions(title: str, fields: list[DimensionField], caption: str = "", image_ids: list[str] | None = None,
                       guides: list[MeasurementGuide] | None = None) -> dict:
    """Ask for dimensions or short text answers in an inline form with up to three instructional sketches.

    Each field has a unique id, label, kind (number/text), unit (mm/cm/in/degrees)
    and optional measurement hint. Use text fields for fit/function questions.
    Each guide contains image_id from publish_measurement_guide and field_ids for
    the measurements it explains. Use letter labels matching the sketch. Original
    photo IDs go in image_ids as reference links; do not reuse them as guides.
    Leave values unknown until the user measures them. Returns immediately: end
    this turn; submitting the form sends the answers as the next user message.
    """
    request = DimensionRequest(title=title, fields=fields, caption=caption, image_ids=image_ids or [], guides=guides or [])
    return call("/dimensions", method="POST", body=request.model_dump_json().encode(), content_type="application/json")


if __name__ == "__main__":
    mcp.run(transport="stdio")
