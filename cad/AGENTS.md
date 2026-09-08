# CAD module guidance

Follow the root [project guidance](../AGENTS.md). This directory owns the
deterministic CAD evaluator. Read [M-CAD.md](../docs/M-CAD.md) for its contract and
acceptance outcomes, and the [README](README.md) for current implementation status.

## Boundaries and structure

Keep inputs and outputs explicit: source files or ensured geometry, parameters,
declared inputs, and requested outputs/checks go in; a structured result and local
output files come out. A retained runtime can reuse immutable geometry through
live handles; a native bundle supports reuse across processes without rerunning
source. The core must work without chat, ACP, MCP, application storage, or
an agent. File transfer and publication belong to the
[handoff protocol](../docs/architecture/CAD-PROTOCOL.md).

Put application code in `src/crafty_cad/`, small input examples in `examples/`,
independent regression data in `fixtures/`, and checks in `tests/`. Introduce
submodules as implementation needs them. Prefer focused, typed functions and
explicit data contracts over a framework or speculative abstraction.

Keep generated modeling code separate from service-owned verification. Measure
the delivered geometry; do not trust a parameter or a model's claimed pass result.
Preserve source/geometry/output provenance, units, requested criteria, and useful
partial results. Distinguish execution status, output availability, and check
outcome. A failed check can have a valid diagnostic image.

## Development

Use uv for dependency management and Python commands; retain `uv.lock` when
dependencies change. FreeCAD is a separately configured native runtime. Do not
assume the development interpreter can import its modules. Keep core package
imports usable without launching FreeCAD or requiring a display.

Start with local deterministic fixtures. Write run output under ignored `runs/`
or a temporary directory, leaving fixtures unchanged. Add Docker isolation after
the local acceptance gate, then rerun the same contract and fixtures. Local
directory/process separation alone is not the deployed security boundary.

Avoid model calls in deterministic tests. Agent trials are a separate development
loop with fixed task criteria, bounded iterations, and retained evidence. Add
dependencies, metrics, and fixtures for a concrete required outcome; identify
unsupported checks explicitly. Do not change expected values just to make a
broken implementation pass.

Use the CAD-local Makefile suite interface and Rich harness presentation specified
in M-CAD-37–42. Keep the evaluator's file/JSON contract independent of Rich output.
Write machine-readable reports alongside human summaries; an unavailable suite or
missing prerequisite must not look like a successful run. Preserve JSON sidecars
and inline annotations together when requested. Test handle reuse, expiry, and
native-snapshot restore without hidden source execution.

## Completion and coordination

Implement the assigned stage and report repeatable commands, actual outcomes,
sample artifacts/metrics, failure handling, and known limitations. Keep README
status and the module contract consistent with shipped behavior. A scaffold,
successful import, or plausible picture is not proof of a working evaluator.

For a delegated assignment, follow [workflow roles](../workflow/ROLES.md), stay
within owned paths, and coordinate shared contract changes with the director.
These instructions provide module guidance; the assignment supplies the specific
scope and completion criteria.
