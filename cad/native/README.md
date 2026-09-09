# Native measurement bridge

Run `make -C cad native-setup` from the checkout root before native evaluation.
`build.py` uses its own locked uv script environment with SWIG 4.4.1, a C++17
compiler and installed matching Python/OCCT headers. Native Python defaults to
`/usr/bin/python3`; `CRAFTY_NATIVE_PYTHON` or `--python` selects another matching
interpreter. Explicit `--occt-include` and `--compiler` arguments are available
through `uv run --locked --script native/build.py` from `cad/`.

The accepted setup is Python 3.14.7, ABI `cpython-314-x86_64-linux-gnu`, OCCT
7.9.3 and GCC 16.2.1. Generated wrapper/binary/manifest files live in ignored
`native/build/`. The manifest records commands, compiler/SWIG versions and hashes;
startup rejects a missing build, changed source/binary, or mismatched ABI/version.
Compiler prefix maps remove temporary build paths from the binary. Two actual
builds produced the same SHA-256; evidence is
`cad/runs/adaptive-properties-build-repeat.json`.

The bridge receives a `TopoDS_Shape` via FreeCAD's public `__toPythonOCC__` API.
It shares the loaded geometry and exposes only read-only property integration,
version and wrapper disposal. It never reads a BRep file or executes submitted
source. Explicit disposal releases FreeCAD's allocated wrapper even when SWIG
proxy destructor registration differs between modules. Its native library runs
inside the same bounded clean verifier and clean STEP reopen process.

Volume and volume-weighted centroid use `BRepGProp::VolumePropertiesGK`, with
closed shells, B-spline spans, centroid calculation and relative epsilon 1e-11.
Area uses adaptive `SurfaceProperties` with epsilon 1e-15. Negative/nonfinite
native error estimates and nonfinite properties fail explicitly. Error estimates are convergence
estimates, not certified geometric bounds; analytic fixtures and export comparisons
retain their independent absolute/relative tolerances. Mass properties are shared
within one metric batch; raster preparation computes only the bounds it needs.

The pinned Docker packager includes the resulting module and its ELF dependencies;
it contains neither a compiler nor the SWIG build tool. The native source and build
recipe accompany it for provenance. See [the native fix acceptance](../NATIVE-IMPORT-FIX.md).
