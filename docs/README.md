# Crafty documentation

Start with the document for the decision you are making. Requirement inventories
use stable paragraph identifiers with their own counters; proposed details are
reviewable design, not a claim that a service exists.

- [PRD.md](PRD.md) — product behavior, user flow, and outcomes.
- [TRD.md](TRD.md) — system implementation, isolation, state, and integration gates.
- [M-ACP.md](M-ACP.md) — reusable Codex ACP/image/MCP integration and live debug stage.
- [ACP-AGENT-STATE.md](ACP-AGENT-STATE.md) — session, turn, history, image, and replay ownership.
- [M-CAD.md](M-CAD.md) — CAD module: deterministic file input/output contract,
  verification capabilities, fixture progression, and implementation outcomes.
- [CAD-IMPLEMENTATION.md](CAD-IMPLEMENTATION.md) — implementation brief:
  first-core scope, workflow ownership, later stages, and required completion evidence.
- [Architecture index](architecture/README.md) — rendered diagrams, their sources,
  [ACP notes](architecture/ACP.md), and the [earlier decision index](architecture/ASSUMPTIONS.md).
- [IDEA.md](IDEA.md) — preserved original idea; [TODO.md](TODO.md) — working backlog.
- [Repository guidance](../AGENTS.md) and [development workflow](../WORKFLOW.md) —
  structure, conventions, and delegated development.

## Review ACP integration

Start with [M-ACP.md](M-ACP.md), especially M-ACP-1–7 for module/configuration
boundaries, M-ACP-10–16 for images and MCP components, and M-ACP-19–20 for proof.
Then read [ACP-AGENT-STATE.md](ACP-AGENT-STATE.md) for identities, history,
permissions, and restart/reconnect semantics. The
[interaction schematic](architecture/rendered/acp-integration.svg) shows the
complete local chain. [Existing protocol notes](architecture/ACP.md) and the
[container lifecycle](architecture/rendered/sessions.svg) describe the wider target.

## Review CAD only

Read [M-CAD.md](M-CAD.md) first. Review the [core contract diagram](architecture/rendered/cad-contract.svg)
for code in and selected artifacts/metrics out, then the
[development loop](architecture/rendered/cad-development.svg) for acceptance and
increasing part complexity. These cover the evaluator independently of agents.
M-CAD-31–34 cover separate views, composed grids, top-left camera titles, and
JSON/inline annotations. M-CAD-20 and M-CAD-35–36 cover ensured geometry, live
handles, and snapshot recovery without rebuilding. M-CAD-37–42 define the local
Makefile suites and Rich verification harness. CAD-PROTOCOL-13–15 cover message
grouping, annotation handoff, and geometry operations.

Then read the short [CAD handoff protocol](architecture/CAD-PROTOCOL.md) and its
[diagram](architecture/rendered/cad-handoff.svg) to check that local paths,
immutable bytes, retries, and publication fit the future MCP wrapper. The
[CAD package README](../cad/README.md) documents the implemented evaluator and
accepted cylinder/sleeve/closed-end-cap core. Evidence is retained in the
[native milestone](../cad/NATIVE-MILESTONE.md),
[local verification](../cad/LOCAL-GATE.md),
[separate cap correction trial](../cad/TRIAL-GATE.md), and
[Docker acceptance](../cad/DOCKER-GATE.md) records. Full ACP/session diagrams are
background for this review.

For implementation scope and subsequent stages, review the
[handoff brief](CAD-IMPLEMENTATION.md): CAD-RUN-1 and CAD-RUN-7–15 define the
first delivery and proof; CAD-RUN-16 lists the subsequent fixture stages.
