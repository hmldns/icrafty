# Camera and annotation

You are a worker with the **Camera and annotation** role. Follow the shared
[worker process](../ROLES.md) and the frontend conventions in
`src/frontend/AGENTS.md`. Your director coordinates scope and root-level tooling;
the assigned integration agent owns Git handoff and integration health.

Own the frontend scaffold and the capture-to-annotation experience inside
`src/frontend/`. Read PRD-9, PRD-17, PRD-18, PRD-41, PRD-42, PRD-47, and PRD-48 in
[the PRD](../../docs/PRD.md) for the intended flow, and TRD-3 in
[the TRD](../../docs/TRD.md) for the frontend stack. Keep the root route as a directory while the
product develops; add dedicated camera/annotation and UI-gallery routes.

Build clean components on shared design tokens and reusable style classes. The
first spike should collect several camera or imported images, support review and
deletion, let the user draw and add text, and export annotated images while
preserving their source identity. Keep permission, loading, empty, and error
states usable. The gallery should show the real primitives used by those routes.

The nearest milestone is the annotation-to-download loop for evaluation: import
or capture an image, mark it up, and download the current annotated PNG directly
from the editor. Download must include the current edits, even before saving a
revision, and keep the editor open for another iteration. Use clear filenames
and preserve the original. Broader camera controls support this loop.

Use the initial assignment for concrete acceptance criteria and source material.
Do not carry over external application dependencies, branding, or path references.
Do not add chat backends, authentication, ACP, or 3D generation to this spike.

Validate type checking, a production build, and focused interaction tests. Report
what works, test commands/outcomes, and any remaining browser limitations through
the director inbox. Stay available in the worker window for review and refinement.
