import asyncio
from io import BytesIO
import os
from pathlib import Path
import sys

import httpx
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from PIL import Image
import pytest

from crafty_agent.config import Settings
from crafty_agent.http import create_app
from crafty_agent.mcp_server import readable_image_path
from crafty_agent.normalize import merge_tool
from crafty_agent.service import AgentService, BusyError
from crafty_agent.store import Store


@pytest.fixture
def settings(tmp_path):
    return Settings(data=tmp_path / "state", adapter=(sys.executable, str(Path(__file__).with_name("fake_acp.py"))),
                    auth_source=None, startup_timeout=5, turn_timeout=10, cancel_timeout=1)


def png(color="red"):
    buffer = BytesIO()
    Image.new("RGB", (64, 48), color).save(buffer, "PNG")
    return buffer.getvalue()


async def settled(service, sid):
    async with asyncio.timeout(5):
        while service.store.session(sid)["activeTurnId"]:
            await asyncio.sleep(0.01)
    return service.store.snapshot(sid)


def test_immutable_images_and_session_scope(settings):
    store = Store(settings)
    try:
        a, b = store.create_session()["id"], store.create_session()["id"]
        image = store.add_image(a, png(), "Red", "upload")
        assert store.add_image(a, png(), "Again", "upload")["id"] == image["id"]
        assert store.asset_path(a, image["id"]).read_bytes() == png()
        with pytest.raises(KeyError): store.asset(b, image["id"])
        with pytest.raises(ValueError): store.add_image(a, b"not an image", "Bad", "upload")
        assert store.snapshot(a)["assets"][0]["digest"] == image["digest"]
        assert store.events(b, 0)[0]["payload"]["id"] == b
    finally:
        store.close()


def test_partial_mcp_updates_and_binary_normalization():
    initial = merge_tool(None, {"toolCallId": "one", "rawInput": {"server": "crafty_images", "tool": "publish_image", "arguments": {"local_path": "draft.png"}}})
    updated = merge_tool(initial, {"toolCallId": "one", "status": "completed", "rawOutput": {"result": {"structuredContent": {"view": "image", "image": {"assetId": "abc", "versionId": "1"}}}}})
    assert updated["name"] == "images.show"
    assert updated["rawInput"] == {"local_path": "draft.png"}
    assert updated["rawOutput"]["image"]["assetId"] == "abc"
    assert initial["status"] == "pending"
    binary = merge_tool(None, {"toolCallId": "two", "content": [{"content": {"type": "image", "data": "secretbytes"}}]})
    assert "secretbytes" not in str(binary)


@pytest.mark.asyncio
async def test_real_stdio_lifecycle_images_idempotency_and_resume(settings):
    service = AgentService(settings, "http://127.0.0.1:1")
    sid = service.store.create_session()["id"]
    try:
        await service.open(sid)
        acp_id = service.store.session(sid)["acpSessionId"]
        image = service.store.add_image(sid, png(), "Red", "upload")
        turn = await service.prompt(sid, "client-1", "Inspect", [image["id"]])
        assert (await service.prompt(sid, "client-1", "Inspect", [image["id"]]))["id"] == turn["id"]
        with pytest.raises(ValueError): await service.prompt(sid, "client-1", "Changed", [])
        snapshot = await settled(service, sid)
        assert snapshot["session"]["turnStatus"] == "completed"
        assert any(r.get("text") == "Fixture reply." for r in snapshot["records"])
        assert any(r.get("text") == "Fixture received image block." for r in snapshot["records"])
        tool = next(r for r in snapshot["records"] if r["type"] == "tool_call")
        assert tool["rawInput"] == {"keep": True} and tool["status"] == "completed"
        before = len(snapshot["records"])
        await service.runtime(sid).stop_process()
        await service.open(sid)
        assert service.store.session(sid)["acpSessionId"] == acp_id
        assert len(service.store.records(sid)) == before
        assert "REPLAY" not in str(service.store.records(sid))
        assert service.materialize(sid, image["id"]).read_bytes() == png()
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_busy_permission_stop_and_process_loss(settings):
    service = AgentService(settings, "http://127.0.0.1:1")
    sid = service.store.create_session()["id"]
    try:
        await service.prompt(sid, "one", "permission", [])
        async with asyncio.timeout(5):
            while not service.store.session(sid)["permissions"]: await asyncio.sleep(0.01)
        with pytest.raises(BusyError): await service.prompt(sid, "two", "Another message", [])
        await service.runtime(sid).cancel()
        assert service.store.session(sid)["turnStatus"] == "cancelled"
        assert service.store.session(sid)["permissions"] == []
        permission = service.store.interactions(sid)[0]
        assert permission["status"] == "cancelled" and permission["optionId"] is None
        await service.prompt(sid, "three", "crash", [])
        await settled(service, sid)
        assert service.store.session(sid)["turnStatus"] == "interrupted"
        await service.open(sid)
        assert service.store.session(sid)["runtime"] == "ready"
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_http_contract_and_origin(settings):
    app = create_app(settings)
    async with app.router.lifespan_context(app), httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        assert (await client.post("/api/agent/sessions", headers={"Origin": "https://other.example"})).status_code == 403
        snapshot = (await client.post("/api/agent/sessions")).json()
        sid = snapshot["session"]["id"]
        response = await client.post(f"/api/agent/sessions/{sid}/images?title=Red", content=png())
        assert response.status_code == 201
        asset = response.json()
        assert (await client.get(asset["url"])).content == png()
        assert "attachment" in (await client.get(asset["url"] + "?download=true")).headers["content-disposition"]
        assert (await client.get(f"/internal/mcp/{sid}/images")).status_code == 403
        assert (await client.post(f"/api/agent/sessions/{sid}/messages", json={"clientMessageId": "x", "cwd": "/tmp"})).status_code == 422
        assert (await client.get(f"/api/agent/sessions/{sid}")).json()["assets"][0]["id"] == asset["id"]


@pytest.mark.asyncio
async def test_mcp_publication_camera_and_permission_records(settings):
    app = create_app(settings)
    async with app.router.lifespan_context(app), httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        service = app.state.service
        sid = (await client.post("/api/agent/sessions")).json()["session"]["id"]
        runtime = service.runtime(sid)
        headers = {"Authorization": f"Bearer {runtime.token}"}
        assert (await client.post(f"/internal/mcp/{sid}/publish", content=png(), headers=headers)).status_code == 409
        await service.prompt(sid, "slow-camera", "slow", [])
        image = (await client.post(f"/internal/mcp/{sid}/publish?title=Sketch", content=png(), headers=headers)).json()
        asset = image["asset"]
        assert asset["origin"] == "generated"
        result = (await client.post(f"/internal/mcp/{sid}/camera?caption=Show%20the%20rim", headers=headers)).json()
        request_id = result["requestId"]
        # Request is durable even before the adapter reports its tool result.
        assert service.store.interaction(sid, request_id)["status"] == "awaiting_capture"
        await runtime.event({"method": "session/update", "params": {"sessionId": service.store.session(sid)["acpSessionId"],
            "update": {"sessionUpdate": "tool_call", "toolCallId": "camera-tool", "status": "completed",
                       "rawInput": {"server": "crafty_images", "tool": "request_camera", "arguments": {}},
                       "rawOutput": {"result": {"structuredContent": result}}}}})
        await runtime.cancel()
        for _ in range(2):
            captured = await client.post(f"/api/agent/sessions/{sid}/captures/camera-tool", json={"assetId": asset["id"]})
            assert captured.status_code == 200
        interaction = service.store.interaction(sid, request_id)
        assert interaction["status"] == "captured" and len(interaction["photos"]) == 1
        # A late MCP tool update cannot erase the human's captured photo.
        assert service.store.record(sid, "camera-tool")["rawOutput"]["photos"] == interaction["photos"]
        await service.prompt(sid, "permission-choice", "permission", [])
        async with asyncio.timeout(5):
            while not service.store.session(sid)["permissions"]: await asyncio.sleep(0.01)
        permission = service.store.session(sid)["permissions"][0]
        url = f'/api/agent/sessions/{sid}/permissions/{permission["id"]}'
        assert (await client.post(url, json={"optionId": "invented"})).status_code == 400
        assert (await client.post(url, json={"optionId": "deny"})).status_code == 200
        await settled(service, sid)
        saved = service.store.interaction(sid, permission["id"])
        assert saved["status"] == "resolved" and saved["optionId"] == "deny"
        await runtime.stop_process()
        assert (await client.get(f"/internal/mcp/{sid}/images", headers=headers)).status_code == 403


@pytest.mark.asyncio
async def test_exclusive_store_owner_and_recovery(settings):
    service = AgentService(settings, "http://127.0.0.1:1")
    with pytest.raises(RuntimeError, match="already owned"):
        AgentService(settings, "http://127.0.0.1:2")
    sid = service.store.create_session()["id"]
    turn = service.store.create_turn(sid, "uncertain", "Do something", [], "digest")
    # Simulate a dead process with persisted work and no orderly turn completion.
    service.store.close(); service._lease.close()
    restored = AgentService(settings, "http://127.0.0.1:1")
    try:
        assert restored.store.session(sid)["turnStatus"] == "interrupted"
        assert restored.store.prior_turn(sid, "uncertain")["id"] == turn["id"]
        assert restored.runtimes == {}
        assert len(restored.store.records(sid)) == 1
    finally:
        await restored.close()


@pytest.mark.asyncio
async def test_concurrent_retries_and_stop_open_are_serialized(settings):
    service = AgentService(settings, "http://127.0.0.1:1")
    sid = service.store.create_session()["id"]
    try:
        first, duplicate = await asyncio.gather(service.prompt(sid, "same", "slow", []), service.prompt(sid, "same", "slow", []))
        assert first["id"] == duplicate["id"]
        assert len(service.store.records(sid)) == 1
        acp_id = service.store.session(sid)["acpSessionId"]
        await asyncio.gather(service.stop(sid), service.open(sid))
        state = service.store.session(sid)
        assert state["runtime"] == "ready" and state["acpSessionId"] == acp_id
        assert state["activeTurnId"] is None and state["turnStatus"] == "cancelled"
        assert state["generation"] == 2
    finally:
        await service.close()


def test_mcp_path_containment(tmp_path, monkeypatch):
    workspace, generated = tmp_path / "workspace", tmp_path / "codex/generated_images"
    workspace.mkdir(); generated.mkdir(parents=True)
    secret = tmp_path / "auth.json"; secret.write_text("private")
    image = workspace / "image.png"; image.write_bytes(png())
    (workspace / "escape.png").symlink_to(secret)
    monkeypatch.setenv("CRAFTY_MCP_WORKSPACE", str(workspace))
    monkeypatch.setenv("CRAFTY_MCP_GENERATED_ROOT", str(generated))
    assert readable_image_path("image.png") == image
    with pytest.raises(ValueError): readable_image_path(str(secret))
    with pytest.raises(ValueError): readable_image_path("escape.png")


@pytest.mark.asyncio
async def test_actual_mcp_stdio_registration(tmp_path):
    params = StdioServerParameters(command=sys.executable, args=["-m", "crafty_agent.mcp_server"], env={
        **os.environ, "CRAFTY_MCP_WORKSPACE": str(tmp_path), "CRAFTY_MCP_GENERATED_ROOT": str(tmp_path / "generated")})
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await session.list_tools()
            assert {t.name for t in tools.tools} == {"list_images", "fetch_image", "publish_image", "request_camera"}
            result = await session.call_tool("publish_image", {"local_path": "/etc/passwd", "title": "Forbidden"})
            assert result.isError
