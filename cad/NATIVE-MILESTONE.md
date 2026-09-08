# Native milestone, 2026-09-08

This is the first executed local gate, not completion of CAD-RUN-1–18. The
deterministic suite harness, separate correction trial, and Docker acceptance
are still being implemented. The local boundary handles known development inputs;
it does not establish arbitrary-code isolation.

## Commands and runtime

From the repository root:

```sh
uv sync --directory cad --cache-dir .uv-cache --locked
uv run --directory cad --cache-dir .uv-cache --locked python -m crafty_cad evaluate \
  --request examples/cylinder/request.json --output runs/native-first-cylinder
uv run --directory cad --cache-dir .uv-cache --locked python tests/native_milestone.py \
  --output runs/native-milestone-1
```

Each output must be fresh. `uv --directory cad` changes the command's working
directory to `cad/`. The native module is loaded by `/usr/bin/python3 -I`, with
`/usr/lib/freecad/lib` inserted explicitly by the service-owned bridge.
`/usr/bin/FreeCADCmd` resolves to `/usr/lib/freecad/bin/FreeCADCmd` but is not the
bridge interpreter. Environment overrides: `CRAFTY_NATIVE_PYTHON`,
`CRAFTY_FREECAD_LIB`, and `CRAFTY_FONT`. No FreeCAD import is required in uv Python.

Host packages measured with `pacman -Q`: FreeCAD 1.1.3-2, revision 44987,
commit `145529fe741292ff0b3977a01195bf0247425794`; OCCT 7.9.3-3;
native Python 3.14.7, ABI `cpython-314-x86_64-linux-gnu`; Qt 6.11.2-2;
Coin 4.0.10-1; Mesa 26.2.1-1. Native modules work with matching system Python.
The uv development interpreter is CPython 3.13.9. Locked rendering dependencies
on this interpreter are NumPy 2.5.3, Pillow 12.3.0, FreeType 2.14.3. Rich 15.0.0
is locked as a development dependency for the upcoming harness.

The PNG renderer uses FreeCAD/OCCT tessellation (0.12 mm chordal deflection) on
disposable shape copies, followed by an orthographic software depth buffer.
It needs no display server, GUI, OpenGL context, or GPU. Xvfb is absent and not
required. The font is Liberation Sans 2.1.5-2 at
`/usr/share/fonts/liberation/LiberationSans-Regular.ttf`, SHA-256
`baccc64becc3eb7d104b7c84d99f5314a0a1f896e2b3ea6c2f22fc08d2003bee`.
PNG titles reserve 112 pixels in every annotation mode. The native geometry
methods are documented in the [FreeCAD API](https://freecad.github.io/SourceDoc/d8/ded/classPart_1_1TopoShape.html).

## Retained evidence and actual results

Paths below are relative to `cad/`; ignored run artifacts remain on this worker:

- `runs/native-first-cylinder/result.json`, `geometry/manifest.json`,
  `artifacts/iso.png`, and `artifacts/iso.annotations.json`.
- `runs/native-milestone-1/summary.json` records all commands, versions,
  configured limits, process peaks, baseline values, counts, and durations.
- `runs/native-milestone-1/query-0/` has the rotated-cylinder image and metrics;
  `query-1/` has the changed top camera; `query-2/` has validated
  `artifacts/part.step` and `control/part/comparison.json`.
- `runs/native-milestone-1/stale/result.json` records explicit
  `geometry_unavailable`; `restored-query/result.json` records snapshot recovery.
- Every query retains its own `geometry/manifest.json`, BRep and source bytes,
  input request, annotation sidecars where requested, and bounded native logs.

The supplied cylinder's clean verifier measured validity true, 1 solid,
x extent 20 mm, and volume 6283.185307179591 mm³. Its four criteria pass.
Total one-shot evaluation: 0.6133 s, including startup, build, clean reload,
metrics, raster, sidecar, and result preparation.

The translated/rotated fixture uses translation (7, -4, 3) mm and 30° about X.
Its clean measurements are diameter 20 mm, end-face distance 20 mm,
volume 6283.185307179597 mm³, area 1884.9555921538781 mm², and centroid
(7.000000000000002, -9, 11.66025403784439) mm. World bounds are
(-3, -22.66025403784439, -2) to (17, 4.660254037844389, 25.32050807568878) mm.
Independent dimensional/area/volume tolerance is 0.001 in the metric unit;
the analytic centroid comparison uses 1e-8 mm. Actual member features survive
BRep reload and a foreign face remains unavailable. Before/after BRep digests
and baselines are identical across camera, metric and STEP queries.

One instrumented build executed once. The clean verifier reported zero source
executions, one load and three measurement queries before restart. Final service
counts: 1 build, 1 source execution, 1 restore, 2 loads, 4 successful queries.
The stale-handle attempt is retained separately. Snapshot restore creates a new
handle and increments no source execution counter. Build/ensure: 0.1519 s;
warm image/metric queries: 0.2471 s and 0.1370 s; STEP query: 0.2227 s;
restore: 0.0322 s; restored metric query: 0.0731 s. Timings are measured samples,
not latency guarantees. Native source and verifier PIDs are distinct in logs.

Clean STEP reopen passed millimeter units, validity, solid count, bounds and
volume. Thresholds: 1e-6 mm absolute length, 1e-5 mm³ absolute volume, plus
1e-9 relative. STEP volume was 6283.185307179647 mm³. This gate does not establish
topology identity or physical fit.

The service builder opened and visually inspected the actual supplied-cylinder
and rotated-cylinder PNGs. Both show the expected solid, top-left resolved-camera
labels, and reserved title space. Broader grid/failure visual acceptance is pending.

## Limits and remaining work

Configured defaults: 30 s evaluation/native-call wall time, native address-space
and process-tree RSS 1 GiB, native cumulative CPU 300 s, 32 owned processes,
128 MiB native working output, 256 KiB log per process, 16 MiB combined input,
16 million pixels per PNG. Cache: 8 entries, 64 MiB estimated native shape memory,
300 s idle expiry, 1800 s absolute lifetime. Parsing uses native process limits.
The first cylinder measured approximately 85.5 MB build and 90 MB verifier RSS,
one native process in each tree. Complete resource/failure acceptance is pending;
local rendering currently runs in the supervisor and has a pixel bound and
cooperative deadline rather than a separate OS memory boundary.

The complete deterministic harness, hardened contract/manifest edge cases,
cap fixtures/trial collector, cancellation coverage and isolated Docker execution
remain open. Docker 29.7.2 client/server are accessible through the tool's required
sandbox escalation; no Docker acceptance has run. No native setup blocker remains
for this local milestone. Bolt/nut bodies, threads/custom nuts and complex fixtures
remain subsequent stages under CAD-RUN-16.
