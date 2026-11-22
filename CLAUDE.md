# CLAUDE.md

## Tests: only for code complex enough to need them

Do not write tests for functions or code whose cognitive complexity, measured with [cccc](https://github.com/moznion/cccc), is 5 or less, unless that code contains a regular expression. Prune existing tests that break this rule.

The point is to keep the suite from growing a test for every trivial function. When in doubt, use judgment toward fewer tests, not more.

How to measure:

- Install: download the release binary for your platform from https://github.com/moznion/cccc/releases (check its `.sha256`), or `cargo install cccc-cli`.
- Score a file: `cccc --table path/to/file.ts`. JSON (the default) lists every function with its `cognitive` score and nested functions under `children`.
- Score the code a test actually runs: the function it calls, plus its nested functions, plus every repo function those reach. A short entry point such as `installService` that hands off to complex helpers counts as complex.
- A regular expression counts wherever the code under test uses it, including a module-level constant such as `LOOPBACK_HOST` that a function calls `.test()` on.
- cccc does not see SQL. A function that is a thin wrapper around a query or a store view whose logic lives in the SQL (filters, `COALESCE`, band thresholds) is judged by that SQL, not by its cccc score.

## No code comments

Code carries no comments. `bun run lint:comments` (part of `bun run lint`) fails on any new one, and `eslint-suppressions.json` lists the few still waiting to be moved. Name things so the code says what it does. Put a decision the code cannot state in `docs/adr/`, in the file for its subsystem. Tool directives (`eslint-disable`, `@ts-expect-error`, `turbopackIgnore`) are allowed. To clear what is left, run `/delete-comment`.

## Pull requests: rebase onto main, never merge it in

GitHub merges PRs here by rebase only. Merge commits and squash are turned off. A rebase merge replays each commit of the branch onto main, one at a time. So a branch that merged main in still shows "This branch cannot be rebased due to conflicts": the merge commit fixes only the combined result, not each replayed commit.

- Before you push a PR branch or open a PR, run `git fetch origin && git rebase origin/main`. Resolve conflicts commit by commit, run the checks, then `git push --force-with-lease`.
- Never `git merge origin/main` into a PR branch. If it already happened, rebase onto `origin/main` and the merge commit drops out.
- `.claude/hooks/rebase-guard.sh` blocks `git push` and `gh pr create` from Claude Code while the branch is behind `origin/main` or holds a merge commit. Pushes to `main` itself pass.
- Parallel worktree sessions often add a design-round entry at the same place in `apps/web/DESIGN.md`. When two entries conflict, keep both. They are separate records.
- Leave uncommitted work from another session alone. If the working tree is dirty, rebase in a throwaway worktree (`git worktree add --detach <scratch> <branch>`) and push from there.
