.DEFAULT_GOAL := help
UV ?= uv
PORT ?= 8787
LIVE_ARGS ?=

.PHONY: help install dev test live
help:
	@printf '%s\n' 'install  Install locked Python and Codex ACP dependencies' 'dev      Run loopback API on PORT (8787)' 'test     Deterministic protocol, state, image, and HTTP checks' 'live     Run configured real Codex acceptance helper'
install:
	$(UV) sync --locked
	npm ci
dev:
	$(UV) run --locked python -m crafty_agent --port $(PORT)
test:
	$(UV) run --locked pytest -q
live:
	$(UV) run --locked python scripts/live_check.py $(LIVE_ARGS)
