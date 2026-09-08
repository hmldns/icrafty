# Local print preparation exploration

Research date: **2026-09-08**, Arch Linux. **Proposal, not an implemented printing
module or a printing acceptance record.** The useful next milestone is a small,
file-only **validated STEP → checked model 3MF** preparer. Installed Gmsh can
already make STL from the two validated project samples. The tested Assimp 3MF
export is unsuitable without further work; no printer-ready output was produced.

This exploration leaves [PRD-5, PRD-35 and PRD-45](PRD.md),
[TRD-27 and TRD-35](TRD.md), and the [M-CAD contract](M-CAD.md) unchanged. The
accepted [CAD evaluator](../cad/README.md) and its
[native](../cad/NATIVE-MILESTONE.md), [local](../cad/LOCAL-GATE.md),
[correction-trial](../cad/TRIAL-GATE.md) and [Docker](../cad/DOCKER-GATE.md) gates
establish the existing STEP/evidence boundary. Meshing for manufacture, slicing,
printer operation and physical fit require their own evidence.

## Verified local capabilities

Package versions below are observations, not claims that every advertised
feature works. Discovery covered PATH candidates, installed package metadata,
their executable/library files and shipped nonsensitive profiles. It did not
search private projects, user slicer configuration or print history. Absence means
not found within that search, not an exhaustive scan of arbitrary AppImages.

| Tool | Local installation | What was actually established |
| --- | --- | --- |
| FreeCAD | Package `1.1.3-2`; `/usr/bin/FreeCADCmd` and `freecadcmd` resolve to `/usr/lib/freecad/bin/FreeCADCmd`; GUI executable also present | `FreeCAD.so`, `Part`, `Mesh.so` and `MeshPart.so` exist under `/usr/lib/freecad/lib`. Library inspection resolves dependencies. No GUI/FreeCADCmd launch. Embedded-module probe stopped during initialization, below. The earlier CAD gates establish the working host/native bridge, not this new mesh-export path. |
| Native dependencies | `/usr/bin/python3` package `3.14.7-1`; OCCT `7.9.3-3`, Boost libraries `1.92.0-1`, Qt `6.11.2-2` | Matches the package versions in CAD acceptance. The accepted native revision/ABI is recorded in its README; this probe did not independently reach `FreeCAD.Version()`. |
| Bambu Studio | `bambustudio-bin 02.08.02.60-1`; `/usr/bin/bambu-studio` → `/opt/bambustudio-bin/AppRun` → `bin/bambu-studio` | **Headless `--help` executed**, reporting `BambuStudio-02.08.02.60`. Export, slicing, arrangement and progress options exist. Conversion/slicing was not run. The wrapper supplies bundled FFmpeg libraries; direct `ldd` without that library path misleadingly reports three missing libraries. Wrapper-equivalent `ldd` resolves them. |
| Gmsh | `gmsh-bin 4.15.2-1`, `/usr/bin/gmsh` | `-version` reports `4.15.2`; batch STEP → surface STL executed for both samples. Its mesher is an alternative to the FreeCAD bridge, with separate provenance. |
| Assimp | `6.0.5-1`, `/usr/bin/assimp`, `/usr/lib/libassimp.so.6` | `version`, `listext`, `listexport` run; CLI reports `6.0`, Git commit `0`. Lists STEP input and 3MF output, but actual cap STEP import fails. STL → 3MF writes files with defects described below. |
| Blender | `17:5.2.0-4`, `/usr/bin/blender` | Its shipped man page documents `--background`; the executable was not launched or qualified as a STEP/3MF route. No addon discovery. |
| Packaging/validation | `libzip 1.11.4-1`, `libxml2 2.15.3-1`, `/usr/bin/xmllint`; Python standard-library ZIP/XML | ZIP/XML inspection works. The attempted upstream XSD check could not compile its schema. No standalone `lib3mf` package found. |

PrusaSlicer, OrcaSlicer, Cura/CuraEngine, Slic3r, MeshLab and OpenSCAD were not found
in the scoped package/PATH inventory; Flatpak and Snap commands were also absent.
Bambu's installation includes BBL and other vendors' profiles. For example, its
shipped A1 nozzle profile uses `inherits` and `include`; this is evidence of preset
structure, **not evidence that the user owns an A1 or has selected that profile**.

## File-only probes and limits

Evidence is retained only in this worker checkout under
`.builders/print-preparation/research-20260908/` (ignored). `inventory.sh/log`,
`sources/`, each probe script, command records, stdout/stderr, copied inputs and
`gmsh-probe/inspection.json` remain available for handoff. No other worker's
runtime output was read. No installation, desktop launch, printer discovery,
network printer access, service changes or host application-setting changes ran.

The probes used installed Bubblewrap `0.11.2`, no network namespace connectivity,
no display/DBus sockets and no real home mounted. System/tool files were read-only;
only owned output and private temporary files were writable. The ordinary command
sandbox initially denied Bubblewrap's namespace setup; the approved tool execution
then ran that same constrained probe. Public upstream source downloads similarly
needed the tool's network permission. Neither changed the machine configuration.

Inputs were byte-checked copies of the tracked
[evaluated cap and placed cylinder](../src/frontend/tooling/evaluated-samples.json),
which records their earlier clean STEP reopen and CAD lineage:

- Cap SHA-256: `bbe02c8657af6c2715e1d84571fe6eb6ad2ba989f5522ae6539bf51d49912500`.
- Placed-cylinder SHA-256: `c447f8f448029e415e5a1df5670ae401d97d9f771067dae18d3ea86b425322cb`.

Executed native commands inside that sandbox included:

```sh
assimp version
assimp listext
assimp listexport
gmsh -version
# Bambu used its wrapper-equivalent library path and LC_ALL=C:
bambu-studio --datadir /out/bambu-data --help
assimp export /out/cap.step /out/cap.3mf -f3mf
gmsh /out/cap.step -2 -format stl -o /out/cap.stl -nopopup \
  -setstring Geometry.OCCTargetUnit MM -clmin 0.1 -clmax 0.5 -v 3
assimp export /out/cap.stl /out/cap.3mf -f3mf
```

The last two commands also ran for `placed-cylinder`. Full wrappers are retained;
these fragments omit their containment and should not replace it. Gmsh's flags
request **element sizes**, not a guaranteed 0.5 mm or 0.05 mm surface error.
[Gmsh 4.15.2 documents STEP units and batch meshing](https://gmsh.info/doc/texinfo/gmsh.html#t20),
and its [CLI documents the size/output options](https://gmsh.info/doc/texinfo/gmsh.html#Command_002dline-options).

| Sample STL | Triangles | Bounds/placement observation | Signed volume versus analytic CAD expectation |
| --- | --- | --- | --- |
| Cap | 48,596 | Bounds `(-20,-20,0)` to `(20,20,12)` mm | `4900.688039` versus `4900.884540` mm³; relative error **0.00401%** |
| Placed cylinder | 17,742 | Translation/rotation retained; each world-bound coordinate differs by at most `0.00295` mm from the native milestone | `6281.236230` versus `6283.185307` mm³; relative error **0.03102%** |

The inspection helper reconstructs shared indices from **exactly equal STL
coordinates**. Both meshes have finite vertices, no zero-area triangles, zero
open/nonmanifold edges and consistent shared-edge winding. This is limited mesh
evidence: vertex-manifoldness, self-intersections, full surface deviation,
multi-object identity and slicer reopening were **not** established.

Three useful failures prevent overstating this result:

- **FreeCAD meshing remains unproved in this settings-free probe.** `probe-001`
  stopped at `getpwuid_r` home lookup. `probe-002` supplied only a synthetic current
  UID/home entry inside the disposable namespace, without changing `HOME` or
  reading the host account database. It then exited 134 when initialization tried
  to create `/home/hmldns/.cache/FreeCAD/v1-1` on the read-only filesystem. No STEP
  was meshed by FreeCAD. This is an isolation/startup limitation, not a missing
  native library or a reversal of earlier CAD acceptance. The
  [matching FreeCAD initialization source](https://github.com/FreeCAD/FreeCAD/blob/145529fe741292ff0b3977a01195bf0247425794/src/App/Application.cpp#L3058)
  explains the home lookup; a later adapter must qualify explicit disposable
  application directories before using this path.
- **Assimp direct STEP import fails**, exit 10: `IFC: Unrecognized file schema:
  AUTOMOTIVE_DESIGN`. This sample is STEP AP214; an advertised extension alone is
  insufficient. Its subsequent STL → 3MF commands exit 0 and declare millimeters,
  but the cap has 145,788 separate vertex indices for 48,596 triangles: **145,788
  boundary edges by index**, instead of shared manifold edges. It also writes
  core `metadata` under `resources`, inconsistent with the core content model,
  and loses the source part name/lineage. These observations concern the tested
  default invocation; no other Assimp processing configuration was qualified.
  The [matching exporter source](https://github.com/assimp/assimp/blob/392a658f9c271be965271f45e7521a1b80ea4392/code/AssetLib/3MF/D3MFExporter.cpp#L170)
  confirms that metadata placement.
- **ZIP success is not schema success.** Both experimental 3MF ZIP CRC checks
  pass. `xmllint --nonet --noout --schema sources/3mf-core-local.xsd
  gmsh-probe/cap.model.xml` exits 5 while compiling the official 1.4.0 Appendix
  B.1.1 schema (`maxOccurs="2147483647"` rejected). Only its XML namespace import
  was redirected to a retained W3C schema for offline access; occurrence limits
  were not relaxed. This is a validator/schema compatibility blocker, not a
  validation verdict on the model. No valid model 3MF or slicer acceptance is
  claimed. The edge defect is independently established without XSD validation.

Standalone Python probes used inline PEP 723 `dependencies = []` and installed
system Python through uv, for example:

```sh
uv run --offline --no-project --no-python-downloads --python /usr/bin/python3 \
  --cache-dir .builders/print-preparation/research-20260908/uv-cache \
  --script .builders/print-preparation/research-20260908/inspect-meshes.py
```

## Upstream-supported routes and artifact meanings

The upstream references were checked on the research date, including the installed
[Bambu release](https://github.com/bambulab/BambuStudio/releases/tag/v02.08.02.60).
They establish documented/source behavior separately from the local probes.

| Artifact/route | Meaning and local recommendation |
| --- | --- |
| STEP → slicer | Bambu has a separate [STEP import/meshing path](https://github.com/bambulab/BambuStudio/blob/9a530f77c23d8c3430d1dbef02e103cd8bd6480e/src/libslic3r/Model.cpp#L222). Its inspected CLI calls `read_from_file`, whose [dispatch omits STEP](https://github.com/bambulab/BambuStudio/blob/9a530f77c23d8c3430d1dbef02e103cd8bd6480e/src/libslic3r/Model.cpp#L306). Do not assume desktop STEP import works through this CLI. Neither import path was executed here. Uninstalled [PrusaSlicer documents triangulation on STEP import](https://help.prusa3d.com/article/supported-file-formats_1772); that is an alternative, not a local capability. |
| Model 3MF | A geometry package: explicitly unit-tagged indexed meshes, named objects/components and build transforms, optionally metadata. It contains no selected printer/process merely because its extension is `.3mf`. Prefer this interchange boundary. Gmsh → a qualified indexed-mesh packager is the first candidate; the tested Assimp package is not acceptable. |
| STL | Triangle geometry without reliable unit, object-identity or lineage semantics. The exercised Gmsh output is a useful intermediate when accompanied by an explicit mm/provenance receipt. It is not printer-ready. |
| Slicer-project 3MF | Vendor/application state can include printer/material/process settings, plates, instances, modifiers, painted supports and previews. Generic consumers may ignore those additions. An unsliced project still needs profile and toolpath review. [Prusa's project documentation](https://help.prusa3d.com/article/saving-projects-as-3mf_1773) illustrates this distinction. |
| Sliced output | Printer-specific G-code, binary G-code or a vendor package containing toolpaths and associated metadata. Bambu's `--slice` followed by `--export-3mf` can embed slice results in its project output. Identify the actual contents and target profile; do not infer readiness from a filename or ZIP presence. Sending remains a separate operation. |

For a future FreeCAD mesher, the
[matching `MeshPart.meshFromShape` API](https://github.com/FreeCAD/FreeCAD/blob/145529fe741292ff0b3977a01195bf0247425794/src/Mod/MeshPart/App/AppMeshPartPy.cpp#L93)
accepts explicit `LinearDeflection`, `AngularDeflection` and `Relative`. A candidate
call is `MeshPart.meshFromShape(Shape=shape.copy(), LinearDeflection=0.05,
AngularDeflection=0.1, Relative=False)`, with length in mm and angle in radians.
That call was prepared but never reached. Neither FreeCAD 3MF export nor an OCCT
3MF writer was qualified; their availability must not be inferred from OCCT/FreeCAD
installation. [lib3mf](https://github.com/3MFConsortium/lib3mf) is a possible future
reader/writer dependency, currently absent as a standalone local package.

The [3MF Core 1.4.0 specification](https://github.com/3MFConsortium/spec_core/blob/997b385e06f3181cf9aae0c578e0b45ccd48ccb2/3MF%20Core%20Specification.md)
defines ZIP/OPC relationships, units, resource/build references and index-based
manifold edges with consistent outward winding. It also permits consumer handling
of intersecting meshes via its fill rule. Crafty's proposed preparation gate should
be stricter: reject unexplained geometry changes and report unavailable checks.

## Proposed integrity gate

The following thresholds and behavior are **proposals for the synthetic fixtures**,
not newly adopted requirements or manufacturing tolerances.

1. **Freeze the input and identity.** Verify the STEP SHA-256 against its selected
   ready artifact/receipt, retain CAD run/revision/geometry IDs and STEP comparison
   reference, and copy bytes into a new run. Reuse CAD validity, units, part count,
   bounds, volume and named-feature evidence as the baseline. Do not rerun source.
   Start with one solid; reject ambiguous multi-solid mappings. Later map each
   STEP part explicitly to a 3MF object name/part number and source digest, without
   assuming STEP labels or reordered solid indices preserve semantic identity.
2. **Make units and transforms explicit.** Require known mm input, set 3MF unit
   `millimeter`, retain the right-handed Z-up frame and world placement at scale
   1. Compare min/max coordinates, not just extents. Treat bed placement as a
   separate recorded rigid transform with an inverse; reject silent centering,
   scaling, mirroring or shrink compensation. STL's unit is supplied by its receipt.
3. **Measure approximation.** Record mesher/library versions, all size/deflection
   settings and coordinate serialization precision. For these samples, start with
   maximum world-bound-coordinate error `0.05 mm`, relative volume error `0.5%`,
   and a separately measured surface-error target `0.05 mm`. Gmsh's element-size
   knob does not itself prove the latter. Compare sampled surface sections against
   the analytic cap's bore/roof/radii and the placed-cylinder reference; report the
   sampling method/coverage rather than asserting a global Hausdorff bound. CAD's
   much tighter STEP-roundtrip tolerances do not apply to tessellated approximations.
4. **Validate the actual serialized mesh.** Check finite coordinates, legal
   indices, triangle area, edge and vertex manifoldness, connected components,
   outward orientation and signed volume, self-intersections and unintended
   overlaps. An open cap cavity still has a closed material boundary. Exact
   coordinate indexing of STL is a representation conversion; tolerance welding,
   hole filling, shell removal, smoothing or other repair is a separate change
   requiring a before/after record and another geometry check.
5. **Validate and reopen the package.** Check bounded ZIP sizes/counts, safe
   member paths, CRCs, content types, root/model relationships, schema, units,
   required extensions, object/build references and transforms. Keep custom
   metadata in a declared namespace and authoritative lineage in the sidecar;
   consumers may drop metadata. Reopen through an independent reader and the
   intended slicer, then compare mesh/instance count, units, bounds and volume.
   XSD alone cannot prove mesh validity; a viewer opening the file cannot prove
   either. Qualify a compatible validator before reporting conformance.

Slicer import and slicing may weld/repair meshes, merge shells, translate to the
bed, arrange or orient instances, substitute profiles, simplify paths, compensate
dimensions, add supports/brims and fill interiors. Record effective configuration,
warnings and before/after geometry/placement; keep the original model package.
If a slicer cannot expose a change, label it unverified. A slicer's repair or a
successful slice does not retroactively validate the originating CAD design.

## Information needed before arranging and slicing

**Unknown:** printer, technology, material, nozzle, plate and preferred slicer.
An FFF cap workflow is a working assumption because of the installed slicer and
example, not a statement about the user's hardware. No credentials are needed
for file preparation. The operator needs to supply or confirm:

- Printer model/variant, firmware/output dialect, extruders, nozzle diameter and
  type, usable bed polygon/origin, height and excluded/clearance regions; plate
  surface/type and any relevant enclosure constraints.
- Material and actual filament/profile, diameter, temperatures, flow/cooling
  limits and assignment to extruders; intended load/temperature/fit constraints.
- Complete compatible machine, material and process profiles with versions and
  resolved inheritance/includes, plus layer/first-layer heights, walls, infill,
  seam/adhesion and support strategy. Pin hashes of the effective settings,
  including start/end G-code, instead of relying on mutable profile names.
- Quantity, orientation/finish priorities, contact surfaces, permissible supports,
  part spacing and sequential-print clearances. Bed checks include support/brim
  footprints, not just the model bounding box.

For the synthetic cap only, **roof face on the bed, cavity upward** is a useful
orientation candidate: a 180° X rotation followed by +12 mm in Z changes the
original open-bottom geometry to that pose. This is geometric reasoning to review,
not a support-free printing claim; layer strength, contact finish and fit still
depend on printer/material choices. Keep it as a proposed transform, never a
silent mutation of the model artifact.

## Proposed project-local tool flow

Implement a plain CLI with explicit files; no service, port, ACP/MCP dependency
or product-agent integration is needed. **The following `printprep.py` commands
and request schema are proposed interfaces, not files or commands shipped today.**
Any standalone helper would use uv with PEP 723 metadata and project-local cache.

```sh
uv run --script printprep.py capabilities --output runs/capabilities.json
uv run --script printprep.py prepare --request cap-prep.json --output runs/cap-model-001
uv run --script printprep.py inspect --result runs/cap-model-001/result.json
# Later, only after complete profiles and orientation are supplied:
uv run --script printprep.py project --request cap-project.json --output runs/cap-project-001
uv run --script printprep.py slice --request cap-slice.json --output runs/cap-slice-001
```

Example `cap-prep.json`, with input paths relative to that request:

```json
{
  "schema_version": 1,
  "source": {
    "step": "input/cap.step",
    "sha256": "bbe02c8657af6c2715e1d84571fe6eb6ad2ba989f5522ae6539bf51d49912500",
    "cad_receipt": "input/evaluated-samples.json",
    "part": "cap"
  },
  "units": "mm",
  "placement": "preserve",
  "meshing": {"backend": "gmsh", "target_size_min_mm": 0.1, "target_size_max_mm": 0.5},
  "checks": {"bounds_absolute_mm": 0.05, "volume_relative": 0.005},
  "outputs": ["model_3mf", "report"]
}
```

`capabilities` reports installed, runnable, tested, unsupported and blocked
separately, including tool paths/versions and precisely scoped evidence. It does
not probe devices or initialize the user's applications. `prepare` consumes only
the frozen STEP/receipt, makes a shared-index mesh, performs the gate and returns
`model.3mf`, `result.json` and retained diagnostics; optional STL/preview must be
requested. A ready model means **geometry prepared**, with `sliced: false` and
`printer_ready: false`. Failed validation must not expose a ready package.

Each new output directory retains input hashes, tool/binary/library identities,
request, actual argv, method/settings, units/transforms, object map, logs, timings,
checks and artifact sizes/hashes. Write temporary files then atomically finalize
the result; never overwrite a completed run. Stdout returns the result path;
stderr/retained NDJSON reports stages (`import`, `mesh`, `validate`, `package`,
`reopen`) and meaningful counts. Distinguish missing runtime, bad STEP, unsupported
schema, invalid mesh, unavailable check, profile mismatch, out-of-bed placement,
timeout and cancellation. Use bounded time/memory/output and an owned process
group; cancellation waits for its children to stop, retains diagnostics and never
terminates other workers or services. Retries receive a new run directory.

`project` adds explicit plate/instance transforms and complete profiles to a new
derivative; `slice` freezes those inputs, invokes a pinned slicer and retains
toolpaths, estimates, warnings and effective settings. Both need their own
inspection/review result. The
[Bambu CLI manual, revision `0a74eea`](https://github.com/bambulab/BambuStudio/wiki/Command-Line-Usage/0a74eea5e1b11e3b8595fd2846d1050fafc43eb4)
requires full settings files, documents `--pipe` progress and option precedence.
Do not pass shipped inheritance fragments as complete profiles. A future contained
invocation, **not executed during this research**, could be:

```sh
bambu-studio --datadir /out/app-data --outputdir /out \
  --load-settings '/input/machine.full.json;/input/process.full.json' \
  --load-filaments /input/material.full.json \
  --arrange 0 --slice 0 --export-3mf cap.sliced.3mf /input/cap.model.3mf
```

This template requires a compatible profile/plate selection and prior pose review;
its exact behavior remains to be qualified. Reject unexpected automatic profile
substitution or geometry changes. File preparation has **no send side effect**.
A later send operation would require a separately authorized target, reviewed
artifact hash and operator confirmation of machine/material/bed readiness; it
does not belong in this first implementation.

## Recommended first implementation and acceptance

Scope the first milestone to **these two single-solid samples → validated model
3MF**, preserving their world placement. Reuse the demonstrated Gmsh route,
replace the tested Assimp packaging step with a small project-local shared-index
3MF writer (or a separately approved, pinned lib3mf dependency), and qualify an
independent validator/reader. Keep the accepted evaluator untouched. A FreeCAD
mesher can follow once its disposable cache/config startup is proven; no host
configuration change is necessary to finish the design of the file interface.

Acceptance should retain both original STEP digests/receipts, reopen the new
packages, pass the proposed mm/bounds/volume gates, inspect cap bore/roof sections
and the rotated cylinder, and establish mesh topology, deviation and independent
package validity. A preview should show both cavity and placement. Negative
controls should reject wrong units/scale, shifted placement, changed STEP bytes,
missing lineage, open/reversed/degenerate/self-intersecting meshes, invalid ZIP or
object references, and ambiguous extra solids. Exercise cancellation without a
ready result and prove no writes outside owned output/disposable application
directories and no network/device access. These are future acceptance tests,
not results of this exploration.

Then, once the operator chooses printer/material/nozzle/plate/profiles, qualify
Bambu model import, reviewed orientation, project export, slicing and reopening
as a separate milestone. Installation of a validator/slicer, changes to existing
application settings, desktop interaction, network/printer access and physical
printing would each need authorization beyond this non-invasive exploration.
Remaining questions are those hardware/profile choices and whether the immediate
handoff should stop at a portable model 3MF or include a particular slicer project.
