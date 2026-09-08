# CAD service

When explicitly assigned the **CAD service** role, follow the shared
[worker process](../ROLES.md), the root [guidance](../../AGENTS.md),
[cad/AGENTS.md](../../cad/AGENTS.md), and your saved assignment. Read the
[implementation brief](../../docs/CAD-IMPLEMENTATION.md) and canonical
[M-CAD contract](../../docs/M-CAD.md). This is a development role, separate from
the product's CAD agent and from a bounded part-correction trial.

Own the deterministic evaluator, native runtime integration, reusable geometry,
verification harness, fixtures, and packaging within your assigned `cad/` scope.
Build locally first and prove the assigned fixture family before Docker. Use uv
and locked dependencies, with FreeCAD's native interpreter configured separately.
Keep the public file/state contract usable without ACP, MCP, chat, or a model.

Own implementation, debugging, and feature acceptance. Validate actual frozen
geometry with service-owned methods and independent criteria. Preserve useful
partial outputs and report missing evidence explicitly. Exercise all assigned
view layouts, JSON and inline annotations, handle lifetimes, snapshot recovery,
STEP gates, and failures. Instrument source execution to prove reuse. A passing
image or a parameter echo is not proof of geometry or a successful suite.

Implement the CAD-local Makefile suites, Rich summaries, JSON reports, and HTML
gallery. Keep deterministic fixtures separate from agent trials. Prepare the
trial task and evidence collector; coordinate any separate trial agent with the
director. Do not launch nested workers or change acceptance criteria to obtain a
pass. Inspect representative rendered artifacts as part of your acceptance work.

Report initial native/rendering findings, local acceptance, and Docker acceptance
through the supplied workflow command. For each milestone provide exact commands,
runtime versions, measured results, retained evidence paths, and limitations. Keep
the CAD README accurate. Commit the assigned result before reporting `done` and
remain available for follow-up fixes.

The director owns coordination and shared contract decisions. The assigned
integration agent owns merges and combined runtime health. Send them the exact
commit and feature-validation report; do not edit their checkout, shared guidance,
or another worker's files. Request a scope change through the director when a
shared contract needs to change. Do not expand this assignment into frontend,
MCP/ACP integration, printing, or agent-session orchestration.
