# ADR 0006: Headless Claude calls

- Status: accepted
- Date: 2026-11-21

## Context

Magpie keeps no comments in its code. The decisions below used to be comments next to the code they explain. Each one records something the code cannot say by itself: why it was done this way, a rule from an outside system, or an invariant that must hold. Each entry names the file and the symbol it applies to, and links to where the comment last appeared, at commit `7ec16b3`.

When the code changes, update or remove the entry here in the same commit.

## Decisions

### `packages/engine/src/claude/cli.ts`

#### 0006.1 `askJson`

Sends `request` and returns the answer only when it matches `request.schema`. `T` must be the type that schema describes.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/claude/cli.ts#L40-L43)

#### 0006.2 `cliArgs`

The prompt carries untrusted post text, so the session must be unable to act: no built-in tools, no MCP servers, no skills, no slash commands, and no CLAUDE.md. Installed plugins are still listed as loaded under --safe-mode, but with those surfaces off they contribute nothing callable; the only tool present is the StructuredOutput helper that --json-schema adds. The prompt goes on stdin so nothing in it can be read as an argument.

The model and effort are pinned in `CLAUDE` (`claude-opus-5-5`, `medium`) instead of following the user's CLI default, so the category tree is built the same way on every machine and does not drift when an alias moves to a newer model. The calls are few per sync and shape every topic, which is why it is Opus; naming and grouping short posts needs no deep reasoning, which is why it is `medium`.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/claude/cli.ts#L54-L59)

#### 0006.3 `createClaudeCli`

The adapter that runs the Claude Code CLI under the user's existing login. It never throws: every way the call can go wrong is a `ClaudeFailure`.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/claude/cli.ts#L114-L117)

#### 0006.4 `createClaudeCli close handler`

A failure inside the run, such as a missing login, is explained on stdout.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/claude/cli.ts#L151)

#### 0006.5 `createClaudeCli stdin error`

A child that dies before reading its input breaks the pipe; the close handler reports that exit, so the stream error is dropped here.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/claude/cli.ts#L162-L163)

### `packages/engine/src/claude/discovery.ts`

#### 0006.6 `runDiscovery`

Builds the first category list for a store that has none.

Claude reads the visible posts in batches and proposes candidate topics, then one more call merges the candidates into areas containing topics. The list is written in one transaction together with the "Initial categories" change-log entry, which cannot be undone. In show-everything mode nothing is hidden automatically. In focus mode Claude judges each new area against the owner's focus text and the areas the owner showed or hid by hand, and areas outside the focus start hidden. Discovery waits until setup records a choice. The `is_dev` column is no longer written; only the migration backfill reads it.

Does nothing when an automatic topic already exists in any state, or when there are no visible posts. Any failed call leaves the store untouched.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/claude/discovery.ts#L129-L140)

### `packages/engine/src/claude/sanitize.ts`

#### 0006.7 `cleanLabel`

Makes model-written text safe to store and show as a plain label: no HTML tags, no Markdown syntax, no control or invisible formatting characters, single-spaced, and at most `maxChars` characters. May return ''.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/claude/sanitize.ts#L5-L9)

### `packages/engine/src/claude/schemas.ts`

#### 0006.8 `JsonSchema / schemaErrors`

The subset of JSON Schema the Claude calls use. The same object is handed to the CLI and checked again here, so an answer is never trusted on the CLI's word alone.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/claude/schemas.ts#L1-L5)
