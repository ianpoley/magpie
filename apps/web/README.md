# x-corpus web

The corpus screen: every post you bookmarked or liked on X, in one list you can filter by category, collection, author, keyword, time range, and media.

It reads the local store the sync job writes (`state/corpus.sqlite`, or the file `X_CORPUS_STORE` points at). Nothing leaves this Mac, and the server only listens on `127.0.0.1`.

## Run it

From the repo root:

```bash
bun install
bun run dev        # http://127.0.0.1:3000
```

`bun run dev -- -p 3001` picks another port. `bun run build` then `bun run start` serves the production build.

The page reads the store on every request and again whenever you return to the window, so a sync that finished in the background shows up without a reload. If the store does not exist yet, the screen says so and stays empty until the first sync.

## What is on the screen

- **Sidebar:** collections (Everything, Bookmarks, Likes), the category tree, the ten most-saved authors, sync status, and What changed.
  - Pressing an area or topic adds it to the filter; pressing it again removes it. Several topics narrow to posts in all of them. An area stands for any topic inside it.
  - Pinned searches and Unfiled sit above the areas. Hidden areas and topics are listed under a collapsed Hidden group, and Show hidden brings their posts back into every view.
  - Sync status shows when the last full sync finished. If a stage failed or the X export is stale, it names the problem.
- **Main column:** title, Surprise me, search, time range, sort, the media switch, and the Posts / Resources toggle.
  - Search matches post text, quoted text, author name and handle, and the titles of linked pages. Matches are highlighted.
  - Each card shows its topics as chips. Pressing a chip filters to that topic.
  - Under a category filter, confident matches come first and a divider sets the possible matches apart.
  - A card opens the full post with its quoted post and media. Copy link and Open on X are on the card and in the dialog.

## Layout of the code

| Path | What it holds |
|---|---|
| `src/app/page.tsx` | Loads the snapshot inside a Suspense boundary and renders the screen. |
| `src/app/actions.ts` | One server action per category edit. |
| `src/app/globals.css` | Grove tokens and the few component defaults that carry the look. |
| `src/components/corpus-screen.tsx` | The client component that holds filter state and lays out the screen. |
| `src/components/` | Sidebar, category tree, toolbar, post card, post dialog, chips, empty states. |
| `src/lib/` | The snapshot reader and the pure filter, search, and resource logic, with tests in `test/`. |

Filtering runs in the browser over one snapshot of the store, so every control responds at once.

## Rules for changing it

- `DESIGN.md` is the design system (Grove). Use its tokens; add a token in OKLCH with contrast checked before using a new color.
- `AGENTS.md` covers the framework and component rules: read the bundled Next.js and UI SDK docs before using an API, and build controls from `@ui-sdk/react` wherever a component fits.
- Engine code is loaded only through `src/lib/engine.ts`. A static import of `@x-corpus/engine` breaks the build.

## Checks

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```
