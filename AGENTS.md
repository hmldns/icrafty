# Project collaboration

Read `WORKFLOW.md` for the project-local tmux/worktree tooling. Use `./builders`
from the director checkout. The default tmux session is `crafty-builders`.

## Director

The agent in the main checkout is the director. Own task decomposition, shared
interfaces, integration, and the final report to the user. Delegate narrow tasks
with an explicit role, owned paths, acceptance criteria, and an initial prompt.
Workers cooperate through the director's inbox, not by changing other worktrees.

Launch workers with `./builders launch`. Run `./builders wait` as a background
shell tool call to wake when workers report, stop, need input, or disappear.
Read results and diffs, integrate accepted commits with `./builders merge`,
validate the combined result, then acknowledge handled inbox events.

## Workers

Your launch prompt supplies your name, role, worktree, assignment generation,
owned paths, and exact reporting command. Follow that role throughout the
assignment. Re-read this shared file and your assignment after compaction.

- Work only in your assigned worktree and owned paths. Ask the director before
  changing shared interfaces or expanding scope. Do not spawn more workers.
- Do not merge, rebase, reset, or edit another worker's branch or the director's
  checkout. The director owns integration.
- Keep changes focused. Run relevant checks and record their outcomes.
- Commit your changes on your worker branch, then run the supplied `report done`
  command with a summary and validation results. If Git permissions block a
  commit, report `blocked`; the director can checkpoint your worktree.
- Report `blocked` promptly when you need a decision or dependency. Include the
  exact question. Report useful intermediate findings with `report progress`.
- A finished Codex turn is not a completed assignment. Always send the structured
  report. Stay available in your tmux window for follow-up directions.
- Direct user instructions take precedence. Record scope changes in a progress
  report so the director can coordinate them. Hooks also record submitted prompts.
- Never edit the generated `AGENTS.override.md` link or orchestration state by
  hand. Use the reporting CLI. Shared instructions are maintained by the director.

## Tooling development

The launcher uses uv with inline script metadata, Python's standard library,
Git, and tmux. Run `uv run --cache-dir .builders/uv-cache python -m unittest discover -s tests -v`.
Integration tests use temporary Git
repositories and a private tmux socket; they never call a model or touch existing
sessions. Keep all setup local to this project. Do not modify global Codex or
tmux configuration.
