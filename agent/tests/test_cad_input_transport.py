"""Real scoped MCP and native STEP transport; modeling is an explicit test actor.

CRAFTY_TEST_CAD_INPUT may name an operator-supplied COPY for a separately reported
diagnostic execution. The default fixture has independent analytic cap criteria.
"""
import asyncio
import json
import math
import os
from pathlib import Path
import socket

import pytest
import uvicorn

from crafty_agent.cad_files import atomic, canonical, digest
from crafty_agent.http import create_app
from test_cad_backend import backend, task
from test_cad_transport import mcp


async def completed(model, eid):
    async with asyncio.timeout(50):
        while True:
            result = await model.call_tool("cad_wait", {"evaluation_id": eid})
            assert not result.isError, result
            if result.structuredContent["status"] not in {"queued", "running"}:
                return result


@pytest.mark.asyncio
async def test_cad_real_file_handoff_ensure_warm_step(backend):
    service, sid, actor, _ = backend
    supplied = os.environ.get("CRAFTY_TEST_CAD_INPUT")
    source = Path(supplied) if supplied else Path(__file__).with_name("cad_inputs") / "nurbs-cap.step"
    original = source.read_bytes()
    workspace = service.runtime(sid).workspace
    atomic(workspace / "existing.step", original)
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
            attach = {"idempotency_key": "existing-file", "path": "existing.step", "kind": "step"}
            attached = await chat.call_tool("attach_input_file", attach)
            assert not attached.isError, attached
            metadata = attached.structuredContent
            assert metadata["sha256"] == digest(original) and metadata["validation"] == "unverified_input"
            # Same filename changing after capture cannot alter the task's input.
            atomic(workspace / "existing.step", b"changed after immutable capture")
            conflict = await chat.call_tool("attach_input_file", attach)
            assert conflict.isError
            metrics = [
                {"id": "valid", "kind": "validity", "target": {"part": "cap"}, "unit": "1", "criterion": {"equals": True}},
                {"id": "solids", "kind": "solid_count", "target": {"part": "cap"}, "unit": "1", "criterion": {"equals": 1}},
                *[{"id": axis, "kind": "bbox_extent", "target": {"part": "cap"}, "unit": "mm", "axis": axis,
                   "criterion": {"equals": value, "absolute_tolerance": .001}} for axis, value in (("x", 70), ("y", 70), ("z", 16))],
                {"id": "volume", "kind": "volume", "target": {"part": "cap"}, "unit": "mm^3"}]
            if not supplied:
                metrics[-1]["criterion"] = {"equals": (35**2*16-33**2*14)*math.pi, "absolute_tolerance": .001}
            outputs = [{"id": "iso", "kind": "png", "parts": ["cap"],
                        "view": {"preset": "isometric", "width": 1024, "height": 768}, "annotations": {"inline": True, "json": True}},
                       {"id": "model", "kind": "step", "parts": ["cap"]}]
            accepted = await chat.call_tool("request_part", task(input_file_ids=[metadata["inputFileId"]],
                brief="Explicit deterministic/manual input transport actor; import unchanged STEP using a declared adapter.",
                title="Existing STEP transport", outputs=outputs, metrics=metrics))
            assert not accepted.isError, accepted
            oid = accepted.structuredContent["operationId"]
            async with asyncio.timeout(3):
                while actor.operation_id != oid:
                    await asyncio.sleep(.01)
            async with mcp(service, sid, actor, "model") as model:
                fetched = await model.call_tool("fetch_input_file", {"input_file_id": metadata["inputFileId"]})
                assert not fetched.isError, fetched
                fetched_path = Path(fetched.structuredContent["local_path"])
                assert fetched_path.read_bytes() == original
                folder = actor.workspace / "adapter"
                atomic(folder / "existing.step", fetched_path.read_bytes())
                atomic(folder / "model.py", b"def build(parameters, inputs):\n    import Part\n    shape = Part.Shape()\n    shape.read(inputs['existing.step'])\n    return {'parts': {'cap': shape}, 'features': {}}\n")
                request = {"schema_version": 1, "source": "model.py", "parameters": {},
                           "inputs": {"existing.step": "existing.step"}, "outputs": outputs, "metrics": metrics}
                atomic(folder / "request.json", canonical(request))
                ensured = await model.call_tool("cad_ensure", {"request_path": "adapter/request.json", "idempotency_key": "ensure"})
                assert not ensured.isError, ensured
                ready = await completed(model, ensured.structuredContent["evaluationId"])
                assert not ready.isError and ready.structuredContent["status"] == "completed", ready
                handle = ready.structuredContent["geometry"]["handle"]
                digest_before = ready.structuredContent["geometry"]["geometry_digest"]
                query = {**request, "geometry": {"handle": handle}, "inputs": {}}
                query.pop("source")
                atomic(folder / "request.json", canonical(query))
                evaluated = await model.call_tool("cad_evaluate", {"request_path": "adapter/request.json", "idempotency_key": "warm"})
                assert not evaluated.isError, evaluated
                evidence = await completed(model, evaluated.structuredContent["evaluationId"])
                assert not evidence.isError and evidence.structuredContent["status"] == "completed", evidence
                result = json.loads(Path(evidence.structuredContent["result_path"]).read_bytes())
                assert all(m["status"] in {"pass", "measured"} for m in result["metrics"]), result["metrics"]
                assert all(a["status"] == "ready" for a in result["artifacts"]), result["artifacts"]
                assert result["geometry"]["geometry_digest"] == digest_before
                counts = service.cad.public(sid, oid)["reuse"]
                assert counts == {"sourceExecutions": 1, "builds": 1, "loads": 1, "restores": 0, "queries": 1}
                published = await model.call_tool("result_publish", {"evaluation_id": evidence.structuredContent["evaluationId"],
                    "artifact_ids": ["iso", "model"], "interpretation": "Explicit test actor; actual native file transport, not live CAD reasoning acceptance.",
                    "inspected_image_ids": ["iso"]})
                assert not published.isError, published
                actor.finished.set()
                atomic(service.settings.data.parent / "input-transport-report.json", canonical({
                    "schema_version": 1, "actor": "manual_test_actor", "sessionId": sid, "operationId": oid,
                    "suppliedCopy": str(source), "input": metadata, "unchangedOriginal": source.read_bytes() == original,
                    "resultPath": evidence.structuredContent["result_path"], "metrics": result["metrics"],
                    "artifacts": result["artifacts"], "reuse": counts, "publication": published.structuredContent}))
            assert source.read_bytes() == original
    finally:
        server.should_exit = True
        await serving
        sock.close()
