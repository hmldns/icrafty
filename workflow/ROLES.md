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

When acting as the director, own initial delegation, report routing, and reporting
to the user. Give each feature builder a narrow role, owned paths, shared
interfaces, completion criteria, and an initial prompt. Assign Git integration
and integration health to an explicit integration agent. Resolve concrete
blockers or shared conflicts when they are brought to you for resolution.

When the user gives directions directly in a worker's pane, track them for
understanding and visibility. Do not follow them with coordination messages,
repeat or reinterpret them, reinforce them with reminders or extra requirements,
or steer the worker afterward. The user has already authorized that follow-up;
let the builder act on it and finish. Further director involvement is for a
concrete blocker or shared conflict brought for resolution, or an explicit
request for coordination.

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

- Work in your assigned worktree and follow the assigned scope, including changes
  explicitly authorized by the user. For other proposed scope or shared-interface
  changes, bring the decision to the director before proceeding. Do not spawn
  more workers.
- Do not merge, rebase, reset, or edit another worker's branch or the director's
  checkout. The explicitly assigned integration agent owns Git integration.
- Own implementation, debugging, and feature acceptance. Run relevant checks and
  record their outcomes so the integration agent can use the result directly.
- Commit your changes on your worker branch, then run the supplied reporting
  command with `--status done`, a summary, and validation results. If Git
  permissions block a commit, report `blocked` for the integration agent to handle.
- Report `blocked` promptly when you need a decision or dependency. Include the
  exact question. Report useful intermediate findings with `--status progress`.
- A finished Codex turn is not a completed assignment. Always send the structured
  report. Stay available in your tmux window for follow-up directions.
- Act on direct user instructions without asking the director to confirm them
  again. Record the follow-up and any scope changes in a progress report for
  visibility, then continue implementation, debugging, and acceptance. Hooks also
  record submitted prompts. Bring concrete blockers or shared conflicts to the
  director; a visibility report does not request unsolicited supervision.
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
