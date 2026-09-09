"""Real MCP/native transport, with an explicitly synthetic modeling actor/ACP fixture."""
import asyncio
from contextlib import asynccontextmanager
from dataclasses import replace
import json
from pathlib import Path
import socket
import sys

import pytest
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
import uvicorn

from crafty_agent.cad_files import digest
from crafty_agent.cad_protocol import SCHEMAS
from crafty_agent.cad_reasoner import CadReasoner
from crafty_agent.http import create_app
from test_cad_backend import backend, bundle, start, task


@asynccontextmanager
async def mcp(service, sid, actor, role):
    workspace = actor.workspace if role == "model" else service.runtime(sid).workspace
    workspace.mkdir(parents=True, exist_ok=True)
    server = service.cad.mcp_server(sid, actor.token if role == "model" else "test-chat-token", workspace, role)
    params = StdioServerParameters(command=server["command"], args=server["args"], env={item["name"]: item["value"] for item in server["env"]})
    async with stdio_client(params) as (reader, writer):
        async with ClientSession(reader, writer) as session:
            await session.initialize()
            yield session


@pytest.mark.asyncio
async def test_cad_real_stdio_mcp_native_ensure_materialize_publish(backend):
    service, sid, actor, _ = backend
    app = create_app(service.settings)
    app.state.service = service
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    sock.listen(128)
    service.base_url = f"http://127.0.0.1:{sock.getsockname()[1]}"
    server = uvicorn.Server(uvicorn.Config(app, lifespan="off", log_level="warning"))
    serving = asyncio.create_task(server.serve(sockets=[sock]))
    try:
        async with asyncio.timeout(3):
            while not server.started:
                await asyncio.sleep(0.01)
        async with mcp(service, sid, actor, "chat") as chat:
            listing = await chat.list_tools()
            assert {"crafty_cad." + t.name: t.inputSchema for t in listing.tools} == {k: v for k, v in SCHEMAS.items() if k.startswith("crafty_cad.")}
            resources = await chat.list_resources()
            resource = await chat.read_resource(resources.resources[0].uri)
            assert json.loads(resource.contents[0].text)["tools"] == SCHEMAS
            bad = task(outputs=[{"id": "invalid", "kind": "png_grid", "views": ["front"]}])
            rejected = await chat.call_tool("request_part", bad)
            assert rejected.isError and "absolute_tolerance" in rejected.content[0].text
            assert service.cad.store.operations(sid) == []
            accepted = await chat.call_tool("request_part", task())
            assert not accepted.isError, accepted
            oid = accepted.structuredContent["operationId"]
            async with asyncio.timeout(3):
                while actor.operation_id != oid:
                    await asyncio.sleep(0.01)
            operation = service.cad.store.operation(sid, oid)
            bundle(actor, operation)
            async with mcp(service, sid, actor, "model") as model:
                listing = await model.list_tools()
                assert {"crafty_cad_model." + t.name: t.inputSchema for t in listing.tools} == {k: v for k, v in SCHEMAS.items() if k.startswith("crafty_cad_model.")}
                ensured = await model.call_tool("cad_ensure", {"request_path": "request.json", "idempotency_key": "ensure-one"})
                assert not ensured.isError, ensured
                status = await model.call_tool("cad_wait", {"evaluation_id": ensured.structuredContent["evaluationId"]})
                assert not status.isError and status.structuredContent["status"] == "completed", status
                descriptor = status.structuredContent["geometry"]
                assert Path(status.structuredContent["snapshot_path"]).is_file()
                bundle(actor, operation, geometry={"handle": descriptor["handle"]})
                accepted = await model.call_tool("cad_evaluate", {"request_path": "request.json", "idempotency_key": "warm-query"})
                eid = accepted.structuredContent["evaluationId"]
                result = await model.call_tool("cad_wait", {"evaluation_id": eid})
                assert not result.isError, result
                received = result.structuredContent
                local = json.loads(Path(received["result_path"]).read_text())
                stored = json.loads(Path(service.cad.store.evaluation(sid, eid)["resultPath"]).read_text())
                assert local == stored
                for item in received["artifact_paths"]:
                    original = next(a for a in stored["artifacts"] if a["id"] == item["id"])
                    assert digest(Path(item["path"]).read_bytes()) == original["sha256"]
                publication = await model.call_tool("result_publish", {"evaluation_id": eid, "artifact_ids": ["iso"],
                    "interpretation": "Explicit deterministic transport fixture", "inspected_image_ids": ["iso"]})
                assert not publication.isError, publication
                assert publication.structuredContent["reuse"] == {"sourceExecutions": 1, "builds": 1, "loads": 1, "restores": 0, "queries": 1}
                actor.finished.set()
            result = await chat.call_tool("status", {"operation_id": oid})
            assert result.structuredContent["images"] and "snapshot_path" not in json.dumps(result.structuredContent)
            collected = service.settings.data.parent / "collected"
            process = await asyncio.create_subprocess_exec(sys.executable, str(Path(__file__).with_name("cad_collect.py")),
                "--session", sid, "--base-url", service.base_url, "--output", str(collected), "--state-root", str(service.settings.data),
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            stdout, stderr = await asyncio.wait_for(process.communicate(), 10)
            assert process.returncode == 0, stderr.decode()
            report = json.loads((collected / "report.json").read_text())
            assert report["downloadCount"] == 2 and report["allDownloadsVerified"]
            assert report["operations"][0]["reuse"]["sourceExecutions"] == 1
            assert not any("auth.json" in item["path"] for item in report["files"])
    finally:
        server.should_exit = True
        await serving
        sock.close()


@pytest.mark.asyncio
async def test_cad_distinct_acp_session_permission_cancel_and_same_identity_resume(backend):
    service, sid, _, client = backend
    service.settings = replace(service.settings, adapter=(sys.executable, str(Path(__file__).with_name("cad_fake_acp.py"))))
    actor = CadReasoner(service.cad, sid)
    service.cad.agents[sid] = actor
    await service.runtime(sid).ensure()
    parent = service.store.session(sid)["acpSessionId"]
    oid = (await service.cad.request(sid, "request_part", task()))["operationId"]
    async with asyncio.timeout(4):
        while not actor.permissions:
            await asyncio.sleep(0.01)
    state = service.cad.store.session(sid)
    child = state["acpSessionId"]
    assert child and child != parent
    pid = next(iter(actor.permissions))
    service.store.update_session(sid, permissions=[])
    service.cad.refresh_permissions(sid)
    assert service.store.session(sid)["permissions"][0]["role"] == "cad"
    assert (await client.post(f"/api/agent/sessions/{sid}/permissions/{pid}", json={"optionId": "not-offered"})).status_code == 400
    accepted = await client.post(f"/api/agent/sessions/{sid}/permissions/{pid}", json={"optionId": "deny"})
    assert accepted.status_code == 200, accepted.text
    await service.cad.cancel(sid, oid)
    await service.cad.stop_session(sid)
    old_generation = actor.generation
    await actor.ensure()
    assert service.cad.store.session(sid)["acpSessionId"] == child
    assert actor.generation == old_generation + 1
    rows = [json.loads(line) for line in (actor.workspace / "fixture-setup.jsonl").read_text().splitlines()]
    assert [r["method"] for r in rows] == ["session/new", "session/resume"]
    assert all(row["servers"] == ["crafty_cad_model"] for row in rows)
    parent_setup = json.loads((service.runtime(sid).workspace / "fixture-setup.jsonl").read_text().splitlines()[0])
    assert "crafty_cad" in parent_setup["servers"] and "crafty_images" in parent_setup["servers"]
    assert rows[0]["cwd"] != parent_setup["cwd"] and rows[0]["codexHome"] != parent_setup["codexHome"]
    assert (await client.post(f"/api/agent/sessions/{sid}/permissions/{pid}", json={"optionId": "allow"})).status_code == 409
