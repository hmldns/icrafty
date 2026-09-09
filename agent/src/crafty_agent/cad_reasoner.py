"""One separately recoverable product CAD ACP session per conversational chat."""
import asyncio
import json
import os
from pathlib import Path
import secrets
import shutil
import sys

from .acp import AcpConnection, AcpError
from .cad_files import atomic, canonical
from .cad_protocol import SELECTOR_GUIDE
from .normalize import compact
from .store import identifier, now

INSTRUCTIONS = """You are Crafty's CAD modeling agent, delegated by its conversational agent.
Work only inside this private workspace. Do not inspect credentials, other sessions or repository
files, install dependencies, spawn agents, or change configuration. You are modeling a requested
part, not developing software. FreeCAD is available only through crafty_cad_model tools.
Write self-contained Python source with build(parameters, inputs) returning exactly
{'parts': {name: Part.TopoShape}, 'features': {part_name: {feature_name: actual_subshape}}}.
Use import FreeCAD as App and import Part. Shapes use millimeters, world right-handed Z-up.
The task supplies exact part/feature names, outputs and independently defined metric criteria.
Do not relax these criteria. Save an M-CAD request JSON with schema_version=1, source, parameters,
inputs, outputs and metrics. Source/input paths must be relative below the request directory.
The task's request-template.json supplies outputs and metrics. Complete writes before submission.
cad_evaluate returns an evaluationId; call cad_wait until it returns actual local result_path and
artifact_paths. Read the result.json and INSPECT its ready PNG files with your image-view tool.
A parameter echo or file existence is not measurement. Revise source and reevaluate when criteria
fail. Reusing a local filename does not replace prior evidence. Use a unique idempotency_key for
changed input. To query unchanged geometry use geometry={'handle':returned_handle}, empty
parameters/inputs and the task outputs/metrics. Do not rebuild merely to request another view.
Use cad_ensure if you need a handle before evidence; wait for it before querying.
When ready, result_publish selects actual output IDs, reports inspected PNG IDs and your short
interpretation. A completed evaluation may have failed checks; report them honestly. PNGs do not
imply STEP exists. STEP is allowed only when requested and validated by the service.
Available presets: isometric, top, bottom, front, right. No GLB, threads or general fit claims.
Keep every modeling attempt within the supplied evaluation/time budget. If information is missing,
explain the question in your final response for the parent conversation. Do not wait indefinitely.
""" + SELECTOR_GUIDE


class CadReasoner:
    def __init__(self, owner, sid):
        self.owner, self.sid = owner, sid
        self.folder = owner.store.root / "sessions" / owner.store.session(sid)["id"]
        self.workspace = self.folder / "workspace"
        self.connection = None
        self.token = ""
        self.operation_id = None
        self.generation = 0
        self.reply = ""
        self.recovering = False
        self.permissions = {}

    async def ensure(self):
        state = self.owner.store.session(self.sid)
        if self.connection and not self.connection.closed and self.token and state["runtime"] == "ready":
            return
        if self.connection:
            await self.connection.close()
        settings = self.owner.app.settings
        self.workspace.mkdir(parents=True, exist_ok=True, mode=0o700)
        home = self.folder / "codex"
        home.mkdir(exist_ok=True, mode=0o700)
        if not (home / "auth.json").exists() and settings.auth_source and settings.auth_source.is_file():
            shutil.copyfile(settings.auth_source, home / "auth.json")
            (home / "auth.json").chmod(0o600)
        atomic(self.workspace / "AGENTS.md", INSTRUCTIONS.encode())
        self.token, self.generation = secrets.token_urlsafe(32), state["generation"] + 1
        env = dict(os.environ)
        for name in ("CODEX_API_KEY", "OPENAI_API_KEY", "CODEX_CONFIG", "APP_SERVER_LOGS", "DEFAULT_AUTH_REQUEST", "MODEL_PROVIDER"):
            env.pop(name, None)
        config = {"features": {"image_generation": False, "apps": False, "multi_agent": False}}
        if settings.model:
            config["model"] = settings.model
        if settings.reasoning:
            config["model_reasoning_effort"] = settings.reasoning
        env.update(CODEX_HOME=str(home), CODEX_CONFIG=json.dumps(config), INITIAL_AGENT_MODE="agent", NO_BROWSER="1")
        if settings.codex_path:
            env["CODEX_PATH"] = settings.codex_path
        else:
            env.pop("CODEX_PATH", None)
        state.update(generation=self.generation, runtime="starting")
        self.owner.store.put_session(self.sid, state)
        connection = AcpConnection(settings.adapter, env, self.workspace, self.event, self.permission, self.disconnected,
                                   max_frame=settings.max_frame_bytes)
        self.connection = connection
        try:
            await connection.start()
            hello = await connection.request("initialize", {"protocolVersion": 1, "clientInfo": {"name": "crafty-cad", "version": "1"},
                "clientCapabilities": {"fs": {"readTextFile": False, "writeTextFile": False}, "terminal": False}}, settings.startup_timeout)
            caps = hello.get("agentCapabilities", {})
            params = {"cwd": str(self.workspace), "mcpServers": [self.owner.mcp_server(self.sid, self.token, self.workspace, "model")]}
            method = "session/new"
            if state["acpSessionId"]:
                params["sessionId"] = state["acpSessionId"]
                method = "session/resume" if "resume" in caps.get("sessionCapabilities", {}) else "session/load"
                if method == "session/load" and not caps.get("loadSession"):
                    raise AcpError("CAD adapter cannot restore the saved CAD conversation")
            self.recovering = True
            result = await connection.request(method, params, settings.startup_timeout)
            self.recovering = False
            acp_id = result.get("sessionId", state["acpSessionId"])
            if not acp_id or (state["acpSessionId"] and acp_id != state["acpSessionId"]):
                raise AcpError("CAD adapter did not preserve conversation identity")
            state.update(acpSessionId=acp_id, runtime="ready", adapter=hello.get("agentInfo"), capabilities=compact(caps),
                         model=result.get("models", {}).get("currentModelId", settings.model))
            self.owner.store.put_session(self.sid, state)
        except BaseException:
            self.recovering = False
            await self.close()
            raise

    async def run(self, operation):
        self.operation_id, self.reply = operation["id"], ""
        await self.ensure()
        operation = self.owner.store.operation(self.sid, operation["id"])
        operation["agentGeneration"] = self.generation
        self.owner.store.put_operation(operation)
        task = operation["task"]
        folder = self.workspace / "tasks" / operation["id"]
        atomic(folder / "task.json", canonical(task))
        template = {"schema_version": 1, "source": "model.py", "parameters": {}, "inputs": {},
                    "outputs": task["outputs"], "metrics": task["metrics"]}
        atomic(folder / "request-template.json", canonical(template))
        if task.get("parent_revision_id"):
            revision = self.owner.store.revision(self.sid, task["parent_revision_id"])
            source = Path(revision["snapshotPath"]).parent / "frozen/model.py"
            if source.is_file():
                atomic(folder / "parent-model.py", source.read_bytes())
        text = (f"Modeling task {operation['id']}. Read {folder / 'task.json'} and the adjacent request-template.json. "
                f"Work in {folder}. Maximum {self.owner.settings.max_evaluations} evaluations and {self.owner.settings.seconds} seconds. "
                "Write and evaluate your model, inspect actual PNGs and metrics, then explicitly publish selected evidence. "
                "Use the requested part and feature names exactly. Return clarification if necessary. Brief: " + task["brief"])
        state = self.owner.store.session(self.sid)
        response = await self.connection.request("session/prompt", {"sessionId": state["acpSessionId"], "prompt": [{"type": "text", "text": text}]}, self.owner.settings.seconds)
        return response

    async def event(self, message):
        if self.recovering or not self.operation_id or message.get("method") != "session/update":
            return
        operation = self.owner.store.operation(self.sid, self.operation_id)
        update = message.get("params", {}).get("update", {})
        if update.get("sessionUpdate") not in {"agent_message_chunk", "tool_call", "tool_call_update"}:
            return
        if update.get("sessionUpdate") == "agent_message_chunk":
            self.reply = (self.reply + update.get("content", {}).get("text", ""))[:4000]
        path = self.owner.store.root / "operations" / self.operation_id / "cad-visible.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists() or path.stat().st_size < 2 * 1024 * 1024:
            with path.open("ab") as stream:
                stream.write(canonical({"receivedAt": now(), "generation": self.generation, "update": compact(update)}) + b"\n")
        kind = update.get("sessionUpdate")
        if kind == "tool_call":
            await self.owner.phase(self.sid, self.operation_id, "cad_agent_working")

    async def permission(self, message):
        if message.get("method") != "session/request_permission" or not self.operation_id:
            return {"outcome": {"outcome": "cancelled"}}
        operation = self.owner.store.operation(self.sid, self.operation_id)
        if operation["public"]["status"] != "running":
            return {"outcome": {"outcome": "cancelled"}}
        params = message.get("params", {})
        if params.get("sessionId") != self.owner.store.session(self.sid)["acpSessionId"]:
            return {"outcome": {"outcome": "cancelled"}}
        pid = identifier()
        permission = {"id": pid, "kind": "permission", "role": "cad", "operationId": self.operation_id,
                      "status": "pending", "createdAt": now(), "turnId": operation["turnId"], "generation": self.generation,
                      "toolCall": compact(params.get("toolCall", {})), "options": params.get("options", [])}
        future = asyncio.get_running_loop().create_future()
        self.permissions[pid] = (future, permission)
        store = self.owner.app.store
        store.put_interaction(self.sid, permission)
        state = store.session(self.sid)
        store.update_session(self.sid, permissions=[*state["permissions"], permission])
        option = None
        try:
            option = await future
            return {"outcome": {"outcome": "selected", "optionId": option}} if option else {"outcome": {"outcome": "cancelled"}}
        finally:
            self.permissions.pop(pid, None)
            store.put_interaction(self.sid, {**permission, "status": "resolved" if option else "cancelled", "optionId": option, "resolvedAt": now()})
            store.update_session(self.sid, permissions=[p for p in store.session(self.sid)["permissions"] if p["id"] != pid])

    async def cancel(self):
        for future, _ in self.permissions.values():
            if not future.done():
                future.set_result(None)
        if self.connection and not self.connection.closed:
            try:
                await self.connection.notify("session/cancel", {"sessionId": self.owner.store.session(self.sid)["acpSessionId"]})
            except AcpError:
                pass

    async def disconnected(self):
        self.token = ""
        if self.operation_id:
            await self.owner.fail(self.sid, self.operation_id, "cad_runtime_lost", "CAD agent disconnected; work was not automatically replayed.", status="interrupted")

    async def close(self):
        self.token = ""
        await self.cancel()
        if self.connection:
            await self.connection.close()
            self.connection = None
        state = self.owner.store.session(self.sid)
        state["runtime"] = "stopped"
        self.owner.store.put_session(self.sid, state)
