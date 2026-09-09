"""The versioned MCP schema used by both the facade and authenticated backend."""
from pathlib import Path
import json

# jsonschema is pinned by this module's required MCP dependency.
from jsonschema import Draft202012Validator, ValidationError

from .cad_files import atomic, canonical

EXAMPLES = Path(__file__).resolve().parents[2] / "examples/cad"
SCHEMAS = json.loads((EXAMPLES / "tool-schemas-v1.json").read_text())["tools"]

SELECTOR_GUIDE = """
Read cad-tools-v1.schema.json in this workspace before the first CAD request. The same contract
is available as the crafty-cad://contract/v1 MCP resource. Do not guess selector spellings.
A single PNG is {"id":"iso","kind":"png","parts":["cap"],"view":{"preset":"isometric","width":1024,"height":768},"annotations":{"inline":true,"json":true}}.
A grid ALSO has kind "png": {"id":"grid","kind":"png","parts":["cap"],"grid":{"columns":2,"views":[{"id":"iso","preset":"isometric","width":640,"height":480},{"id":"bottom","preset":"bottom","width":640,"height":480}]},"annotations":{"inline":true,"json":true}}.
An exact numeric criterion is {"equals":36,"absolute_tolerance":0.001}. Use the actual task's part
names, measurements and requested views; these syntax examples do not alter its requirements.
"""


def install_context(workspace):
    atomic(Path(workspace) / "cad-tools-v1.schema.json", canonical({"schema_version": 1, "tools": SCHEMAS}))
    atomic(Path(workspace) / "cad-selector-guide.md", SELECTOR_GUIDE.encode())

DESCRIPTIONS = {
    "request_part": "Delegate a new or revised part to a separate CAD reasoning session. Read local cad-tools-v1.schema.json or the crafty-cad://contract/v1 MCP resource for exact selectors. Both individual images and grids use kind=png. view is an object with preset,width,height; grid is an object with columns,views; tolerance field is absolute_tolerance. Supply independent criteria, named parts/features, optional scoped images and parent revision. Returns a durable operation promptly. Use wait/status; do not write modeling code in this conversational session.",
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
        path = "/".join(map(str, error.absolute_path)) or "arguments"
        raise ValueError("Invalid CAD tool input at " + path + ": " + error.message[:500] + SELECTOR_GUIDE) from None
    return arguments
