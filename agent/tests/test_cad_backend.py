"""Deterministic application tests. ManualReasoner is explicitly NOT live ACP evidence."""
import asyncio
import copy
import json
import math
from pathlib import Path
import sys

import httpx
from jsonschema import Draft202012Validator
import pytest
import pytest_asyncio

from crafty_agent.cad_files import atomic, canonical, capture_request, digest, unpack
from crafty_agent.cad_protocol import EXAMPLES, SCHEMAS, validate_tool
from crafty_agent.cad_publication import publish
from crafty_agent.config import Settings
from crafty_agent.http import create_app
from crafty_agent.service import AgentService
from crafty_agent.store import identifier

ROOT = Path(__file__).resolve().parents[2]


class ManualReasoner:
    """Test-controlled modeling actor; native geometry is still evaluated for real."""
    def __init__(self, owner, sid):
        self.owner, self.sid = owner, sid
        self.workspace = owner.store.root / "test-modeler" / sid
        self.workspace.mkdir(parents=True)
        self.token, self.generation, self.permissions = "test-cad-token", 1, {}
        self.operation_id, self.reply = None, "Explicit test actor"
        self.finished = asyncio.Event()

    async def run(self, operation):
        self.operation_id = operation["id"]
        self.finished.clear()
        state = self.owner.store.session(self.sid)
        state.update(generation=self.generation, runtime="ready")
        self.owner.store.put_session(self.sid, state)
        await self.finished.wait()
        return {"stopReason": "end_turn"}

    async def cancel(self):
        self.finished.set()

    async def close(self):
        await self.cancel()


@pytest_asyncio.fixture
async def backend(tmp_path):
    settings = Settings(data=tmp_path / "state", auth_source=None,
                        adapter=(sys.executable, str(Path(__file__).with_name("fake_acp.py"))), cancel_timeout=1)
    service = AgentService(settings, "http://127.0.0.1:8807")
    sid = service.store.create_session()["id"]
    service.store.update_session(sid, runtime="ready", generation=1)
    service.store.create_turn(sid, "test-origin", "Explicit deterministic CAD test", [], "test-digest")
    runtime = service.runtime(sid)
    runtime.token, runtime.generation = "test-chat-token", 1
    actor = ManualReasoner(service.cad, sid)
    service.cad.agents[sid] = actor
    app = create_app(settings)
    app.state.service = service
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        try:
            yield service, sid, actor, client
        finally:
            await service.close()


def task(**patch):
    value = json.loads((EXAMPLES / "request-part-v1.json").read_text())
    value["idempotency_key"] = identifier()
    value.update(patch)
    return value


async def start(backend, requested=None):
    service, sid, actor, _ = backend
    value = await service.cad.request(sid, "request_part", requested or task())
    async with asyncio.timeout(3):
        while actor.operation_id != value["operationId"]:
            await asyncio.sleep(0.005)
    return value["operationId"]


def bundle(actor, operation, *, source=None, radius=10, geometry=None):
    request = json.loads((ROOT / "cad/examples/cylinder/request.json").read_text())
    request.update(outputs=operation["task"]["outputs"], metrics=operation["task"]["metrics"])
    request["parameters"]["radius_mm"] = radius
    if geometry:
        request.pop("source")
        request.update(geometry=geometry, parameters={})
    else:
        atomic(actor.workspace / "model.py", (source or (ROOT / "cad/examples/cylinder/model.py").read_text()).encode())
    atomic(actor.workspace / "request.json", canonical(request))
    return capture_request(actor.workspace, "request.json")


async def evaluate(backend, oid, *, key=None, **options):
    service, sid, actor, _ = backend
    operation = service.cad.store.operation(sid, oid)
    request_bundle = bundle(actor, operation, **options)
    value = await service.cad.submit(sid, oid, "cad_evaluate", {"request_path": "request.json", "idempotency_key": key or identifier()}, request_bundle)
    result = await service.cad.wait_evaluation(sid, value["evaluationId"])
    assert result["status"] == "completed", result
    return result


def publication(backend, oid, evaluation, *, mode="together"):
    service, sid, actor, _ = backend
    result = publish(service.cad, sid, oid, {"evaluation_id": evaluation["evaluationId"],
        "artifact_ids": [item["id"] for item in evaluation["artifacts"]], "interpretation": "Deterministic actor inspected test evidence",
        "inspected_image_ids": [item["id"] for item in evaluation["artifacts"] if item["kind"] == "png" and item["status"] == "ready"],
        "message_mode": mode})
    actor.finished.set()
    return result


async def terminal(service, sid, oid):
    async with asyncio.timeout(8):
        while True:
            result = service.cad.public(sid, oid)
            if result["status"] in {"completed", "failed", "cancelled", "interrupted"}:
                return result
            await asyncio.sleep(0.01)


def test_cad_schemas_and_nonfinite_inputs():
    for schema in SCHEMAS.values():
        Draft202012Validator.check_schema(schema)
    example = json.loads((EXAMPLES / "application-result-v1.json").read_text())["rawOutput"]
    Draft202012Validator(json.loads((EXAMPLES / "application-result-v1.schema.json").read_text())).validate(example)
    validate_tool("crafty_cad", "request_part", task())
    with pytest.raises(ValueError):
        validate_tool("crafty_cad", "request_part", task(bad_field="unsupported"))
    malformed = task()
    malformed["metrics"][2]["criterion"]["equals"] = math.nan
    with pytest.raises(ValueError):
        validate_tool("crafty_cad", "request_part", malformed)


def test_cad_transfer_paths_digests_and_frozen_names(tmp_path):
    atomic(tmp_path / "request.json", canonical({"source": "model.py", "inputs": {}}))
    atomic(tmp_path / "model.py", b"original")
    captured = capture_request(tmp_path, "request.json")
    atomic(tmp_path / "model.py", b"changed")
    unpack(captured, tmp_path / "copy", 1024)
    assert (tmp_path / "copy/model.py").read_bytes() == b"original"
    corrupt = copy.deepcopy(captured)
    corrupt["files"][0]["sha256"] = "0" * 64
    with pytest.raises(ValueError): unpack(corrupt, tmp_path / "bad", 1024)
    with pytest.raises(ValueError): capture_request(tmp_path, "../outside.json")
    (tmp_path / "symlink.json").symlink_to(tmp_path / "request.json")
    with pytest.raises(ValueError): capture_request(tmp_path, "symlink.json")


@pytest.mark.asyncio
async def test_cad_native_publication_reuse_step_download_revision_and_restore(backend):
    service, sid, actor, client = backend
    oid = await start(backend)
    evaluation = await evaluate(backend, oid)
    result = publication(backend, oid, evaluation)
    assert result["reuse"] == {"sourceExecutions": 1, "builds": 1, "loads": 1, "restores": 0, "queries": 1}
    assert all(metric["status"] == "pass" for metric in result["metrics"])
    assert result["model"] is None and result["downloads"] == []
    assert len(service.store.assets(sid)) == 1
    image = await client.get(service.store.assets(sid)[0]["url"])
    assert digest(image.content) == result["outputs"][0]["sha256"]
    rid, geometry_digest = result["revision"]["id"], result["geometry"]["digest"]
    evidence = {"idempotency_key": "export-1", "revision_id": rid, "outputs": [{"id": "part", "kind": "step", "parts": ["body"]}], "metrics": task()["metrics"]}
    accepted = await service.cad.request(sid, "request_evidence", evidence)
    exported = await terminal(service, sid, accepted["operationId"])
    assert exported["status"] == "completed", exported
    assert exported["reuse"]["sourceExecutions"] == 0 and exported["reuse"]["loads"] == 0
    assert exported["geometry"]["digest"] == geometry_digest and exported["revision"]["id"] == rid
    response = await client.get(exported["model"]["downloadUrl"])
    assert response.status_code == 200 and "attachment" in response.headers["content-disposition"]
    assert digest(response.content) == exported["model"]["sha256"]
    other = service.store.create_session()["id"]
    assert (await client.get(exported["model"]["url"].replace(sid, other))).status_code == 404
    assert await service.cad.request(sid, "request_evidence", evidence) == exported
    with pytest.raises(ValueError):
        await service.cad.request(sid, "request_evidence", {**evidence, "metrics": []})
    await service.cad.stop_session(sid)
    unavailable = await service.cad.request(sid, "request_evidence", {**evidence, "idempotency_key": "stale-1"})
    unavailable = await terminal(service, sid, unavailable["operationId"])
    assert unavailable["error"]["code"] == "geometry_unavailable"
    restored = await service.cad.request(sid, "restore_geometry", {"idempotency_key": "restore-1", "revision_id": rid})
    restored = await terminal(service, sid, restored["operationId"])
    assert restored["status"] == "completed", restored
    assert restored["reuse"] == {"sourceExecutions": 0, "builds": 0, "loads": 1, "restores": 1, "queries": 0}
    after = await service.cad.request(sid, "request_evidence", {**evidence, "idempotency_key": "restored-query"})
    after = await terminal(service, sid, after["operationId"])
    assert after["status"] == "completed" and after["geometry"]["digest"] == geometry_digest
    revised = task(parent_revision_id=rid)
    revised["metrics"][2]["criterion"]["equals"] = 24
    revised["metrics"][3]["criterion"]["equals"] = math.pi * 12 ** 2 * 20
    oid2 = await start(backend, revised)
    evaluation2 = await evaluate(backend, oid2, radius=12)
    result2 = publication(backend, oid2, evaluation2)
    assert result2["revision"]["id"] != rid and result2["revision"]["parentRevisionId"] == rid
    assert result2["geometry"]["digest"] != geometry_digest
    assert service.cad.public(sid, oid)["images"] == result["images"]
    Draft202012Validator(json.loads((EXAMPLES / "application-result-v1.schema.json").read_text())).validate(result2)


@pytest.mark.asyncio
async def test_cad_fixed_criteria_duplicate_evaluation_and_changed_source(backend):
    service, sid, actor, _ = backend
    oid = await start(backend)
    operation = service.cad.store.operation(sid, oid)
    captured = bundle(actor, operation)
    args = {"request_path": "request.json", "idempotency_key": "same-evaluation"}
    first, duplicate = await asyncio.gather(service.cad.submit(sid, oid, "cad_evaluate", args, captured), service.cad.submit(sid, oid, "cad_evaluate", args, captured))
    assert first["evaluationId"] == duplicate["evaluationId"]
    await service.cad.wait_evaluation(sid, first["evaluationId"])
    request = json.loads((actor.workspace / "request.json").read_text())
    request["metrics"] = []
    atomic(actor.workspace / "request.json", canonical(request))
    with pytest.raises(ValueError, match="immutable task"):
        await service.cad.submit(sid, oid, "cad_evaluate", {**args, "idempotency_key": "relaxed"}, capture_request(actor.workspace, "request.json"))
    changed = bundle(actor, operation, source=(ROOT / "cad/examples/cylinder/model.py").read_text() + "\n# new source bytes\n")
    with pytest.raises(ValueError, match="changed bytes"):
        await service.cad.submit(sid, oid, "cad_evaluate", args, changed)


@pytest.mark.asyncio
async def test_cad_failure_and_cancel_fence_preserve_prior_assets(backend):
    service, sid, actor, _ = backend
    oid = await start(backend)
    evaluation = await evaluate(backend, oid, radius=9)
    result = publication(backend, oid, evaluation)
    assert result["status"] == "completed" and any(m["status"] == "fail" for m in result["metrics"])
    assert result["outputs"][0]["status"] == "ready"
    oid2 = await start(backend)
    evaluated = await evaluate(backend, oid2)
    await service.cad.cancel(sid, oid2)
    with pytest.raises(ValueError, match="cannot publish"):
        publication(backend, oid2, evaluated)
    assert service.cad.public(sid, oid)["outputs"][0]["status"] == "ready"
    assert service.cad.public(sid, oid2)["status"] == "cancelled"


@pytest.mark.asyncio
async def test_cad_http_scope_and_unknown_capability(backend):
    service, sid, actor, client = backend
    headers = {"Authorization": "Bearer test-chat-token"}
    route = f"/internal/cad/chat/{sid}/request_part"
    assert (await client.post(route, json={"arguments": task()})).status_code == 403
    bad = task(outputs=[{"id": "unsupported", "kind": "glb", "parts": ["body"]}])
    assert (await client.post(route, json={"arguments": bad}, headers=headers)).status_code == 400
    reply = await client.post(route, json={"arguments": task()}, headers=headers)
    assert reply.status_code == 200
    oid = reply.json()["operationId"]
    assert (await client.get(f"/api/agent/sessions/{sid}/cad/operations/{oid}")).json()["operationId"] == oid
    other = service.store.create_session()["id"]
    assert (await client.get(f"/api/agent/sessions/{other}/cad/operations/{oid}")).status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["together", "per_image"])
async def test_cad_publication_delivery_keeps_order_and_replays_once(backend, mode):
    service, sid, actor, _ = backend
    requested = task()
    iso = requested["outputs"][0]
    requested["outputs"].append({**iso, "id": "top", "view": {"preset": "top", "width": 640, "height": 480}})
    oid = await start(backend, requested)
    evaluation = await evaluate(backend, oid)
    result = publication(backend, oid, evaluation, mode=mode)
    Draft202012Validator(json.loads((EXAMPLES / "application-result-v1.schema.json").read_text())).validate(result)
    before = service.store.records(sid)
    repeated = publication(backend, oid, evaluation, mode=mode)
    assert result == repeated and before == service.store.records(sid)
    records = [r for r in before if r.get("name") == "cad.result"]
    assert len(records) == (2 if mode == "per_image" else 1)
    assert [ref for record in records for ref in record["rawOutput"]["images"]] == result["images"]


@pytest.mark.asyncio
async def test_cad_failed_source_budget_counts_and_corrupt_publication(backend):
    from dataclasses import replace
    service, sid, actor, _ = backend
    service.cad.settings = replace(service.cad.settings, max_evaluations=2)
    oid = await start(backend)
    operation = service.cad.store.operation(sid, oid)
    bad = bundle(actor, operation, source="def build(parameters, inputs):\n    raise RuntimeError('intended model failure')\n")
    accepted = await service.cad.submit(sid, oid, "cad_ensure", {"request_path": "request.json", "idempotency_key": "bad"}, bad)
    failed = await service.cad.wait_evaluation(sid, accepted["evaluationId"])
    assert failed["status"] == "failed"
    assert service.cad.public(sid, oid)["reuse"]["sourceExecutions"] == 1
    assert service.cad.store.evaluation(sid, failed["evaluationId"])["diagnostics"]["counts"]["source_executions"] == 1
    good = await evaluate(backend, oid)
    with pytest.raises(ValueError, match="budget exhausted"):
        await evaluate(backend, oid)
    saved = service.cad.store.evaluation(sid, good["evaluationId"])
    png = Path(saved["resultPath"]).parent / good["artifacts"][0]["path"]
    atomic(png, b"corrupt")
    with pytest.raises(ValueError, match="artifact changed"):
        publication(backend, oid, good)
    assert service.store.assets(sid) == []
    assert service.cad.public(sid, oid)["reuse"]["sourceExecutions"] == 2


@pytest.mark.asyncio
async def test_cad_duplicate_operation_and_cancel_during_validation(backend):
    service, sid, actor, _ = backend
    requested = task()
    a, b = await asyncio.gather(service.cad.request(sid, "request_part", requested), service.cad.request(sid, "request_part", requested))
    assert a["operationId"] == b["operationId"]
    await service.cad.cancel(sid, a["operationId"])
    runtime = service.runtime(sid)
    bridge = service.cad.bridge(sid)
    original = bridge.call
    async def cancelling(message):
        result = await original(message)
        runtime.cancelled = True
        return result
    bridge.call = cancelling
    with pytest.raises(ValueError, match="turn changed or was cancelled"):
        await service.cad.request(sid, "request_part", task())
    assert len(service.cad.store.operations(sid)) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("layout", ["separate", "grid", "both"])
@pytest.mark.parametrize("annotation", ["json", "inline", "both"])
@pytest.mark.parametrize("mode", ["together", "per_image"])
async def test_cad_cap_layout_annotation_delivery(backend, layout, annotation, mode):
    service, sid, actor, client = backend
    views = [{"id": name, "preset": preset, "width": 640, "height": 480} for name, preset in (("iso", "isometric"), ("bottom", "bottom"), ("side", "front"))]
    base = {"kind": "png", "parts": ["cap"], "annotations": {"json": annotation != "inline", "inline": annotation != "json"}}
    outputs = [{**base, "id": v["id"], "view": {k: value for k, value in v.items() if k != "id"}} for v in views] if layout != "grid" else []
    if layout != "separate":
        outputs.append({**base, "id": "overview", "grid": {"columns": 3, "views": views}})
    requested = task(title="Synthetic cap adapter acceptance", outputs=outputs, metrics=json.loads((ROOT / "cad/fixtures/cap/criteria.json").read_text()))
    oid = await start(backend, requested)
    evaluation = await evaluate(backend, oid, source=(ROOT / "cad/fixtures/cap/model.py").read_text())
    result = publication(backend, oid, evaluation, mode=mode)
    assert [m["status"] for m in result["metrics"]] == ["pass"] * 10 + ["measured"]
    assert result["reuse"]["sourceExecutions"] == 1
    assert len(result["images"]) == len(outputs) and result["model"] is None
    for output in result["outputs"]:
        assert output["annotations"]["inline"] == (annotation != "json")
        assert len(output["views"]) == (3 if output["id"] == "overview" else 1)
        if annotation != "inline":
            sidecar = output["annotations"]["file"]
            response = await client.get(sidecar["url"])
            assert digest(response.content) == sidecar["sha256"]
        else:
            assert "file" not in output["annotations"]
    assert publication(backend, oid, evaluation, mode=mode) == result


@pytest.mark.asyncio
async def test_cad_missing_selection_preserves_ready_outputs(backend):
    service, sid, actor, _ = backend
    requested = task()
    requested["outputs"].append({**requested["outputs"][0], "id": "missing", "parts": ["absent"]})
    oid = await start(backend, requested)
    operation = service.cad.store.operation(sid, oid)
    accepted = await service.cad.submit(sid, oid, "cad_evaluate", {"request_path": "request.json", "idempotency_key": "partial"}, bundle(actor, operation))
    evaluation = await service.cad.wait_evaluation(sid, accepted["evaluationId"])
    result = publication(backend, oid, evaluation)
    assert result["outputs"][0]["status"] == "ready" and result["images"]
    assert result["outputs"][1]["status"] == "unavailable" and isinstance(result["outputs"][1]["reason"], dict)
    assert result["status"] == "completed" and result["metrics"][0]["status"] == "pass"
    Draft202012Validator(json.loads((EXAMPLES / "application-result-v1.schema.json").read_text())).validate(result)


@pytest.mark.asyncio
async def test_cad_store_recovery_never_replays_uncertain_source(backend):
    from crafty_agent.cad_store import CadStore
    service, sid, actor, _ = backend
    oid = await start(backend)
    evaluation = await evaluate(backend, oid)
    revision = service.cad.public(sid, oid)["revision"]["id"]
    before = service.cad.public(sid, oid)["reuse"]
    service.cad.store.recover()
    recovered = CadStore(service.store)
    assert recovered.operation(sid, oid)["public"]["status"] == "interrupted"
    assert recovered.operation(sid, oid)["public"]["reuse"] == before
    assert recovered.revision(sid, revision)["availability"] == "snapshot"
    assert Path(recovered.evaluation(sid, evaluation["evaluationId"])["resultPath"]).is_file()
    with pytest.raises(ValueError, match="cannot publish"):
        publication(backend, oid, evaluation)
