"""CAD operation/revision authority on the application's existing SQLite connection."""
import copy
import json
from pathlib import Path

from .cad_files import atomic, canonical, contained, decode, digest, read
from .store import encode, identifier, now

TERMINAL = {"completed", "failed", "cancelled", "interrupted"}


class CadStore:
    def __init__(self, store):
        self.app, self.db = store, store.db
        self.root = store.settings.data / "cad"
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.db.executescript("""
          CREATE TABLE IF NOT EXISTS cad_sessions(session TEXT PRIMARY KEY REFERENCES sessions(id), body TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS cad_operations(id TEXT PRIMARY KEY, session TEXT NOT NULL REFERENCES sessions(id),
            kind TEXT NOT NULL, command_key TEXT NOT NULL, digest TEXT NOT NULL, body TEXT NOT NULL,
            UNIQUE(session,kind,command_key));
          CREATE TABLE IF NOT EXISTS cad_evaluations(id TEXT PRIMARY KEY, operation TEXT NOT NULL REFERENCES cad_operations(id),
            command_key TEXT NOT NULL, digest TEXT NOT NULL, body TEXT NOT NULL, UNIQUE(operation,command_key));
          CREATE TABLE IF NOT EXISTS cad_revisions(id TEXT PRIMARY KEY, session TEXT NOT NULL REFERENCES sessions(id),
            build_key TEXT NOT NULL, body TEXT NOT NULL, UNIQUE(session,build_key));
          CREATE TABLE IF NOT EXISTS cad_files(id TEXT PRIMARY KEY, session TEXT NOT NULL REFERENCES sessions(id), body TEXT NOT NULL);
        """)

    def session(self, sid):
        self.app.session(sid)
        row = self.db.execute("SELECT body FROM cad_sessions WHERE session=?", (sid,)).fetchone()
        if row:
            return json.loads(row[0])
        body = {"id": identifier(), "sessionId": sid, "acpSessionId": None, "generation": 0, "runtime": "stopped"}
        self.put_session(sid, body)
        return body

    def put_session(self, sid, body):
        with self.db:
            self.db.execute("INSERT INTO cad_sessions VALUES (?,?) ON CONFLICT(session) DO UPDATE SET body=excluded.body", (sid, encode(body)))

    def operation(self, sid, oid):
        row = self.db.execute("SELECT body FROM cad_operations WHERE session=? AND id=?", (sid, oid)).fetchone()
        if row is None:
            raise KeyError("CAD operation not found in this chat")
        return json.loads(row[0])

    def operations(self, sid=None):
        rows = self.db.execute("SELECT body FROM cad_operations" + (" WHERE session=?" if sid else ""), (sid,) if sid else ())
        return [json.loads(row[0]) for row in rows]

    def prior(self, sid, kind, key, fingerprint):
        row = self.db.execute("SELECT digest,body FROM cad_operations WHERE session=? AND kind=? AND command_key=?", (sid, kind, key)).fetchone()
        if not row:
            return None
        if row[0] != fingerprint:
            raise ValueError("CAD idempotency key already belongs to different input")
        return json.loads(row[1])

    def create_operation(self, sid, kind, task, settings):
        oid = identifier()
        parent = self.app.session(sid)
        public = {"schema_version": 1, "view": "cad", "operationId": oid, "operationVersion": 0,
                  "operationKind": kind, "status": "queued", "phase": "accepted", "title": task.get("title", "CAD evidence"),
                  "revision": None, "geometry": None, "evaluationId": None, "publicationId": None,
                  "requestedOutputs": task.get("outputs", []), "outputs": [{"id": o["id"], "kind": o["kind"], "status": "pending"} for o in task.get("outputs", [])],
                  "images": [], "model": None, "downloads": [], "metrics": [], "interpretation": "", "error": None,
                  "budget": {"evaluations": 0, "maxEvaluations": settings.max_evaluations, "elapsedSeconds": 0, "maxSeconds": settings.seconds},
                  "reuse": {"sourceExecutions": 0, "builds": 0, "loads": 0, "restores": 0, "queries": 0},
                  "presentation": {"messageMode": "together", "index": 0, "count": 1}}
        operation = {"id": oid, "sessionId": sid, "turnId": parent["activeTurnId"], "parentGeneration": parent["generation"],
                     "createdAt": now(), "task": task, "public": public, "evaluations": [], "agentGeneration": None}
        with self.db:
            self.db.execute("INSERT INTO cad_operations VALUES (?,?,?,?,?,?)", (oid, sid, kind, task["idempotency_key"], digest(canonical(task)), encode(operation)))
        self.put_operation(operation)
        return operation

    def put_operation(self, operation):
        public = operation["public"]
        public["operationVersion"] += 1
        operation["updatedAt"] = now()
        record = self.record(operation)
        with self.db:
            self.db.execute("UPDATE cad_operations SET body=? WHERE id=?", (encode(operation), operation["id"]))
            self.db.execute("INSERT INTO records(session,id,body) VALUES (?,?,?) ON CONFLICT(session,id) DO UPDATE SET body=excluded.body",
                            (operation["sessionId"], record["toolCallId"], encode(record)))
            self.app._event(operation["sessionId"], "record", record)

    @staticmethod
    def record(operation):
        public = operation["public"]
        return {"type": "tool_call", "toolCallId": "cad:" + operation["id"], "turnId": operation["turnId"],
                "name": "cad.result", "server": "crafty_cad", "tool": "operation", "title": public["title"],
                "status": {"queued": "pending", "running": "in_progress", "completed": "completed"}.get(public["status"], "failed"),
                "completionSource": "application", "rawInput": {"operationId": operation["id"]}, "rawOutput": copy.deepcopy(public)}

    def evaluation(self, sid, eid):
        row = self.db.execute("SELECT e.body FROM cad_evaluations e JOIN cad_operations o ON e.operation=o.id WHERE e.id=? AND o.session=?", (eid, sid)).fetchone()
        if row is None:
            raise KeyError("CAD evaluation not found in this chat")
        return json.loads(row[0])

    def prior_evaluation(self, oid, key, fingerprint):
        row = self.db.execute("SELECT digest,body FROM cad_evaluations WHERE operation=? AND command_key=?", (oid, key)).fetchone()
        if not row:
            return None
        if row[0] != fingerprint:
            raise ValueError("Evaluation idempotency key already belongs to changed bytes")
        return json.loads(row[1])

    def put_evaluation(self, value):
        with self.db:
            self.db.execute("INSERT INTO cad_evaluations VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
                            (value["id"], value["operationId"], value["key"], value["digest"], encode(value)))

    def revision(self, sid, rid):
        row = self.db.execute("SELECT body FROM cad_revisions WHERE session=? AND id=?", (sid, rid)).fetchone()
        if row is None:
            raise KeyError("CAD revision not found in this chat")
        return json.loads(row[0])

    def save_revision(self, revision):
        with self.db:
            self.db.execute("INSERT INTO cad_revisions VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
                            (revision["id"], revision["sessionId"], revision["buildKey"], encode(revision)))

    def adopt_geometry(self, operation, descriptor, snapshot_path):
        sid = operation["sessionId"]
        row = self.db.execute("SELECT body FROM cad_revisions WHERE session=? AND build_key=?", (sid, descriptor["build_key"])).fetchone()
        if row:
            revision = json.loads(row[0])
        else:
            rid, snapshot_id = identifier(), identifier()
            source = Path(snapshot_path)
            data = read(source, 16 * 1024 * 1024)
            manifest = decode(data)
            folder = self.root / "snapshots" / sid / snapshot_id
            files = [*manifest["parts"].values(), *manifest.get("frozen_files", [])]
            total = len(data)
            for item in files:
                payload = read(contained(source.parent, item["path"]), 128 * 1024 * 1024)
                total += len(payload)
                if total > 128 * 1024 * 1024 or digest(payload) != item["sha256"] or len(payload) != item["size_bytes"]:
                    raise ValueError("Native snapshot digest or size mismatch")
                atomic(contained(folder, item["path"]), payload)
            atomic(folder / "manifest.json", data)
            revision = {"id": rid, "sessionId": sid, "number": self.db.execute("SELECT COUNT(*) FROM cad_revisions WHERE session=?", (sid,)).fetchone()[0] + 1,
                        "parentRevisionId": operation["task"].get("parent_revision_id"), "buildKey": descriptor["build_key"],
                        "sourceDigest": manifest.get("provenance", {}).get("source_sha256"), "geometryId": identifier(),
                        "geometryDigest": descriptor["geometry_digest"], "snapshotId": snapshot_id,
                        "snapshotPath": str(folder / "manifest.json"), "snapshotDigest": digest(data), "createdAt": now()}
        revision.update(handle=descriptor["handle"], runtimeGeneration=descriptor["runtime_generation"], availability="live")
        self.save_revision(revision)
        self.attach_revision(operation, revision)
        return revision

    @staticmethod
    def attach_revision(operation, revision):
        operation["revisionId"] = revision["id"]
        operation["public"]["revision"] = {key: revision[key] for key in ("id", "number", "parentRevisionId", "sourceDigest", "buildKey")}
        operation["public"]["geometry"] = {"id": revision["geometryId"], "digest": revision["geometryDigest"],
            "snapshotId": revision["snapshotId"], "availability": revision["availability"], "units": "mm", "frame": "right-handed-z-up"}

    def add_file(self, sid, data, filename, media_type, format):
        fid = identifier()
        metadata = {"id": fid, "url": f"/api/agent/sessions/{sid}/cad/artifacts/{fid}",
                    "downloadUrl": f"/api/agent/sessions/{sid}/cad/artifacts/{fid}?download=true",
                    "filename": filename, "mediaType": media_type, "format": format, "sizeBytes": len(data), "sha256": digest(data)}
        atomic(self.root / "files" / sid / fid, data)
        with self.db:
            self.db.execute("INSERT INTO cad_files VALUES (?,?,?)", (fid, sid, encode(metadata)))
        return metadata

    def file(self, sid, fid):
        row = self.db.execute("SELECT body FROM cad_files WHERE id=? AND session=?", (fid, sid)).fetchone()
        if row is None:
            raise KeyError("CAD artifact not found in this chat")
        metadata = json.loads(row[0])
        path = self.root / "files" / sid / fid
        data = read(path, 128 * 1024 * 1024)
        if digest(data) != metadata["sha256"] or len(data) != metadata["sizeBytes"]:
            raise ValueError("Stored CAD artifact failed its digest check")
        return metadata, path

    def recover(self):
        for operation in self.operations():
            if operation["public"]["status"] not in TERMINAL:
                operation["public"].update(status="interrupted", phase="interrupted", error={"code": "backend_restarted", "message": "CAD work was interrupted. Inspect retained evidence before starting new work."})
                for output in operation["public"]["outputs"]:
                    if output["status"] == "pending":
                        output.update(status="unavailable", reason=operation["public"]["error"])
                self.put_operation(operation)
        for row in self.db.execute("SELECT body FROM cad_evaluations").fetchall():
            evaluation = json.loads(row[0])
            if evaluation["status"] in {"queued", "running"}:
                evaluation.update(status="interrupted", error={"code": "backend_restarted", "message": "Native work was interrupted; no automatic replay"})
                self.put_evaluation(evaluation)
        for row in self.db.execute("SELECT body FROM cad_revisions").fetchall():
            revision = json.loads(row[0])
            revision["availability"] = "snapshot"
            self.save_revision(revision)
        for row in self.db.execute("SELECT session,body FROM cad_sessions").fetchall():
            state = json.loads(row[1])
            state["runtime"] = "stopped"
            self.put_session(row[0], state)
