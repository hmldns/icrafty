# CAD acceptance assertions

`tests/suites.py` supplies deterministic cases to the public
`python -m crafty_cad.harness run` interface. Use the CAD-local Makefile targets in
[the README](../README.md). Independent numeric expectations are in
[fixtures/EXPECTATIONS.md](../fixtures/EXPECTATIONS.md), outside submitted model code.
`native_milestone.py` remains the separately runnable first cylinder/placement gate.

The harness retains actual evaluator outcomes even when a negative assertion is
expected. Fault injection is a trusted test seam in service I/O, never a request
field. Contract, geometry, layout/annotation, STEP reopen, reuse and lifecycle
failures are deterministic and make no model calls. Collector control tests do
not substitute for the separate correction worker's retained trial.
