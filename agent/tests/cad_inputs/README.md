# Native input fixture

`nurbs-cap.step` is service-generated deterministic test data, not a user upload.
It comes from `cad/fixtures/nurbs-cap/model.py`: outer radius 35 mm, bore radius
33 mm, height 16 mm, cavity depth 14 mm. Expected volume is `4354*pi` mm³.
The service exported it with exact trimming curves and independently reopened it
before retaining this copy. The test imports these bytes through both real MCP
roles, ensures once, then requests PNG and validated STEP from retained geometry.

The modeling actor is synthetic and explicitly identified in its report. Actual
live conversational/CAD-agent acceptance is separately documented in
`agent/CAD-LIVE-ACCEPTANCE.md`. An operator can set `CRAFTY_TEST_CAD_INPUT` to an
authorized unchanged STEP copy for a separately retained diagnostic run. Such a
run measures volume without inventing an analytic volume criterion for that file.
