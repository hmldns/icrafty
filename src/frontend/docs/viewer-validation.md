# Model viewer validation

Worker validation on 2026-09-08, Linux, Node 25.0.0, Playwright 1.63.0 and its
Chromium headless shell 153.0.8010.12 (revision 1243). Commands ran from
`src/frontend/` in the isolated model-viewer worktree. Browser binaries and caches
were installed only inside this frontend package. The director's server on 5187
was not changed or stopped.

| Command | Final result |
| --- | --- |
| `npm ci --cache .npm-cache --offline --ignore-scripts` | Passed; lockfile installs 59 packages, audit reported no vulnerabilities. |
| `npm run sample:download` | Passed; uv/PEP 723 downloader verified the pinned STEP and license SHA-256 digests before replacement. |
| `node tooling/generate-stl.mjs` | Passed; generated binary STL fixtures: bracket (20 triangles), solid block (12), hollow sleeve (768). |
| `npm run typecheck` | Passed. |
| `npm run build` | Passed; Vite emitted STEP, STL demo, module worker and WASM assets. Final Vite build phase 508 ms. |
| `CRAFTY_TEST_PORT=5297 npm test` | **39 passed in 31.1 s**: all 26 existing camera/annotation/intake/route regressions plus 13 model/catalog/embedding checks. |
| `CRAFTY_PREVIEW_PORT=4197 npm run test:production` | **1 passed in 2.8 s** against the final production bundle. |
| `git diff --cached --check` | Passed; `.gitattributes` preserves the pinned upstream STEP's intentional trailing whitespace and exact bytes. |

The real STEP fixture is 20,532 bytes, SHA-256
`370c5474e50dc94923f0dacb5113f7258233601620ab530d937c18571869d49e`.
OCCT imports one mesh with 98 vertices and 84 triangles at the configured
tessellation. The binary STL fixture has SHA-256
`765a174c7934823a8fe47147fc9ae1390c7ab3747ed86356420bc998c1635041`.

The new checks cover visible model pixels; every standard view; orbit, keyboard
pan, zoom, fit and projection; independent X/Y/Z plane positions, flip, enable,
remove and camera stability; keyboard entry of negative/fractional positions;
independent cameras/materials/sections and surviving peer teardown; cancelled
workers and GPU buffer cleanup; stale source replacement and malformed files;
context loss during an actual pending WASM load followed by retry; catalog
traversal/symlink containment, errors, discovery and changed-byte reload; narrow
layout; and a standalone Blob embedding with gallery requests blocked and
IndexedDB configured to throw on access. The embedding checks meters/Y-up
normalization and preservation of explicitly supplied artifact/revision/evaluation
IDs.

The snapshot test compares actual rendered foreground with the frozen PNG, then
checks current unsaved annotation pixels in a downloaded PNG. It saves and reloads
a revision, restores original pixels through undo/download, and confirms unchanged
original bytes and provenance after camera movement and source replacement.
Compositor crop borders are excluded from foreground counts; original and
downloaded PNG digests are compared exactly when dimensions/pixels should match.
These tests use the real parsers and real WebGL output, not parser mocks.

Production verification asserts successful emitted STEP/worker requests, loads
the emitted 7,604,031-byte WASM with `application/wasm`, renders nonblank geometry,
applies a section and captures it through the existing annotation flow. The local
folder relay is absent in preview and the gallery explains that condition. The
production check also requests the emitted solid-block STL and verifies actual
axis-colored cap and sphere pixels. This caught and fixed Vite's initial inlining
of the small STL as a data URL; its import now explicitly uses `?url&no-inline`.
The full suite result above includes this packaging correction and the stale
capture guard for changes to supplied initial sections/reference objects.

The two added section tests inspect colored X/Y/Z caps, translucent guide
visibility, cap enable/disable, the sphere disappearing when planes pass beyond
it, all three simultaneous cuts, and an annular cap retaining its real center
hole from both flipped views. The demo snapshot test compares rendered/frozen
axis and reference colors, asserts reference-sphere geometry and display settings
in provenance, inspects readable editor context, downloads unsaved annotations,
and verifies immutable source bytes/context after section changes and reload.
The independent-viewer regression now also verifies that caps and guides remain
enabled in the second viewer after the first changes settings, and that its caps
still render after the first viewer is disposed.

Manual browser review used dev port 5197 at 780 px and 1280 px widths. It inspected
the real rounded STEP block, moved/flipped X/Z cuts in the STL bracket, and placed
a text annotation on its frozen image in the shared editor. The final review had
no browser console errors or warnings. Local screenshots are retained, ignored,
under `tooling/.artifacts/viewer-step.png`, `viewer-sections.png`, and
`viewer-annotation.png`. Automated narrow-view checks use 390 px; the inherited
camera framing checks also cover 320 px.

The section follow-up was reviewed at 1280 × 1050 on port 5197. Screenshots under
`tooling/.artifacts/` include `capped-demo-guides.png`, `capped-demo.png`,
`uncapped-demo.png`, `capped-sleeve.png`, and `capped-demo-annotation.png`.
This review compared filled/uncapped interiors and checked the shared editor.
A running Vite dev process briefly cached an empty transformed module while the
formatter rewrote TSX files; restarting only the worktree's 5197 process cleared
it. Fresh development and production checks passed. The final browser review
had no console errors or warnings.

During implementation, browser review caught a StrictMode cleanup/replay issue
from reusing a forcibly lost canvas; each renderer setup now gets a fresh canvas.
The context-loss handler also aborts pending imports, preventing late completion
from marking a disposed scene ready. Final regression checks cover both paths.

Known limits: automated graphics use Chromium software WebGL. Physical GPU/driver
combinations, Firefox/Safari, touch hardware and large assemblies were not tested.
Cuts now have optional stencil caps; these assume closed, consistently wound
meshes and cannot establish CAD solidity. Open/nonmanifold meshes, topology split
across meshes, coplanar surfaces and complex intersecting assemblies can show
artifacts. No cut-solid export or verified CAD measurements are implemented.
Production reports the expected Vite chunk-size
warning for the lazy Three.js viewer (~581 kB minified), and externalization
warnings for dormant Node `path`/`crypto` branches in the upstream OCCT loader.
Those warnings did not prevent the production browser import; they are not
suppressed. WASM download size is ~7.6 MB (~3.1 MB gzip). No large-model latency,
memory ceiling, exact topology preservation or CAD-evaluator capability is claimed.

See [usage and embedding](viewer-usage.md) and [tooling/provenance](../tooling/README.md).
