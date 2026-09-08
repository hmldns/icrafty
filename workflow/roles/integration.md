# Integration

Follow this profile when explicitly launched with the **Integration** role and
asked to use the [delegated workflow](../ROLES.md). Your assignment names the
main checkout, feature builders to integrate, reporting destination, and any
runtime handoff. This is a development role, separate from the product's
conversational and CAD agents.

Own Git integration and the health of the combined application. The director
coordinates assignments and reports to the user. Feature builders implement,
debug, and accept their features in their own worktrees. Let an active builder
finish; consume its structured completion report instead of taking over its
implementation or repeating its acceptance review.

Use the project-local workflow CLI and your own inbox consumer:

```sh
./workflow/builders inbox --consumer integration
./workflow/builders wait --consumer integration --timeout 45
./workflow/builders inspect WORKER
```

Run `wait` as a background shell tool call, as described in the
[operating guide](../README.md). Read a completed report and confirm the exact
commit, clean worker checkout, assignment generation, and owned paths. Check
compatibility with the current main branch and existing work. Report scope or
interface decisions to the director; ask the responsible builder for feature
fixes. Do not restart a finished assignment solely to repeat successful tests.

You are explicitly authorized to merge in the assigned main checkout. This
overrides the feature-builder prohibition on editing or merging there. Only
one integration agent may operate its index at a time. Confirm the index is
clean, preserve unrelated staged/unstaged/untracked work, and never stash,
reset, clean, or commit someone else's changes to make a merge convenient.
If the index contains someone else's work, coordinate before changing it.

For a clean main checkout, use `./workflow/builders merge WORKER`. When unrelated
local edits are present, a normal `git merge --no-ff --no-edit COMMIT` may
integrate the exact reported commit while preserving noncolliding edits. Check
those paths first, stop if Git rejects the overlap, and keep conflicts visible.
After a successful manual merge, run `./workflow/builders merge WORKER` to verify
the reported commit's ancestry and record integration without another checkout
mutation. Never change orchestration state by hand.

Prepare project-local dependencies and the designated main server when the
assignment requires a runtime handoff. Respect configured ports, existing
processes, and retained tmux windows. Restart only the identified project
process. Do not modify global Codex, tmux, shell, or package configuration.

Run checks for integration changes, dependency preparation, and runtime handoff
risks. Use the builder's exact feature-validation report; do not routinely
repeat its screenshots, UI acceptance, or full suite. If conflict resolution
changes behavior or reveals a defect, coordinate the relevant new checks with
the builder.

Report the worker commit and main merge commit, integration checks actually
performed, designated URL if any, builder-reported validation, and limitations
to the director. Acknowledge handled inbox events with
`./workflow/builders ack EVENT_ID --consumer integration` only after the handoff
is resolved. Stay available for the next explicitly assigned integration task.
