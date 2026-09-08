# Crafty — Technical Requirements

This inventory describes how Crafty implements [PRD.md](PRD.md). Technical
requirements use a document-local counter starting at TRD-1, without leading
zeros. Keep identifiers stable. The original [IDEA.md](IDEA.md) remains unchanged.

**Confirmed** records agreed technical direction. **Proposed** records an
implementation default. **Open** identifies a remaining technical choice or
verification gate. The [architecture diagrams](architecture/README.md) illustrate
these statements; they do not imply that the services are implemented.

## Stack and deployment

**TRD-1 — Backend language.** **Confirmed.** Use Python for the backend.
This carries the technical decision formerly recorded as PRD-26.

**TRD-2 — Python tooling.** **Confirmed.** Use `uv` for Python project setup,
dependency management, execution, and integration checks. This carries former
PRD-27.

**TRD-3 — Frontend stack.** **Confirmed.** Use TypeScript, React, Vite, Tailwind,
and Three.js, with a React binding for Three.js if useful. This carries former
PRD-30.

**TRD-4 — Hosting.** **Confirmed.** Deploy on DigitalOcean at `icrafty.ai` with
Docker, Docker Compose, and Caddy. Compose defines the fixed application services;
a runtime orchestrator manages agent session containers. Only Caddy exposes
public application routes. This carries former PRD-33.

## Agent roles and recoverable sessions

**TRD-5 — Separate conversational and CAD agents.** **Confirmed.** The conversational
Codex agent handles user dialog, intent, images, and measurements. It delegates
modeling to a separate CAD Codex agent, which writes FreeCAD Python, inspects
renders and numerical checks, and iterates. FreeCAD is the CAD agent's execution,
rendering, and verification service. It does not contain another reasoning agent.
This carries former PRD-49 and implements PRD-53.

**TRD-6 — Existing Codex ACP adapter.** **Confirmed.** Connect both agent roles
through the available `@agentclientprotocol/codex-acp` adapter. Each session has
its own supervisor, adapter, Codex App Server, and configured MCP tools. Pin
compatible versions in the runtime image. The adapter owns translation between
ACP and Codex's native App Server protocol. The chat-facing behavior remains in
PRD-23 and PRD-24.
[Adapter documentation](https://github.com/agentclientprotocol/codex-acp).

**TRD-7 — One container per agent session.** **Confirmed.** Every conversational
or CAD Codex session runs in its own container. Containers may be replaced;
session identities persist. Separate sessions never share writable workspaces or
Codex homes, including sessions in the same repair project. Give each role its
own scoped tools. This carries former PRD-31.

**TRD-8 — Persistent session mounts.** **Confirmed.** Persist each session's
workspace and Codex state outside the container's writable layer and remount them
when recovering that session. Preserve the same absolute paths across replacement
containers. Proposed mount targets are `/workspace` and `/home/agent/.codex`,
backed by distinct session-specific volumes. Keep credentials outside file-import
roots. Published project assets stay in application storage and are fetched into
each session as needed.
[Docker volume lifecycle](https://docs.docker.com/engine/storage/volumes/).

**TRD-9 — Container lifecycle orchestrator.** **Confirmed.** A trusted orchestrator
creates, starts, monitors, stops, replaces, and retires session containers. Persist
owner, project, chat, role, application session ID, ACP session ID, image version,
volume identities, container ID, and runtime generation. Persist desired state
separately from observed process state. Stopping or removing a container retains
session volumes; deleting retained state is a separate operation. This carries
former PRD-52 and implements PRD-54.

**TRD-10 — Exclusive session ownership.** **Proposed.** Allow only one live
container to write a session's mounts. Before replacement, revoke the old runtime's
API authority and confirm its processes have stopped and its mounts are released.
A lease or generation number alone cannot stop an old process writing a mounted
volume. If exclusive ownership cannot be established, leave recovery pending.
Reconcile labeled containers and saved lifecycle records after an orchestrator
restart, rather than creating duplicates.

**TRD-11 — ACP recovery.** **Confirmed direction; proposed procedure.** Restore
session mounts and the pinned runtime, negotiate capabilities, then use supported
`session/resume` or `session/load` for the saved ACP session ID with the same
working directory and MCP configuration. Reconcile replay before accepting the
next prompt. A browser reconnect only replays application events. Recovery of an
agent process is a separate operation. Never silently replace a missing session
with an empty one or resend a prompt whose delivery is uncertain.
[ACP session setup](https://agentclientprotocol.com/protocol/v1/session-setup).

**TRD-12 — Credentials and recovery retention.** **Confirmed direction; open
bootstrap detail.** The user authorizes Codex on the server. Provision credentials
into each session's private runtime state through a trusted mechanism; never
share a complete writable Codex home between sessions. Verify credential refresh
and reauthorization with the selected login method. Retain session state across
ordinary stops and restarts. Host-loss recovery additionally requires volume and
metadata backups; persistent mounts alone cover container replacement.

**TRD-13 — Durable modeling handoff.** **Confirmed direction; proposed contract.**
The conversational agent creates a modeling task containing objective, immutable
input asset references, measurements with units and assumptions, parent revision,
requested outputs, and evaluation criteria. Persist the task before starting or
resuming its CAD session. The CAD agent returns result references, computed
evidence, an interpretation, and clarification requests. Link tasks and both
sessions to the originating chat and work request. Use application-managed
delegation so the CAD agent receives its own container; do not implement it as
another process inside the conversational agent's container.

## Files, assets, and interaction

**TRD-14 — Local file handoff through MCP.** **Confirmed.** A local MCP process
in each session can fetch stored assets into that session's workspace and submit
generated files by local path. Copy completed bytes into application storage and
return stable asset references. Transfer files between sessions or FreeCAD workers
through scoped storage access; a path from one container is not a path in another.
This carries former PRD-32. Proposed tool names are `asset_fetch`,
`asset_publish`, and `result_publish`.

**TRD-15 — Image input and generation.** **Confirmed direction; open runtime
verification.** Codex opens downloaded images with its image-view tool. Generated
sketches can be submitted from their actual local output paths; do not assume a
fixed generation directory. If a generator returns bytes, materialize a file
before submission. ACP inline images remain optional. Verify image viewing,
generation, and file publication in the selected account and runtime. CAD renders
come from FreeCAD and do not depend on the sketch image generator. This carries
the implementation question formerly recorded as PRD-38.
[Adapter image events](https://github.com/agentclientprotocol/codex-acp/blob/main/src/CodexToolCallMapper.ts).

**TRD-16 — Application storage.** **Proposed.** Start with SQLite metadata and
durable events plus a private immutable blob volume. Only the backend writes
domain state. Include owner and project scope on every record and access check.
Use stable IDs independent of paths or temporary URLs so S3-compatible storage
can be introduced later. Browser downloads use authorized application routes.
This carries the storage part of former PRD-39.

**TRD-17 — Asset ingestion and lineage.** **Proposed.** Verify file type, size,
digest, and completion before finalizing bytes. Restrict path imports to configured
workspace/output roots and reject path escapes. Store annotations as new flattened
images with source references and optional editable drawing data. Normalize image
orientation before assigning annotation coordinates. A model snapshot records
its revision, evaluation, preview digest, and camera pose. Reuse of a local filename
never overwrites a published asset.

**TRD-18 — Explicit result publication.** **Confirmed direction; proposed
contract.** Publish a selected set of local images, reports, previews, or exports
with its source revision and evaluation ID. STEP is optional in that set. Snapshot
the selected files, finalize their blobs, then commit the immutable result manifest
and its event atomically. Use an idempotency key for retries. Keep unpublished
working files out of chat. Later results create another retained publication,
rather than mutating an earlier card's files.

**TRD-19 — Typed chat components.** **Confirmed direction; proposed normalization.**
Render MCP activity with a registry keyed by server, tool, and result schema
version, plus a generic fallback. Correlate tool calls with backend operations,
assets, and results; backend state determines availability. Merge ACP events by
tool-call ID and normalize adapter-specific result wrappers at one boundary.
Return structured MCP results with a text fallback. This implements PRD-24.
[MCP tool results](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

**TRD-20 — Input requests and prompt ownership.** **Proposed.** An MCP tool creates
a durable form or capture request and returns promptly. Its submission becomes a
later user message in the conversational session. Forward CAD clarification
requests through that conversation and retain their task references. Serialize
prompts within each agent session; deliver child results through a durable inbox
at a permitted turn boundary. Queueing user messages remains optional under
PRD-46. Protocol permissions are separate from product input forms.

## FreeCAD rendering and verification

**TRD-21 — FreeCAD evaluation service.** **Confirmed.** The CAD agent submits
FreeCAD Python source as a file, parameters, input references, requested views,
output types, and check specifications, or references already ensured geometry.
FreeCAD builds or reuses the geometry and performs
the requested rendering and verification. The CAD agent reads the returned images and numerical
evidence, updates code or parameters, and submits another evaluation when useful.
It can request clarification through the conversational agent. This carries
former PRD-28 and PRD-29. [M-CAD.md](M-CAD.md) defines the standalone evaluator
contract and its staged verification outcomes.

**TRD-22 — Selective evaluation outputs.** **Confirmed.** An evaluation may return
images only, numerical evidence only, or a combination with an interactive preview
and optional STEP export. Do not require STEP, browser mesh generation, or the full
export pipeline for an early rendering/check iteration. Proposed tools are
`cad_evaluate`, `cad_status`, and a bounded `cad_wait`; the local MCP layer makes
completed output files available in the CAD session's workspace.

**TRD-23 — Numerical evidence.** **Confirmed direction; proposed initial checks.**
Support dimensions, area, volume, center of volume, and validity/solid checks,
then add geometric integral properties and task-specific checks as needed. Record
value, units, geometry selection, coordinate frame, method, and any criterion or
tolerance. Report measured, pass, fail, unavailable, or error explicitly; absence
of a criterion is not a pass. Material mass requires an explicit density assumption.
Compute verification data in service-owned code, distinguishing custom agent
calculations from built-in checks.
[FreeCAD shape implementation](https://github.com/FreeCAD/FreeCAD/blob/main/src/Mod/Part/App/TopoShapePyImp.cpp).

**TRD-24 — Evaluation provenance.** **Proposed.** Freeze source, parameters, input
references, check specifications, camera settings, and engine versions for each
evaluation. Retain a native geometry snapshot and its digest with that run; BRep
plus object placements is a candidate format. Derive requested renders, metrics,
meshes, and exports from the same evaluated geometry. Record units and transformations.
A STEP file is an optional derivative, not a prerequisite for geometry evaluation.
Changing design inputs creates a new source revision; requesting another view or
export can create another run/result for the same frozen geometry. Use a stable
live handle for repeated queries of retained immutable geometry under M-CAD-20
and M-CAD-35–36. Handle expiry or worker replacement can restore a retained native
snapshot without rerunning source; a missing handle never triggers a hidden rebuild.

**TRD-25 — Worker isolation and trusted evaluation.** **Confirmed isolation;
proposed execution layout.** Execute generated Python in a bounded FreeCAD worker
with no network, provider credentials, application database, or Docker socket.
Set memory, CPU, process, output-size, and wall-time limits. After building, use a
clean service-owned process to read the native geometry snapshot and compute
verification results and renders without rerunning generated Python. This clean
runtime may retain immutable geometry for repeated scoped queries; generated code
never runs inside that retained verification process. Keep parsing
and rendering inside the same resource restrictions. A reusable service may
supervise disposable attempts; each image does not require a separate agent.

**TRD-26 — Rendering and browser preview.** **Confirmed direction; proposed
format.** Use FreeCAD to produce requested raster views for the CAD agent's loop.
Validate the container's offscreen/display setup; a command-line installation alone
does not establish that rendering works. Generate GLB for the browser when requested,
with an explicit CAD-to-glTF coordinate and unit transform. glTF uses meters and
Y-up. Persist camera information and geometry provenance with rendered outputs.
[M-CAD-31–34](M-CAD.md) specify separate images, composed view grids, camera
titles at each view's top-left, and JSON/inline annotations.
[CAD-PROTOCOL-13–14](architecture/CAD-PROTOCOL.md) keep those choices independent
of grouped or separate chat messages and preserve annotation sidecars.
This carries the preview-format part of former PRD-39.
[FreeCAD image rendering](https://freecad.github.io/SourceDoc/d3/df7/classGui_1_1View3DInventorPy.html),
[glTF coordinates](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#coordinate-system-and-units).

**TRD-27 — Final exports.** **Confirmed direction; proposed validation.** Produce
STEP and retain the associated FreeCAD Python source for the selected final
design. Export from the same frozen geometry used by the associated evidence and
preview. Reopen the exported STEP and check geometry and units before marking it
downloadable. A failed export leaves earlier images, measurements, and revisions
available. This implements PRD-5 and PRD-20 without requiring STEP during every
evaluation.

## State, stopping, and verification

**TRD-28 — Independent lifecycle records.** **Proposed.** Track agent session,
ACP turn, delegated task, evaluation job/attempt, source revision, native geometry
snapshot, ephemeral live geometry handle, asset, and published result separately.
Evaluation jobs move through queued, running, and
completed, failed, or cancelled states; requested output availability and check
outcomes remain separate. A failed check may still produce a valid diagnostic
image. The UI derives actions from available artifacts, not a single model-ready
flag. A result can be viewable while STEP download is unavailable.

**TRD-29 — Stop propagation.** **Proposed policy implementing PRD-46.** Associate
the conversational turn, delegated CAD task, and evaluation jobs with one work
request. Stop revokes further publication for that request, cancels active ACP
turns in both sessions, stops its unfinished worker attempts, and prevents queued
child-result deliveries from restarting it. Preserve published results and session
mounts. Normal completion of one ACP turn does not cancel a delegated task.
Apply a deadline and terminate an unresponsive container without deleting its state.

**TRD-30 — Publication and retry races.** **Proposed.** Compare attempt identity,
lease, runtime generation, and cancellation state before committing results.
Commit publication and cancellation in an ordered backend transaction so a late
worker cannot publish after cancellation has won. Retrying unchanged work creates
a new attempt under the same operation; changed inputs create a new evaluation.
Update the selected-result pointer conditionally so older completion cannot replace
a newer selection. Clean abandoned staging only after its references/leases expire.

**TRD-31 — Durable events and interrupted work.** **Proposed.** Persist accepted
commands and user messages once, then assign durable application event sequences.
Deduplicate relay events by session, runtime generation, and local sequence.
Browser reconnect replays from a cursor. Recover conversational and CAD sessions
independently and reconcile their task/job records. If prompt dispatch or a handoff
is uncertain after a crash, mark it interrupted and inspect persisted state;
never blindly rerun side effects. Resume completed handoff delivery once by its ID.

**TRD-32 — Container authority and scope.** **Proposed.** Keep container-control
credentials exclusively in the trusted orchestrator. Use fixed runtime images,
entrypoints, resource profiles, and session/job mounts; agents cannot submit host
paths or arbitrary Docker flags. Scope runtime credentials to owner, project,
session, role, and generation. Shared project assets are accessible through
authorized retrieval, while other sessions' writable mounts remain inaccessible.
[Docker daemon authority](https://docs.docker.com/engine/security/),
[Docker resource controls](https://docs.docker.com/engine/containers/resource_constraints/).

**TRD-33 — First integration gates.** **Open.** Verify two separate Codex/ACP
session containers with injected MCP tools; image fetch/view and sketch publication;
a delegated CAD loop returning an image and numerical checks without STEP; a later
STEP export of the intended geometry; and correct typed cards in chat. Replace
each agent container and recover its own conversation and files without mounting
another session's state. Check Stop propagation, duplicate submissions, late results,
and browser replay. Run Python checks with `uv`. These are planned checks, not
claims of completed integration. This carries former PRD-37's feasibility work.

**TRD-34 — Architecture rendering.** **Confirmed.** Keep PlantUML sources, notes,
and local SVG/PNG rendering targets in `docs/architecture/`. Expose root Makefile
targets for rendering and syntax checks. Document decisions about isolation and
state in those diagrams, with this TRD as the technical requirement inventory.

**TRD-35 — Printing extension.** **Confirmed; implementation deferred.** Preserve
an additional MCP integration point that can later submit selected stored assets
or revisions to a print-preparation service. No provider integration, slicing,
printer control, or courier workflow belongs to this build. This implements the
extension direction in PRD-45.

**TRD-36 — Remaining implementation choices.** **Open.** Verify pinned adapter
and FreeCAD versions, offscreen rendering dependencies, credential bootstrap and
refresh, resource limits, and the first check registry. Proposed defaults are one
CAD execution slot and one reusable CAD session associated with each conversational
chat, with independent mounts and lifetime. Bound each delegated task by execution
and iteration budgets. Exact transport schemas and image-generation setup are
implementation work; separate agents, per-session isolation, recoverability, and
selective FreeCAD evaluation outputs are settled direction.

**TRD-37 — Local-first development.** **Confirmed.** Build and exercise the
FreeCAD evaluator locally before packaging it in isolated Docker. Use `uv` for the
development harness, with repeatable inputs, output files, and reports. Keep the
evaluation contract consistent across local and container execution. Distinguish
deterministic service and geometry regressions from trials of the CAD agent's
part-verification loop. Once the local implementation meets the selected fixture
outcomes, package it and rerun the relevant checks with container isolation and
resource controls. Per-session agent containers remain the deployment direction.

**TRD-38 — Standalone CAD contract and wrapper.** **Confirmed boundary; proposed
module details.** Keep `cad/` as a Python/uv module that accepts a source file or
ensured geometry handle/native bundle, explicit parameters and declared local
inputs, requested artifacts, and metric
criteria, and returns a result manifest and completed local files. Its deterministic
contract is independent of agents, ACP, MCP, chat, and application storage. The
[M-CAD specification](M-CAD.md) owns its proposed fields, methods, and acceptance
fixtures. The [CAD handoff protocol](architecture/CAD-PROTOCOL.md) owns moving
bytes between isolated workspaces, durable operation/attempt state, retries, and
publication. Wrapping the evaluator must preserve the core request/result meaning;
local development does not depend on that integration.
