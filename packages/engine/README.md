# @x-corpus/engine — Birdclaw sync + export

Keeps a local, self-updating archive of everything @ianpoley has bookmarked or
liked on X.

**Source:** [Birdclaw](https://birdclaw.sh/) syncs from X into `~/.birdclaw/`.
A launchd job (`com.ianpoley.birdclaw-nightly`, every 3h) runs
`bin/birdclaw-nightly.sh`, which refreshes the DB and re-exports it to the
**repo root** (`~/x-corpus/data`, `~/x-corpus/markdown`, `~/x-corpus/logs`).

## Files

```
bin/birdclaw-nightly.sh   # sync bookmarks + likes, export JSON, build markdown/jsonl, categorize
bin/build-markdown.mjs    # birdclaw JSON -> per-post .md + index.md + normalized .jsonl
bin/categorize.mjs        # ingest -> resolve links -> tag -> discover or evolve categories
src/                      # the categorize pipeline (TypeScript, run directly by node)
launchd/…plist            # scheduler (installed copy lives in ~/Library/LaunchAgents)
SETUP.md                  # one-time install + scheduling steps (start here)
```

Runtime is plain bash + node (launchd's PATH has no bun). The `bun` scripts are
convenience wrappers only.

## Categorization

After the export, the job runs `bin/categorize.mjs`. It never fails the job: the
export is already written when it starts.

| Stage | What it does |
|---|---|
| ingest | Merges the bookmark and like exports into one row per post in `state/corpus.sqlite`. |
| links | Follows each link to its final URL once, caches title and description, and groups links into resources. Failures retry on later runs. |
| tag | Asks Jev (TypeSafe) one yes/no question per post and topic, and stores the probability. Only missing pairs are scored. |
| discovery / evolve | Claude proposes categories on the first run. Later runs create a topic when enough Unfiled posts collect, or split a topic that grew too broad; Jev's counts decide whether a proposal applies. Every change is logged and can be undone from the screen. |

Thresholds and limits live in `src/config.ts`. All Jev question wording lives in
`src/jev/questions.ts`.

**Credentials**

- Jev: `TYPESAFE_API_KEY` in `~/.config/x-corpus/secrets.env` (outside the repo).
- Claude: the Claude Code CLI at `~/.local/bin/claude`, using your existing login.
  It runs with no built-in tools, no MCP servers, and no slash commands, and its
  output is accepted only when it matches a JSON schema. If the CLI is missing or
  fails, category upkeep is skipped for that run and tagging still completes.

**Run by hand**

```bash
bun run categorize                    # from repo root
node bin/categorize.mjs --help        # --limit-posts N, --skip-links, --skip-evolve
```

A lock file in `state/` stops a manual run and a scheduled run from overlapping.
Each run's per-stage outcome is stored in the `runs` and `run_stages` tables and
shown in the screen's sync status. `data/sync-status.json` records whether the X
sync itself succeeded.

**Tests:** `bun run test` from the repo root (`node --test`; Jev, Claude, and HTTP are faked).

## Output (repo root, gitignored)

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
logs/                         # per-run logs + launchd stdout/err
```

## Refreshing manually

```bash
bun run sync                                         # from repo root
bash ~/x-corpus/packages/engine/bin/birdclaw-nightly.sh   # equivalent
bun run build:markdown                               # rebuild md/jsonl from existing JSON, no X calls
```

After editing the plist, reinstall it:

```bash
cp ~/x-corpus/packages/engine/launchd/com.ianpoley.birdclaw-nightly.plist ~/Library/LaunchAgents/
launchctl unload ~/Library/LaunchAgents/com.ianpoley.birdclaw-nightly.plist
launchctl load   ~/Library/LaunchAgents/com.ianpoley.birdclaw-nightly.plist
```
