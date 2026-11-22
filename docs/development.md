# Working on Magpie

[Back to the README](../README.md)

## Commands

Run these from the repo root. [docs/usage.md](usage.md#commands) lists the setup, service and sync commands.

```bash
bun run dev        # web app on http://127.0.0.1:3000
bun run build      # production build of the web app
bun run lint
bun run typecheck
bun run test       # node --test across engine, skill and web
```

The dev server uses port 3000 and the installed service uses 3030, so both can run at the same time. In a linked git worktree, the dev server shows your real corpus. Read [Things to know](usage.md#things-to-know) before you edit data there.

## Project layout

```
install.sh        # one-command installer: Bun, clone or update, then setup
apps/web/         # @magpie/web: the Next.js corpus screen
packages/engine/  # @magpie/engine: sync, export, categorize, worker, service installer
packages/skill/   # the magpie Claude skill (symlinked into ~/.claude/skills)
docs/adr/         # decisions the code cannot state, one file per subsystem
docs/plans/       # implementation plans
docs/solutions/   # solved problems and tooling decisions
data/             # generated: raw JSON + normalized JSONL   (gitignored)
markdown/         # generated: one .md per post              (gitignored)
state/            # corpus.sqlite: your edits live here      (gitignored, not regenerated)
logs/             # sync and service logs                    (gitignored)
```

## Read next

| Read | For |
|---|---|
| [CONCEPTS.md](../CONCEPTS.md) | Domain vocabulary: X session, secret backend, worker, run lock |
| [packages/engine/README.md](../packages/engine/README.md) | Sync pipeline, categorization stages, output formats |
| [packages/engine/SETUP.md](../packages/engine/SETUP.md) | Each setup step by hand, update and remove |
| [apps/web/README.md](../apps/web/README.md) | Everything on the screen, code layout, checks |
| [apps/web/AGENTS.md](../apps/web/AGENTS.md) and [DESIGN.md](../apps/web/DESIGN.md) | Framework, component and design-system rules |
| [CLAUDE.md](../CLAUDE.md) | Rules for tests and code comments |
