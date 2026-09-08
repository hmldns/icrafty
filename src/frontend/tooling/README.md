# Local model tooling

Run these commands from `src/frontend/`. This directory contains development
tooling and fixtures; it is not an application backend or CAD evaluator.

```sh
npm ci --cache .npm-cache
npm run sample:download
npm run dev
# Override the catalog root explicitly at server start:
CRAFTY_MODEL_ROOT=/absolute/path/to/models npm run dev
# An isolated worker can override the port without changing delivered defaults:
CRAFTY_MODEL_ROOT=/absolute/path/to/models npm run dev -- --port 5197
```

The default root is this package's `tooling/models`, independent of the shell's
current directory. The Vite TypeScript middleware recursively lists `.step`,
`.stp`, and `.stl` files; the page's **Refresh & reload** discovers changes and
reloads selected bytes without caching. Browser selections use relative catalog
paths only. `CRAFTY_MODEL_ROOT` is a server-start setting; the browser cannot select
an arbitrary host directory. There is no remote URL proxy. A separate browser file
picker reads files directly without this relay.

All symlink files and directories below the configured root are excluded, including
links to in-root files. The trusted configured root is canonicalized. Reads reject
absolute paths, dot segments, backslashes, hidden segments, unsupported extensions,
nonregular files and paths outside the canonical root. They use `O_NOFOLLOW`, with
an opened-descriptor containment check on Linux to catch ancestor symlink races.
Discovery is limited to 1,000 models, 10,000 scanned entries and 12 directory levels.
Reads are bounded at 50 MiB and growing files are rejected. Errors omit host paths.
Use a stable development folder; this middleware is not an OS isolation boundary
against a process that can rewrite the server's files. It is mounted only by Vite
development, not preview or the production build. Production explains its absence
and still offers the packaged sample and browser file picker.

## Pinned STEP sample

[`sample.json`](sample.json) is the reproducibility manifest. The downloaded
[`rounded-cube.step`](models/rounded-cube.step) is an upstream real STEP Part 21
fixture, not a generated stand-in or a mocked parser result. Its header identifies
a FreeCAD model exported by Open CASCADE 7.6 on 2022-10-27. It is a rounded block
from Viktor Kovacs's `occt-import-js` test corpus, pinned to commit
`41e470890ae0f9dc69ac50ffd5fc73e03576f4eb`.

Source: [pinned upstream STEP](https://github.com/kovacsv/occt-import-js/blob/41e470890ae0f9dc69ac50ffd5fc73e03576f4eb/test/testfiles/rounded-cube/rounded-cube.step).
Repository license: LGPL-2.1; upstream declares no separate fixture license.
The unchanged [license text](licenses/occt-import-js-LGPL-2.1.txt) is retained here.
The exact sample is 20,532 bytes with SHA-256
`370c5474e50dc94923f0dacb5113f7258233601620ab530d937c18571869d49e`.

The downloader uses uv with PEP 723 inline metadata and Python's standard library:

```sh
uv run --cache-dir tooling/.uv-cache --script tooling/download-sample.py
```

It downloads the sample and license from pinned URLs, checks both SHA-256 digests,
and only then replaces the local files. `npm run sample:download` is the same
command. The ignored uv cache stays within this frontend package.

The importer dependency is `occt-import-js@0.0.23` from npm, pinned by the lockfile
(the upstream repository currently calls its HEAD 0.0.24). Its JS/WASM files are
unmodified and its LGPL-2.1 license/source are available in the installed package
and [upstream repository](https://github.com/kovacsv/occt-import-js). Three.js uses
its upstream MIT license. Keep these upstream notices with redistributed bundles;
the viewer does not replace either dependency's license terms.

## STL fixture and embedding example

[`bracket.stl`](models/bracket.stl) is a synthetic asymmetric L-bracket, generated
locally in millimeters/Z-up for deterministic visual tests. Its 30 × 24 × 10 bounds
and 20 triangles exercise real binary STL loading. This fixture is not a verified
repair part or a FreeCAD evaluator output. Reproduce it with:

```sh
node tooling/generate-stl.mjs
```

[`embedding.html`](embedding.html) and [`embedding.tsx`](embedding.tsx) demonstrate
the reusable component with a supplied Blob and a generic snapshot callback,
without folder discovery or IndexedDB. Open `/tooling/embedding.html` in dev.
The example deliberately interprets the STL as meters/Y-up to demonstrate and test
normalization; those declarations are not claims about the bracket's real units.
Its provenance IDs are explicitly example values, not application backend IDs.
See [the embedding guide](../docs/viewer-usage.md) for application composition.

## Validation

```sh
npm run typecheck
npm run build
npm run test:install
CRAFTY_TEST_PORT=5297 npm test
CRAFTY_PREVIEW_PORT=4197 npm run test:production
```

The test server creates an ignored, isolated `tooling/.test-models/server` root and
copies the fixtures there. Tests can add/change/delete models without touching
the shipped fixtures. Gallery containment checks also use isolated temporary roots.
`tooling/.artifacts` holds optional browser-review screenshots; no captured user
images or generated test reports are committed. Delivered defaults are dev 5187,
preview 4187, tests 5287; all ports are strict.

The browser suite uses Chromium with software WebGL enabled. Tests check actual
mesh pixels and PNG bytes, not only parser mocks. Physical GPU/driver combinations,
Firefox/Safari and large CAD assemblies remain unverified. See the worker's
[validation report](../docs/viewer-validation.md) for the run on this host.
