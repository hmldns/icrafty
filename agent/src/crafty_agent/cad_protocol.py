"""The versioned MCP schema used by both the facade and authenticated backend."""
from pathlib import Path
import json

# jsonschema is pinned by this module's required MCP dependency.
from jsonschema import Draft202012Validator, ValidationError

from .cad_files import canonical

EXAMPLES = Path(__file__).resolve().parents[2] / "examples/cad"
SCHEMAS = json.loads((EXAMPLES / "tool-schemas-v1.json").read_text())["tools"]

DESCRIPTIONS = {
    "request_part": "Delegate a new or revised part to a separate CAD reasoning session. Supply explicit M-CAD PNG/STEP requests and independent metric criteria, named parts/features, optional scoped images and parent revision. Returns a durable operation promptly. Use wait/status until completion; do not write modeling code in this conversational session.",
    "request_evidence": "Request images, computed metrics or validated STEP from an existing revision, without running model source. Uses retained geometry; geometry_unavailable requires explicit restore_geometry first. Returns a new durable operation and preserves earlier publications.",
    "restore_geometry": "Explicitly restore a revision's saved native bundle after handle expiry/restart. Returns a new operation, never executes source, and preserves revision/geometry identity. Then request evidence using a new key.",
    "status": "Read the durable CAD operation state and any published evidence in this chat.",
    "wait": "Wait at most 20 seconds for a newer CAD operation version, then return current state. Set after_version to the last returned operationVersion to wait for a change. Repeat while running. No second operation or model run is started.",
    "cancel": "Cancel this chat's CAD operation and its owned reasoning/evaluator work. Previously published artifacts remain available.",
    "cad_ensure": "Freeze a completed M-CAD request and declared files from your workspace, establish immutable geometry once. Returns evaluationId; use cad_wait for the handle/snapshot. Existing geometry handles may be queried without source.",
    "cad_evaluate": "Freeze an M-CAD request and source/inputs. Outputs and metrics must exactly match the immutable task template. Returns evaluationId promptly; use cad_wait for the real result.json and PNG files. Inspect those files with your image-view tool and read the computed metrics before publishing or revising. Use the returned geometry handle for subsequent evidence.",
    "cad_status": "Return a saved evaluation/ensure state. When complete, materialize verified result and artifact bytes in your private workspace for inspection.",
    "cad_wait": "Wait at most 20 seconds for an evaluation/ensure, then materialize completed native evidence. Repeat if still running; do not resubmit uncertain work with a new key.",
    "cad_release": "Explicitly release this CAD session's retained immutable geometry handle. Its durable snapshot remains for later restoration.",
    "fetch_image": "Fetch an immutable image explicitly included in the current modeling task into your workspace; inspect its real pixels with the image-view tool.",
    "result_publish": "Publish selected verified artifact IDs and computed metrics from an evaluation after inspecting its ready PNGs. inspected_image_ids is your inspection attestation, backed by actual image-view tool events. Interpretation is separate from measured evidence. Does not change criteria, export extra formats or fabricate artifacts. Publication is idempotent and fenced by cancellation.",
}


def validate_tool(server, name, arguments):
    schema = SCHEMAS.get(server + "." + name)
    if schema is None:
        raise ValueError("Unsupported CAD tool")
    canonical(arguments)
    try:
        Draft202012Validator(schema).validate(arguments)
    except ValidationError as error:
        raise ValueError("Invalid CAD tool input: " + error.message[:500]) from None
    return arguments
