# CAD results in a repair

This renderer composes the main [repair workspace](../../../docs/M-REPAIR.md)
and [saved ACP state](../../../docs/ACP-AGENT-STATE.md). The backend owns the
versioned `cad.result` contract; its separate CAD agent and evaluator remain
responsible for geometry, verification, publication, cancellation and recovery.
The frontend consumes normal snapshot records and record/asset events.

**CAD-UI-1 — Stable progress.** Register `cad.result` in the existing chat item
registry. The operation's stable tool-call ID updates its existing card; a new
revision retains a separate identity. Show status and phase without inventing a
percentage. Ignore a lower operation version even when its event sequence is newer.
Use operation cancellation through the existing session-scoped CAD route.

**CAD-UI-2 — Image publication.** Render the selected immutable image references
in publication order. Together and per-image delivery use the same renderer;
per-image cards show their own selected views. An image record may precede its
catalog event, so preserve the CAD card and show loading until the asset arrives.
Keep unavailable outputs and reasons beside available evidence. Inline labels,
camera metadata, and downloadable annotation JSON remain distinct. JSON sidecars
describe evaluator annotations; they do not become editable user marks.

**CAD-UI-3 — Computed evidence.** Display actual metric values, units and
pass/fail/measured/unavailable/error states. Expand a metric to inspect its target,
criterion, signed difference and method. Attribute model interpretation separately
as CAD-agent notes. A completed operation can contain a failed geometric check.
Preserve revision, geometry digest, availability, evaluation, publication and
measured reuse counts in secondary details and the original record inspector.

**CAD-UI-4 — STEP files.** Offer a 3D preview and STEP download only when the
requested ready export matches the current session, revision and geometry digest.
Use the published artifact URL, size and SHA-256. The viewer checks imported bytes
against that metadata, and its source identity stays stable during unrelated record
updates. Open the viewer on demand; closing it or collapsing its card disposes it.
No STEP action is inferred from a PNG. Downloads use recorded routes with application
IDs, never agent-local paths. Unknown schema versions retain an inspectable fallback.

**CAD-UI-5 — Feedback.** A rendered image can be inspected or attached to the next
message using the existing image flow. A user-selected 3D view can be captured as
a PNG and attached, with its model and revision in the image title. This uses the
current image upload API; full camera/provenance JSON persistence is not added by
this renderer. Do not describe that PNG as new evaluator verification.

**CAD-UI-6 — Validation.** Browser checks exercise live record replacement, late
image resolution, partial output failure, failed checks, per-image order,
cancellation, reload, STEP import/digest validation and viewer disposal. Protocol
checks reject foreign-session URLs and mismatched revisions/files. These are explicit
application fixtures. Actual CAD-agent generation and artifact delivery require
the backend's separate native acceptance run against these mounted components.

Implementation lives in `src/features/cad-chat/`; transport remains in
`src/features/agent-chat/`, and shared timeline/viewer components remain in
`src/features/chat-flow/` and `src/features/models/`.

Run `npm test -- tests/agent-chat.spec.ts tests/cad-projection.spec.ts` from the
frontend package. Override `CRAFTY_TEST_PORT` for an isolated checkout.
