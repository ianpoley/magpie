# ADR 0011: Command-line entry points

- Status: accepted
- Date: 2026-11-21

## Context

Magpie keeps no comments in its code. The decisions below used to be comments next to the code they explain. Each one records something the code cannot say by itself: why it was done this way, a rule from an outside system, or an invariant that must hold. Each entry names the file and the symbol it applies to, and links to where the comment last appeared, at commit `7ec16b3`.

When the code changes, update or remove the entry here in the same commit.

## Decisions

### `packages/engine/bin/categorize.mjs`

#### 0011.1 `categorize.mjs exit codes`

Exits 0 when the run reached its end, even if a stage failed or warned (the summary and the run row say which). Exits 1 when another run holds the lock or the run could not start, and 2 for a bad argument.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/bin/categorize.mjs#L9-L11)

### `packages/engine/bin/magpie.mjs`

#### 0011.2 `magpie.mjs exit codes`

Exits 0 on success, 1 when the command failed and 2 for a bad argument.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/bin/magpie.mjs#L5)

#### 0011.3 `service import guard`

A Node too old to run TypeScript would fail with a loader error; name the range instead.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/bin/magpie.mjs#L26)

### `packages/engine/bin/run-cli.mjs`

#### 0011.4 `categorizeDeps (lazy jev client)`

Built on first use: a missing API key then fails the tagging stage, not the whole run. The pending client is shared, so concurrent first asks read the secret store once. A failed read is not kept: the worker lives for days, and a key added later with secrets:set-jev must be picked up by the next run without a restart.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/bin/run-cli.mjs#L48-L51)

### `packages/engine/bin/sync.mjs`

#### 0011.5 `sync.mjs exit codes`

Exits 0 when the run reached its end, even if a stage failed (the summary and the run row say which). Exits 1 when a run is already in progress or the run could not start, and 2 for a bad argument.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/bin/sync.mjs#L5-L7)
