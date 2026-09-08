# Separate cap correction trial

You are the part-correction worker, distinct from the service implementation
worker. The director assigns your work area. Do not alter service code, fixtures,
frozen criteria, or the collector. Work in the prepared trial's `workspace/`.

Correct the supplied wrong cap into one valid closed-end cap: outside radius
20 mm, actual bore radius 18 mm, height 12 mm, 2 mm roof and 10 mm cavity open
toward -Z. Preserve the public `build(parameters, inputs)` return contract and
the feature names `bore`, `inner_roof`, `outer_roof`. Independent criteria are
frozen by the collector. Expected volume is 1560π mm³; the required distance is
between the actual inner and outer roof faces. This is a synthetic fixture.

Budget: maximum eight evaluations and twenty minutes, beginning with the first
evaluation. The director can configure another explicit budget at preparation.
The first evaluation must use the unchanged supplied wrong source. Inspect its
returned PNG files and measured metrics before revising. You must use the public
file contract, through the collector below, for every evaluation. You may inspect
the evaluator documentation but must not look up a completed cap fixture or copy
its implementation. Revise the trial source yourself from the returned evidence.

From `cad/`, with `TRIAL` set to the absolute prepared trial directory:

```sh
uv run --cache-dir .uv-cache --locked python -m crafty_cad.trial evaluate \
  --trial "$TRIAL" --source "$TRIAL/workspace/model.py"
```

The collector freezes your source and criteria, then invokes the public evaluator
as `python -m crafty_cad evaluate --request .../input/request.json --output .../result`.
It records the exact command, all bytes, stdout/stderr, timing and result files.
Open `iterations/001/result/result.json` and the actual requested PNGs (especially
isometric and bottom); do not infer visual appearance from file existence.
Write your measured/visual observations and intended revision in a Markdown file.
Record that evidence before another evaluation:

```sh
uv run --cache-dir .uv-cache --locked python -m crafty_cad.trial observe \
  --trial "$TRIAL" --iteration 1 --notes "$TRIAL/workspace/observation-1.md" \
  --images iso bottom
```

Revise `workspace/model.py`, then call `evaluate` again. Add `--step` when you
expect the corrected part to pass; a successful final trial needs a validated
requested STEP as well as all fixed numerical criteria and PNG evidence. Inspect
and record the final result too. Every attempted evaluation counts, even a failure.

Maintain `workspace/transcript.md` with a concise, truthful activity transcript:
commands and tool actions, artifacts actually inspected, observed failures,
source changes and the basis for them, durations, and unresolved questions.
Do not include private reasoning; record reviewable actions and conclusions.
Retain any externally captured Codex session transcript through the director.
Finish by passing your transcript to the collector, with any unresolved questions:

```sh
uv run --cache-dir .uv-cache --locked python -m crafty_cad.trial finish \
  --trial "$TRIAL" --transcript "$TRIAL/workspace/transcript.md"
uv run --cache-dir .uv-cache --locked python -m crafty_cad.trial verify --trial "$TRIAL"
```

If you cannot finish within the budget, still retain the evidence, transcript,
and questions and call `finish`. Exhaustion/failure is a valid recorded outcome,
not permission to change criteria, hardcode a collector result, or exceed limits.
Report the trial directory and `trial-result.json` to the director. Do not merge
or claim service completion. The service builder validates the collected evidence.
