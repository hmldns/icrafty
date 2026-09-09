# Local chat-to-CAD integration

Generation 2 baseline: `b4ca076d630497c3c901e71d4b5ab4be241d3f3e`.
This is the **accepted v1 interface**, supplied before implementation and accepted
by the parallel chat renderer owner. The backend implementation is in `cad_*`.
Deterministic tests are separate from [live acceptance](CAD-LIVE-ACCEPTANCE.md).
The accepted deterministic [CAD contract](../cad/README.md) remains unchanged.

## Frontend protocol

Use existing snapshot `records` and WebSocket `kind: "record"` events. The backend
owns one stable `tool_call` record `toolCallId: "cad:<operationId>"`, `name:
"cad.result"`, `server: "crafty_cad"`, `tool: "operation"`, and the originating
`turnId`. Upsert it in place during progress. Its `rawOutput` is the versioned
`view: "cad"` object in [application-result-v1.json](examples/cad/application-result-v1.json)
and [JSON schema](examples/cad/application-result-v1.schema.json). The example is
illustrative, not a native run. `rawInput` carries only the operation reference.
The actual conversational ACP tool calls remain separate inspectable records;
only the backend-owned `cad.result` record drives this domain view.

`operationId`, monotonic `operationVersion`, `operationKind` (model/evidence/restore),
`status` and `phase` describe durable work. Status is queued/running/completed/
failed/cancelled/interrupted. Record status maps these to pending/in_progress/
completed/failed for the existing shell. A failed geometric criterion does not
change a completed operation to failed. Progress has no fabricated percentage.

`revision` is null until geometry is established, then contains stable `id`,
`number`, `parentRevisionId`, frozen `sourceDigest` and `buildKey`. New modeling
inputs create a separate retained revision; evidence requests keep its identity.
`geometry` contains stable application `id`, native `digest`, durable `snapshotId`,
availability (live/snapshot/unavailable), units mm and right-handed Z-up frame.
Ephemeral native handles and filesystem paths never enter browser records.
`evaluationId` and `publicationId` remain separate from operation/revision identity.

`requestedOutputs` preserves M-CAD selection/order. `outputs` has one entry for
each request: `id`, `kind`, and pending/ready/unavailable/error `status`. Ready
PNG entries identify `image: {assetId, versionId}` from the existing immutable
image catalog. They preserve native `views`, panel/camera metadata, digest, byte
size, and annotation status/reference. `annotations.inline` says labels are
already burned in; a JSON sidecar does not imply editable user marks. Failed
outputs retain a structured reason and no usable URL. Empty STEP selection means
there is no STEP output entry, model or download action.

`images` repeats the selected immutable references in display order. `model` is
null unless a selected ready STEP exists; otherwise it has `id`, `url`,
`downloadUrl`, `format: "step"`, `filename`, `mediaType: "model/step"`,
`sizeBytes`, `sha256`, `revisionId`, `geometryDigest`, `units: "mm"`, and
`frame: "right-handed-z-up"`. It uses the exact validated STEP bytes for both
the existing interactive importer and download. `downloads` lists the same
selected downloadable files. GLB remains explicitly unsupported.

`metrics` preserves the core's exact computed records: kind/target/other_target,
axis where relevant, unit/frame/method, actual value, immutable external criterion,
signed difference, measured/pass/fail/unavailable/error status, and evidence IDs.
`interpretation` is separately attributed CAD-agent text. `error` is null or a
bounded code/message object. `budget` and `reuse` expose evaluation/time limits
and actual build/source/load/query/restore counts. Earlier operations/publications
are retained. `presentation` records together/per_image delivery, index and count;
per_image delivery creates ordered `cad:<operationId>:<index>` records referencing
the same publication without reevaluation.

## Public routes and MCP surfaces

Existing PNG routes and asset events are reused unchanged:
`GET /api/agent/sessions/{sid}/images/{assetId}[?download=true]`.
Scoped CAD files use
`GET /api/agent/sessions/{sid}/cad/artifacts/{artifactId}[?download=true]`.
Only completed recorded bytes are served, with content type, length, digest ETag,
nosniff, immutable private caching and a safe download filename. IDs cannot grant
cross-session access. Browser URLs contain application IDs only.

`GET /api/agent/sessions/{sid}/cad/operations/{operationId}` returns the current
v1 object; `POST .../cancel` cancels that operation. Session Stop also cancels all
unfinished CAD work for its work request. Existing snapshot/events remain the
normal browser transport; no polling or new route component is required.

Exact input schemas are in [tool-schemas-v1.json](examples/cad/tool-schemas-v1.json).
Both product workspaces receive these exact schemas as `cad-tools-v1.schema.json`
and concise syntax guidance as `cad-selector-guide.md`. Both MCP servers expose
the same read-only `crafty-cad://contract/v1` resource. Strict input errors include
the invalid location and usable view/grid/criterion syntax. This adds contract
discovery without changing tool inputs or relaxing validation.
The conversational session gets a separate `crafty_cad` MCP server exposing
`request_part`, `request_evidence`, `restore_geometry`, `status`, bounded `wait`
(at most 20 seconds), `cancel`, and `attach_input_file`. Request acceptance is durable/idempotent and
returns promptly. `request_part` takes an explicit brief, title, scoped image IDs,
optional parent revision/input file IDs, requested outputs and fixed metric criteria. See
[request-part-v1.json](examples/cad/request-part-v1.json). Request keys are scoped
to the chat and operation kind; changed bytes under a reused key conflict.

A separate product CAD ACP session gets `crafty_cad_model`: `cad_ensure`,
`cad_evaluate`, `cad_status`, bounded `cad_wait`, `cad_release`, `fetch_image`, `fetch_input_file`,
and explicit `result_publish`. These tools transfer completed files from its own
workspace and return materialized evaluator evidence there. The CAD agent writes
the model, inspects real PNGs/metrics and revises within 8 evaluations/1200 seconds.
The backend freezes the conversational task's criteria; modeling code or a CAD
agent request cannot relax them. No developer-authored model substitutes for
the live CAD agent. Publication selects recorded artifacts once, with idempotent
replay and cancellation fencing. Parent results contain references, never child
workspace paths. Evidence-only requests query the same retained native geometry;
unavailable handles require explicit `restore_geometry` from the recorded bundle.

## Small shared-module hooks

Implementation lives in `cad_*` modules. Shared changes are confined
to `service.py` and `http.py`: construct/close a `CadService`; append its
conversational instructions and separate MCP server during runtime setup; propagate
cancel/stop/interruption; register the CAD router and dispatch CAD-owned permission
answers through the existing permission endpoint. CAD agent permission requests
use the existing offered-option UI, without automatic approval. CAD SQL tables
use the existing store connection and event/immutable-image methods in a dedicated
`cad_store.py`; no general Store schema or snapshot rewrite is needed.
No changes to `mcp_server.py`, image tools, dimension forms, frontend files,
dependency manifests, `normalize.py` or `config.py` are currently needed.
The hooks append to existing instructions and MCP registrations, preserving the
forms additions in `85e7495af19e9a7c2224bd9650ec7dea8ba1098a`. CAD routes append
beside the forms/sample routes; CAD permission dispatch precedes ordinary dispatch.

The dedicated backend uses 127.0.0.1:8807 with private state under this
worktree's `.builders/cad-chat-state`. Ports 8807, 5327, 5337 and 4227 were checked
free. The UI owner can proxy a coordinated preview to 8807; 5317, main 5187 and
backend 8787 remain untouched. This generation proves local process/workspace
separation; product per-session Docker orchestration remains a later stage.

## Run the dedicated backend

From the assigned checkout, prepare the module locks and explicit native bridge:

```bash
env -u VIRTUAL_ENV uv sync --directory agent --locked
npm ci --prefix agent
env -u VIRTUAL_ENV uv sync --directory cad --locked
make -C cad native-setup
```

The existing [native setup](../cad/README.md) is required. The application launches
`cad/.venv/bin/python -I agent/src/crafty_agent/cad_native.py` with an absolute
script path and a private runtime directory. Override only the interpreter with
`CRAFTY_CAD_PYTHON` if needed. Do not resolve away a virtualenv interpreter symlink.

After checking that port 8807 is free, start this dedicated runtime:

```bash
CRAFTY_AGENT_DATA="$PWD/.builders/cad-chat-state" \
CRAFTY_AGENT_ORIGINS=http://localhost:5327,http://127.0.0.1:5327,http://localhost:5217,http://127.0.0.1:5217,http://localhost:5337,http://127.0.0.1:5337 \
env -u VIRTUAL_ENV uv run --directory agent --locked python -m crafty_agent --port 8807
```

Check `http://127.0.0.1:8807/api/agent/health`. Point the UI owner's reusable
renderer preview at this backend. Create a **new** saved chat there and use the
[sample prompts](examples/cad/prompts-v1.md). No existing user chat is an acceptance
fixture. The adapter is pinned to `@agentclientprotocol/codex-acp` 1.10.0; model
and reasoning effort inherit the existing operator preferences. Credentials are
copied into each product session's private Codex home and never enter CAD native
processes. Real agent permission requests use the existing offered-option UI.

Application state is durable SQLite plus private CAD `operations/`, `snapshots/`,
`native/`, `sessions/`, `files/` and immutable `publications/` directories below
the configured data root. Every evaluation has a separate input/output directory;
its original result, native logs, snapshots and completed files remain there.
The CAD ACP public tool/message trace is bounded to 2 MiB per operation. Native
bridge stderr is bounded to 128 KiB per runtime, separately from core native logs.

Default modeling budget is 8 ensure/evaluate submissions and 1200 seconds. Operator
overrides are `CRAFTY_CAD_EVALUATIONS` (1–32) and `CRAFTY_CAD_SECONDS` (1–3600).
The native bridge serializes queries, keeps the core's measured process/resource
limits, and bounds each IPC response to 45 seconds. Inputs are at most 16 MiB;
completed result files at most 128 MiB. Cancel fences publication before signalling
the owned reasoning/native processes, with the existing 8-second cancellation
grace. A forced replacement requires explicit snapshot restore. Geometry counts
are per-operation deltas; failed source attempts still count.

Publication copies the exact verified PNG bytes through existing image storage.
Operation/record updates are transactional and publication replay is idempotent.
Completed copied assets may survive a crash before the final publication event;
they do not imply a completed CAD operation. Backend restart marks uncertain work
interrupted, marks geometry as snapshot-only, and never automatically reruns
source or a reasoning prompt. Explicit restore produces a new native handle and
preserves the application revision and geometry identity.

## Backend acceptance

```bash
env -u VIRTUAL_ENV uv run --directory agent --locked pytest -q \
  tests/test_cad_backend.py tests/test_cad_transport.py tests/test_integration.py \
  tests/test_cad_inputs.py tests/test_cad_input_transport.py \
  --basetemp runs/cad-backend-acceptance --junitxml runs/cad-backend-acceptance.xml
```

Use a fresh `--basetemp` on each retained acceptance run. These tests use actual
FreeCAD and MCP transports, plus explicitly named test modeling actors/fake ACP
processes. They are not live Codex acceptance. They cover the existing cylinder
and cap sources, fixed measured criteria, requested-only STEP/download digests,
warm reuse and zero-source restore, failure/publication fences, scoped credentials,
idempotency, changed source bytes, all layout/annotation/delivery combinations,
distinct ACP identities, permissions and resume. Native prerequisites must be
installed; these tests do not silently skip them.

Product per-session Docker orchestration, printing, bolt/thread families and the
UI implementation remain outside this module. The deterministic evaluator's
[updated Docker option](../cad/NATIVE-IMPORT-FIX.md) remains available; this adapter currently selects local
processes only. Final live acceptance requires the mounted renderer and actual
conversational/CAD Codex sessions; see the separate acceptance record.

The read-only live collector retains one session's public snapshot, CAD operations,
verified downloaded images/sidecars/STEP and optional native operation directories:

```bash
uv run --script agent/tests/cad_collect.py --session ACTUAL_SESSION_ID \
  --base-url http://127.0.0.1:8807 --output .builders/cad-chat-acceptance/FRESH_NAME \
  --state-root .builders/cad-chat-state
```

Run it from the repository root. It never submits work, copies credential homes,
or claims that collected bytes establish the entire live gate. Empty CAD history
is rejected. Operation outcomes and image inspection remain separate evidence.

## Existing-file handoff

The additive [file-handoff-v1 proposal](examples/cad/file-handoff-v1-proposal.json)
was approved and is implemented. Its exact installed tool schemas are in
[tool-schemas-v1.json](examples/cad/tool-schemas-v1.json); returned metadata uses
[input-file-v1.schema.json](examples/cad/input-file-v1.schema.json). There are now
fifteen CAD tools. The accepted `cad.result` v1 renderer contract is unchanged.
Existing STEP and original Python files can be attached from the conversational
workspace or uploaded as bounded raw bytes. Their provenance remains unverified.

`crafty_cad.attach_input_file({idempotency_key, path, kind})` captures a completed
regular file inside the calling conversational workspace. `path` is a relative
POSIX path; absolute paths, traversal, symlinks, special files, mismatched
extensions and unsupported kinds are rejected. The MCP process reads bounded
bytes with the existing stable-file checks and sends bytes/digest to the backend;
the backend never opens an agent-supplied local path. It verifies the digest and
atomically retains immutable bytes under the calling session. A changed file at
the same path needs a new idempotency key and receives a new input ID. Private
provenance retains the originating session, runtime generation, turn, relative
path, capture time, kind, size and SHA256. Browser records expose only the schema's
safe metadata, with `validation: "unverified_input"`.

`request_part` accepts optional `input_file_ids: []` (at most eight unique IDs).
It resolves only that chat's immutable files, freezes their IDs/bytes/digests into
the operation task, and includes that manifest in idempotency comparison.
`crafty_cad_model.fetch_input_file({input_file_id})` accepts only IDs explicitly
included in its active operation. It materializes digest-checked bytes into that
CAD session's private `inputs/cad/<id>/<safe-filename>` and returns local paths
only to the CAD agent. Expired runtime credentials, another session's ID, or an
input omitted from the operation cannot authorize a fetch. Total task input bytes
remain bounded to 16 MiB, in addition to per-file limits.

The CAD agent owns interpretation of these untrusted inputs. For STEP it writes
an explicit import adapter implementing the existing M-CAD `build(parameters,
inputs)` contract and declares the copied STEP as a frozen input. Original Python
is read as source material and may be adapted to that same contract; attachment
alone never executes it. The deterministic evaluator remains unaware of chat,
HTTP and input IDs. Its existing frozen source/input digests form the build key;
the clean native verifier computes geometry evidence. Imported units, validity,
solid count, bounds and measurements must be reported from the evaluated result.
Named features are available only when actual imported subshapes can be identified.
No imported file is presented as a validated output STEP. A downloadable model
still requires an explicit requested export and the existing clean reopen check.

For direct user selection, the backend includes a bounded raw-byte
`POST /api/agent/sessions/{sid}/cad/inputs?filename=...&kind=...`, returning the
same immutable input record. It follows the existing local application's session
authority; this is not a new multi-user authentication claim. The UI owner owns
file selection and durable user-message references. No browser filesystem path,
new general Store hook or image MCP change is involved. Application implementation
stays in `cad_*`. CAD-native imported-file accuracy/meshing fixes are documented
separately in [NATIVE-IMPORT-FIX.md](../cad/NATIVE-IMPORT-FIX.md).

The upload requires `Content-Type: application/octet-stream` and a 1–120 character
`Idempotency-Key`. It returns only safe metadata, never a model/download URL. A
typical agent flow is `attach_input_file({idempotency_key:"cap-input-1",
path:"output/mug_cap.step",kind:"step"})`, then `request_part` with the returned
`inputFileId` in `input_file_ids`, an explicit brief and requested evidence.
The CAD agent calls `fetch_input_file` and writes an explicit adapter. Fetching a
changed local copy fails instead of overwriting it. A different file under a reused
attachment key conflicts. Source plus all declared evaluator inputs still share
the existing 16 MiB aggregate limit; attaching files does not bypass that limit.
