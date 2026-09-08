# Project guidance

Crafty turns conversation, photos, annotations, and measurements into small
replacement parts. One project represents one repair. The intended product
outcome is a downloadable STEP file, with images and numerical evidence useful
throughout design. The first possible example is a replacement mug cap.

## Repository map

- [docs/](docs/README.md) is the documentation index. Product behavior belongs in
  [PRD.md](docs/PRD.md), technical decisions in [TRD.md](docs/TRD.md), and the CAD
  evaluator contract in [M-CAD.md](docs/M-CAD.md). Preserve [IDEA.md](docs/IDEA.md)
  as the original input. [TODO.md](docs/TODO.md) is a working backlog.
- [docs/architecture/](docs/architecture/README.md) contains PlantUML sources,
  checked-in SVG/PNG renders, ACP notes, and the CAD file-handoff protocol.
- [cad/](cad/README.md) is an independent Python project managed by uv. It is
  currently a scaffold for deterministic FreeCAD execution, rendering, and
  verification. Read its [local guidance](cad/AGENTS.md) before editing it. The
  [implementation brief](docs/CAD-IMPLEMENTATION.md) defines the first delegation.
- [src/frontend/](src/frontend/README.md) contains the React/TypeScript app and
  the implemented browser-local capture, annotation, and download flow. Read its
  [local guidance](src/frontend/AGENTS.md) before editing it.
- [workflow/](workflow/README.md) contains development-worker coordination,
  launchers, role instructions, and tests. `./builders` forwards to
  `./workflow/builders`. `.builders/` and `.worktrees/` are ignored runtime state.
- The root [Makefile](Makefile) provides frontend and diagram shortcuts. Backend,
  product-session orchestration, and MCP integration are design work; do not
  describe them as implemented services.

## Architecture boundaries

The intended runtime uses separate conversational and CAD agents, each in its own
recoverable session container. FreeCAD evaluates submitted code; the CAD agent
owns the inspect-and-revise loop. These application agents are distinct from the
development workers managed by `workflow/`.

Keep the CAD core callable with explicit files and geometry state: source or an
ensured immutable geometry handle/bundle in; requested artifacts and computed
metrics out. Repeated evidence requests should reuse geometry without rebuilding.
MCP adapts this contract by moving
files between private workspaces, tracking operations, and publishing selected
results. Keep transport, chat, storage IDs, and agent reasoning outside the core.
Build the evaluator locally first, then package the same contract in isolated
Docker. See [M-CAD.md](docs/M-CAD.md) for the review draft and outcome gates.

## Documentation and conventions

Use uv for Python environments, dependencies, and commands. Keep module-specific
dependencies within their project. FreeCAD is a native runtime dependency; its
Python environment need not be the uv development interpreter.

Keep product requirements separate from implementation decisions. Requirement
inventories use paragraph statements with stable document-local identifiers,
starting at 1 without leading zeros; do not use tables or renumber existing IDs.
Mark proposals and unverified capabilities clearly. Update navigation when adding
docs, and regenerate diagrams when changing their PlantUML sources. Link to
canonical requirements instead of copying them into every module.

## Development and validation

From the repository root, `make mf` starts the frontend; `make frontend-check`,
`make frontend-build`, and `make frontend-test` run its checks. `make diagrams`
renders the architecture and `make diagrams-check` validates PlantUML syntax.
Use `uv sync --directory cad` to prepare the CAD scaffold. Its README distinguishes
working commands from the evaluator interface that remains to be implemented.

Run checks relevant to the changed module. For CAD, distinguish deterministic
geometry/contract regressions from trials in which an agent revises code. Report
the command, outcome, and any untested capability. Preserve unrelated edits.

## Delegated development workflow

When assigned a director, builder, or integration role, follow the canonical
[role instructions](workflow/ROLES.md), [navigation](WORKFLOW.md), and
[operating guide](workflow/README.md). Builders own implementation, debugging, and
acceptance, and act on direct user instructions without director reconfirmation.
The director tracks those instructions for understanding without follow-up
steering; it owns initial delegation, report routing, and concrete blockers/shared
conflicts brought for resolution. The dedicated integration agent owns
exact-commit merges and integration health; only one agent operates the main index.

Workers use separate Git worktrees and retained tmux windows. Launches start from
committed HEAD, so needed specifications belong in that baseline. Use the workflow
CLI and project-local configuration. Reading this guidance does not launch workers.
