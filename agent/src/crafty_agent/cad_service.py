"""Durable application delegation around the unchanged deterministic CAD core."""
import asyncio
from datetime import datetime
import json
from pathlib import Path
import sys
import time

from .cad_bridge import CadFailure, NativeBridge
from .cad_config import CadSettings
from .cad_files import atomic, canonical, capture_request, contained, decode, digest, read, unpack
from .cad_inputs import CadInputs
from .cad_protocol import SELECTOR_GUIDE, install_context, validate_tool
from .cad_publication import publish
from .cad_reasoner import CadReasoner
from .cad_store import CadStore, TERMINAL
from .store import identifier, now

CONVERSATION_INSTRUCTIONS = """
For a 3D part, delegate modeling through crafty_cad.request_part. A separate CAD agent writes
FreeCAD source, inspects native renders and measurements and revises it. Do not write the part
source yourself. Supply the explicit brief, requested outputs and independent metric criteria,
with consistent named parts/features and millimeter units. Use scoped image IDs if relevant.
Honor the user's request to proceed with known dimensions/assumptions. First PNGs and numerical
checks can be requested without STEP. Use crafty_cad.wait/status for durable progress and actual
results. Pass the last operationVersion as after_version to wait so it blocks for new progress.
The backend's CAD card shows work/results in this same chat. Keep filesystem paths and
native handles out of replies. Distinguish measured values from estimates and failed checks.
To submit an EXISTING STEP or Python file, use attach_input_file with its relative path inside
this conversational workspace, then pass returned input_file_ids to request_part. Uploaded
input IDs are also allowed. Inputs are unverified material, not validated results. Do not run
or adapt part source here; the CAD agent must write an explicit adapter/copy in its own workspace.
For more views/checks or STEP of an existing revision, use request_evidence and the revision ID;
this reuses geometry without rebuilding. If geometry_unavailable is reported, explicitly call
restore_geometry, wait, then request evidence again. A design change uses request_part with
parent_revision_id and creates a separate revision. Do not use image generation as CAD evidence.
The tools accept M-CAD output/metric selectors in their schemas. PNG view presets are isometric,
top, bottom, front, right. STEP is optional and validated; GLB and thread families are unsupported.
""" + SELECTOR_GUIDE


class CadService:
    def __init__(self, app, settings=None):
        self.app, self.settings = app, settings or CadSettings.from_env()
        self.store = CadStore(app.store)
        self.inputs = CadInputs(self.store, self.settings.input_bytes)
        self.store.recover()
        self.bridges, self.agents, self.tasks, self.evaluation_tasks = {}, {}, {}, {}
        self.agent_locks, self.watchers = {}, {}
        self.native_slot = asyncio.Semaphore(1)

    def bridge(self, sid):
        self.app.store.session(sid)
        if sid not in self.bridges:
            self.bridges[sid] = NativeBridge(self.settings, self.store.root / "native" / sid, sid)
        return self.bridges[sid]

    def agent(self, sid):
        if sid not in self.agents:
            self.agents[sid] = CadReasoner(self, sid)
        return self.agents[sid]

    def mcp_server(self, sid, token, workspace, role="chat"):
        install_context(workspace)
        return {"name": "crafty_cad" if role == "chat" else "crafty_cad_model", "command": sys.executable,
                "args": ["-m", "crafty_agent.cad_mcp"], "env": [{"name": k, "value": v} for k, v in {
                    "CRAFTY_CAD_URL": self.app.base_url, "CRAFTY_CAD_SESSION": sid, "CRAFTY_CAD_TOKEN": token,
                    "CRAFTY_CAD_WORKSPACE": str(workspace), "CRAFTY_CAD_ROLE": role}.items()]}

    def changed(self, key):
        for event in self.watchers.get(key, ()):
            event.set()

    async def phase(self, sid, oid, phase):
        operation = self.store.operation(sid, oid)
        if operation["public"]["status"] in TERMINAL:
            return
        operation["public"].update(status="running", phase=phase)
        self.elapsed(operation)
        self.store.put_operation(operation)
        self.changed(oid)

    @staticmethod
    def elapsed(operation):
        operation["public"]["budget"]["elapsedSeconds"] = round(time.time() - datetime.fromisoformat(operation["createdAt"]).timestamp(), 6)

    def public(self, sid, oid):
        return self.store.operation(sid, oid)["public"]

    async def wait(self, sid, oid, after=0, timeout=20):
        event = asyncio.Event()
        self.watchers.setdefault(oid, set()).add(event)
        try:
            value = self.public(sid, oid)
            if value["operationVersion"] <= after and value["status"] not in TERMINAL:
                try:
                    await asyncio.wait_for(event.wait(), timeout)
                except asyncio.TimeoutError:
                    pass
            return self.public(sid, oid)
        finally:
            self.watchers[oid].discard(event)
            if not self.watchers[oid]:
                self.watchers.pop(oid)

    async def request(self, sid, name, arguments):
        validate_tool("crafty_cad", name, arguments)
        if name in {"status", "wait", "cancel"}:
            oid = arguments["operation_id"]
            if name == "status":
                return self.public(sid, oid)
            if name == "wait":
                return await self.wait(sid, oid, arguments.get("after_version", 0), arguments.get("timeout_seconds", 20))
            await self.cancel(sid, oid)
            return self.public(sid, oid)
        kind = {"request_part": "model", "request_evidence": "evidence", "restore_geometry": "restore"}[name]
        task = dict(arguments)
        if task.get("input_file_ids"):
            task["input_files"] = self.inputs.freeze(sid, task["input_file_ids"])
        previous = self.store.prior(sid, kind, task["idempotency_key"], digest(canonical(task)))
        if previous:
            return previous["public"]
        origin = self.app.store.session(sid)
        if not origin["activeTurnId"]:
            raise ValueError("Start CAD work from an active conversational turn")
        if any(op["public"]["status"] not in TERMINAL for op in self.store.operations(sid)):
            raise ValueError("This chat already has active CAD work; wait or cancel it first")
        revision = None
        rid = task.get("parent_revision_id") or task.get("revision_id")
        if rid:
            revision = self.store.revision(sid, rid)
        for aid in task.get("image_ids", []):
            self.app.store.asset(sid, aid)
        if kind != "restore":
            # Core semantic validation runs through its own interpreter before agent dispatch.
            await self.bridge(sid).call({"op": "validate", "request": {"schema_version": 1, "source": "model.py",
                "parameters": {}, "inputs": {}, "outputs": task["outputs"], "metrics": task["metrics"]}})
        state = self.app.store.session(sid)
        if (state["activeTurnId"], state["generation"]) != (origin["activeTurnId"], origin["generation"]) or self.app.runtime(sid).cancelled:
            raise ValueError("Originating conversational turn changed or was cancelled")
        previous = self.store.prior(sid, kind, task["idempotency_key"], digest(canonical(task)))
        if previous:
            return previous["public"]
        if any(op["public"]["status"] not in TERMINAL for op in self.store.operations(sid)):
            raise ValueError("This chat already has active CAD work; wait or cancel it first")
        operation = self.store.create_operation(sid, kind, task, self.settings)
        if revision:
            self.store.attach_revision(operation, revision)
            self.store.put_operation(operation)
        coroutine = self.model_operation(sid, operation["id"]) if kind == "model" else self.evidence_operation(sid, operation["id"])
        self.tasks[operation["id"]] = asyncio.create_task(coroutine)
        return operation["public"]

    async def model_operation(self, sid, oid):
        try:
            await self.phase(sid, oid, "starting_cad_agent")
            async with self.agent_locks.setdefault(sid, asyncio.Lock()):
                operation = self.store.operation(sid, oid)
                if operation["public"]["status"] in TERMINAL:
                    return
                response = await asyncio.wait_for(self.agent(sid).run(operation), self.settings.seconds)
            operation = self.store.operation(sid, oid)
            if operation["public"]["status"] not in TERMINAL:
                text = self.agent(sid).reply or "The CAD agent ended without publishing evaluated evidence."
                await self.fail(sid, oid, "cad_agent_no_publication", text)
        except asyncio.CancelledError:
            await self.fail(sid, oid, "cancelled", "CAD operation cancelled", status="cancelled")
        except Exception as error:
            await self.fail(sid, oid, getattr(error, "code", "cad_agent_failed"), str(error))
            await self.stop_work(sid, oid)

    def add_counts(self, operation, before, after):
        public = operation["public"]["reuse"]
        for source, target in (("source_executions", "sourceExecutions"), ("builds", "builds"), ("loads", "loads"), ("restores", "restores"), ("queries", "queries")):
            public[target] += max(0, after.get(source, 0) - before.get(source, 0))

    async def native_call(self, sid, oid, message):
        """Account even failed source attempts, scoped to one runtime generation."""
        bridge = self.bridge(sid)
        await bridge.start()
        if self.public(sid, oid)["status"] != "running":
            raise CadFailure("cancelled", "Operation cancelled before native dispatch")
        before = dict(bridge.diagnostics["counts"])
        try:
            return await bridge.call(message)
        finally:
            operation = self.store.operation(sid, oid)
            self.add_counts(operation, before, bridge.diagnostics["counts"])
            self.elapsed(operation)
            self.store.put_operation(operation)

    async def evidence_operation(self, sid, oid):
        try:
            await self.phase(sid, oid, "restoring_geometry" if self.public(sid, oid)["operationKind"] == "restore" else "querying_geometry")
            operation = self.store.operation(sid, oid)
            revision = self.store.revision(sid, operation["task"]["revision_id"])
            root = self.store.root / "operations" / oid
            bridge = self.bridge(sid)
            if operation["public"]["operationKind"] == "restore":
                destination = root / "input"
                source = Path(revision["snapshotPath"])
                request = {"schema_version": 1, "geometry": {"path": "geometry/manifest.json"}, "parameters": {}, "inputs": {}, "outputs": [], "metrics": []}
                manifest = decode(read(source, self.settings.input_bytes))
                for item in [*manifest["parts"].values(), *manifest.get("frozen_files", [])]:
                    payload = read(contained(source.parent, item["path"]), self.settings.result_bytes)
                    if digest(payload) != item["sha256"]:
                        raise ValueError("Saved snapshot bytes changed")
                    atomic(contained(destination / "geometry", item["path"]), payload)
                atomic(destination / "geometry/manifest.json", read(source, self.settings.input_bytes))
                atomic(destination / "request.json", canonical(request))
                async with self.native_slot:
                    descriptor = await self.native_call(sid, oid, {"op": "ensure", "request": str(destination / "request.json")})
                    operation = self.store.operation(sid, oid)
                    if operation["public"]["status"] in TERMINAL:
                        return
                    self.store.adopt_geometry(operation, descriptor, descriptor["snapshot_path"])
                    operation["public"].update(status="completed", phase="geometry_restored", interpretation="Restored the saved native geometry without running model source.")
                    self.elapsed(operation)
                    self.store.put_operation(operation)
                    self.changed(oid)
            else:
                if revision["availability"] != "live":
                    raise CadFailure("geometry_unavailable", "Saved geometry needs explicit restore_geometry before another evidence query")
                request = {"schema_version": 1, "geometry": {"handle": revision["handle"]}, "parameters": {}, "inputs": {},
                           "outputs": operation["task"]["outputs"], "metrics": operation["task"]["metrics"]}
                atomic(root / "input/request.json", canonical(request))
                evaluation = self.new_evaluation(operation, "evidence", digest(canonical(request)), "evaluate", root / "input/request.json")
                await self.run_evaluation(sid, evaluation["id"])
                operation = self.store.operation(sid, oid)
                evaluation = self.store.evaluation(sid, evaluation["id"])
                if operation["public"]["status"] in TERMINAL:
                    return
                if not evaluation.get("resultPath") or not evaluation.get("revisionId"):
                    reason = evaluation.get("error") or {"code": "evaluation_failed", "message": "Requested evidence could not complete"}
                    raise CadFailure(reason["code"], reason["message"])
                publish(self, sid, oid, {"evaluation_id": evaluation["id"], "artifact_ids": [x["id"] for x in request["outputs"]],
                    "interpretation": "New evidence from the retained geometry.", "inspected_image_ids": [], "message_mode": "together"})
        except asyncio.CancelledError:
            await self.fail(sid, oid, "cancelled", "CAD evidence cancelled", status="cancelled")
        except Exception as error:
            if getattr(error, "code", "") == "geometry_unavailable":
                revision = self.store.revision(sid, self.store.operation(sid, oid)["task"]["revision_id"])
                revision["availability"] = "snapshot"
                self.store.save_revision(revision)
                operation = self.store.operation(sid, oid)
                self.store.attach_revision(operation, revision)
                self.store.put_operation(operation)
            await self.fail(sid, oid, getattr(error, "code", "evaluation_failed"), str(error))

    def new_evaluation(self, operation, key, fingerprint, kind, request_path):
        eid = identifier()
        evaluation = {"id": eid, "operationId": operation["id"], "key": key, "digest": fingerprint,
                      "kind": kind, "status": "queued", "requestPath": str(request_path), "createdAt": now(), "files": []}
        self.store.put_evaluation(evaluation)
        operation["evaluations"].append(eid)
        operation["public"]["budget"]["evaluations"] += 1
        self.store.put_operation(operation)
        return evaluation

    async def submit(self, sid, oid, name, arguments, bundle):
        validate_tool("crafty_cad_model", name, arguments)
        operation = self.store.operation(sid, oid)
        fingerprint = digest(canonical(bundle))
        key = name + ":" + arguments["idempotency_key"]
        previous = self.store.prior_evaluation(oid, key, fingerprint)
        if previous:
            return self.evaluation_status(sid, previous["id"])
        if operation["public"]["status"] != "running":
            raise ValueError("This CAD operation no longer accepts evaluations")
        if operation["public"]["budget"]["evaluations"] >= self.settings.max_evaluations:
            raise ValueError("CAD evaluation budget exhausted")
        folder = self.store.root / "operations" / oid / "inputs" / identifier()
        request_path = unpack(bundle, folder, self.settings.input_bytes)
        recaptured = capture_request(folder, request_path.name, self.settings.input_bytes)
        if recaptured != bundle:
            raise ValueError("Bundle contains undeclared or changed input files")
        request = decode(read(request_path, self.settings.input_bytes))
        await self.bridge(sid).call({"op": "validate", "request": request})
        if name == "cad_evaluate" and (request["outputs"] != operation["task"]["outputs"] or request["metrics"] != operation["task"]["metrics"]):
            raise ValueError("Evaluation outputs/criteria must match the immutable task template")
        operation = self.store.operation(sid, oid)
        if operation["public"]["status"] != "running":
            raise ValueError("CAD operation was cancelled during input capture")
        previous = self.store.prior_evaluation(oid, key, fingerprint)
        if previous:
            return self.evaluation_status(sid, previous["id"])
        if operation["public"]["budget"]["evaluations"] >= self.settings.max_evaluations:
            raise ValueError("CAD evaluation budget exhausted")
        evaluation = self.new_evaluation(operation, key, fingerprint, "ensure" if name == "cad_ensure" else "evaluate", request_path)
        self.evaluation_tasks[evaluation["id"]] = asyncio.create_task(self.run_evaluation(sid, evaluation["id"]))
        return self.evaluation_status(sid, evaluation["id"])

    async def run_evaluation(self, sid, eid):
        evaluation = self.store.evaluation(sid, eid)
        oid = evaluation["operationId"]
        try:
            async with self.native_slot:
                operation = self.store.operation(sid, oid)
                if operation["public"]["status"] != "running":
                    raise CadFailure("cancelled", "Evaluation cancelled before native dispatch")
                evaluation["status"] = "running"
                self.store.put_evaluation(evaluation)
                await self.phase(sid, oid, "building_geometry" if evaluation["kind"] == "ensure" else "evaluating_geometry")
                bridge = self.bridge(sid)
                output = self.store.root / "operations" / oid / "evaluations" / eid
                if evaluation["kind"] == "ensure":
                    descriptor = await self.native_call(sid, oid, {"op": "ensure", "request": evaluation["requestPath"]})
                    evaluation.update(geometry=descriptor, status="completed")
                    snapshot = descriptor["snapshot_path"]
                else:
                    response = await self.native_call(sid, oid, {"op": "evaluate", "request": evaluation["requestPath"], "output": str(output)})
                    result = response["result"]
                    evaluation.update(status="completed" if response["exit_code"] == 0 else "failed", exitCode=response["exit_code"],
                        resultPath=response["result_path"], resultDigest=digest(canonical(result)),
                        artifacts=result["artifacts"], metrics=result["metrics"], geometry=result["geometry"], execution=result["execution"])
                    evaluation["files"] = self.result_files(result, output)
                    descriptor = result["geometry"]
                    snapshot = output / descriptor["snapshot"]["path"] if descriptor else None
                    if response["exit_code"]:
                        evaluation["error"] = {"code": result["execution"].get("reason", "evaluation_failed"), "message": "Native evaluation failed; inspect retained result diagnostics"}
                operation = self.store.operation(sid, oid)
                self.elapsed(operation)
                if descriptor:
                    revision = self.store.adopt_geometry(operation, descriptor, snapshot)
                    evaluation["revisionId"] = revision["id"]
                    if evaluation["kind"] == "ensure":
                        # Materialize a usable native bundle in the CAD workspace too.
                        source = Path(revision["snapshotPath"])
                        manifest = decode(read(source, self.settings.input_bytes))
                        items = [{"path": "manifest.json", "sha256": digest(read(source, self.settings.input_bytes)), "size_bytes": source.stat().st_size},
                                 *manifest["parts"].values(), *manifest.get("frozen_files", [])]
                        for item in items:
                            payload = read(contained(source.parent, item["path"]), self.settings.result_bytes)
                            if digest(payload) != item["sha256"] or len(payload) != item["size_bytes"]:
                                raise ValueError("Saved native snapshot changed")
                            atomic(contained(output / "geometry", item["path"]), payload)
                        descriptor = {**descriptor, "snapshot_path": "geometry/manifest.json"}
                        atomic(output / "ensure.json", canonical(descriptor))
                        evaluation.update(geometry=descriptor, resultPath=str(output / "ensure.json"),
                            files=[{**item, "path": "geometry/" + item["path"]} for item in items])
                evaluation["diagnostics"] = bridge.diagnostics
                if operation["public"]["status"] != "running":
                    evaluation["status"] = "interrupted"
                else:
                    operation["public"].update(phase="inspecting_evidence", evaluationId=eid)
                self.store.put_evaluation(evaluation)
                self.store.put_operation(operation)
        except asyncio.CancelledError:
            evaluation.update(status="interrupted", error={"code": "interrupted", "message": "Native operation was interrupted; inspect retained evidence"})
            self.store.put_evaluation(evaluation)
            raise
        except Exception as error:
            evaluation.update(status="failed", error={"code": getattr(error, "code", "evaluation_failed"), "message": str(error)[:1000]})
            evaluation["diagnostics"] = self.bridge(sid).diagnostics
            self.store.put_evaluation(evaluation)
        finally:
            self.changed(eid)
            self.changed(oid)

    def result_files(self, result, output):
        records = {}
        def visit(value):
            if isinstance(value, dict):
                if all(key in value for key in ("path", "sha256", "size_bytes")):
                    records[value["path"]] = {key: value[key] for key in ("path", "sha256", "size_bytes")}
                for child in value.values():
                    visit(child)
            elif isinstance(value, list):
                for child in value:
                    visit(child)
        visit(result)
        if result["geometry"]:
            manifest_path = result["geometry"]["snapshot"]["path"]
            manifest = decode(read(contained(output, manifest_path), self.settings.input_bytes))
            for item in [*manifest["parts"].values(), *manifest.get("frozen_files", [])]:
                name = str(Path(manifest_path).parent / item["path"])
                records[name] = {"path": name, "sha256": item["sha256"], "size_bytes": item["size_bytes"]}
            # Part entries in the descriptor are relative to the native bundle, not result root.
            for item in result["geometry"]["parts"].values():
                records.pop(item["path"], None)
        payload = read(output / "result.json", self.settings.input_bytes)
        records["result.json"] = {"path": "result.json", "sha256": digest(payload), "size_bytes": len(payload)}
        total = 0
        for item in records.values():
            payload = read(contained(output, item["path"]), self.settings.result_bytes)
            total += len(payload)
            if digest(payload) != item["sha256"] or len(payload) != item["size_bytes"] or total > self.settings.result_bytes:
                raise ValueError("Evaluator result contains invalid artifact references")
        return list(records.values())

    def evaluation_status(self, sid, eid):
        evaluation = self.store.evaluation(sid, eid)
        result = {"schema_version": 1, "evaluationId": eid, "operationId": evaluation["operationId"], "status": evaluation["status"],
                  "geometry": evaluation.get("geometry"), "revisionId": evaluation.get("revisionId"), "error": evaluation.get("error"),
                  "artifacts": evaluation.get("artifacts", []), "metrics": evaluation.get("metrics", [])}
        if evaluation.get("resultPath"):
            result["files"] = [{**item, "url": f"/internal/cad/model/{sid}/evaluations/{eid}/files/{index}"}
                               for index, item in enumerate(evaluation["files"])]
        return result

    async def wait_evaluation(self, sid, eid, timeout=20):
        self.store.evaluation(sid, eid)
        task = self.evaluation_tasks.get(eid)
        if task and not task.done():
            try:
                await asyncio.wait_for(asyncio.shield(task), timeout)
            except asyncio.TimeoutError:
                pass
        return self.evaluation_status(sid, eid)

    async def fail(self, sid, oid, code, message, status="failed"):
        operation = self.store.operation(sid, oid)
        if operation["public"]["status"] in TERMINAL:
            return
        message = str(message).replace(str(self.app.settings.data), "[private workspace]")[:1000]
        operation["public"].update(status=status, phase=status, error={"code": str(code)[:100], "message": message})
        for output in operation["public"]["outputs"]:
            if output["status"] == "pending":
                output.update(status="unavailable", reason={"code": str(code)[:100], "message": message})
        self.elapsed(operation)
        self.store.put_operation(operation)
        self.changed(oid)

    async def cancel(self, sid, oid):
        operation = self.store.operation(sid, oid)
        if operation["public"]["status"] in TERMINAL:
            return
        await self.fail(sid, oid, "cancelled", "CAD operation cancelled", status="cancelled")
        await self.stop_work(sid, oid)

    async def stop_work(self, sid, oid):
        operation = self.store.operation(sid, oid)
        await self.bridge(sid).cancel()
        if sid in self.agents:
            await self.agents[sid].cancel()
        tasks = [self.tasks[oid]] if oid in self.tasks else []
        tasks += [self.evaluation_tasks[eid] for eid in operation["evaluations"] if eid in self.evaluation_tasks]
        pending = [task for task in tasks if not task.done() and task is not asyncio.current_task()]
        if pending:
            _, unfinished = await asyncio.wait(pending, timeout=self.app.settings.cancel_timeout)
            if unfinished:
                await self.bridge(sid).close()
                if sid in self.agents:
                    await self.agents[sid].close()
                for task in unfinished:
                    task.cancel()
                await asyncio.gather(*unfinished, return_exceptions=True)

    async def cancel_session(self, sid, turn_id=None):
        for operation in self.store.operations(sid):
            if turn_id is None or operation["turnId"] == turn_id:
                await self.cancel(sid, operation["id"])

    async def stop_session(self, sid):
        await self.cancel_session(sid)
        if sid in self.agents:
            await self.agents[sid].close()
        if sid in self.bridges:
            await self.bridges[sid].close()
        for row in self.store.db.execute("SELECT body FROM cad_revisions WHERE session=?", (sid,)).fetchall():
            revision = json.loads(row[0])
            revision["availability"] = "snapshot"
            self.store.save_revision(revision)

    def permission_owner(self, sid, pid):
        agent = self.agents.get(sid)
        return agent if agent and pid in agent.permissions else None

    def refresh_permissions(self, sid):
        agent = self.agents.get(sid)
        if not agent:
            return
        pending = [permission for future, permission in agent.permissions.values() if not future.done()]
        if pending:
            state = self.app.store.session(sid)
            ids = {p["id"] for p in state["permissions"]}
            self.app.store.update_session(sid, permissions=state["permissions"] + [p for p in pending if p["id"] not in ids])

    def answer_permission(self, sid, pid, option):
        agent = self.permission_owner(sid, pid)
        if not agent:
            raise ValueError("CAD permission is no longer pending")
        future, permission = agent.permissions[pid]
        operation = self.store.operation(sid, permission["operationId"])
        if future.done() or permission["generation"] != agent.generation or operation["public"]["status"] != "running":
            raise ValueError("CAD permission is no longer pending")
        if option is not None and option not in {o["optionId"] for o in permission["options"]}:
            raise ValueError("Choose one of the offered permission options")
        future.set_result(option)
        return {"accepted": True}

    async def close(self):
        for sid in set(self.bridges) | set(self.agents):
            await self.stop_session(sid)
