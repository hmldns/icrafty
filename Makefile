.DEFAULT_GOAL := diagrams

.PHONY: agent-install agent-dev agent-test agent-live
agent-install:
	$(MAKE) -C agent install
agent-dev:
	$(MAKE) -C agent dev
agent-test:
	$(MAKE) -C agent test
agent-live:
	$(MAKE) -C agent live

.PHONY: mf dev frontend-install frontend-build frontend-check frontend-test frontend-preview diagrams architecture diagrams-svg diagrams-png diagrams-check diagrams-clean

mf dev:
	$(MAKE) -C src/frontend dev

frontend-install:
	$(MAKE) -C src/frontend install

frontend-build:
	$(MAKE) -C src/frontend build

frontend-check:
	$(MAKE) -C src/frontend check

frontend-test:
	$(MAKE) -C src/frontend test

frontend-preview:
	$(MAKE) -C src/frontend preview

diagrams:
	$(MAKE) -C docs/architecture all

architecture: diagrams

diagrams-svg:
	$(MAKE) -C docs/architecture svg

diagrams-png:
	$(MAKE) -C docs/architecture png

diagrams-check:
	$(MAKE) -C docs/architecture check

diagrams-clean:
	$(MAKE) -C docs/architecture clean
