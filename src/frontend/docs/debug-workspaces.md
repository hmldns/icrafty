# Debug workspaces

`/debug/models`, `/debug/camera` and the local mock `/debug/chat` share a compact
header. **About this workspace** holds explanations. Help closes on Escape or
when focus/click moves outside, and Escape returns focus to the disclosure.
The workshop directory and UI-elements gallery keep their normal document layout.

On wide screens, working regions fill the available viewport. Long file lists,
section settings, image collections and conversation history scroll in their own
regions. Narrow screens retain normal page scrolling; the camera moves before
intake when opened, while the chat composer remains below its bounded history.
Text and controls retain the existing design tokens and button primitives.

## Models

**Tile placement** selects **Beside viewer**, **Above viewer**, or **Below viewer**.
Wide screens default to beside; narrow screens default to above. The last choice
is stored under `crafty:model-tile-placement` in localStorage on this origin.
If storage is unavailable the selection works for the current session. A side
dock becomes a horizontal strip below 901 px; the saved choice remains intact.

Tiles are model-file selectors around one active stage. Click, Enter or Space
selects a file. Tab moves through them and scrolls focused tiles into view. Each
tile exposes its full filename, selected state and load/error status without
depending on color. The bundled STEP is labeled as supplied to distinguish it
from a same-named file in the local folder.

Opening a model generates one actual 192 × 128 PNG from its initial rendered
view. Unopened files use a format/filename fallback labeled **Not previewed**.
There is no background parser or renderer per tile. The gallery retains at most
24 previews; replacement, refresh, eviction and unmount revoke their object URLs.
These previews are temporary and distinct from the shared image collection.

The dock moves through CSS grid areas. The active viewer stays mounted; its source,
camera pose, zoom, materials and section settings remain unchanged. The projection
aspect and capture dimensions follow the space available to the canvas. Selecting
a different source or choosing **Refresh & reload** explicitly reloads/reset the
model, as before. Gallery tools retains the independent two-viewer comparison.

View presets, fit, zoom, projection, **Sections** and **Snapshot & annotate** stay
beside the stage. Narrow toolbars scroll horizontally. The section panel scrolls
independently on desktop; on narrow screens it appears below the canvas with a
bounded height. Closing the panel preserves its applied cuts, fills and hatching.

Snapshots enter the existing annotation editor immediately. **Image collection**
opens the same collection in a drawer, without changing the canvas size. It focuses
the first image action; Escape returns to the collection button. Capture, editor,
save/download and persisted image semantics are owned by the shared image feature.
This layout change adds no alternate editor, save behavior, storage schema or chat
protocol. See [viewer usage and embedding](viewer-usage.md).

## Acceptance evidence

Baseline: `5da16dfc0c010f1f51cfe3b91d1ee07a3f98dcdd`. Browser review used the isolated
worktree dev server at `127.0.0.1:5197`, with fresh contexts at 1280 × 720,
1366 × 768 and 390 × 844. The baseline and final pages were actually rendered,
measured and visually inspected. These rounded measurements use CSS pixels:

| Viewport | Model canvas start, before → after | Visible model height, before → after | Chat history height, before → after |
| --- | --- | --- | --- |
| 1280 × 720 | 680 → 260 | 40 → 381 | 304 → 433 |
| 1366 × 768 | 680 → 260 | 88 → 429 | 352 → 481 |
| 390 × 844 | 1029 → 443 | 0 → 388 | 432 → 503 |

Desktop rows use the default side dock; the narrow row uses the default above
strip. Above/below placements retain 304 px of visible model height at 1280 × 720,
and 352 px at 1366 × 768. Desktop pages have no document overflow at those sizes,
including after repeated camera captures. Live-camera capture controls end around
y=667 / 715 / 634 respectively, inside each viewport. Camera intake starts near
y=93 on desktop instead of y=295. The chat composer and model snapshot/section
actions are visible without scrolling past introductions.

Ignored local evidence lives under `src/frontend/tooling/.artifacts/` in this
worker checkout:

- `layout-before-{models,camera,chat}-{1280,1366,390}.png`: baseline page screenshots.
- `layout-after-models-{1280,1366,390}-{side,top,bottom}.png`: all dock placements.
- `layout-after-{camera,camera-live,chat,sections}-{1280,1366,390}.png`: operational
  surfaces, repeated fake-camera captures, and section settings.
- `layout-after-{1280,1366,390}.json`: full region/document measurements.
- `layout-manual-sections-bottom.png`, `layout-manual-annotation.png`,
  `layout-manual-image-drawer.png`: manual section, annotation and drawer review.
- `layout-manual-section-annotated.png`: PNG actually downloaded during review.
- `layout-manual-drop.png`: a real STL dropped onto the workbench, loaded with
  20 triangles and its generated file tile preview.

The five focused browser tests in `tests/debug-workspaces.spec.ts` cover all
placements and saved preference, visible primary actions, viewport bounds,
keyboard tile selection/scrolling/focus, disclosures, repeated camera captures
and cleanup, mock-chat history/composer, and real preview/error/reload behavior.
They load 26 real binary STL sources, assert a single canvas and at most 24 preview
images, and verify all generated URLs are revoked on navigation. A separate test
compares the same canvas node, worker start count, source digest, camera world
matrix/pose/zoom and sections across docking changes. Its original snapshot and
unsaved annotations survive reload, with a byte-identical PNG download.

The existing renderer tests continue to exercise the real STEP, STL views,
section colors/hatching/holes, independent instances, stale imports, context loss,
snapshot provenance, immutable image pixels and PNG annotations. Native snapshot
pixels and CSS screenshots differ slightly at fractional canvas edges; visual
comparison samples inside the border and allows rasterization tolerance. Exact
PNG/editor/reload checks still compare pixels or bytes directly.

Run the full suite and production suite sequentially because both use the default
Playwright artifact directory:

```sh
npm run typecheck
npm run build
CRAFTY_TEST_PORT=5297 npm test
CRAFTY_PREVIEW_PORT=4197 npm run test:production
```

Final results: typecheck passed; production build passed (Vite 430 ms); full suite
**60 passed (1.0m)**; production suite **1 passed (4.2s)**. The focused five-test
layout suite also passed independently in 20.3s. Build output retains the known
large Three.js chunk warning and OCCT's dormant Node `path`/`crypto`
externalization warnings.

The production test imports the supplied STEP, emitted module worker and 7.6 MB
WASM, then exercises sections and shared snapshot capture without a folder relay.
The final manual review produced no browser errors or warnings. Browser coverage
is Chromium with software WebGL and fake camera media; physical cameras, touch
hardware, Firefox/Safari and large assemblies were not tested. Visual caps retain
the [documented mesh/topology limits](viewer-usage.md).

During editing, Vite twice cached intermediate file content (a newly added CSS
import and a TSX file being formatted). Restarting only this worker's dev server
cleared it; fresh test/production servers loaded correctly. An overlapping test
invocation deleted another suite's trace files, so the final full suite was rerun
alone. No main runtime or other worker checkout was changed.
