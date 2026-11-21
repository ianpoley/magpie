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

#### 0001.4 `LEGACY_NAMES`

The names Magpie had while it was called x-corpus, still found on installs from then.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L209)

#### 0001.5 `setting`

The setting MAGPIE_<name>, or X_CORPUS_<name> from before the rename. Unit files installed then still pass the old name, and a run pointed at a scratch copy with the old name must never fall through to the live store.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L217-L221)

#### 0001.6 `usesLegacyNames`

Whether this machine still keeps its config and secrets under the old x-corpus names: no config dir override, no ~/.config/magpie, and a ~/.config/x-corpus. Old names are then used for every read and write, so renamed code and services installed before the rename share one install. `service:install` hands them over to the new names, all at once.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L226-L232)

#### 0001.7 `XTool`

A command-line tool: `pinned` is the entry file of the repo's own pinned package, run with this process's node; otherwise `path` is an executable.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L281-L284)

#### 0001.8 `xTools`

The bird and Birdclaw commands. Each defaults to the pinned engine dependency; MAGPIE_BIRD_BIN and MAGPIE_BIRDCLAW_BIN replace them with another executable, such as a test stub.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L296-L300)
