"""Retained local evaluator process, isolated from the agent Python environment."""
import asyncio
import json
import os
from pathlib import Path
import signal

from .cad_files import canonical
from .store import identifier


class CadFailure(ValueError):
    def __init__(self, code, message):
        self.code = code
        super().__init__(message)


class NativeBridge:
    def __init__(self, settings, directory, scope):
        self.settings, self.directory, self.scope = settings, Path(directory), scope
        self.lock = asyncio.Lock()
        self.process = None
        self.stderr_task = None
        self.diagnostics = {"counts": {"source_executions": 0, "builds": 0, "loads": 0, "restores": 0, "queries": 0}}

    async def start(self):
        if self.process and self.process.returncode is None:
            return
        if not self.settings.python.is_file():
            raise CadFailure("missing_prerequisite", "Prepare the locked cad/ environment before CAD requests")
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        generation = identifier()
        self.diagnostics = {"counts": {"source_executions": 0, "builds": 0, "loads": 0, "restores": 0, "queries": 0}}
        env = {"PATH": os.defpath, "LANG": "C.UTF-8", "PYTHONDONTWRITEBYTECODE": "1"}
        for name in ("CRAFTY_NATIVE_PYTHON", "CRAFTY_FREECAD_LIB", "CRAFTY_FONT"):
            if name in os.environ:
                env[name] = os.environ[name]
        self.process = await asyncio.create_subprocess_exec(str(self.settings.python), "-I",
            str(Path(__file__).with_name("cad_native.py")), "--directory", str(self.directory / generation),
            "--scope", self.scope, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE, env=env, start_new_session=True, limit=16 * 1024 * 1024)
        self.stderr_task = asyncio.create_task(self.drain_stderr(self.process, self.directory / (generation + ".log")))

    @staticmethod
    async def drain_stderr(process, path):
        remaining = 128 * 1024
        with path.open("wb") as log:
            while chunk := await process.stderr.read(8192):
                if remaining > 0:
                    log.write(chunk[:remaining])
                    remaining -= len(chunk)

    async def call(self, message):
        async with self.lock:
            await self.start()
            process = self.process
            try:
                process.stdin.write(canonical(message) + b"\n")
                await process.stdin.drain()
                line = await asyncio.wait_for(process.stdout.readline(), 45)
                if not line:
                    raise CadFailure("geometry_unavailable", "Retained CAD runtime was lost; explicitly restore its snapshot")
                response = json.loads(line)
                self.diagnostics = response.get("diagnostics", self.diagnostics)
                if not response["ok"]:
                    raise CadFailure(response["error"]["code"], response["error"]["message"])
                return response["result"]
            except (asyncio.TimeoutError, BrokenPipeError, ConnectionError, json.JSONDecodeError) as error:
                await self.close()
                raise CadFailure("geometry_unavailable", "CAD runtime interrupted; restore its retained native snapshot") from error

    async def cancel(self):
        if self.process and self.process.returncode is None:
            self.process.send_signal(signal.SIGUSR1)

    async def close(self):
        process, self.process = self.process, None
        if process and process.returncode is None:
            try:
                process.stdin.write(b'{"op":"close"}\n')
                await process.stdin.drain()
                await asyncio.wait_for(process.wait(), 4)
            except (asyncio.TimeoutError, BrokenPipeError, ConnectionError):
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
                try:
                    await asyncio.wait_for(process.wait(), 3)
                except asyncio.TimeoutError:
                    os.killpg(process.pid, signal.SIGKILL)
                    await process.wait()
        if self.stderr_task:
            await self.stderr_task
            self.stderr_task = None
