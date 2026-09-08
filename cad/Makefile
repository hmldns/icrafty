.DEFAULT_GOAL := help

UV ?= uv
PLANNED_SUITES := verify-contract verify-geometry verify-views verify-exports verify-reuse verify-failures verify verify-docker trial-cap

.PHONY: help sync $(PLANNED_SUITES)

help:
	@printf '%s\n' \
		'CAD scaffold: help and sync work; verification harness implementation is pending.' \
		'Plan: ../docs/M-CAD.md, M-CAD-37 through M-CAD-42.' \
		'' \
		'sync             Prepare the locked uv environment' \
		'verify-contract  Planned: schemas, paths, and manifests; no native FreeCAD' \
		'verify-geometry  Planned: independent geometry assertions' \
		'verify-views     Planned: grids, individual images, cameras, JSON/inline labels' \
		'verify-exports   Planned: STEP output and roundtrip validation' \
		'verify-reuse     Planned: live handles, immutable geometry, restore without rebuilding' \
		'verify-failures  Planned: partial results, errors, timeout, cancellation' \
		'verify           Planned: all deterministic local suites' \
		'verify-docker    Planned: the same suites in the isolated runtime' \
		'trial-cap        Planned: separate bounded agent correction trial'

sync:
	$(UV) sync --locked

$(PLANNED_SUITES):
	@printf '%s\n' 'CAD target "$@" is planned, not implemented. No tests ran.' \
		'Read ../docs/M-CAD.md (M-CAD-37 through M-CAD-42) for the harness contract.' >&2
	@exit 2
