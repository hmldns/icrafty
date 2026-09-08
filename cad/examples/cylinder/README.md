# Cylinder public-contract example

The supplied `model.py` creates a radius-10 mm, height-20 mm cylinder. The
independent volume criterion is `2000*pi = 6283.185307179586 mm^3`.
`request.json` requests an isometric PNG, JSON and inline camera annotations,
validity, solid count, width and volume. STEP is not requested or produced.

From the repository root:

```sh
uv run --directory cad --cache-dir .uv-cache --locked python -m crafty_cad evaluate \
  --request examples/cylinder/request.json --output runs/cylinder-example
```

`request-grid.json` requests a grid in declared order. Request both layouts by
combining the individual and grid output entries. `request-reuse.json` illustrates
a handle query: replace the handle with an actual result of `ensure_geometry`
and submit it to the same retained Python runtime. Independent CLI calls restore
snapshots with `geometry.path` instead. See [the module README](../../README.md).

The original cylinder native acceptance, inspected image, measured values and
placement/reuse gate are recorded in [NATIVE-MILESTONE.md](../../NATIVE-MILESTONE.md).
