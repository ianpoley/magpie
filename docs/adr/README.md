# Architecture decision records

Magpie bans code comments: `bun run lint:comments` fails on any new one. A decision the code cannot state by itself goes here, in the file for its subsystem, as a new numbered entry. Run the `/delete-comment` skill to move what is left of the old comments.

Each entry has a heading with its number and the symbol it applies to, then the decision in plain prose and a link to where it came from.

| ADR | Subsystem | Entries |
|---|---|---|
| [0001](0001-engine-config.md) | Engine configuration and paths | 8 |
| [0002](0002-engine-store.md) | The store: schema, membership views and edits | 19 |
| [0003](0003-engine-sync.md) | Sync: X, the run, the worker and the scheduler | 54 |
| [0004](0004-engine-links.md) | Link resolution and resources | 22 |
| [0005](0005-engine-jev.md) | Scoring posts with Jev | 16 |
| [0006](0006-engine-claude.md) | Headless Claude calls | 8 |
| [0007](0007-engine-evolve.md) | Growing the category list | 22 |
| [0008](0008-engine-secrets.md) | Secrets | 29 |
| [0009](0009-engine-service.md) | Background services | 24 |
| [0010](0010-engine-setup.md) | Setup and migration | 15 |
| [0011](0011-engine-cli.md) | Command-line entry points | 5 |
| [0012](0012-skill.md) | The Claude Code skill | 10 |
| [0013](0013-web-data.md) | Web app: reading and changing data | 52 |
| [0014](0014-web-ask.md) | Web app: Ask | 10 |
| [0015](0015-web-ui.md) | Web app: interface behavior | 108 |
| [0016](0016-styles.md) | Design tokens and styles | 19 |
| [0017](0017-tests.md) | Tests and fixtures | 15 |
