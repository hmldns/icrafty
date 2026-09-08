# icrafty frontend

A local image collection and annotation workspace built with React, TypeScript,
Vite, and Tailwind. The debug tools live under `/debug`: `/debug` is the workshop
directory, `/debug/camera` is the capture and annotation workspace, and
`/debug/gallery` demonstrates the app's shared components. `/debug/models` opens
the STEP/STL viewer and connected snapshot/annotation workspace. The root `/` redirects
to `/debug` for now. Previous `/camera` and `/gallery` links redirect to their new
locations. Redirects replace the current history entry and retain query strings
and fragments. Existing local image collections remain available on the same origin.

`/debug/chat` shows a conversation with collapsible camera, image, and interactive
3D items projected from local tool records. Capture photos, rotate the model, and
attach chosen images to a local message. This [chat history mock](docs/chat-flow.md)
resets when you leave or refresh and does not send messages to an agent.

`/debug/agent` mounts the real [Codex chat integration](docs/agent-chat.md), with
saved session selection, streamed replies, image input, native image generation,
MCP image/camera cards, and download/reattach controls. Start the separate
[uv backend](../../agent/README.md) with `make agent-dev` from the repository root.

The operational debug pages use a compact shared header and bounded working
regions. Model-file tiles can sit beside, above or below one active viewer;
the placement is remembered in this browser. Camera actions and the mock-chat
composer stay near their working surfaces. See [debug workspace controls and
layout acceptance](docs/debug-workspaces.md).

The viewer groups icon tools for sections, scene aids and camera controls. A visible
**Sections: off/on** action activates cuts; **Planes** opens their settings. Toggle
world axes and a horizontal XY grid independently, with an always-present
bottom-right orientation widget for axis alignment, drag and keyboard rotation.
See the [orientation acceptance record](docs/viewer-orientation-validation.md).

The viewer has muted X/Y/Z section planes, pale cut-face fills and optional faint
diagonal hatching for closed meshes. New model annotations have contrasting
outlines. Select **Solid block + inner sphere demo** to inspect the caps and their
snapshot/annotation output. [Section behavior and limits](docs/viewer-usage.md)
explain the distinction from CAD geometry operations.

## Run

Use Node.js 22.12 or newer and npm. From `src/frontend/`:

```sh
npm ci
npm run dev
```

Development listens on `http://127.0.0.1:5187`. `npm run preview` serves the
production build on `http://127.0.0.1:4187`. Both commands require their assigned
ports to be free. This package also provides `make mf`, `make dev`, `make install`,
`make check`, `make typecheck`, `make build`, `make test`, and `make preview`.

## Validate

Install the matching headless Chromium before the first browser test run:

```sh
npm ci
npm run test:install
npm run typecheck
npm run build
npm test
npm run test:production
```

The browser installer needs network access. It downloads Chromium's headless
shell and FFmpeg into the ignored `playwright/.cache/` directory. On a minimal
Linux environment, install the OS libraries required by Playwright Chromium
before running tests. The suite starts and stops its own strict-port Vite server
on `127.0.0.1:5287`; it fails if that port is occupied. All camera tests use
Chromium's fake media devices. No physical camera is used by the tests.

Tests cover routes, gallery controls and modal focus, responsive layouts,
file/drop/paste and URL imports, validation failures, cancellation, camera
repetition/device switching/cleanup, deletion, annotation history and persistence,
storage failures, object URL cleanup, and downloads. Download tests decode PNG
bytes and assert original dimensions, marked pixels, unchanged source bytes,
distinct filenames, and an editor that stays open. The compact-viewport check
asserts that Download PNG is visible before scrolling to it.
The [image-save acceptance notes](docs/image-save-validation.md) record the
new-copy/update checks, decoded pixels, and retained screenshot evidence.

The viewer tests import real STEP and binary STL, inspect rendered pixels, exercise
views/sections, independent instances, source replacement, context-loss recovery,
snapshot provenance, annotation downloads, and gallery containment. The production
test requires a current build and starts preview on 4187. Override isolated ports
with `CRAFTY_TEST_PORT` and `CRAFTY_PREVIEW_PORT`; `PLAYWRIGHT_BROWSERS_PATH` can
point to an existing compatible browser installation. Defaults remain 5287/4187.

## Use the workspace

Add PNG, JPEG, or WebP images with the file picker, drop area, clipboard, or a
direct HTTP(S) image URL. A single import opens the editor immediately. Open the
camera and choose Start camera to grant access. Capture repeatedly with the
button or Space when focus is outside inputs and other controls. Stop or Close
camera releases its tracks; navigation does the same. Camera access requires a
secure context such as HTTPS or localhost.

The camera preview starts square. Use Aspect ratio to choose 1:1, 4:3, 3:4,
16:9, or 9:16. The preview and captured image use the same centered crop without
stretching; changing the ratio keeps the camera running. Preview size is bounded
to fit the screen. Captured images retain the selected shape when you annotate
or download them.

Draw with Pen, Arrow, or Rectangle, or enter a Text label and click to place it.
Text can also be placed from the keyboard with Place text in center. Colors,
stroke width, text size, fit, and zoom are available. Undo/redo use the buttons or
Ctrl/Command+Z and Ctrl/Command+Shift+Z. Shortcuts do not intercept text editing.
Clear marks is undoable.

Download PNG exports the current marks immediately, including marks that have
not been explicitly saved. Each download gets a distinct descriptive filename
and keeps the editor open without creating another gallery item.

**Save as new image** is the primary save action. It creates a separate image with
a distinct name and ID, then keeps the editor open on that copy. The working draft
moves to the copy; the source returns to its last saved marks. The copy retains
the original pixels, editable history, parent lineage, and any model/view metadata.
**Update this image** keeps the selected image identity and saves its current
appearance, retaining earlier saves for recovery. Neither action overwrites an
earlier saved PNG. Source & saved history lets you restore earlier marks or the
original pixels into an undoable draft.

Collection thumbnails show the last explicitly saved image, including its marks.
A **Draft changes** badge identifies further edits; drafts do not create extra
assets or alter saved thumbnails. Thumbnail decoding is limited to two concurrent
operations and 384 pixels on the longest side. Failed previews show an error
instead of silently displaying an unmarked original.

Each collection card also has a Download PNG button. It downloads the image with
its current draft marks, or the untouched image if there are no marks, without
opening the editor or saving another image. Downloads keep the source resolution
and get distinct filenames. Failed exports can be retried from the same card.

## Storage and limits

IndexedDB stores original blobs in `sources`, editable history in `drafts`, and
saved snapshots in `revisions`. Sources and revisions have stable UUIDs; every
draft and revision points to its source ID. The latest explicit save supplies the
current thumbnail. Existing v1 records remain readable without migration; old
revisions appear in saved history and the newest supplies the thumbnail. Original
bytes are never replaced or flattened into the editable source, so reopening a
copy does not draw its marks twice.
Draft edits persist automatically. The UI reports storage failures and still
allows downloading in-memory edits. Deleting an image deletes its draft and
all its saved history. Separately saved copies retain their own original pixels
and remain usable even after the parent is deleted. Each copy records parent and
root image IDs, plus its parent's saved version when available.

The camera/annotation workspace is independent of the live chat backend.
Its images are local to the browser profile **and origin**, including the port.
Browser data clearing, private-session closure, or storage eviction can remove
them; download important work. Live synchronization between tabs is not provided.
Keep one editing tab open for a given collection.

Limits are 12 MB per input, 16 megapixels, 8,192 pixels per side, 40 images including
copies, 20 saved versions per image, and 250 MB of original/saved PNG blobs. Copies
count their own original and saved PNG toward that budget. At the image limit,
Update this image remains available; at the saved-version limit, save a new copy
or download. A failed save leaves both the collection and previous saves intact.
Each image supports 300 marks, up to 2,048 points per pen stroke, and 30 undo steps. Editing
and export use a decoded still frame, including for animated PNG/WebP inputs.
The browser must be able to decode the image. URL imports require host CORS
permission, omit credentials, have a 20-second timeout, and enforce the byte
limit while reading the response. Files are checked by signature and decoding;
SVG and GIF are not accepted.

The frontend assumes modern browser support for IndexedDB, Canvas 2D,
`createImageBitmap`, native dialogs, and Pointer Events. Automated browser
validation targets Chromium. Serve `index.html` for frontend routes in production
so direct links and refresh work; Vite development and preview already do this.

## Structure

- `src/pages/`: route composition.
- `src/components/ui/`: typed shared primitives, icons, tabs, and dialogs.
- `src/features/camera/`: media lifecycle and capture controls.
- `src/features/images/`: intake, collection, validation, and local blob storage.
- `src/features/annotation/`: image-space geometry, drawing, history, and export.
- `src/features/models/`: independent Three.js renderer, import worker, views,
  sections, and debug gallery. See [embedding and behavior](docs/viewer-usage.md)
  and the [assignment brief](docs/model-viewer.md). [Validation results](docs/viewer-validation.md)
  record the worker's browser checks and limitations.
- `tooling/`: local model catalog, sample downloader, fixtures, standalone embedding
  example, and isolated test server. See [tooling commands and provenance](tooling/README.md).
- `src/styles/`: centralized tokens and reusable semantic styles, with Tailwind's
  Vite integration.

Package caches, browser binaries, test artifacts, and production output are
ignored locally and are not committed.
