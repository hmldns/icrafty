# M-CAD — File-based CAD evaluation

Review draft for the module in [cad/](../cad/README.md). Its boundary is:
**Python code file or ensured geometry + explicit request → result JSON +
requested artifact files and computed metrics.** Ensure geometry once, then
reuse its handle for further checks, views, and exports. The evaluator is not implemented
yet. The [core schematic](architecture/rendered/cad-contract.svg) shows this
contract; the [development schematic](architecture/rendered/cad-development.svg)
shows how to prove it.

This specifies the CAD part of [TRD-21–28 and TRD-37](TRD.md), supporting
[PRD-5, PRD-20, and PRD-50–51](PRD.md). **Confirmed** preserves agreed direction;
**Proposed** defines details for this review; **Open** identifies later selections.
Identifiers are local to this document and start at M-CAD-1. Transport and asset
publication are covered separately in the [CAD handoff protocol](architecture/CAD-PROTOCOL.md).

## Scope and deterministic behavior

**M-CAD-1 — Outcome.** **Confirmed.** Given a source file and an explicit request,
build geometry with FreeCAD and return requested views, measurements, checks, and
exports as local files and structured data. Images-only, metrics-only, and mixed
runs are valid. STEP is requested when needed; it is not a prerequisite for
rendering or verification.

**M-CAD-2 — Ownership.** **Confirmed.** The core executes, renders, measures, and
compares. The caller chooses the part, supplies dimensions and criteria, inspects
results, and decides whether to revise. Keep model reasoning, user questions,
agent sessions, MCP, chat, storage authorization, and publication outside the
evaluator. A local development runner and a future MCP adapter call the same core.

**M-CAD-3 — Repeatability.** **Proposed.** Freeze source bytes, declared inputs,
parameters, output/check requests, native runtime versions, and rendering settings.
Identical inputs under the same supported runtime must give equivalent geometry
and measurements within recorded numerical tolerances and repeatable views.
Source must not depend on ambient files, network, wall-clock time, or unseeded
randomness. Run IDs, timestamps, and incidental exporter metadata can differ;
byte-identical STEP files and cross-platform pixel identity are not acceptance
requirements. Record content digests for provenance separately from equivalence.

## File input and modeling contract

**M-CAD-4 — Local invocation.** **Proposed.** Implement
`python -m crafty_cad evaluate --request REQUEST.json --output OUTPUT_DIR`, launched
through uv as shown in the [package README](../cad/README.md). Resolve CLI paths
from the working directory. Reserve a new output directory, reject an existing
one, and run one evaluation without requiring a server. Return the path to
`result.json` on stdout and put progress/logging on stderr. A completed evaluation
returns exit code 0 even when requested criteria fail; failed/cancelled execution
returns 1, and invalid input or inability to create output returns 2. The JSON
report is authoritative for detailed outcomes. This command is planned, not
provided by the current scaffold.

**M-CAD-5 — Request file.** **Proposed.** Version 1 contains `schema_version: 1`,
exactly one of `source` (one self-contained Python file) or `geometry` (M-CAD-20),
`parameters` (JSON object, empty for a geometry-only request), `inputs`
(alias-to-relative-path object), `outputs` (array), and `metrics` (array). Resolve
source and input paths beneath the request's directory; reject absolute paths,
escapes, and undeclared file dependencies. Copy the declared bytes before execution.
Require unique IDs within each output/metric array, finite numeric values, and
known fields, kinds, units, and schema versions. Reject unsupported requests with
specific validation errors instead of silently omitting work. Empty output or
metric arrays are valid. See the concrete
[cylinder request](../cad/examples/cylinder/request.json).

**M-CAD-6 — Source entry point.** **Proposed.** Load the submitted file inside
FreeCAD's native Python runtime and call `build(parameters, inputs)` once. `inputs`
maps the declared aliases to staged local file paths. Return
`{"parts": {name: TopoShape}, "features": {part_name: {feature_name: subshape}}}`.
Require at least one nonempty named part; an empty features map is valid. Parts
are the complete shapes to evaluate, with their placements applied. Features
identify faces, edges, or other actual subshapes of those parts. Do not use GUI
selection, an active document, printed prose, or arbitrary script-written reports
to discover the result. The [source example](../cad/examples/cylinder/model.py)
shows the minimal entry point.

**M-CAD-7 — Selection and coordinates.** **Proposed.** A metric targets
`{"part": "cap"}` or `{"part": "cap", "feature": "bore"}`. Verify that each
feature belongs to its delivered part and is suitable for the requested method;
missing or ambiguous selections produce an unavailable result, not a guessed
measurement. Semantic names are supplied by the source and reviewed against the
task; they are not proof of intent. Preserve the resolved selection in the frozen
geometry manifest rather than carrying raw face indices across revisions. Use a
right-handed, Z-up world frame and millimeters internally; use `mm`, `mm^2`,
`mm^3`, and dimensionless `1` explicitly in reports. Convert imported geometry
with a recorded transform when its units/frame differ.

**M-CAD-8 — Frozen geometry.** **Proposed.** Retain the built geometry and resolved
feature map as a data-only native bundle, with per-part BRep files, a JSON manifest,
units, transforms, and digests. Render, measure, and export from this same bundle.
Do not serialize executable Python objects or rerun modeling code for every
output. Source, request, inputs, and native geometry remain traceable even on a
run that does not request a downloadable export. The exact BRep/placement encoding
must pass the first roundtrip tests before being fixed as a supported format.

## Requested evidence

**M-CAD-9 — Images.** **Proposed.** Each PNG request names its ID, part selection,
and either one `view` or a `grid` of views under M-CAD-31. Initially support
recorded orthographic presets including isometric,
top, bottom, front, and right, plus pixel width/height. Use fixed style/background
defaults and record the resolved camera and framing. Support structured and
inline annotations under M-CAD-34, with camera titles at each view's top-left
under M-CAD-32 when inline annotations are enabled. A feature close-up or section
must specify its selection or plane; add these capabilities with the fixtures
that need them. Unsupported views are explicit validation errors. Returning an
image does not assert that the geometry is correct. Rendering must work without
exporting STEP or GLB.

**M-CAD-10 — First measurement registry.** **Proposed.** Implement service-owned
`validity`, `solid_count`, `bbox_extent` (explicit world axis), `volume`,
`surface_area`, `centroid`, `cylinder_diameter` for an identified cylindrical
face, and `distance` between `target` and `other_target` subshapes. Use face-to-face
distance for the cap's roof thickness and axial extent of its bore face for cavity
depth. Report a boolean, scalar, or vector with its unit, target, frame, and method
version. Volume and center-of-volume measurements require suitable solid geometry;
unsupported shape/method combinations are unavailable. A bounding box measures
external extent; it does not establish an internal bore diameter or wall thickness.
Compute each requested value from the frozen geometry, not from source parameters.

**M-CAD-11 — Criteria and actionable checks.** **Proposed.** A metric without a
criterion is `measured`. For scalar numbers, support `equals` with an explicit
nonnegative `absolute_tolerance`, or an inclusive `min`/`max` range in the metric's
unit. Integer counts and booleans use exact `equals`; vectors are measurement-only
initially. Record the criterion, actual value, and signed difference from an equality
target or violated range boundary. Return `pass`, `fail`, `unavailable`, or `error`
as appropriate; absent evidence never passes. Include target/feature and relevant
requested image IDs so the caller can inspect a failure. Task or fixture criteria
live in the request, separate from generated code; changing them is an explicit
input revision.

**M-CAD-12 — Growing verification capabilities.** **Proposed.** Extend pairwise
distance and add intersection volume, section/profile measurements, and geometric integral
properties as named methods with documented prerequisites and independent
fixtures. Pairwise checks must name both shapes, assembly transforms, and sampled
poses. Minimum distance alone does not establish absence of interference; use
appropriate intersection evidence as well. Geometric moments must identify their
reference frame and units; mass needs an explicit density. Custom code may supply
diagnostic calculations, but these must not masquerade as service-owned checks.
Global minimum wall thickness, physical thread fit, strength, and printability are
not inferred from an unrelated passing measurement.

**M-CAD-13 — Optional artifacts.** **Confirmed direction; proposed selectors.**
`outputs` explicitly requests `png`, `step`, or `glb` entries with stable request
IDs and selected parts. Implement PNG and STEP in the first cylinder/cap stage;
GLB can follow as a separately advertised capability under TRD-26. Do not generate
unrequested public artifacts or domain metrics. Internal geometry, baseline
validation, provenance, logs, and the result manifest are necessary control data.
Each requested artifact gets an availability record even if its creation fails.

## Result and execution lifecycle

**M-CAD-14 — Result file.** **Proposed.** Write one versioned `result.json` with
`schema_version`, `run_id`, `execution`, `provenance`, `geometry`, `artifacts`,
`metrics`, and `diagnostics`. `execution.status` is `completed`, `failed`,
`cancelled`, or `rejected`, with an optional reason code. Provenance includes
frozen input digests, engine/build versions, and effective settings. Geometry is
null when unavailable, otherwise a native-bundle reference, geometry digest, and
part/feature map, with live handle/expiry information when applicable. A live
handle never replaces the recorded snapshot/provenance reference.
Each artifact echoes its request ID/kind and has `ready`, `unavailable`, or `error`
status; a ready artifact has a relative file path, media type, size, and digest.
PNG artifacts also contain per-view identity, camera, and panel/viewport metadata
under M-CAD-33, whether the file holds one view or a grid.
Each metric echoes its request ID, kind, target, unit, method, value, criterion,
and `status` from M-CAD-11; unavailable/error values are null with a reason.
Paths are relative to the output directory and may not escape it. No application
asset, chat, ACP session, or MCP tool-call identifiers are required by this schema.

For example, the incorrect 9 mm radius cylinder from the example's negative case
produces a metric entry with this shape (illustrative expected data, not a run):

```json
{
  "id": "body.width",
  "kind": "bbox_extent",
  "target": {"part": "body"},
  "axis": "x",
  "unit": "mm",
  "frame": "world",
  "method": "bbox_extent@1",
  "value": 18,
  "criterion": {"equals": 20, "absolute_tolerance": 0.001},
  "status": "fail",
  "difference": -2,
  "evidence_artifact_ids": ["iso"]
}
```

The same run can have `execution.status: "completed"` and an `iso` artifact with
`status: "ready"`, `path: "artifacts/iso.png"`, `media_type: "image/png"`, its byte
size, and SHA-256 digest. No STEP entry appears because it was not requested.

**M-CAD-15 — Useful failure results.** **Proposed.** Record structured error codes,
phase, bounded message/traceback, and source location when available. Distinguish
invalid requests, Python/build errors, invalid geometry, unresolved selections,
render/export errors, timeouts, and cancellation. Once a writable output directory
is reserved, validation and ordinary execution failures still produce a result
manifest. If that directory cannot be created, report the problem on stderr and
exit 2. A hard process/host crash can leave an incomplete run; absence of a finalized
manifest is never success.

**M-CAD-16 — Independent outcomes.** **Proposed.** `completed` means the build and
evaluation orchestration finished; it does not mean all requested checks passed
or all outputs were produced. Continue independent requests after a check or
single renderer/exporter fails when the execution budget permits. Preserve ready
images and metrics alongside failed outputs. On build failure, dependent work is
unavailable with a reason. There is no single model-ready boolean that hides these
distinctions. A positive verification decision must name the required criteria
and confirm that every one passed.

**M-CAD-17 — Execution boundary.** **Confirmed direction; proposed mechanism.**
Use a bounded native build process, then a clean service-owned FreeCAD process to
read the frozen geometry and perform checks/renders. Generated code cannot supply
the authoritative verification report or modify the criteria used by that process.
Use per-run directories and supervisor-owned result finalization. The local stage
uses known development inputs and proves process behavior; it does not establish
security against arbitrary code. Docker later enforces TRD-25 limits and isolation.
Keep subprocess invocation, native dependencies, and display setup explicit; uv
manages the harness, not FreeCAD's binary ABI.

**M-CAD-18 — Finalization and cancellation.** **Proposed.** Write artifacts through
temporary names and expose only completed files with verified digests. Atomically
finalize `result.json` after referenced outputs are complete; a finalized run is
immutable and a retry gets another directory/run ID. The supervisor owns the
native process tree, enforces a wall-time limit, and terminates descendants before
declaring cancellation complete. Preserve already finalized runs. Progress and
logs are not completion signals; operation retries, durable queues, and publication
fencing belong to the wrapper protocol.

**M-CAD-19 — STEP gate.** **Proposed.** Export selected parts from the frozen
geometry, reopen STEP in a clean process, and compare units, validity, solid count,
world bounds, and volume against recorded absolute/relative thresholds. Include
the comparison report and method limitations. These checks are an export sanity
gate, not proof of all geometric or mechanical properties. An export becomes
ready only after its gate passes. A failure leaves other evidence available; the
associated source and original evaluation remain accessible for correction.

**M-CAD-20 — Evaluate existing geometry.** **Confirmed capability; proposed
interface.** Make reuse part of the first service milestone. Accept
`geometry: {"handle": "opaque-handle"}` in a retained local service/harness, or
`geometry: {"path": "geometry/manifest.json"}` for a native bundle beneath the
request directory. Require exactly one geometry locator. A bundle manifest
declares its constituent files; validate and stage those files using the same
path/digest rules as other inputs. A one-shot CLI can load a native bundle without
rerunning source; a retained runtime can query the already loaded shapes by
handle without reparsing the bundle on every request. Keep the same artifact/
metric result contract and source provenance. Handle requests need the owning
live runtime; a standalone CLI without that connection rejects them explicitly.
Changed source, build parameters, or referenced inputs create another geometry;
new views, annotations, metric criteria, or exports reuse the existing geometry.

## Verification loops and staged outcomes

**M-CAD-21 — Deterministic service regressions.** **Proposed.** Each fixture has
source, request, independent expected measurements/tolerances, required views,
and intentionally incorrect cases. Test source/request validation, geometry
roundtrip, measurements, artifact selection, error reporting, timeout/cancellation,
and output finalization. Prove images-only and metrics-only execution independently
of STEP. Changing source at an existing path must change frozen input identity.
Keep expectations outside the submitted code and generated reports. Use uv to
run the suite; native prerequisites must be explicit rather than silently skipped
and reported as a passing CAD gate.

**M-CAD-22 — Part iteration and agent trials.** **Confirmed direction; proposed
development gate.** The part loop is code → evaluation → image/metric inspection →
revision or clarification. Exercise it separately from deterministic regressions:
give an agent a fixed task and criteria, retain every request/result, and record
iterations, elapsed time, final evidence, and unanswered questions. Start with a
deliberately wrong cap and require the agent to correct the geometry against the
unchanged criteria. This development trial can use the local CLI before MCP/ACP
exists. When a trial reveals a service defect, add a deterministic regression;
when it reveals missing task information, improve the task or request clarification.

**M-CAD-23 — Evidence and budgets.** **Proposed.** Every implementation assignment
names required fixtures, numerical tolerances, views, native/runtime configuration,
wall-time and output limits, and a bounded agent-trial budget. Record measured
durations on the actual host; do not promise an unmeasured latency. A stage passes
when expected-good fixtures meet their criteria, bad fixtures fail for the intended
reason, required artifacts open correctly, and failure controls behave as specified.
Visual inspection and numeric assertions are separate evidence. Report a trial
that exhausts its budget as an outcome, not an instruction to iterate indefinitely.

**M-CAD-24 — First delegation: cylinders, sleeves, caps.** **Proposed.** Deliver
the local invocation, request/result contract, PNG rendering, initial measurements,
and on-demand validated STEP. Start with the supplied cylinder example, then a
sleeve and a closed-end cap. A proposed synthetic cap has outer radius 20 mm,
inner radius 18 mm, total height 12 mm, and a 2 mm roof; its open cavity is 10 mm
deep and its expected volume is `1560 * pi mm^3`. Verify the actual bore diameter,
outside dimensions, roof/cavity geometry, solid validity, and volume. Include
isometric, bottom, and side evidence. Ensure geometry once, then request views,
metrics, and STEP using its live handle without another source execution. Prove
native-snapshot restoration without source execution as well. Prove separate images, a labeled grid, and
both in one evaluation under M-CAD-31–33. Wrong bore, missing roof, and extra-solid
cases must fail the intended checks while preserving diagnostic output. These
are fixtures, not measurements of the user's mug. Complete the wrong-cap
correction trial under M-CAD-22 before calling the local part loop demonstrated.

**M-CAD-25 — Bolt and nut bodies.** **Proposed.** Add cylindrical shafts,
hexagonal heads/nuts, bores, shoulders, and simple mating reference parts. Check
shaft/head lengths, outside diameters, across-flats distance, bore size, named
features, placement, and expected solid count. Include incorrect bore and
mispositioned mating-part cases with visible and numerical evidence. Smooth
bolt/nut bodies demonstrate body geometry only; thread capability has its own gate.

**M-CAD-26 — Mating threads and custom nuts.** **Open fixture selection;
proposed gate.** Select one explicitly modeled external/internal thread pair
before expanding to custom threaded nuts. Record profile geometry, major/minor
diameters, pitch, starts, handedness, engagement length, assembly transforms, and
clearance criteria. Derive pitch/profile evidence from geometry, and check
interference and clearance at specified engagement poses with sections/close-ups.
Include wrong pitch, handedness, and insufficient-clearance negatives. Then vary
the nut body and one selected custom profile against its defined counterpart.
Thread labels or parameter echoes do not verify a helix; finite sampled poses do
not prove fit along the entire assembly path. A standard designation requires a
named authoritative reference and its tolerances. Physical printed-fit evidence
is a separate outcome. This stage does not block cylinder/cap implementation.

**M-CAD-27 — More complex geometry.** **Proposed.** Expand with individually
specified fixtures for intersecting bores/boolean cuts, filleted or chamfered
brackets, and a lofted or swept transition. Each adds a named difficult feature,
independent dimensional/aggregate expectations, relevant views or sections, and
an intentionally broken operation. Record which combinations work rather than
claiming general support for arbitrary shapes. Preserve prior regressions when
adding each family; advanced checks enter the registry with their own fixtures.

**M-CAD-28 — Docker after the local gate.** **Confirmed direction; proposed
acceptance.** Once the selected local fixture family and part loop pass, package
the same CLI/contract with pinned FreeCAD and proven offscreen rendering. Rerun
the same requests through read-only input and private output mounts. Verify no
network, provider credentials, database, or Docker socket in the worker; enforce
memory/CPU/process/time/output limits and prove cancellation cleans up the process
tree. Compare numerical outcomes and requested artifact availability to local
results. Application agent containers and the later MCP integration remain
separate work under the TRD.

**M-CAD-29 — Delegation deliverables.** **Proposed.** A completed assignment
provides implementation and locked Python dependencies, repeatable uv commands,
native setup/version notes, schemas and source examples, the assigned fixture
corpus, machine-readable reports, representative images/exports, and measured
runtime/failure results. Include an agent-trial transcript/report only for a stage
that claims that loop. Document unsupported methods and any remaining gates.
Root guidance, the CAD README, and the [development workflow](../WORKFLOW.md)
provide the delegation context; there is no requirement to build MCP before
proving the core evaluator.

**M-CAD-30 — Review focus.** **Open.** Review the `build` return shape and
request/result fields first, then partial-result behavior and the cylinder/cap
completion gate. Confirm the first threaded-pair profile and fit criteria before
delegating the thread stage. Native pinning, headless setup, and measured resource
budgets are implementation findings to record at the first local gate. Review
[CAD-PROTOCOL.md](architecture/CAD-PROTOCOL.md) only for the surrounding file and
operation handoff; it must preserve this evaluator contract.

## View layout and camera labels

**M-CAD-31 — Separate views, grids, or both.** **Confirmed options; proposed
schema.** One evaluation can request individual PNGs, a PNG containing several
views, or both. Preserve the existing single-image form with `view`. For a grid,
use `grid: {"columns": 2, "views": [...]}` instead; each entry has a unique `id`
within that grid, `preset`, `width`, and `height`, using the output's shared part
selection. Require exactly one of `view` and `grid` per PNG request. Place views
in declared order, left-to-right then top-to-bottom, using a fixed cell size equal
to the largest requested panel dimensions and recorded padding. Do not shrink
panels to satisfy an output-size limit; reject an oversized request explicitly.
Request both layouts by including both individual and grid entries in `outputs`.
Render from the same frozen geometry, reusing identical view renders where useful.
Only requested layouts become returned artifacts; internal grid tiles do not
implicitly become downloadable files. See the
[grid request example](../cad/examples/cylinder/request-grid.json).

**M-CAD-32 — View and camera title.** **Confirmed placement; proposed content.**
When inline annotations are enabled, put a readable title at the top-left of
every individual image and every grid panel. Include the view ID/name and a
concise summary of the actual resolved
camera: projection, viewing direction, up direction, and orthographic span or
perspective field of view when supported. For example,
`Top | orthographic | look -Z | up +Y | span 40 x 30 mm`. An optional `title` in
the view request adds a human label; the service derives camera text from the
camera used to render, rather than accepting caller-written camera claims. Reserve
space within the panel for the title so it does not obscure geometry. Keep text
legible at the requested panel size and include full camera settings in the result
manifest. JSON-only annotation output retains the same title record without
drawing it into the PNG. Freeze font/style and title formatting with the render settings.

**M-CAD-33 — Per-view lineage and failures.** **Proposed.** Each PNG artifact's
`views` array records `view_id` (the output ID for a single view), title,
`status`, resolved camera, selected parts, and panel/geometry-viewport rectangles
in final-image pixels, with origin at the top-left. Qualify view references by
artifact ID; grid coordinates must map back to the correct view and geometry
revision for later annotation. A composed image may be ready with a visibly
labeled failed/unavailable panel; retain its slot, report that panel's actual
status and reason, and never substitute another view. A ready image file does not
assert that every panel rendered. Preserve independently ready individual images
if grid composition fails. Acceptance checks cover all three layouts, stable
ordering, truthful readable labels, coordinate mapping, and one failed view.

**M-CAD-34 — JSON and inline annotations.** **Confirmed options; proposed
schema.** Each PNG request accepts
`annotations: {"json": true, "inline": true}` to return a JSON sidecar and render
the same annotations into the image. Support either form independently; the
proposed default is both. Freeze the effective flags with the request. Build one
normalized set of annotation records, then use it for both output forms so labels
cannot disagree. Initially include view/camera titles; add feature labels and
measurement callouts with the relevant fixture/check capability. Each record has
an ID, view ID, kind, text, final-image pixel anchor/bounds, and provenance: the
resolved camera, computed metric ID, or explicitly identified caller-supplied
label. Record image dimensions, geometry reference, per-view rectangles, and the
final PNG digest in the versioned sidecar. Use a top-left image origin, and retain
the transform between view-local and grid coordinates. Reserve the title region
consistently across modes so geometry framing and annotation coordinates stay
comparable. A JSON-only request returns the base image plus annotations that a
client can draw; inline-only burns text into the image; both does both. Sidecar
file status, path, media type, byte size, and digest appear under the image
artifact's `annotations` record in `result.json`. Treat this as another referenced
output file for validation and handoff; if it fails, preserve a completed image
and report the sidecar failure. Test that JSON text and positions correspond to
the rendered labels in separate images and grids, including partial views.

## Ensured geometry and ephemeral state

**M-CAD-35 — Ensure once, query many times.** **Confirmed direction; proposed
service API.** A retained runtime exposes `ensure_geometry(source_or_bundle)` →
geometry handle plus native-bundle reference, `evaluate_geometry(handle, request)`
→ result/files, and `release_geometry(handle)`. These are core operations that a
local harness or later adapter can call; MCP is not required. A source-based
evaluation remains a convenience that ensures geometry and evaluates it in one
call. Key reusable geometry by source/declared-input digests, build parameters,
units, build settings, and native runtime versions; camera, layout, annotation,
metric, and export requests do not affect that key. Ensure returns the compatible
loaded state when present, restores a compatible native snapshot when available,
or executes source only when neither exists and source was explicitly supplied.
Every evidence request pins the same immutable geometry and gets its own result
directory. Generated code runs in its build process; only the clean service-owned
runtime retains loaded geometry. Queries operate on immutable shapes or disposable
copies, with their own cameras and temporary export/check state.

**M-CAD-36 — Handle lifetime and recovery.** **Proposed.** A geometry handle is
opaque and stable while its retained runtime state is live. Track runtime
generation, geometry digest, owning scope, expiry, and active-use count. Start
with serialized queries; do not evict, release, or alter geometry while a query
pins it. Bound idle lifetime, cache count, and memory, and expose expiry/release
explicitly. Eviction, release, or runtime replacement invalidates the live handle;
return `geometry_unavailable` with its snapshot reference when known. Restore a
retained native bundle to obtain a new live handle without executing source.
Never silently rebuild on an expired handle. Snapshot references/digests survive
worker loss according to their retention policy; an in-memory handle alone is
not recovery storage. If both live state and snapshot are gone, report that and
require an explicit source-based ensure. Cancelling one evidence query does not
delete geometry used by other work; cancelling its owning scope may release it
after pinned queries stop. If an unresponsive query forces termination of a shared
native process, invalidate that runtime's handles and mark other affected work
interrupted; restore from snapshots explicitly. Record build, restore, and cache-hit paths in diagnostics
so reuse is observable rather than inferred from elapsed time.

## Local verification harness

**M-CAD-37 — Harness ownership and entry point.** **Confirmed tooling; proposed
layout.** Build a Python/uv verification harness inside `cad/`, with its own
[Makefile](../cad/Makefile). Use `src/crafty_cad/harness/` for suite orchestration,
report serialization, and terminal presentation when implementation starts. Keep
fixture assertions in `tests/` and immutable inputs/expectations in `fixtures/`.
The harness calls the public file/state contract and observes outputs; it must
not use model calls to decide whether deterministic fixtures pass. Expose a
proposed `python -m crafty_cad.harness run --suite SUITE` entry point, with explicit
`--case`, `--runtime local|docker`, `--output`, and `--json` options. Keep Rich out
of the evaluator's machine-output boundary and add it as a locked uv development
dependency with the harness implementation.

**M-CAD-38 — Local Makefile suite targets.** **Proposed.** Provide
`verify-contract` for schemas, paths, selection syntax, and manifest rules without native
FreeCAD; `verify-geometry` for known shapes and independent numerical expectations;
`verify-views` for camera presets, separate/grid/both layouts, JSON/inline/both
annotations, coordinates, and image availability; `verify-exports` for requested
STEP and roundtrip gates; `verify-reuse` for ensure/query/release, immutable cached
geometry, snapshot restore, expiry, and no unnecessary rebuilds; and
`verify-failures` for invalid code/geometry, partial results, failed outputs,
timeout, cancellation, and interrupted finalization. `verify` runs these
deterministic local suites in a fixed order with one aggregate report.
`verify-docker` reuses their inputs/expectations in the packaged runtime.
`trial-cap` runs the separately configured agent correction trial and is excluded
from `verify`. Every target runs through uv from `cad/`; `make -C cad TARGET`
works from the repository root. The current Makefile reserves these names and
reports that they are unimplemented; no placeholder may claim that tests ran.

**M-CAD-39 — Rich presentation.** **Confirmed library; proposed display.** Use
Rich for the harness's run header, suite/case progress, outcome summary, failure
details, and artifact links. Show fixture name, current phase, completed/total
cases, elapsed time, and actual outcome; use indeterminate progress when the
current phase has no meaningful total. Summarize expected versus actual metrics,
units, tolerance, and failure reason, with paths to the associated image and JSON
report. Print an artifact tree for retained grids, individual images, annotation
sidecars, and exports. Include build/cache-hit/restore counts for reuse cases.
Format captured native logs separately from the status display. Rich owns the
terminal presentation; generated PNGs and a local HTML gallery provide image
inspection without requiring an inline-image terminal. Use the documented
[Rich progress API](https://rich.readthedocs.io/en/stable/progress.html) and
[Console API](https://rich.readthedocs.io/en/stable/console.html).

**M-CAD-40 — Durable harness reports.** **Proposed.** Create a new
`runs/verification/RUN_ID/` directory for each suite invocation, preserving
fixture requests, evaluator results, bounded logs, artifact files, and a versioned
`summary.json`. Record selection/order, runtime versions, effective budgets,
expected and actual outcomes, assertion results, durations, and links to each
evaluation. Produce a self-contained local `index.html` with image thumbnails,
view/camera captions, annotation links, and failure summaries. Never overwrite
fixtures or a previous run. Treat expected negative cases as passing harness
assertions only when the intended failure is observed; retain the evaluator's
actual failed check/status in the report. Reopening a report must not execute CAD
or call a model.

**M-CAD-41 — Preflight, exit codes, and automation.** **Proposed.** Check the
selected suite's prerequisites before running: native FreeCAD and rendering setup
only where required, Docker for the container suite, and agent configuration only
for trials. A missing prerequisite, empty/unknown case selection, or unimplemented
required capability cannot yield a green suite. Harness exit codes are 0 when all
required assertions pass, 1 for assertion/trial failure, 2 for invalid setup or
harness failure, and 130 for an interrupted run. Record interruption after stopping
owned work. Preserve these codes on the direct CLI; Make may summarize a failed
recipe with its own nonzero status. `--json` emits only the machine summary on
stdout; send human diagnostics to stderr. Disable live refresh/color for captured
output and honor an explicit no-color mode. Include a plain final summary so
automation does not depend on terminal escape sequences or color.

**M-CAD-42 — Harness acceptance and staged integration.** **Proposed.** First
implement contract assertions and the Rich/report shell, then wire native
cylinder/cap fixtures as evaluator capabilities become available. Start with one
execution slot and finish independent cases after an assertion failure unless a
supervisor/runtime fault prevents continuation. Prove a good case, an intended
negative case, an unexpected failure, a missing prerequisite, and cancellation;
retain reports with correct classifications and exit codes. For reuse, instrument
source execution: one ensure followed by images, metrics, changed camera/criteria,
and STEP must execute the model exactly once and preserve its geometry digest.
After eviction/restart, restoring its native bundle must execute source zero
times; an expired handle must fail explicitly. Verify repeated queries do not
mutate geometry or leak camera settings between runs. Record cold-build, restore,
and warm-query durations without using timing alone as proof of reuse. Add Docker
and bounded agent trials after the local gate. Message grouping/publication tests
remain wrapper acceptance under CAD-PROTOCOL-13–15 and may consume completed
harness bundles.
