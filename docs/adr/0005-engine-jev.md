# ADR 0005: Scoring posts with Jev

- Status: accepted
- Date: 2026-11-21

## Context

Magpie keeps no comments in its code. The decisions below used to be comments next to the code they explain. Each one records something the code cannot say by itself: why it was done this way, a rule from an outside system, or an invariant that must hold. Each entry names the file and the symbol it applies to, and links to where the comment last appeared, at commit `7ec16b3`.

When the code changes, update or remove the entry here in the same commit.

## Decisions

### `packages/engine/src/config.ts`

#### 0005.1 `TAGGING.maxConsecutiveFailures`

Posts failing in a row, at any point in a pass, before it tries one post from the far end of the queue: if that one is scored the pass goes on, and if it fails too the pass stops.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L74)

### `packages/engine/src/jev/client.ts`

#### 0005.2 `JevClient.ask`

Resolves to one probability (0 to 1) per question id. Rejects when the request fails or any answer is missing, so a failure is never read as "no".

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/jev/client.ts#L19-L22)

#### 0005.3 `checkJevKey`

Asks TypeSafe whether it accepts `apiKey`, by listing the account's models, which costs nothing. One try with a short timeout, so a form waiting on it never hangs on retries.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/jev/client.ts#L28-L32)

### `packages/engine/src/jev/questions.ts`

#### 0005.4 `questions.ts (module)`

Every word sent to Jev is written here: what a post looks like as state, and how a topic is asked about.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/jev/questions.ts#L5-L8)

#### 0005.5 `PostContent`

What Jev reads for one post. A part the post lacks is left out, not sent empty.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/jev/questions.ts#L12)

#### 0005.6 `postContent`

A page that gave no title is stored under its host name, which says nothing about a topic.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/jev/questions.ts#L43)

#### 0005.7 `hasSomethingToJudge`

False when a post has nothing a person could judge a topic from: no words besides links, no quoted post and no linked page. Asked anyway, Jev answers every topic near the unsure threshold.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/jev/questions.ts#L58-L62)

#### 0005.8 `quotedText`

A quoted post that cannot be read is treated as absent.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/jev/questions.ts#L79)

#### 0005.9 `topicQuestion`

One yes/no question: is the post about this topic? The name and definition travel inside the question because question ids are not shown to the model.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/jev/questions.ts#L118-L121)

#### 0005.10 `askRequest`

One request for one typed search: the user's words are the state, and each post is one question carrying its own content. Yes and no mean what they mean for a topic, so a search kept as a topic judges later posts the same way.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/jev/questions.ts#L141-L145)

### `packages/engine/src/jev/tagger.ts`

#### 0005.11 `TagResult.withoutContent`

Posts with nothing to judge, stored as matching no topic without a request.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/jev/tagger.ts#L24)

#### 0005.12 `TagResult.failed`

Posts whose request failed, and posts left untried after too many failed in a row; they keep whatever scores they had and are tried again next run.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/jev/tagger.ts#L26-L29)

#### 0005.13 `tagPosts`

Scores every visible post against every topic definition it has no current score for, one request per post, storing each post's scores as its request returns. Safe to run again after an interruption: only what is still missing is asked.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/jev/tagger.ts#L39-L44)

#### 0005.14 `scorePairs`

Scores the given post and topic pairs, whatever state the topics are in, replacing any score a pair already has.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/jev/tagger.ts#L54-L57)

#### 0005.15 `scorePairs readTopic`

A pinned search is always judged under the words the user searched for, so renaming it changes its label on screen and nothing about which posts match.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/jev/tagger.ts#L70-L71)

#### 0005.16 `scorePairs queue/tryFarEnd`

During an outage every request runs to its timeout, so a long queue is given up on rather than drained one timeout at a time. Posts that failed last run are first in the queue again, and a run of them looks the same, so after each run of failures one post from the far end tells the two apart: scored, the failures belong to the posts and the pass goes on.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/jev/tagger.ts#L138-L142)
