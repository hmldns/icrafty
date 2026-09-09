"""Immutable, unverified CAD inputs; separate from validated output artifacts."""
import base64
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat

from .cad_files import atomic, canonical, digest, read
from .store import identifier, now

MAX_BYTES = 16 * 1024 * 1024
KINDS = {"step": ("model/step", {".step", ".stp"}), "python_source": ("text/x-python", {".py"})}


def filename_kind(filename, kind):
    if not isinstance(filename, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,119}", filename):
        raise ValueError("CAD input needs a safe basename of at most 120 characters")
    if kind not in KINDS or Path(filename).suffix.lower() not in KINDS[kind][1]:
        raise ValueError("CAD input extension must match step (.step/.stp) or python_source (.py)")
    return KINDS[kind][0]


def relative_parts(path):
    if not isinstance(path, str) or not path or len(path) > 512 or "\\" in path or "\0" in path:
        raise ValueError("CAD input needs a relative POSIX path")
    parts = path.split("/")
    if PurePosixPath(path).is_absolute() or any(p in {"", ".", ".."} for p in parts):
        raise ValueError("CAD input must stay in the calling workspace")
    return parts


def capture(workspace, path, kind, limit=MAX_BYTES):
    """Walk using directory FDs so concurrent symlink changes cannot escape scope."""
    parts = relative_parts(path)
    filename_kind(parts[-1], kind)
    directory = os.open(workspace, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in parts[:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
            os.close(directory)
            directory = child
        fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
        with os.fdopen(fd, "rb") as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode) or not 0 < before.st_size <= limit:
                raise ValueError("CAD input requires a nonempty bounded regular file")
            data = stream.read(limit + 1)
            after = os.fstat(stream.fileno())
            if (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns) or len(data) != before.st_size:
                raise ValueError("CAD input changed during capture")
    finally:
        os.close(directory)
    return {"filename": parts[-1], "kind": kind, "size_bytes": len(data), "sha256": digest(data),
            "data": base64.b64encode(data).decode()}


def unpack_file(value, arguments, limit):
    if not isinstance(value, dict) or set(value) != {"filename", "kind", "size_bytes", "sha256", "data"}:
        raise ValueError("Invalid CAD input transfer")
    if value["filename"] != relative_parts(arguments["path"])[-1] or value["kind"] != arguments["kind"]:
        raise ValueError("CAD input transfer differs from its declared file")
    filename_kind(value["filename"], value["kind"])
    if type(value["size_bytes"]) is not int or not 0 < value["size_bytes"] <= limit or not isinstance(value["data"], str) or len(value["data"]) > ((limit + 2)//3)*4:
        raise ValueError("CAD input exceeds its individual byte budget")
    data = base64.b64decode(value["data"], validate=True)
    if len(data) != value["size_bytes"] or digest(data) != value["sha256"]:
        raise ValueError("CAD input digest or size mismatch")
    return data


class CadInputs:
    def __init__(self, store, maximum=MAX_BYTES):
        self.store, self.maximum = store, min(maximum, MAX_BYTES)
        store.db.execute("""CREATE TABLE IF NOT EXISTS cad_inputs(
            id TEXT PRIMARY KEY, session TEXT NOT NULL REFERENCES sessions(id), command_key TEXT NOT NULL,
            digest TEXT NOT NULL, body TEXT NOT NULL, provenance TEXT NOT NULL, UNIQUE(session,command_key))""")
        store.db.commit()

    def save(self, sid, key, filename, kind, data, origin, provenance):
        self.store.app.session(sid)
        if not isinstance(key, str) or not 1 <= len(key) <= 120:
            raise ValueError("CAD input requires an Idempotency-Key of 1–120 characters")
        media = filename_kind(filename, kind)
        if not 0 < len(data) <= self.maximum:
            raise ValueError("CAD input exceeds its individual byte budget")
        fingerprint = digest(canonical({"filename": filename, "kind": kind, "sha256": digest(data),
            "sizeBytes": len(data), "origin": origin, "relativePath": provenance.get("relativePath")}))
        row = self.store.db.execute("SELECT digest,body FROM cad_inputs WHERE session=? AND command_key=?", (sid, key)).fetchone()
        if row:
            if row[0] != fingerprint:
                raise ValueError("CAD input idempotency key already belongs to different bytes or provenance")
            metadata, _ = self.get(sid, json.loads(row[1])["inputFileId"])
            return metadata
        fid = identifier()
        metadata = {"schema_version": 1, "inputFileId": fid, "sessionId": sid, "kind": kind,
            "filename": filename, "mediaType": media, "sizeBytes": len(data), "sha256": digest(data),
            "validation": "unverified_input", "origin": origin, "createdAt": now()}
        atomic(self.store.root / "inputs" / sid / fid, data)
        with self.store.db:
            self.store.db.execute("INSERT INTO cad_inputs VALUES (?,?,?,?,?,?)",
                (fid, sid, key, fingerprint, canonical(metadata).decode(), canonical({**provenance, **metadata}).decode()))
        return metadata

    def get(self, sid, fid):
        row = self.store.db.execute("SELECT body FROM cad_inputs WHERE session=? AND id=?", (sid, fid)).fetchone()
        if row is None:
            raise KeyError("CAD input not found in this chat")
        metadata = json.loads(row[0])
        data = read(self.store.root / "inputs" / sid / metadata["inputFileId"], self.maximum)
        if len(data) != metadata["sizeBytes"] or digest(data) != metadata["sha256"]:
            raise ValueError("Stored CAD input failed its digest check")
        return metadata, data

    def freeze(self, sid, ids):
        files, total = [], 0
        for fid in ids:
            metadata, data = self.get(sid, fid)
            total += len(data)
            if total > self.maximum:
                raise ValueError("CAD inputs exceed the aggregate task byte budget")
            files.append(metadata)
        return files

    def for_task(self, sid, operation, fid):
        expected = next((item for item in operation["task"].get("input_files", []) if item["inputFileId"] == fid), None)
        if expected is None:
            raise KeyError("CAD input was not included in this modeling task")
        metadata, data = self.get(sid, fid)
        if metadata != expected:
            raise ValueError("CAD input differs from the frozen task manifest")
        return metadata, data
