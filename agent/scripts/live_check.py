"""Opt-in real-account acceptance against a running application API."""
import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
from io import BytesIO
import json
from pathlib import Path
import uuid

import httpx
from PIL import Image, ImageDraw
from rich.console import Console

console = Console()


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8787")
    parser.add_argument("--generate", action="store_true", help="Also request native image generation (uses the configured account)")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "runs")
    args = parser.parse_args()
    output = args.output / datetime.now(timezone.utc).strftime("live-%Y%m%dT%H%M%SZ")
    output.mkdir(parents=True)
    console.print("Real Codex acceptance; no fixture responses or automatic permission approval.", style="bold")
    async with httpx.AsyncClient(base_url=args.url, timeout=120) as client:
        async def api(method, path, **kwargs):
            response = await client.request(method, "/api/agent" + path, **kwargs)
            response.raise_for_status()
            return response.json()

        health = await api("GET", "/health")
        if not health["authConfigured"]:
            raise RuntimeError("Configure a working Codex login before the live check")
        snapshot = await api("POST", "/sessions")
        sid = snapshot["session"]["id"]
        if snapshot["session"]["runtime"] != "ready":
            raise RuntimeError(snapshot["session"].get("error") or "Codex could not start")
        console.print(f"Session {sid}: {snapshot['session']['model']}", style="green")

        async def prompt(text, images=None):
            await api("POST", f"/sessions/{sid}/messages", json={"clientMessageId": uuid.uuid4().hex, "text": text, "imageIds": images or []})
            previous = None
            async with asyncio.timeout(720):
                while True:
                    state = await api("GET", f"/sessions/{sid}")
                    status = state["session"]["turnStatus"]
                    if status != previous:
                        console.print(f"Turn: {status}")
                        if status == "waiting_permission":
                            console.print("Answer the offered permission in /debug/agent. The harness will wait.", style="yellow")
                        previous = status
                    if not state["session"]["activeTurnId"]:
                        (output / "snapshot.json").write_text(json.dumps(state, indent=2))
                        if status != "completed":
                            raise RuntimeError(state["session"].get("error") or f"Turn ended {status}")
                        return state
                    await asyncio.sleep(1)

        image = Image.new("RGB", (640, 400), "white")
        draw = ImageDraw.Draw(image)
        draw.rectangle((50, 140, 180, 270), fill="red")
        draw.ellipse((250, 140, 380, 270), fill="blue")
        draw.polygon(((450, 270), (515, 130), (580, 270)), fill="green")
        buffer = BytesIO(); image.save(buffer, "PNG")
        asset = await api("POST", f"/sessions/{sid}/images?title=Live%20input%20shapes", content=buffer.getvalue())
        snapshot = await prompt("Name the colored shapes from left to right. Call crafty_images.fetch_image for this attachment. Do not generate an image yet.", [asset["id"]])
        reply = " ".join(r.get("text", "") for r in snapshot["records"] if r.get("author") == "crafty").lower()
        if not all(word in reply for word in ("red", "square", "blue", "circle", "green", "triangle")):
            raise RuntimeError("Vision reply did not identify all input shapes; inspect snapshot.json")
        if not any(r.get("name") == "images.show" and r.get("status") == "completed" for r in snapshot["records"]):
            raise RuntimeError("No successful MCP image fetch was captured")
        console.print("PASS image input and real MCP fetch", style="green")

        if args.generate:
            snapshot = await prompt("Generate a new concept sketch of a pale blue replacement mug cap with a small finger tab, three-quarter view on white. Use native image generation, then publish the saved file with crafty_images.publish_image. No measurements or CAD needed.")
            native = any(r.get("title") == "Image generation" and r.get("status") == "completed" for r in snapshot["records"])
            published = [a for a in snapshot["assets"] if a["origin"] == "generated"]
            if not native or not published:
                raise RuntimeError("Native generation and MCP publication must both succeed")
            for asset in published:
                response = await client.get(asset["url"] + "?download=true")
                response.raise_for_status()
                if hashlib.sha256(response.content).hexdigest() != asset["digest"]:
                    raise RuntimeError("Downloaded image digest differs from its stored identity")
                (output / (asset["id"] + asset["extension"])).write_bytes(response.content)
            console.print("PASS native generation, MCP publication, and download digest", style="green")

        identity = snapshot["session"]["acpSessionId"]
        records = snapshot["records"]
        await api("POST", f"/sessions/{sid}/stop")
        restored = await api("POST", f"/sessions/{sid}/open")
        if restored["session"]["acpSessionId"] != identity or restored["records"] != records:
            raise RuntimeError("Native recovery changed identity or duplicated history")
        snapshot = await prompt("Briefly recall the colors and shapes in the image I sent earlier. Do not call any tools.")
        await api("POST", f"/sessions/{sid}/stop")
        (output / "snapshot.json").write_text(json.dumps(snapshot, indent=2))
        console.print("PASS saved native conversation recovery", style="green")
        console.print(f"Evidence: {output}")


if __name__ == "__main__":
    asyncio.run(main())
