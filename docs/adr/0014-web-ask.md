# ADR 0014: Web app: Ask

- Status: accepted
- Date: 2026-11-21

## Context

Magpie keeps no comments in its code. The decisions below used to be comments next to the code they explain. Each one records something the code cannot say by itself: why it was done this way, a rule from an outside system, or an invariant that must hold. Each entry names the file and the symbol it applies to, and links to where the comment last appeared, at commit `7ec16b3`.

When the code changes, update or remove the entry here in the same commit.

## Decisions

### `apps/web/src/app/api/ask/route.ts`

#### 0014.1 `POST /api/ask`

Judges every saved post against one typed search and streams the answers, one JSON record per line, as each Jev request returns. The API key stays in this process: nothing from a Jev failure is sent on or logged in full.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/api/ask/route.ts#L9-L13)

#### 0014.2 `POST /api/ask`

Read everything first, so no store handle is held while the answers stream.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/api/ask/route.ts#L38)

### `apps/web/src/components/page-header.tsx`

#### 0014.3 `PageHeader / SearchField`

Find topic is an action on the search field (the Find topic button or ⌘↵), not a mode: plain Enter never starts one, since each run costs money. The search field never starts an Ask: an Ask starts only from the answer card, so a topic search can be pinned without starting a conversation. Decided in `/proto/search-intents`; see `apps/web/DESIGN.md`.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/page-header.tsx#L4)

#### 0014.4 `SearchField`

Plain Enter re-runs an open Find topic or Ask only once its words have been edited, and keeps its kind: an edited Ask runs as an Ask. In search, results are already live. Enter on the words that already ran does nothing, whether the run is still going or done, since each run costs money. ⌘↵ and Try again still re-run it on purpose.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/page-header.tsx#L105)

### `apps/web/src/lib/ask.ts`

#### 0014.5 `isLoopbackHost`

True when a `Host` header names this machine, on any port. A page elsewhere that points its own name at this machine still sends its own name here.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/ask.ts#L30-L33)

#### 0014.6 `isSameOriginJson`

True when a request can only have come from the app's own page or from a local script. A page on another site can post without asking only if the body is not declared as JSON, and a browser names where a request began. A page that points its own name at this machine passes both, so the app must also have been addressed as this machine.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/ask.ts#L38-L44)

#### 0014.7 `askPosts`

Judges every post against one search and yields the answers as each request returns. A failed request becomes an error record and the rest carry on. An abort cancels the requests in flight and ends the stream with no more records.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/ask.ts#L86-L90)

#### 0014.8 `askPosts`

Asked anyway, Jev answers near the unsure line for a post that says nothing.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/ask.ts#L99)

#### 0014.9 `rankAsk`

The posts a search matched, under the filters that still apply while asking: collection, author, time range, media, and hidden posts. Confident matches come first, then unsure ones, each strongest first. The category selection and the keyword belong to browsing and are set aside.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/ask.ts#L148-L153)

#### 0014.10 `createAskRunner`

Runs one search at a time against `send` and holds what the screen shows. Only the latest search may change the state, so a late answer to an earlier one is never shown. Asking the same search again keeps its earlier answers on screen while fresh ones replace them.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/ask.ts#L205-L210)

### `apps/web/src/lib/answer.ts`

#### 0014.11 `createChatRunner`

An Ask ends in a written answer, and the answer is a conversation. A Find topic runs the same Jev pass and stops there: the conversation starts only when the run was an Ask (`chatWanted` in `CorpusScreen`). Jev runs first and Claude second: Claude cannot read the whole corpus on every question, so Jev's ranking picks the posts it reads. Those are the strongest confident matches, at most `READ_LIMIT`, under the filters that are on when judging finishes. That way every source is a card in the list beside the answer.

The posts are fixed when the first answer is asked for. The one exception is a conversation that ended as too few posts: it starts again when the confident posts change, so widening a filter can still produce an answer. A follow-up sends the same posts and the conversation so far, and runs no new search: a second Jev run per turn would cost more and reshuffle the list under the reader. The cost is that a follow-up on another subject can come back thin, and the card's hint says so.

Only the latest call may change the state, and clearing aborts the call in flight, so a conversation the owner has left stops using their Claude plan.

#### 0014.12 `createChatRunner statuses`

Fewer than `MIN_CONFIDENT` confident posts is `few`: no call is made, since an answer from one or two posts would read as more than it is. A CLI that is not installed is `unavailable`, a quiet state with no Try again, because the CLI is optional. Every other failure is `failed` and can be tried again.

#### 0014.13 `partialAnswer`

Reads the answer's JSON while it is still being written, so the lead and each point show as they arrive. It relies on the order the schema gives: lead, then points, each as title, body, refs. If the model wrote them in another order the partial view would show less, and the finished answer would still replace it. A ref that was not sent is dropped.

#### 0014.14 `answerPrompt`

Post text is other people's writing, so the prompt says to treat it as quoted material and never to follow an instruction inside it. The posts are sent under short refs (`p1`, `p2`) instead of their ids, and the route maps refs back, so a made-up source cannot name a post that was not read.

### `apps/web/src/app/api/answer/route.ts`

#### 0014.15 `POST /api/answer`

Writes one answer and streams it, one JSON record per line: the refs, each piece of text, then the finished answer or a failure. It is guarded like `/api/ask`. It reads only posts that are still in the corpus, so a removed post is never sent to Claude even when its id is asked for. A post in a hidden category is sent only when the list shows it, because the ids come from the list. Closing the stream cancels the Claude call.
