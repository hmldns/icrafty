# CAD implementation handoff

Prepared context for the existing director. This document does not launch work;
the user gives the start signal separately. [M-CAD.md](M-CAD.md) is the canonical
contract. This brief supplies the first assignment's scope, order, and completion
evidence. Identifiers are local to this document and start at CAD-RUN-1.

**CAD-RUN-1 — Assigned outcome.** Deliver a working standalone FreeCAD evaluator
and verification harness in `cad/`. Start with cylinders, sleeves, and closed-end
caps under M-CAD-24; demonstrate the local correction loop, then package the same
contract in isolated Docker under M-CAD-28. An agent must be able to submit a
Python file, inspect requested images and measured checks, revise the part, and
download a validated STEP when requested. It must also obtain more evidence from
ensured geometry without rerunning the model. A scaffold or a renderer alone does
not complete this assignment.

**CAD-RUN-2 — Read order.** Read the root [AGENTS.md](../AGENTS.md),
[workflow roles](../workflow/ROLES.md), [operating guide](../workflow/README.md),
[CAD service role](../workflow/roles/cad-service.md), and
[cad/AGENTS.md](../cad/AGENTS.md). Then read [M-CAD.md](M-CAD.md), the
[CAD README](../cad/README.md), and [cylinder examples](../cad/examples/cylinder/README.md).
Review the [core diagram](architecture/rendered/cad-contract.svg) for state and
files, and the [development diagram](architecture/rendered/cad-development.svg)
for proof. [TRD-21–28 and TRD-37–38](TRD.md) explain system boundaries;
[CAD-PROTOCOL.md](architecture/CAD-PROTOCOL.md) and its
[handoff diagram](architecture/rendered/cad-handoff.svg) explain future transfer.
[PRD-5, PRD-20, and PRD-50–51](PRD.md) supply the product outcome.

**CAD-RUN-3 — Decisions and authority.** Preserve confirmed requirements. Use the
proposed M-CAD request/result shapes, methods, and defaults as the implementation
starting point once this assignment is launched. Resolve routine native setup,
library, data encoding, and module choices through implementation evidence; record
them in the CAD README and fixtures. Bring an incompatible contract change to the
director with a concrete alternative and its effects on the file/state boundary.
Thread profile selection remains a later fixture decision under M-CAD-26 and
does not hold up this first assignment. Keep product statements in the PRD and
technical decisions in the TRD/module documents; preserve existing identifiers
and the original IDEA document.

**CAD-RUN-4 — Workflow ownership.** Reuse the existing director and project-local
workflow configuration. Inspect active assignments before starting a Codex
builder with the CAD service profile and owned scope `cad/`. Start from a committed
baseline containing this brief and its references. Builders own implementation,
debugging, and acceptance; the director coordinates progress, dependencies, and
scope. Route completed commits to the existing integration agent, or assign that
role if none is available. Only that agent owns the main index and merges for the
implementation handoff. Preserve other workers, their windows, and the main
frontend runtime. Do not create a second director or duplicate a builder's work.
If the director divides CAD work later, give workers disjoint files and an agreed
interface before they edit; begin with one CAD owner while that interface forms.

**CAD-RUN-5 — Starting state.** `cad/` contains a uv package scaffold, local
guidance, input examples, and reserved Makefile targets. The evaluator, native
bridge, schemas, harness, fixtures, and Docker packaging are not implemented.
The reserved verification targets intentionally fail with “No tests ran.”
At preparation time, local `FreeCADCmd --version` reported FreeCAD 1.1.3,
revision 44987; no native shape/render acceptance has run. Recheck the actual
runtime and rendering dependencies in the worker environment. Use the workflow's
configured installed Codex executable; do not replace local configuration merely
to launch this assignment.

**CAD-RUN-6 — First native finding.** Prove a small cylinder can be built in
FreeCAD's native Python, saved as a data-only bundle, loaded in a clean verifier,
measured, and rendered to a real PNG. Prove placements and named feature membership
survive the chosen bundle encoding. Record native versions, interpreter/ABI,
offscreen setup, font/style defaults, and repeatable setup commands. Keep uv package
imports and contract validation usable without FreeCAD or a display. Report this
finding early; package imports and a `--version` response do not prove rendering.
Choose explicit configurable time, memory, process, cache, and output limits from
the measured setup, record their defaults before acceptance, and retain actual
timings instead of promising unmeasured latency.

**CAD-RUN-7 — File contract.** Implement M-CAD-4–8 and M-CAD-14–20, including the
one-shot `evaluate --request ... --output ...` CLI and versioned request/result
schemas. A request supplies source or existing geometry, parameters, declared
inputs, and requested evidence. Stage bytes with containment and digest checks;
call `build(parameters, inputs)` only inside the native build process. Use a new
output directory for each evaluation and atomically finalize its manifest. Keep
execution status, artifact availability, and metric outcome distinct, with useful
partial results. The CLI prints the result path on stdout; logs go to stderr.
Invalid requests, completed evaluations with failed checks, and execution failures
must have the specified different outcomes and exit codes.

**CAD-RUN-8 — Reuse is in the first gate.** Implement a retained local runtime's
`ensure_geometry`, `evaluate_geometry`, and `release_geometry` operations under
M-CAD-20 and M-CAD-35–36. Start with serialized queries. Keep immutable loaded
geometry in a clean service-owned process, separate from generated source
execution. More views, criteria, annotations, or exports reuse that geometry;
they neither execute source nor reparse its BRep on each warm query. Track scope,
runtime generation, pins, expiry, and snapshots. An expired/released handle fails
explicitly; restoring a native bundle returns a new handle with zero model
executions. Prove one source execution across repeated evidence requests, stable
geometry digests, no camera leakage, safe release/eviction, and recovery after
runtime loss. A query can complete while its retained runtime stays alive.

**CAD-RUN-9 — Independent geometric evidence.** Implement the initial method
registry and criteria in M-CAD-10–11. Validate delivered geometry rather than
echoing parameters or trusting generated assertions. The synthetic cap's outer
radius is 20 mm, inner radius 18 mm, height 12 mm, roof 2 mm, cavity depth 10 mm,
and expected volume `1560 * pi mm^3`. Fix independent tolerances before testing.
Check the actual bore face, roof distance, cavity depth, overall extents, validity,
solid count, and volume. Include the supplied cylinder and a sleeve, plus wrong
bore, missing roof, and extra-solid negatives that fail their intended criteria
while preserving diagnostic evidence. These are test dimensions, not measurements
of the user's mug.

**CAD-RUN-10 — Images and annotations.** Implement M-CAD-9 and M-CAD-31–34:
individual PNGs, a grid, and both layouts in one request. Support JSON-only,
inline-only, and combined annotations, generated from the same records. Put actual
view/camera titles at the top-left of each image or grid panel when inline text
is enabled. Record resolved cameras, ordering, panel/viewport rectangles, sidecar
digests, and final-image annotation coordinates. Prove title/framing consistency
across modes and truthful partial-view failures. Visually inspect representative
PNG files and grids; a file's existence is insufficient evidence. Chat message
grouping belongs to the later wrapper and does not change the core outputs.

**CAD-RUN-11 — Optional export.** Prove images-only and metrics-only queries
without STEP, then on-demand STEP from the same ensured geometry. Reopen it in a
clean native process and verify the M-CAD-19 unit, validity, count, bounds, and
volume gate with recorded tolerances before marking the export ready. Keep other
evidence usable if export fails. GLB remains a later advertised capability; an
unsupported request must fail explicitly. Preserve source, native snapshots, and
their provenance so a result can be inspected and copied across the future file
handoff without a sender-local path becoming an implicit dependency.

**CAD-RUN-12 — Failure and lifecycle proof.** Exercise path escapes, changed
source bytes at the same path, invalid source/geometry, unresolved features,
unsupported methods, failed renders/exports, malformed output, timeout,
cancellation, and interrupted finalization. Keep generated code separate from
service-owned criteria, verification, and final result writing. Pin geometry
during queries. Cancelling one query normally preserves reusable geometry; if a
shared native process must be killed, invalidate its handles and report affected
work as interrupted. Retain finalized evidence and recover through snapshots
explicitly. Local process separation is a development stage; the Docker gate
must prove the deployment boundary.

**CAD-RUN-13 — Harness and commands.** Implement the CAD-local Makefile targets
`verify-contract`, `verify-geometry`, `verify-views`, `verify-exports`,
`verify-reuse`, and `verify-failures`, plus their deterministic `verify` aggregate,
under M-CAD-37–42. Run through uv with locked dependencies and Rich presentation.
Produce a fresh `summary.json`, self-contained `index.html`, raw results, logs,
and linked images/sidecars/exports beneath `cad/runs/`. The harness must show good
cases, intended negatives, unexpected failures, missing prerequisites, and
interruption truthfully. Preserve direct CLI exit codes and JSON-only stdout;
captured output must have a useful plain summary. Missing capabilities or an
empty selection cannot be green. These commands must work as `make -C cad TARGET`
from the root; root `make frontend-dev` starts the frontend.

**CAD-RUN-14 — Separate correction trial.** After the local evaluator works,
prepare `trial-cap` and a fixed wrong-cap task under M-CAD-22. The director
coordinates a separate Codex part-correction trial; the service builder owns the
harness and validation of the collected evidence. The trial agent uses the public
contract, reads images and measured results, and revises model source against
unchanged criteria. Start with a maximum of eight evaluations and twenty minutes
per trial; record the actual budget and exhausted/failed outcomes. Keep requests,
revisions, results, timings, and the trial transcript/report. Do not replace the
trial with a scripted hardcoded correction or call a model from deterministic
suites. Report a missing agent prerequisite separately and continue independent
service work; do not claim the local agent loop was demonstrated without evidence.

**CAD-RUN-15 — Docker completion.** Once local deterministic acceptance and the
cap loop are demonstrated, package the same service with pinned FreeCAD and the
proven headless setup. Implement `verify-docker` using the same fixture criteria.
Prove read-only input/private output mounts, bounded CPU/memory/process/time/output
resources, no network or provider credentials/database/Docker socket in the
worker, and cancellation cleanup. Preserve the clean verifier's boundary from
generated code and the handle/snapshot lifecycle. Compare measurements and
requested artifact availability to local results. Do not claim isolation from a
Dockerfile alone. Keep container setup and its repeatable commands in `cad/`;
application agent-session containers are a different assignment.

**CAD-RUN-16 — Subsequent fixture stages.** M-CAD-25–27 define bolt/nut bodies,
thread pairs, custom threaded nuts, and more complex boolean, fillet/chamfer,
loft, and sweep fixtures. Prepare named follow-on assignments and method gaps from
the completed core, keeping the first cylinder/cap delivery usable. Before a
thread assignment, select its explicit profile, pitch, handedness, starts,
dimensions, engagement poses, clearance criteria, and intended negatives. Confirm
that fixture definition through the director. Do not claim standard compliance,
arbitrary-shape coverage, continuous assembly clearance, or physical printed fit
from the first cap gate. Advanced families are subsequent stages, not hidden
requirements for finishing this first delivery.

**CAD-RUN-17 — Integration boundary.** Implement the core and its local harness
without MCP/ACP, chat, application storage, frontend changes, courier/printing,
or product-session orchestration. Preserve the protocol's ability to transfer
immutable input/result bundles, route scoped handles, materialize files, and
publish selected artifacts later. The core returns local files and numerical
evidence; an agent or wrapper decides what to communicate. Notify the director
of a protocol mismatch with a concrete example. Coordinate shared documentation
changes through an assigned owner; the builder's `cad/README.md` must describe
actual commands, supported capabilities, and unresolved gates.

**CAD-RUN-18 — Done report.** The builder reports its exact committed revision,
native/runtime versions, setup and invocation commands, every assigned suite's
actual result, reuse execution counts, measured durations, and paths to retained
local/Docker reports, representative PNGs with sidecars, validated STEP, and the
cap-trial record. Map evidence to the relevant M-CAD identifiers and distinguish
builder acceptance from integration checks. Commit schemas, examples, immutable
fixtures, source, lockfile, and reproducible setup; keep generated run output under
the ignored run directories and provide accessible evidence paths. Report a real
environmental blocker with the failing command and remaining gate, without
marking the whole assignment complete. The director routes the result to the
integration agent and reports delivered outcomes and remaining fixture stages to
the user.
