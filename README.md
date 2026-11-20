# x-corpus

A local, self-updating archive of your X bookmarks and likes, with a web screen on top and a Claude skill that searches it. Everything stays on your machine. Bun workspaces monorepo; works on macOS and Linux from a clone anywhere on disk.

## Install

1. Install Node 26 (`.node-version` says 26; the supported range is `>=25.8.1 <27`) and [Bun](https://bun.sh). Birdclaw and bird are pinned repo dependencies: no Homebrew and no global npm packages.
2. `bun install`
3. `bun run setup` checks Node, the pinned tools, the Claude CLI and the secret store, and tells you what is missing.
4. `bun run service:install` builds the web app and installs two user-level background services: `x-corpus-web` and `x-corpus-worker`. They start at login and restart on failure.
5. Open http://127.0.0.1:3030 and press **Connect X** in the sidebar's sync panel. Paste your `auth_token` and `ct0` cookies: copy them from the browser's dev tools, Application, Cookies, x.com. The worker then syncs every 3 hours (set `SYNC_INTERVAL_HOURS` in `~/.config/x-corpus/settings.env`), and **Sync now** runs one on demand.
6. Optional, for categories: `bun run secrets:set-jev` stores your Jev (TypeSafe) key, and the [Claude Code CLI](https://claude.com/claude-code) must be installed and logged in. Without them the sync and export still work and categorization is skipped.
7. Optional, for the Claude skill: `bash packages/skill/install.sh` links it into `~/.claude/skills`. The skill finds this clone from its own real path.

To update: `git pull`, rerun `bun run service:install` (it rebuilds and restarts both services), then `bun run service:status`. If you upgrade Node and the old path disappears, the services stay stopped until you rerun `service:install`; `service:status` says so.

`bun run service:uninstall` removes the services. Add `-- --purge-secrets` to also delete the stored cookies and Jev key and disconnect X.

## Read this first: cookies and X's terms

Birdclaw syncs using your X browser session cookies. X's terms do not allow this. X could limit or suspend your account. The cookies give full access to your account, so treat them like a password. By connecting X you accept that risk.

## What to know

- **Secrets are per user, data is per clone.** The cookies, the Jev key and the connection live under your user (the macOS Keychain or Linux Secret Service, service `x-corpus`, plus `~/.config/x-corpus`). The corpus (`data/`, `markdown/`, `state/`, `logs/`) lives in each clone. Connecting X from another clone or worktree replaces the cookies the installed service uses.
- **No sign-in.** The web app listens on loopback (127.0.0.1) only and has no login. That assumes a machine where only you have a login: any other local account could open the app, read the corpus, and connect or disconnect X.
- **Ports.** The installed web service uses 3030 (`X_CORPUS_PORT` overrides it). `bun run dev` uses 3000, so a dev server never collides with the service.
- **Secret fallback.** When no keychain is available, secrets fall back to an owner-only `~/.config/x-corpus/secrets.env`. The app warns when it is in use.

## Migrating from the old launchd job

If this Mac still runs the old `birdclaw-nightly` LaunchAgent, run `bun run migrate` once after `bun install`. It stops the old job but keeps it, moves your X cookies and Jev key from the old plaintext files into the secret store, installs the two services, and waits for the new worker to finish one good sync (`--timeout-minutes N` changes the 15 minute wait). Only then does it delete the old files. If anything fails it rolls back and puts the old job back. See `packages/engine/SETUP.md`.

## Layout

```
apps/web/         # @x-corpus/web: Next.js corpus screen
packages/engine/  # @x-corpus/engine: sync, export, categorization, worker, service installer (see its README and SETUP.md)
packages/skill/   # the x-corpus Claude skill (symlinked into ~/.claude/skills)
data/             # generated corpus: raw JSON + normalized JSONL   (gitignored)
markdown/         # generated per-post markdown                     (gitignored)
state/            # corpus.sqlite: categories, tags, your edits      (gitignored, not regenerated)
logs/             # sync and service logs                           (gitignored)
```

`state/corpus.sqlite` is the one file that cannot be rebuilt from X: it holds your category edits, per-post fixes, removed posts, and the change log.

## Commands (repo root)

```bash
bun run setup            # check the machine
bun run service:install  # build, then install or update both services
bun run service:status
bun run service:uninstall
bun run secrets:set-jev  # store the Jev key
bun run migrate          # move off the old launchd job
bun run sync             # run one whole sync now
bun run dev              # web app on http://127.0.0.1:3000
bun run build            # production build of the web app
bun run categorize       # categorize only
bun run build:markdown   # rebuild markdown/jsonl from existing data/*.json
bun run lint
bun run test             # node --test across engine, skill, and web
bun run typecheck
```

## Using the corpus from other projects

Read the JSONL, one self-contained record per line, in this clone:

```
data/bookmarks.normalized.jsonl
data/likes.normalized.jsonl
```

To skim or prompt, point Claude at `markdown/bookmarks/` and `markdown/likes/`: one `.md` per post, plus `index.md`. The `x-corpus` Claude skill (`packages/skill/`) searches the JSONL by keyword and reads categories, a topic's posts, and a topic's resources from the store.
