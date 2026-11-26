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
  node query.mjs topic <name> [--limit N] [--since YYYY-MM-DD] [--sort newest]
                 [--full] [--json] [--include-hidden]
  node query.mjs resources <name> [--limit N] [--since YYYY-MM-DD] [--json]
                 [--include-hidden]
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

#### 0012.11 `sharedText`

Keyword search matches more than a post's own text: the post it quotes, and the title and description of each page it links to. A post that says only "this is great" above a link is found by what the link is about. This is the content Jev judges for topics and Find topic, so the two kinds of search can reach the same posts.

The rules are copied from `postContent` and `quotedText` in `packages/engine/src/jev/questions.ts`, because this file imports only node built-ins (0018.3): resolved links only, the same quoted-text keys, and a title that only repeats the host is left out. Change both together.

The extra text comes from the store, so a search with no store matches post text and author alone. It changes which posts match and how often a term is counted. The score formula is unchanged.

#### 0012.12 `readCategories, topicResources`

The membership and resource rows are read in a fixed order. Posts that tie on band, strength and date then keep one order between calls, so reading a topic page by page with `offset` neither repeats nor skips a post.

#### 0012.13 `topicPosts, topicResources`

`since` keeps only posts written from a date, and `sort: 'newest'` orders each band latest first. Both are off unless asked for, so the default order is unchanged. Each resource carries `last_shared`, the date of the latest post in the category that links to it. `--since` was read only by keyword search before and is now read by `topic` and `resources` too. 0018.10 says why age is shown and not ranked on.

### `packages/skill/test/query.test.mjs`

#### 0012.9 `test: a store written by a newer schema version is refused`

Which posts were removed cannot be read from it, so keyword search has no flag that skips the store.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/skill/test/query.test.mjs#L283)

#### 0012.10 `install.sh backup location (install test)`

A backup left inside the skills directory would be loaded as a second skill.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/skill/test/query.test.mjs#L429)
