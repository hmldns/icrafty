"""Durable application records and immutable image bytes."""
from __future__ import annotations

from datetime import datetime, timezone
import asyncio
import hashlib
from io import BytesIO
import json
import os
from pathlib import Path
import sqlite3
import uuid
import warnings

from PIL import Image, ImageOps, UnidentifiedImageError

from .config import Settings


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def identifier() -> str:
    return uuid.uuid4().hex


def encode(value) -> str:
    return json.dumps(value, separators=(",", ":"), allow_nan=False)


class Store:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._watchers: dict[str, set[asyncio.Event]] = {}
        settings.data.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(settings.data, 0o700)
        self.db = sqlite3.connect(settings.data / "state.sqlite3")
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript("""
          CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, body TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS records(position INTEGER PRIMARY KEY AUTOINCREMENT,
            session TEXT NOT NULL REFERENCES sessions(id), id TEXT NOT NULL, body TEXT NOT NULL,
            UNIQUE(session,id));
          CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY, session TEXT NOT NULL REFERENCES sessions(id),
            digest TEXT NOT NULL, body TEXT NOT NULL, UNIQUE(session,digest));
          CREATE TABLE IF NOT EXISTS turns(id TEXT PRIMARY KEY, session TEXT NOT NULL REFERENCES sessions(id),
            client_id TEXT NOT NULL, digest TEXT NOT NULL, body TEXT NOT NULL, UNIQUE(session,client_id));
          CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,
            session TEXT NOT NULL REFERENCES sessions(id), body TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS interactions(id TEXT PRIMARY KEY,
            session TEXT NOT NULL REFERENCES sessions(id), body TEXT NOT NULL);
          CREATE INDEX IF NOT EXISTS events_session ON events(session,seq);
        """)

    def _event(self, session: str, kind: str, payload: dict):
        self.db.execute("INSERT INTO events(session,body) VALUES (?,?)", (session, encode({"kind": kind, "payload": payload})))
        # Store mutations are synchronous on the owning loop. The transaction
        # commits before an awakened socket task can read the durable cursor.
        for changed in self._watchers.get(session, ()):
            changed.set()

    def watch(self, sid: str) -> asyncio.Event:
        changed = asyncio.Event()
        self._watchers.setdefault(sid, set()).add(changed)
        return changed

    def unwatch(self, sid: str, changed: asyncio.Event):
        watchers = self._watchers.get(sid)
        if watchers is not None:
            watchers.discard(changed)
            if not watchers:
                self._watchers.pop(sid)

    def create_session(self, title="New chat") -> dict:
        session = {"id": identifier(), "title": title[:120], "createdAt": now(), "updatedAt": now(),
                   "runtime": "stopped", "generation": 0, "acpSessionId": None,
                   "activeTurnId": None, "turnStatus": None, "error": None,
                   "permissions": [], "capabilities": {}, "model": None}
        with self.db:
            self.db.execute("INSERT INTO sessions VALUES (?,?)", (session["id"], encode(session)))
            self._event(session["id"], "session", session)
        return session

    def session(self, sid: str) -> dict:
        row = self.db.execute("SELECT body FROM sessions WHERE id=?", (sid,)).fetchone()
        if row is None:
            raise KeyError("Session not found")
        return json.loads(row[0])

    def sessions(self) -> list[dict]:
        return sorted([json.loads(row[0]) for row in self.db.execute("SELECT body FROM sessions")], key=lambda x: x["updatedAt"], reverse=True)

    def update_session(self, sid: str, **patch) -> dict:
        session = {**self.session(sid), **patch, "updatedAt": now()}
        with self.db:
            self.db.execute("UPDATE sessions SET body=? WHERE id=?", (encode(session), sid))
            if "turnStatus" in patch and session["activeTurnId"]:
                row = self.db.execute("SELECT body FROM turns WHERE id=?", (session["activeTurnId"],)).fetchone()
                if row:
                    turn = {**json.loads(row[0]), "status": patch["turnStatus"]}
                    self.db.execute("UPDATE turns SET body=? WHERE id=?", (encode(turn), turn["id"]))
            self._event(sid, "session", session)
        return session

    def interactions(self, sid: str) -> list[dict]:
        return [json.loads(row[0]) for row in self.db.execute("SELECT body FROM interactions WHERE session=? ORDER BY rowid", (sid,))]

    def interaction(self, sid: str, iid: str) -> dict:
        row = self.db.execute("SELECT body FROM interactions WHERE session=? AND id=?", (sid, iid)).fetchone()
        if row is None:
            raise KeyError("Interaction not found in this session")
        return json.loads(row[0])

    def put_interaction(self, sid: str, interaction: dict):
        with self.db:
            self.db.execute("INSERT INTO interactions VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body WHERE interactions.session=excluded.session",
                            (interaction["id"], sid, encode(interaction)))
            self._event(sid, "interaction", interaction)

    def create_camera(self, sid: str, caption: str) -> dict:
        state = self.session(sid)
        interaction = {"id": identifier(), "kind": "camera", "turnId": state["activeTurnId"],
                       "generation": state["generation"], "toolCallId": None, "createdAt": now(),
                       "caption": caption[:2000], "status": "awaiting_capture", "photos": []}
        self.put_interaction(sid, interaction)
        return interaction

    @staticmethod
    def camera_result(interaction: dict) -> dict:
        return {"schema_version": 1, "view": "camera", "requestId": interaction["id"],
                "caption": interaction["caption"], "photos": interaction["photos"],
                "interactionStatus": interaction["status"],
                "summary": "Camera request saved. The user can capture and send an image in a later turn."}

    def record(self, sid: str, record_id: str) -> dict | None:
        row = self.db.execute("SELECT body FROM records WHERE session=? AND id=?", (sid, record_id)).fetchone()
        return json.loads(row[0]) if row else None

    def put_record(self, sid: str, record: dict):
        with self.db:
            self.db.execute("INSERT INTO records(session,id,body) VALUES (?,?,?) ON CONFLICT(session,id) DO UPDATE SET body=excluded.body",
                            (sid, record.get("toolCallId", record.get("id")), encode(record)))
            self._event(sid, "record", record)

    def records(self, sid: str) -> list[dict]:
        return [json.loads(row[0]) for row in self.db.execute("SELECT body FROM records WHERE session=? ORDER BY position", (sid,))]

    def assets(self, sid: str) -> list[dict]:
        return [json.loads(row[0]) for row in self.db.execute("SELECT body FROM assets WHERE session=? ORDER BY rowid", (sid,))]

    def asset(self, sid: str, aid: str) -> dict:
        row = self.db.execute("SELECT body FROM assets WHERE session=? AND id=?", (sid, aid)).fetchone()
        if row is None:
            raise KeyError("Image not found in this session")
        return json.loads(row[0])

    def asset_path(self, sid: str, aid: str) -> Path:
        asset = self.asset(sid, aid)
        return self.settings.data / "images" / sid / (asset["id"] + asset["extension"])

    def add_image(self, sid: str, data: bytes, title: str, origin: str) -> dict:
        self.session(sid)
        if not data or len(data) > self.settings.max_image_bytes:
            raise ValueError("Image must be nonempty and at most 20 MiB")
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(BytesIO(data)) as source:
                    if source.format not in {"PNG", "JPEG", "WEBP"}:
                        raise ValueError("Use a PNG, JPEG, or WebP image")
                    width, height = source.size
                    if width * height > self.settings.max_pixels:
                        raise ValueError("Image exceeds the pixel limit")
                    source.load()
                    extension = {"PNG": ".png", "JPEG": ".jpg", "WEBP": ".webp"}[source.format]
                    if source.getexif().get(274, 1) != 1:
                        image = ImageOps.exif_transpose(source)
                        buffer = BytesIO()
                        image.save(buffer, format="PNG")
                        data, extension = buffer.getvalue(), ".png"
                        width, height = image.size
        except (UnidentifiedImageError, OSError, Image.DecompressionBombWarning, Image.DecompressionBombError) as error:
            raise ValueError("Image could not be decoded safely") from error
        if len(data) > self.settings.max_image_bytes:
            raise ValueError("Normalized image exceeds the byte limit")
        digest = hashlib.sha256(data).hexdigest()
        row = self.db.execute("SELECT body FROM assets WHERE session=? AND digest=?", (sid, digest)).fetchone()
        if row:
            return json.loads(row[0])
        aid = identifier()
        asset = {"id": aid, "versionId": "1", "title": title[:160] or "Image", "width": width,
                 "height": height, "mimeType": {".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp"}[extension],
                 "extension": extension, "size": len(data), "digest": digest, "origin": origin,
                 "createdAt": now(), "url": f"/api/agent/sessions/{sid}/images/{aid}"}
        folder = self.settings.data / "images" / sid
        folder.mkdir(parents=True, exist_ok=True)
        temp = folder / f"{aid}.tmp"
        temp.write_bytes(data)
        temp.replace(folder / (aid + extension))
        with self.db:
            self.db.execute("INSERT INTO assets VALUES (?,?,?,?)", (aid, sid, digest, encode(asset)))
            self._event(sid, "asset", asset)
        return asset

    def prior_turn(self, sid: str, client_id: str) -> dict | None:
        row = self.db.execute("SELECT body FROM turns WHERE session=? AND client_id=?", (sid, client_id)).fetchone()
        return json.loads(row[0]) if row else None

    def create_turn(self, sid: str, client_id: str, text: str, images: list[str], digest: str) -> dict:
        session = self.session(sid)
        image_refs = [{"assetId": aid, "versionId": self.asset(sid, aid)["versionId"]} for aid in images]
        turn = {"id": identifier(), "sessionId": sid, "clientMessageId": client_id, "digest": digest,
                "text": text, "imageIds": images, "status": "running", "createdAt": now(),
                "imageRefs": image_refs,
                "generation": session["generation"], "dispatch": "accepted", "startedAt": None}
        message = {"type": "message", "id": turn["id"] + ":user", "author": "you", "origin": "agent",
                   "text": text, "imageIds": images, "imageRefs": image_refs}
        session.update(activeTurnId=turn["id"], turnStatus="running", updatedAt=now(), error=None)
        if session["title"] == "New chat":
            session["title"] = text[:72].strip() or "Image conversation"
        with self.db:
            self.db.execute("INSERT INTO turns VALUES (?,?,?,?,?)", (turn["id"], sid, client_id, digest, encode(turn)))
            self.db.execute("INSERT INTO records(session,id,body) VALUES (?,?,?)", (sid, message["id"], encode(message)))
            self.db.execute("UPDATE sessions SET body=? WHERE id=?", (encode(session), sid))
            self._event(sid, "record", message)
            self._event(sid, "session", session)
        return turn

    def dispatched(self, turn_id: str):
        row = self.db.execute("SELECT body FROM turns WHERE id=?", (turn_id,)).fetchone()
        turn = {**json.loads(row[0]), "dispatch": "sent", "startedAt": now()}
        with self.db:
            self.db.execute("UPDATE turns SET body=? WHERE id=?", (encode(turn), turn_id))

    def finish_turn(self, sid: str, turn_id: str, status: str, error: str | None = None, stop_reason: str | None = None):
        row = self.db.execute("SELECT body FROM turns WHERE id=? AND session=?", (turn_id, sid)).fetchone()
        if not row:
            return
        previous = json.loads(row[0])
        if previous["status"] not in {"running", "waiting_permission", "cancelling"}:
            return
        turn = {**previous, "status": status, "finishedAt": now(), "error": error, "stopReason": stop_reason}
        with self.db:
            self.db.execute("UPDATE turns SET body=? WHERE id=?", (encode(turn), turn_id))
            if status in {"cancelled", "failed", "interrupted"}:
                for record in self.records(sid):
                    if (record.get("turnId") == turn_id and record.get("type") == "tool_call"
                            and record.get("status") in {"pending", "in_progress"}):
                        record.update(status="failed", terminationReason=status, completionSource="application")
                        self.db.execute("UPDATE records SET body=? WHERE session=? AND id=?",
                                        (encode(record), sid, record["toolCallId"]))
                        self._event(sid, "record", record)
            session = self.session(sid)
            if session["activeTurnId"] == turn_id:
                session.update(activeTurnId=None, turnStatus=status, error=error, permissions=[], updatedAt=now())
                self.db.execute("UPDATE sessions SET body=? WHERE id=?", (encode(session), sid))
                self._event(sid, "session", session)

    def snapshot(self, sid: str) -> dict:
        session = self.session(sid)
        return {"schemaVersion": 1, "session": session, "records": self.records(sid), "assets": self.assets(sid),
                "interactions": self.interactions(sid),
                "cursor": self.db.execute("SELECT COALESCE(MAX(seq),0) FROM events WHERE session=?", (sid,)).fetchone()[0]}

    def events(self, sid: str, after: int) -> list[dict]:
        return [{"seq": row[0], **json.loads(row[1])} for row in self.db.execute(
            "SELECT seq,body FROM events WHERE session=? AND seq>? ORDER BY seq LIMIT 200", (sid, after))]

    def recover(self):
        for session in self.sessions():
            for interaction in self.interactions(session["id"]):
                if interaction["kind"] == "permission" and interaction["status"] == "pending":
                    self.put_interaction(session["id"], {**interaction, "status": "cancelled", "optionId": None, "resolvedAt": now()})
            if session["activeTurnId"]:
                self.finish_turn(session["id"], session["activeTurnId"], "interrupted", "Backend restarted during the turn. Continue with a new message.")
            self.update_session(session["id"], runtime="stopped", permissions=[])

    def close(self):
        self.db.close()
