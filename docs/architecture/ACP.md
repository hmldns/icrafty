# ACP integration notes

These are implementation contracts and verification gates, researched on
2026-09-08. No authenticated end-to-end Codex/ACP/CAD integration has been run
for these diagrams. The file handoff decisions are recorded in
[A-1 through A-7](ASSUMPTIONS.md).

**ACP-1 — Use the existing adapter.** The Python supervisor talks ACP over stdio
to `@agentclientprotocol/codex-acp`; the adapter starts Codex App Server and owns
the native protocol translation. Its package includes a compatible Codex
dependency. Pin the adapter and dependency lock in the runtime image. Inject the
Crafty MCP server through session configuration and verify a real tool call;
successful process startup alone is insufficient.
[Adapter documentation](https://github.com/agentclientprotocol/codex-acp).

**ACP-2 — Negotiate the protocol.** Start with ACP v1 and inspect returned
capabilities before using optional images, HTTP MCP, load, or resume support.
Advertise filesystem and terminal client capabilities only if implemented; the
agent may use its own tools inside its container. Register the stdout reader and
incoming request handlers before session creation. ACP uses newline-delimited
JSON-RPC; drain stderr separately and bound buffered frames. Keep native App
Server initialization inside the adapter.
[ACP initialization](https://agentclientprotocol.com/protocol/v1/initialization),
[ACP transports](https://agentclientprotocol.com/protocol/v1/transports).

**ACP-3 — Paths and image input have distinct roles.** Provide stable asset IDs
and fetch instructions in the prompt, or preload files into the chat directory
and include their paths. Codex must then open the image with its image-view tool
to inspect pixels. An ACP resource link alone is translated to text by the adapter;
it does not automatically fetch image bytes. Inline ACP image blocks remain an
alternative when negotiated, rather than a dependency of the local-file flow.
[Prompt conversion](https://github.com/agentclientprotocol/codex-acp/blob/main/src/CodexAcpClient.ts).

**ACP-4 — Keep prompt ownership explicit.** Accept a user message once by
`clientMessageId`, persist the message and dispatch record together, and dispatch
one prompt at a time per chat. The v1 `session/prompt` request stays pending while
updates and agent requests arrive. Finish the turn from that original request's
terminal response. `session/cancel` is a notification; it does not return a separate
completion response. Pending permission requests must resolve as cancelled when
stopping. Apply the separate job cancellation policy from A-10.
[ACP prompt lifecycle](https://agentclientprotocol.com/protocol/v1/prompt-turn).

**ACP-5 — Normalize activity without making it domain state.** Merge tool events
by `toolCallId`, accepting repeated full events and partial patches. The Codex
adapter identifies MCP calls with `rawInput.server`, `rawInput.tool`, and
`rawInput.arguments`, and wraps output as `rawOutput.result` and `rawOutput.error`.
Normalize that wrapper in one adapter boundary. Match registered frontend
components by server, tool, and result schema version, with a generic fallback.
Use returned operation and asset IDs to read authoritative application records;
do not derive success from display titles or prose.
[Tool mapping](https://github.com/agentclientprotocol/codex-acp/blob/main/src/CodexToolCallMapper.ts),
[ACP tool updates](https://agentclientprotocol.com/protocol/v1/tool-calls).

**ACP-6 — Make domain tools recoverable.** MCP results should contain versioned
structured data and a serialized text fallback. File tools expose local paths
only to the agent; browser cards receive asset IDs and authenticated application
URLs. The backend derives project, chat, turn, and runtime scope from the caller's
credential and active turn record, not model-supplied authority fields. Give each
submission a durable operation ID. Input forms return promptly as described in
A-12. Protocol permissions are separate from those product forms and from design
approval.
[MCP structured results](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

**ACP-7 — Reconnect at the correct layer.** Browser reconnect replays backend
events after a durable cursor; it does not restart or load an ACP session. Persist
`chatId` to ACP `sessionId` separately. On runtime replacement, negotiate supported
resume/load behavior, reinstall scoped MCP configuration, and reconcile history
replay without duplicating saved user messages. A runtime epoch and event sequence
reject stale updates and deduplicate delivery. If a crash makes prompt delivery
uncertain, mark it interrupted and require a new explicit user turn; do not
silently resend a potentially side-effecting prompt.
[ACP session setup and replay](https://agentclientprotocol.com/protocol/v1/session-setup).

**ACP-8 — Prove the smallest complete loop first.** In the intended container and
account, create a session with Crafty MCP, fetch an annotated image to a local
folder, and have Codex identify its marks. Generate a sketch and publish its actual
local file. Build a small part, materialize its STEP, submit STEP plus source,
derive the preview, and download the selected revision. Verify a retry creates no
duplicate asset, a second revision preserves the first, Stop prevents unfinished
work from publishing, and browser reconnect reconstructs the same conversation.
Run Python checks through `uv`. These checks are planned acceptance gates, not
results claimed by the architecture diagrams.
