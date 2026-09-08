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
        assert messages[-1]["imageIds"] == [asset["id"]]
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
