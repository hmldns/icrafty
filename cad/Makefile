.DEFAULT_GOAL := help
UV ?= uv
RUN = env -u VIRTUAL_ENV $(UV) run --cache-dir .uv-cache --locked
SUITES := contract geometry views exports reuse failures
.PHONY: help sync native-setup verify $(addprefix verify-,$(SUITES)) image-docker verify-docker trial-cap
help:
	@printf '%s\n' 'Crafty CAD verification (M-CAD-37–42)' 'sync: locked uv environment' 'native-setup: explicit adaptive OCCT bridge build' 'verify-contract, verify-geometry, verify-views, verify-exports, verify-reuse, verify-failures' 'verify: deterministic suites in fixed order, one aggregate report' 'image-docker: build pinned native/runtime image offline' 'verify-docker: same assertions and isolation gates in Docker' 'trial-cap: separate bounded correction trial (requires collected agent evidence)'
sync:
	env -u VIRTUAL_ENV $(UV) sync --cache-dir .uv-cache --locked
native-setup:
	env -u VIRTUAL_ENV $(UV) run --cache-dir .uv-cache --locked --script native/build.py
$(addprefix verify-,$(SUITES)):
	$(RUN) python -m crafty_cad.harness run --suite $(@:verify-%=%)
verify:
	$(RUN) python -m crafty_cad.harness run --suite all
verify-docker:
	$(RUN) python -m crafty_cad.harness run --suite all --runtime docker
image-docker:
	$(RUN) python docker/build.py
trial-cap:
	$(RUN) python -m crafty_cad.trial verify
