"""Thin scoped HTTP routes for the CAD MCP facades and browser artifact access."""
from pathlib import Path
import secrets

from fastapi import HTTPException, Request
from fastapi.responses import FileResponse, Response

from .cad_files import contained, decode, digest, read
from .cad_inputs import unpack_file
from .cad_protocol import validate_tool
from .cad_publication import publish


def install_cad(app, service, scoped):
    def model_scope(request, sid, *, mutate=False):
        owner = service().cad
        agent = owner.agents.get(sid)
        token = request.headers.get("authorization", "").removeprefix("Bearer ")
        if not agent or not agent.token or not secrets.compare_digest(token, agent.token):
            raise HTTPException(403, "CAD runtime credential is invalid or expired")
        state = owner.store.session(sid)
        if agent.generation != state["generation"] or not agent.operation_id:
            raise HTTPException(409, "CAD runtime generation is no longer active")
        operation = owner.store.operation(sid, agent.operation_id)
        if mutate and operation["public"]["status"] != "running":
            raise HTTPException(409, "CAD operation no longer accepts mutations")
        return agent, operation

    async def body(request):
        data = bytearray()
        async for chunk in request.stream():
            data.extend(chunk)
            if len(data) > service().cad.settings.input_bytes * 4 // 3 + 256 * 1024:
                raise HTTPException(413, "CAD request exceeds its transfer budget")
        value = decode(bytes(data))
        if not isinstance(value, dict) or not set(value) <= {"arguments", "bundle", "file"} or "arguments" not in value:
            raise ValueError("Expected a CAD command envelope")
        return value

    @app.post("/internal/cad/chat/{sid}/{tool}")
    async def conversation(request: Request, sid: str, tool: str):
        mutate = tool in {"request_part", "request_evidence", "restore_geometry", "cancel", "attach_input_file"}
        runtime = scoped(request, sid, mutate=mutate)
        generation = runtime.generation
        turn = service().store.session(sid)["activeTurnId"]
        value = await body(request)
        scoped(request, sid, mutate=mutate)
        if generation != runtime.generation or (mutate and turn != service().store.session(sid)["activeTurnId"]):
            raise HTTPException(409, "Originating conversational turn changed")
        if tool == "attach_input_file":
            if set(value) != {"arguments", "file"}:
                raise ValueError("Expected exactly arguments and file for CAD input attachment")
            arguments = validate_tool("crafty_cad", tool, value["arguments"])
            data = unpack_file(value.get("file"), arguments, service().cad.inputs.maximum)
            return service().cad.inputs.save(sid, arguments["idempotency_key"], value["file"]["filename"],
                arguments["kind"], data, "conversation_workspace",
                {"turnId": turn, "generation": generation, "relativePath": arguments["path"]})
        if set(value) != {"arguments"}:
            raise ValueError("Unexpected conversational CAD transfer fields")
        return await service().cad.request(sid, tool, value["arguments"])

    @app.post("/internal/cad/model/{sid}/{tool}")
    async def model(request: Request, sid: str, tool: str):
        mutating = tool in {"cad_ensure", "cad_evaluate", "cad_release", "fetch_input_file"}
        agent, operation = model_scope(request, sid, mutate=mutating)
        oid, generation = operation["id"], agent.generation
        value = await body(request)
        agent, current = model_scope(request, sid, mutate=mutating)
        if current["id"] != oid or generation != agent.generation:
            raise HTTPException(409, "CAD operation changed during transfer")
        arguments = validate_tool("crafty_cad_model", tool, value["arguments"])
        owner = service().cad
        if "file" in value or ("bundle" in value and tool not in {"cad_ensure", "cad_evaluate"}):
            raise ValueError("Unexpected modeling CAD transfer fields")
        if tool in {"cad_ensure", "cad_evaluate"}:
            return await owner.submit(sid, oid, tool, arguments, value.get("bundle"))
        if tool in {"cad_status", "cad_wait", "result_publish"}:
            evaluation = owner.store.evaluation(sid, arguments["evaluation_id"])
            if evaluation["operationId"] != oid:
                raise HTTPException(403, "Evaluation belongs to another CAD task")
            if tool == "cad_status":
                return owner.evaluation_status(sid, evaluation["id"])
            if tool == "cad_wait":
                return await owner.wait_evaluation(sid, evaluation["id"], arguments.get("timeout_seconds", 20))
            return publish(owner, sid, oid, arguments)
        if tool == "cad_release":
            return await owner.bridge(sid).call({"op": "release", "handle": arguments["handle"]})
        if tool == "fetch_image":
            aid = arguments["asset_id"]
            if aid not in operation["task"].get("image_ids", []):
                raise HTTPException(403, "Image was not included in this CAD task")
            asset = owner.app.store.asset(sid, aid)
            return {"schema_version": 1, "image": {"assetId": aid, "versionId": asset["versionId"]}, "asset": asset,
                    "fetchUrl": f"/internal/cad/model/{sid}/images/{aid}"}
        if tool == "fetch_input_file":
            fid = arguments["input_file_id"]
            metadata, _ = owner.inputs.for_task(sid, current, fid)
            return {"schema_version": 1, "input": metadata, "fetchUrl": f"/internal/cad/model/{sid}/inputs/{fid}"}
        raise ValueError("Unknown CAD model tool")

    @app.get("/internal/cad/model/{sid}/inputs/{fid}")
    async def model_input(request: Request, sid: str, fid: str):
        _, operation = model_scope(request, sid, mutate=True)
        metadata, data = service().cad.inputs.for_task(sid, operation, fid)
        return Response(data, media_type=metadata["mediaType"],
                        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "no-store"})

    @app.post("/api/agent/sessions/{sid}/cad/inputs")
    async def upload_input(request: Request, sid: str, filename: str, kind: str):
        service().store.session(sid)
        if request.headers.get("content-type", "").split(";")[0] != "application/octet-stream":
            raise HTTPException(415, "CAD input upload requires application/octet-stream")
        data = bytearray()
        async for chunk in request.stream():
            if len(data) + len(chunk) > service().cad.inputs.maximum:
                raise HTTPException(413, "CAD input exceeds its individual byte budget")
            data.extend(chunk)
        return service().cad.inputs.save(sid, request.headers.get("idempotency-key"), filename, kind,
            bytes(data), "user_upload", {})

    @app.get("/internal/cad/model/{sid}/evaluations/{eid}/files/{index}")
    async def evaluation_file(request: Request, sid: str, eid: str, index: int):
        _, operation = model_scope(request, sid)
        evaluation = service().cad.store.evaluation(sid, eid)
        if evaluation["operationId"] != operation["id"] or index < 0 or index >= len(evaluation["files"]):
            raise HTTPException(404, "CAD evaluation file not found")
        item = evaluation["files"][index]
        path = contained(Path(evaluation["resultPath"]).parent, item["path"])
        data = read(path, service().cad.settings.result_bytes)
        if digest(data) != item["sha256"] or len(data) != item["size_bytes"]:
            raise ValueError("CAD evidence digest changed")
        return Response(data, media_type="application/octet-stream")

    @app.get("/internal/cad/model/{sid}/images/{aid}")
    async def model_image(request: Request, sid: str, aid: str):
        _, operation = model_scope(request, sid)
        if aid not in operation["task"].get("image_ids", []):
            raise HTTPException(403, "Image was not included in this CAD task")
        asset = service().store.asset(sid, aid)
        return FileResponse(service().store.asset_path(sid, aid), media_type=asset["mimeType"])

    @app.get("/api/agent/sessions/{sid}/cad/operations/{oid}")
    async def operation(sid: str, oid: str):
        return service().cad.public(sid, oid)

    @app.post("/api/agent/sessions/{sid}/cad/operations/{oid}/cancel")
    async def cancel(sid: str, oid: str):
        await service().cad.cancel(sid, oid)
        return service().cad.public(sid, oid)

    @app.get("/api/agent/sessions/{sid}/cad/artifacts/{fid}")
    async def artifact(sid: str, fid: str, download: bool = False):
        metadata, path = service().cad.store.file(sid, fid)
        return FileResponse(path, media_type=metadata["mediaType"], filename=metadata["filename"] if download else None,
                            headers={"ETag": '"' + metadata["sha256"] + '"', "X-Content-Type-Options": "nosniff",
                                     "Cache-Control": "private, max-age=31536000, immutable"})
