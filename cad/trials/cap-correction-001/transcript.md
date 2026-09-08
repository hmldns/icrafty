# Cap correction trial activity transcript

Worker: `cad-cap-correction`, assignment generation 1. Baseline:
`7dfa335388224fd151fbcda562cac510d21089c9` on
`builders/crafty-builders/cad-cap-correction`.

All modeling evaluations use the public trial collector. Commands below run in
the assigned checkout; evaluation/observation commands run from `cad/`.
`CAD_TRIAL_DIR` denotes
`/home/hmldns/devel/sandbox/crafty/.worktrees/cad-cap-correction/cad/runs/trials/cap-correction-001`.
This file records actions and conclusions, not private reasoning. The director
retains the external Codex tool/session transcript separately.

## Preparation (before the budget clock)

- Read the shared root `AGENTS.md`, `workflow/ROLES.md`, `WORKFLOW.md`,
  `workflow/README.md`, `cad/AGENTS.md`, and the saved assignment.
- Read `cad/fixtures/trial-cap/TASK.md` in full and `cad/README.md`, including
  setup, public request/source/result, and trial commands. Read only the public
  source/result sections of `docs/M-CAD.md` as additional contract context.
  Did not inspect a completed cap fixture, service test suite, or another correct
  cap implementation. No other agent was launched.
- Ran `pwd`, `git status --short`, `git rev-parse HEAD`, and
  `git branch --show-current`. The assigned checkout was clean at the baseline
  above. `git merge-base --is-ancestor aeecdf71ecec065dbcca00b498e0ba2a7edaf90a HEAD`,
  `git merge-base --is-ancestor 7dfa335 HEAD`, and
  `git merge-base --is-ancestor main HEAD` all exited 0. Main was the same baseline.
- Ran `uv sync --directory cad --cache-dir .uv-cache --locked` from the worktree
  root. Initial attempt exited 1 because the sandbox could not resolve the locked
  dependency download host. Retried the same command with approved network access;
  it exited 0 and installed the locked dependencies in this checkout's `cad/.venv`.
  uv warned that the inherited workflow VIRTUAL_ENV was ignored in favor of the
  local project environment. No dependency or lockfile edits were made.
- Ran `uv run --directory cad --cache-dir .uv-cache --locked python -m crafty_cad.trial prepare --output runs/trials/cap-correction-001`.
  Exit 0; the collector created the independent trial at approximately
  `2026-09-08T21:49:12Z`. Preparation was called once.
- Listed only this trial's files and read `trial.json` and `workspace/model.py`.
  State was `ready`, `started_at` was null, and there were no iterations.
  Budget was 8 evaluations / 1200 seconds. The source was still the supplied
  deliberately wrong model. Frozen criteria SHA-256:
  `eeeacc18825eb0aa918f20b478d4b7f98cf6af86a25eb46c717ceb4d359ed118`.
  Frozen wrong-source SHA-256:
  `c24a8345d8e5f063ea8c11de6cbe8ac4c9129d45102b81ea85a2f99111db6306`.
- Sent the supplied workflow report with `--status progress`, reporting the
  baseline, successful preparation, and imminent first unchanged-source call.
  Reporting exited 0 (event 173). No evaluation had run when this report was sent.

## Trial activity

- Read `frozen/criteria.json` without changing it. Ran `cmp` between
  `frozen/wrong-cap.py` and `workspace/model.py` (exit 0) and `sha256sum` on the
  workspace source; its digest matched the frozen wrong source above.
- From `cad/`, ran:

  ```sh
  uv run --cache-dir .uv-cache --locked python -m crafty_cad.trial evaluate --trial "$CAD_TRIAL_DIR" --source "$CAD_TRIAL_DIR/workspace/model.py"
  ```

  The actual invocation used the full absolute paths represented by that variable.
  This was evaluation 1 and the first/only attempt so far. It started the clock at
  epoch 1788904185.2029366 (`2026-09-08T21:49:45.202937Z`). Collector and evaluator
  exited 0; collector duration was 1.4762024879455566 seconds. Source digest was
  unchanged. The collector retained its exact evaluator argv, input source/request,
  result, logs, geometry, and PNGs beneath `iterations/001/`.
- Read the complete actual `iterations/001/result/result.json` using `cat`.
  Execution completed, but width/depth 38/38 mm, height 11 mm, bore diameter 34 mm,
  roof 1 mm, volume 3396.0616585305684 mm^3, and area 4649.557127312899 mm^2 failed
  the fixed checks. Validity true, one solid, and 10 mm cavity passed. Centroid was
  measurement-only. All named features, four PNGs, and four sidecars were ready.
- Opened and visually inspected the real `iso.png`, `bottom.png`, `side.png`, and
  `grid.png` in `iterations/001/result/artifacts/` with `view_image` (images displayed
  in the external tool transcript). `date -u` after inspection returned
  `2026-09-08T21:49:54Z`, about 9 seconds after clock start. The isometric view shows
  a closed top; bottom shows a concentric rim and interior face. The side is a
  continuous rectangular silhouette. All show the expected bore/roof failure and
  cavity pass annotations. Exact depth is established by metrics, not this visual
  impression.
- Wrote `workspace/observation-1.md` with the measured values, actual image
  observations, and the intended dimension correction before any source revision.
- Recorded the observation with:

  ```sh
  uv run --cache-dir .uv-cache --locked python -m crafty_cad.trial observe --trial "$CAD_TRIAL_DIR" --iteration 1 --notes "$CAD_TRIAL_DIR/workspace/observation-1.md" --images iso bottom
  ```

  Exit 0; recorded at epoch 1788904229.7153811 (elapsed 44.5124445 seconds), with
  the two inspected image digests and actual result digest. The other two images
  were also opened, as described above and in the note.
- Applied a patch only to `workspace/model.py`: set outside radius to 20, bore
  radius to 18, total height to 12, and roof thickness to 2 mm. Updated the module
  description to identify the correction. The existing cylinder subtraction,
  bottom opening, actual-face feature selection, and public build/return contract
  remain in use. No evaluation ran during revision; no frozen criterion changed.
- From `cad/`, ran the second evaluation, requesting final STEP:

  ```sh
  uv run --cache-dir .uv-cache --locked python -m crafty_cad.trial evaluate --trial "$CAD_TRIAL_DIR" --source "$CAD_TRIAL_DIR/workspace/model.py" --step
  ```

  Collector/evaluator exit 0. Start epoch 1788904243.4781451 (elapsed
  58.2752085 seconds); collector duration 1.4787700176239014 seconds. The corrected
  source digest is `47415fed900970e082a329df75e09fd03802f6de040546ec9f8cc3cb94155ea0`.
  There have been exactly two evaluation attempts, both via the collector.
- Read the entire actual `iterations/002/result/result.json`. All ten fixed
  criteria passed: valid single solid, 40 x 40 x 12 mm bounds extent, actual bore
  diameter 36 mm, actual roof-face distance 2 mm, cavity depth 10 mm, volume
  4900.884539600079 mm^3, area 5152.211951887267 mm^2. Centroid was measured separately
  at approximately (0, 0, 8.076923076923077) mm. All three features, four PNGs with
  sidecars, and the requested STEP were ready.
- Opened and visually inspected the real iteration 2 `iso.png`, `bottom.png`,
  `side.png`, and `grid.png` with `view_image`. Isometric shows the closed top;
  bottom shows the concentric rim/interior face; side remains a continuous exterior
  silhouette. The images/grid show bore 36 mm, roof 2 mm, cavity 10 mm pass callouts.
  The accompanying `date -u` returned `2026-09-08T21:50:52Z`, about 67 seconds after
  budget start. Exact dimensions are supported by measured geometry, not pixels.
- Read the actual `iterations/002/result/control/cap/comparison.json` with `cat`.
  `clean-step-reopen@1` passed mm-unit, validity, single-solid, world-bounds, and
  volume checks. Reopened volume is 4900.8845396000725 mm^3; bounds are
  (-20, -20, 0) to (20, 20, 12) mm. Validated STEP is the 5177-byte
  `iterations/002/result/artifacts/cap.step`. This reading did not run another
  model or evaluator.
- Wrote `workspace/observation-2.md` with final measurements, actual visual
  observations, and STEP gate evidence. No further source revision is planned.
- Recorded final inspection with:

  ```sh
  uv run --cache-dir .uv-cache --locked python -m crafty_cad.trial observe --trial "$CAD_TRIAL_DIR" --iteration 2 --notes "$CAD_TRIAL_DIR/workspace/observation-2.md" --images iso bottom
  ```

  Exit 0; recorded at epoch 1788904303.2667181, elapsed 118.0637815 seconds. Its
  image digests identify the actually viewed final isometric/bottom PNGs. Both
  iterations' observations now precede termination; iteration 1 observation
  preceded the correction and second evaluation.

## Terminal handoff

Two evaluations have been attempted; the second passed all fixed checks and
produced the validated STEP. No attempted/failed/interrupted evaluation is omitted.
No unrecorded modeling call, other model tool, or nested worker was used. The only
model source edited was `workspace/model.py`. Frozen inputs, criteria, collector,
service, and `trial.json` were not manually modified. Each source/request/result,
log, geometry bundle, and artifact remains in its collector iteration directory.

There are no unresolved trial questions. This is a synthetic local cap correction;
physical fit, printability, strength, topology equivalence, Docker isolation, and
product-session integration were not tested. This does not declare the CAD service
assignment complete. The service builder validates the trial evidence; the existing
integration agent owns any merge.

This activity transcript is about to be frozen by `finish`. The next commands are
listed here as pending, so their outcome is not asserted before execution:

```sh
uv run --cache-dir .uv-cache --locked python -m crafty_cad.trial finish --trial "$CAD_TRIAL_DIR" --transcript "$CAD_TRIAL_DIR/workspace/transcript.md"
uv run --cache-dir .uv-cache --locked python -m crafty_cad.trial verify --trial "$CAD_TRIAL_DIR"
```

The post-termination `REPORT.md` will record actual finish/verify outcomes and
collector elapsed time. This transcript and both observation notes will be copied
unchanged into the owned tracked handoff, along with the final model; native/run
artifacts remain in the ignored runtime directory.
