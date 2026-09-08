# M-ACP — Composable Codex interaction module

Implementation specification for the next live debug stage. Read this with
[ACP agent state](ACP-AGENT-STATE.md) and the
[interaction schematic](architecture/rendered/acp-integration.svg).
[TRD-6–20 and TRD-28–33](TRD.md) define the wider system. This module is the first
real text/image/MCP slice of that system, independent of the ongoing
[CAD service](M-CAD.md). Requirements have a document-local counter.

**M-ACP-1 — Outcome.** Provide an independently runnable Python/uv integration
module that owns Codex ACP sessions, image files, normalized activity, and sample
MCP tools. Mount a real React consumer at `/debug/agent`, alongside the existing
`/debug/chat` rehearsal. A user can create and select chats, submit text and
images, see streaming replies and useful tool components, generate an image,
download or reattach it, and reopen the same conversation after a refresh or
runtime restart. Do not substitute fixture responses for the live chain.

**M-ACP-2 — Composition boundary.** Put the backend in `agent/` and its transport
client/UI composition in `src/frontend/src/features/agent-chat/`. The Python
module exposes an application command/snapshot/event API; browser components do
not speak Codex App Server directly. Reuse the existing chat history, renderer
registry, image cards, camera panel, and attachment components. Protocol parsing,
process management, and storage must not live in route components. The same
module can later be mounted behind the application's authenticated API.

**M-ACP-3 — First runtime.** Use the installed, pinned
`@agentclientprotocol/codex-acp` adapter over newline-delimited JSON-RPC. It owns
the Codex App Server translation. The initial integration runs one local adapter
process tree per active application session, with distinct persistent workspace
and Codex-state directories. This local stage is not container isolation. Keep
process start/stop and directory selection behind the runtime interface so the
per-session Docker orchestrator in TRD-7–12 can replace this implementation.

**M-ACP-4 — Configuration.** Explicitly configure data root, adapter command,
optional Codex executable, credential bootstrap source, bind address, allowed
browser origins, startup/turn/cancellation limits, and file/frame limits. Record
adapter version and negotiated capabilities. Inherit the operator's selected
model and reasoning settings unless explicitly configured otherwise. Pin a local
adapter package and lock its dependency graph. Do not change global Codex config,
load unrelated application MCPs, or expose model-provider credentials to the UI.

**M-ACP-5 — Credential bootstrap.** Initialize a new session's private Codex state
from the authorized local login using a private credential copy, without printing
its contents. Keep credentials outside asset import roots and out of Git. Existing
sessions retain their own runtime state; do not replace their state with another
session's home. Surface missing/expired authorization as an actionable setup
failure. This local bootstrap does not establish multi-user authorization,
central refresh coordination, or production credential distribution.

**M-ACP-6 — Initialization.** Register stdout, stderr, response correlation, and
incoming-request handlers before sending `initialize`. Negotiate image and
session recovery capabilities; advertise only client features actually supplied.
Configure the sample MCP server explicitly on new and resumed sessions. A real
successful MCP call is the configuration gate. Keep stderr separate from frames,
bound logs and frame size, and fail pending requests if the process disappears.

**M-ACP-7 — Application API.** Expose health/configuration readiness; session
create/list/snapshot/open/stop; image upload/download; prompt submission; turn
cancellation; permission responses; and a session event stream with a durable
cursor. Commands use application session IDs. Do not accept arbitrary executable,
cwd, host path, MCP configuration, or provider credentials from browser payloads.
The concrete HTTP routes and JSON examples live with the implemented module.

**M-ACP-8 — Durable state.** Persist session metadata, ACP session mapping, turns,
normalized history, image metadata, and ordered events in SQLite, with immutable
files in a private local data directory. Store accepted user messages before
dispatch. The state contract is [ACP-AGENT-STATE.md](ACP-AGENT-STATE.md); it defines
identity, replacement, replay, and uncertain execution. A browser snapshot is a
projection, not authority for replacing the backend database.

**M-ACP-9 — Prompt ownership.** Accept a prompt once per session and
`clientMessageId`; repeat submission returns the existing turn, and reusing the
ID with different content is rejected. Allow one active prompt per session.
Return an explicit busy response for another message while allowing the user to
keep editing their draft. Finish the ACP turn from its original `session/prompt`
response, after applying preceding updates. A completed tool call does not finish
the turn. Do not automatically resend a prompt after an uncertain disconnect.

**M-ACP-10 — Incoming images.** Upload complete image bytes, validate the decoded
format and dimensions, and assign an immutable asset/version ID and digest.
Snapshots and annotated images use this same ingestion boundary. Stage a copy in
the selected session workspace. When negotiated, deliver image blocks through ACP
alongside asset references and usable local paths; retain a file-based path for
image-view tools. Prompt attachments reference the submitted version forever.
Reject unsupported media or oversized input before dispatch.

**M-ACP-11 — Generated images.** Use Codex's native image-generation capability
in the configured account. Capture its actual tool lifecycle and saved-file
reference, without assuming a fixed output filename. Have the agent publish a
completed local image through the sample MCP tool; validate and copy those bytes
before returning a browser-visible asset reference. Generation errors remain
visible failures. The acceptance record must distinguish real image generation
from image viewing, an existing file, or a deterministic test fixture.

**M-ACP-12 — Sample MCP surface.** Supply a session-scoped stdio MCP server with
image listing/fetching, local-image publication, and a camera input request.
Return versioned structured results plus text fallback. The server derives session
scope from its startup credential, never tool arguments. Image publication accepts
paths only beneath that session's workspace or configured generated-image root.
It calls the backend ingestion boundary; it does not write authoritative session
or history records directly. These tools are integration examples, with names and
schemas documented in `agent/README.md`.

**M-ACP-13 — Camera interaction.** A camera request creates a durable interaction
record and returns promptly. Render the existing camera component when the user
opens that card. Camera permission/capture remains an explicit browser action.
Save captured images as assets and offer them in the composer; the user submits
the resulting image message as a later turn. Distinguish completion of the MCP
request from completion of the requested human interaction. Stop camera tracks
on close, collapse, session change, and unmount.

**M-ACP-14 — MCP event capture.** Merge ACP `tool_call` and `tool_call_update` by
session and tool-call ID, preserving absent fields across patches. Normalize the
Codex adapter's server/tool/arguments and result/error wrappers in one boundary.
Keep call arguments, returned structured data, execution status, and domain
references separate. Project only validated known results to rich components;
retain unknown tools and malformed results as generic activity. Inline image bytes
and credentials do not belong in browser debug JSON or event logs.

**M-ACP-15 — Presentation.** Keep the transcript ordered and stable while text
streams and tools change status. Reuse expandable image/camera/model components
and preserve exact attachment versions. Provide a session sidebar, new chat,
refresh/open, busy/connection status, Stop, and visible errors. Image inspection,
download, and reattachment are available from the same real assets. Configuration
and raw tool details are secondary debug inspection, not the normal message body.
The live chat shell uses the available viewport width with modest outer padding.
Publish committed text updates immediately to subscribed clients, without a
polling interval or waiting for prompt completion. Yield between buffered ACP
updates so sockets can progress. Mark the active assistant message as writing;
do not simulate provider deltas by slowly revealing an already completed reply.

**M-ACP-16 — Permissions.** Preserve ACP permission requests as pending records
with their offered options. Present the actual request and let the user choose;
send exactly that option to the requesting runtime. Do not blanket-approve requests
or switch to full-access mode to pass integration. Cancel unresolved permissions
when their turn stops or runtime disappears. Product camera/input requests and
execution permissions have separate identities and lifecycles.

**M-ACP-17 — Stop and recovery.** Send `session/cancel` as a notification, resolve
pending permissions as cancelled, and wait for the original turn to settle. If
the runtime exceeds the grace period, terminate its owned process group and mark
work interrupted/cancelled. Retain saved images and conversation records. A later
open restores the same private state and ACP session through negotiated resume or
load. Browser reconnect reads a snapshot and events after its cursor; it does not
spawn another runtime or reload the ACP conversation by itself.

**M-ACP-18 — Local exposure.** Bind the debug backend to loopback, validate
browser origins and host names, scope MCP requests with per-session credentials,
and validate path containment and file sizes. The frontend uses the development
proxy rather than embedding provider secrets. The first service is a local
single-operator integration; authenticated public deployment and per-session
containers remain TRD work. State these limits in setup documentation.

**M-ACP-19 — Deterministic verification.** Use a fake ACP executable to exercise
initialization, partial tool updates, interleaved text, image publication, repeated
commands, concurrent prompt rejection, permissions, cancellation, process loss,
resume, and event replay. Test actual MCP framing and result schemas. Browser
tests prove session switching, preserved attachments, rich tool components,
reconnect, and accessible error/permission controls. Fakes must be explicitly
selected by the test harness, never silently substituted in the live app.

**M-ACP-20 — Live acceptance.** Through the real debug page, create two distinct
Codex sessions; send a visually checkable image and inspect the reply; generate a
new image and publish it through MCP; open/download/reattach that exact image;
switch sessions and refresh without history leakage; stop an active turn; then
restart a runtime and continue the saved conversation. Retain commands, adapter
and model identity, normalized traces, representative screenshots, and asset
digests. Report each executed outcome and any remaining limitation independently.

**M-ACP-21 — Integration handoff.** Provide the Python/uv module, locked adapter
installation, reproducible Makefile targets, reusable frontend client/component,
sample MCP server, configuration reference, state contract, deterministic tests,
and live acceptance evidence. Merge the owned result while preserving ongoing CAD
and frontend work. Full CAD delegation, Docker orchestration, durable user forms,
and production account management are subsequent integrations of this module.

**M-ACP-22 — Source of protocol behavior.** Use the pinned adapter's implementation
and [ACP protocol](https://agentclientprotocol.com/protocol/overview) for wire
behavior. Codex's [App Server documentation](https://learn.chatgpt.com/docs/app-server)
explains the native layer owned by that adapter. Keep adapter-specific quirks in
normalization and compatibility tests; do not spread them through domain views.

**M-ACP-23 — Composer annotation.** Clicking a selected attachment opens the shared
annotation editor for that image. Saving replaces that composer slot's preview
and retains its source and editable drawing history. Keep the image inventory in
the separate Photos action. Before sending, the draft owns local edit IDs, source
blobs, marks, and flattened PNGs; Send snapshots the selected PNGs, ingests them,
then dispatches immutable references. Retry uses the same selected bytes and
command identity. Session switches preserve unsent edits during the mounted app's
lifetime; page reload persistence of drafts and backend drawing lineage are later
work. Earlier submitted references remain unchanged.

**M-ACP-24 — Thoughts, Markdown, and activity.** Persist the text explicitly
exposed by ACP `agent_thought_chunk` as separate ordered thought records, merging
chunks by the current turn and segment. Do not mix them into assistant replies
or reconstruct missing thoughts from local runtime files. Render messages and
thoughts with the shared React Markdown component, including lists, code, links,
and GitHub-style tables. Thought sections expand while streaming and can be
collapsed without later chunks reopening them; saved thoughts remain inspectable
after reload or cancellation. Use compact tool/thought headers, bounded thought
content, and a visible running animation above the composer, including the wait
before text arrives. Permission waits use a distinct status; completion and Stop
settlement remove the running state. Honor reduced-motion preferences.
