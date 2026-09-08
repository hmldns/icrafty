"""Local application API; the runtime and store can be composed without FastAPI."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import secrets

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .acp import AcpError
from .config import Settings
from .service import AgentService, BusyError


class Prompt(BaseModel):
    model_config = ConfigDict(extra="forbid")
    clientMessageId: str = Field(min_length=1, max_length=120)
    text: str = Field(default="", max_length=40000)
    imageIds: list[str] = Field(default_factory=list, max_length=8)


class PermissionAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    optionId: str | None = None


class Capture(BaseModel):
    model_config = ConfigDict(extra="forbid")
    assetId: str


async def read_image(request: Request, maximum: int) -> bytes:
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > maximum:
            raise HTTPException(413, "Image exceeds the byte limit")
    return bytes(data)


def create_app(settings: Settings | None = None, *, base_url="http://127.0.0.1:8787") -> FastAPI:
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app):
        app.state.service = AgentService(settings, base_url)
        try:
            yield
        finally:
            await app.state.service.close()

    app = FastAPI(title="Crafty agent integration", lifespan=lifespan)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "testserver"])

    @app.middleware("http")
    async def check_origin(request: Request, call_next):
        origin = request.headers.get("origin")
        if origin and origin not in settings.origins:
            return JSONResponse({"detail": "Browser origin is not allowed"}, status_code=403)
        return await call_next(request)

    @app.exception_handler(KeyError)
    async def missing(request, error):
        return JSONResponse({"detail": str(error).strip("'")}, status_code=404)

    @app.exception_handler(ValueError)
    async def invalid(request, error):
        return JSONResponse({"detail": str(error)}, status_code=409 if isinstance(error, BusyError) else 400)

    @app.exception_handler(AcpError)
    async def runtime_error(request, error):
        return JSONResponse({"detail": str(error)[:1000]}, status_code=503)

    def service() -> AgentService:
        return app.state.service

    def scoped(request: Request, sid: str, mutate=False):
        runtime = service().runtime(sid)
        token = request.headers.get("authorization", "").removeprefix("Bearer ")
        if not runtime.token or not secrets.compare_digest(token, runtime.token):
            raise HTTPException(403, "MCP session credential is invalid or expired")
        state = service().store.session(sid)
        if state["generation"] != runtime.generation or (mutate and (not state["activeTurnId"] or runtime.cancelled)):
            raise HTTPException(409, "The originating turn is no longer active")
        return runtime

    @app.get("/api/agent/health")
    async def health():
        return {"status": "ok", "mode": "local", "schemaVersion": 1,
                "authConfigured": bool(settings.auth_source and settings.auth_source.is_file()),
                "model": settings.model, "adapterCommand": settings.adapter[0], "imageLimitBytes": settings.max_image_bytes}

    @app.get("/api/agent/sessions")
    async def sessions():
        return {"sessions": service().store.sessions()}

    @app.post("/api/agent/sessions", status_code=201)
    async def create_session():
        state = service().store.create_session()
        try:
            return await service().open(state["id"])
        except (AcpError, OSError, asyncio.TimeoutError):
            return service().store.snapshot(state["id"])

    @app.get("/api/agent/sessions/{sid}")
    async def snapshot(sid: str):
        return service().store.snapshot(sid)

    @app.post("/api/agent/sessions/{sid}/open")
    async def open_session(sid: str):
        return await service().open(sid)

    @app.post("/api/agent/sessions/{sid}/stop")
    async def stop_session(sid: str):
        await service().stop(sid)
        return service().store.snapshot(sid)

    @app.post("/api/agent/sessions/{sid}/messages", status_code=202)
    async def message(sid: str, body: Prompt):
        return await service().prompt(sid, body.clientMessageId, body.text, body.imageIds)

    @app.post("/api/agent/sessions/{sid}/cancel")
    async def cancel(sid: str):
        await service().cancel(sid)
        return service().store.snapshot(sid)

    @app.post("/api/agent/sessions/{sid}/permissions/{pid}")
    async def permission(sid: str, pid: str, body: PermissionAnswer):
        runtime = service().runtime(sid)
        current = next((p for p in service().store.session(sid)["permissions"] if p["id"] == pid), None)
        future = runtime.permissions.get(pid)
        state = service().store.session(sid)
        if (not current or future is None or future.done() or current["generation"] != state["generation"]
                or current["turnId"] != state["activeTurnId"]):
            raise HTTPException(409, "Permission is no longer pending")
        if body.optionId is not None and body.optionId not in {o["optionId"] for o in current["options"]}:
            raise ValueError("Choose one of the offered permission options")
        future.set_result(body.optionId)
        return {"accepted": True}

    @app.post("/api/agent/sessions/{sid}/images", status_code=201)
    async def upload(request: Request, sid: str, title: str = "Uploaded image"):
        data = await read_image(request, settings.max_image_bytes)
        return service().store.add_image(sid, data, title, "upload")

    @app.get("/api/agent/sessions/{sid}/images/{aid}")
    async def image_file(sid: str, aid: str, download: bool = False):
        asset = service().store.asset(sid, aid)
        return FileResponse(service().store.asset_path(sid, aid), media_type=asset["mimeType"],
                            filename=asset["title"].replace("/", "-") + asset["extension"] if download else None,
                            headers={"Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"})

    @app.post("/api/agent/sessions/{sid}/captures/{call_id}")
    async def capture(sid: str, call_id: str, body: Capture):
        asset = service().store.asset(sid, body.assetId)
        record = service().store.record(sid, call_id)
        if not record or record.get("name") != "camera.capture":
            raise ValueError("Camera request does not exist")
        result = dict(record.get("rawOutput") or {})
        interaction = service().store.interaction(sid, result.get("requestId", ""))
        if interaction["kind"] != "camera" or interaction["toolCallId"] != call_id:
            raise ValueError("Capture does not belong to this camera request")
        refs = list(interaction["photos"])
        ref = {"assetId": asset["id"], "versionId": asset["versionId"]}
        if ref not in refs:
            refs.append(ref)
        interaction.update(photos=refs, status="captured")
        service().store.put_interaction(sid, interaction)
        record["rawOutput"] = service().store.camera_result(interaction)
        service().store.put_record(sid, record)
        return service().store.snapshot(sid)

    @app.websocket("/api/agent/sessions/{sid}/events")
    async def events(socket: WebSocket, sid: str, after: int = 0):
        origin = socket.headers.get("origin")
        if origin and origin not in settings.origins:
            await socket.close(code=1008)
            return
        try:
            service().store.session(sid)
        except KeyError:
            await socket.close(code=1008)
            return
        await socket.accept()
        cursor = max(after, 0)
        try:
            while True:
                pending = service().store.events(sid, cursor)
                for event in pending:
                    await socket.send_json(event)
                    cursor = event["seq"]
                try:
                    await asyncio.wait_for(socket.receive_text(), timeout=0.25)
                except asyncio.TimeoutError:
                    pass
        except (WebSocketDisconnect, RuntimeError):
            return

    @app.get("/internal/mcp/{sid}/images")
    async def mcp_images(request: Request, sid: str):
        scoped(request, sid)
        return {"schema_version": 1, "images": service().store.assets(sid), "summary": "Images available in this session"}

    @app.get("/internal/mcp/{sid}/images/{aid}")
    async def mcp_fetch(request: Request, sid: str, aid: str):
        scoped(request, sid)
        asset = service().store.asset(sid, aid)
        return {"schema_version": 1, "view": "image", "image": {"assetId": aid, "versionId": "1"},
                "caption": asset["title"], "local_path": str(service().materialize(sid, aid)), "asset": asset}

    @app.post("/internal/mcp/{sid}/publish")
    async def mcp_publish(request: Request, sid: str, title: str = "Generated image", caption: str = ""):
        runtime = scoped(request, sid, mutate=True)
        generation = runtime.generation
        turn_id = service().store.session(sid)["activeTurnId"]
        data = await read_image(request, settings.max_image_bytes)
        scoped(request, sid, mutate=True)
        if runtime.generation != generation or service().store.session(sid)["activeTurnId"] != turn_id:
            raise HTTPException(409, "Originating turn changed during publication")
        asset = service().store.add_image(sid, data, title, "generated")
        return {"schema_version": 1, "view": "image", "image": {"assetId": asset["id"], "versionId": "1"},
                "caption": caption[:2000] or title[:160], "asset": asset}

    @app.post("/internal/mcp/{sid}/camera")
    async def mcp_camera(request: Request, sid: str, caption: str = "Take a photo to continue"):
        scoped(request, sid, mutate=True)
        interaction = service().store.create_camera(sid, caption)
        return service().store.camera_result(interaction)

    return app
