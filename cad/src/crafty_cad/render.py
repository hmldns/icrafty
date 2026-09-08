"""Orthographic raster evidence from clean FreeCAD tessellation, with a depth buffer.

No display, OpenGL context, external renderer, or source-derived dimensions are used.
"""

from __future__ import annotations

import io
import math
from pathlib import Path
import textwrap
from typing import Callable

import numpy as np
from PIL import Image, ImageDraw, ImageFont, features

from .files import CadError, atomic_bytes, atomic_json, digest, record
from .settings import Settings


PRESETS = {
    "isometric": ((-1, -1, -1), (0, 0, 1)),
    "top": ((0, 0, -1), (0, 1, 0)),
    "bottom": ((0, 0, 1), (0, -1, 0)),
    "front": ((0, 1, 0), (0, 0, 1)),
    "right": ((-1, 0, 0), (0, 0, 1)),
}
BACKGROUND = (241, 245, 249)
INK = (25, 43, 60)
PANEL = (225, 234, 243)


def versions(settings: Settings) -> dict:
    import PIL
    return {"renderer": "freecad-tessellation-software-zbuffer@2", "numpy": np.__version__,
            "pillow": PIL.__version__, "freetype": features.version("freetype2"),
            "font": settings.font, "font_sha256": digest(Path(settings.font).read_bytes()),
            "background": BACKGROUND, "title_height": settings.title_height,
            "tessellation_mm": settings.tessellation_mm, "display": "none", "opengl": "none",
            "edge_style": "silhouette-and-depth-discontinuity"}


def normalized(vector):
    vector = np.asarray(vector, dtype=float)
    return vector / np.linalg.norm(vector)


def resolve_camera(view: dict, mesh: dict, settings: Settings, footer: int = 0) -> dict:
    direction, hint = PRESETS[view["preset"]]
    forward = normalized(direction)
    right = normalized(np.cross(forward, hint))
    up = normalized(np.cross(right, forward))
    bounds = mesh["baseline"]["bounds"]
    corners = np.array([[x, y, z] for x in (bounds[0], bounds[3])
                        for y in (bounds[1], bounds[4]) for z in (bounds[2], bounds[5])])
    center = (np.array(bounds[:3]) + np.array(bounds[3:])) / 2
    x = (corners - center) @ right
    y = (corners - center) @ up
    viewport_width = view["width"] - 24
    viewport_height = view["height"] - settings.title_height - 24 - footer
    if viewport_height < 64:
        raise CadError("render_error", "Panel is too short for readable requested annotations")
    aspect = viewport_width / viewport_height
    span_y = view.get("span_mm", max(float(np.ptp(y)), float(np.ptp(x)) / aspect, 0.01) * 1.18)
    span_x = span_y * aspect
    return {"projection": "orthographic", "direction": forward.tolist(), "up": up.tolist(),
            "right": right.tolist(), "target_mm": center.tolist(), "span_mm": [span_x, span_y],
            "world_to_view": [right.tolist(), up.tolist(), forward.tolist()],
            "view_origin_mm": center.tolist(), "preset": view["preset"]}


def camera_title(view_id: str, view: dict, camera: dict) -> str:
    def vector(values):
        return "(" + ", ".join(f"{v:+.3f}" for v in values) + ")"
    name = f"{view_id}: {view['title']}" if view.get("title") else view_id
    return (f"{name} | {view['preset']} | orthographic\n"
            f"look {vector(camera['direction'])}\nup {vector(camera['up'])}\n"
            f"span {camera['span_mm'][0]:.3f} x {camera['span_mm'][1]:.3f} mm")


def raster(mesh: dict, camera: dict, width: int, height: int, check: Callable) -> Image.Image:
    vertices = np.asarray(mesh["vertices"], dtype=np.float64)
    triangles = np.asarray(mesh["triangles"], dtype=np.int64)
    if not len(vertices) or not len(triangles):
        raise CadError("render_unavailable", "Selected geometry has no tessellated faces")
    local = (vertices - camera["target_mm"]) @ np.asarray(camera["world_to_view"]).T
    screen = local.copy()
    screen[:, 0] = (local[:, 0] / camera["span_mm"][0] + 0.5) * width
    screen[:, 1] = (0.5 - local[:, 1] / camera["span_mm"][1]) * height
    rgb = np.empty((height, width, 3), dtype=np.uint8)
    rgb[:] = BACKGROUND
    depth = np.full((height, width), np.inf, dtype=np.float64)
    light = normalized((-0.35, 0.5, -1))
    base_color = np.array((72, 152, 196))
    for index, indices in enumerate(triangles):
        if index % 32 == 0:
            check()
        a, b, c = screen[indices]
        minimum = np.floor(np.min((a[:2], b[:2], c[:2]), axis=0)).astype(int)
        maximum = np.ceil(np.max((a[:2], b[:2], c[:2]), axis=0)).astype(int)
        x0, y0 = max(0, minimum[0]), max(0, minimum[1])
        x1, y1 = min(width - 1, maximum[0]), min(height - 1, maximum[1])
        if x1 < x0 or y1 < y0:
            continue
        denominator = (b[1]-c[1]) * (a[0]-c[0]) + (c[0]-b[0]) * (a[1]-c[1])
        if abs(denominator) < 1e-12:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1+1)+0.5, np.arange(y0, y1+1)+0.5)
        wa = ((b[1]-c[1]) * (xs-c[0]) + (c[0]-b[0]) * (ys-c[1])) / denominator
        wb = ((c[1]-a[1]) * (xs-c[0]) + (a[0]-c[0]) * (ys-c[1])) / denominator
        wc = 1-wa-wb
        z = wa*a[2] + wb*b[2] + wc*c[2]
        previous = depth[y0:y1+1, x0:x1+1]
        inside = (wa >= -1e-9) & (wb >= -1e-9) & (wc >= -1e-9) & (z < previous)
        normal = normalized(np.cross(local[indices[1]]-local[indices[0]], local[indices[2]]-local[indices[0]]))
        illumination = 0.38 + 0.62 * abs(float(normal @ light))
        color = np.minimum(255, base_color * illumination + 12).astype(np.uint8)
        previous[inside] = z[inside]
        rgb[y0:y1+1, x0:x1+1][inside] = color
    # Parallel roof and rim faces receive the same light. Outline real depth
    # discontinuities so an orthographic bottom view exposes the cavity boundary.
    visible = np.isfinite(depth)
    edge = np.zeros((height, width), dtype=bool)
    threshold = max(camera["span_mm"][0]/width, camera["span_mm"][1]/height) * 4
    for axis in (0, 1):
        for shift in (-1, 1):
            neighbor = np.roll(depth, shift, axis)
            neighbor_visible = np.isfinite(neighbor)
            differences = np.zeros_like(depth)
            np.subtract(depth, neighbor, out=differences, where=visible & neighbor_visible)
            edge |= visible & (~neighbor_visible | (np.abs(differences) > threshold))
    rgb[edge] = (29, 69, 90)
    return Image.fromarray(rgb)


def render_output(output: dict, mesh: dict, directory: Path, geometry_digest: str,
                  settings: Settings, check: Callable, fault: Callable, callouts: list | None = None) -> dict:
    """One artifact; per-panel failures and sidecar failures stay independent."""
    is_grid = "grid" in output
    views = output["grid"]["views"] if is_grid else [{"id": output["id"], **output["view"]}]
    columns = output["grid"]["columns"] if is_grid else 1
    cell_w = max(v["width"] for v in views)
    cell_h = max(v["height"] for v in views)
    padding = settings.grid_padding if is_grid else 0
    rows = math.ceil(len(views) / columns)
    size = (columns * cell_w + (columns+1)*padding, rows * cell_h + (rows+1)*padding)
    canvas = Image.new("RGB", size, BACKGROUND)
    annotations, lineage = [], []
    flags = output.get("annotations", {"json": True, "inline": True})
    font = ImageFont.truetype(settings.font, 15)
    for index, view in enumerate(views):
        check()
        x = padding + (index % columns) * (cell_w + padding)
        y = padding + (index // columns) * (cell_h + padding)
        width, height = view["width"], view["height"]
        metric_records = []
        footer = 0
        for metric in callouts or []:
            value = f"{metric['value']:.6g}" if type(metric["value"]) in (int, float) else str(metric["value"])
            label = f"{metric['target']['part']}.{metric['target']['feature']} | {metric['id']}: {value} {metric['unit']} [{metric['status']}]"
            lines, remaining = [], label
            while font.getlength(remaining) > width-24:
                end = max(i for i in range(1,len(remaining)) if font.getlength(remaining[:i]) <= width-24)
                lines.append(remaining[:end])
                remaining = remaining[end:]
            lines.append(remaining)
            record_height = len(lines)*19+5
            metric_records.append({"id": f"{view['id']}.metric.{metric['id']}", "view_id": view["id"],
                "kind": "measurement", "text": "\n".join(lines), "offset": footer,
                "bounds": [x+12, 0, width-24, record_height], "provenance": {
                    "kind": "computed_metric", "metric_id": metric["id"], "value": metric["value"],
                    "unit": metric["unit"], "method": metric["method"], "target": metric["target"],
                    "other_target": metric.get("other_target"), "status": metric["status"], "criterion": metric["criterion"]}})
            footer += record_height
        if footer:
            footer += 8
        camera = resolve_camera(view, mesh, settings, footer)
        title = camera_title(view["id"], view, camera)
        # Pixel-measured wrapping, shared by raster and sidecar; no hidden text clipping.
        lines = []
        for paragraph in title.splitlines():
            remaining = paragraph
            while font.getlength(remaining) > width - 24:
                end = max(i for i in range(1, len(remaining)) if font.getlength(remaining[:i]) <= width-24)
                lines.append(remaining[:end])
                remaining = remaining[end:]
            lines.append(remaining)
        text = "\n".join(lines)
        if len(lines)*19 > settings.title_height-12:
            raise CadError("render_error", "Camera title does not fit reserved title region")
        panel = Image.new("RGB", (width, height), BACKGROUND)
        draw = ImageDraw.Draw(panel)
        draw.rectangle((0, 0, width, settings.title_height), fill=PANEL)
        viewport = [x+12, y+settings.title_height+12, width-24, height-settings.title_height-24-footer]
        item = {"view_id": view["id"], "status": "ready", "title": title, "camera": camera,
                "parts": output["parts"], "panel": [x, y, width, height], "viewport": viewport,
                "view_to_image": [[1, 0, x], [0, 1, y], [0, 0, 1]]}
        annotation = {"id": f"{view['id']}.camera", "view_id": view["id"], "kind": "camera_title",
            "text": text, "anchor": [x+12, y+8], "bounds": [x+12, y+8, width-24, len(lines)*19],
            "provenance": {"kind": "resolved_camera", "camera": camera}}
        annotations.append(annotation)
        for metric_record in metric_records:
            local_y = height-footer+metric_record.pop("offset")+4
            metric_record["anchor"] = [x+12, y+local_y]
            metric_record["bounds"][1] = y+local_y
            annotations.append(metric_record)
            if flags["inline"]:
                draw.multiline_text((12,local_y), metric_record["text"], font=font, fill=INK, spacing=4)
        try:
            fault("view", output["id"] + ":" + view["id"])
            rendered = raster(mesh, camera, viewport[2], viewport[3], check)
            panel.paste(rendered, (12, settings.title_height+12))
        except CadError as exc:
            if exc.code in ("cancelled", "timeout"):
                raise
            item.update(status="error", reason=str(exc))
            draw.text((20, settings.title_height+30), "VIEW ERROR\n" + str(exc)[:70], font=font, fill=(150, 30, 35))
        except Exception as exc:
            item.update(status="error", reason=str(exc))
            draw.text((20, settings.title_height+30), "VIEW ERROR\n" + str(exc)[:70], font=font, fill=(150, 30, 35))
        if item["status"] != "ready":
            annotations.append({"id": f"{view['id']}.failure", "view_id": view["id"], "kind": "diagnostic",
                "text": "VIEW ERROR\n"+item["reason"][:70], "anchor": [x+20,y+settings.title_height+30],
                "bounds": [x+20,y+settings.title_height+30,width-40,40], "always_inline": True,
                "provenance": {"kind": "service_error", "reason": item["reason"]}})
        if flags["inline"]:
            draw.multiline_text((12, 8), text, font=font, fill=INK, spacing=4)
        canvas.paste(panel, (x, y))
        lineage.append(item)
    fault("composition", output["id"])
    check()
    encoded = io.BytesIO()
    canvas.save(encoded, format="PNG", compress_level=6)
    destination = directory / "artifacts" / (output["id"] + ".png")
    atomic_bytes(destination, encoded.getvalue())
    artifact = {"id": output["id"], "kind": "png", "status": "ready",
                **record(destination, directory, "image/png"), "width": size[0], "height": size[1],
                "views": lineage, "grid_padding": padding, "annotations": {"inline": flags["inline"], "json": flags["json"]}}
    if flags["json"]:
        try:
            fault("sidecar", output["id"])
            sidecar = destination.with_suffix(".annotations.json")
            atomic_json(sidecar, {"schema_version": 1, "artifact_id": output["id"],
                "geometry_digest": geometry_digest, "image_sha256": artifact["sha256"],
                "image_size": list(size), "origin": "top-left", "inline": flags["inline"],
                "views": lineage, "records": annotations})
            artifact["annotations"].update(status="ready", **record(sidecar, directory, "application/json"))
        except Exception as exc:
            artifact["annotations"].update(status="error", reason=str(exc))
    return artifact
