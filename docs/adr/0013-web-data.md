# ADR 0013: Web app: reading and changing data

- Status: accepted
- Date: 2026-11-21

## Context

Magpie keeps no comments in its code. The decisions below used to be comments next to the code they explain. Each one records something the code cannot say by itself: why it was done this way, a rule from an outside system, or an invariant that must hold. Each entry names the file and the symbol it applies to, and links to where the comment last appeared, at commit `7ec16b3`.

When the code changes, update or remove the entry here in the same commit.

## Decisions

### `apps/web/src/app/actions.ts`

#### 0013.1 `withStore`

Runs one edit against the store. `prepare` checks the arguments before the store is opened; a server action is an endpoint anyone on this machine can post to, so nothing it receives is trusted to have the declared type.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/actions.ts#L54-L58)

#### 0013.2 `withStore`

Opening for writing would create the store; only the sync job does that.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/actions.ts#L73)

#### 0013.3 `removePost`

Takes a post out of the local corpus. Nothing changes on X.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/actions.ts#L158)

#### 0013.4 `connectX/saveJevKey/disconnectX/requestSync`

None of the X connection and Sync now actions needs the store. Cookie values are never logged or sent back: errors are logged by name only.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/actions.ts#L188-L189)

#### 0013.5 `COOKIE`

What X sets as cookie values, and all the secret store accepts.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/actions.ts#L191)

#### 0013.6 `connectX`

Checks the pasted cookies with X and stores them only if X accepts them. A stored pair starts a new connection, which also clears a pause after X refused the old one, and asks for a sync.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/actions.ts#L219-L223)

#### 0013.7 `connectX`

The first sync waits for the Jev key too: setup asks for it next.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/actions.ts#L244)

#### 0013.8 `API_KEY`

What the secret store accepts as an API key.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/actions.ts#L251)

#### 0013.9 `saveJevKey`

Checks the pasted Jev key with TypeSafe and stores it only if TypeSafe accepts it. With X already connected, that completes setup, so it asks for a sync. The key is never logged or sent back.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/actions.ts#L254-L258)

### `apps/web/next.config.ts`

#### 0013.54 `experimental.serverActions.bodySizeLimit`

Pinning an ask sends every score it judged to `pinQuery`, up to `MAX_PIN_SCORES` (50,000). Each is about 65 bytes with an X post id and about 110 at `MAX_POST_ID_CHARS`, so a full pin is 3 to 6 MB, over the 1 MB server actions accept by default. The limit is 8 MB; the proxy buffers request bodies up to 10 MB by default, which is above it.

### `apps/web/src/app/api/sync-status/route.ts`

#### 0013.10 `GET`

The sync panel polls this while a run is in progress or requested. It answers only the app's own page, and never holds a cookie value.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/api/sync-status/route.ts#L4-L7)

### `apps/web/src/components/sync-status.tsx`

#### 0013.11 `AFTER_NEXT_RUN_MS`

The worker starts a due run at its next tick, up to half a minute later.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/sync-status.tsx#L19)

#### 0013.12 `useSyncStatus`

The sync state the panel shows: what the page was rendered with, or a newer read. It polls only while a run is in progress or requested, and reads once more on window focus and when the next scheduled run is due. When a run finishes it refreshes the page, so the new posts show.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/sync-status.tsx#L37-L42)

### `apps/web/src/lib/engine.ts`

#### 0013.13 `engine* dynamic imports`

The engine is loaded by node when the server runs, not bundled: its modules are TypeScript that node runs directly, and they find the repo root from their own location on disk, which a bundled copy would lose.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/engine.ts#L1-L5)

### `apps/web/src/lib/error-name.ts`

#### 0013.14 `errorName`

What to log about an error: its name only, since a message can hold a secret.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/error-name.ts#L1)

### `apps/web/src/lib/filter-url.ts`

#### 0013.15 `selectionQuery`

The selection as a query string without the leading "?", empty when nothing is selected. The same selection always gives the same string.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/filter-url.ts#L15-L18)

#### 0013.16 `parseSelection`

The selection a URL names. Anything that is not a list of ids is ignored, never an error.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/filter-url.ts#L40)

#### 0013.55 `linkedKeyword`

The search words in a link are cut to 200 characters both when the address is written and when it is read, so a link opens to the same search it was made from. The cut counts whole characters, so an emoji at the limit is kept or dropped whole.

#### 0013.57 `parseLinked`

Time, sort and Media are kept in the address next to the selection, so a reload keeps them and Back undoes them. Only values other than the defaults are written, and a value the app doesn't offer reads as the default.

#### 0013.58 `withView`

The Resources view is kept in the address as `view=resources`, first, so a reload keeps it and Back returns to Posts. Posts is the default and is never written.

### `apps/web/src/lib/filter.ts`

#### 0013.17 `ORDER.added`

A sync sees many posts at once (the first one saw them all), so posts added together fall back to newest.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/filter.ts#L29)

#### 0013.18 `applyFilter`

The posts a filter shows, in display order.

Several topics narrow to posts in all of them; an area stands for any topic inside it, and an area selected with one of its own topics reduces to the topic. Unsure matches count, and rank after posts confident in every selected item whatever the sort. Unfiled replaces any topic or area selection. Hidden posts are left out unless everything is revealed or the selection itself names a hidden topic or area.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/filter.ts#L35-L44)

#### 0013.19 `categoryCounts`

How many posts each topic, each area, and Unfiled would list when it is the only thing selected, by the same rule as `applyFilter`: unsure matches count, and a hidden post counts only when everything is revealed or the topic or area is itself hidden. Counts are taken within the rest of the view: the collection, author, time range, Media and search words, so a row's number is what pressing it would list. An Ask's question is not counted, since its matches only exist once the model has judged them. The sidebar still orders rows by their Everything counts, so switching collection changes the numbers without reshuffling the tree.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/filter.ts#L115-L120)

### `apps/web/src/lib/media.ts`

#### 0013.20 `mediaKind`

X saves a video or GIF as its poster frame; the address says which.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/media.ts#L3)

### `apps/web/src/lib/post-links.ts`

#### 0013.21 `expandLinks`

Post text with each shortened address replaced by where it leads, read from the store's resolved links. As on X, addresses that only point at the post's own picture or video, or at the post it quotes, are dropped, since those are shown with the post.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/post-links.ts#L18-L23)

#### 0013.22 `usableTarget`

The address a resolved link should open: only http(s), and nothing that would split it in the text.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/post-links.ts#L42)

#### 0013.56 `postAddress`

Where Open on X and Copy link go. The store's address is used only when it is http(s); anything else falls back to the post's address on X, built from its author and id.

### `apps/web/src/lib/read-snapshot.ts`

#### 0013.23 `readSnapshot`

Everything the screen shows, read in one transaction so a sync writing at the same moment cannot give memberships for topics that were not loaded. Which posts are in which topic, and which are Unfiled or hidden, comes from the store's `membership_standing` view, the one place that is defined.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/read-snapshot.ts#L333-L338)

#### 0013.53 `read (quoted text)`

A quote of a post that is also saved reads as that saved post's text, which already has its links expanded and its media link dropped. Any other quote expands links that the store followed for any post. A quote's trailing t.co is not dropped on the guess that it is its picture: of 28 such links the store had followed, 6 led to real pages.

### `apps/web/src/lib/resources.ts`

#### 0013.24 `videoStill`

A still from a YouTube video, from the address the engine files it under; null for anything else.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/resources.ts#L23)

### `apps/web/src/lib/search.ts`

#### 0013.25 `matchesKeyword`

Whether every word of the query, and every phrase in quotes, occurs somewhere in the post: its text, its quoted post's text, the author's name or handle, or the title of a page it links to. Separate words need not be next to each other or in the same place. Addresses on X itself are left out, so words like "status" match what a post says, not its links to other posts. A blank query matches every post.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/search.ts#L36-L43)

### `apps/web/src/lib/similar.ts`

#### 0013.26 `MIN_SCORE`

One confident topic in common is too loose to call two posts alike.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/similar.ts#L6)

### `apps/web/src/lib/snapshot.ts`

#### 0013.27 `loadSnapshot`

The corpus as it is in the store right now. Render the caller inside a Suspense boundary: the store is read on every request, never at build time. A store that does not exist yet gives an empty snapshot and is not created, and so does one that exists but cannot be opened yet, as during the first sync.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/snapshot.ts#L11-L17)

#### 0013.28 `loadSnapshot (await connection())`

node:sqlite is synchronous, so without this the read would be prerendered.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/snapshot.ts#L19)

### `apps/web/src/lib/sync-state.ts`

#### 0013.29 `lastRunOf`

Mid-way through the first sync the store can exist before it can be read.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/sync-state.ts#L30)

#### 0013.30 `readSyncState`

Reads the sync state from the small files the worker and the CLI share, plus the store's last run, unless the caller passes the `runs` it already read. Nothing here reads a secret: the backend name comes from its record file.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/sync-state.ts#L66-L71)

#### 0013.31 `readJevKeyStored`

Whether a Jev key is stored, for the page's setup check only: unlike everything above, this reads a secret, so it stays out of the polled sync status. When the store can't be read, it says yes, so a locked keychain shows the app and its warning instead of the setup screen.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/sync-state.ts#L90-L95)

### `apps/web/src/lib/types.ts`

#### 0013.32 `Post.addedAtMs`

When a sync first saw the post, as epoch milliseconds: the closest the store has to when it was saved.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/types.ts#L27)

#### 0013.33 `Post.hidden`

Best match is in a hidden area or topic and no visible topic matches confidently.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/types.ts#L41)

#### 0013.34 `Post.unfiled`

No confident match in any topic.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/types.ts#L43)

#### 0013.35 `Post.pending`

Still waiting on a score or a link, so its topics may change.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/types.ts#L45)

#### 0013.36 `Post.memberships`

Topics the post is in, confident first, strongest first within a band.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/types.ts#L47)

#### 0013.37 `Area.postCount`

Distinct posts in any topic of the area, confident or unsure.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/types.ts#L72)

#### 0013.38 `Topic.hidden`

Hidden itself or through its area.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/types.ts#L83)

#### 0013.39 `Topic.postCount`

Posts in the topic, confident or unsure.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/types.ts#L88)

#### 0013.40 `Resource.description`

What it says about itself; for a video, its channel.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/types.ts#L100)

#### 0013.41 `Resource.postIds`

Visible posts that link to it.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/types.ts#L102)

#### 0013.42 `Snapshot.removed`

Posts still bookmarked or liked that the user removed, most recently removed first. Nothing else counts them.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/types.ts#L145)

#### 0013.44 `SyncState`

The background sync as the web app can see it: the X connection, the worker's heartbeat and schedule, the run lock and the last run. Never holds a cookie value.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/types.ts#L157-L161)

#### 0013.45 `SyncState.connection`

"needs_reconnect" when X refused the stored session and scheduled syncs are paused.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/types.ts#L164)

#### 0013.46 `SyncState.nextRunAt`

The next scheduled run, from a live worker; null while paused, running or not connected.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/types.ts#L173)

#### 0013.47 `FilterState.author`

An author handle, without the @.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/types.ts#L189)

#### 0013.48 `FilterResult.unsureStart`

Under a topic or area selection, the index of the first post that is only an unsure match; `posts.length` when every match is confident. Null when no topic or area is selected.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/types.ts#L205-L209)

#### 0013.49 `Range`

A half-open range of string indexes: [start, end).

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/types.ts#L223)

#### 0013.51 `proxy`

Answers only when addressed as this machine. A site that points its own name at 127.0.0.1 would otherwise share this app's origin, read the corpus and call its edits. There is no matcher on purpose: this covers every page, asset, route and server action.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/proxy.ts#L5-L10)

### `apps/web/test/filter.test.ts`

#### 0013.52 `categoryCounts (hidden topic/area)`

A hidden topic and its hidden area keep their own posts: selecting either shows them.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/test/filter.test.ts#L242)
