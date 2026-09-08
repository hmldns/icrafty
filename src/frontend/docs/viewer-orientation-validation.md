# Section controls and orientation acceptance

Validated on 2026-09-08 from integrated baseline
`68d2b07285f34ec0eb35d21315ee7a1296104afc`, in the model-viewer worktree. This pass
adds the user's section activation, grouped icon tools, world axes/grid and corner
rotation widget. [Usage and snapshot treatment](viewer-usage.md) describe the
implemented behavior. Shared image saving and ACP behavior were not redesigned.

## Browser findings and layout

Before changing the page, Chromium inspection reproduced the discoverability
problem: **Sections** only opened a hidden panel. The initial STEP had no visible
enable control or activation state. The new leading **Sections: off/on (count)**
button creates the first cut or pauses/resumes the enabled subset. **Planes**
independently opens settings. Plane positions precede appearance options.

Inspected real STEP/STL rendering at 1280 × 720, 1366 × 768 and 390 × 844. All
three dock positions keep section activation, scene-aid toggles, fit, snapshot
and the entire corner widget in the initial viewport. Header dimensions remain
unchanged. Measurements below are CSS pixels, rounded; the side dock becomes a
horizontal strip on narrow screens.

| Viewport / placement | Previous canvas | Current canvas | Current canvas top | Widget bottom |
| --- | --- | --- | --- | --- |
| 1280 × 720 / side | 1054 × 381 | 1054 × 341 | 300 | 632 |
| 1280 × 720 / above | 1254 × 304 | 1254 × 304 | 337 | 632 |
| 1280 × 720 / below | 1254 × 304 | 1254 × 304 | 260 | 555 |
| 1366 × 768 / side | 1140 × 429 | 1140 × 389 | 300 | 680 |
| 1366 × 768 / above | 1340 × 352 | 1340 × 352 | 337 | 680 |
| 1366 × 768 / below | 1340 × 352 | 1340 × 352 | 260 | 603 |
| 390 × 844 / above | 364 × 388 | 364 × 340 | 483 | 815 |
| 390 × 844 / below | 364 × 388 | 364 × 340 | 406 | 738 |

The added helpers and visible activation cost one 40 px tool row in the desktop
side placement. The full-width above/below arrangements still fit their tools in
one row. Narrow screens use three rows and natural page scrolling, with bounded
section settings. The 112 px widget occupies about 12% of the narrow canvas area;
its axis buttons remain 26 px targets. Standard presets scroll horizontally when
needed; activation and helper toggles are outside that strip. No horizontal page
overflow was measured at the acceptance sizes.

Evidence retained locally under `src/frontend/tooling/.artifacts/` (ignored):

- `orientation-before-{1280,1366,390}.png`: integrated baseline inspection.
- `orientation/after-{1280,1366,390}-{side,top,bottom}.png`: all placements.
- `orientation/layout-{1280,1366,390}.json`: exact canvas/widget rectangles.
- `orientation/solid-{1280,1366,390}.png`: real parsed block STL, cut fills,
  hatching and supplemental inner sphere, with plane guides disabled for clarity.
- `orientation/embedded-transformed-stl.png`: standalone meter/Y-up STL converted
  to millimeter/Z-up, with no gallery dependency.
- `orientation/independent-after-peer-dispose.png`: surviving comparison viewer.
- `orientation/shared-annotation-updated.png`, `orientation/annotated-unsaved.png`:
  automated current-draft download and shared copy/update flow.
- `orientation/manual-1366-{section,rotated}.png`, `orientation/manual-annotation.png`,
  `orientation/manual-model-annotated.png`, `orientation/manual-reloaded-collection.png`:
  separate browser walkthrough on dev 5197; no page/console errors, two persisted
  images and the selected bottom dock after reload.

## Commands and results

Run from `src/frontend/`; the local Playwright browser cache was used. Commands
ran sequentially where they share test output directories.

```sh
npm run typecheck
npm run build
CRAFTY_TEST_PORT=5297 npm test -- 'tests/(annotation|camera(-framing)?|chat-flow(-projection)?|collection-download|debug-workspaces|image-(save|preview)|intake|lifecycle|model-(catalog|contrast|orientation|sections)|models|routes)\.spec\.ts'
CRAFTY_TEST_PORT=5297 npm test -- tests/models.spec.ts --grep 'route teardown releases'
CRAFTY_PREVIEW_PORT=4197 npm run test:production
git diff --check
```

- Typecheck and build passed; Vite built in 369 ms. Existing warnings remain:
  OCCT's dormant Node `path`/`crypto` branches are externalized and the lazy
  Three.js scene chunk is about 573 kB minified.
- Relevant frontend suite: **76 passed (1.4 min)**, including six new orientation
  cases. The separate ACP feature test file was intentionally excluded.
- Strengthened lifecycle regression: **1 passed (3.2 s)** after adding a live GPU
  buffer balance assertion. Model/axes/grid buffers and import workers return to
  zero on teardown, including stale-source replacement.
- Production: **1 passed (3.2 s)**. Loaded the real emitted STEP and STL demo,
  module worker and 7,604,031-byte WASM with `application/wasm`; exercised an axis
  click, grid toggle, visual sections and shared snapshot. Helper provenance
  matched visible state, and the corner UI was excluded.
- `git diff --check` passed.

New checks compare widget positions with the actual captured camera matrix after
canvas orbit, presets, axis click, keyboard activation, pointer drag, keyboard
rotation and projection changes. Real helper toggles alter pixels without moving
the camera or changing fit. The transformed STL verifies horizontal XY grid
placement/spacing in normalized units. Docking preserves camera, sections and
helper metadata; copy/update keeps source pixels and provenance immutable, and
reloaded current PNG bytes match the earlier download. Two instances retain
independent helper visibility, orientation, cameras and pixels after peer changes
and disposal.

Existing regressions cover STEP/STL parsing, view presets, orthographic projection,
sections/flip/remove, cap and hatch pixels/contrast, preserved through-holes,
gallery containment/reload/errors, stale loads/context loss, source transforms,
camera permission/cleanup, image intake, legacy records, annotations/history,
copy/update/thumbnail/export, and local mock-chat layout/submitted versions.
Geometry-only hole/cap tests now turn scene helpers off, so grid lines seen through
a hole are not classified as filled material. Native PNG versus compositor cap
counts allow 20% variation for thin hatch edges at smaller fractional CSS sizes;
the exact downloaded/reloaded PNG and metadata comparisons remain unchanged.

## Limits

Acceptance used Chromium with software WebGL and fake camera media. Physical GPU,
camera/touch hardware, Firefox/Safari and large assemblies were not tested. The
widget uses pointer events and native keyboard buttons; physical touch ergonomics
remain unverified. Very short/narrow windows retain normal accessible page
scrolling. Axes retain the true world origin and can be offscreen for distant
sources. Grid and visual cut fills remain display aids, not CAD measurements,
verified solids or exported cut geometry.

Dev 5197 remained isolated. Main 5187, ACP services and other workers' runtimes
were untouched; no CAD or separately owned ACP acceptance was repeated.
