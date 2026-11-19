# x-corpus

Local, self-updating archive of @ianpoley's X bookmarks + likes, plus a web UI
on top. Bun workspaces monorepo.

## Layout

```
apps/web/         # @x-corpus/web — Next.js UI over the corpus
packages/engine/  # @x-corpus/engine — Birdclaw sync + export (see its README / SETUP.md)
data/             # generated corpus: raw JSON + normalized JSONL   (gitignored)
markdown/         # generated per-post markdown                     (gitignored)
logs/             # sync logs                                       (gitignored)
```

The engine writes `data/` + `markdown/`; the web app and other tools read them.

## Commands (repo root)

```bash
bun install
bun run dev              # web app on http://localhost:3000
bun run build            # production build of web app
bun run lint
bun run sync             # run a Birdclaw sync + export now
bun run build:markdown   # rebuild markdown/jsonl from existing data/*.json
```

## Referencing the corpus from other projects

For programmatic use, read the JSONL — each line is a self-contained record:

```
~/x-corpus/data/bookmarks.normalized.jsonl
~/x-corpus/data/likes.normalized.jsonl
```

For skimming / prompting, point Claude at `markdown/bookmarks/` and
`markdown/likes/` — one frontmatter'd `.md` per post, plus `index.md`.
The `x-corpus` Claude skill (`~/.claude/skills/x-corpus`) searches the JSONL.
