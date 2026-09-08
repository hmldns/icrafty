# Local deterministic gate and correction-trial handoff

Local acceptance executed on 2026-09-08. This historical checkpoint preceded the
accepted [separate correction trial](TRIAL-GATE.md) and
[executed Docker gate](DOCKER-GATE.md). The first native milestone is retained
separately in [NATIVE-MILESTONE.md](NATIVE-MILESTONE.md).

`make -C cad verify` passed **77/77** cases in 37.552 seconds. Its versioned
summary and self-contained gallery are retained under
`cad/runs/verification/20260908-144409-67d0e3a7/` in this worker checkout.
Every individual Make target was also executed, with exit 0:

- `verify-contract`: 29 cases; `20260908-144224-5a989767`.
- `verify-geometry`: 9 cases; `20260908-144200-bd46aaff`.
- `verify-views`: 14 cases; `20260908-144225-244fe10b`.
- `verify-exports`: 3 cases; `20260908-144238-f9f32ffb`.
- `verify-reuse`: 4 cases; `20260908-144240-f7b80298`.
- `verify-failures`: 18 cases; `20260908-144245-8388fb28`.

Those directory names are beneath `cad/runs/verification/`. The aggregate
records fixed suite/case order, all assertion details, frozen evaluator inputs,
results, native/raster logs, versions, effective limits and process peaks.
A negative fixture is an expected harness assertion; its evaluator's actual
failed/unavailable metric remains visible in its report and gallery.

## Geometry and visual evidence

The cap's actual clean measurements: validity true; 1 solid; bounds 40×40×12 mm;
bore face diameter 36 mm; roof face-to-face distance 2 mm; bore axial extent
10 mm; volume 4900.884539600079 mm³; area 5152.211951887267 mm²; centroid
approximately (0,0,8.076923076923077) mm. Independent criteria and derivations
are in [fixtures/EXPECTATIONS.md](fixtures/EXPECTATIONS.md).

Wrong-bore, missing-roof and extra-solid fixtures fail their intended checks
while retaining PNGs/sidecars. An actual self-intersecting face reports native
validity false and unavailable solid volume. Placement/member-map checks use a
translated, rotated cylinder and a deliberately foreign face.

Within the aggregate directory, inspect:

- `geometry/cap/evaluation-1/`: result, native snapshot, isometric/bottom/side PNGs
  and grid, with camera titles and measured bore/roof/cavity callouts.
- `geometry/wrong-bore/evaluation-1/`, `geometry/missing-roof/evaluation-1/`, and
  `geometry/extra-solid/evaluation-1/`: diagnostic negative artifacts.
- `views/failed-view/evaluation-1/artifacts/grid.png`: visibly failed bottom slot,
  with intact isometric/front panels and their own camera lineage.
- `views/failed-sidecar/evaluation-1/`: completed PNG retained when sidecar fails.
- `exports/requested-only-and-clean-reopen/step/artifacts/cap.step`: requested
  STEP validated by clean native reopen; comparison under `control/cap/`.
- `exports/reopen-rejects-wrong-unit/evaluation-1/`: actual changed-unit export
  fails the clean reopen gate while its independent PNG remains ready.

The builder opened and visually inspected the actual native milestone images,
cap callout grid and failed-panel grid. The rendered bottom cavity boundary uses
real depth discontinuities. Deterministic tests additionally compare exact inline
title pixels to normalized sidecar text/positions and confirm geometry framing
across annotation modes. No synthetic image generator is used.

## Reuse, limits and failures

The aggregate reuse case executes source once across ensure, image, metric,
changed-camera/criterion and STEP requests. It records 1 build, 1 cache hit,
1 restore, 2 loads and 4 successful queries; the clean verifier itself executes
source zero times. A second entirely fresh runtime restores with 0 source
executions, 1 restore and 1 native load. Before/after BRep digests and baselines
are identical. Release/expiry/restart fail explicitly; pins defer release;
idle expiry unloads native memory without requiring another caller request.

Measured samples: cold ensure 0.1601 s; warm image 0.2397 s; metrics 0.0685 s;
changed camera 0.2760 s; STEP 0.2344 s; restore after restart 0.0401 s; restore in
an entirely fresh runtime 0.0339 s. These are recorded samples, not latency claims.
The first milestone separately retains a metrics query after restoration.

Native build, clean verifier, STEP reopener and raster subprocesses are bounded;
raster now has its own OS address-space/CPU/file limits. The supervisor monitors
aggregate output and owned process-tree RSS/counts and reaps terminated children.
Tests exercise memory/CPU/process/output limits, bounded logs, descendant timeout
cleanup, cooperative cancellation preserving geometry, forced native cancellation
invalidating handles, explicit snapshot recovery, malformed response detection,
source-authored report rejection, changed input/source bytes, undeclared ordinary
file reads, and interrupted finalization. Local controls are documented in the
[README](README.md); Docker isolation has not yet been claimed or executed.

Harness control reports prove direct exits 0/1/2/130, JSON-only stdout, intended
negative versus unexpected failure, missing native setup, empty selection and
interruption. A missing trial remains a recorded prerequisite rather than a pass.

## Separate correction worker startup

The immutable task is [fixtures/trial-cap/TASK.md](fixtures/trial-cap/TASK.md).
The collector is `python -m crafty_cad.trial`; all modeling runs call the public
`python -m crafty_cad evaluate --request ... --output ...` command.

An inert prepared workspace is retained at:

`/home/hmldns/devel/sandbox/crafty/.worktrees/cad-service/cad/runs/trials/cap-correction-001`

It contains `trial.json`, frozen task/source/criteria and editable
`workspace/model.py`. No evaluation or agent was launched and its budget clock
has not started. The director assigns a separate worker and grants its trial
workspace; the worker follows the task's evaluate/inspect/observe/revise/finish
instructions. It may alternatively prepare the same task in its own baseline
checkout using the committed collector. The checkpoint commit is supplied through
the workflow progress report. The service builder does not launch the trial or
provide its correction.

From `cad/`, after setting `TRIAL` to that absolute directory, the first command is:

```sh
uv run --cache-dir .uv-cache --locked python -m crafty_cad.trial evaluate \
  --trial "$TRIAL" --source "$TRIAL/workspace/model.py"
```

Maximum 8 evaluations / 1200 seconds starts with that call. The first source must
match the wrong baseline. Every next evaluation requires recorded inspection of
its predecessor. The final evaluation must include `--step`, all unchanged
criteria must pass, images must be inspected, and the worker must retain its
transcript and unresolved questions. The director should also retain the actual
Codex tool/session transcript for review. Return the trial directory and
`trial-result.json` for service-builder collector validation.

Collector tests execute only the fixed wrong source and budget/missing-evidence
controls. They do not contain a scripted correction and are not cap-trial acceptance.
Docker packaging/acceptance follows the independently collected trial outcome.
