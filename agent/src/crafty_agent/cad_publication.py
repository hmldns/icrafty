"""Explicit, verified publication; source and agent prose cannot author checks."""
import copy
from pathlib import Path

from .cad_files import atomic, canonical, contained, decode, digest, read
from .store import identifier


def reason(value):
    if isinstance(value, dict):
        return {"code": str(value.get("code", "output_unavailable"))[:100], "message": str(value.get("message", "Output unavailable"))[:1000]}
    return {"code": str(value or "output_unavailable")[:100], "message": str(value or "The evaluator did not produce this output")[:1000]}


def publish(owner, sid, oid, arguments):
    operation = owner.store.operation(sid, oid)
    fingerprint = digest(canonical(arguments))
    if operation.get("publicationArgsDigest"):
        if operation["publicationArgsDigest"] != fingerprint:
            raise ValueError("A publication is immutable; request another evidence operation")
        return operation["public"]
    if operation["public"]["status"] != "running":
        raise ValueError("Cancelled or interrupted work cannot publish")
    evaluation = owner.store.evaluation(sid, arguments["evaluation_id"])
    if evaluation["operationId"] != oid or evaluation["kind"] == "ensure" or not evaluation.get("resultPath"):
        raise ValueError("Publish a completed evaluation from this operation")
    root = Path(evaluation["resultPath"]).parent
    result = decode(read(Path(evaluation["resultPath"]), 16 * 1024 * 1024))
    if digest(canonical(result)) != evaluation["resultDigest"]:
        raise ValueError("Evaluator result changed before publication")
    artifacts = {item["id"]: item for item in result["artifacts"]}
    requested = {item["id"]: item for item in operation["task"]["outputs"]}
    selected = arguments["artifact_ids"]
    inspected = arguments["inspected_image_ids"]
    if any(aid not in artifacts or aid not in requested for aid in selected):
        raise ValueError("Publish only requested evaluator artifact IDs")
    ready_images = [aid for aid in selected if artifacts[aid]["kind"] == "png" and artifacts[aid]["status"] == "ready"]
    if operation["public"]["operationKind"] == "model" and (set(ready_images) - set(inspected)):
        raise ValueError("Inspect every selected ready PNG before publication")
    if any(aid not in artifacts or artifacts[aid]["kind"] != "png" or artifacts[aid]["status"] != "ready" for aid in inspected):
        raise ValueError("Inspection must identify actual ready PNG artifacts")
    # Validate the complete selected set before any ingestion side effects.
    data = {}
    for aid in selected:
        artifact = artifacts[aid]
        for label, item in ((aid, artifact), (aid + ":annotations", artifact.get("annotations", {})),
                            (aid + ":comparison", artifact.get("comparison", {}))):
            if item.get("path") and (item.get("status") == "ready" or label.endswith(":comparison")):
                payload = read(contained(root, item["path"]), owner.settings.result_bytes)
                if len(payload) != item["size_bytes"] or digest(payload) != item["sha256"]:
                    raise ValueError("Completed artifact changed before publication")
                data[label] = payload
    public = operation["public"]
    public.update(outputs=[], images=[], downloads=[], model=None, metrics=result["metrics"],
                  evaluationId=evaluation["id"], publicationId=identifier(), interpretation=arguments["interpretation"], error=None)
    revision = owner.store.revision(sid, evaluation["revisionId"]) if evaluation.get("revisionId") else None
    if revision:
        owner.store.attach_revision(operation, revision)
    for aid, wanted in requested.items():
        artifact = artifacts.get(aid, {"id": aid, "kind": wanted["kind"], "status": "unavailable"})
        output = {"id": aid, "kind": wanted["kind"], "status": artifact["status"]}
        if aid not in selected:
            output.update(status="unavailable", reason={"code": "not_published", "message": "This output was not selected for publication"})
        elif artifact["status"] == "ready":
            output.update(sha256=artifact["sha256"], sizeBytes=artifact["size_bytes"], mediaType=artifact["media_type"])
            if artifact["kind"] == "png":
                asset = owner.app.store.add_image(sid, data[aid], public["title"] + " — " + aid, "cad")
                if asset["digest"] != artifact["sha256"]:
                    raise ValueError("CAD PNG ingestion changed its bytes")
                output["image"] = {"assetId": asset["id"], "versionId": asset["versionId"]}
                public["images"].append(output["image"])
                output["views"] = artifact.get("views", [])
                annotation = artifact.get("annotations")
                if annotation:
                    annotation_status = annotation.get("status", "not_requested")
                    output["annotations"] = {"status": annotation_status, "inline": annotation["inline"]}
                    if annotation_status == "ready":
                        output["annotations"]["file"] = owner.store.add_file(sid, data[aid + ":annotations"], aid + ".annotations.json", "application/json", "json")
                    elif annotation.get("reason"):
                        output["annotations"]["reason"] = reason(annotation["reason"])
            elif artifact["kind"] == "step":
                file = owner.store.add_file(sid, data[aid], aid + ".step", "model/step", "step")
                file.update(revisionId=revision["id"], geometryDigest=revision["geometryDigest"], units="mm", frame="right-handed-z-up")
                output["file"] = file
                public["downloads"].append(file)
                if public["model"] is None:
                    public["model"] = file
        else:
            output["reason"] = reason(artifact.get("reason"))
        public["outputs"].append(output)
    by_id = {item["id"]: item for item in public["outputs"]}
    public["images"] = [by_id[aid]["image"] for aid in selected if "image" in by_id[aid]]
    public["downloads"] = [by_id[aid]["file"] for aid in selected if by_id[aid]["kind"] == "step" and "file" in by_id[aid]]
    public["model"] = next(iter(public["downloads"]), None)
    public.update(status="completed" if evaluation.get("exitCode") == 0 else "failed", phase="published")
    if public["status"] == "failed":
        public["error"] = reason(evaluation.get("error"))
    owner.elapsed(operation)
    operation["publicationArgsDigest"] = fingerprint
    operation["inspectedImageIds"] = inspected
    mode = arguments.get("message_mode", "together")
    public["presentation"] = {"messageMode": mode, "index": 0, "count": len(public["images"]) if mode == "per_image" and public["images"] else 1}
    atomic(owner.store.root / "publications" / (public["publicationId"] + ".json"), canonical(public))
    owner.store.put_operation(operation)
    if mode == "per_image" and len(public["images"]) > 1:
        with owner.store.db:
            for index, image in enumerate(public["images"]):
                record = owner.store.record(operation)
                if index:
                    record["toolCallId"] += ":" + str(index)
                record["rawOutput"]["images"] = [image]
                record["rawOutput"]["presentation"]["index"] = index
                owner.store.db.execute("INSERT INTO records(session,id,body) VALUES (?,?,?) ON CONFLICT(session,id) DO UPDATE SET body=excluded.body",
                    (sid, record["toolCallId"], canonical(record).decode()))
                owner.app.store._event(sid, "record", record)
    owner.changed(oid)
    return copy.deepcopy(public)
