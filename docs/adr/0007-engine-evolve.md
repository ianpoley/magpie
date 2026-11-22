# ADR 0007: Growing the category list

- Status: accepted
- Date: 2026-11-21

## Context

Magpie keeps no comments in its code. The decisions below used to be comments next to the code they explain. Each one records something the code cannot say by itself: why it was done this way, a rule from an outside system, or an invariant that must hold. Each entry names the file and the symbol it applies to, and links to where the comment last appeared, at commit `7ec16b3`.

When the code changes, update or remove the entry here in the same commit.

## Decisions

### `packages/engine/src/config.ts`

#### 0007.1 `EVOLUTION.newTopicTrigger`

Unfiled posts not seen by an earlier round before a new topic is proposed.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L16)

#### 0007.2 `EVOLUTION.regrowFactor`

After a round that created nothing, Unfiled must reach this multiple of its size at that round.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L20)

#### 0007.3 `EVOLUTION.tooBroadMinPosts`

A topic is too broad above max(tooBroadMinPosts, tooBroadCorpusFraction × visible posts).

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L22)

#### 0007.4 `EVOLUTION.splitMinCoverage`

Share of the parent's confident posts the subtopics must cover together.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L27)

#### 0007.5 `EVOLUTION.tombstoneOverlap`

A proposal overlapping a tombstone's or suppressed proposal's match set by more than this is rejected.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L29)

### `packages/engine/src/evolve/apply.ts`

#### 0007.6 `RoundOutcome`

```text
How one proposal ended:
  applied   the category list changed and the change is logged
  rejected  the proposal did not hold up; logged as an attempt only
  dropped   the user edited what it touches while it was being scored
  skipped   posts could not be scored, so nothing was decided or recorded
```

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/evolve/apply.ts#L15-L21)

#### 0007.7 `newTopicRound`

Validates one proposed topic against the eligible Unfiled posts and creates it when enough of them match.

The topic is scored while inactive. The swap is one transaction: it checks again that the user has not removed the name or the area meanwhile, activates the topic, and writes the log entry.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/evolve/apply.ts#L107-L114)

#### 0007.8 `splitRound`

Validates proposed subtopics against the parent's posts and, when at least two hold up and together cover enough of the parent, replaces the parent with them.

No post loses its place: a post no subtopic claims stays on the subtopic it scored highest on, as an unsure match. A post the user removed from the parent is removed from every subtopic, even when the removal came while the split was being scored, and one the user added is added to the subtopic it scored highest on.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/evolve/apply.ts#L198-L207)

### `packages/engine/src/evolve/evolve.ts`

#### 0007.9 `evolve`

Grows the category list where the corpus demands it. While enough Unfiled posts wait, Claude proposes a topic for them and it is created when Jev's scores support it; then each topic that has grown too broad is offered a split. Every change is logged and can be undone. Locked topics, pinned searches and anything the user removed are left alone.

New-topic rounds run first: a new topic makes the posts not yet scored against it pending, and pending posts are not evolution input.

The caller runs a tagging pass afterwards so every post is scored against what was created.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/evolve/evolve.ts#L25-L37)

#### 0007.10 `evolve`

Left by a run that stopped between scoring a proposal and applying it.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/evolve/evolve.ts#L54)

### `packages/engine/src/evolve/propose.ts`

#### 0007.11 `TopicProposal`

A proposal as it would be stored: every label cleaned and capped. Any label may be ''.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/evolve/propose.ts#L9)

### `packages/engine/src/evolve/tombstones.ts`

#### 0007.12 `tombstones module`

What must not come back: topics and areas the user deleted, and automatic changes the user undid. Each keeps the posts it last matched confidently, so a later proposal is recognised by its name or by the posts it would claim.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/evolve/tombstones.ts#L4-L8)

### `packages/engine/src/evolve/triggers.ts`

#### 0007.13 `NewTopicTrigger.eligible`

Unfiled posts that are fully scored and have no link still to resolve.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/evolve/triggers.ts#L8)

#### 0007.14 `NewTopicTrigger.shown`

The eligible posts to show Claude: ones no earlier round saw first.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/evolve/triggers.ts#L10)

#### 0007.15 `newTopicTrigger`

Whether a new topic should be proposed now.

It takes 25 eligible Unfiled posts. When the last round created a topic, or none has run, that is enough, so a backlog keeps draining. When the last round created nothing, 25 of them must also be posts no round has seen, and the pile must have grown by a quarter since that round.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/evolve/triggers.ts#L14-L21)

#### 0007.16 `tooBroadTopics`

Automatic, unlocked topics with more confident posts than the size limit. A topic whose last split attempt changed nothing is left out until it has grown by a quarter since then.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/evolve/triggers.ts#L53-L57)

### `packages/engine/src/evolve/undo.ts`

#### 0007.17 `LoggedChange.restores`

Names of topics the user merged into a topic this change created; undoing it brings them back.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/evolve/undo.ts#L16)

#### 0007.18 `mergedInto`

Topics merged into `topicId`, which stop counting for anything once it goes out of use: the user's `own`, and those `created` made. What was merged into one of the latter is found too, since that topic goes out of use as well.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/evolve/undo.ts#L40-L44)

#### 0007.19 `undoChain`

Every change that undoing `changeId` reverses, newest first: the change itself, then each later automatic change still in effect that touched a topic one of them touched. Empty when the change does not exist.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/evolve/undo.ts#L71-L75)

#### 0007.20 `removeCreatedTopics`

Takes topics an automatic change created out of use and keeps them from being proposed again. A topic the user merged into one of them is the user's own, so it comes back as it was rather than going out of use too, unless a change being undone (`created`) made that topic as well.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/evolve/undo.ts#L110-L115)

#### 0007.21 `removeCreatedTopics (ownMatches)`

The posts the proposal itself matched: what was merged in is not part of it.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/evolve/undo.ts#L127)

#### 0007.23 `removeCreatedTopics (copyFixes)`

A merge records on each per-post fix it moves the topic the fix first came from (`overrides.merged_from`). A later merge keeps the first value, so a fix still names its own topic after a chain of merges. A restored topic takes back the fixes that came from it or from a topic that is still merged into it. Other restored topics' fixes, and those of created topics going out of use, stay out. A fix with no recorded source goes to every restored topic, as before: it was made on the created topic itself, or merged before sources were recorded, and there is no telling whose it is. A fix kept in one place too many can be taken off; a lost one cannot be found again.

#### 0007.22 `reverseChanges`

Reverses `chain` in the order given and logs the undo. Posts return to where the membership view puts them once the topics change state; nothing is scored here. The caller runs this inside one transaction. Returns the id of the log entry for the undo.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/evolve/undo.ts#L193-L198)
