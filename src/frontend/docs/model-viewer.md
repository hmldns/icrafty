# Reusable model viewer spike

Implementation: [usage and embedding](viewer-usage.md), [local tooling and sample
provenance](../tooling/README.md). The numbered brief below remains the assignment
scope; the implementation guide records supported behavior and limits.

This implementation brief records the viewer assignment and unresolved product
choices. Canonical product behavior remains in [PRD](../../../docs/PRD.md)
PRD-14–18, PRD-20, PRD-48, and PRD-50–54. Technical context is
[TRD](../../../docs/TRD.md) TRD-3, TRD-14, TRD-17, and TRD-26, and the review draft
[CAD contract](../../../docs/M-CAD.md) M-CAD-7, M-CAD-9, and M-CAD-13.
Those documents describe planned CAD services; this spike must work before those
services exist. See the [development role](../../../workflow/roles/model-viewer.md).

## Requested behavior

M-VIEWER-1. Build a reusable React component for STEP and STL viewing. A dedicated
debug route composes it into a model gallery and the root directory links to that
route. The component must accept a supplied source independently of the route,
local folder service, and application persistence. Keep its public interface
typed and document an embedding example.

M-VIEWER-2. Support orbit, pan, zoom, fit, and switching standard views. For the
initial implementation, use front, back, left, right, top, bottom, and isometric
presets plus perspective/orthographic projection. These controls are the assumed
meaning of "swapping views" and can be refined after the spike is exercised.

M-VIEWER-3. Support adding, positioning, flipping, disabling, and removing visual
section planes. Begin with independent X/Y/Z planes and usable position controls;
keep planes stable when changing the camera. The working assumption is rendered
cuts, not computing or exporting new CAD solids or exact section geometry.
Describe any open surfaces or other rendering limits honestly. Additional CAD
operations need a separate evaluator contract.

M-VIEWER-4. A snapshot freezes the current 3D rendering, including active cuts,
and opens the existing annotation editor. It uses the same draft, undo/redo,
revision saving, and current-edit PNG download flow as camera/imported images.
Download remains available during annotation and leaves the editor open. Capture
input differs; annotation and export behavior are shared implementations.

M-VIEWER-5. Store an immutable original snapshot with source-model identity,
content digest, declared units/orientation and any normalization, camera pose and
projection, section settings, and image dimensions. Preserve optional artifact,
revision, and evaluation identifiers when supplied; local samples must not invent
backend identities. Later camera movement, source replacement, or editing must
not change the frozen image or its provenance. Existing stored images remain
readable. Show a correct model-snapshot source label in the shared collection.

## Component and tooling boundaries

M-VIEWER-6. Source inputs should support application-provided files/blobs and
browser-safe URLs with an explicit format and source identity. Keep import
adapters separate from rendering. STEP parsing must not lock the main thread;
handle malformed files, stale asynchronous loads, and resource disposal. Each
mounted viewer owns its camera, sections, materials, and controls independently.
Expose a snapshot callback so embedding applications choose their storage/editor.

M-VIEWER-7. The CAD contract uses millimeters in a right-handed Z-up frame; its
proposed GLB preview uses meters/Y-up with an explicit transform. Direct STEP/STL
loading is a development convenience in this spike. Declare STL unit/orientation
assumptions and record normalization instead of silently conflating these frames.
Design the import boundary for future GLB previews; generating GLB or implementing
the CAD evaluator is outside this assignment. Mesh bounds are not verified CAD
measurements.

M-VIEWER-8. Keep the temporary file catalog/relay in `src/frontend/tooling/`,
preferably as same-origin Vite development middleware. Configure an explicit
local root when starting the server; default to `tooling/models` in this frontend
package. The debug gallery lists supported files in that root, selects a model,
and refreshes/reloads changed content. Folder browsing is a gallery concern,
not a dependency of the reusable viewer. An arbitrary browser-supplied host path
or unrestricted URL proxy is unnecessary. Resolve paths within the configured
root, including symlink/traversal handling, and bound loading failures.

M-VIEWER-9. Find and download one real STEP sample. Record its upstream source,
license/attribution, pinned version, and digest next to a reproducible download
command. Keep sample tooling and fixtures inside the frontend. Python scripts
use uv with inline dependency metadata. The gallery must explain when its local
development relay is unavailable; the reusable component still works with a
supplied model in a production build.

M-VIEWER-10. Reuse the design system and central style classes. Keep route,
rendering lifecycle, import, controls, capture, and gallery discovery understandable
as separate components/hooks/helpers. Extract shared image-workspace orchestration
if needed; do not duplicate `AnnotationEditor`, history, persistence, or PNG export.

## Acceptance and open decisions

M-VIEWER-11. The builder validates real STEP and STL import, view changes, moved
sections, independent component instances, capture pixels and provenance,
annotation of a frozen snapshot, downloading unsaved edits, saved/reloaded image
lineage, source replacement, and actionable loading errors. Run the existing
camera/annotation regressions, type checking, and production build. Check the
production import/WASM path as well as the development route. Report commands,
results, and any untested capability through the workflow inbox.

M-VIEWER-12. Working defaults awaiting product refinement are visual sections,
standard camera presets, and the frontend-local sample folder. The user has
explicitly required connection to the existing annotation process in this spike.
Persisted gallery preferences, large assembly performance targets, exact cut
exports, CAD measurements, and production asset delivery remain outside this
initial scope. Report discovered gaps rather than quietly claiming those features.
