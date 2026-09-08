"""Small allowlisted sample catalog. Originals never become agent filesystem paths."""
from pathlib import Path
import json

from fastapi import APIRouter
from fastapi.responses import FileResponse

root = Path(__file__).resolve().parents[3] / "samples" / "mug-cap"
router = APIRouter(prefix="/api/agent/samples")


def catalog():
    sample = json.loads((root / "manifest.json").read_text())
    return {"id": sample["id"], "title": sample["title"], "description": sample["description"],
            "prompt": sample["prompt"], "photos": [{"id": photo["id"], "title": photo["title"],
                "url": f'/api/agent/samples/mug-cap/images/{photo["id"]}', "digest": photo["sha256"]}
                for photo in sample["photos"]]}


@router.get("")
async def samples():
    return {"samples": [catalog()]}


@router.get("/mug-cap/images/{photo_id}")
async def sample_image(photo_id: str):
    manifest = json.loads((root / "manifest.json").read_text())
    photo = next((photo for photo in manifest["photos"] if photo["id"] == photo_id), None)
    if not photo:
        raise KeyError("Sample photo not found")
    return FileResponse(root / photo["file"], media_type="image/png",
                        headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"})
