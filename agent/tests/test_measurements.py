import hashlib
import sqlite3

import httpx
import pytest

from crafty_agent.http import create_app
from crafty_agent.measurements import bind_result, prepare_answer
from test_integration import settings, png, settled


@pytest.mark.asyncio
async def test_measurement_answers_are_scoped_atomic_and_idempotent(settings):
    app = create_app(settings)
    async with app.router.lifespan_context(app), httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        service = app.state.service
        sid = (await client.post("/api/agent/sessions")).json()["session"]["id"]
        other = service.store.create_session()["id"]
        runtime = service.runtime(sid)
        auth = {"Authorization": f"Bearer {runtime.token}"}
        asset = service.store.add_image(sid, png(), "Rim", "upload")
        form = {"title": "Measure the rim", "caption": "Use your caliper", "image_ids": [asset["id"]],
                "fields": [{"id": "diameter", "label": "Inside diameter", "unit": "mm"},
                           {"id": "depth", "label": "Seat depth", "unit": "mm"},
                           {"id": "fit", "label": "Fit", "kind": "text", "unit": None}]}
        url = f"/internal/mcp/{sid}/dimensions"
        assert (await client.post(url, json=form, headers=auth)).status_code == 409
        turn = await service.prompt(sid, "ask", "slow", [])
        assert (await client.post(url, json=form)).status_code == 403
        assert (await client.post(url, json={**form, "image_ids": ["foreign"]}, headers=auth)).status_code == 404
        assert (await client.post(url, json={**form, "fields": [form["fields"][0]] * 2}, headers=auth)).status_code == 422
        response = await client.post(url, json=form, headers=auth)
        assert response.status_code == 200, response.text
        result = response.json()
        request_id = result["requestId"]
        await runtime.event({"method": "session/update", "params": {"sessionId": service.store.session(sid)["acpSessionId"],
            "update": {"sessionUpdate": "tool_call", "toolCallId": "measure-tool", "status": "completed",
                       "rawInput": {"server": "crafty_forms", "tool": "request_dimensions", "arguments": form},
                       "rawOutput": {"result": {"structuredContent": result}}}}})
        answer_url = f"/api/agent/sessions/{sid}/measurements/{request_id}"
        answer = {"clientMessageId": "answer", "answers": {"diameter": "83.4", "fit": "Lift-off dust cover"}}
        assert (await client.post(answer_url, json=answer)).status_code == 409
        assert service.store.interaction(sid, request_id)["status"] == "awaiting_answers"
        await runtime.cancel()
        assert (await client.post(f"/api/agent/sessions/{other}/measurements/{request_id}", json=answer)).status_code == 404
        for answers in ({}, {"unknown": "1"}, {"diameter": "NaN"}, {"diameter": "-1"}, {"diameter": "100001"}):
            assert (await client.post(answer_url, json={**answer, "answers": answers})).status_code == 400
        assert (await client.post(answer_url, json={**answer, "answers": {"diameter": True}})).status_code == 422
        accepted = await client.post(answer_url, json=answer)
        assert accepted.status_code == 202, accepted.text
        duplicate = await client.post(answer_url, json=answer)
        assert duplicate.json()["id"] == accepted.json()["id"]
        await settled(service, sid)
        interaction = service.store.interaction(sid, request_id)
        assert interaction["status"] == "answered"
        assert interaction["responseTurnId"] == accepted.json()["id"]
        assert interaction["answers"] == {"diameter": 83.4, "fit": "Lift-off dust cover"}
        record = service.store.record(sid, "measure-tool")
        assert record["rawOutput"]["answers"] == interaction["answers"]
        messages = [r for r in service.store.records(sid) if r.get("author") == "you"]
        assert len(messages) == 2
        assert "Inside diameter: 83.4 mm" in messages[-1]["text"]
        assert "Seat depth: not measured / unknown" in messages[-1]["text"]
        assert messages[-1]["imageIds"] == []
        assert (await client.post(answer_url, json={**answer, "answers": {"diameter": "85"}})).status_code == 400
        late = {**record, "rawOutput": result}
        bind_result(service.store, sid, late, turn["id"])
        assert late["rawOutput"]["answers"] == interaction["answers"]
        # A failed turn insert must roll back its interaction and tool updates too.
        text, images, changed, changed_record = prepare_answer(service.store, sid, request_id, {"diameter": "99"})
        with pytest.raises(sqlite3.IntegrityError):
            service.store.create_turn(sid, accepted.json()["clientMessageId"], text, images, "other",
                                      interaction=changed, tool_record=changed_record)
        assert service.store.interaction(sid, request_id)["answers"] == interaction["answers"]
        assert service.store.record(sid, "measure-tool")["rawOutput"]["answers"] == interaction["answers"]
        await service.stop(sid)
        assert service.store.snapshot(sid)["interactions"][-1]["status"] == "answered"


@pytest.mark.asyncio
async def test_measurement_guides_are_scoped_mapped_and_retained(settings):
    app = create_app(settings)
    async with app.router.lifespan_context(app), httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        service = app.state.service
        sid = (await client.post("/api/agent/sessions")).json()["session"]["id"]
        source = service.store.add_image(sid, png(), "Original mug", "upload")
        guide = service.store.add_image(sid, png(), "Caliper placement A–B", "generated")
        other = service.store.create_session()["id"]
        foreign = service.store.add_image(other, png(), "Other guide", "generated")
        form = {"title": "Measure with the sketch", "image_ids": [source["id"]],
                "fields": [{"id": "A", "label": "A — Inside diameter", "unit": "mm"}],
                "guides": [{"image_id": guide["id"], "field_ids": ["A"]}]}
        runtime = service.runtime(sid)
        await service.prompt(sid, "ask-guides", "slow", [])
        headers = {"Authorization": f"Bearer {runtime.token}"}
        path = f"/internal/mcp/{sid}/dimensions"
        assert (await client.post(path, json={**form, "guides": [{"image_id": foreign["id"], "field_ids": ["A"]}]}, headers=headers)).status_code == 404
        assert (await client.post(path, json={**form, "guides": [{"image_id": guide["id"], "field_ids": ["missing"]}]}, headers=headers)).status_code == 422
        assert (await client.post(path, json={**form, "guides": form["guides"] * 4}, headers=headers)).status_code == 422
        assert (await client.post(path, json={**form, "guides": [{"image_id": source["id"], "field_ids": ["A"]}], "image_ids": []}, headers=headers)).status_code == 400
        response = await client.post(path, json=form, headers=headers)
        assert response.status_code == 200, response.text
        value = response.json()
        expected = [{"image": {"assetId": guide["id"], "versionId": guide["versionId"]}, "fieldIds": ["A"]}]
        assert value["guides"] == expected
        text, images, answered, _ = prepare_answer(service.store, sid, value["requestId"], {"A": "20"})
        assert "A — Inside diameter: 20 mm" in text and images == []
        assert answered["guides"] == expected and answered["photos"][0]["assetId"] == source["id"]
        await runtime.cancel()


def test_guide_publisher_retains_the_real_image_reference_without_an_image_card(tmp_path, monkeypatch):
    from crafty_agent import mcp_forms
    image = tmp_path / "guide.png"
    image.write_bytes(png())
    monkeypatch.setenv("CRAFTY_MCP_WORKSPACE", str(tmp_path))
    monkeypatch.setenv("CRAFTY_MCP_GENERATED_ROOT", str(tmp_path / "generated"))
    calls = []
    def publish(path, **kwargs):
        calls.append((path, kwargs))
        return {"schema_version": 1, "view": "image", "image": {"assetId": "published", "versionId": "1"}}
    monkeypatch.setattr(mcp_forms, "call", publish)
    result = mcp_forms.publish_measurement_guide(str(image), "Caliper placement")
    assert calls[0][0] == "/publish" and calls[0][1]["body"] == image.read_bytes()
    assert result["view"] == "measurement_guide" and result["image"]["assetId"] == "published"


@pytest.mark.asyncio
async def test_sample_catalog_serves_the_four_original_images(settings):
    app = create_app(settings)
    async with app.router.lifespan_context(app), httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        sample = (await client.get("/api/agent/samples")).json()["samples"][0]
        assert sample["id"] == "mug-cap" and len(sample["photos"]) == 4
        for photo in sample["photos"]:
            response = await client.get(photo["url"])
            assert response.status_code == 200
            assert response.headers["content-type"] == "image/png"
            assert hashlib.sha256(response.content).hexdigest() == photo["digest"]
        assert (await client.get("/api/agent/samples/mug-cap/images/unknown")).status_code == 404
