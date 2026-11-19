# x-corpus

Local, self-updating archive of @ianpoley's X bookmarks + likes, plus a web UI
on top. Bun workspaces monorepo.

## Layout

```
apps/web/         # @x-corpus/web — Next.js corpus screen
packages/engine/  # @x-corpus/engine — Birdclaw sync, export, and categorization (see its README / SETUP.md)
packages/skill/   # the x-corpus Claude skill (symlinked into ~/.claude/skills)
data/             # generated corpus: raw JSON + normalized JSONL   (gitignored)
markdown/         # generated per-post markdown                     (gitignored)
state/            # corpus.sqlite: categories, tags, your edits      (gitignored, not regenerated)
logs/             # sync logs                                       (gitignored)
```

The engine writes `data/`, `markdown/`, and `state/corpus.sqlite`. The web app and the skill read the store; the skill's keyword search also reads the JSONL.

`state/corpus.sqlite` is the one file that cannot be rebuilt from X: it holds your category edits, per-post fixes, removed posts, and the change log.

## Commands (repo root)

```bash
bun install
bun run dev              # web app on http://localhost:3000
bun run build            # production build of web app
bun run lint
bun run sync             # run a Birdclaw sync + export + categorize now
bun run categorize       # categorize only: resolve links, tag posts, evolve categories
bun run build:markdown   # rebuild markdown/jsonl from existing data/*.json
bun run test             # node --test across engine, skill, and web
bun run typecheck
```

The web app binds to 127.0.0.1 only. It has no auth, and its actions edit the store.

## Referencing the corpus from other projects

For programmatic use, read the JSONL — each line is a self-contained record:

```
~/x-corpus/data/bookmarks.normalized.jsonl
~/x-corpus/data/likes.normalized.jsonl
```

For skimming / prompting, point Claude at `markdown/bookmarks/` and
`markdown/likes/` — one frontmatter'd `.md` per post, plus `index.md`.
The `x-corpus` Claude skill lives in `packages/skill/` and is installed as a symlink
at `~/.claude/skills/x-corpus` (`bash packages/skill/install.sh`). It searches the JSONL
by keyword and reads categories, a topic's posts, and a topic's resources from the store.
