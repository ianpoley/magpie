# x-corpus web

The corpus screen: every post you bookmarked or liked on X, in one list you can filter by category, collection, author, keyword, time range, and media.

It reads the local store the sync worker writes (`state/corpus.sqlite`, or the file `X_CORPUS_STORE` points at). The server only listens on `127.0.0.1` and answers only loopback host names. Browsing sends nothing off this Mac; Ask is the exception: it sends post text to TypeSafe's Jev model to judge relevance.

## Run it

From the repo root:

```bash
bun install
bun run dev        # http://127.0.0.1:3000
```

`bun run dev -- -p 3001` picks another port. `bun run build` then `bun run start` serves the production build.

For day-to-day use, `bun run service:install` runs the production build as the `x-corpus-web` background service on http://127.0.0.1:3030 (`X_CORPUS_PORT` overrides), next to the `x-corpus-worker` that syncs. Setup, update and migration steps are in the repo `README.md`. The service has no sign-in and listens on loopback only, so it assumes a machine where only you have a login. Secrets and the X connection are per user while data is per clone: connecting X from a dev server in another clone replaces the cookies the service uses.

The page reads the store on every request and again whenever you return to the window, so a sync that finished in the background shows up without a reload. If the store does not exist yet, the screen says so and stays empty until the first sync.

## What is on the screen

- **Sidebar:** collections (Everything, Bookmarks, Likes), the category tree, the ten most-saved authors, sync status, and What changed.
  - Pressing an area or topic adds it to the filter; pressing it again removes it. Several topics narrow to posts in all of them. An area stands for any topic inside it.
  - Search categories narrows the tree to the areas and topics whose names match. It does not change the filter.
  - Each row has a menu button that is always visible. A topic has Rename, Merge, Hide, and Delete; an area has Rename, Hide, and Delete; a pinned search has Rename and Delete. Shift+F10 opens the focused row's menu.
  - Pinned searches and Unfiled sit above the areas. Hidden areas and topics are listed under a collapsed Hidden group, and Show hidden brings their posts back into every view.
  - Each count is the number of posts that row lists when it is the only one selected.
  - Removed lists the posts you took out of the corpus, each with Restore.
  - Drag the sidebar's right edge to resize it, or focus the edge and use the arrow keys. Double-click resets it. The width is remembered in the browser.
  - The sync panel shows whether X is connected, when the last full sync finished, and when the next one runs. **Connect X** takes the `auth_token` and `ct0` cookies (browser dev tools, Application, Cookies, x.com); **Sync now** asks the worker to run one. If a stage failed or the X export is stale, it names the problem. Birdclaw syncs with your X session cookies, which X's terms do not allow; treat the cookies like a password.
- **Main column:** the title with a count line (posts, and how many of them are bookmarked and liked) and the Posts / Resources toggle; under it a tool row with search, time range, sort, the media switch, and Surprise (a random post from the list). The tool row stays pinned to the top as you scroll, and changing a filter from it jumps back to the top of the results.
  - A murmuration of pixel magpies flies in each gutter beside the list, with one bird per post shown (up to 320). Filtering sends birds off and brings them back. While an ask is judging they wheel round the search field, then split back into the two gutters. With reduced motion on, the flock is drawn still.
  - Search matches post text, quoted text, author name and handle, and the titles of linked pages. Every word must appear somewhere in the post, in any order; put words in quotes to match them as a phrase. Addresses on X itself are not searched. Matches are highlighted.
  - Press `/` to jump to search.
  - Sort by Newest (when the post was written), Recently added (when a sync first found it), Oldest, or Most liked. X's export has no save time, so Recently added groups posts by sync.
  - Ask sends what you typed in the search field to the model as a question: press the Ask button on the field or ⌘↵ (Ctrl ↵). Plain Enter never starts an ask, because each one costs money. The model judges every saved post against it. Confident matches come first, then possible ones. Pin keeps the question as a pinned search in the sidebar, and later syncs score new posts against it.
  - Resources shows the repos, packages, videos, and pages that the listed posts link to, most saved first. A second switch narrows it to one kind.
  - Each card shows its topics as chips. Pressing a chip filters to that topic. Pressing the author's name filters to that author.
  - Links read as where they lead (`github.com/owner/repo`), not as `t.co` addresses, and a card shows the title of the first page a post links to. Links to the post's own picture or video, or to the post it quotes, are left out, as on X.
  - `j` and `k` move between cards; Enter opens the focused one.
  - Under a category filter, confident matches come first and a divider sets the possible matches apart.
  - A card opens the full post with its quoted post and media. Copy link and Open on X are on the card and in the dialog. The dialog lists every titled link, suggests up to four similar posts (sharing a linked resource or topics), and steps to the previous or next post in the list with its arrows or `j` and `k`. In the dialog, an @mention of someone you have saved posts from shows all of their posts.
  - Remove from corpus, in the post dialog, takes a post out of this corpus only; nothing changes on X. The toast offers Undo, and the Removed list in the sidebar restores it later.
- **Deep links:** the category selection, the author, and the search are in the address, so they can be bookmarked and Back works: `?topics=1,3&areas=2`, `?unfiled=1`, `?author=shuding`, `?q=scroll%20animation`. Typing a search updates the current entry instead of adding one per letter.
- **Loopback only:** the server answers only requests whose `Host` is `localhost`, `127.0.0.1`, or `[::1]`, on any port. Any other name gets a 403 (`src/proxy.ts`).

## Layout of the code

| Path | What it holds |
|---|---|
| `src/app/page.tsx` | Loads the snapshot inside a Suspense boundary and renders the screen. |
| `src/app/actions.ts` | One server action per category edit. |
| `src/app/globals.css` | Murmur tokens, the pixel magpie's inks, and the few component defaults that carry the look. |
| `src/components/corpus-screen.tsx` | The client component that holds filter state and lays out the screen. |
| `src/components/` | Sidebar, category tree, page header, flock, post card, post dialog, chips, empty states. |
| `src/lib/` | The snapshot reader and the pure filter, search, and resource logic, with tests in `test/`. |

Filtering runs in the browser over one snapshot of the store, so every control responds at once.

## Rules for changing it

- `DESIGN.md` is the design system (Murmur). Use its tokens; add a token in OKLCH with contrast checked before using a new color.
- `AGENTS.md` covers the framework and component rules: read the bundled Next.js and UI SDK docs before using an API, and build controls from `@ui-sdk/react` wherever a component fits.
- Engine code is loaded only through `src/lib/engine.ts`. A static import of `@x-corpus/engine` breaks the build.

## Checks

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```
