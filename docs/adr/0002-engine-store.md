# ADR 0002: The store: schema, membership views and edits

- Status: accepted
- Date: 2026-11-21

## Context

Magpie keeps no comments in its code. The decisions below used to be comments next to the code they explain. Each one records something the code cannot say by itself: why it was done this way, a rule from an outside system, or an invariant that must hold. Each entry names the file and the symbol it applies to, and links to where the comment last appeared, at commit `7ec16b3`.

When the code changes, update or remove the entry here in the same commit.

## Decisions

### `packages/engine/src/config.ts`

#### 0002.1 `INGEST.shrinkGuard`

A collection whose export shrank by more than this share clears no flags.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L137)

### `packages/engine/src/store/db.ts`

#### 0002.2 `openStore`

Opens the store at `path`.

Read-write (the default) creates the file and its directory when missing, switches it to WAL, and migrates it to the current schema.

Read-only never creates or changes the file. It fails when the file is missing or its schema is not the version this code knows.

Either mode fails when the store was written by newer code. The caller closes the returned handle.

A linked worktree borrows its main checkout's store. Read-write refuses to migrate that store: the installed services run the main checkout's code, and a store upgraded past it would stop them. `inheritedFrom` names that main checkout; it is worked out from the path by default.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/store/db.ts#L10-L26)

#### 0002.3 `transaction`

Runs `fn` in one write transaction: committed when it returns, rolled back when it throws. Called inside a transaction already open on `db`, it joins that transaction, so the outermost call decides the outcome.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/store/db.ts#L59-L63)

### `packages/engine/src/store/edits.ts`

#### 0002.4 `edits.ts (module)`

Every edit the user can make to categories, to a post's topics, and to which posts are in the corpus. Nothing else writes user state. Each function is one synchronous transaction, calls no model, and throws an EditError for input it cannot apply.

Editing a topic or an area locks it, and automatic restructuring leaves a locked one alone. A per-post fix does not lock its topic.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/store/edits.ts#L7-L15)

#### 0002.5 `mergeTopics`

Folds `fromId` into `intoId`. The merged-away topic's definition keeps being scored and its matches count for the survivor. Its per-post fixes move to the survivor; where both topics have a fix for the same post, the survivor's own stays. A pinned search cannot be the survivor: deleting it removes it outright, which would leave the merged topic pointing at nothing.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/store/edits.ts#L94-L100)

#### 0002.6 `deleteTopic`

Deletes a topic. Its posts fall back to their other topics or to Unfiled, and it is remembered so it is not proposed again. A pinned search is simply unpinned.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/store/edits.ts#L133-L137)

#### 0002.7 `deleteArea`

A topic that was split keeps the matches it had then, so undoing the split cannot bring it back here.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/store/edits.ts#L157)

#### 0002.8 `addPostTopic`

Puts a post in a topic whatever its score; the fix holds through every later re-tag.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/store/edits.ts#L201)

#### 0002.9 `removePostTopic`

Takes a post out of a topic whatever its score; the fix holds through every later re-tag.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/store/edits.ts#L207)

#### 0002.10 `removePost`

Takes a post out of the local corpus: no view, count, resource or search shows it, and a later sync does not bring it back. Its scores and fixes are kept for a restore. Nothing changes on X.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/store/edits.ts#L213-L217)

#### 0002.11 `pinQuery`

Keeps a free-text search as a topic. `scores` are the relevance scores the search just produced; posts that arrive later are scored against the query by the next tagging pass. The query is stored as the topic's name and as the definition posts are judged against.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/store/edits.ts#L235-L240)

#### 0002.12 `unpin`

Removes a pinned search and its scores. Nothing remembers it, so it can be pinned again.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/store/edits.ts#L280)

#### 0002.13 `listUndo`

Every change that undoing `changeId` would reverse, newest first, for the confirmation shown before the undo. It lists more than one when later automatic changes built on the same topics.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/store/edits.ts#L300-L304)

#### 0002.14 `undoChange`

Undoes an automatic change and the later ones that built on it. A topic it created goes out of use and is not proposed again; a topic it split comes back with its posts, locked.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/store/edits.ts#L309-L313)

### `packages/engine/src/store/membership.ts`

#### 0002.15 `MEMBERSHIP_VIEWS_V1`

```text
Which posts are in which topic, and which posts are Unfiled, hidden or
pending. Each is defined once, here, as a view in the store, so the sync
job, the web app and the skill read the same answer with plain SQL.

All five views cover visible posts only: bookmarked or liked, and not
removed by the user (see `visible_posts` below).

  scoring_topics   (topic_id, target_id)
    Every definition posts are scored against, with the active topic its
    matches count for: an active topic counts for itself, a merged-away
    topic for the active topic at the end of its merge chain.

  pairs_to_score   (post_id, topic_id)
    Post and definition pairs that need a score: none stored yet, or the
    stored one is older than a link of the post that resolved to a page with
    a title or description.

  topic_membership (post_id, topic_id, area_id, band, probability, strength,
                    hidden, pinned)
    One row per post and active topic the post is in.
      band         'confident' | 'unsure'
      probability  best score among the topic's definitions; NULL when only
                   a per-post decision places the post
      strength     order within a band, highest first
      hidden       1 when the topic or its area is hidden
      pinned       1 when the topic is a pinned search
    Per post and topic, first match wins:
      the user removed the post from the topic        -> not in it
      the user added the post to the topic            -> confident
      best score >= confident threshold               -> confident
      best score >= unsure threshold                  -> unsure
      a split carried the post onto the topic         -> unsure
      otherwise                                       -> not in it
    A decision recorded on a merged-away topic follows it: an add or a carry
    counts for the surviving topic, a remove discards that definition's
    score only.

  post_unfiled     (post_id)  No confident match in any topic.

  post_hidden      (post_id)  The best match is in a hidden topic or area and
    no visible topic matches confidently. Pinned searches are ignored.

  post_pending     (post_id)  A score is still needed, or a link has not
    been resolved yet and will be tried again.

The two thresholds are read from `meta` (`band_confident`, `band_unsure`),
so changing them re-bands every stored score without scoring anything again.

This text is a shipped migration. To change a view, add a new constant that
drops and recreates it and append that as a new migration.
```

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/store/membership.ts#L5-L56)

#### 0002.16 `MEMBERSHIP_VIEWS_V2`

```text
  visible_posts    (id)  Posts that are bookmarked or liked and not removed.
    The one definition of a visible post. Every reader of posts goes through
    it, and so do the views above, which this recreates on top of it.
    `post_hidden` and `scoring_topics` are unchanged: the first reads only
    `topic_membership`, the second reads no posts.
```

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/store/membership.ts#L168-L174)

#### 0002.17 `syncBands`

Stores the two band thresholds where the membership view reads them. The sync job calls this at the start of a run so the store follows the config.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/store/membership.ts#L263-L266)

### `packages/engine/src/store/schema.ts`

#### 0002.18 `MIGRATIONS`

The store schema is a contract shared by the sync job, the web app and the skill. Change it only by appending a migration; never edit one that shipped.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/store/schema.ts#L5-L8)

#### 0002.19 `migrate`

Read again under the write lock: another process may have migrated first.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/store/schema.ts#L272)
