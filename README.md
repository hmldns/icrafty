# Crafty

A workspace for turning photos and measurements into small, useful parts. The
[early PRD](docs/PRD.md) describes the intended product; the first frontend spike
focuses on collecting and annotating images for an evaluation loop.

## Run the frontend

Use Node.js 22.12 or newer and npm, then run from the repository root:

```bash
make frontend-install
make mf
```

Open <http://127.0.0.1:5187>. The server uses a strict port: a collision fails
clearly instead of silently selecting another port.

- `/` — project directory.
- `/camera` — image collection, camera capture, and annotation.
- `/gallery` — shared UI components and design tokens.

Import an image or capture a photo, add marks and text, then use **Download PNG**
inside the editor. The download includes the current edits without requiring a
saved revision. Keep annotating and download again to prepare another evaluation
input. Originals and editable marks stay separate.

The image collection is local to this browser and origin. Download the images
you want to keep or pass to an evaluation run; this spike does not upload them to
an agent or server. Camera access needs browser permission and a secure context
(the localhost development address is supported). Web image imports depend on
the source server allowing cross-origin requests; downloading a file yourself
and importing it locally also works.

## CAD and documentation

The [documentation index](docs/README.md) separates product requirements,
technical decisions, and module contracts. For CAD review, start with
[M-CAD.md](docs/M-CAD.md): a code file or ensured geometry and explicit requests
go in; artifacts and computed metrics come out. The [handoff protocol](docs/architecture/CAD-PROTOCOL.md)
describes how a later MCP wrapper transfers those files.

The [cad/](cad/README.md) uv project is scaffolded; the evaluator remains to be
implemented. Prepare it from the repository root with `uv sync --directory cad`.
The first implementation target is a local cylinder/cap verification loop, then
the same evaluator contract packaged in isolated Docker.
The [prepared implementation brief](docs/CAD-IMPLEMENTATION.md) defines that
assignment and the evidence required at handoff.

## Development

Frontend code and its conventions live in [src/frontend/](src/frontend/AGENTS.md).
Styles and component variants are centralized in that package, and the gallery
uses the same primitives as the image workspace.

```bash
make frontend-check
make frontend-build
npm --prefix src/frontend run test:install  # once, to install the test browser
make frontend-test
make frontend-preview
```

Preview uses port 4187. Browser tests use fake media and an isolated server on
port 5287; they do not need a physical camera. The existing diagram commands
remain available through `make diagrams` and `make diagrams-check`.

## Parallel work

Agents can be launched with explicit roles and a task using the project-local
[workflow](workflow/README.md). The [Camera and annotation role](workflow/roles/camera-annotation.md)
owns the frontend capture and annotation work. Workers run in separate Git
worktrees and retained tmux windows in `crafty-builders`; the director reviews
their reports and merges their commits.
