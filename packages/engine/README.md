# @x-corpus/engine — Birdclaw sync + export

Keeps a local, self-updating archive of everything @ianpoley has bookmarked or
liked on X.

**Source:** [Birdclaw](https://birdclaw.sh/) syncs from X into `~/.birdclaw/`.
A launchd job (`com.ianpoley.birdclaw-nightly`, every 3h) runs
`bin/birdclaw-nightly.sh`, which refreshes the DB and re-exports it to the
**repo root** (`~/x-corpus/data`, `~/x-corpus/markdown`, `~/x-corpus/logs`).

## Files

```
bin/birdclaw-nightly.sh   # sync bookmarks + likes, export JSON, build markdown/jsonl
bin/build-markdown.mjs    # birdclaw JSON -> per-post .md + index.md + normalized .jsonl
launchd/…plist            # scheduler (installed copy lives in ~/Library/LaunchAgents)
SETUP.md                  # one-time install + scheduling steps (start here)
```

Runtime is plain bash + node (launchd's PATH has no bun). The `bun` scripts are
convenience wrappers only.

## Output (repo root, gitignored)

```
data/
  bookmarks.json              # raw birdclaw --json export
  likes.json
  bookmarks.normalized.jsonl  # one flat record per line: {type,id,handle,name,created,url,text}
  likes.normalized.jsonl
markdown/
  bookmarks/index.md          # one-line-per-post table of contents
  bookmarks/<date>_<handle>_<id>.md   # one post per file, YAML frontmatter + quoted text
  likes/…
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
