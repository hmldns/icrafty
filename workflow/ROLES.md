# Roles and coordination

These instructions apply when an agent is explicitly launched with a role and
asked to use this project's delegated workflow. Reading this guide does not
assign a role or start other agents. The launch prompt names the role, task,
owned paths, and reporting destination. Shared product
context and engineering conventions belong in the root [AGENTS.md](../AGENTS.md).
Read the [tooling guide](README.md) for commands and recovery procedures.

Task-specific responsibilities can be supplied by a role profile, such as
[Camera and annotation](roles/camera-annotation.md) or
[3D model viewer](roles/model-viewer.md), and
[CAD service](roles/cad-service.md). Git handoff uses the separate
[Integration](roles/integration.md) role. The launch prompt names the assigned
role and profile alongside its task and owned paths.

## Director

When acting as the director, own task decomposition, shared interfaces,
coordination, and reporting to the user. Give each feature builder a narrow role,
owned paths, completion criteria, and an initial prompt. Assign Git integration
and integration health to an explicit integration agent. Coordinate dependencies
and scope changes through the shared inbox.

Use `./workflow/builders launch` from the project root to start workers. Run
`./workflow/builders wait` as a background shell tool call to wake when workers
report, stop, need input, or disappear. Route completed results to the integration
agent and relay its handoff status to the user. Let feature builders finish their
implementation, debugging, and acceptance work; do not duplicate that work or
perform merges in parallel with the integration agent. Acknowledge events after
their handoff is handled. The default tmux session is `crafty-builders`.

## Integration

When explicitly assigned the integration role, own the main checkout's Git
handoff and combined runtime health. Follow the [integration profile](roles/integration.md).
This role is authorized to merge the exact committed results that feature
builders report through the workflow. Only one integration agent operates the
main index and merges at a time.

Use a separate inbox consumer, such as `--consumer integration`. Wait for a clean
committed done report, check its identity, owned paths, and compatibility with
the current main branch, then integrate it and record the result through the
workflow CLI. Preserve unrelated local edits and report integration conflicts
or scope decisions to the director. Ask the feature builder for feature fixes.

Prepare dependencies and the designated main runtime as needed. Run checks that
address integration changes or handoff risks, using the builder's reported
feature validation instead of routinely repeating acceptance work. Report the
worker commit, merge commit, served URL when relevant, checks actually run, and
remaining limitations to the director. The director remains the user's single
point for progress and results.

## Feature builder

Your launch prompt supplies your name, assigned role, worktree, assignment
generation, owned paths, and exact reporting command. Follow that role throughout
the assignment. Read the shared project `AGENTS.md`, this role guide, and your
saved assignment at startup and after compaction.

- Work only in your assigned worktree and owned paths. Ask the director before
  changing shared interfaces or expanding scope. Do not spawn more workers.
- Do not merge, rebase, reset, or edit another worker's branch or the director's
  checkout. The explicitly assigned integration agent owns Git integration.
- Own implementation, debugging, and feature acceptance. Run relevant checks and
  record their outcomes so the integration agent can use the result directly.
- Commit your changes on your worker branch, then run the supplied reporting
  command with `--status done`, a summary, and validation results. If Git
  permissions block a commit, report `blocked`; the director can checkpoint it.
- Report `blocked` promptly when you need a decision or dependency. Include the
  exact question. Report useful intermediate findings with `--status progress`.
- A finished Codex turn is not a completed assignment. Always send the structured
  report. Stay available in your tmux window for follow-up directions.
- Direct user instructions take precedence. Record scope changes in a progress
  report so the director can coordinate them. Hooks also record submitted prompts.
- Do not edit the shared instruction documents, generated `AGENTS.override.md`
  link, or orchestration state by hand. Use the reporting CLI; ask the director
  for changes to shared instructions.

## Tooling development

The `workflow/` folder contains the launcher, role guide, operating documentation,
and integration tests. The launcher uses uv with inline script metadata, Python's
standard library, Git, and tmux. From the project root, run:

```bash
uv run --cache-dir .builders/uv-cache --no-project python -m unittest discover -s workflow/tests -v
```

Integration tests use temporary Git repositories and private tmux sockets. They
never call a model or touch existing sessions. Keep setup local to the project.
Do not modify global Codex or tmux configuration.
