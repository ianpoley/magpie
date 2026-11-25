# ADR 0012: The Claude Code skill

- Status: accepted
- Date: 2026-11-21

## Context

Magpie keeps no comments in its code. The decisions below used to be comments next to the code they explain. Each one records something the code cannot say by itself: why it was done this way, a rule from an outside system, or an invariant that must hold. Each entry names the file and the symbol it applies to, and links to where the comment last appeared, at commit `7ec16b3`.

When the code changes, update or remove the entry here in the same commit.

## Decisions

### `packages/skill/install.sh`

#### 0012.2 `skill backup location`

Outside the skills directory: a backup left there would load as a second skill.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/skill/install.sh#L29)

### `packages/skill/query.mjs`

#### 0012.3 `query.mjs file header (NOTE: the 'birdclaw nightly/3-hourly job' phrase is stale: the in-app sync worker now writes the JSONL; the Usage block duplicates usage())`

```text
magpie query — search the user's saved X (Twitter) bookmarks & likes.

Reads the normalized JSONL the sync job exports:
  $MAGPIE_DIR/bookmarks.normalized.jsonl
  $MAGPIE_DIR/likes.normalized.jsonl
MAGPIE_DIR defaults to <clone>/data, where <clone> is found from the real
path of this file (the ~/.claude/skills symlink points back into the clone).

Each record: {type,id,handle,name,created,url,text}
Ranks by how many DISTINCT query terms a post hits, then total frequency,
then recency — and prints the top matches with URL + text so the calling
agent can weave them into the current task.

Category commands read the store the sync job keeps, read-only:
  $MAGPIE_STORE, else $MAGPIE_DIR/../state/corpus.sqlite,
  else <clone>/state/corpus.sqlite.
Posts in areas or topics the user hides by default are left out of every
command unless --include-hidden is given. Posts the user removed from the
corpus are left out of every command, and no flag brings them back.

This file is run from ~/.claude/skills/magpie under whatever node the
calling session has, so it imports nothing outside node itself.

Usage:
  node query.mjs <terms...> [--source bookmarks|likes|all] [--limit N]
                 [--author handle] [--since YYYY-MM-DD] [--full] [--json]
                 [--include-hidden]
  node query.mjs categories [--include-hidden] [--json]
  node query.mjs topic <name> [--limit N] [--full] [--json] [--include-hidden]
  node query.mjs resources <name> [--limit N] [--json] [--include-hidden]
```

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/skill/query.mjs#L2-L33)

### `packages/skill/corpus.mjs`

#### 0012.5 `loadSqlite`

node:sqlite announces itself as experimental on older node versions; that line would land in the output the calling agent reads.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/skill/query.mjs#L98-L99)

#### 0012.6 `removedPostIds`

Posts the user removed from the corpus. The category views already leave them out; keyword search reads the export files, which still carry them.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/skill/query.mjs#L140-L141)

#### 0012.7 `readCategories`

The active areas and topics, and which posts are in which topic. Posts the user hides by default are dropped here unless they were asked for, so every command counts and lists the same set.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/skill/query.mjs#L164-L166)

### `packages/skill/test/query.test.mjs`

#### 0012.9 `test: a store written by a newer schema version is refused`

Which posts were removed cannot be read from it, so keyword search has no flag that skips the store.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/skill/test/query.test.mjs#L283)

#### 0012.10 `install.sh backup location (install test)`

A backup left inside the skills directory would be loaded as a second skill.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/skill/test/query.test.mjs#L429)
