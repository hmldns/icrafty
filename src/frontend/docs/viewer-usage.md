# Model viewer usage and embedding

`/debug/models` composes the reusable viewer with local folder discovery and the
same image collection/editor used by `/debug/camera`. The workshop at `/debug`
links to it. The supplied STEP fixture works in both development and production;
local file selection also works without the development relay. See the
[tooling guide](../tooling/README.md) for folder overrides and sample provenance.

## View and section controls

Drag to orbit, right-drag or Shift-drag to pan, scroll to zoom. One-finger touch
orbits; two fingers pan/zoom. Focusing the canvas enables arrow-key pan. Buttons
provide zoom and fit, front/back/left/right/top/bottom/isometric presets, and
perspective/orthographic projection. Presets refit the entire model. Front looks
from negative Y, right from positive X, top from positive Z. Source changes or
explicit reload reset the view and sections; changing a camera preserves sections.

Add up to one plane on each of X/Y/Z, then move it with the slider or numerical
millimeter position. Sliders span mesh bounds; numbers may go beyond them. Planes
stay in the viewer's world frame. Normally a plane keeps coordinates greater than
or equal to its position; Flip keeps the opposite half. Enable/disable preserves
the position; Remove deletes the plane. Multiple enabled planes keep their
intersecting visible region. Empty views after moving cuts past a part are valid.

Enabled planes have muted translucent guides. Cut faces use pale stone (X),
cool gray (Y), and lilac gray (Z), with a pale straw fill for the demo sphere.
These low-saturation fills reserve strong vermilion, blue and green for annotations.
**Show section planes** toggles the guides; **Fill cut faces** toggles the caps.
Both start enabled. Guides extend slightly beyond the part and follow the plane
position. They do not tint the cap itself. Flipping preserves the axis color.
Axis labels and numeric controls remain available without relying on color alone.

**Hatch solid sections** starts enabled and adds thin, faint, parallel lines at
45° in each section plane, following the conventional general section-drawing
treatment. Successive meshes alternate direction so the reference sphere and
enclosing body can be distinguished. Lines stay anchored in model coordinates
when orbiting, with spacing derived from the overall bounds; dense lines fade at
distant zoom levels to reduce moire. The toggle removes only the hatching, keeping
the fill and cut in place. It is disabled while **Fill cut faces** is off.
This is general visual hatching, with no inferred material designation or formal
drawing-standard certification. [Autodesk's section hatch controls](https://help.autodesk.com/cloudhelp/2022/ENU/AutoCAD-Core/files/GUID-04A5B55C-7A62-4C61-9ABA-DFB2C23322B5.htm)
describe the use of separate hatch angles for successive components.

Stencil caps fill cuts through closed, consistently wound triangle meshes. A
section through a hollow sleeve stays a ring: the cap preserves its through-hole.
This is a visual fill, not a CAD boolean or solidity check. Open, inconsistently
wound, intersecting or nonmanifold geometry can produce artifacts. Separate meshes
are capped independently; topology split across meshes cannot define a reliable
common interior. Very close or coplanar surfaces can show depth artifacts.
Disable **Fill cut faces** to inspect the uncapped mesh when needed. Capping adds
two mesh passes and a cap pass per enabled plane per mesh, so large assemblies
can cost substantially more to render. No large-assembly performance is claimed.

Choose **Solid block + inner sphere demo** in the gallery to inspect the effect.
It starts with X/Z cuts through a synthetic block and a gold sphere of radius
10 mm at its center. Moving the cuts through and beyond the sphere exposes its
colored cross-sections or removes it from view. This sphere is supplemental demo
geometry, explicitly identified in snapshots; it is not added to imported files.
The supplied STEP and the demo both work in production without the folder relay.

These visual sections produce no new solids, exact section curves, measurements,
or cut exports. Triangulation and faceting can be visible. Mesh bounds are framing
aids, not verified CAD evidence. This viewer has no CAD evaluator, FreeCAD
execution, GLB generation or backend connection.

## Reusable component

Import `ModelViewer` and the public types from `src/features/models/`. Import the
app stylesheet (or supply the component classes/tokens in a host design system).
Keep each `ModelSource` immutable and stable between renders; use `useMemo` when
constructing it from props. Replace the source object to load new bytes at the
same URL. Its data accepts a `File`, `Blob`, or browser-safe HTTP(S)/blob URL.

```tsx
const source = useMemo<ModelSource>(
  () => ({
    data: file,
    format: "step",
    identity: {
      id: artifact.id,
      name: file.name,
      revisionId: artifact.revisionId,
    },
    upAxis: "z",
  }),
  [file, artifact.id, artifact.revisionId],
);

<ModelViewer
  source={source}
  label="Part preview"
  onSnapshot={(snapshot) => consumeFrozenPng(snapshot.png, snapshot.provenance)}
/>;
```

`source={null}` is the empty state. `onSnapshot` is optional; without it no capture
button is shown. It may return a promise, and failures appear in the viewer.
`snapshotLabel` defaults to “Snapshot”; `snapshotDisabled` lets the host gate capture
while its destination loads. The renderer imports neither the gallery nor storage.
Its only image helper dependency is the shared PNG encoding utility, which does
not access IndexedDB. Every viewer owns its WebGL context, geometries/materials,
cameras, clipping state, controls and resize observer. No mutable model cache is
shared. Resources and pending import workers are released on replacement/unmount.

Optional `initialSections` accepts a stable array of section settings to apply
when loading a source. Optional `referenceObjects` accepts a stable array of
`ReferenceSphere` values (`kind: "sphere"`, human-readable `label`, `center`,
positive `radius`). Coordinates are viewer millimeters/Z-up. The reference objects
are rendered and sectioned with the source; source framing and position slider
bounds remain based on the imported model. Replacing either array reloads the
viewer. These props are used for the gallery demo; ordinary embeddings omit them.

For a runnable independent example, open `/tooling/embedding.html` in development.
It passes a Blob, deliberately declares meters/Y-up, supplies example provenance
IDs, and consumes the generic snapshot callback without using IndexedDB or the
gallery. The automated embedding test makes IndexedDB throw on access.

## Shared annotation flow

The application connects the callback directly to `ImageWorkspace`:

```tsx
<ImageWorkspace>
  {({ addImage, loading }) => (
    <ModelViewer
      source={source}
      snapshotLabel="Snapshot & annotate"
      snapshotDisabled={loading}
      onSnapshot={async (snapshot) =>
        addImage(await imageFromModelSnapshot(snapshot), true)
      }
    />
  )}
</ImageWorkspace>
```

The renderer renders and copies its pixels synchronously into a separate canvas
before asynchronous PNG encoding. Active visual sections and the background are
included; surrounding controls are excluded. Capture uses actual canvas pixels,
at device pixel ratio capped at 2. Camera movement or model replacement afterward
does not modify the PNG or copied context. The adapter validates that PNG through
`prepareImage`, adds an immutable original source with origin `model`, and opens
the existing `AnnotationEditor`. Camera intake uses this same `ImageWorkspace`.

Undo/redo, autosaved drafts, saved revisions, and current-unsaved-edit PNG download
remain the original editor implementations. Download keeps the editor open and
does not require a saved revision. Source pixels remain unchanged. Captures appear
as “Model snapshot” in the shared collection and remain available from the camera
route on the same origin. Existing v1 image records need no migration: `model`
metadata is optional, and the database/stores and original source origins remain
compatible. Snapshot imports use the same image/storage limits as camera images.

New annotations on model snapshots receive a thin contrasting outline: dark ink
around Paper/white, and Paper/white around the other palette colors. The existing
`drawMarks` function renders both the editor and PNG output. Each new mark stores
its outline color and width, so drafts, revisions, restore and unsaved download
keep the same appearance. The optional field preserves earlier marks as drawn;
camera/file/paste/web annotation defaults remain unchanged.

The default neutral cap colors exceed 3.5:1 contrast against Vermilion, Ink, Blue
and Green; actual hatched sleeve pixels are tested at a 3:1 minimum. Every default
annotation color has at least 4.5:1 contrast against its outline, including white.
Checks use the [W3C relative-luminance contrast calculation](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
These thresholds cover the default opaque colors; host token overrides and very
small marks at extreme zoom need separate review.

The optional model metadata includes source identity and supplied artifact,
revision/evaluation IDs, actual input SHA-256 and byte count, importer/tessellation,
unit/frame declarations, parser-to-viewer matrix, camera pose and projection
matrices/frustum, all section settings including guide/cap/hatch visibility, supplemental
reference objects when supplied, capture size and timestamp. Display/reference
fields are optional so earlier model snapshots remain readable. Local samples
do not invent backend IDs. Readable model/view/section/reference context appears in the
editor's source details. PNG downloads contain pixels; the full structured
provenance stays with the original source in the local collection, not embedded
in PNG metadata or exported as a CAD artifact.

## Import boundary and production assets

`importModel` fetches bounded bytes, transfers them to a dedicated module worker,
and returns an `ImportedModel` mesh DTO. Both OCCT STEP parsing and STL parsing run
off the main thread; hashing also runs in the worker. The worker is terminated on
completion, timeout, abort, context loss, or source replacement. Stale loads cannot
replace the current scene. Fetch and parsing share a 60-second deadline. The input
limit is 50 MiB and accepted meshes are limited to two million triangles; these
are spike guardrails, not a large-assembly memory/performance guarantee. OCCT's
native/WASM memory is released by worker termination; triangulation may allocate
memory before its resulting triangle count can be checked.

OCCT converts STEP file units to millimeters using its `linearUnit` setting. STEP
orientation defaults to declared Z-up; it is not inferred from a file's intended
presentation. STL is unitless: the gallery explicitly assumes millimeters/Z-up.
Embeddings may declare STL `mm`, `m`, or `inch`, and either format's `upAxis` may be
`y` or `z`. Y-up rotates +90° about X into the right-handed Z-up viewer frame.
STL units scale into millimeters; source locations are retained (camera framing
does not recenter geometry). The recorded column-major matrix acts on the parser
output, so STEP's internal file-unit conversion is recorded separately.

The adapter boundary is ready for a future GLB adapter that normalizes geometry
and records its units/frame transform. GLB is not currently accepted. The spike
renders imported meshes and their mesh colors; it does not preserve editable
BRep topology, per-face color presentation or assembly selection semantics.

Vite bundles `new Worker(new URL(..., import.meta.url), { type: "module" })` and
emits the OCCT WASM via `?url`. `locateFile` points to the emitted WASM, including
in production. No CDN or post-build manual copy is required. The model route is
lazy-loaded so camera pages do not fetch Three.js or OCCT. Serve JS modules, WASM
as `application/wasm`, and the emitted STEP asset on the same origin, plus the SPA
fallback for `/debug/models`. CSP deployments must allow same-origin workers and
WASM compilation; deployment-specific CSP is not tested by this spike.

Primary upstream references: [OCCT import API](https://github.com/kovacsv/occt-import-js),
[Three.js OrbitControls](https://threejs.org/docs/pages/OrbitControls.html),
[STLLoader](https://threejs.org/docs/pages/STLLoader.html),
[material clipping](https://threejs.org/docs/pages/Material.html),
[stencil section example](https://threejs.org/examples/webgl_clipping_stencil.html), and
[Vite workers](https://vite.dev/guide/features.html#web-workers).
