# Cap correction trial 001

The separate CAD-RUN-14 correction trial **passed** after two public evaluator
calls and one source revision. All ten fixed geometry criteria passed in iteration
2, all four requested PNGs were inspected, and the requested STEP passed the clean
reopen gate. The collector recorded **2 / 8 evaluations** and
**135.27897667884827 / 1200 seconds** (2 minutes 15.279 seconds).
`trial finish` and `trial verify` both exited **0**. There are no collector failure
reasons or unresolved trial questions.

This handoff records the bounded correction trial only. The CAD service builder
validates its evidence; the existing integration agent owns any merge. It does not
declare the complete CAD service assignment finished.

## Identity and retained evidence

- Worker: `cad-cap-correction`, assignment generation 1.
- Branch: `builders/crafty-builders/cad-cap-correction`.
- Exact committed trial baseline: `7dfa335388224fd151fbcda562cac510d21089c9`.
  At preparation this was also current `main`, and the clean worker HEAD contained
  `aeecdf71ecec065dbcca00b498e0ba2a7edaf90a`. All ancestry checks exited 0.
- Only working checkout:
  `/home/hmldns/devel/sandbox/crafty/.worktrees/cad-cap-correction`.
- Absolute retained trial directory:
  `/home/hmldns/devel/sandbox/crafty/.worktrees/cad-cap-correction/cad/runs/trials/cap-correction-001`.
- Authoritative result:
  [trial-result.json](../../runs/trials/cap-correction-001/trial-result.json).
  SHA-256: `39ea688097279e04aa5651c070cbec7e2ab453c3c5c20d818572eb951d913703`.
  State is `finished`, outcome is `passed`, reasons and unresolved questions are
  empty arrays.

The tracked [model.py](model.py), [transcript.md](transcript.md), and
[observation-1.md](observation-1.md) / [observation-2.md](observation-2.md) are exact
copies of the completed workspace files. The transcript also matches the
collector-frozen `transcript.md`; the observations match the collector's iteration
copies; the final model matches the evaluated iteration 2 source. Native geometry,
PNGs, STEP, requests/results, and logs remain in the ignored trial directory.
The director retains the external visible Codex tool/session transcript separately.

## Trial sequence and timing

Preparation ran once and was inert. First evaluation used the exact unchanged
wrong source; its SHA-256 was
`c24a8345d8e5f063ea8c11de6cbe8ac4c9129d45102b81ea85a2f99111db6306`.
After reading its actual result and opening its real PNGs, the worker recorded
observation 1 before editing the source or evaluating again. The revision set
outside radius 19 -> 20 mm, bore radius 17 -> 18 mm, height 11 -> 12 mm, and roof
1 -> 2 mm. It retained the supplied cylinder subtraction, bottom opening, and
actual-face bindings named `bore`, `inner_roof`, and `outer_roof`, through the
public `build(parameters, inputs)` contract.

Iteration 2 requested STEP and passed. Its actual results, all PNGs, and STEP
comparison were inspected and observation 2 was recorded before `finish`.
No additional evaluation, failed attempt, interruption, separate modeling tool,
or nested agent occurred. No completed cap fixture or service test suite was read.

| Event | Elapsed from collector trial start | Outcome |
| --- | ---: | --- |
| Evaluation 1 start | 0.023019791 s | Exit 0; seven fixed checks fail |
| Evaluation 1 duration | 1.4762024879455566 s | Valid diagnostic geometry and PNGs |
| Observation 1 recorded | 44.535464287 s | Exit 0; precedes revision/evaluation 2 |
| Evaluation 2 start | 58.298228264 s | Exit 0; all ten fixed checks pass |
| Evaluation 2 duration | 1.4787700176239014 s | PNGs and validated STEP ready |
| Observation 2 recorded | 118.086801291 s | Exit 0; final actual-image inspection |
| Finish | 135.27897667884827 s | Exit 0; passed |
| Verify after finish | Clock already stopped | Exit 0; passed |

Authoritative clock: `2026-09-08T21:49:45.179917Z` (epoch 1788904185.1799169)
through `2026-09-08T21:52:00.458894Z` (epoch 1788904320.4588935).
Timing clarification: the frozen working notes call iteration 1's start
1788904185.2029366 the budget start. The collector's actual trial clock starts
0.023019790649414062 seconds earlier. The authoritative total and elapsed event
values above use the collector's trial clock. The notes are preserved unchanged.

## Fixed criteria and actual measurements

Criteria were neither edited nor relaxed. The 1487-byte
`frozen/criteria.json` retains SHA-256
`eeeacc18825eb0aa918f20b478d4b7f98cf6af86a25eb46c717ceb4d359ed118`.
The frozen task digest is
`6c90c3c85d58a55675d71547dfab4743a017e0c444a342877ad4bb05f2a70402`.
Both actual request metric arrays match the frozen criteria exactly. Scalar
criteria use unchanged absolute tolerance 0.001 in the indicated units; boolean
and solid-count equality are exact. Centroid is measurement-only.

| Metric | Initial measured value/status | Final measured value/status | Fixed expected value |
| --- | --- | --- | --- |
| Validity | true / pass | true / pass | true |
| Solid count | 1 / pass | 1 / pass | 1 |
| X extent | 38 mm / fail | 40 mm / pass | 40 mm |
| Y extent | 38 mm / fail | 40 mm / pass | 40 mm |
| Z extent | 11 mm / fail | 12 mm / pass | 12 mm |
| Actual bore diameter | 34 mm / fail | 36 mm / pass | 36 mm |
| Actual roof-face distance | 1 mm / fail | 2 mm / pass | 2 mm |
| Bore Z extent / cavity | 10 mm / pass | 10 mm / pass | 10 mm |
| Volume | 3396.0616585305684 mm^3 / fail | 4900.884539600079 mm^3 / pass | 4900.884539600077 mm^3 = 1560*pi |
| Surface area | 4649.557127312899 mm^2 / fail | 5152.211951887267 mm^2 / pass | 5152.211951887261 mm^2 |
| Centroid | approximately (0, 0, 6.836725254394081) mm / measured | approximately (0, 0, 8.076923076923077) mm / measured | No criterion |

The final bounds are (-20, -20, 0) to (20, 20, 12) mm; all three actual-face
feature bindings are ready. The actual cylindrical bore diameter establishes
18 mm bore radius. The cap retains its closed roof at Z=10..12 and a cavity open
toward -Z. The 20 mm outside radius is supported by the cylindrical construction,
measured 40 mm X/Y extents, and inspected circular exterior. The fixed outside
checks themselves are bbox extents. Numerical evidence comes from delivered
geometry, not from source constants or a model-authored pass claim.

Initial complete evaluator result:
[iterations/001/result/result.json](../../runs/trials/cap-correction-001/iterations/001/result/result.json).
Final complete evaluator result:
[iterations/002/result/result.json](../../runs/trials/cap-correction-001/iterations/002/result/result.json),
SHA-256 `3675df004dba6383953c51891c0aee2b33ee9d81eebe3e6eed583baae21031c5`.
Final source SHA-256:
`47415fed900970e082a329df75e09fd03802f6de040546ec9f8cc3cb94155ea0`.

## Images, STEP, and native artifacts

The worker opened each real `iso.png`, `bottom.png`, `side.png`, and `grid.png`
under both iterations' `result/artifacts/` using the `view_image` tool: eight
actual PNG inspections in total. Both collector `observe` calls attested the
required `iso` and `bottom` digests. The isometric views show an intact closed top;
bottom views show a concentric annular rim surrounding the interior circular face;
side views show a continuous exterior silhouette. The grid shows the same three
views. Final annotations read bore 36 mm pass, roof 2 mm pass, cavity 10 mm pass.
Straight-on bottom and side images do not alone establish internal depth or roof
thickness; those conclusions use actual feature measurements. Detailed image
observations are in the two notes.

| Final artifact | Status and retained path |
| --- | --- |
| Isometric PNG | ready; [iso.png](../../runs/trials/cap-correction-001/iterations/002/result/artifacts/iso.png) |
| Bottom PNG | ready; [bottom.png](../../runs/trials/cap-correction-001/iterations/002/result/artifacts/bottom.png) |
| Side PNG | ready; [side.png](../../runs/trials/cap-correction-001/iterations/002/result/artifacts/side.png) |
| Three-view grid PNG | ready; [grid.png](../../runs/trials/cap-correction-001/iterations/002/result/artifacts/grid.png) |
| STEP | ready; [cap.step](../../runs/trials/cap-correction-001/iterations/002/result/artifacts/cap.step) |
| STEP gate | passed; [comparison.json](../../runs/trials/cap-correction-001/iterations/002/result/control/cap/comparison.json) |
| Native bundle | retained; [geometry/manifest.json](../../runs/trials/cap-correction-001/iterations/002/result/geometry/manifest.json), adjacent `cap.brep` and frozen source |

All four final PNG sidecars are ready beside their images. PNG sizes are
800 x 600 for independent views and 1316 x 996 for the grid. Each iteration retains
`input/model.py`, `input/request.json`, `stdout.log`, `stderr.log`, `observation.md`,
and the full result tree, including native/render control files and logs.

The worker read the real STEP comparison JSON. `clean-step-reopen@1` reports
`passed: true` with all five checks true: mm units, validity, single solid, world
bounds, and volume. Reopened bounds match (-20, -20, 0) to (20, 20, 12) mm and
reopened volume is 4900.8845396000725 mm^3. The gate uses 1e-6 mm / 1e-5 mm^3
absolute tolerances plus relative 1e-9. STEP size is 5177 bytes and SHA-256 is
`b11fa538413bcbdfcd9e2de5489506b7a1bcd0097a4480b45cd19c88feaa0708`.

Native provenance reports FreeCAD 1.1.3 revision 44987, OCCT 7.9.3, native Python
3.14.7, and headless software rendering with locked uv NumPy 2.5.3 / Pillow 12.3.0.

## Commands and post-termination handoff

These are the actual collector commands, with the full absolute path factored
into `CAD_TRIAL_DIR` for readability. The actual tool invocations used absolute
arguments. From the worker checkout root:

```sh
uv sync --directory cad --cache-dir .uv-cache --locked
uv run --directory cad --cache-dir .uv-cache --locked python -m crafty_cad.trial prepare --output runs/trials/cap-correction-001
```

The first sync failed on sandbox DNS; the same locked command succeeded with
approved network access. Preparation exited 0. No evaluator call occurred during
setup. From `cad/`, with the source revision between the two evaluate calls and
actual metric/image inspections before each observe:

```sh
CAD_TRIAL_DIR=/home/hmldns/devel/sandbox/crafty/.worktrees/cad-cap-correction/cad/runs/trials/cap-correction-001
uv run --cache-dir .uv-cache --locked python -m crafty_cad.trial evaluate --trial "$CAD_TRIAL_DIR" --source "$CAD_TRIAL_DIR/workspace/model.py"
uv run --cache-dir .uv-cache --locked python -m crafty_cad.trial observe --trial "$CAD_TRIAL_DIR" --iteration 1 --notes "$CAD_TRIAL_DIR/workspace/observation-1.md" --images iso bottom
uv run --cache-dir .uv-cache --locked python -m crafty_cad.trial evaluate --trial "$CAD_TRIAL_DIR" --source "$CAD_TRIAL_DIR/workspace/model.py" --step
uv run --cache-dir .uv-cache --locked python -m crafty_cad.trial observe --trial "$CAD_TRIAL_DIR" --iteration 2 --notes "$CAD_TRIAL_DIR/workspace/observation-2.md" --images iso bottom
uv run --cache-dir .uv-cache --locked python -m crafty_cad.trial finish --trial "$CAD_TRIAL_DIR" --transcript "$CAD_TRIAL_DIR/workspace/transcript.md"
uv run --cache-dir .uv-cache --locked python -m crafty_cad.trial verify --trial "$CAD_TRIAL_DIR"
```

All six commands exited 0. The first evaluator's exit 0 means completed execution,
with seven failed checks; the successful correction is specifically iteration 2.
Each collector evaluation ran the recorded public `python -m crafty_cad evaluate
--request .../input/request.json --output .../result` command exactly once.

After finish and verify, the worker read `trial-result.json`, listed the retained
iteration evidence, created this tracked directory, and copied the four workspace
files. A read-only stdlib audit run as `uv run --cache-dir .uv-cache --locked python -`
exited 0: all frozen digests match, both requests preserve criteria exactly, all
handoff copies match workspace/collector bytes, iteration 1 matches the supplied
wrong source, and the final model matches evaluated iteration 2. That audit read
files only; it did not execute modeling code or the evaluator.

No final trial requirement failed or remained untested within the fixed contract.
Physical fit, manufacturing suitability, strength, topology identity after STEP
export, Docker acceptance, retained-runtime reuse, and product integration are
outside this trial's validation. No service code, dependencies/lock, immutable
fixtures, collector, shared docs, other worktree, or manual collector state was
changed. Only this tracked handoff directory is intended for the worker commit.

Git handoff blocker: staging the five explicit files in this directory failed
with exit 128:

```text
fatal: Unable to create '/home/hmldns/devel/sandbox/crafty/.git/worktrees/cad-cap-correction/index.lock': Read-only file system
```

No commit was created and no file was staged. HEAD remains the exact baseline
`7dfa335388224fd151fbcda562cac510d21089c9`. The `git diff --cached --check` and staged
listing chained after `git add` did not run. An earlier unstaged `git diff --check`
exited 0, but did not check the new untracked files; the read-only handoff byte
audit above did pass. `git diff --no-index` against the supplied wrong source
showed only the four dimension changes and module description (its exit 1 denotes
that expected difference).

Per `workflow/ROLES.md`, Git permission blockers are reported with `--status
blocked` for the integration agent to handle. The requested action is to review
and checkpoint only these five owned handoff files, then return the exact commit
so the worker can verify it and issue the required clean `done` report. This Git
blocker does not change the recorded successful trial outcome or its fixed budget.
