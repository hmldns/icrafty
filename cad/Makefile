.DEFAULT_GOAL := help
UV ?= uv
RUN = env -u VIRTUAL_ENV $(UV) run --cache-dir .uv-cache --locked
SUITES := contract geometry views exports reuse failures
.PHONY: help sync verify $(addprefix verify-,$(SUITES)) verify-docker trial-cap
help:
	@printf '%s\n' 'Crafty CAD local verification (M-CAD-37–42)' 'sync: locked uv environment' 'verify-contract, verify-geometry, verify-views, verify-exports, verify-reuse, verify-failures' 'verify: deterministic suites in fixed order, one aggregate report' 'verify-docker: same assertions in isolated Docker (requires packaged runtime)' 'trial-cap: separate bounded correction trial (requires collected agent evidence)'
sync:
	env -u VIRTUAL_ENV $(UV) sync --cache-dir .uv-cache --locked
$(addprefix verify-,$(SUITES)):
	$(RUN) python -m crafty_cad.harness run --suite $(@:verify-%=%)
verify:
	$(RUN) python -m crafty_cad.harness run --suite all
verify-docker:
	$(RUN) python -m crafty_cad.harness run --suite all --runtime docker
trial-cap:
	$(RUN) python -m crafty_cad.trial verify
