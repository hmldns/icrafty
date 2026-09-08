# ACP agent state

State specification for [M-ACP.md](M-ACP.md). This develops the initial note about
chat history, camera runs, image attachments, and JSON session representations.
The local [integration schematic](architecture/rendered/acp-integration.svg)
shows ownership; [TRD-7–20 and TRD-28–33](TRD.md) describe the later container and
multi-agent system. Identifiers are local to this document.

**ACP-STATE-1 — Separate identities.** An application session has a stable ID,
title, created/updated timestamps, and its own workspace/state directories. Its
ACP session ID, runtime generation, process identity, active turn, and capability
record are distinct fields. Neither a process ID nor a browser connection is the
conversation's identity. Only app-owned sessions appear in the session list.

**ACP-STATE-2 — Runtime lifecycle.** Track stopped, starting, ready, and failed
runtime states separately from a turn's state. Opening a ready session reuses
its runtime. Starting/recovering it is serialized under a session lock. Stopping
a runtime retains its directories, ACP ID, assets, and transcript. The Docker
implementation will replace process identity with managed container identity
while retaining these ownership rules.

**ACP-STATE-3 — Turn lifecycle.** A persisted turn records the client message ID,
immutable input references, prompt digest, dispatch status, generation, start/end,
and result/reason. Distinguish running, waiting for permission, cancelling,
completed, cancelled, failed, and interrupted. At most one unfinished turn owns
a session's prompt slot. A new user message never reuses another turn's ID.

**ACP-STATE-4 — Uncertain execution.** On backend/runtime loss, unfinished turns
become interrupted. Preserve their visible partial output and mark the limitation;
do not infer success or resubmit them. A later explicit user message may continue
after ACP recovery. Generation checks prevent an old runtime's late updates or
MCP publication from completing a newer turn.

**ACP-STATE-5 — Ordered history.** Persist user messages, streamed assistant
messages, and normalized tool calls as records with stable IDs and creation order.
Updates replace the same record without moving it. Streamed text appends to the
active message segment; tool activity can separate message segments. ACP replay
during recovery does not duplicate already persisted application history.

**ACP-STATE-6 — Image identity.** Every accepted image has an immutable asset and
version reference, validated media type, dimensions, byte size, digest, origin,
and stored-file reference. Camera photos, imported/annotated images, native
generation, and model snapshots use the same image boundary. Browser URLs and
agent-local paths are derived access locations, not asset identity.

**ACP-STATE-7 — Attachments and revisions.** Each composer slot selects an immutable
source image and may carry a browser-owned edit ID, original blob, drawing history,
and flattened preview. Saving an annotation replaces that slot's editable draft.
Reopening keeps Undo and Redo; session switches retain drafts in the current app
mount. Send snapshots the selected bytes and stores changed PNGs as new immutable
assets before creating the message. A retry retains that snapshot and command ID;
a failed submission keeps the draft. Earlier messages keep their exact submitted
references. Draft reload persistence and backend source/mark lineage are later
work; the first live stage ingests the flattened image, not editable drawing JSON.

**ACP-STATE-8 — Camera run.** Persist a camera request as a first-class interaction
linked to its creating tool call and originating turn. Captures reference image
versions and are independently retained. The tool can be completed while the
capture request awaits the user. Capturing attaches a photo to the request and
composer; submitting it creates a later user message. Reopening history never
automatically opens a physical camera.

**ACP-STATE-9 — Tool call record.** Preserve tool-call ID, known server/tool name,
title, status, arguments, result, error, and domain references. Missing fields in
an update do not erase earlier fields. Returned JSON is data, never instructions
for replacing application state. A valid tool result can identify a view or an
asset; backend records establish whether that resource exists and is accessible.

**ACP-STATE-10 — Publication.** A sample image-publish MCP operation validates a
completed file, copies immutable bytes, and commits its metadata before returning
the asset ID. Retrying unchanged content can reuse its stored bytes. Repeated tool
events update one card. Do not turn every file written by Codex into a published
asset or include private workspace/Codex-state contents in an app snapshot.

**ACP-STATE-11 — Permission record.** Persist the visible permission request ID,
turn/runtime ownership, offered options, pending/resolved status, and chosen
outcome. Resolve a permission only for the owning active generation. Stop and
runtime loss cancel it. It does not share the camera request's identity or imply
approval to publish a design.

**ACP-STATE-12 — Snapshot and event cursor.** Return a versioned JSON snapshot
containing public session metadata, ordered normalized records, an asset catalog,
pending interactions/permissions, and the last committed event cursor. The stream
continues after that cursor; repeat delivery is harmless by event ID and record
identity. Session switches dispose the old subscription and cannot route its
events into the new chat.
Committed events wake each connected subscriber immediately. Disconnect removes
the subscriber; reconnect reads the durable cursor and does not depend on an
in-memory notification queue or replay a prompt.

**ACP-STATE-13 — JSON ownership.** An agent can submit typed commands and typed
MCP results, including a proposed interaction description. The backend validates
and applies them to its own records. An arbitrary agent-supplied JSON snapshot
cannot impersonate another session, overwrite submitted messages, change process
ownership, or restore credentials. Import/export of complete session archives is
a future separately validated contract; the initial JSON view is read-only state.

**ACP-STATE-14 — Recovery material.** Retain application metadata/events, immutable
image bytes, and each session's private Codex runtime state/workspace. Browser
reconnect needs the first two; native conversation continuation also needs the
last. Test runtime restart and browser refresh separately. Container replacement,
exclusive volume ownership, host backups, retention, and task-tree coordination
extend this contract under the TRD rather than being claimed by a local demo.
