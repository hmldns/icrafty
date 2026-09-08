"""Bounded native subprocess ownership and serialized data-only RPC."""

from __future__ import annotations

import json
import os
from pathlib import Path
import selectors
import signal
import subprocess
import threading
import time
from typing import Any

from .files import CadError, atomic_json, load_json
from .settings import Settings


def process_tree(pid: int) -> list[tuple[int, int]]:
    """Return owned descendants and their RSS; Linux local acceptance platform."""
    entries = {}
    for directory in Path("/proc").iterdir():
        if not directory.name.isdigit():
            continue
        try:
            fields = (directory / "stat").read_text().rsplit(")", 1)[1].split()
            entries[int(directory.name)] = (int(fields[1]), int(fields[21]) * os.sysconf("SC_PAGE_SIZE"))
        except (OSError, ValueError, IndexError):
            pass
    owned = {pid}
    while True:
        more = {child for child, (parent, _) in entries.items() if parent in owned}
        if more <= owned:
            break
        owned |= more
    return [(child, entries[child][1]) for child in owned if child in entries]


class NativeProcess:
    def __init__(self, settings: Settings, directory: Path, mode: str, job: Path | None = None):
        self.settings = settings
        self.directory = directory
        directory.mkdir(parents=True, exist_ok=True)
        self.log_path = directory / (mode + ".log")
        self.log = self.log_path.open("xb")
        self.log_size = 0
        self.peak_rss = self.peak_processes = 0
        self.buffer = b""
        self.started = time.monotonic()
        self.command = [settings.native_python, "-I", str(Path(__file__).with_name("native_worker.py")),
                        mode, "--lib", settings.freecad_lib, "--memory", str(settings.memory_bytes),
                        "--cpu", str(settings.cpu_seconds), "--output-limit", str(settings.output_bytes)]
        if job:
            self.command.extend(["--job", str(job)])
        env = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8",
               "QT_QPA_PLATFORM": "offscreen", "OMP_NUM_THREADS": "1",
               "OPENBLAS_NUM_THREADS": "1", "XDG_CONFIG_HOME": str(directory / "config"),
               "XDG_CACHE_HOME": str(directory / "cache")}
        try:
            self.process = subprocess.Popen(self.command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, cwd=directory, env=env, start_new_session=True)
        except OSError as exc:
            self.log.close()
            raise CadError("missing_native", f"Cannot launch {settings.native_python}: {exc}") from exc
        self.selector = selectors.DefaultSelector()
        for stream in (self.process.stdout, self.process.stderr):
            os.set_blocking(stream.fileno(), False)
            self.selector.register(stream, selectors.EVENT_READ)
        self.stats = {"command": self.command, "pid": self.process.pid}

    def _log(self, data: bytes):
        remaining = self.settings.log_bytes - self.log_size
        if remaining > 0:
            data = data[:remaining]
            self.log.write(data)
            self.log.flush()
            self.log_size += len(data)

    def _guard(self, deadline: float, cancel: threading.Event | None):
        code = None
        if cancel and cancel.is_set():
            code = "cancelled"
        elif time.monotonic() >= deadline:
            code = "timeout"
        tree = process_tree(self.process.pid)
        self.peak_rss = max(self.peak_rss, sum(rss for _, rss in tree))
        self.peak_processes = max(self.peak_processes, len(tree))
        if len(tree) > self.settings.process_count:
            code = "process_limit"
        if sum(rss for _, rss in tree) > self.settings.memory_bytes:
            code = "memory_limit"
        total = 0
        for path in self.directory.rglob("*"):
            if path.is_file() and not path.is_symlink():
                total += path.stat().st_size
        if total > self.settings.output_bytes:
            code = "output_limit"
        if code:
            self.close()
            raise CadError(code, f"Native process stopped: {code}", process=self.stats)

    def _read(self, deadline: float, cancel: threading.Event | None, rpc: bool):
        while True:
            self._guard(deadline, cancel)
            for key, _ in self.selector.select(0.04):
                data = os.read(key.fileobj.fileno(), 65536)
                if not data:
                    self.selector.unregister(key.fileobj)
                    continue
                if rpc and key.fileobj is self.process.stdout:
                    self.buffer += data
                    if len(self.buffer) > self.settings.output_bytes:
                        raise CadError("output_limit", "Native RPC exceeds output limit")
                    while b"\n" in self.buffer:
                        line, self.buffer = self.buffer.split(b"\n", 1)
                        if line.startswith(b"CRAFTY_RPC:"):
                            response = json.loads(line[len(b"CRAFTY_RPC:"):])
                            if not response["ok"]:
                                raise CadError("native_error", response["error"], traceback=response.get("traceback"))
                            return response["data"]
                        self._log(line + b"\n")
                else:
                    self._log(data)
            if self.process.poll() is not None and not self.selector.get_map():
                if rpc:
                    raise CadError("native_lost", f"Native process exited {self.process.returncode}")
                return self.process.returncode

    def call(self, job: dict, cancel: threading.Event | None = None, deadline: float | None = None) -> dict:
        if self.process.poll() is not None:
            raise CadError("native_lost", "Retained native process is no longer live")
        self.process.stdin.write(json.dumps(job, allow_nan=False).encode() + b"\n")
        self.process.stdin.flush()
        return self._read(deadline or time.monotonic() + self.settings.wall_seconds, cancel, True)

    def wait(self, cancel: threading.Event | None = None) -> int:
        return self._read(time.monotonic() + self.settings.wall_seconds, cancel, False)

    def close(self):
        tree = process_tree(self.process.pid)
        try:
            os.killpg(self.process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        for pid, _ in tree:
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        self.process.wait(timeout=5)
        self.stats.update(peak_rss_bytes=self.peak_rss, peak_processes=self.peak_processes,
                          duration_seconds=time.monotonic() - self.started, exit_code=self.process.returncode)
        self.selector.close()
        self.log.close()
        for stream in (self.process.stdin, self.process.stdout, self.process.stderr):
            stream.close()


def one_shot(settings: Settings, directory: Path, mode: str, job: dict,
             cancel: threading.Event | None = None) -> tuple[dict, dict]:
    directory.mkdir(parents=True, exist_ok=True)
    job = {**job, "response": str(directory / "response.json")}
    atomic_json(directory / "job.json", job)
    process = NativeProcess(settings, directory, mode, directory / "job.json")
    try:
        code = process.wait(cancel)
        response = load_json(directory / "response.json") if (directory / "response.json").exists() else None
        if code or not response or not response["ok"]:
            raise CadError("build_error" if mode == "build" else "export_error",
                           response.get("error", "Native execution failed") if response else "Native execution failed",
                           exit_code=code, traceback=(response or {}).get("traceback"))
        return response["data"], process.stats
    finally:
        process.close()
