"""Bounded data-only transfer between the CAD session and application storage."""
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import uuid


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def decode(data):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError("Duplicate JSON field")
            result[key] = value
        return result
    return json.loads(data, object_pairs_hook=pairs,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError("Nonfinite JSON number")))


def contained(root, relative):
    if not isinstance(relative, str) or not relative or "\\" in relative or "\0" in relative:
        raise ValueError("Expected a relative POSIX file path")
    if PurePosixPath(relative).is_absolute() or any(p in ("", ".", "..") for p in relative.split("/")):
        raise ValueError("File path must stay inside its private workspace")
    root = Path(root).resolve()
    path = root
    for part in relative.split("/"):
        path /= part
        if path.is_symlink():
            raise ValueError("Symlink inputs are not accepted")
    if not path.resolve().is_relative_to(root):
        raise ValueError("File path escaped its private workspace")
    return path


def read(path, limit):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode) or before.st_size > limit:
            raise ValueError("Transfer requires a bounded regular file")
        data = stream.read(limit + 1)
        after = os.fstat(stream.fileno())
    if (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns) or len(data) != before.st_size:
        raise ValueError("File changed during transfer")
    return data


def atomic(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temp = path.with_name("." + uuid.uuid4().hex + ".partial")
    with temp.open("xb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    temp.replace(path)


def capture_request(workspace, request_path, limit=16 * 1024 * 1024):
    workspace = Path(workspace).resolve()
    path = Path(request_path)
    if path.is_absolute():
        try:
            request_path = str(path.relative_to(workspace))
        except ValueError:
            raise ValueError("Request must belong to this CAD workspace") from None
    path = contained(workspace, request_path)
    data = read(path, limit)
    request = decode(data)
    files = {path.name: data}
    if "source" in request:
        names = [request["source"], *request.get("inputs", {}).values()]
    elif "path" in request.get("geometry", {}):
        manifest_name = request["geometry"]["path"]
        manifest_path = contained(path.parent, manifest_name)
        manifest = decode(read(manifest_path, limit))
        base = PurePosixPath(manifest_name).parent
        names = [manifest_name, *[str(base / item["path"]) for item in manifest.get("parts", {}).values()],
                 *[str(base / item["path"]) for item in manifest.get("frozen_files", [])]]
    else:
        names = []
    for name in names:
        payload = read(contained(path.parent, name), limit)
        if name in files and files[name] != payload:
            raise ValueError("Request and source filenames collide")
        files[name] = payload
    if sum(map(len, files.values())) > limit:
        raise ValueError("Frozen input exceeds transfer budget")
    for name, payload in files.items():
        if read(contained(path.parent, name), limit) != payload:
            raise ValueError("Declared files changed during capture")
    return {"request": path.name, "files": [{"path": name, "sha256": digest(data),
             "data": base64.b64encode(data).decode()} for name, data in sorted(files.items())]}


def unpack(bundle, folder, limit):
    if not isinstance(bundle, dict) or set(bundle) != {"request", "files"} or not isinstance(bundle["files"], list):
        raise ValueError("Invalid frozen bundle")
    files, total = {}, 0
    for item in bundle["files"]:
        if not isinstance(item, dict) or set(item) != {"path", "sha256", "data"}:
            raise ValueError("Invalid frozen file record")
        path = contained(folder, item["path"])
        if item["path"] in files or len(item["data"]) > (limit * 4 // 3 + 8):
            raise ValueError("Repeated or oversized frozen file")
        data = base64.b64decode(item["data"], validate=True)
        total += len(data)
        if total > limit or digest(data) != item["sha256"]:
            raise ValueError("Frozen input digest/size mismatch")
        files[item["path"]] = (path, data)
    if bundle["request"] not in files:
        raise ValueError("Missing frozen request")
    for path, data in files.values():
        atomic(path, data)
    return files[bundle["request"]][0]
