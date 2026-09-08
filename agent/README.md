# Codex ACP integration

This uv module runs real Codex conversations with images and sample MCP tools.
The app mounts its reusable React consumer at `/debug/agent`; `/debug/chat`
remains the independent chat-flow rehearsal.

Review [M-ACP](../docs/M-ACP.md), [agent state](../docs/ACP-AGENT-STATE.md),
and the [interaction diagram](../docs/architecture/rendered/acp-integration.svg).
Executed outcomes are recorded in [live acceptance](LIVE-ACCEPTANCE.md).

## Start

Use Python 3.11+, uv, Node 22.12+, and a working Codex login with image generation.
Linux is the verified platform; runtime ownership uses POSIX process groups and
an exclusive file lock. From the repository root:

```sh
make agent-install
make frontend-install
make agent-dev
```

In another terminal run `make mf`, then open
<http://localhost:5187/debug/agent>. The backend binds to `127.0.0.1:8787`.
Select **New chat**, attach a PNG/JPEG/WebP with **Photos**, and send a message.
For generation, ask for a sketch and its publication in chat. The image card
opens inspection, download, and attachment selection. **Stop** cancels a turn;
**Suspend** closes its process tree while retaining the conversation. Sending
another message or choosing **Resume chat** restores it.

Paste an image into the message input, then click its thumbnail to annotate it.
**Save image** replaces that draft attachment; click again to continue editing or
undo marks. **Send** submits the selected saved pixels. Unsent drafts survive
switching chats in the current page, but not a page reload. The shared editor
accepts images up to 12 MB, 16 megapixels, and 8,192 pixels per side.

Messages and ACP-provided thoughts render as Markdown. **Thinking** opens the
reasoning text the adapter supplies; it streams independently of the final reply.
Thought and tool headers stay compact and expandable. Animated dots above the
composer show that a turn is running, even before the first text arrives; a
permission request changes this to **Waiting for your approval**. Earlier chats
created before thought capture was implemented have no stored thoughts to show.

`make agent-install` installs `uv.lock` and the pinned npm adapter lockfile.
The adapter is `@agentclientprotocol/codex-acp` 1.10.0. Its packaged Codex binary
is the default; `CRAFTY_CODEX_PATH` can select an explicitly tested native binary.
Do not point the live service at `tests/fake_acp.py`.

## Configuration and recovery

`CRAFTY_AGENT_DATA` selects the persistent data root, default `agent/.state`.
Use an absolute stable path when changing checkouts. One backend exclusively
owns that root; do not start multiple Uvicorn workers against it. The root holds
`state.sqlite3`, immutable `images/`, and `sessions/<id>/workspace` plus a private
`sessions/<id>/codex`. Keep the complete root to recover native conversations;
copying only the application database restores the visible history, not Codex's
continuation state. A coordinated stopped-service backup is the local procedure.

`CRAFTY_CODEX_AUTH_SOURCE` selects a Codex `auth.json` to copy privately when a
session is first created. It defaults to the operator's `CODEX_HOME/auth.json`,
or `~/.codex/auth.json`. The application never prints it or returns it to the
browser. Login using the installed Codex CLI before starting; provider API-key
environment variables are not implicitly forwarded. Existing sessions retain
their own private auth state. To repair an expired session login, suspend that
session and authenticate the CLI against its private Codex home, then resume it.
Do not copy another session's whole home. Central refresh and credential
distribution belong to the later container/account integration.

`CRAFTY_AGENT_MODEL` and `CRAFTY_AGENT_REASONING` override the operator's selected
model and reasoning preference. Only these preferences are read from the
operator config. The module supplies its own workspace instructions and sample
MCP server; it does not import the operator's unrelated MCP configuration.
`CRAFTY_ACP_COMMAND` is a JSON array of executable and arguments for an explicit
adapter override. Launch parameters are operator settings, never browser input.

`CRAFTY_AGENT_STARTUP_TIMEOUT`, `CRAFTY_AGENT_TURN_TIMEOUT`, and
`CRAFTY_AGENT_CANCEL_TIMEOUT` are positive seconds, default 90, 600, and 8.
`CRAFTY_AGENT_IMAGE_LIMIT` and `CRAFTY_AGENT_FRAME_LIMIT` are positive byte limits,
default 20 MiB and 48 MiB. `CRAFTY_AGENT_PIXEL_LIMIT` defaults to 25 million pixels.
At most eight images belong to a message, with a combined encoded-frame limit.
Image input is decoded and EXIF-oriented before its stored identity is assigned.

`CRAFTY_AGENT_ORIGINS` overrides the comma-separated browser origin allowlist.
Defaults cover localhost/127.0.0.1 on 5187, 5217, 5287, 5317, 4187, and 4217.
The frontend's `CRAFTY_AGENT_URL` selects its HTTP/WebSocket proxy target, default
`http://127.0.0.1:8787`. For a second checkout, run `make -C agent dev PORT=8797`
and `CRAFTY_AGENT_URL=http://127.0.0.1:8797 npm --prefix src/frontend run dev -- --port 5217`.
Set a distinct data root for an independent backend.

This is a local, single-operator service. API session scoping, private directories,
per-runtime MCP credentials, and Codex's workspace permissions are implemented.
They are not a hostile-tenant isolation boundary: the processes run as the same
OS user and are not containers. Public API authentication, runtime quotas/idle
eviction, multi-user credentials, and per-session Docker orchestration remain
the next TRD stage. Do not expose this debug API on a public interface.

## Application API

All browser commands use `/api/agent`; provider credentials and raw ACP never
cross this boundary. Interactive schemas are at the backend's `/docs`.

- `GET /health` reports configuration readiness, not a successful provider call.
- `GET /sessions` lists saved sessions. `POST /sessions` creates and opens one.
- `GET /sessions/{id}` returns the versioned snapshot. `POST .../open` restores
  the same native conversation; `POST .../stop` cancels and releases its process.
- `POST /sessions/{id}/messages` accepts `clientMessageId`, `text`, and `imageIds`.
  It returns a persisted turn with HTTP 202. The same ID/content is idempotent;
  changed content is rejected. A second active turn receives HTTP 409.
- `POST /sessions/{id}/cancel` stops the active turn. ACP prompt completion,
  not tool completion, determines its final status.
- `POST /sessions/{id}/permissions/{permissionId}` accepts the offered `optionId`
  or null for cancellation. Stale or invented answers are rejected.
- `POST /sessions/{id}/images?title=...` accepts raw image bytes and returns an
  immutable image reference. `GET .../images/{assetId}` serves those bytes;
  `?download=true` sets the attachment filename.
- `POST /sessions/{id}/captures/{toolCallId}` accepts `assetId`, linking an
  already uploaded image to the durable camera request. It does not submit a turn.
- `WS /sessions/{id}/events?after={cursor}` replays committed events after the
  snapshot cursor, then immediately forwards newly committed events to each
  subscriber. There is no polling interval. Clients upsert by record identity and
  ignore repeated sequence numbers. Reconnect does not start another runtime.

A prompt body is small and independent of local paths:

```json
{"clientMessageId":"ui-request-42","text":"Inspect the rim","imageIds":["asset-id"]}
```

Snapshots contain `schemaVersion: 1`, `session`, ordered `records`, `assets`,
`interactions`, and `cursor`. Events contain `seq`, `kind`, and `payload`; kinds
are `session`, `record`, `asset`, and `interaction`. Permission history lives in
interactions. Record types are `message`, `thought`, and `tool_call`; thought
records contain `id`, `turnId`, and `text`, and use the same durable event cursor.
Permission choices are also projected onto the session. Camera
interaction status is independent of its completed tool call. Input, generated
image, and camera bytes share the same immutable ingestion boundary. This first
stage ingests flattened annotations as new image assets; backend editable mark lineage
and complete session archive import/export remain future work.
Every first-stage asset is immutable version `1`. Accepted messages also persist
exact `imageRefs` pairs; adding revision editing must preserve these references
and extend the command/catalog schema, never reinterpret old `imageIds` as a
mutable current revision.

## Sample MCP tools

To inspect a real call in the live page, send `Call crafty_images.list_images.`
Expand **List chat images**, then **Tool details** to see its arguments, status,
and returned JSON. Send `Call crafty_images.request_camera.` to inspect a result
that also becomes a camera card. For image handoff, attach an image and ask Codex
to call `crafty_images.fetch_image` for it; the details show its immutable
reference and session-local path. Expand the image card's **Tool details** for
`publish_image` after requesting generation and publication.

Each runtime launches `python -m crafty_agent.mcp_server` over stdio using explicit
session scope, a rotating credential, the backend URL, and allowed local roots.
Stdout is MCP framing; diagnostics use stderr. Tools return structured JSON with
`schema_version: 1` and text fallback. Internal HTTP endpoints require the runtime
credential, reject stopped/expired generations, and restrict publication to an
active originating turn. They are not a second browser API.

`crafty_images.list_images()` returns the session's image metadata. It does not
include other sessions or arbitrary workspace files.

`crafty_images.fetch_image(asset_id)` verifies session ownership, materializes
the immutable image in the session's `workspace/inputs/`, and returns a usable
`local_path` plus an `image` reference. ACP prompts also include inline image
blocks when negotiated. The agent can inspect the actual local file.

`crafty_images.publish_image(local_path, title, caption="")` resolves a completed
PNG/JPEG/WebP beneath this session's workspace or private generated-images root,
rejects path/symlink escapes, and transfers its bytes through ingestion. The
response returns the immutable asset reference and browser URL after persistence:

```json
{"schema_version":1,"view":"image","image":{"assetId":"id","versionId":"1"},"caption":"Cap concept","asset":{"id":"id","url":"/api/agent/sessions/session-id/images/id"}}
```

The abbreviated `asset` above also contains media type, digest, dimensions, and
origin in actual responses. Publication does not prove image generation: the
acceptance harness separately requires a successful native generation tool call.
Do not scan and publish every file written by Codex.

`crafty_images.request_camera(caption="Take a photo to continue")` persists a
camera interaction, returns `requestId`, `view: "camera"`, empty `photos`, and
`interactionStatus: "awaiting_capture"`, then completes promptly. The tool's
result links it to the originating ACP tool call. The user explicitly starts
the browser camera, captures images, then sends them in a later message.

## Composition and verification

`AgentService` owns commands/runtime coordination, `Store` owns persistence,
`AcpConnection` owns framed bidirectional RPC, and `normalize.py` translates the
adapter's tool patches. `create_app(settings, base_url=...)` provides the HTTP/WS
adapter. `AgentChat` and `AgentClient` are the reusable frontend boundary; see
the [frontend integration guide](../src/frontend/docs/agent-chat.md).

```sh
make agent-test
npm --prefix src/frontend run test:install
npm --prefix src/frontend test -- tests/agent-chat.spec.ts
make agent-live                 # uses running localhost:8787 and the real account
```

The deterministic Python suite uses an explicit fake ACP subprocess plus actual
MCP framing. It covers immutable files, scope, RPC ordering, resume/replay,
actual WebSocket delivery before completion, subscriber cleanup and reconnect,
permissions, cancellation, process loss, publication, camera records, and HTTP
validation. Browser fixtures exercise the application contract, never masquerade
as provider acceptance. The live helper creates a real session and retains its
normalized snapshot in ignored `agent/runs/`; `LIVE_ARGS=--generate` also requests
native generation and verifies the downloaded bytes. Live calls consume the
configured account's model usage and may require permission in the UI.
