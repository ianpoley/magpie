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

An Ask ends in a written answer, and the answer is a conversation. A Find topic runs the same Jev pass and stops there: the conversation starts only when the run was an Ask (`chatWanted` in `CorpusScreen`). Jev runs first and Claude second, so every source is a card in the list beside the answer. The client sends every match under the filters that are on when judging finishes, confident first and then possible, each strongest first, and the route reads as many as fit (0014.17).

The posts are fixed when the first answer is asked for. The one exception is a conversation that ended as too few posts: it starts again when the confident count changes, so widening a filter can still produce an answer. A follow-up sends the same posts and the conversation so far, and runs no new search. A Jev pass costs about two seconds and $0.02, so cost no longer rules a new search out; what does is the list beside the card, which would reshuffle under the reader, the reason Threaded lost in `/proto/ask-brief`. A follow-up on another subject can come back thin, and the card's hint says so.

Only the latest call may change the state, and clearing aborts the call in flight, so a conversation the owner has left stops using their Claude plan.

#### 0014.12 `createChatRunner statuses`

Fewer than `MIN_CONFIDENT` confident posts is `few`: no call is made, since an answer from one or two posts would read as more than it is. A CLI that is not installed is `unavailable`, a quiet state with no Try again, because the CLI is optional. Every other failure is `failed` and can be tried again.

#### 0014.13 `parsePartialJson`

Reads the answer's JSON while it is still being written, so the lead and each section show as they arrive, for every shape. It closes what is open and parses; if that fails it cuts back to the last comma or bracket outside a string and tries again. A half-written escape is dropped rather than blanking the text before it. The finished answer always replaces the partial one, and a ref that was not sent is dropped.

#### 0014.14 `answerPrompt`

Post text is other people's writing, so the prompt says to treat it as quoted material and never to follow an instruction inside it. The posts are sent under short refs (`p1`, `p2`) instead of their ids, and the route maps refs back, so a made-up source cannot name a post that was not read. The prompt carries the plain-style rules (`PLAIN_STYLE`) and exempts `quote` from them by name, so a copied prompt keeps its own wording. Rules in the prompt were chosen over a second rewrite pass, which would double the wait, break streaming and touch quotes. Today's date is in the prompt so "latest" and "recently" mean something.

#### 0014.15 `POST /api/answer`

Writes one answer and streams it, one JSON record per line: the refs, each piece of text, then the finished answer or a failure. It is guarded like `/api/ask`. It reads only posts that are still in the corpus, so a removed post is never sent to Claude even when its id is asked for. A post in a hidden category is sent only when the list shows it, because the ids come from the list. Closing the stream cancels the Claude call.

#### 0014.16 `intentFrom` and `ANSWER_SCHEMAS`

Jev picks the answer's shape from the question with one Choice request: find, explain, compare, how-to, or recent. Recent has no shape of its own, and it, a guess under 0.5 and a failed Jev call all fall back to Explain, so the answer never fails on the guess. A follow-up is classified on its own words, not the first question's. Each shape has its own schema, and the schema's property order (lead first) is what lets the lead stream first.

#### 0014.17 `READ_CHAR_BUDGET`

The route reads posts in the order the client sent them until 400,000 characters, with up to `ASK.answerCharLimit` (8,000) characters of each post. Jev still judges posts at 1,500. Measured on 2026-11-22: a 40-post cap dropped most confident matches (139 of them for one question), and Claude read 505 posts in under 20 seconds and cited posts past rank 40. The budget is in characters, not posts, so a corpus of long posts and one of short posts cost about the same. Every selectable model has a 1M-token context, so 400,000 characters fits each.

#### 0014.18 `checkQuotes`

A Find quote is shown only when one of its cited posts contains it, after straight quotes, spacing and case are evened out and an ellipsis splits it into pieces. Anything else is blanked, so a quote is never invented. A quote whose end matches the end of a post that was trimmed for Claude is marked cut, and the card says the rest is in the post, because a cut-off prompt still matches the start of its post.

#### 0014.19 `readAnswerModel` and `answerTimeoutMs`

Settings › Answers picks the model and effort that write Ask answers, kept in `answer-model.json` beside the other per-user settings. Only Ask answers use it; topic discovery and the focus re-sort keep `CLAUDE`. The route reads the setting and checks it against `ANSWER_MODELS` and `ANSWER_EFFORTS` before it reaches the CLI, and never takes a model from the request. The time limit grows with effort, because Opus 5.5 at max effort did not finish a 400,000-character answer in four minutes.

### `apps/web/src/lib/ask.ts`

#### 0014.20 `packByTokens`

Jev requests are packed by estimated tokens, up to `ASK.requestTokenBudget` (40,000, under Jev's 64,000 per request), not by a post count. TypeSafe sets no limit on questions per request, only on context, and price is per token, so packing changes the number of requests, not the cost. Measured on 2026-11-22: 54 requests became 12, with scores no further apart than two identical runs.

