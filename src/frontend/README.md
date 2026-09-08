# icrafty frontend

A local image collection and annotation workspace built with React, TypeScript,
Vite, and Tailwind. The debug tools live under `/debug`: `/debug` is the workshop
directory, `/debug/camera` is the capture and annotation workspace, and
`/debug/gallery` demonstrates the app's shared components. `/debug/models` opens
the STEP/STL viewer and connected snapshot/annotation workspace. The root `/` redirects
to `/debug` for now. Previous `/camera` and `/gallery` links redirect to their new
locations. Redirects replace the current history entry and retain query strings
and fragments. Existing local image collections remain available on the same origin.

`/debug/chat` rehearses a conversation with fixed camera history, asset revisions,
and a removable attachment strip. Choose a version and add a local mock input;
earlier inputs keep their chosen images. This [chat flow mock](docs/chat-flow.md)
resets when you leave or refresh and does not send messages to an agent.

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
not been saved as a revision. Each download gets a distinct descriptive filename
and keeps the editor open. Save revision creates a separate snapshot containing
editable marks and flattened PNG bytes. Saved marks can be restored without
changing the original; restoration is also undoable.

## Storage and limits

IndexedDB stores original blobs in `sources`, editable history in `drafts`, and
saved snapshots in `revisions`. Sources and revisions have stable UUIDs; every
draft and revision points to its source ID. Original bytes are never replaced.
Draft edits persist automatically. The UI reports storage failures and still
allows downloading in-memory edits. Deleting an image deletes its draft and
all revisions.

This spike has no backend, accounts, chat, agent transfer, or CAD evaluator.
Images are local to the browser profile **and origin**, including the port.
Browser data clearing, private-session closure, or storage eviction can remove
them; download important work. Live synchronization between tabs is not provided.
Keep one editing tab open for a given collection.

Limits are 12 MB per input, 16 megapixels, 8,192 pixels per side, 40 source images,
20 saved revisions per source, and 250 MB of original/revision blobs. Each image
supports 300 marks, up to 2,048 points per pen stroke, and 30 undo steps. Editing
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
