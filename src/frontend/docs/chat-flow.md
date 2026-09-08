# Chat history mock

Open `/debug/chat` from the workshop or the Chat link. The main surface is a
conversation: messages alternate with camera, image, model, and activity items.
Each tool item has a compact summary and an expandable body. **Collapse items**
and **Expand items** control the full history; each item also has its own toggle.
The composer stays below the scrolling history.

The initial conversation and tool records are local fixtures. The page does not
connect to an agent, implement ACP transport, or manage product sessions. **Send**
adds a message locally. Leaving the route or refreshing discards the rehearsal,
including newly captured photos and model snapshots.

## Try the interactions

- In the camera item, attach either illustrated photo. **Open camera** starts
  the floating camera in one explicit action. A capture appears in the history
  item and composer. Collapsing the card minimizes the live widget; Capture stays
  available. Drag its handle, or use arrow keys, and choose **Enlarge camera** or
  **Shrink camera** without restarting the stream. Close/Stop or leaving the
  route stops its tracks, including a late permission response.
- The image item shows a fixed annotated revision inline. **Attach image** keeps
  that exact version. **Versions & details**, a photo thumbnail, or **Photos** in
  the composer opens the secondary image picker.
- In the model item, drag to rotate, scroll to zoom, or use **Top**, **Side**, and
  **Reset view** from the keyboard. **Attach this view** captures the actual
  displayed view as a new image. Later rotations do not change that snapshot.
  Collapsing the item disposes its renderer; reopening starts from the initial view.
- Remove queued images with their labeled buttons. Send text, images, or both.
  Enter sends; Shift+Enter inserts a newline. Empty messages are disabled.
  Earlier messages keep their exact image versions, even when a working selection
  changes. Selecting the same version twice does not duplicate it in one message.
- **Tool details** reveals the record's name, status, input, and result. This is
  secondary inspection; the ordinary item body is the useful domain view.

Image selection is a dialog with keyboard focus management. The original photo,
annotated replacement, independent saved copy, and model snapshot remain available
there. Mug rim v2 replaces the current image within its asset, while its original
v1 remains available. Rim study is a separate asset copied from Mug rim v2 and has
its own v1. This lineage does not retarget images already attached to messages.

## Component and data model

`ChatDebugPage` supplies local records and a resource catalog to `ChatFlow`.
`projectHistory` converts `HistoryRecord[]` into typed `HistoryItem[]`. Message
records pass through; tool records are projected using an explicit tool-name map:

- `camera.capture` → camera item with photo references and capture actions.
- `images.show` → an image item with a specific asset/version reference.
- `models.show` → a model item referring to a catalog model.
- Unknown tools, missing resources, and invalid results → a generic activity item.

The small `ToolCallRecord` is a presentation boundary for a future adapter, not
an ACP wire contract. Input and output remain separate. Projectors read output
objects, JSON output strings, or an object under `structuredContent`. They do not
invent missing results from input arguments. Repeated tool-call IDs replace the
item at its original position, preserving identity through status/result updates.
A future transport adapter can supply normalized records without changing the
history or domain components.

`ChatHistory` receives an `ItemRendererResolver`. It owns order, scrolling, and
expansion. Each concrete item co-exports a typed renderer entry; `itemRegistry.ts`
composes the entries. The common `InteractionItemFrame` owns disclosure and tool
metadata. Adding a new item means adding a projector and renderer entry, without
adding a domain switch to the history shell. Unknown results remain visible.

`useChatFlow` handles local UI commands and keeps assets, record updates, draft
attachments, and submitted messages in memory. `PhotoAttachment` captures identity
and display values for one version; rendering a submitted image never follows an
asset's current-version pointer. Captures and snapshots use owned blob URLs, which
remain valid across item collapse and are revoked when the surface unmounts.

The conversation-owned camera widget reuses `useCamera` and `CameraView`, the
same capture and framing implementation used by `CameraPanel`. The compact model view reuses
`ModelScene` and `importModel`; it owns and disposes its canvas, import operation,
and renderer. Shared camera/model/image contracts and persistence are unchanged.

## Fixtures and limits

The SVG photos and annotation marks are deterministic illustrations. The 82 mm
label is illustrative, not a verified measurement. `mug-cap-concept.stl` is a
small deterministic revolved display mesh, not a CAD evaluation or fit-checked
part. There are no external image services or dependencies on a CAD service.
New camera photos and model snapshots are real browser outputs, kept only in memory.

Validation targets Chromium with fake camera devices. Typecheck/build and the
focused suite run from `src/frontend/`:

```sh
npm run typecheck
npm run build
CRAFTY_TEST_PORT=5307 npm test -- tests/chat-flow.spec.ts tests/chat-flow-projection.spec.ts tests/routes.spec.ts
```

Set `PLAYWRIGHT_BROWSERS_PATH` to a compatible project-local cache as needed.
Tests cover projection/update identity and fallback, collapse/expand, camera
permission/capture/cleanup, rotating 3D and fixed snapshots, exact-version message
attachments, copy lineage, local reset, keyboard focus, and 390/320 px layouts.
Screenshots and browser artifacts remain in ignored frontend output directories.
