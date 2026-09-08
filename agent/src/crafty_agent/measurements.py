"""Validated, durable measurement requests; no model loop waits on a browser form."""
from __future__ import annotations

import math
from typing import Literal

from fastapi import Request
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .store import identifier, now


class DimensionField(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^[a-zA-Z][a-zA-Z0-9_-]{0,39}$")
    label: str = Field(min_length=1, max_length=160)
    kind: Literal["number", "text"] = "number"
    unit: Literal["mm", "cm", "in", "degrees"] | None = "mm"
    hint: str = Field(default="", max_length=500)

    @model_validator(mode="after")
    def measured_unit(self):
        if self.kind == "number" and self.unit is None:
            raise ValueError("Number fields need an explicit unit")
        if self.kind == "text":
            self.unit = None
        return self


class DimensionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=160)
    caption: str = Field(default="", max_length=2000)
    fields: list[DimensionField] = Field(min_length=1, max_length=12)
    image_ids: list[str] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def unique_ids(self):
        if len({field.id for field in self.fields}) != len(self.fields):
            raise ValueError("Measurement field IDs must be unique")
        if len(set(self.image_ids)) != len(self.image_ids):
            raise ValueError("Image references must be unique")
        return self


class DimensionAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    clientMessageId: str = Field(min_length=1, max_length=120)
    answers: dict[str, str | float | None] = Field(max_length=12)


def result(interaction: dict) -> dict:
    return {"schema_version": 1, "view": "measurements", "requestId": interaction["id"],
            **{key: interaction[key] for key in ("title", "caption", "fields", "photos", "answers", "status")},
            "summary": "Measurements submitted" if interaction["status"] == "answered" else "Measurements requested"}


def create_request(store, sid: str, request: DimensionRequest) -> dict:
    state = store.session(sid)
    photos = [{"assetId": aid, "versionId": store.asset(sid, aid)["versionId"]} for aid in request.image_ids]
    interaction = {"id": identifier(), "kind": "measurements", "turnId": state["activeTurnId"],
                   "generation": state["generation"], "toolCallId": None, "createdAt": now(),
                   "title": request.title, "caption": request.caption,
                   "fields": [field.model_dump() for field in request.fields], "photos": photos,
                   "status": "awaiting_answers", "answers": {}}
    store.put_interaction(sid, interaction)
    return result(interaction)


def bind_result(store, sid: str, record: dict, turn_id: str):
    """Late tool updates cannot overwrite answers already accepted from the user."""
    request_id = (record.get("rawOutput") or {}).get("requestId")
    interaction = store.interaction(sid, request_id)
    if interaction["kind"] != "measurements" or interaction["turnId"] != turn_id:
        raise ValueError("Measurement request belongs to a different turn")
    interaction["toolCallId"] = record["toolCallId"]
    store.put_interaction(sid, interaction)
    record["rawOutput"] = result(interaction)


def prepare_answer(store, sid: str, request_id: str, answers: dict):
    interaction = store.interaction(sid, request_id)
    if interaction["kind"] != "measurements":
        raise ValueError("This interaction does not request measurements")
    fields = {field["id"]: field for field in interaction["fields"]}
    if set(answers) - fields.keys():
        raise ValueError("Answer only the requested measurement fields")
    normalized = {}
    lines = [f'Measurements — {interaction["title"]}']
    for key, field in fields.items():
        value = answers.get(key)
        if value is None or isinstance(value, str) and not value.strip():
            lines.append(f'- {field["label"]}: not measured / unknown')
            continue
        if field["kind"] == "number":
            if isinstance(value, bool):
                raise ValueError("Enter a number for " + field["label"])
            try:
                value = float(value)
            except (ValueError, TypeError):
                raise ValueError("Enter a number for " + field["label"]) from None
            if not math.isfinite(value) or not 0 <= value <= 100_000:
                raise ValueError("Measurement must be finite and between 0 and 100000")
            display = f'{value:g} {field.get("unit") or ""}'.strip()
        else:
            if not isinstance(value, str) or len(value) > 2000:
                raise ValueError("Text answers must contain at most 2000 characters")
            value = value.strip()
            display = value
        normalized[key] = value
        lines.append(f'- {field["label"]}: {display}')
    if not normalized:
        raise ValueError("Enter at least one answer, or continue in chat")
    updated = {**interaction, "answers": normalized, "status": "answered", "answeredAt": now()}
    record = store.record(sid, interaction["toolCallId"]) if interaction["toolCallId"] else None
    if record:
        record = {**record, "rawOutput": result(updated)}
    return "\n".join(lines), [photo["assetId"] for photo in interaction["photos"]], updated, record


def install_routes(app, service, scoped):
    @app.post("/internal/mcp/{sid}/dimensions")
    async def request_dimensions(request: Request, sid: str, body: DimensionRequest):
        scoped(request, sid, mutate=True)
        return create_request(service().store, sid, body)

    @app.post("/api/agent/sessions/{sid}/measurements/{request_id}", status_code=202)
    async def answer_dimensions(sid: str, request_id: str, body: DimensionAnswer):
        return await service().prompt(sid, body.clientMessageId, "", [],
                                      measurement_response=(request_id, body.answers))
