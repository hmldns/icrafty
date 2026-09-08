# Main repair experience

This implementation composes [PRD](PRD.md) behavior through the existing
[ACP module](M-ACP.md) and [state contract](ACP-AGENT-STATE.md). The deterministic
[CAD evaluator](M-CAD.md) stays separate; its conversational integration is a
parallel assignment. These are technical delivery statements, not new product rules.

**REPAIR-1 — Main surface.** `/` opens the live repair workspace. Reuse the saved
session, streaming timeline, image annotation, camera and download components.
Use repair-oriented language and the full available viewport, with the logo and
independently scrolling repair list on the left and the conversation on the right.
Keep the composer visible at the bottom; narrow screens fold the list behind a
repairs button above the conversation. The workshop and
debug routes remain available independently. The current implementation uses
one saved conversation per repair; multiple chats sharing one project remain later work.

**REPAIR-2 — Sample photographs.** Preserve the supplied originals and keep named
copies in `samples/mug-cap/`, with a manifest and provenance. A sample action
creates a new repair, ingests those actual bytes through the ordinary image API,
and submits the stated repair question with immutable references. Sample and live
user input follow the same ACP path. Do not invent dimensions from the photos.

**REPAIR-3 — Requested measurements.** The `crafty_forms.request_dimensions` MCP
tool submits a bounded typed form with a title, explanation, named number/text
fields, units and optional references to this session's images. The application
stores a first-class interaction and returns a `measurements` view. It returns
immediately; the agent finishes its turn while the user measures the object.

**REPAIR-4 — Inline answers.** Render the form in an expandable chat item with
its referenced images, measurement hints and explicit units. Answers remain
editable until submitted. Blank fields are allowed when the user cannot measure
them; require at least one answer and preserve missing values as unknown. Reject
unknown field IDs, nonfinite/out-of-range numbers and foreign image/request IDs.
The user may still send an ordinary message asking to proceed with assumptions.

**REPAIR-5 — Durable submission.** Submit with an idempotent client message ID.
Accept the form answers, update its tool result, and create the next user turn in
one storage transaction. Repeated identical submissions return the same turn;
changed answers require a new question/message. While another turn is active,
keep the form draft and offer the normal Stop/wait workflow. Do not replay an
uncertain model dispatch after restart. Saved answers and photos survive reload;
unsent field edits are browser state.

**REPAIR-6 — CAD composition.** A separate CAD agent owns modeling and evaluation
iterations. Its MCP handoff publishes real images, computed checks and requested
exports into the same repair. Preserve operation/revision identity, scoped files
and retained geometry; do not make assistant prose authoritative verification.
This parallel integration must fit the main chat without depending on a debug URL.
The [CAD result renderer](../src/frontend/docs/cad-chat.md) defines the browser
projection, evidence display, file checks and on-demand 3D preview.

**REPAIR-7 — Demonstration.** Test the product route, actual sample byte ingestion,
typed form creation, validation, submission, retry, streaming continuation and
reload. Run a dedicated actual Codex repair using the supplied photographs and
leave its dimension request available to review. Keep simulated test values out
of the user's repair; distinguish application tests from actual ACP acceptance.
