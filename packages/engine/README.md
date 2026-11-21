# @magpie/engine: sync, export, categorize, services

Keeps a local, self-updating archive of your X bookmarks and likes. Setup steps are in the repo `README.md` and `SETUP.md`.

**Source:** [Birdclaw](https://birdclaw.sh/) and bird, both pinned repo dependencies, sync from X using your X session cookies (see the cookie and terms note in the repo README). The cookies live in the OS secret store, not in files in the repo.

Two user-level background services run the system:

- `magpie-worker` wakes on a schedule (every `SYNC_INTERVAL_HOURS`, default 3, in `~/.config/magpie/settings.env`) and runs one whole sync. It also picks up sync requests from the web app's Sync now and Connect X.
- `magpie-web` serves the web app on http://127.0.0.1:3030 (`MAGPIE_PORT` overrides).

## Files

```
bin/magpie.mjs          # the CLI: setup, service install|uninstall|status, secrets set-jev, sync, migrate
bin/sync.mjs              # one whole sync under the run lock: X check, bookmarks + likes, export JSON, build markdown/jsonl, categorize
bin/worker.mjs            # the scheduler process the worker service runs
bin/build-markdown.mjs    # birdclaw JSON -> per-post .md + index.md + normalized .jsonl
bin/categorize.mjs        # ingest -> resolve links -> tag -> discover or evolve categories
bin/birdclaw-nightly.sh   # legacy: the old launchd job's script, kept only so `migrate` can roll back to it
launchd/…plist            # legacy: the old job's plist, kept for the same reason
src/                      # the pipeline, secret store, scheduler and service renderers (TypeScript, run directly by node)
SETUP.md                  # setup, connect, service install, migration
```

Everything runs on plain node. The `bun` scripts are convenience wrappers only.

## Categorization

After the export, the sync runs the categorize stages. They never fail the sync: the export is already written when they start.

| Stage | What it does |
|---|---|
| ingest | Merges the bookmark and like exports into one row per post in `state/corpus.sqlite`. |
| links | Follows each link to its final URL once, caches title and description, and groups links into resources. Failures retry on later runs. |
| tag | Asks Jev (TypeSafe) one yes/no question per post and topic, and stores the probability. Only missing pairs are scored. |
| discovery / evolve | Claude proposes categories on the first run. Later runs create a topic when enough Unfiled posts collect, or split a topic that grew too broad; Jev's counts decide whether a proposal applies. Every change is logged and can be undone from the screen. |

Thresholds and limits live in `src/config.ts`. All Jev question wording lives in `src/jev/questions.ts`.

**Credentials**

- X cookies and the Jev key are in the OS secret store (macOS Keychain, Linux Secret Service), service `magpie`. Connect X in the web app; store the Jev key with `bun run secrets:set-jev`. When no secret store is available they fall back to an owner-only `~/.config/magpie/secrets.env`, and the app warns.
- Claude: the Claude Code CLI, using your existing login. The services' PATH includes `~/.local/bin`. It runs with no built-in tools, no MCP servers, and no slash commands, and its output is accepted only when it matches a JSON schema. If the CLI is missing or fails, category upkeep is skipped for that run and tagging still completes.

**Run by hand**

```bash
bun run sync                          # from repo root: one whole sync now
bun run categorize                    # categorize only
node bin/categorize.mjs --help        # --limit-posts N, --skip-links, --skip-evolve
```

A lock in `state/` stops a manual run, a scheduled run and Sync now from overlapping. Each run's per-stage outcome is stored in the `runs` and `run_stages` tables and shown in the screen's sync status. `data/sync-status.json` records whether the X sync itself succeeded.

**Tests:** `bun run test` from the repo root (`node --test`; Jev, Claude, X and HTTP are faked).

## Output (in the clone, gitignored)

```
data/
  bookmarks.json              # raw birdclaw --json export
  likes.json
  sync-status.json            # exit status + time of the last bookmarks and likes sync
  bookmarks.normalized.jsonl  # one flat record per line: {type,id,handle,name,created,url,text}
  likes.normalized.jsonl
markdown/
  bookmarks/index.md          # one-line-per-post table of contents
  bookmarks/<date>_<handle>_<id>.md   # one post per file, YAML frontmatter + quoted text
  likes/…
state/
  corpus.sqlite               # posts, links, resources, categories, tags, your edits, change log
logs/                         # per-run logs + service stdout/err
```

## Refreshing manually

```bash
bun run sync                 # X cookies come from the secret store
bun run build:markdown       # rebuild md/jsonl from existing JSON, no X calls
bun run service:install      # after git pull: rebuild and restart both services
bun run service:status
```
