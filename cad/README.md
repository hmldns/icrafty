# Crafty CAD

Independent Python/uv FreeCAD evaluator, under implementation. The first native
cylinder/placement/reuse/restore/PNG/STEP milestone now works through the public
CLI and retained Python API. See [executed native evidence and setup](NATIVE-MILESTONE.md).
The full deterministic harness, cap correction trial, and Docker gate remain
unfinished. The scaffold/planning sections below will be replaced as those gates
are implemented; the Makefile suite targets still report unavailable.

## Read and review

Read the [module contract](../docs/M-CAD.md) and
[core schematic](../docs/architecture/rendered/cad-contract.svg) first. They define
code files in and requested artifacts/metrics out. Review the
[file-handoff protocol](../docs/architecture/CAD-PROTOCOL.md) separately for future
MCP integration. The [development schematic](../docs/architecture/rendered/cad-development.svg)
shows deterministic regressions, agent trials, and local development before Docker.

The [implementation handoff](../docs/CAD-IMPLEMENTATION.md) bundles the read order,
first assignment, workflow responsibilities, and completion evidence for delegation.

The first implementation assignment is M-CAD-24: evaluate known cylinders and a
cap locally, retain a geometry handle for repeated checks/views without rebuilding,
return images and independently computed geometry checks, preserve failing
evidence, then export and validate STEP on request. Threaded and more
complex fixtures follow in M-CAD-25–27. Each assignment should name the fixture
family, owned paths, expected evidence, and completion gate.

## Layout

- `src/crafty_cad/` — evaluator implementation, currently a package marker.
- [examples/cylinder/](examples/cylinder/README.md) — proposed source/request pair
  for the first contract; it is an input example, not a working evaluator.
- [tests/](tests/README.md) — guidance for future contract and regression tests.
- [fixtures/](fixtures/README.md) — guidance for independent expected outcomes.
- [Makefile](Makefile) — local commands and reserved verification suite targets.
- `pyproject.toml` and `uv.lock` — Python project and locked dependencies.
- `.venv/`, `.uv-cache/`, and `runs/` — ignored local environments and output.

## Working scaffold commands

From the repository root:

```bash
uv sync --directory cad --locked
uv run --directory cad --locked python -c 'import crafty_cad; print(crafty_cad.__doc__)'
```

Use `--cache-dir .uv-cache` on uv commands when a writable project-local cache is
needed. The project supports Python 3.11 or newer. FreeCAD is installed separately;
the eventual runner invokes its matching native Python environment rather than
assuming `import FreeCAD` works in the uv environment. Pin the native runtime and
rendering setup when implementing the first fixture.

## Planned verification harness

M-CAD-37–42 in the [module contract](../docs/M-CAD.md) define the harness, Rich
terminal display, JSON reports, and a local image gallery. Rich will be added as
a locked uv development dependency when the harness is implemented. Run
`make -C cad help` from the repository root to inspect the commands.

The reserved suite targets are `verify-contract`, `verify-geometry`, `verify-views`,
`verify-exports`, `verify-reuse`, and `verify-failures`. `verify` will run all
deterministic local suites; `verify-docker` will reuse them in the container.
`trial-cap` is a separate agent trial. These targets currently exit nonzero with
an explicit unimplemented message. Only `help` and `sync` perform their advertised
work today.

## Planned evaluator command

This interface is specified for implementation; it does not run yet:

```bash
uv run --directory cad python -m crafty_cad evaluate \
  --request examples/cylinder/request.json --output runs/cylinder-1
```

M-CAD-20 and M-CAD-35–36 specify a retained local runtime's
`ensure_geometry` / `evaluate_geometry` / `release_geometry` operations. A one-shot
CLI can reuse a native bundle by file path; a live handle addresses geometry
already loaded in its owning runtime. The harness will exercise both paths.

Read [AGENTS.md](AGENTS.md) before changing this module. Use uv for future commands,
add dependencies only when needed, and record actual checks in the assignment
report. There is no test suite or implemented evaluation command in the scaffold.
