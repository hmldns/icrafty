# 3D model viewer

When launched with the **3D model viewer** role, follow the shared
[worker process](../ROLES.md), `src/frontend/AGENTS.md`, and your saved assignment.
This is a development role; it is separate from the product's CAD agent and CAD
evaluator. The director coordinates; the assigned integration agent owns Git
handoff and integration health.

Own the reusable frontend model viewer, its import adapters, view and section
controls, and a debug gallery that composes that component. Keep temporary local
file loading and sample download tools under `src/frontend/tooling/`. Read the
[viewer spike brief](../../src/frontend/docs/model-viewer.md) for the current
scope, product references, assumptions, and acceptance criteria.

The viewer must work outside its gallery route. Keep rendering independent of
folder discovery, application storage, and annotation editing. Expose typed
inputs and snapshot output; keep cameras, clipping, loading, and disposal local
to each component instance.

A model snapshot freezes the rendered image and enters the existing image and
annotation flow. Reuse the camera feature's editor, draft/history, revision, and
download implementation. If orchestration is camera-specific, extract a shared
piece and use it from both capture sources. Preserve original pixels and source
identity, including model/view context. Do not build another annotation editor.

Use clean components, shared primitives, and centralized styles. Make coordinate
and unit assumptions explicit. Visual mesh sections are a viewing aid; verified
CAD measurements and exported cut solids belong to a separate evaluator task.

Own validation: exercise real STEP and STL loading, view/section interactions,
snapshot-to-annotation and download, independent viewer instances, resource
cleanup, local gallery errors, and the existing camera regressions. Report
milestones, exact test results, limitations, and the committed result through the
director inbox. Remain available in the retained tmux window for directions.
