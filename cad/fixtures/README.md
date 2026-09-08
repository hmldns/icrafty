# CAD fixtures

[EXPECTATIONS.md](EXPECTATIONS.md) defines independently derived dimensions,
aggregate values and tolerances for cylinders, sleeves and caps. Cap numeric
criteria are frozen in [cap/criteria.json](cap/criteria.json). Assertions and
intentional parameter variants live in [tests/suites.py](../tests/suites.py).

The placed cylinder verifies rotation/translation and actual named membership;
its foreign face must remain unavailable. Wrong bore, missing roof and extra-solid
variants preserve cap expectations and retain diagnostic evidence. All generated
output belongs in ignored `runs/` directories.

[trial-cap/TASK.md](trial-cap/TASK.md) is a separate Codex correction assignment,
with a deliberately wrong source and immutable externally owned criteria. Only
that separate worker can supply the trial acceptance evidence; deterministic
collector controls do not impersonate it.
