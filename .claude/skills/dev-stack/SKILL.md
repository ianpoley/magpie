---
name: dev-stack
description: Start the local dev stack for Magpie (x-corpus) — the Next.js web app dev server in apps/web — or reuse the one already running, and report its URL and PID. Use when asked to start, run, launch, boot or open the app, the dev server, or the local stack, or when a browser check needs the app running.
model: sonnet
argument-hint: "[port]"
---

# Start the local dev stack

The dev stack is one process: `next dev` for `apps/web`, started from the repo root with `bun run dev`. It listens on `127.0.0.1` only. Run every command from the repo root (the clone or worktree this session is in). Use repo-relative paths.

Optional argument: a preferred port (default `3000`).

## Rules

- **One `next dev` per app directory.** Next writes `apps/web/.next/dev/lock`. A second `next dev` in the same directory exits and prints `kill <pid>`. Never follow that hint. Reuse the running server.
- **Stop only by PID.** Never `pkill -f next`, `pkill -f "next dev"` or `pkill -f next-server`. Never kill a process on a port you did not open. See `docs/solutions/workflow-issues/one-next-dev-server-per-app-directory.md`.
- **Start the web dev server only.** Do not run `service:install`, `sync`, `migrate` or Connect X. From a worktree, these point the user's installed services at this clone or replace their X cookies.
- **Never use the foreground.** `next dev` does not exit.

## Steps

1. **Dependencies.** If `apps/web/node_modules/.bin/next` is missing, run `bun install`.

2. **Reuse a running server.** If `apps/web/.next/dev/lock` exists, read it. It is JSON: `{"pid":…,"port":…,"hostname":"127.0.0.1","appUrl":"http://127.0.0.1:3000","startedAt":…}`.
   - If `kill -0 <pid>` succeeds, the server is running. Report its `appUrl` and `pid`, then stop. Do not start another server.
   - If the PID is dead, the lock is stale (a hard-killed server leaves it behind). Continue: a new `next dev` takes over a stale lock.
   - The file has no `.json` extension, so `require()` fails on it. Use `JSON.parse(fs.readFileSync(...))` or `sed -E 's/.*"pid":([0-9]+).*/\1/'`.

3. **Pick a free port.** Start at the requested port (default `3000`) and go up by one until `lsof -nP -iTCP:<port> -sTCP:LISTEN` prints nothing. Do not rely on Next to find a free port: it binds `127.0.0.1:<port>` even when another process holds `*:<port>`, and then it takes that process's loopback traffic without an error. Never use `3030`, the installed `x-corpus-web` service.

4. **Start in the background**, detached, with output in `logs/` (gitignored):

   ```bash
   mkdir -p logs
   nohup bun run dev -- -p <port> > logs/dev-web.log 2>&1 &
   ```

5. **Wait until it is ready.** Poll for up to 60 seconds until `apps/web/.next/dev/lock` exists and `curl -s -o /dev/null -w '%{http_code}' --max-time 60 <appUrl>/` returns `200`. The first request compiles the page and can take several seconds. If it does not come up, show the last 30 lines of `logs/dev-web.log` and stop.

6. **Report:**
   - the URL and PID **from the lock**, not the port you asked for
   - the log: `logs/dev-web.log` (Next also writes `apps/web/.next/dev/logs/next-development.log`)
   - how to stop it: `kill <pid>`, using the lock PID. This stops the whole `bun → next` tree and removes the lock.
   - Data: in a linked git worktree the app reads the main checkout's `data/` and `state/` (the engine finds it from `.git`), so it shows the real corpus and the real worker's status. If the panel says background sync isn't running, run `bun run service:status`. Install services only from the main checkout; `service:install` refuses from a worktree.

## Notes

- The server serves the live store. Read-only browser checks may use it. Checks that write (category edits, pins, post removal, undo) need a production build against a scratch copy (see the solution doc).
- If this branch adds a store migration (`packages/engine/src/store/schema.ts`), the engine refuses to upgrade the main checkout's store from a worktree. Set `X_CORPUS_ROOT` to a scratch copy of the data root to work on it.
- `next dev` may rewrite the managed block in `apps/web/AGENTS.md`. If `git status` shows that file changed, it comes from Next, not from you.
