# ADR 0001: Engine configuration and paths

- Status: accepted
- Date: 2026-11-21

## Context

Magpie keeps no comments in its code. The decisions below used to be comments next to the code they explain. Each one records something the code cannot say by itself: why it was done this way, a rule from an outside system, or an invariant that must hold. Each entry names the file and the symbol it applies to, and links to where the comment last appeared, at commit `7ec16b3`.

When the code changes, update or remove the entry here in the same commit.

## Decisions

### `packages/engine/src/config.ts`

#### 0001.1 `BANDS`

Jev probability bands, applied when membership is read, not when scored.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L9)

#### 0001.2 `Paths.birdclawHome`

Birdclaw's database and cache. Kept at Birdclaw's own default so an existing install carries over.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L170)

#### 0001.3 `mainCheckout`

The main checkout when `dir` is a linked git worktree, else `dir` itself. A linked worktree's `.git` is a file pointing at `<main>/.git/worktrees/<name>`, whose `commondir` leads back to `<main>/.git`. A submodule's `.git` file has no `commondir` and a bare repository's common dir is not named `.git`, so both stay where they are.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L174-L180)

#### 0001.7 `XTool`

A command-line tool: `pinned` is the entry file of the repo's own pinned package, run with this process's node; otherwise `path` is an executable.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L281-L284)

#### 0001.8 `xTools`

The bird and Birdclaw commands. Each defaults to the pinned engine dependency; MAGPIE_BIRD_BIN and MAGPIE_BIRDCLAW_BIN replace them with another executable, such as a test stub.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L296-L300)

### `packages/engine/src/config.ts`, added later

#### 0001.9 `category-focus.json`

The category focus setting is a file in the config dir, next to `x-connection.json`, written atomically. It holds `{ mode: "all" | "focus", focus: string }`.

It is a file, not a store row, because setup can run before any sync has created the store, and store access refuses with `no_store` until then.

Reading it: the file wins. With no file the focus reads as not chosen, and setup asks. Checking whether categories exist would misread a new install whose first discovery ran before the choice.

#### 0001.10 `Paths.claudeCli`

The Claude CLI is spawned by this absolute path, so nothing has to put it on PATH. It is the first that exists of ~/.local/bin/claude (the native installer), ~/.claude/local/claude (the older local install), /opt/homebrew/bin/claude and /usr/local/bin/claude (Homebrew, and npm with a system Node). The services run with a fixed PATH and no shell profile, so they look in a fixed list instead of PATH; a CLI installed elsewhere, such as npm under nvm, needs MAGPIE_CLAUDE_BIN, which names another executable.
