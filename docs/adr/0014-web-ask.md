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

Ask is an action on the search field (the Ask button or ⌘↵), not a mode: plain Enter never starts one, since each ask costs money.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/page-header.tsx#L4)

#### 0014.4 `SearchField`

Plain Enter re-runs an open ask only once its question has been edited; in search, results are already live. Enter on the question that is already asked does nothing, whether it is still running or done, since each ask costs money. ⌘↵ and Try again still re-run it on purpose.

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
