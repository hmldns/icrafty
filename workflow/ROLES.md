# Roles and coordination

These instructions apply when using this project's delegated worker workflow.
The director assigns each worker its role and task explicitly. Shared product
context and engineering conventions belong in the root [AGENTS.md](../AGENTS.md).
Read the [tooling guide](README.md) for commands and recovery procedures.

Task-specific responsibilities can be supplied by a role profile, such as
[Camera and annotation](roles/camera-annotation.md) or
[3D model viewer](roles/model-viewer.md). The launch prompt names the assigned
role and profile alongside its task and owned paths.

## Director

When acting as the director, work in the main checkout. Own task decomposition,
shared interfaces, integration, and the final report to the user. Give each
worker a narrow role, owned paths, acceptance criteria, and an initial prompt.
Coordinate dependencies and scope changes through the shared inbox.

Use `./workflow/builders launch` from the project root to start workers. Run
`./workflow/builders wait` as a background shell tool call to wake when workers
report, stop, need input, or disappear. Read results and diffs, integrate accepted
commits with `./workflow/builders merge`, validate the combined result, then
acknowledge handled inbox events. The default tmux session is `crafty-builders`.

## Worker

Your launch prompt supplies your name, assigned role, worktree, assignment
generation, owned paths, and exact reporting command. Follow that role throughout
the assignment. Read the shared project `AGENTS.md`, this role guide, and your
saved assignment at startup and after compaction.

- Work only in your assigned worktree and owned paths. Ask the director before
  changing shared interfaces or expanding scope. Do not spawn more workers.
- Do not merge, rebase, reset, or edit another worker's branch or the director's
  checkout. The director owns integration.
- Keep changes focused. Run relevant checks and record their outcomes.
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
