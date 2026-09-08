# Crafty — Product Requirements

This inventory develops the original [IDEA.md](IDEA.md) and the product discussion.
Keep the original idea unchanged. Use each stable PRD identifier when discussing
or updating a requirement; do not renumber existing statements as the document grows.
This document describes product behavior and outcomes. Implementation decisions
live in [TRD.md](TRD.md), with their own identifiers. Gaps in the PRD counter are
intentional where technical statements have moved; do not reuse those identifiers.

**Confirmed** records the agreed direction. **Proposed** marks a suggested default
or acceptance condition. **Open** identifies a decision still to be made.
**Deferred** records a topic to address later in the product's life.

## Product and demo

**PRD-1 — Product purpose.** **Confirmed.** Crafty helps people create small parts
to fix or improve objects they own. The user and agent work together through
conversation, images, measurements, and 3D revisions to produce a printable part.

**PRD-2 — Hackathon focus.** **Confirmed.** The first build is constrained to a
one-day hackathon. Prioritize one complete working design journey and the
interactions needed to demonstrate it.

**PRD-3 — First example.** **Open.** The tentative demo is a replacement cap for
the user's mug, whose original cap is missing. The object is not final. The cap's
function and attachment need to be established if it remains the example; the
product flow should also support other small parts.

**PRD-4 — First user's equipment.** **Confirmed.** The demo user has a caliper
available to measure the object. The intended journey combines these supplied
measurements with laptop camera snapshots and conversation.

**PRD-5 — Product and demo outcome.** **Confirmed.** The product must generate a
downloadable STEP file for a part that can be 3D printed. The current app journey
ends with downloading. A physical print remains an external demo ambition; a
video of the part printing and a photo of the finished part held in a hand can
provide demonstration evidence.

**PRD-6 — Delivery.** **Confirmed.** Having the printed part delivered to the
user by courier/Uber is a stretch demo outcome if time allows, arranged outside
the app.

## Conversation

**PRD-7 — Chat workspace.** **Confirmed.** Chat is the primary workspace. Show
questions, answers, photos, drafts, interactive 3D models, and revisions in the
conversation.

**PRD-8 — Suggestions and dialog.** **Confirmed.** The agent may suggest a fix
in words, generated sketches, or 3D drafts, depending on what helps the
conversation. Let the user clarify the intended function and shape through
follow-up questions and revisions.

**PRD-9 — Object capture.** **Confirmed.** The agent can ask the user for laptop
camera snapshots to clarify the object's shape. Provide a capture dialog that
supports taking several images in a loop while the user rotates or repositions
the object. Offer an on-screen capture button and a keyboard shortcut. The user
can review the captured images, delete unwanted shots, and edit or annotate them
with drawing tools before submitting the retained images as chat assets.

**PRD-10 — Dimension requests.** **Confirmed.** The agent may ask for dimensions
in words or use a draft or sketch to indicate the features being measured.
Sketches may contain labels that connect questions to features. Choose the
request format to suit the conversation; a sketch is not required for every
measurement question.

**PRD-11 — Dimension input.** **Confirmed.** Support answers in chat, submitted
sketches or images with labels, and forms presented by the agent. A form may link
to an image and its labels and contain size inputs or open questions. The agent
can use these interactions as needed within the conversation.

**PRD-12 — Generation timing.** **Confirmed.** The agent may generate 3D as soon
as it has enough information. The user can also explicitly ask it to proceed
using its best available knowledge before all details are known. There is no
mandatory draft-approval step or requirement to collect every measurement before
honoring that request.

**PRD-13 — Projects and chats.** **Confirmed.** One project represents one repair.
Its chats share the project's assets, while each chat retains its own conversation
history. Preserve assets and revisions so the user can revisit earlier design
work within that repair.

## Inline assets and revisions

**PRD-14 — Asset presentation.** **Confirmed.** Render images, drafts, interactive
3D models, and generated output files inside chat. Asset cards support collapse
and expand so revisions remain accessible without overwhelming the conversation.

**PRD-15 — Collapsed card design.** **Proposed.** A collapsed asset card shows a
compact preview or descriptive label and its revision. Expanding the card reveals
its content and relevant actions within the conversation. Detailed styling remains
to be designed.

**PRD-16 — Interactive model.** **Confirmed.** The inline 3D model lets the user
inspect the generated part by rotating and zooming, then capture a snapshot for
feedback.

**PRD-17 — Drawing and text annotations.** **Confirmed.** The user can add
freehand marks and text to captured photos, draft images, or snapshots of the 3D
model. Submit and store the annotated images as assets available to the agent
for further processing and revision. Preserve their references so agents can
retrieve and use the actual image content later.

**PRD-18 — Feedback context.** **Confirmed.** Submitted annotated images have
stable asset references and retain the source artifact reference. A revision
request identifies the artifact it refers to, allowing the agent to retrieve
the annotated image and determine which draft or model the user wants changed.

**PRD-19 — Revision history.** **Confirmed.** New design revisions appear as new
artifacts in the conversation. Preserve earlier artifacts so the user can expand
and inspect previous versions.

**PRD-20 — Artifact consistency.** **Confirmed.** Associate images, measurements,
interactive previews, editable source, and exports with the design revision and
evaluation that produced them. Available previews and downloads must describe the
same geometry. An early evaluation can contain images or numerical results without
a STEP file.

**PRD-21 — Replying to assets.** **Proposed.** An asset card may provide a reply
button that attaches the selected artifact to the next chat message. This lets
the user refer to an earlier revision directly. Ordinary follow-up messages can
continue the latest design by default. The exact button presentation remains a
design detail.

**PRD-22 — Output download.** **Confirmed.** Let the user download the STEP output
for a chosen revision. Make the associated revision clear when presenting the
download. Asset cards can also offer downloads of their available files.

## Agent interaction

**PRD-23 — Streaming conversation.** **Confirmed.** Show responses progressively
and expose useful activity while the agent works, so the user can follow progress
within the conversation.

**PRD-24 — Interactive results.** **Confirmed.** Present useful interactive
components within chat to visualize results, navigate assets, or collect user
input. These may include forms with image references, dimension inputs, and open
questions as described in PRD-11. Return submitted input to the agent in the same
conversation. Activity, including useful status updates and summaries, supports
suitable collapse and expand behavior.

**PRD-25 — Progress and errors.** **Proposed.** Show generation progress and
errors in their conversational context. Preserve previous successful artifacts
when a generation attempt fails, so the user can continue from existing work.

## Access and scope

**PRD-34 — Multiple users.** **Confirmed.** Keep the product ready for multiple
users with private repair projects. Full account management is deferred for the
first implementation.

## Printing and remaining dependencies

**PRD-35 — Download endpoint.** **Confirmed.** End the current product flow with
downloading generated assets. Submitting a part to an external service for print
preparation, slicing, or printer operation is outside the current scope. Preserve
the future extension path described in PRD-45.

**PRD-36 — External demo logistics.** **Open.** If a physical print is arranged
for the demo, identify the Bambu Lab printer operator, the files they need, and
how the printing video and finished-part photo will be collected. This is
external demo preparation and does not block completion of the app's download
flow.

## First-build acceptance

**PRD-40 — Complete journey.** **Proposed.** The first implementation should
support a complete session from describing an object through capturing and
reviewing several photos, discussing a fix and its dimensions, generating a
model, submitting stored annotated feedback, and downloading a revised part.
Generation may use supplied details or the user's explicit request to proceed
with available knowledge. Include image attachment, input forms, retained chat
assets, normal chat turn controls under PRD-46, and a working hosted product.

**PRD-41 — Capture and generation check.** **Proposed.** Demonstrate capturing
multiple laptop camera images in one dialog using the on-screen control and
keyboard shortcut, deleting unwanted shots, and submitting retained images to
the agent. Demonstrate measurement requests and answers through conversation,
labeled images, and forms with image references. Generate a part with a
downloadable STEP file and an interactive preview of the same revision, both
when enough information is available and at the user's explicit request using
available knowledge.

**PRD-42 — Revision check.** **Proposed.** Demonstrate that drawing and text
feedback on a captured photo, draft, or model snapshot is submitted and stored
as an annotated image. The agent can later retrieve that image by its reference
and use the feedback to produce a changed part. Both design revisions remain
accessible through collapsible chat assets, and the user can download the
intended revision.

**PRD-43 — Physical demo check.** **Proposed.** Hand the selected output to the
printer operator outside the app if a physical demo is arranged, and demonstrate
the print using the evidence described in PRD-5. A physical fit check can follow
when the part and original object are together. This external demo activity is
separate from acceptance of the app's download flow. Courier delivery remains
the stretch outcome described in PRD-6.

## Future product capabilities

**PRD-44 — Missing measurements.** **Deferred.** Address a more formal product
workflow for missing or uncertain measurements later in the product's life.
For the current build, follow PRD-12: the user may ask the agent to proceed with
its best available knowledge.

**PRD-45 — Printing integration extension.** **Confirmed.** Leave room for a
future capability to submit a selected asset or part revision to an external
service for print preparation. Implementing that submission, selecting a provider,
and operating the printing workflow are outside the current build's scope.

## Chat controls and interface references

**PRD-46 — Turn controls and optional queuing.** **Confirmed.** Use normal chat
behavior: the user can stop current work and submit a new message, or wait until
the current turn finishes before sending another. Add queued messages if they
are straightforward to support. Queuing is optional for the first product build.

**PRD-47 — Annotation interface reference.** **Open.** The user has reference
images for a drawing and annotation tool. Review those references when designing
the image editor and its controls within the capture and feedback flows.

## Immediate capture milestone

**PRD-48 — Annotation downloads for evaluation.** **Confirmed.** The nearest
camera-feature goal is to collect images from the camera, files, or the web,
annotate them, and download the current annotated image directly from the editor
for use in an evaluation loop. Download includes unsaved marks and keeps the
editor open for further edits and downloads. Preserve the original image and
editable annotations. This local preparation flow can be used before the
connected design-generation workflow is available.

## Evaluation and continuity

**PRD-50 — Early evaluation results.** **Confirmed.** Show images, numerical
checks, interactive previews, or available exports as useful during design.
Images and checks must be available early for quick feedback without requiring
a STEP export on every iteration. Preserve useful intermediate results. The
final download outcome under PRD-5 still includes STEP.

**PRD-51 — Numerical verification.** **Confirmed.** Communicate computed geometric
measurements and aggregate or integral properties, such as dimensions, area,
volume, and center of volume. Associate results with their evaluated geometry,
units, requested criteria, and pass/fail or measurement status. Keep computed
evidence distinct from agent interpretation and estimated inputs. The initial
set of calculations can grow as modeling requires it.

**PRD-53 — Modeling continuity.** **Confirmed.** Keep modeling work connected to
the repair objective, submitted images and annotations, measurements, assumptions,
and the revision being changed. Present findings and clarification requests in
the same conversation so the user can follow and correct the design work.

**PRD-54 — Recoverable work.** **Confirmed.** Let the user return to a repair
with its conversation, submitted assets, and completed results intact. A restart
or interrupted operation must not erase that work. Make interrupted work visible
so the user can decide how to continue.
