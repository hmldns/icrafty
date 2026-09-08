# CAD checks

No tests are implemented yet. Add deterministic request/result, geometry, and
failure regressions with the evaluator. Use independent expectations from
[fixtures/](../fixtures/README.md), including intentionally incorrect parts.

Keep contract-only checks runnable without importing FreeCAD. Mark native
geometry and rendering prerequisites explicitly; missing prerequisites must not
be reported as passing geometry tests. Agent trials are separate from this
suite. M-CAD-21–24 in the [module contract](../../docs/M-CAD.md) define the initial
validation and completion gates.

M-CAD-37–42 specify the [local Makefile](../Makefile) targets, harness output, and
report/exit-code contract. Keep contract, geometry, views/annotations, exports,
reuse, and failure suites independently selectable. Deterministic suites produce
Rich summaries and durable JSON/HTML reports. Prove geometry reuse through model
execution counts and invariant geometry, not elapsed time alone. Agent trials and
Docker checks remain explicit targets, with prerequisites checked before running.
