"""Bounded, bidirectional ACP stdio transport; no domain or UI dependencies."""
from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
import json
import os
from pathlib import Path
import signal
from typing import Any


class AcpError(RuntimeError):
    pass


class AcpConnection:
    def __init__(self, command: tuple[str, ...], env: dict[str, str], cwd: Path,
                 on_event: Callable[[dict], Awaitable[None]],
                 on_request: Callable[[dict], Awaitable[dict]],
                 on_exit: Callable[[], Awaitable[None]], *, max_frame: int = 48 * 1024 * 1024):
        self.command, self.env, self.cwd = command, env, cwd
        self.on_event, self.on_request, self.on_exit = on_event, on_request, on_exit
        self.max_frame = max_frame
        self.process: asyncio.subprocess.Process | None = None
        self.pending: dict[str, asyncio.Future] = {}
        self.tasks: set[asyncio.Task] = set()
        self.counter = 0
        self.closed = False
        self.write_lock = asyncio.Lock()

    async def start(self):
        self.process = await asyncio.create_subprocess_exec(
            *self.command, cwd=self.cwd, env=self.env, start_new_session=True,
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE, limit=self.max_frame,
        )
        self._task(self._read())
        self._task(self._stderr())

    def _task(self, coroutine):
        task = asyncio.create_task(coroutine)
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)
        return task

    async def _write(self, value: dict):
        if not self.process or self.closed or self.process.returncode is not None:
            raise AcpError("Agent runtime is not connected")
        data = json.dumps(value, separators=(",", ":"), allow_nan=False).encode() + b"\n"
        if len(data) > self.max_frame:
            raise AcpError("ACP frame exceeds the configured limit")
        async with self.write_lock:
            assert self.process.stdin
            self.process.stdin.write(data)
            await self.process.stdin.drain()

    async def request(self, method: str, params: dict, timeout: float | None = 90) -> Any:
        self.counter += 1
        request_id = f"client-{self.counter}"
        future = asyncio.get_running_loop().create_future()
        self.pending[request_id] = future
        try:
            await self._write({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params})
            return await asyncio.wait_for(future, timeout)
        finally:
            self.pending.pop(request_id, None)

    async def notify(self, method: str, params: dict):
        await self._write({"jsonrpc": "2.0", "method": method, "params": params})

    async def _respond(self, message: dict):
        try:
            result = await self.on_request(message)
            await self._write({"jsonrpc": "2.0", "id": message["id"], "result": result})
        except asyncio.CancelledError:
            raise
        except Exception:
            if not self.closed:
                try:
                    await self._write({"jsonrpc": "2.0", "id": message["id"],
                                       "error": {"code": -32601, "message": "Client capability unavailable"}})
                except (AcpError, BrokenPipeError):
                    pass

    async def _read(self):
        assert self.process and self.process.stdout
        failure = "Agent process disconnected"
        try:
            while line := await self.process.stdout.readline():
                if len(line) > self.max_frame:
                    raise AcpError("ACP frame exceeds configured limit")
                message = json.loads(line)
                if not isinstance(message, dict):
                    raise AcpError("Invalid ACP message")
                if "method" in message:
                    if "id" in message:
                        self._task(self._respond(message))
                    else:
                        # Apply earlier updates before completing the prompt's response.
                        await self.on_event(message)
                        # Buffered stdout can contain hundreds of text deltas.
                        # Let the websocket publisher run between them.
                        await asyncio.sleep(0)
                else:
                    future = self.pending.get(message.get("id"))
                    if future is not None and not future.done():
                        if "error" in message:
                            error = message["error"]
                            future.set_exception(AcpError(str(error.get("message", "ACP request failed"))[:1000]))
                        else:
                            future.set_result(message.get("result"))
        except asyncio.CancelledError:
            return
        except Exception as error:
            failure = f"ACP stream failed ({type(error).__name__})"
        finally:
            for future in tuple(self.pending.values()):
                if not future.done():
                    future.set_exception(AcpError(failure))
            if not self.closed:
                await self.on_exit()

    async def _stderr(self):
        assert self.process and self.process.stderr
        remaining = 128 * 1024
        with (self.cwd.parent / "runtime.log").open("wb") as log:
            while chunk := await self.process.stderr.read(8192):
                if remaining > 0:
                    log.write(chunk[:remaining])
                    remaining -= len(chunk)

    async def close(self):
        if self.closed:
            return
        self.closed = True
        if self.process:
            try:
                os.killpg(self.process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(self.process.wait(), 3)
            except asyncio.TimeoutError:
                try:
                    os.killpg(self.process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                await self.process.wait()
        current = asyncio.current_task()
        tasks = [task for task in self.tasks if task is not current]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        for future in tuple(self.pending.values()):
            if not future.done():
                future.set_exception(AcpError("Agent runtime stopped"))
