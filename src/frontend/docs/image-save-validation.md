# Image saves and thumbnail acceptance

Validated in Chromium on Linux, 2026-09-08, using the isolated strict-port server
at `127.0.0.1:5287`. Tests used fake media only. The first reproduction was an
actual STEP snapshot from `/debug/models`: its saved PNG had 3,932 red annotation
pixels, while its collection thumbnail had none.

Save as new image now creates and selects a distinct editable image. Update this
image preserves its identity and appends immutable saved history. Collection
thumbnails show the saved PNG; separately labelled draft changes remain available
in the editor and immediate downloads. Original pixels remain separate from marks.

## Commands and results

Run from `src/frontend/`, after the browser installation described in the README:

```sh
npm ci
make check build
npm test -- tests/image-save.spec.ts tests/image-preview.spec.ts
```

The locked install passed with zero reported vulnerabilities. Typecheck and
production build passed. The 10 focused save/preview tests passed in 14.4 seconds.
The build retained existing OCCT `path`/`crypto` browser-externalization and model
renderer chunk-size warnings.

The selected regression run passed **54/54 tests in 44.4 seconds**:

```sh
npm test -- \
  tests/annotation.spec.ts tests/collection-download.spec.ts \
  tests/image-save.spec.ts tests/image-preview.spec.ts tests/intake.spec.ts \
  tests/camera.spec.ts tests/camera-framing.spec.ts tests/lifecycle.spec.ts \
  tests/routes.spec.ts tests/model-contrast.spec.ts tests/chat-flow.spec.ts \
  tests/chat-flow-projection.spec.ts tests/models.spec.ts \
  --grep '^(?!.*real STEP and STL render|.*independent section planes|.*two viewers keep|.*catalog rejects|.*local model|.*context loss cancels|.*delayed replaced source|.*model gallery remains|.*standalone Blob embedding).*'
```

Coverage includes actual editor save buttons and collection downloads, pen/text
editing, undo/redo, original recovery, saved history, IndexedDB reload, distinct
copy IDs/names, parent saved-state preservation, model/view provenance, and
deleting a parent while its copy remains usable. The model contrast regression
retains persisted outlines for every annotation color. Existing mock-chat tests
verify that submitted originals keep their exact image-version references.

Failure checks force storage errors after writes have begun and verify atomic
rollback, unchanged drafts/saves, no phantom cards, and successful retry. Repeated
clicks during a pending save create only one image. Tests also cover legacy v1
records, the 40-image and 20-save limits, failed thumbnails, stale preview results,
and release of pending bitmap resources. Thumbnail work is limited to two decodes
at once and 384 pixels on the longest side. Existing import validation, camera
capture/cleanup, download cancellation, object URL cleanup, routes, and gallery
controls pass their regressions.

## Pixel and visual evidence

The STEP copy exports at **1,134 × 560** pixels. Its source has zero red pixels;
the annotated copy has 8,830. The saved thumbnail has 859 red pixels at 384 × 190.
After an update and reload it still visibly contains the annotations. Full pixel
digests match the intended current export after reopening, including unsaved
edits, and original recovery matches the unmarked source. The imported-image case
exports at 800 × 600, checks pen and text pixels, and proves that undo removes
editable text without leaving baked marks underneath.

Representative screenshots were inspected at desktop, 390px and 320px widths.
All three editor actions remain visible at the compact widths. Evidence is
retained locally in the ignored `tooling/.artifacts/image-save/` directory:

- `before-model-thumbnail.png` and `before.json`: STEP reproduction.
- `model-new-copy.png`: visibly annotated copy beside the untouched source.
- `model-updated-reloaded.png`: current saved thumbnail after update and reload.
- `import-parent-and-copy.png`: existing saved import and a separately marked copy.
- `model-copy-editor.png`: reopened editable model snapshot.
- `image-actions-390.png` and `image-actions-320.png`: compact editor actions.
- `model-pixels.json`: dimensions, pixel counts, digests, and source/copy IDs.

## Boundaries

The shared image workspace remains browser-local. Existing v1 storage needs no
migration. Copies retain their own original bytes and count toward the existing
250 MB blob budget. Same-image saves stop at 20 history entries; a new copy or PNG
download remains available within the collection/storage limits. Editing one
collection in multiple tabs is not synchronized; the README advises one editing
tab. Automated acceptance used Chromium; native macOS, Safari, and physical
cameras were not exercised in this assignment. Main runtime 5187 was untouched.
