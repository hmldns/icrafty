# CAD file handoff and MCP adapter

Review draft for the wrapper around [M-CAD.md](../M-CAD.md). The
[handoff diagram](rendered/cad-handoff.svg) shows the file boundaries. These
statements refine [TRD-13–19 and TRD-28–32](../TRD.md); they do not add agent,
network, or storage dependencies to the evaluator. Identifiers use this
document's own CAD-PROTOCOL-1 counter. Exact tool/envelope fields below are proposed.

**CAD-PROTOCOL-1 — Boundary.** The local CLI and MCP wrapper submit the same
versioned source/request/input bundle and consume the same result manifest and
files. MCP adds scoped transfer, durable operations, status, cancellation, and
selected-result publication. It may add an outer response envelope but must not
reinterpret failed checks as success or make STEP mandatory.

**CAD-PROTOCOL-2 — Fetch into a session.** `asset_fetch(asset_id)` authorizes the
caller and copies immutable bytes into that session's workspace, verifying the
digest before exposing a local path. An agent opens downloaded images or model
files using local tools. Originals, annotated derivatives, and previously generated
artifacts retain their lineage in application storage. Neither an asset URL nor
a filesystem path in another container makes bytes locally available.

**CAD-PROTOCOL-3 — Submit from a local path.** Proposed
`cad_evaluate(request_path, idempotency_key)` runs in the CAD agent's local MCP
process. It reads the request and any declared source/input files from configured
workspace/output roots and snapshots them into a bundle. Existing-geometry
requests follow CAD-PROTOCOL-15 instead of requiring another source submission.
The caller finishes
writing files before submission. Detect changes during copying and reject or
retry the capture; record the exact accepted digests. Resolve paths securely
within allowed roots, including symlinks, and exclude credential/configuration
homes. Upload bytes plus a relative-path manifest; do not send a remote service
an agent-local path to open. General sketch publication likewise reads its actual
local output path rather than assuming a generator directory.

**CAD-PROTOCOL-4 — Accept a durable operation.** Once the submitted bytes are
finalized in scoped storage, atomically record `operation_id`, request digest,
input bundle reference, task/work-request context, and requested execution profile.
Derive owner/project/session/role/generation from trusted caller context. Scope
idempotency keys to the authenticated owner/session and operation kind. A repeated
key with the same digest returns the same operation; the same key with
different bytes is a conflict. Changed code at the same local filename is a new
input revision. Return accepted/status promptly; tool timeout alone does not mean
that acceptance failed.

**CAD-PROTOCOL-5 — Worker materialization.** A trusted dispatcher copies the frozen
bundle into a private attempt directory, verifies its manifest, and invokes the
M-CAD contract through the CLI or retained runtime with worker-local paths and a
new query output directory. Route live handles to their owning runtime under
CAD-PROTOCOL-15. Preserve relative
paths so the request bytes and digest remain unchanged. The dispatcher owns
runtime selection, resource limits, and mount mapping. Submitted code cannot
choose host mounts or container privileges. Core `run_id` and outer
`operation_id`/`attempt_id` are distinct; their durable association lives outside
the modeling input and result schema.

**CAD-PROTOCOL-6 — Capture completed output.** After a query finalizes and reports
completion, or a one-shot attempt exits, read the finalized result manifest,
verify every referenced file/path/digest, and copy
completed output to scoped durable storage. Preserve the result bytes and internal
relative paths, including provenance and native geometry needed by a future derive
operation. Keep per-artifact availability and per-metric outcomes. A missing final
manifest is an interrupted/failed attempt, not an empty successful result. Storing
evaluation evidence does not automatically create chat cards. A retained native
runtime stays alive for further geometry queries; capturing one completed query
does not require that runtime to exit.

**CAD-PROTOCOL-7 — Return usable files.** Proposed `cad_status(operation_id)`
returns durable operation/attempt state; bounded `cad_wait` can wait for a change.
On completion, the local MCP layer materializes the result and files in an
operation/run-specific directory beneath the requesting session's workspace.
Return an outer envelope containing the operation/run identifiers, the local
result path, and available artifact paths; preserve the core manifest beneath it,
including per-view labels, cameras, and grid-panel coordinates. Layout and message
delivery choices follow CAD-PROTOCOL-13.
Publish each local file only after an atomic completed copy. Repeated retrieval
verifies/reuses the same bytes. Structured MCP data gets a text fallback under
TRD-19; local paths go to the agent, not browser download links.

**CAD-PROTOCOL-8 — Explicit publication.** `result_publish` selects completed local
artifacts/reports from a run for durable user-visible publication. Verify that
submitted bytes match the run's recorded digests before attaching its provenance;
edited images are new derived assets. Commit the selected immutable manifest and
chat event once with an idempotency key under TRD-18. PNG plus numerical evidence
is a valid publication without STEP. A later publication adds a retained revision.
An agent-generated sketch outside an evaluator run can use `asset_publish` with
its own lineage rather than claiming a CAD evaluation reference.

**CAD-PROTOCOL-9 — Handoff between agents.** The CAD agent returns stable stored
result/asset references, evidence, interpretation, or clarification to its parent
task. The conversational session fetches any needed bytes into its own workspace.
Neither agent mounts the other's writable directory, and a receiving agent never
receives a sender-local path as a usable file. The app coordinates separate
sessions and durable result delivery under TRD-13 and TRD-20.

**CAD-PROTOCOL-10 — Retry and recovery.** Persist accepted inputs and captured
outputs independently of transient worker and MCP processes. Query an uncertain
submission by its idempotency key/operation ID before resubmitting. A retry of
unchanged work gets a fresh attempt directory; never rerun in the prior output
directory. Reconcile attempt ownership before adopting completed output and
materialize missing session files again from stored bytes after recovery. Preserve
published results and session mounts under TRD-8–11 and TRD-30–31.

**CAD-PROTOCOL-11 — Cancellation and stale attempts.** Apply TRD-29's work-request
Stop policy to queued/active attempts and agent turns. The orchestrator cancels
owned queries, stops their execution when needed, and fences result capture/publication by attempt and
runtime generation. Order cancellation and publication through authoritative
backend state. A late successful CLI exit cannot revive cancelled work. Retain
already published results; inspection of retained diagnostics is separate from
publishing an active modeling result. If cancellation requires replacing a retained
native runtime, invalidate its handles and mark other affected queries interrupted
under M-CAD-36; retain their snapshots for explicit recovery.

**CAD-PROTOCOL-12 — Prove the adapter preserves the core.** Run the same input
bundle directly and through the wrapper, compare input/geometry references,
requested evidence, metrics, and statuses, and open the materialized files in the
receiving session. Test duplicate submission, a path meaningful only in the sender,
changed bytes at the same filename, interrupted upload/download, stale completion,
and recovery of a stored result. Wrapper tests may use a fake evaluator; native
geometry acceptance remains the M-CAD fixture suite. MCP/ACP work follows the
standalone core rather than becoming its prerequisite.

**CAD-PROTOCOL-13 — Image layout and message delivery.** **Confirmed options;
proposed envelope.** Support a grid image, individual view images, or both through
the M-CAD-31 output selectors, and support delivering selected images together or
as separate chat messages. These are independent choices. Proposed
`result_publish(..., presentation: {"message_mode": "together" | "per_image"})`
publishes the selected artifact set as one message with several assets or one
message per selected image, preserving the submitted order and evaluation/result
reference on every message. Grid panels remain addressable through their view
metadata; requesting per-panel image messages requires individual PNG outputs.
The wrapper must not invent missing files, rerun geometry to change message
grouping, or discard camera labels and panel provenance. One completed MCP tool
invocation returns one result envelope containing all selected artifact references
or supported image content blocks; chat message count does not change that tool
contract or create additional evaluation jobs. Commit a publication's message
identities/order with its immutable manifest and deduplicate delivery on replay.
The proposed default is a grid overview delivered together, with explicit callers
free to choose every combination. Add wrapper acceptance cases for all layouts
and both delivery modes, including replay without duplicate messages.

**CAD-PROTOCOL-14 — Structured and inline image annotations.** **Confirmed
options; proposed transfer.** Preserve JSON-only, inline-only, and combined
annotation outputs from M-CAD-34 for separate images and grids, with either message
delivery mode. Fetch/materialize the image's annotation sidecar as a declared
file with its own verified digest; retain its relation to the image, geometry,
view IDs, and panel coordinates. Include available sidecar references alongside
the image in tool results and publication manifests. A client can draw JSON
annotations over a base image or display an image with embedded text. Indicate
whether text is already embedded so a client does not draw it twice. Do not strip
the JSON merely because text is visible in the raster, or describe a raster-only
image as editable annotation data. Verify byte preservation, association, and
replay across layout, annotation, and message-delivery combinations.

**CAD-PROTOCOL-15 — Reusable geometry operations.** **Confirmed capability;
proposed tools.** Add `cad_ensure(request_path, idempotency_key)` to establish
geometry and return its live handle plus durable snapshot reference; let
`cad_evaluate` accept M-CAD-20 geometry requests; add `cad_release(handle)` for
explicit cache release. Source-based `cad_evaluate` remains supported. The backend
maps the live handle to its owning runtime generation, scope, and immutable native
snapshot, and routes queries to that runtime while it is live. Validate caller
scope before using a handle; knowing its value does not grant access to another
session's geometry. Preserve core request bytes and record the resolved geometry
digest with every query operation. Durable source/snapshot and evidence records
outlive the ephemeral handle. After expiry or worker replacement, return explicit
unavailability; an ensure from the stored native bundle produces a new handle
without running source. Never turn a stale-handle query into an undisclosed model
rebuild. Track independent query operations so cancelling one does not destroy
geometry pinned by another. Test warm-handle routing, snapshot restore, expiry,
release while in use, and cross-scope rejection alongside the core reuse suite.
