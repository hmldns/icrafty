# Imported STEP and rational B-spline acceptance

Accepted on 2026-09-08 in the cad-service worktree. The former WIP NURBS
regression now passes without changing its analytic volume criterion or STEP
comparison tolerances. The complete local core passes **78/78**; the updated
Docker gate passes **84/84**, including 26 expected-good and 58 intended-negative
cases. Original native failures and intermediate unsuccessful probes remain in
ignored run directories. This extends the historical [local](LOCAL-GATE.md),
[trial](TRIAL-GATE.md) and [Docker](DOCKER-GATE.md) evidence.

## Native diagnosis and corrections

The supplied unchanged STEP copy initially caused native exit 127, with
`cannot allocate memory for thread-local data: ABORT`, during warm rendering
under the default 1 GiB limit. FreeCAD's `TopoShape.tessellate` forces OCCT parallel
meshing. MeshPart's standard mesher runs serially on the service's disposable copy.
The same file produced 2,141 vertices and 4,278 triangles in the serial probe,
without raising memory/process limits. The accepted path uses 0.12 mm linear and
0.5 rad angular deflection; mesh coordinates use float32. Metrics still use BRep.

Ordinary `BoundBox` included conservative B-spline control poles: 75.76745402046758
mm in X/Y for this file. `optimalBoundingBox(False, False)` measures geometric
extrema: **70.00000020000014 × 70.00000020000066 × 16 mm**. The approximately
2e-7 mm excess reflects native numerical precision and fits the unchanged 0.001 mm
dimension criteria. Source parameters are not used as measured values.

An independent synthetic NURBS cap exposed a second defect in FreeCAD's default
mass integration. The source is [fixtures/nurbs-cap/model.py](fixtures/nurbs-cap/model.py):
outer radius 35 mm, bore radius 33 mm, height 16 mm, cavity 14 mm. Its analytic
volume is `4354*pi = 13678.494413729959 mm³`. The ordinary native `.Volume` returned
13793.442948365666 mm³ and an off-axis centroid. The new service-owned
[native bridge](native/README.md) shares the already loaded shape through
`Part.__toPythonOCC__`; it does not reparse BRep or execute model source. Adaptive
OCCT Gauss-Kronrod integration returns **13678.494413730006 mm³**, centroid
approximately **(0, 0, 11.501607717041793) mm**. Adaptive area is
**14118.317385744092 mm²**, versus analytic `4494*pi = 14118.31738523253 mm²`.
The test retains independent absolute tolerances of 0.001 for dimensions/volume/
area and 1e-8 mm for centroid coordinates. Methods are explicitly versioned
`bbox_extent@2`, `volume@2`, `surface_area@2`, `centroid@2`.

STEP export also needed `write.surfacecurve.mode=1`. Without exact trimming
curves, reopen projected curves onto the NURBS surfaces and measured
13678.523828895413 mm³; the service correctly rejected that export and retained
its PNG. With trimming curves included, clean reopen measures
**13678.494413730397 mm³**. `clean-step-reopen@2` still checks mm units, validity,
solid count, bounds and volume with absolute length 1e-6 mm, absolute volume
1e-5 mm³ and relative 1e-9. Export bytes remain requested-only.

Relevant primary implementation references are FreeCAD's
[TopoShape tessellation/export](https://github.com/FreeCAD/FreeCAD/blob/1.1.0/src/Mod/Part/App/TopoShape.cpp),
[public TopoDS bridge](https://github.com/FreeCAD/FreeCAD/blob/1.1.0/src/Mod/Part/App/AppPartPy.cpp)
and the installed OCCT 7.9.3 `BRepGProp.hxx` adaptive API. The numerical findings
above come from actual local executions, not inferred source parameters.

## Commands, versions and retained evidence

From the checkout root:

```sh
make -C cad native-setup
uv run --directory cad --cache-dir .uv-cache --locked python -m crafty_cad.harness run \
  --suite geometry --case nurbs-bounds-serial-mesh --output runs/adaptive-properties-regression-003
make -C cad verify > cad/runs/adaptive-properties-local-verify.log 2>&1
uv run --directory cad --cache-dir .uv-cache --locked python docker/package.py \
  --output runs/docker/adaptive-properties-lock-final --refresh-lock
make -C cad image-docker > cad/runs/adaptive-properties-image-final.log 2>&1
make -C cad verify-docker > cad/runs/adaptive-properties-docker-verify.log 2>&1
```

The explicit native build uses locked SWIG 4.4.1, GCC 16.2.1, Python 3.14.7 ABI
`cpython-314-x86_64-linux-gnu`, FreeCAD 1.1.3 revision 44987 and OCCT 7.9.3.
Native paths remain `/usr/bin/python3` and `/usr/lib/freecad/lib`. The supervisor
uses uv Python 3.13.9; rendering uses Pillow 12.3.0, NumPy 2.5.3, FreeType 2.14.3
and Liberation Sans 2.1.5. There is no GUI/display/GPU dependency. Generated bridge
SHA-256 is `7d8b77e3f9a64e05bbbb8f8a1d3a99d31664ed7578139301b2e7c6ce7d80f73a`;
two fresh compilations agreed in `runs/adaptive-properties-build-repeat.json`.
Runtime startup validates module/source hashes, Python ABI and OCCT version.

`runs/adaptive-properties-probe/` retains the initial/refined native mass probes,
export comparison and logs. `runs/adaptive-properties-regression-001` records
the initially missing compiled dependency; `-002` records the rejected STEP;
`-003` contains the passing result, real PNG, STEP and clean comparison. The
earlier WIP analytic-volume failures remain under `runs/existing-step-fix-nurbs-*`.
The complete standalone local report is
`runs/verification/20260908-174534-904af108/summary.json` and `index.html`.

The final Docker report/gallery is
`runs/verification/docker-20260908-175215-90061b3d/{summary.json,index.html}`.
It reran the final code locally (**78/78, 48.729564 s**) and inside Docker
(**78/78, 57.970735 s**), then completed all isolation/comparison cases
(**84/84, 78.343093 s**). All **324 metric records** and requested artifact/panel
availability agreed. No cases were skipped. Inner native memory remains 1 GiB,
wall time 30 s, process count 32, output 128 MiB; Docker remains 2 GiB, two CPUs,
64 tasks, 300 s, with read-only inputs/private outputs/no network or credentials.
The actual pressure, cancellation, cleanup and authority tests are retained in
that report; no product per-session Docker orchestration is implied.

Build report: `runs/docker/build-20260908-175156-d3207d49/build.json`.
Image `crafty-cad:bacdc123f40b0676`, immutable ID
`sha256:1ead718a21451bb52b22a53197756f871e418d25f435df768ce0a413956d07fe`,
609,587,858 bytes. The pinned closure now includes MeshPart, Mesh and their native
libraries, plus the precompiled properties bridge. Compiler/SWIG are not in the
image. The native tree contains 6,401 pinned files; the runtime lock also binds
the new bridge bytes separately. Image construction remains offline/from scratch.

In that report, `retained-operations-and-cross-container-snapshot-restore/`
records one source execution/build/load and five queries, including cancellation,
with unchanged BRep bytes, placements and feature membership. Cold ensure took
0.916532 s; image 0.433701 s; metrics 0.017182 s; changed camera/criteria 0.387546 s;
STEP 0.227987 s. Restore into a new container took 0.705963 s including startup
and capture, with **zero source/builds, one restore/load**. Native restore was
0.009652 s. Release and stale handles failed explicitly.

The builder inspected the actual local NURBS PNG and supplied-file PNG, and the
final container cap/failed-view grids under
`deterministic/capture-94b41e8e/verification/`. Titles, top/bottom/side evidence,
bore/roof/cavity callouts and the failed panel's retained diagnostic were visible.

## Supplied file through the application boundary

The authorized unchanged copy remains `runs/existing-step-diagnosis/mug_cap.step`,
323,517 bytes, SHA-256
`f6241ce1adcaf2e9b0c9b0757a735a1777dd9d84f1e8f8923184f302f6aa9899`.
Original user files were not edited. Its new application transport report is
`agent/runs/existing-step-handoff-native-002/test_cad_real_file_handoff_ens0/input-transport-report.json`
relative to the checkout root. It used real conversational/model-role MCP,
immutable input capture, an explicit import adapter, native ensure and a warm
PNG/STEP query. The modeling actor is explicitly a test actor, not live CAD-agent
reasoning; that independent live acceptance is in
[CAD-LIVE-ACCEPTANCE.md](../agent/CAD-LIVE-ACCEPTANCE.md).

The file measures one valid solid, the 70 × 70 × 16 mm bounds above and volume
**54493.72617103507 mm³**. Volume is reported as measured, without inventing an
analytic acceptance criterion for the supplied shape. The clean reopened STEP
measures 54493.72617103598 mm³. Actual source/build/load/query counts are 1/1/1/1;
ensure took 8.263717 s including adaptive verification, warm evidence 26.179775 s,
and clean STEP reopen 8.517101 s. Peak verifier RSS was 123,322,368 bytes.
The unchanged 30-second query limit remains material for more complex inputs.

PNG SHA-256 is `84062ca20477dc9782f782666ebadd913ef022bb0755394593704345d784731c`
(27,842 bytes); STEP SHA-256 is
`4a967cc88654f84a571314ee5e478ed5e9b3394ae02baf1d4ad95790efd37bd1`
(1,101,147 bytes, including trimming curves). Both were ready and retained.
The preceding application attempt `existing-step-handoff-native-001` stopped
after a test incorrectly treated one bounded `cad_wait` response as final; its
cancelled result preserved the completed PNG. The collector now polls until a
terminal result within its own explicit deadline. This failure remains recorded.

These methods remain numerical sanity checks. General CAD imports, threads,
manufacturing/physical fit and arbitrary complex models are not certified by
this fixture. Source execution remains isolated from authoritative verification.
