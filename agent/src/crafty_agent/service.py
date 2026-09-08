"""Session ownership and command coordination, independent of HTTP and React."""
from __future__ import annotations

import asyncio
import base64
import fcntl
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import sys

from .acp import AcpConnection, AcpError
from .config import Settings
from .normalize import compact, merge_tool
from .store import Store, encode, identifier, now


class BusyError(ValueError):
    pass


INSTRUCTIONS = """You are Crafty's conversational image-design assistant, working in a private local session.
Discuss the user's repair and images. For image creation/editing use your native image generation tool.
Publish completed generated images with crafty_images.publish_image, giving its actual saved local path,
a useful title and caption. The tool copies the image into the chat as an inspectable/downloadable asset.
After publication, refer to the image card or its returned asset URL. Do not put local filesystem paths
or private prompt-file links in the final chat reply. Keep local paths in tool arguments only.
Do not claim an image was generated or published unless those operations succeeded. Do not substitute
Python/SVG drawing for requested AI image generation. Use crafty_images.list_images and fetch_image
for existing session images; inspect pixels with the image view tool when a file path was provided.
Use crafty_images.request_camera when a fresh photo would help: it mounts a camera card and returns
immediately; the human sends their capture in a later turn. Never wait indefinitely for a capture.
You are operating the chat, not developing its software. Keep code, exports and drafts inside this
session workspace. Do not inspect credentials, other sessions, or parent project files. Do not spawn
agents or change system configuration. Answer concisely. Image generation can take a few minutes.
"""


class Runtime:
    def __init__(self, owner: AgentService, sid: str):
        self.owner, self.sid = owner, sid
        self.lock = asyncio.Lock()
        self.commands = asyncio.Lock()
        self.connection: AcpConnection | None = None
        self.token = ""
        self.generation = 0
        self.turn_task: asyncio.Task | None = None
        self.permissions: dict[str, asyncio.Future] = {}
        self.segment = 0
        self.message_id: str | None = None
        self.cancelled = False
        self.recovering = False

    @property
    def folder(self):
        return self.owner.settings.data / "sessions" / self.sid

    @property
    def workspace(self):
        return self.folder / "workspace"

    async def ensure(self):
        async with self.lock:
            state = self.owner.store.session(self.sid)
            if self.connection and not self.connection.closed and state["runtime"] == "ready":
                return
            if self.connection:
                await self.connection.close()
                self.connection = None
            settings = self.owner.settings
            self.workspace.mkdir(parents=True, exist_ok=True, mode=0o700)
            codex_state = self.folder / "codex"
            codex_state.mkdir(exist_ok=True, mode=0o700)
            auth = codex_state / "auth.json"
            if not auth.exists() and settings.auth_source and settings.auth_source.is_file():
                shutil.copyfile(settings.auth_source, auth)
                auth.chmod(0o600)
            (self.workspace / "AGENTS.md").write_text(INSTRUCTIONS)
            self.generation = state["generation"] + 1
            self.token = secrets.token_urlsafe(32)
            self.owner.store.update_session(self.sid, runtime="starting", generation=self.generation, error=None)
            env = dict(os.environ)
            for key in ("CODEX_API_KEY", "OPENAI_API_KEY", "CODEX_CONFIG", "APP_SERVER_LOGS", "DEFAULT_AUTH_REQUEST", "MODEL_PROVIDER"):
                env.pop(key, None)
            config = {"features": {"image_generation": True, "apps": False, "multi_agent": False}}
            if settings.model:
                config["model"] = settings.model
            if settings.reasoning:
                config["model_reasoning_effort"] = settings.reasoning
            # CODEX_HOME is the supported runtime setting, never a shared writable home.
            env.update(CODEX_HOME=str(codex_state), CODEX_CONFIG=json.dumps(config),
                       INITIAL_AGENT_MODE="agent", NO_BROWSER="1")
            if settings.codex_path:
                env["CODEX_PATH"] = settings.codex_path
            else:
                env.pop("CODEX_PATH", None)
            connection = AcpConnection(settings.adapter, env, self.workspace, self.event, self.request, self.disconnected,
                                       max_frame=settings.max_frame_bytes)
            self.connection = connection
            try:
                await connection.start()
                hello = await connection.request("initialize", {"protocolVersion": 1,
                    "clientInfo": {"name": "crafty", "version": "0.1.0"},
                    "clientCapabilities": {"fs": {"readTextFile": False, "writeTextFile": False}, "terminal": False}}, settings.startup_timeout)
                caps = hello.get("agentCapabilities", {})
                server = {"name": "crafty_images", "command": sys.executable,
                          "args": ["-m", "crafty_agent.mcp_server"],
                          "env": [{"name": key, "value": value} for key, value in {
                              "CRAFTY_MCP_URL": self.owner.base_url, "CRAFTY_MCP_SESSION": self.sid,
                              "CRAFTY_MCP_TOKEN": self.token, "CRAFTY_MCP_WORKSPACE": str(self.workspace),
                              "CRAFTY_MCP_GENERATED_ROOT": str(codex_state / "generated_images")}.items()]}
                params = {"cwd": str(self.workspace), "mcpServers": [server]}
                method = "session/new"
                if state["acpSessionId"]:
                    self.recovering = True
                    params["sessionId"] = state["acpSessionId"]
                    method = "session/resume" if "resume" in caps.get("sessionCapabilities", {}) else "session/load"
                    if method == "session/load" and not caps.get("loadSession"):
                        raise AcpError("This adapter cannot restore the saved conversation")
                result = await connection.request(method, params, settings.startup_timeout)
                self.recovering = False
                acp_id = result.get("sessionId", state["acpSessionId"])
                if not acp_id:
                    raise AcpError("Adapter returned no session identity")
                if state["acpSessionId"] and acp_id != state["acpSessionId"]:
                    raise AcpError("Adapter did not restore the requested conversation identity")
                self.owner.store.update_session(self.sid, runtime="ready", acpSessionId=acp_id,
                    capabilities=compact(caps), adapter=hello.get("agentInfo"),
                    model=result.get("models", {}).get("currentModelId", state.get("model") or settings.model), error=None)
            except Exception as error:
                self.recovering = False
                await connection.close()
                self.connection = None
                self.token = ""
                self.owner.store.update_session(self.sid, runtime="failed", error=f"Could not start Codex: {str(error)[:600]}")
                raise

    async def event(self, message: dict):
        if message.get("method") != "session/update" or self.recovering:
            return
        state = self.owner.store.session(self.sid)
        if state["generation"] != self.generation:
            return
        params = message.get("params", {})
        if state["acpSessionId"] and params.get("sessionId") != state["acpSessionId"]:
            return
        update = params.get("update", {})
        kind = update.get("sessionUpdate")
        if not state["activeTurnId"]:
            return
        if kind == "agent_message_chunk":
            content = update.get("content", {})
            if content.get("type") != "text":
                return
            if self.message_id is None:
                self.segment += 1
                self.message_id = f'{state["activeTurnId"]}:assistant:{self.segment}'
            previous = self.owner.store.record(self.sid, self.message_id)
            record = previous or {"type": "message", "id": self.message_id, "author": "crafty", "origin": "agent", "text": "", "imageIds": []}
            record["text"] = (record["text"] + content.get("text", ""))[:250_000]
            self.owner.store.put_record(self.sid, record)
        elif kind in {"tool_call", "tool_call_update"} and update.get("toolCallId"):
            self.message_id = None
            previous = self.owner.store.record(self.sid, update["toolCallId"])
            record = merge_tool(previous, update)
            record.update(turnId=state["activeTurnId"], generation=self.generation)
            result = record.get("rawOutput")
            if record.get("name") == "camera.capture" and isinstance(result, dict) and result.get("requestId"):
                try:
                    interaction = self.owner.store.interaction(self.sid, result["requestId"])
                    if interaction["kind"] != "camera" or interaction["turnId"] != state["activeTurnId"]:
                        raise ValueError("Camera result does not belong to this turn")
                    interaction["toolCallId"] = record["toolCallId"]
                    self.owner.store.put_interaction(self.sid, interaction)
                    record["rawOutput"] = self.owner.store.camera_result(interaction)
                except (KeyError, ValueError):
                    record.update(status="failed", rawOutput={"error": "Camera request reference is invalid"})
            self.owner.store.put_record(self.sid, record)

    async def request(self, message: dict) -> dict:
        if message.get("method") != "session/request_permission":
            raise AcpError("Client method is not implemented")
        state = self.owner.store.session(self.sid)
        if self.cancelled or not state["activeTurnId"] or state["generation"] != self.generation:
            return {"outcome": {"outcome": "cancelled"}}
        pid = identifier()
        params = message.get("params", {})
        if params.get("sessionId") != state["acpSessionId"]:
            return {"outcome": {"outcome": "cancelled"}}
        permission = {"id": pid, "kind": "permission", "status": "pending", "createdAt": now(),
                      "turnId": state["activeTurnId"], "generation": self.generation,
                      "toolCall": compact(params.get("toolCall", {})), "options": params.get("options", [])}
        self.owner.store.put_interaction(self.sid, permission)
        future = asyncio.get_running_loop().create_future()
        self.permissions[pid] = future
        self.owner.store.update_session(self.sid, permissions=[*state["permissions"], permission], turnStatus="waiting_permission")
        option = None
        try:
            option = await future
            return {"outcome": {"outcome": "selected", "optionId": option}} if option else {"outcome": {"outcome": "cancelled"}}
        finally:
            self.owner.store.put_interaction(self.sid, {**permission, "status": "resolved" if option else "cancelled",
                                                       "optionId": option, "resolvedAt": now()})
            self.permissions.pop(pid, None)
            state = self.owner.store.session(self.sid)
            self.owner.store.update_session(self.sid, permissions=[p for p in state["permissions"] if p["id"] != pid],
                                           turnStatus="cancelling" if self.cancelled else "running" if state["activeTurnId"] else state["turnStatus"])

    def resolve_permissions(self):
        for future in tuple(self.permissions.values()):
            if not future.done():
                future.set_result(None)

    async def run_turn(self, turn: dict):
        self.message_id, self.segment = None, 0
        status, error, reason = "failed", None, None
        try:
            state = self.owner.store.session(self.sid)
            blocks = [{"type": "text", "text": turn["text"] or "Please inspect the attached image."}]
            for aid in turn["imageIds"]:
                asset = self.owner.store.asset(self.sid, aid)
                path = self.owner.materialize(self.sid, aid)
                blocks.append({"type": "text", "text": f'Attached image {asset["title"]!r}: asset ID {aid}; local file {path}. Use fetch_image to present it, or your image-view tool to inspect it.'})
                if state["capabilities"].get("promptCapabilities", {}).get("image"):
                    blocks.append({"type": "image", "data": base64.b64encode(path.read_bytes()).decode(), "mimeType": asset["mimeType"]})
            assert self.connection
            self.owner.store.dispatched(turn["id"])
            result = await self.connection.request("session/prompt", {"sessionId": state["acpSessionId"], "prompt": blocks}, self.owner.settings.turn_timeout)
            reason = result.get("stopReason")
            status = "cancelled" if self.cancelled or reason == "cancelled" else "completed"
            if reason not in {"end_turn", "cancelled", None}:
                status, error = "failed", f"Agent stopped: {reason}"
        except asyncio.TimeoutError:
            status, error = "interrupted", "Turn exceeded its time budget; runtime stopped."
            await self.stop_process()
        except asyncio.CancelledError:
            status = "cancelled" if self.cancelled else "interrupted"
        except Exception as failure:
            status, error = "cancelled" if self.cancelled else "failed", str(failure)[:1000]
        finally:
            self.resolve_permissions()
            self.owner.store.finish_turn(self.sid, turn["id"], status, error, reason)

    async def cancel(self):
        self.cancelled = True
        state = self.owner.store.session(self.sid)
        if not state["activeTurnId"]:
            return
        self.owner.store.update_session(self.sid, turnStatus="cancelling")
        self.resolve_permissions()
        if self.connection and not self.connection.closed:
            try:
                await self.connection.notify("session/cancel", {"sessionId": state["acpSessionId"]})
            except (AcpError, BrokenPipeError):
                pass
        if self.turn_task:
            try:
                await asyncio.wait_for(asyncio.shield(self.turn_task), self.owner.settings.cancel_timeout)
            except asyncio.TimeoutError:
                await self.stop_process()
                self.turn_task.cancel()
                await asyncio.gather(self.turn_task, return_exceptions=True)

    async def stop_process(self):
        self.token = ""
        if self.connection:
            await self.connection.close()
            self.connection = None
        self.owner.store.update_session(self.sid, runtime="stopped", permissions=[])

    async def disconnected(self):
        self.token = ""
        self.resolve_permissions()
        state = self.owner.store.session(self.sid)
        if state["activeTurnId"]:
            self.owner.store.finish_turn(self.sid, state["activeTurnId"], "interrupted", "Codex disconnected. Reopen the session before continuing.")
        self.owner.store.update_session(self.sid, runtime="failed", error="Codex runtime disconnected")


class AgentService:
    def __init__(self, settings: Settings, base_url: str):
        self.settings, self.base_url = settings, base_url
        settings.data.mkdir(parents=True, exist_ok=True, mode=0o700)
        self._lease = (settings.data / "backend.lock").open("a")
        try:
            fcntl.flock(self._lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.store = Store(settings)
        except Exception:
            self._lease.close()
            raise RuntimeError("Agent data root is already owned by another backend or cannot be opened") from None
        self.store.recover()
        self.runtimes: dict[str, Runtime] = {}

    def runtime(self, sid: str) -> Runtime:
        self.store.session(sid)
        if sid not in self.runtimes:
            self.runtimes[sid] = Runtime(self, sid)
        return self.runtimes[sid]

    async def open(self, sid: str):
        runtime = self.runtime(sid)
        async with runtime.commands:
            await runtime.ensure()
        return self.store.snapshot(sid)

    async def cancel(self, sid: str):
        runtime = self.runtime(sid)
        async with runtime.commands:
            await runtime.cancel()

    async def stop(self, sid: str):
        runtime = self.runtime(sid)
        async with runtime.commands:
            await runtime.cancel()
            await runtime.stop_process()

    def materialize(self, sid: str, aid: str) -> Path:
        asset = self.store.asset(sid, aid)
        folder = self.runtime(sid).workspace / "inputs"
        folder.mkdir(parents=True, exist_ok=True)
        if not folder.resolve().is_relative_to(self.runtime(sid).workspace.resolve()):
            raise ValueError("Input directory escaped this session workspace")
        target = folder / (aid + asset["extension"])
        data = self.store.asset_path(sid, aid).read_bytes()
        if hashlib.sha256(data).hexdigest() != asset["digest"]:
            raise ValueError("Stored image digest does not match")
        if target.is_symlink() or not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != asset["digest"]:
            temp = folder / (identifier() + ".tmp")
            with temp.open("xb") as stream:
                stream.write(data)
            temp.replace(target)
        return target

    async def prompt(self, sid: str, client_id: str, text: str, images: list[str]) -> dict:
        if not text.strip() and not images:
            raise ValueError("A message needs text or an image")
        if len(text) > 40000 or len(images) > 8 or len(set(images)) != len(images):
            raise ValueError("Message exceeds limits or repeats image references")
        # Bound the base64 request before creating a durable turn, including text overhead.
        total_bytes = sum(self.store.asset(sid, aid)["size"] for aid in images)
        if total_bytes * 4 // 3 + len(text.encode()) + 65536 > self.settings.max_frame_bytes:
            raise ValueError("Attached images exceed the combined ACP message limit")
        digest = hashlib.sha256(encode({"text": text, "images": images}).encode()).hexdigest()
        previous = self.store.prior_turn(sid, client_id)
        if previous:
            if previous["digest"] != digest:
                raise ValueError("clientMessageId already belongs to different input")
            return previous
        runtime = self.runtime(sid)
        async with runtime.commands:
            previous = self.store.prior_turn(sid, client_id)
            if previous:
                if previous["digest"] != digest:
                    raise ValueError("clientMessageId already belongs to different input")
                return previous
            if self.store.session(sid)["activeTurnId"]:
                raise BusyError("Wait for this turn to finish, or stop it before sending another message")
            await runtime.ensure()
            turn = self.store.create_turn(sid, client_id, text, images, digest)
            runtime.cancelled = False
            runtime.turn_task = asyncio.create_task(runtime.run_turn(turn))
            return turn

    async def close(self):
        for runtime in self.runtimes.values():
            await self.stop(runtime.sid)
        self.store.close()
        self._lease.close()
