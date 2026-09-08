# Crafty CAD

Standalone FreeCAD evaluator and retained geometry API. The local implementation
builds cylinders, sleeves and closed-end caps, measures delivered geometry in a
clean native process, renders requested PNGs, and exports STEP only on demand.
The separate correction trial and executed Docker gate are required before this
assignment is complete. MCP/ACP, chat, printing and product agent sessions are
outside this module.

Read the canonical [M-CAD contract](../docs/M-CAD.md),
[implementation brief](../docs/CAD-IMPLEMENTATION.md),
[core diagram](../docs/architecture/rendered/cad-contract.svg),
[development diagram](../docs/architecture/rendered/cad-development.svg), and future
[file handoff](../docs/architecture/CAD-PROTOCOL.md). Native milestone evidence and
exact initial versions/commands are in [NATIVE-MILESTONE.md](NATIVE-MILESTONE.md).
That file is a historical checkpoint; current behavior is described here.

## Setup and public CLI

From the repository root:

```sh
make -C cad sync
uv run --directory cad --cache-dir .uv-cache --locked python -m crafty_cad evaluate \
  --request examples/cylinder/request.json --output runs/cylinder-001
```

`uv --directory cad` changes the working directory to `cad/`. Each output must be
new. Stdout is exactly the absolute `result.json` path; errors/logs go to stderr.
Exit 0 means orchestration completed, including cases with failed criteria or
individual unavailable/error outputs. Exit 1 means failed/cancelled execution;
exit 2 means rejected input or inability to reserve output. The result's execution,
artifact and metric outcomes are independent. An absent final manifest is not
success. Source, frozen requests, native geometry, logs and useful partial files
remain available even without STEP.

FreeCAD is a native dependency, outside uv. On the accepted Arch host:
`/usr/bin/python3` is Python 3.14.7, ABI `cpython-314-x86_64-linux-gnu`, and imports
FreeCAD 1.1.3 revision 44987 from `/usr/lib/freecad/lib`, with OCCT 7.9.3. The bridge
uses this interpreter with `-I`; the uv interpreter is CPython 3.13.9. Configure
`CRAFTY_NATIVE_PYTHON`, `CRAFTY_FREECAD_LIB`, and `CRAFTY_FONT` when paths differ.
Changing native versions changes build identity; snapshots require a compatible
FreeCAD/OCCT/ABI identity. Installed package details and the first actual native
roundtrip are retained in the milestone document.

Rendering uses FreeCAD/OCCT tessellation and a software depth buffer in a separate,
limited process using locked uv NumPy/Pillow. No display server, Xvfb, GUI, OpenGL
context or GPU is required. The accepted font is Liberation Sans 2.1.5 at
`/usr/share/fonts/liberation/LiberationSans-Regular.ttf`; its bytes/digest and
Pillow/NumPy/FreeType versions appear in each PNG evaluation's provenance.

## Request, source and result

[Request](schemas/request-v1.schema.json), [result](schemas/result-v1.schema.json),
and [native bundle](schemas/bundle-v1.schema.json) schemas are versioned. The
Python validator also checks path containment, finite values, IDs, units, method
prerequisites, criterion semantics, aggregate input size, and image pixel bounds.
Regenerate checked-in schemas with `uv run --directory cad --cache-dir .uv-cache
--locked python -m crafty_cad.schemas`; contract tests verify they match runtime.

A source request contains one self-contained Python file, parameters, declared
alias-to-relative-file inputs, outputs and metrics. Source runs exactly once in
a disposable matching native process and returns:

```python
{"parts": {"name": topo_shape}, "features": {"name": {"feature": actual_subshape}}}
```

Parts are nonempty named TopoShapes with world placements. Member identity is
checked before BRep serialization. Feature bindings refer to members of the exact
persisted part; this accounts for OCCT normalization of boolean-generated faces.
The clean verifier validates those bindings after loading BRep and never imports
submitted source. Nonmember/ambiguous features remain unavailable. Criteria and
final reports belong to the supervisor, never generated code.

All input paths stay beneath the request directory; absolute, parent, backslash,
symlink and special-file inputs are rejected. Captured source/input bytes are
hashed before execution, retained independently of files a model could modify,
and included in self-contained geometry bundles. An ordinary Python I/O audit
rejects undeclared ambient file/network dependencies. This audit is a local
correctness aid; it is not a security boundary for hostile native code.

Supported metrics: validity, solid count, world-axis bbox extent, solid volume,
surface area, volume-weighted centroid, diameter of an identified cylindrical face,
and minimum distance between actual selected subshapes. Reports include unit,
world frame, versioned method, target(s), actual value, criterion, signed difference,
and `measured`, `pass`, `fail`, `unavailable` or `error`. Vectors are measurement-only.
Count/boolean equality is exact; scalar equality requires an explicit absolute
tolerance; inclusive ranges use min/max. Unsupported methods, views, GLB and
unknown fields reject explicitly. A bbox never claims to measure a bore or roof.

PNG requests support a single view or declared-order grid, and callers can request
both layouts together. Presets: isometric, top, bottom, front and right. Optional
`span_mm` is the orthographic vertical span; width follows the geometry viewport's
aspect ratio. Width is 320–4096 px and height 240–4096 px, subject to the total pixel
limit and enough space for readable annotations. Grids use maximum panel dimensions
as fixed cells plus 12 px padding; smaller panels retain their requested dimensions.

JSON-only, inline-only and combined annotations share normalized records. Every
panel reserves 112 px for a top-left title derived from the actual camera.
The first three requested feature metrics for selected parts receive measured
callouts in a separately reserved footer. Failure diagnostics are always visible,
even in JSON-only mode. Sidecars include the final PNG digest, geometry reference,
view ordering, cameras, panel/viewport rectangles, view-to-image transforms,
annotation text/positions, and camera/metric/service-error provenance. Sidecar
failure preserves its PNG; composition failure preserves independent images.
A grid may be ready while a visibly failed panel retains its own error status.

Requested STEP uses the same frozen shapes. A new clean native process reopens
it and compares explicit mm units, validity, solid count, world bounds and volume.
Only a passing gate gives a ready STEP path. Comparison reports retain absolute
thresholds of 1e-6 mm and 1e-5 mm³, plus relative 1e-9. This is an export sanity
check, not proof of topology equivalence, thread compliance, physical fit or strength.

## Retained API and recovery

Use `crafty_cad.runtime.GeometryRuntime` as a context manager. Its public methods
are `ensure_geometry(request_path, scope=...)`,
`evaluate_geometry(handle, request_path, fresh_output, scope=...)`,
`evaluate(request_path, fresh_output, scope=...)`, and
`release_geometry(handle, scope=...)`. The caller supplies scope through trusted
API context, never modeling source or request JSON. No server framework is needed.

Ensure returns a live handle, native snapshot path/digest, part/feature map,
baseline, runtime generation, scope, expiry and active-use count. Geometry requests
use exactly `{"geometry":{"handle":"..."}}` in their retained runtime, or
`{"geometry":{"path":"geometry/manifest.json"}}` for an explicit bundle restore.
Parameters and inputs must be empty for geometry requests. A one-shot CLI closes
its runtime on exit, so its snapshot is the reusable locator for another CLI call.
Handles cannot be carried between independent CLI processes.

Build keys include frozen source and declared input digests, parameters, units,
build settings and native versions. Evidence selections, cameras, annotation flags,
criteria and exports do not rebuild geometry. A warm query uses already loaded
shapes without reparsing BRep, with disposable copies for tessellation/export.
The API starts serialized. Queries pin geometry; release during use is deferred.
A background reaper unloads expired idle shapes. Count/memory eviction, release,
expiry and runtime replacement explicitly invalidate handles. Wrong scopes cannot
access geometry or private snapshot paths. Known same-scope stale handles report
their snapshot reference. There is no silent rebuild of an unavailable handle.
Explicit snapshot restore creates a new handle with zero source executions.

## Limits and failure behavior

Defaults live in `Settings`: evaluation/native-call wall time 30 s; native/raster
address space and process-tree RSS 1 GiB; native/raster cumulative CPU 300 s;
32 owned processes; working output 128 MiB; 256 KiB logs per process; combined
input 16 MiB; 16 million pixels per PNG. Cache defaults are 8 shapes, 64 MiB
estimated native shape memory, 300 s idle expiry and 1800 s absolute lifetime.
Every report records the effective settings and measured process peaks/timings.
RSS/process/output monitoring samples every 40 ms and may observe an overshoot
before termination; OS address-space, CPU and per-file limits are also applied.
These are local process controls, not an executed Docker isolation claim.

The supervisor owns subprocess trees, terminates descendants and reaps them before
cancellation completes. Cooperative query/raster cancellation normally preserves
retained geometry. If a native query must be killed, its runtime handles become
unavailable and snapshots remain for explicit restore. Independent files/checks
survive a single-output failure while the budget permits. Files are atomically
written and verified before paths/digests enter the final manifest; the supervisor
atomically finalizes `result.json`. Interrupted finalization leaves no success
manifest. Existing output directories are never reused.

## Deterministic acceptance and reports

```sh
make -C cad verify-contract
make -C cad verify-geometry
make -C cad verify-views
make -C cad verify-exports
make -C cad verify-reuse
make -C cad verify-failures
make -C cad verify
```

`verify` runs those suites in that fixed order with one aggregate report. Contract
checks need no FreeCAD. Fixture assertions live in `tests/suites.py`; immutable
sources, cap criteria and [independent formulas/tolerances](fixtures/EXPECTATIONS.md)
live in `fixtures/`. Negative bore, roof and extra-solid cases retain failing
measurements and diagnostic images. Collector controls test a wrong-source public
CLI invocation and exhausted/missing-agent outcomes; they do not simulate an agent
correction or count as trial acceptance.

The harness interface also supports explicit suite/case/runtime/output selection:

```sh
uv run --directory cad --cache-dir .uv-cache --locked python -m crafty_cad.harness run \
  --suite geometry --case cap --runtime local --output runs/cap-check --json
```

Case selection supports repeatable `--case` patterns. `--json` prints only machine
JSON on stdout; Rich diagnostics go to stderr. Direct harness exits: 0 assertions
passed, 1 assertion/trial failure, 2 invalid setup/harness failure, 130 interruption.
Make may summarize these with its own nonzero code. Empty/unknown selections,
missing prerequisites or unimplemented required suites cannot go green.
`--no-color` and `NO_COLOR` are supported; captured output disables live refresh.
Rich shows progress, outcomes, durations and artifact paths.

Each fresh `runs/verification/RUN_ID/` retains `summary.json`, exact requests,
evaluator results, bounded logs, snapshots, source revisions, images/sidecars,
STEP comparisons and exports. `index.html` embeds its PNGs and links local evidence;
it needs no network and executes no CAD or model calls. Reports preserve intended
negatives, unexpected failures, missing prerequisites and interruptions distinctly.
The first broad run, including a discovered BRep feature normalization defect, is
retained as `runs/local-first`; subsequent reports retain the corrected behavior.

## Separate cap trial and remaining stages

The director launches a separate correction worker using
[fixtures/trial-cap/TASK.md](fixtures/trial-cap/TASK.md). This service builder does
not launch it, act as it, or hardcode its correction. Prepare an inert workspace:

```sh
uv run --directory cad --cache-dir .uv-cache --locked python -m crafty_cad.trial prepare \
  --output runs/trials/cap-correction-001
```

Preparation freezes the wrong source/task/criteria and does not start the budget
clock. The first evaluation starts the default 8-evaluation/1200-second budget.
The task documents evaluate, observe, finish and verify commands. The collector
calls the public evaluator CLI, retains every source/request/result/log/timing and
inspection note, and requires the separate worker transcript and final validated
STEP. Actual PNG inspection is an external-worker attestation backed by its tool
transcript; the collector does not claim to infer that a person/agent viewed a file.

`CRAFTY_CAP_TRIAL=/absolute/trial/path make -C cad trial-cap` validates collected
evidence. A missing trial records `missing_prerequisite` and exits 2. A collector
control test is not the separately coordinated correction trial.

`verify-docker` currently reports an explicit missing adapter rather than passing.
Executed Docker packaging/isolation acceptance follows local and separate-trial
acceptance. Bolt/nut bodies, thread/custom-nut pairs and complex fixture families
are named subsequent CAD-RUN-16 stages; their selection and method gaps are listed
in the fixture expectations. No arbitrary-shape, global wall-thickness, printability,
thread-fit or physical-fit claim follows from this cap gate.
