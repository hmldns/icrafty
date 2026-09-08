"""Local retained geometry service and the supervisor-owned evaluation lifecycle."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import copy
from pathlib import Path
import shutil
import threading
import time
import uuid
from typing import Callable

from .contract import compare, finite, validate_request, validate_result
from .files import CadError, atomic_bytes, atomic_json, canonical, contained, digest, load_json, read_bytes, record, verify_record
from .process import NativeProcess, one_shot
from .settings import Settings


def native_identity(native: dict) -> dict:
    return {key: native[key] for key in ("freecad", "occt", "abi")}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class Entry:
    handle: str
    key: str
    scope: str
    generation: str
    snapshot: Path
    manifest: dict
    baseline: dict
    created: float
    touched: float
    active_uses: int = 0
    unavailable_reason: str | None = None
    release_requested: bool = False


class GeometryRuntime:
    """Serialized core API. Use this object as a context manager to own its processes.

    Handles belong to this runtime generation and to the caller-supplied scope.
    Scope is a trusted adapter argument, never a field controlled by model source.
    """

    def __init__(self, directory: Path | str, settings: Settings | None = None,
                 fault: Callable[[str, str], None] | None = None):
        self.directory = Path(directory).resolve()
        self.directory.mkdir(parents=True, exist_ok=False)
        self.settings = settings or Settings.environment()
        self.fault = fault or (lambda phase, identity: None)
        self.generation = uuid.uuid4().hex
        self.entries: dict[str, Entry] = {}
        self.snapshots: dict[str, Path] = {}
        self.query_lock = threading.RLock()
        self.state_lock = threading.RLock()
        self.native: NativeProcess | None = None
        self.native_versions: dict = {}
        self.counts = {"source_executions": 0, "builds": 0, "restores": 0, "cache_hits": 0,
                       "queries": 0, "loads": 0}
        self.timings: list[dict] = []
        self.process_reports: list[dict] = []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    def _start(self):
        if self.native is None:
            self.native = NativeProcess(self.settings, self.directory / ("native-" + self.generation), "serve")
            try:
                self.native_versions = self.native.call({"op": "hello"})["native"]
            except Exception:
                self.native.close()
                self.native = None
                raise

    def close(self):
        with self.query_lock:
            if self.native:
                self.native.close()
                self.process_reports.append(self.native.stats.copy())
                self.native = None
            with self.state_lock:
                for entry in self.entries.values():
                    if not entry.unavailable_reason:
                        entry.unavailable_reason = "runtime_replaced"
                self.generation = uuid.uuid4().hex

    def restart(self):
        self.close()
        self._start()

    def diagnostics(self) -> dict:
        return {"counts": self.counts.copy(), "timings": copy.deepcopy(self.timings),
                "native": copy.deepcopy(self.native_versions), "settings": self.settings.manifest(),
                "generation": self.generation, "processes": copy.deepcopy(self.process_reports),
                "live_process": ({**self.native.stats, "peak_rss_bytes": self.native.peak_rss,
                                  "peak_processes": self.native.peak_processes} if self.native else None)}

    def _descriptor(self, entry: Entry) -> dict:
        expiry = min(entry.touched+self.settings.idle_seconds, entry.created+self.settings.lifetime_seconds)
        return {"handle": entry.handle, "runtime_generation": entry.generation, "scope": entry.scope,
                "geometry_digest": entry.manifest["geometry_digest"], "build_key": entry.key,
                "snapshot_path": str(entry.snapshot), "active_uses": entry.active_uses,
                "expires_at": datetime.fromtimestamp(time.time()+expiry-time.monotonic(), timezone.utc).isoformat(),
                "parts": copy.deepcopy(entry.manifest["parts"]), "baseline": copy.deepcopy(entry.baseline)}

    def _entry(self, handle: str, scope: str) -> Entry:
        entry = self.entries.get(handle)
        reason = "unknown_handle"
        if entry:
            if entry.scope != scope:
                reason = "wrong_scope"
            elif entry.generation != self.generation:
                reason = "runtime_replaced"
            elif entry.unavailable_reason:
                reason = entry.unavailable_reason
            elif not entry.active_uses and (time.monotonic()-entry.touched >= self.settings.idle_seconds
                                           or time.monotonic()-entry.created >= self.settings.lifetime_seconds):
                entry.unavailable_reason = reason = "expired"
            else:
                return entry
        # A wrong scope must not disclose private snapshot paths or shape membership.
        details = {"reason": reason}
        if entry and entry.scope == scope:
            details["snapshot_path"] = str(entry.snapshot)
        raise CadError("geometry_unavailable", f"Geometry unavailable: {reason}", **details)

    def release_geometry(self, handle: str, *, scope: str = "local") -> dict:
        with self.state_lock:
            entry = self._entry(handle, scope)
            entry.release_requested = True
            if entry.active_uses:
                return {"status": "deferred", "active_uses": entry.active_uses, "snapshot_path": str(entry.snapshot)}
            entry.unavailable_reason = "released"
        with self.query_lock:
            if self.native:
                self.native.call({"op": "release", "key": handle})
        return {"status": "released", "snapshot_path": str(entry.snapshot)}

    def _evict(self):
        live = [e for e in self.entries.values() if not e.unavailable_reason]
        def size(entry):
            return sum(p["memory_bytes"] for p in entry.baseline.values())
        for entry in sorted(live, key=lambda item: item.touched):
            expired = time.monotonic()-entry.touched >= self.settings.idle_seconds
            expired |= time.monotonic()-entry.created >= self.settings.lifetime_seconds
            over = len(live) >= self.settings.cache_entries or sum(map(size, live)) >= self.settings.cache_bytes
            if entry.active_uses or not (expired or over):
                continue
            entry.unavailable_reason = "expired" if expired else "evicted"
            self.native.call({"op": "release", "key": entry.handle})
            live.remove(entry)

    def _bundle(self, source: Path, destination: Path) -> dict:
        """Validate all bytes in an untrusted data-only bundle before native parsing."""
        manifest = load_json(source)
        finite(manifest)
        base_fields = {"schema_version", "encoding", "units", "frame", "native", "parts",
                       "source_executions", "geometry_digest"}
        if set(manifest)-base_fields-{"build_key", "provenance", "frozen_files"} or not base_fields <= set(manifest):
            raise CadError("invalid_bundle", "Unknown or missing bundle fields")
        if (manifest["schema_version"] != 1 or manifest["encoding"] != "occt-brep-world-placement-v1"
                or manifest["units"] != "mm" or manifest["frame"] != "right-handed-Z-up"):
            raise CadError("invalid_bundle", "Unsupported snapshot encoding, unit or frame")
        if native_identity(manifest["native"]) != native_identity(self.native_versions):
            raise CadError("incompatible_bundle", "Snapshot native runtime differs from current runtime")
        if not manifest["parts"] or digest(canonical(manifest["parts"])) != manifest["geometry_digest"]:
            raise CadError("digest_mismatch", "Invalid geometry manifest digest")
        destination.mkdir()
        for name, part in manifest["parts"].items():
            from .native_types import validate_part
            validate_part(name, part)
            path = verify_record(source.parent, part)
            target = contained(destination, part["path"])
            atomic_bytes(target, read_bytes(path, self.settings.input_bytes))
        for item in manifest.get("frozen_files", []):
            path = verify_record(source.parent, item)
            atomic_bytes(contained(destination, item["path"]), read_bytes(path, self.settings.input_bytes))
        atomic_json(destination / "manifest.json", manifest)
        return manifest

    def ensure_geometry(self, request_path: Path | str, *, scope: str = "local",
                        cancel: threading.Event | None = None) -> dict:
        request_path = Path(request_path).resolve()
        request = validate_request(load_json(request_path), max_pixels=self.settings.max_pixels,
                                   padding=self.settings.grid_padding)
        with self.query_lock:
            self._start()
            started = time.monotonic()
            if "handle" in request.get("geometry", {}):
                with self.state_lock:
                    return self._descriptor(self._entry(request["geometry"]["handle"], scope))
            source_data, inputs_data = None, {}
            if "source" in request:
                source_data = read_bytes(contained(request_path.parent, request["source"]), self.settings.input_bytes)
                inputs_data = {alias: read_bytes(contained(request_path.parent, path), self.settings.input_bytes)
                               for alias, path in request["inputs"].items()}
                if sum(map(len, inputs_data.values())) + len(source_data) > self.settings.input_bytes:
                    raise CadError("input_limit", "Combined frozen inputs exceed byte limit")
                provenance = {"source_sha256": digest(source_data),
                    "input_sha256": {a: digest(b) for a, b in inputs_data.items()},
                    "parameters": request["parameters"], "build_settings": self.settings.build_settings(),
                    "native": native_identity(self.native_versions)}
                key = digest(canonical(provenance))
            else:
                original = contained(request_path.parent, request["geometry"]["path"])
                snapshot = self.directory / ("restore-" + uuid.uuid4().hex)
                manifest = self._bundle(original, snapshot)
                key = manifest.get("build_key", manifest["geometry_digest"])
                self.snapshots[key] = snapshot / "manifest.json"
            for entry in self.entries.values():
                if entry.key == key and entry.scope == scope:
                    try:
                        self._entry(entry.handle, scope)
                    except CadError:
                        continue
                    self.counts["cache_hits"] += 1
                    entry.touched = time.monotonic()
                    self.timings.append({"phase": "cache_hit", "seconds": time.monotonic()-started})
                    return self._descriptor(entry)
            self._evict()
            path_type = "restore"
            if key not in self.snapshots:
                if source_data is None:
                    raise CadError("geometry_unavailable", "No native snapshot or explicit source")
                build_dir = self.directory / ("build-" + uuid.uuid4().hex)
                capture = build_dir / "capture"
                capture.mkdir(parents=True)
                source = capture / "model.py"
                atomic_bytes(source, source_data)
                inputs = {}
                for alias, data in inputs_data.items():
                    path = capture / "inputs" / alias
                    atomic_bytes(path, data)
                    inputs[alias] = str(path)
                self.counts["source_executions"] += 1
                _, stats = one_shot(self.settings, build_dir / "worker", "build", {
                    "source": str(source), "parameters": request["parameters"], "inputs": inputs,
                    "bundle": str(build_dir / "worker" / "bundle")}, cancel)
                self.process_reports.append(stats.copy())
                snapshot = self.directory / ("snapshot-" + uuid.uuid4().hex)
                manifest = self._bundle(build_dir / "worker" / "bundle" / "manifest.json", snapshot)
                manifest.update(build_key=key, provenance=provenance, frozen_files=[])
                for path in capture.rglob("*"):
                    if path.is_file() and path.suffix != ".pyc":
                        target = snapshot / "frozen" / path.relative_to(capture)
                        atomic_bytes(target, read_bytes(path))
                        manifest["frozen_files"].append(record(target, snapshot))
                atomic_json(snapshot / "manifest.json", manifest)
                self.snapshots[key] = snapshot / "manifest.json"
                self.counts["builds"] += 1
                path_type = "build"
            else:
                manifest = load_json(self.snapshots[key])
                self.counts["restores"] += 1
            handle = uuid.uuid4().hex
            loaded = self.native.call({"op": "load", "path": str(self.snapshots[key]), "key": handle}, cancel)
            self.counts["loads"] += 1
            if sum(p["memory_bytes"] for p in loaded["baseline"].values()) > self.settings.cache_bytes:
                self.native.call({"op": "release", "key": handle})
                raise CadError("memory_limit", "Geometry exceeds retained cache memory limit")
            entry = Entry(handle, key, scope, self.generation, self.snapshots[key], manifest,
                          loaded["baseline"], time.monotonic(), time.monotonic())
            self.entries[handle] = entry
            self.timings.append({"phase": path_type, "seconds": time.monotonic()-started})
            return self._descriptor(entry)

    def inspect_geometry(self, handle: str, *, scope: str = "local") -> dict:
        with self.query_lock, self.state_lock:
            self._entry(handle, scope)
            return self.native.call({"op": "inspect", "key": handle})

    def evaluate_geometry(self, handle: str, request_path: Path | str, output: Path | str,
                          *, scope: str = "local", cancel: threading.Event | None = None) -> tuple[Path, int]:
        return self.evaluate(request_path, output, scope=scope, cancel=cancel, handle=handle)

    def evaluate(self, request_path: Path | str, output: Path | str, *, scope: str = "local",
                 cancel: threading.Event | None = None, handle: str | None = None) -> tuple[Path, int]:
        output = Path(output).absolute()
        output.mkdir(parents=True, exist_ok=False)
        started = time.monotonic()
        request = None
        entry = None
        exit_code = 0
        result = {"schema_version": 1, "run_id": uuid.uuid4().hex,
                  "execution": {"status": "completed", "started_at": now()}, "provenance": {},
                  "geometry": None, "artifacts": [], "metrics": [], "diagnostics": {}}
        def check():
            if cancel and cancel.is_set():
                raise CadError("cancelled", "Evaluation cancelled")
            if time.monotonic()-started >= self.settings.wall_seconds:
                raise CadError("timeout", "Evaluation wall-time budget exhausted")
        with self.query_lock:
            try:
                path = Path(request_path).resolve()
                original = read_bytes(path, self.settings.input_bytes)
                atomic_bytes(output / "frozen" / "request.json", original)
                request = validate_request(load_json(output / "frozen" / "request.json"),
                    max_pixels=self.settings.max_pixels, padding=self.settings.grid_padding)
                atomic_json(output / "frozen" / "effective-request.json", request)
                result["provenance"] = {"request": record(output / "frozen" / "request.json", output, "application/json"),
                    "effective_settings": self.settings.manifest(), "request_sha256": digest(original)}
                if handle and (request.get("geometry") != {"handle": handle}):
                    raise CadError("invalid_request", "evaluate_geometry requires the matching handle request")
                check()
                if handle is None:
                    handle = request.get("geometry", {}).get("handle")
                if handle is None:
                    ensured = self.ensure_geometry(path, scope=scope, cancel=cancel)
                    handle = ensured["handle"]
                with self.state_lock:
                    entry = self._entry(handle, scope)
                    entry.active_uses += 1
                self.counts["queries"] += 1
                self._bundle(entry.snapshot, output / "geometry")
                result["geometry"] = {k: v for k, v in self._descriptor(entry).items() if k != "snapshot_path"}
                result["geometry"]["snapshot"] = record(output / "geometry" / "manifest.json", output, "application/json")
                result["provenance"].update(entry.manifest.get("provenance", {}))
                if request["metrics"]:
                    raw = self.native.call({"op": "metrics", "key": handle,
                        "metrics": [{k: v for k, v in metric.items() if k not in ("criterion", "evidence_artifact_ids")}
                                    for metric in request["metrics"]]}, cancel, started+self.settings.wall_seconds)
                    result["metrics"] = [compare(metric, value) for metric, value in zip(request["metrics"], raw["metrics"])]
                meshes = {}
                for wanted in request["outputs"]:
                    check()
                    try:
                        if wanted["kind"] == "png":
                            from .render import render_output, versions
                            selection = tuple(wanted["parts"])
                            if selection not in meshes:
                                meshes[selection] = self.native.call({"op": "mesh", "key": handle,
                                    "parts": wanted["parts"], "deflection": self.settings.tessellation_mm},
                                    cancel, started+self.settings.wall_seconds)
                            result["provenance"]["render"] = versions(self.settings)
                            artifact = render_output(wanted, meshes[selection], output,
                                entry.manifest["geometry_digest"], self.settings, check, self.fault)
                        else:
                            artifact = self._export(handle, wanted, output, cancel, started+self.settings.wall_seconds)
                        result["artifacts"].append(artifact)
                    except CadError as exc:
                        if exc.code in ("timeout", "cancelled", "native_lost"):
                            raise
                        result["artifacts"].append({"id": wanted["id"], "kind": wanted["kind"],
                                                   "status": "error", "reason": str(exc)})
                    except Exception as exc:
                        result["artifacts"].append({"id": wanted["id"], "kind": wanted["kind"],
                                                   "status": "error", "reason": str(exc)})
                check()
            except (CadError, OSError, ValueError, KeyError) as exc:
                code = exc.code if isinstance(exc, CadError) else "supervisor_error"
                rejected = code in {"invalid_request", "invalid_path", "duplicate_id", "invalid_unit",
                    "invalid_metric", "invalid_criterion", "invalid_json", "nonfinite_number", "input_unavailable",
                    "digest_mismatch", "invalid_bundle", "incompatible_bundle", "input_limit"}
                result["execution"].update(status="rejected" if rejected else "cancelled" if code == "cancelled" else "failed",
                    reason=code, message=str(exc), details=getattr(exc, "details", {}))
                exit_code = 2 if rejected else 1
                if self.native and self.native.process.poll() is not None:
                    self.close()
            finally:
                if entry:
                    with self.state_lock:
                        entry.active_uses -= 1
                        entry.touched = time.monotonic()
                        if result["geometry"]:
                            result["geometry"]["active_uses"] = entry.active_uses
                            result["geometry"]["expires_at"] = self._descriptor(entry)["expires_at"]
                        if entry.release_requested:
                            entry.unavailable_reason = "released"
                            if self.native:
                                self.native.call({"op": "release", "key": entry.handle})
                if request:
                    finished = {a["id"] for a in result["artifacts"]}
                    for wanted in request["outputs"]:
                        if wanted["id"] not in finished:
                            result["artifacts"].append({"id": wanted["id"], "kind": wanted["kind"], "status": "unavailable",
                                                       "reason": result["execution"].get("reason", "interrupted")})
                    finished = {m["id"] for m in result["metrics"]}
                    for metric in request["metrics"]:
                        if metric["id"] not in finished:
                            result["metrics"].append(compare(metric, {"value": None, "status": "unavailable",
                                                                      "reason": result["execution"].get("reason", "interrupted")}))
                duration = time.monotonic()-started
                self.timings.append({"phase": "query", "seconds": duration})
                result["execution"].update(finished_at=now(), duration_seconds=duration)
                result["diagnostics"] = self.diagnostics()
                # Copy bounded logs as control evidence, never advertise an incomplete artifact.
                for log in self.directory.rglob("*.log"):
                    destination = output / "logs" / log.relative_to(self.directory)
                    atomic_bytes(destination, read_bytes(log, self.settings.log_bytes))
        self.fault("finalization", result["run_id"])
        validate_result(result, output)
        atomic_json(output / "result.json", result)
        return output / "result.json", exit_code

    def _export(self, handle: str, request: dict, output: Path, cancel, deadline: float) -> dict:
        self.fault("export", request["id"])
        work = output / "control" / request["id"]
        work.mkdir(parents=True)
        temporary = work / "candidate.step"
        original = self.native.call({"op": "export", "key": handle, "parts": request["parts"],
                                     "path": str(temporary)}, cancel, deadline)["baseline"]
        reopened, stats = one_shot(self.settings, work / "reopen", "step-check", {"step": str(temporary)}, cancel)
        self.process_reports.append(stats.copy())
        actual = reopened["baseline"]
        tolerance = {"length_absolute_mm": 1e-6, "volume_absolute_mm3": 1e-5, "relative": 1e-9}
        checks = {"units_mm": bool(reopened["length_units"]) and all(u == ".MILLI." for u in reopened["length_units"]),
                  "validity": actual["validity"] is True and original["validity"] is True,
                  "solid_count": actual["solid_count"] == original["solid_count"],
                  "bounds": all(abs(a-b) <= tolerance["length_absolute_mm"] + tolerance["relative"]*abs(a)
                                for a, b in zip(original["bounds"], actual["bounds"])),
                  "volume": abs(actual["volume"]-original["volume"]) <= tolerance["volume_absolute_mm3"] +
                            tolerance["relative"]*abs(original["volume"])}
        report = {"schema_version": 1, "method": "clean-step-reopen@1", "expected": original,
                  "actual": actual, "length_units": reopened["length_units"], "tolerances": tolerance,
                  "checks": checks, "passed": all(checks.values()),
                  "limitations": "Sanity gate only; no topology identity, thread fit or physical fit guarantee."}
        atomic_json(work / "comparison.json", report)
        comparison = record(work / "comparison.json", output, "application/json")
        if not report["passed"]:
            return {"id": request["id"], "kind": "step", "status": "error", "reason": "step_gate_failed", "comparison": comparison}
        destination = output / "artifacts" / (request["id"] + ".step")
        atomic_bytes(destination, read_bytes(temporary, self.settings.output_bytes))
        return {"id": request["id"], "kind": "step", "status": "ready", "comparison": comparison,
                **record(destination, output, "model/step")}
