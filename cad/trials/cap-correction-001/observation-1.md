# Iteration 1: unchanged supplied source

Read the actual `iterations/001/result/result.json` after collector evaluation 1
exited 0. Execution completed; this is a failing geometry result, not a correction
success. Collector duration: 1.4762024879455566 seconds. The budget started at
`2026-09-08T21:49:45.202937Z` (epoch 1788904185.2029366).

## Measured evidence

| Check | Actual | Fixed criterion | Status |
| --- | --- | --- | --- |
| Validity | true | true | pass |
| Solid count | 1 | 1 | pass |
| Width / depth | 38 / 38 mm | 40 / 40 mm | fail / fail |
| Height | 11 mm | 12 mm | fail |
| Actual cylindrical bore diameter | 34 mm | 36 mm | fail |
| Actual inner-to-outer roof distance | 1 mm | 2 mm | fail |
| Bore Z extent (cavity depth) | 10 mm | 10 mm | pass |
| Volume | 3396.0616585305684 mm^3 | 4900.884539600077 mm^3 | fail |
| Surface area | 4649.557127312899 mm^2 | 5152.211951887261 mm^2 | fail |
| Centroid | (1.5265093279692667e-14, -1.9068752965540777e-15, 6.836725254394081) mm | measurement only | measured |

The three named features are ready and belong to `cap`. Delivered bounds are
(-19, -19, 0) to (19, 19, 11) mm. Seven of ten fixed checks fail; validity, solid
count, and cavity depth pass. These are evaluator measurements of delivered
geometry, not source-parameter assertions.

## Actual PNG inspection

Used the `view_image` tool to open all four real files under
`iterations/001/result/artifacts/`: `iso.png`, `bottom.png`, `side.png`, and
`grid.png`. The images were displayed in the Codex session before this note.
Inspection completed by `2026-09-08T21:49:54Z`, about 9 seconds after budget start.

- Isometric: a continuous circular closed top and curved exterior wall are
  visible. No additional detached object is visible. Footer reports bore 34 mm
  fail, roof 1 mm fail, and cavity 10 mm pass.
- Bottom: the camera label looks toward +Z. A concentric annular rim surrounds
  a circular interior face. The center shows the cap surface, not the background,
  consistent with a closed end above the lower opening. This straight-on image
  does not by itself establish cavity depth or roof thickness; the actual face
  measurements above supply those values.
- Side: a short, continuous rectangular silhouette with cylindrical shading.
  It does not expose the internal roof.
- Grid: the isometric, bottom, and side views repeat those observations and
  show the same failure/pass callouts legibly.

All four PNGs and their sidecars are ready. STEP was intentionally not requested
in this initial diagnostic call.

## Intended correction

The geometry has the intended closed-end arrangement and a correct 10 mm cavity,
but its outside diameter, bore diameter, total height, and roof are undersized.
Revise only `workspace/model.py`: outer radius 19 -> 20 mm, bore radius 17 -> 18 mm,
height 11 -> 12 mm, and roof 1 -> 2 mm. Keep the subtraction starting at Z=0 so
the cavity remains open toward -Z and 10 mm deep; the roof then occupies Z=10..12.
Preserve `build(parameters, inputs)` and actual-face bindings named `bore`,
`inner_roof`, and `outer_roof`. Request STEP with the next evaluation.

No service defect or unresolved contract question was found in this iteration.
