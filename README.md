# Crafty

A workspace for turning photos and measurements into small, useful parts. The
main repair app combines saved conversations, photos, editable annotations,
generated sketches and inline measurement questions. Start with the supplied
mug photographs or describe your own repair. See the [PRD](docs/PRD.md).

## Run the app

Use Node.js 22.12 or newer and npm, then run from the repository root:

```bash
make frontend-install
make agent-install
make agent-dev
```

In another terminal:

```bash
make mf
```

Open <http://127.0.0.1:5187>. The server uses a strict port: a collision fails
clearly instead of silently selecting another port.

- `/` — main saved repair workspace. **Try the mug cap** sends the four supplied
  photos to Codex and asks for a measurement form. Fill in real caliper values,
  leave unknowns blank, and choose **Send measurements** to continue the chat.
- `/debug` — workshop tools and component navigation.
- `/debug/camera` — standalone image collection, capture, and annotation.
- `/debug/gallery` — shared UI components and design tokens.
- `/debug/models` — interactive STEP/STL viewer and annotation tools.
- `/debug/agent` — the same live conversation with runtime inspection controls.
- `/debug/chat` — independent local interaction rehearsal.

Import an image or capture a photo, add marks and text, then use **Download PNG**
inside the editor. The download includes the current edits without requiring a
saved revision. Keep annotating and download again to prepare another evaluation
input. Originals and editable marks stay separate.

The standalone image collection is local to this browser and origin. Main repair
messages and selected photos are saved by the backend and sent to Codex using
your configured login. Camera access needs browser permission and a secure context
(the localhost development address is supported). Web image imports depend on
the source server allowing cross-origin requests; downloading a file yourself
and importing it locally also works.

## Live Codex chat

The [agent module](agent/README.md) runs the first real ACP/image/MCP integration.
Run `make agent-install`, then `make agent-dev` alongside `make mf`, and open
<http://localhost:5187/>. Chats and images are saved locally; submitted
messages and images are sent to Codex using the configured login. The independent
`/debug/chat` route remains the interaction rehearsal.

Review [M-ACP](docs/M-ACP.md), [ACP agent state](docs/ACP-AGENT-STATE.md), and the
[main surface contract](docs/M-REPAIR.md) for composition and measurement state.
This stage uses private local process/workspace ownership. Product Docker
orchestration remains later work; the CAD-agent integration is a separate track.

## CAD and documentation

The [documentation index](docs/README.md) separates product requirements,
technical decisions, and module contracts. For CAD review, start with
[M-CAD.md](docs/M-CAD.md): a code file or ensured geometry and explicit requests
go in; artifacts and computed metrics come out. The [handoff protocol](docs/architecture/CAD-PROTOCOL.md)
describes how a later MCP wrapper transfers those files.

The [cad/](cad/README.md) uv project implements the cylinder/sleeve/cap evaluator,
retained geometry, images, numerical verification and requested STEP exports. Its
local, separate agent-correction and Docker gates have passed; see the linked
acceptance records. Prepare it with `make -C cad sync`.
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
