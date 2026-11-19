---
title: "One next dev per app directory: serve scratch data from a production build"
date: 2026-11-19
category: workflow-issues
module: apps/web
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - Several agents or terminals work on the web app at the same time
  - A browser check needs to write to the store
  - A dev server someone else started is already running in apps/web
  - Stopping a server after a verification run
symptoms:
  - "A dev server stops while nobody who owns it asked it to"
  - "The page the user was watching on port 3000 goes away mid-session"
tags: [nextjs, dev-server, parallel-agents, scratch-store, browser-verification, process-management]
---

# One next dev per app directory: serve scratch data from a production build

## Context

During the corpus-screen build, the orchestrating session kept one `next dev` running in `apps/web` so the user could watch the screen change. Workers building later units each started their own `next dev` in the same directory, pointed at a scratch copy of the store, for browser checks that edit categories.

The shared server on port 3000 was stopped more than once without the orchestrator asking, each time while a worker was starting or stopping its own `next dev` in the same directory. The exact kill was not traced; the session attributed it to the workers' start and stop steps. One worker also tried `pkill -f next-server`, which would have taken down every Next process on the machine, including an unrelated server on another port; the permission system refused it. An earlier scaffold session in this repo stopped its server with `pkill -f "next dev"`, the same pattern.

Two things were wrong in the working belief. A different port does not make a second dev server independent, and stopping "the dev server" by name is not scoped to the one you started.

## Guidance

**One `next dev` per app directory.** Next keeps a single dev server per project. It writes the PID, port and URL to `apps/web/.next/dev/lock`; a second `next dev` in the same project prints the existing server's URL and PID with a command to stop it (`apps/web/node_modules/next/dist/docs/01-app/02-guides/ai-agents.md`). A worker that follows that suggestion kills someone else's server. Use the running one, or leave it alone.

**Read-only checks use the running dev server.** It serves the live store. Do not trigger anything that writes there: no category edit, pin, post removal or undo.

**Checks that write use a production build against a copy of the store.** From the repo root and then `apps/web`:

```bash
bun run build
cd apps/web
X_CORPUS_STORE=/path/to/scratch/copy.sqlite ./node_modules/.bin/next start -H 127.0.0.1 -p 3077
```

- The build writes to `apps/web/.next/` and the dev server works under `apps/web/.next/dev/`, so the two coexist. In this session a build and a `next start` on another port ran several times beside the dev server on 3000 without disturbing it.
- `X_CORPUS_STORE` is read when the store is opened, not at build time, so one build serves any copy.
- Make the copy with SQLite's `VACUUM INTO` through `node:sqlite`, which gives a consistent file even if the sync job is writing. Keep the copy outside the repo's `state/` directory.
- Keep `-H 127.0.0.1`. The app has no auth and its server actions edit the store.

**Stop only what you started, by PID.** Record the PID when you start a server and kill that PID. Never `pkill -f next`, `pkill -f "next dev"` or `pkill -f next-server`, and never kill whatever holds a port you did not open.

**If a build fails on a lock while the dev server runs, report it.** Do not stop the dev server to get past it. This did not happen in the session, but the rule kept the shared server safe.

## Why This Matters

The user's running page is shared state. Every unintended restart loses their place and, during a multi-worker build, repeats for as long as the workers keep colliding.

The store is personal data with no backup step in the edit path. A browser check that renames, merges or deletes categories on the live store changes the user's real corpus. Serving a copy makes those checks free.

Killing by name is wider than it looks: a pattern match cannot tell this app's server from any other Next process on the machine.

## When to Apply

- Before starting any server in `apps/web`: check `apps/web/.next/dev/lock` and whether its PID is alive.
- When briefing a worker or subagent whose verification needs a browser.
- When a verification step edits anything through the screen or the server actions.

## Examples

Before, per worker (the shape of what the sessions did, not a verbatim command):

```bash
cd apps/web && X_CORPUS_STORE=$COPY bunx next dev -p 3107 &   # second dev server in the project
# ... checks ...
pkill -f "next dev"                                            # stops every dev server, including the user's
```

After:

```bash
bun run build
cd apps/web
X_CORPUS_STORE=$COPY ./node_modules/.bin/next start -H 127.0.0.1 -p 3077 &
server_pid=$!
# ... checks against http://127.0.0.1:3077 ...
kill "$server_pid"
```

A production build has no hot reload. A worker that is iterating on UI code rebuilds between checks, or does its read-only checks against the shared dev server and saves the scratch build for the final write-path pass.

## Related

- `apps/web/README.md`, "Run it"
- `packages/engine/src/config.ts`: `paths()` and the `X_CORPUS_STORE` override
- `docs/solutions/build-errors/turbopack-static-import-of-engine-workspace-package.md`: why the engine loads at runtime, which is what lets one build serve any store file
