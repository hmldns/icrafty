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

**LIVE-6 — Deterministic checks.** Eleven Python tests passed, including real stdio
ACP fixture processes, actual FastMCP initialization/tool registration, image
immutability and containment, HTTP/origin validation, durable camera and permission
records, concurrent retries, serialized stop/open, process loss, and exclusive
data ownership. Interrupted tools are marked unsuccessful without inventing a
tool result. Five browser integration tests passed, covering upload, streamed
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

**LIVE-8 — Streaming, thoughts, and composer follow-up.** On 2026-09-08 the
backend changed from 250 ms event polling to subscriber notification after
persistence, yielding between buffered ACP frames. A real 600-word reply produced
678 text updates over 27 seconds before completion. In a second dedicated
session, `7919e261d9f14ee3b1e66b98e21c1027`, the adapter supplied two thought
records before a 239-update Markdown reply. The first thought arrived after
24.9 seconds and the reply after 32.8 seconds; provider latency remains visible
as running activity. A browser observer recorded 43 distinct rendered states
before completion, with the writing and activity states clearing at turn end.
The page occupied 1,920 px with 32 px outer content margins; thought headers
measured 39.25 px. Evidence is in ignored `agent/runs/stream-*.jsonl`.

**LIVE-9 — Follow-up regression checks.** Thirteen Python tests passed, including
real WebSocket delivery before completion, multiple subscribers, disconnect
cleanup, cursor replay, separate thought records, cancellation, and native
resume. Seventeen chat/projection browser tests passed for Markdown, thought
disclosures, activity animation, permissions, pasted-image editing, saved-pixel
submission, and mobile rendering. Thirty-three browser checks passed when
combining composer editing with the current collection save/copy implementation.
Source bytes and earlier submitted attachments stayed unchanged; editable marks
and Undo survived chat switches. The production build passed. Browser scenarios
use an explicit application-API fixture; the real-provider results are in LIVE-8.

**LIVE-10 — Floating camera follow-up.** Browser checks on 2026-09-08 verified one
permission request from Open camera, repeated captures into the originating card
and composer, a persistent live stream while the card collapses or the widget
resizes, mouse dragging, keyboard movement, and 390/320 px containment. Closing a
minimized pending request releases a late permission result; leaving the route
or switching chats releases all tracks. Existing standalone camera controls and
model cleanup continue to pass. The first run passed 21 of 22 checks; the drag
test initially clicked before the shrink animation had settled. Waiting for the
visible size to settle corrected that test, and all three floating-camera checks
passed on rerun. A fake-media mobile screenshot is retained in the browser test
output. The frontend type check and production build passed. Physical camera
capture was not used for these automated checks.

**LIVE-11 — Supplied photos and measurement forms.** On 2026-09-08 the main repair
surface at `/` created dedicated session `5be56e84a0e7473f8aa72fdbeea5ef35` in the
isolated `agent/runs/repair-state` data root. Its sample action uploaded the four
original mug photographs and sent them through actual Codex ACP image input.
Codex inspected all four and called `crafty_forms.request_dimensions`, creating
interaction `1cc2075853924e3cbf98e85a765c6ca4`: five numeric fields in mm, two text
questions about fit/use, caliper placement hints, and all four image references.
No mug dimensions were supplied or inferred during that request.

For the response-path check only, the browser submitted `83.4` and an explicit
TEST VALUES ONLY instruction to acknowledge and wait. The form became a saved
summary, created one subsequent user turn, and Codex acknowledged receipt while
stating that actual mug dimensions remain unknown. This test value is not a
measurement or CAD input for the user's repair. The native conversation and image
bytes remain in the isolated data root; `agent/runs/repair-main.png` records the
real main-surface form before submission. Application checks cover same-command
retry, atomic rollback, cross-session rejection, missing/nonfinite values, actual
sample file digests, hidden-form draft retention, mobile layout and reload.
