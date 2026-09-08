# Cylinder contract example

[model.py](model.py) and [request.json](request.json) illustrate the proposed
M-CAD-5–13 input contract. The evaluator that consumes them is not implemented.
The build function runs inside FreeCAD's Python environment.

The cylinder has radius 10 mm and height 20 mm. The independent volume expectation
is `pi * 10^2 * 20 = 6283.185307179586 mm^3`. The request asks for an isometric PNG,
validity, solid count, x extent, and volume. It does not request STEP.

[request-grid.json](request-grid.json) uses the same source and parameters to
request one 2-by-2 PNG with isometric, top, front, and right views, without metrics
or STEP. Each panel includes its own view/camera title at the top-left. To request
both layouts in one evaluation, include the individual `iso` output from the
first request alongside `overview` from the grid request. M-CAD-31–33 define the
layout and per-view metadata; CAD-PROTOCOL-13 controls chat message grouping.
Both requests explicitly select a JSON annotation sidecar and inline labels.
M-CAD-34 describes their shared records and coordinate mapping; CAD-PROTOCOL-14
preserves both forms through file transfer and publication.

For a later query of ensured geometry, use [request-reuse.json](request-reuse.json)
in a retained runtime. Replace its illustrative handle with the one returned by
`ensure_geometry`; it requests volume without rebuilding the source or rendering
images. An expired handle must be reported explicitly. The file documents the
planned contract and is not runnable against this scaffold.

A first negative case changes the code to build radius 9 mm while leaving this
request's expected values fixed. It must yield failing size/volume checks and
retain the available image. Formal fixtures and assertions belong in `fixtures/`
and `tests/` when the evaluator is implemented.
