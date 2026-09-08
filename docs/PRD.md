# Crafty — Product Requirements

This inventory develops the original [IDEA.md](IDEA.md) and the product discussion.
Keep the original idea unchanged. Use each stable PRD identifier when discussing
or updating a requirement; do not renumber existing statements as the document grows.

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
conversation, with assets supplied through the MCP integration.

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
sketches or images with labels, and forms generated through MCP. A form may link
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

**PRD-20 — Artifact consistency.** **Proposed.** Associate each model preview,
FreeCAD source, and generated export with the same part revision. The preview and
download for a revision must describe the same generated geometry.

**PRD-21 — Replying to assets.** **Proposed.** An asset card may provide a reply
button that attaches the selected artifact to the next chat message. This lets
the user refer to an earlier revision directly. Ordinary follow-up messages can
continue the latest design by default. The exact button presentation remains a
design detail.

**PRD-22 — Output download.** **Confirmed.** Let the user download the STEP output
for a chosen revision. Make the associated revision clear when presenting the
download. Asset cards can also offer downloads of their available files.

## Agent interaction

**PRD-23 — Codex and ACP.** **Confirmed.** Connect the chat to Codex through the
requested ACP integration, with MCP tools available to the agent. Stream responses
and expose supported activity in the conversation.

**PRD-24 — MCP result components.** **Confirmed.** Render MCP tool calls and
results using useful interactive frontend components where they help visualize
results, navigate assets, or collect user input. These components may include
forms with image references, dimension inputs, and open questions as described
in PRD-11. Return submitted input to the agent in the same conversation. Exposed
ACP activity, including supported status and summary events, should support
suitable collapse and expand behavior.

**PRD-25 — Progress and errors.** **Proposed.** Show generation progress and
errors in their conversational context. Preserve previous successful artifacts
when a generation attempt fails, so the user can continue from existing work.

## Technical constraints

**PRD-26 — Python backend.** **Confirmed.** Use Python for the backend.

**PRD-27 — Python tooling.** **Confirmed.** Use `uv` for Python project setup,
dependency management, and running project commands.

**PRD-28 — FreeCAD output.** **Confirmed.** Generate FreeCAD Python declarative
part code and use FreeCAD to produce the STEP file. Provide an interactive browser
preview of the generated part.

**PRD-29 — FreeCAD service.** **Confirmed.** Run FreeCAD as an isolated service
with an API and memory constraints.

**PRD-30 — Frontend stack.** **Confirmed.** Use TypeScript, React, Vite, Tailwind,
and Three.js. Add a useful React binding for Three.js if needed.

**PRD-31 — Codex runtime.** **Confirmed.** Run Codex in a container with mounted
credentials and working directories while retaining streaming support. The user
will authorize Codex on the server.

**PRD-32 — Shared asset access.** **Confirmed.** Images and generated outputs must
be accessible as files to the agent and retrievable through the backend. Support
passing assets between the conversation and agent in both directions, including
stored annotated images. Agent-facing references must resolve to retrievable
file content. Account for retrieval across isolated services; an additional tool
to fetch or download an asset is a possible mechanism. S3 remains a possible
storage approach, not a settled dependency.

**PRD-33 — Deployment.** **Confirmed.** Deploy on DigitalOcean at the purchased
domain `icrafty.ai`, using Docker, Docker Compose, and Caddy.

**PRD-34 — Multiple users.** **Confirmed.** Keep the design ready for multiple
users. Full multiuser authorization is deferred for the first implementation.

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

**PRD-37 — Existing integration references.** **Open.** Obtain the user's
existing ACP/MCP chat implementation. Verify the integration adapter, event
handling, and reusable tool-result components before implementing those pieces.
The ACP feasibility plan should assess stopping active work, submitting the next
message, optional message queuing under PRD-46, and retrieving stored assets
across isolated services under PRD-32.

**PRD-38 — Sketch generation.** **Open.** Establish how Codex produces sketch
images and returns them through the MCP asset flow. The product requires visual
drafts; the generation mechanism has not been selected.

**PRD-39 — Asset implementation.** **Open.** Select the browser preview format,
asset storage approach, and download implementation while preserving shared
agent/backend access and consistency between model revisions and exports.

## First-build acceptance

**PRD-40 — Complete journey.** **Proposed.** The first implementation should
support a complete session from describing an object through capturing and
reviewing several photos, discussing a fix and its dimensions, generating a
model, submitting stored annotated feedback, and downloading a revised part.
Generation may use supplied details or the user's explicit request to proceed
with available knowledge. Include image attachment, MCP input forms, retained
chat assets, normal chat turn controls under PRD-46, and deployment in this scope.

**PRD-41 — Capture and generation check.** **Proposed.** Demonstrate capturing
multiple laptop camera images in one dialog using the on-screen control and
keyboard shortcut, deleting unwanted shots, and submitting retained images to
the agent. Demonstrate measurement requests and answers through conversation,
labeled images, and MCP forms with image references. Generate a part with a
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

**PRD-45 — Printing integration extension.** **Confirmed.** Keep the architecture
open to adding tools, such as an additional MCP integration, that can submit a
selected asset or part revision to an external service for print preparation.
Implementing that submission, selecting a provider, and operating the printing
workflow are outside the current build's scope.

## Chat controls and interface references

**PRD-46 — Turn controls and optional queuing.** **Confirmed.** Use normal chat
behavior: the user can stop current work and submit a new message, or wait until
the current turn finishes before sending another. Add queued messages if they
are straightforward to support through the ACP integration. Treat queuing as a
feasibility decision for the ACP plan, rather than a requirement for completing
the first product build.

**PRD-47 — Annotation interface reference.** **Open.** The user has reference
images for a drawing and annotation tool. Review those references when designing
the image editor and its controls within the capture and feedback flows.

## Immediate frontend milestone

**PRD-48 — Annotation downloads for evaluation.** **Confirmed.** The nearest
camera-feature goal is to collect images from the camera, files, or the web,
annotate them, and download the current annotated image directly from the editor
for use in an evaluation loop. Download includes unsaved marks and keeps the
editor open for further edits and downloads. Preserve the original image and
editable annotations. This local preparation flow can precede agent and backend
integration.
