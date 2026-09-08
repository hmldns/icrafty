"""Bounded data capture and supervisor-owned, atomic publication."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
from typing import Any


class CadError(Exception):
    def __init__(self, code: str, message: str, **details: Any):
        super().__init__(message)
        self.code, self.details = code, details


def canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def relative_path(value: str) -> str:
    if not isinstance(value, str) or not value or "\\" in value or "\x00" in value:
        raise CadError("invalid_path", "Expected a nonempty relative POSIX path")
    p = PurePosixPath(value)
    if p.is_absolute() or any(s in ("", ".", "..") for s in value.split("/")):
        raise CadError("invalid_path", f"Path must remain beneath its root: {value!r}")
    return value


def contained(root: Path, value: str) -> Path:
    relative_path(value)
    root = root.resolve()
    path = root
    for segment in value.split("/"):
        path /= segment
        if path.is_symlink():
            raise CadError("invalid_path", f"Symlinks are not accepted: {value}")
    if not path.resolve().is_relative_to(root):
        raise CadError("invalid_path", f"Path escaped root: {value}")
    return path


def read_bytes(path: Path, limit: int = 16 * 1024 * 1024) -> bytes:
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, "rb") as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode) or before.st_size > limit:
                raise CadError("input_limit", f"Expected regular file <= {limit} bytes: {path}")
            data = stream.read(limit + 1)
            after = os.fstat(stream.fileno())
        if (before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (
            after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns
        ) or len(data) != before.st_size:
            raise CadError("input_changed", f"File changed during capture: {path}")
        return data
    except OSError as exc:
        raise CadError("input_unavailable", f"Cannot read {path}: {exc}") from exc


def load_json(path: Path, limit: int = 16 * 1024 * 1024) -> Any:
    def pairs(items: list) -> dict:
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError(f"Duplicate field: {key}")
            result[key] = value
        return result
    try:
        return json.loads(read_bytes(path, limit), object_pairs_hook=pairs,
                          parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))
    except (ValueError, UnicodeError) as exc:
        raise CadError("invalid_json", str(exc)) from exc


def atomic_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".partial")
    with temporary.open("xb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def atomic_json(path: Path, value: Any) -> None:
    atomic_bytes(path, json.dumps(value, indent=2, sort_keys=True, allow_nan=False).encode() + b"\n")


def record(path: Path, root: Path, media_type: str = "application/octet-stream") -> dict:
    relative = path.relative_to(root).as_posix()
    data = read_bytes(contained(root, relative), 256 * 1024 * 1024)
    return {"path": relative, "media_type": media_type, "size_bytes": len(data), "sha256": digest(data)}


def verify_record(root: Path, item: dict) -> Path:
    path = contained(root, item["path"])
    data = read_bytes(path, 256 * 1024 * 1024)
    if len(data) != item["size_bytes"] or digest(data) != item["sha256"]:
        raise CadError("digest_mismatch", f"File does not match recorded bytes: {item['path']}")
    return path
