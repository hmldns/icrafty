# ACP image integration acceptance

Executed 2026-09-08 against the real Codex account, adapter
`@agentclientprotocol/codex-acp` 1.10.0 and Codex 0.153.4. The browser session
reported model `gpt-6-astra[max]`. Test fixtures are distinguished below.
The implementation contract is [M-ACP](../docs/M-ACP.md); ownership and recovery
are defined by [ACP agent state](../docs/ACP-AGENT-STATE.md).

**LIVE-1 — Image input.** Created session `d446d023cb454b218ae8ba0ad564e8a2`
through the mounted `/debug/agent` UI. Uploaded a 640 × 400 PNG with a red square,
blue circle, and green triangle. Codex identified the shapes in the correct order
and called the configured `crafty_images.fetch_image`. The image rendered as a
typed chat card. The fixture was a deterministic input image, not claimed as an
AI-generated output. Its SHA-256 was
`d992559018f8579dff614743187dbf6a17af238517e54c3be230404ee984db68`.

**LIVE-2 — Native generation and publication.** Asked the same conversation for
a pale-blue mug cap concept with a finger tab. The native `Image generation`
tool completed and saved a real PNG. Codex called `crafty_images.publish_image`
with its saved local file; the backend accepted immutable asset
`80babe1c2cd548cb9d766a86c8446082`, 1536 × 1024, 1,656,197 bytes. The UI displayed
the generated sketch with inspection, attachment, and download controls.
The downloaded browser file matched the stored SHA-256 exactly:
`3259d3fe15da03429a5472ca872e91cfcd41a1b9a73444b3f5563dd6d6dea4d8`.
This verifies both actual native generation and subsequent MCP publication.

**LIVE-3 — Native recovery and reattachment.** Shut down the backend and its
owned process tree, restarted it against the same data root, and sent the
reattached generated image. Codex resumed ACP conversation
`01a0830a-1349-70e2-b400-07b5f256f292`, with runtime generation increasing from
1 to 2 and the prior history retained. It recognized the pale-blue color and
rounded finger tab. It also created a real MCP camera request, persisted before
tool completion and visible in the chat. No new image generation was requested.

**LIVE-4 — Separate session and Stop.** Created a second chat,
`c1bf1eb059a046d79af8c4ea3e1af426`, using distinct ACP conversation
`01a08317-16fb-78e1-b1d3-7b74f5fd4ff5`. Sent a real prompt, observed a streamed
partial reply, and clicked Stop. Its turn became `cancelled` with no active slot;
the partial history remained. This session's asset catalog was empty. Switching
back restored the first conversation's images; browser refresh recovered saved
records. At 390 px, the page had no horizontal overflow and all four visible
image instances decoded successfully. Camera access did not start on restoration.

**LIVE-5 — Reproducible harness.** Ran
`uv run --locked python scripts/live_check.py --url http://127.0.0.1:8797` against
the local service. It passed real image input/MCP fetch and native stop/open/
continuation recovery in session `1d6b24e259af4228914954d82744a0b0`. The optional
`--generate` branch is provided for repeat runs; this run did not request another
generation. Generation was independently executed through the UI in LIVE-2.

**LIVE-6 — Deterministic checks.** Ten Python tests passed, including real stdio
ACP fixture processes, actual FastMCP initialization/tool registration, image
immutability and containment, HTTP/origin validation, durable camera and permission
records, concurrent retries, serialized stop/open, process loss, and exclusive
data ownership. Five browser integration tests passed, covering upload, streamed
records, typed image/camera components, session switching, permissions, Stop,
cursor reconnect, camera capture/cleanup, and small-screen error controls.
Fourteen existing chat/projection/route checks also passed. TypeScript and the
production frontend build passed; existing OCCT/chunk-size notices remain.
Browser fixtures use fake media and an explicitly mocked application API.

**LIVE-7 — Retained evidence and limits.** Normalized live snapshots, input,
generated-image inspection, and desktop/mobile screenshots are retained under
ignored `agent/runs/` in the implementation checkout. The demo's application
state and immutable image bytes live in the configured persistent data root.
No credentials, raw base64 frames, or native session home are committed as test
evidence. Provider-native permission escalation was not forced during live
acceptance; its offered-option flow is covered deterministically. Real camera
request creation was verified; capture used browser test media. This stage does
not claim Docker sandboxing, CAD handoff, or production account management.
