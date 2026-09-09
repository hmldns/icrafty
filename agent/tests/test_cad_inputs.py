"""Immutable input handoff tests; test actors never stand in for live CAD acceptance."""
import json
import os

from jsonschema import Draft202012Validator
import pytest

from crafty_agent.cad_files import atomic, canonical, capture_request, digest
from crafty_agent.cad_inputs import CadInputs, capture
from crafty_agent.cad_protocol import EXAMPLES, validate_tool
from test_cad_backend import backend, start, task


def test_cad_input_capture_paths_links_and_frozen_bytes(tmp_path):
    source = tmp_path / "model.py"
    source.write_bytes(b"# unchanged supplied source\n")
    captured = capture(tmp_path, "model.py", "python_source")
    source.write_bytes(b"# a later revision\n")
    assert captured["sha256"] == digest(b"# unchanged supplied source\n")
    for path in (str(source), "../model.py", "./model.py", "a//model.py", "a\\model.py"):
        with pytest.raises(ValueError):
            capture(tmp_path, path, "python_source")
    (tmp_path / "link.py").symlink_to(source)
    (tmp_path / "parent").symlink_to(tmp_path, target_is_directory=True)
    for path in ("link.py", "parent/model.py"):
        with pytest.raises(OSError):
            capture(tmp_path, path, "python_source")
    os.mkfifo(tmp_path / "pipe.py")
    with pytest.raises(ValueError, match="regular"):
        capture(tmp_path, "pipe.py", "python_source")
    with pytest.raises(ValueError, match="extension"):
        capture(tmp_path, "model.py", "step")
    with pytest.raises(ValueError, match="bounded"):
        capture(tmp_path, "model.py", "python_source", limit=2)
    source.write_bytes(b"")
    with pytest.raises(ValueError, match="nonempty"):
        capture(tmp_path, "model.py", "python_source")


async def upload(client, sid, data=b"supplied input", key="input", filename="part.step", kind="step"):
    return await client.post(f"/api/agent/sessions/{sid}/cad/inputs", params={"filename": filename, "kind": kind},
        content=data, headers={"Content-Type": "application/octet-stream", "Idempotency-Key": key})


@pytest.mark.asyncio
async def test_cad_input_upload_immutable_scope_task_and_restart(backend):
    service, sid, actor, client = backend
    response = await upload(client, sid)
    assert response.status_code == 200, response.text
    item = response.json()
    Draft202012Validator(json.loads((EXAMPLES / "input-file-v1.schema.json").read_text())).validate(item)
    fid = item["inputFileId"]
    assert item["validation"] == "unverified_input" and "url" not in item and "path" not in item
    assert (await upload(client, sid)).json() == item
    assert (await upload(client, sid, data=b"changed input")).status_code == 400
    other = service.store.create_session()["id"]
    with pytest.raises(KeyError): service.cad.inputs.get(other, fid)
    with pytest.raises(KeyError):
        await service.cad.request(other, "request_part", task(input_file_ids=[fid]))
    assert service.cad.store.operations(other) == []
    oid = await start(backend, task(input_file_ids=[fid]))
    operation = service.cad.store.operation(sid, oid)
    assert operation["task"]["input_files"] == [item]
    headers = {"Authorization": "Bearer " + actor.token}
    route = f"/internal/cad/model/{sid}/fetch_input_file"
    reply = await client.post(route, headers=headers, json={"arguments": {"input_file_id": fid}})
    assert reply.status_code == 200, reply.text
    content = await client.get(reply.json()["fetchUrl"], headers=headers)
    assert content.content == b"supplied input"
    omitted = (await upload(client, sid, key="omitted")).json()["inputFileId"]
    assert (await client.post(route, headers=headers, json={"arguments": {"input_file_id": omitted}})).status_code == 404
    assert (await client.get(reply.json()["fetchUrl"])).status_code == 403
    await service.cad.cancel(sid, oid)
    assert (await client.get(reply.json()["fetchUrl"], headers=headers)).status_code == 409
    # Recreate the integration store over durable state; original bytes/IDs survive.
    restored = CadInputs(service.cad.store)
    assert restored.get(sid, fid) == (item, b"supplied input")
    atomic(service.cad.store.root / "inputs" / sid / fid, b"tampered")
    with pytest.raises(ValueError, match="digest"):
        restored.get(sid, fid)


@pytest.mark.asyncio
async def test_cad_input_transfer_digest_turn_fence_and_limits(backend, monkeypatch):
    service, sid, actor, client = backend
    workspace = service.runtime(sid).workspace
    workspace.mkdir(parents=True, exist_ok=True)
    (workspace / "original.py").write_bytes(b"print('unverified original')\n")
    args = {"idempotency_key": "capture", "path": "original.py", "kind": "python_source"}
    file = capture(workspace, args["path"], args["kind"])
    route = f"/internal/cad/chat/{sid}/attach_input_file"
    headers = {"Authorization": "Bearer test-chat-token"}
    reply = await client.post(route, headers=headers, json={"arguments": args, "file": file})
    assert reply.status_code == 200, reply.text
    fid = reply.json()["inputFileId"]
    assert service.cad.inputs.get(sid, fid)[1] == (workspace / "original.py").read_bytes()
    corrupt = {**file, "sha256": "0" * 64}
    assert (await client.post(route, headers=headers, json={"arguments": {**args, "idempotency_key": "corrupt"}, "file": corrupt})).status_code == 400
    service.cad.inputs.maximum = 8
    assert (await upload(client, sid, b"123456789", key="large")).status_code == 413
    assert (await upload(client, sid, b"", key="empty")).status_code == 400
    assert (await upload(client, sid, b"123", key="bad-ext", filename="file.py")).status_code == 400
    a = (await upload(client, sid, b"12345", key="first")).json()["inputFileId"]
    b = (await upload(client, sid, b"67890", key="second")).json()["inputFileId"]
    with pytest.raises(ValueError, match="aggregate"):
        await service.cad.request(sid, "request_part", task(input_file_ids=[a, b]))
    with pytest.raises(ValueError): validate_tool("crafty_cad", "request_part", task(input_file_ids=[a, a]))
    assert service.cad.store.operations(sid) == []
    # Cancellation during streaming must not save a late attachment.
    from starlette.requests import Request
    original = Request.stream
    async def cancel_stream(request):
        async for chunk in original(request):
            yield chunk
            service.runtime(sid).cancelled = True
    monkeypatch.setattr(Request, "stream", cancel_stream)
    service.cad.inputs.maximum = 16*1024*1024
    response = await client.post(route, headers=headers, json={"arguments": {**args, "idempotency_key": "cancelled"}, "file": file})
    assert response.status_code == 409
    assert service.store.db.execute("SELECT COUNT(*) FROM cad_inputs WHERE command_key='cancelled'").fetchone()[0] == 0


@pytest.mark.asyncio
async def test_cad_attached_file_aggregate_still_includes_evaluator_source(backend):
    service, sid, actor, client = backend
    service.cad.inputs.maximum = 2048
    file = (await upload(client, sid, b"X"*2048)).json()
    oid = await start(backend, task(input_file_ids=[file["inputFileId"]]))
    operation = service.cad.store.operation(sid, oid)
    atomic(actor.workspace / "input.step", b"X"*2048)
    atomic(actor.workspace / "model.py", b"def build(parameters,inputs): pass\n")
    request = {"schema_version": 1, "source": "model.py", "parameters": {}, "inputs": {"original.step": "input.step"},
               "outputs": operation["task"]["outputs"], "metrics": operation["task"]["metrics"]}
    atomic(actor.workspace / "request.json", canonical(request))
    with pytest.raises(ValueError, match="budget"):
        capture_request(actor.workspace, "request.json", limit=2048)
