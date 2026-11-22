# ADR 0015: Web app: interface behavior

- Status: accepted
- Date: 2026-11-21

## Context

Magpie keeps no comments in its code. The decisions below used to be comments next to the code they explain. Each one records something the code cannot say by itself: why it was done this way, a rule from an outside system, or an invariant that must hold. Each entry names the file and the symbol it applies to, and links to where the comment last appeared, at commit `7ec16b3`.

When the code changes, update or remove the entry here in the same commit.

## Decisions

### `apps/web/src/app/layout.tsx`

#### 0015.1 `RootLayout suppressHydrationWarning`

The script below sets the remembered sidebar width on this element before React hydrates it.

The sidebar limits are defined once, in `SIDEBAR_WIDTH` in `components/sidebar-width.ts`. The head gets them two ways, both rendered on the server so the first paint already has them. A `<style>` sets them as `:root` variables (`--sidebar-min`, `--sidebar-max`, `--sidebar-fallback`, `--main-min`), which the `w-sidebar` utility reads. The head script is built from `sidebarWidthWithin` by `toString()`, so the script and the runtime check a stored width with the same function. That function takes its limits as arguments, because a stringified function cannot reach an imported constant.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/layout.tsx#L27)

### `apps/web/src/app/page.tsx`

#### 0015.2 `requestTime`

"Past week" and "synced 2 hr ago" are measured from the request that read the store.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/page.tsx#L12)

#### 0015.3 `Corpus`

X and a Jev key are both required; until both are saved, setup is all there is.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/page.tsx#L18)

### `apps/web/src/components/category-menu.tsx`

#### 0015.4 `keepFromTree`

A press on the button must not reach the tree, which would take focus back from the menu and toggle the row.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/category-menu.tsx#L45)

#### 0015.5 `CategoryMenuTrigger`

The button on a tree row that opens its actions, always shown after the count. It stays out of the tab order, as the tree is one tab stop; the tree opens it for the keyboard.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/category-menu.tsx#L48-L52)

#### 0015.6 `CategoryMenu`

A pinned search is a question the user typed, so it is not merged or hidden: it is renamed or deleted.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/category-menu.tsx#L119)

#### 0015.7 `CategoryMenu`

Inside a hidden area the area decides, so the topic's own switch would change nothing on screen.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/category-menu.tsx#L128)

### `apps/web/src/components/category-tree.tsx`

#### 0015.8 `MENU_GAP`

Every menu button has its own space after the count, so rows without one keep the same gap and the counts line up.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/category-tree.tsx#L28)

#### 0015.9 `CategoryTree`

Areas and their topics, most posts first. Pressing a row adds it to or takes it out of the filter, so several can be selected at once. Hidden areas and topics are listed under a collapsed group at the end. Each area and topic row carries a menu of edits; Shift+F10 or the menu key opens the focused row's.

A `query` narrows the rows to those whose name contains it and opens every area it leaves. The expansion held by the parent is not touched meanwhile, so it is back when the query is cleared.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/category-tree.tsx#L89-L98)

#### 0015.10 `CategoryTree (counts)`

Each row shows what selecting it alone would list, which leaves out hidden posts until they are revealed.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/category-tree.tsx#L124)

#### 0015.11 `CategoryTree (closed/open while searching)`

While searching, every area left in the tree is open unless it was closed during this same query.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/category-tree.tsx#L146)

#### 0015.12 `CategoryTree onValueChange`

A plain press would replace the selection; here every press toggles the pressed row, and range or select-all gestures do nothing.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/category-tree.tsx#L206-L207)

### `apps/web/src/components/connect-x-dialog.tsx`

#### 0015.13 `ConnectForm`

The submit button is gone; keep focus in the dialog until it closes.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/connect-x-dialog.tsx#L65)

#### 0015.14 `visibleSyncAction`

The sync panel's action in the sidebar on screen: what replaces the trigger once X is connected. Disconnecting leaves the corpus screen for the setup screen, so there is no panel to return to then.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/connect-x-dialog.tsx#L174)

#### 0015.15 `ConnectXDialog (finalFocus)`

Back to the control that opened it, or, when connecting replaced it, to the panel's new action.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/connect-x-dialog.tsx#L191)

### `apps/web/src/components/sidebar-deck.tsx`

#### 0015.118 `SidebarDeck`

The back card is `inert`, so nothing on it can be reached while it is behind. When a swap would leave focus on the card that just went back, focus moves to the card that came forward; focus anywhere else, such as the search field an Ask was started from, is left alone. Which card held focus is tracked from `focusin`, because by the time the swap has rendered the browser has already dropped focus to the body. Ask in the filters header, when no Ask is open, and New chat put focus in the question field of the deck on screen, since the desktop deck stays in the page, hidden, while the phone sheet is open.

The peeking edge is a button of its own, outside both cards, so it stays pressable whichever card is in front.

Each deck remembers for itself whether its front card has changed since it mounted, and plays the shuffle only then. The sidebar and the filters sheet each hold a deck, and the sheet's must not replay the last swap every time it opens.

### `apps/web/src/components/answer-card.tsx`

#### 0015.119 `AnswerCard`

The answer never shares the main column with the results: it was tried above the list, woven into it and beside it, and each was turned down (see `DESIGN.md`). Everything that ends an Ask or a Find topic ends the conversation too, through one path: the panel's clear, a category, a topic chip, an author, Pin as topic and Back. New chat ends it and keeps the card in front. Filters in the card's header only swaps the cards.

A follow-up scrolls inside the conversation only. `scrollIntoView` would also scroll the card, which clips its contents.

### `apps/web/src/components/corpus-screen.tsx`

#### 0015.16 `selectionInAddress`

Reads each key the way the server does (first value wins), so a URL with a repeated key seeds and re-reads to the same selection.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/corpus-screen.tsx#L187-L188)

#### 0015.17 `CorpusScreen linked`

`linked` is the selection the page was opened with; later changes are read from the address bar.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/corpus-screen.tsx#L200)

#### 0015.18 `CorpusScreen refresh effect`

The store changes underneath the page every few hours, and on every edit.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/corpus-screen.tsx#L235)

#### 0015.19 `CorpusScreen j/k shortcuts`

Only from the page itself or a card, so a focused menu, tree row, or control keeps its own keys.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/corpus-screen.tsx#L265)

#### 0015.20 `CorpusScreen history replaceState/pushState`

A selection the address already names is tidied in place, so Back still leaves it. A search alone rewrites the current entry, so Back does not step through every letter typed. The address counts as naming the selection when it matches either the selection as chosen or as shown, since a deleted topic, or an area chosen with one of its own topics, is dropped from what is shown and so from the address.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/corpus-screen.tsx#L292-L293)

#### 0015.113 `CorpusScreen popstate`

Back and Forward set the selection from the address. An open ask sets the category selection aside (0014.9), so following the address would change the URL but not the results; the ask is closed first, as picking a category in the sidebar does.

#### 0015.114 `CorpusScreen disconnected`

The page shows the setup screen while X is not connected. Once the sync state says so, after Disconnect or a read that finds the cookies gone, the page is refreshed at once, so the swap happens then and not at some later refresh.

#### 0015.21 `shownSelection`

Toggles start from the selection on screen: an area chosen with one of its own topics shows as the topic alone, and must not come back when the topic goes.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/corpus-screen.tsx#L320-L321)

#### 0015.22 `PageHeader onLayout`

The scroll is left alone: the switch only shows near the top, and moving the page would pull it from under the pointer.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/corpus-screen.tsx#L463)

### `apps/web/src/components/dev-tools.ts`

#### 0015.23 `DevTools`

A page can't open dev tools, so setup names this browser's shortcut and the panel that lists cookies.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/dev-tools.ts#L1)

#### 0015.24 `devToolsFor`

Chrome, Edge and Arc all say Safari too; only real Safari and Firefox call the panel Storage.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/dev-tools.ts#L8)

### `apps/web/src/components/fade-img.tsx`

#### 0015.25 `FadeImg`

A remote picture that fades in when it finishes loading, instead of snapping in over its placeholder. One already loaded (cached, or loaded before the page hydrated) shows at once and never fades.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/fade-img.tsx#L5-L9)

#### 0015.26 `FadeImg`

Before paint, so a picture that is still loading never flashes in and out.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/fade-img.tsx#L12)

### `apps/web/src/components/flock.tsx`

#### 0015.27 `Flock (module)`

The flock: a murmuration of tiny pixel magpies that IS the result set, one bird per post up to 100, then fewer (see birdsFor). Filter, search or ask and the sift becomes visible: birds leave as results drop and arrive as they return. Usability first: the flock lives in the gutters (never behind the content column), stays low-contrast, and only crosses the header during the brief swirl while an ask is judging. Nothing in it needs opening or hovering.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/flock.tsx#L2-L5)

#### 0015.28 `createSky sprites`

sprites[palette][frame][facing], inked from the bird tokens in globals.css.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/flock.tsx#L43)

#### 0015.29 `createSky measure`

main grows as the list loads more; only touch the backing store when the sky's size really changes (resizing clears it).

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/flock.tsx#L66)

#### 0015.30 `createSky surprise`

Toward the middle of the screen, where the opened post appears.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/flock.tsx#L157)

#### 0015.110 `createSky loop`

The flock steps and draws at most once every MIN_FRAME_MS (10ms). Birds move in 2px steps at about 40px a second, so frames past 60 a second show nothing new, and a 120Hz screen was running the flock twice as often as it needed. The gate is 10ms rather than 16.7ms so a 90Hz screen still steps every frame instead of falling to 45.

#### 0015.111 `birdsFor`

One bird per post saturated at MAX_BIRDS (320), so in a collection of 2,000 posts Everything, Bookmarks, Likes and every top category showed the same full flock and the flock stopped saying how much was there. Up to ONE_BIRD_EACH (100) posts it is still one bird each; above that the count grows with log(count / 100) / log(collection / 100), so the whole collection is 320 and each step down the sidebar loses birds. It never gives more birds than posts. A collection of 320 or fewer keeps one bird per post throughout. The mapping lives in the Flock component, so the murmuration keeps taking a plain bird count.

#### 0015.31 `Flock`

Fixed over <main>, behind its content column. <main> must be `relative` and the content column must sit above the sky (z-index 1). The column is handed to `Flock` as a ref, which the sky measures to keep birds out from behind text.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/flock.tsx#L175-L178)

### `apps/web/src/components/format.ts`

#### 0015.32 `DATE`

A fixed locale and zone, so the server and the browser print the same date.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/format.ts#L3)

### `apps/web/src/components/magpie.tsx`

#### 0015.33 `WINGBEAT`

The empty-state bird: a magpie flying side-on, in six frames of one wingbeat (up, through level, to down). The far wing shows behind on the upstroke. The flock keeps its own 6×3 birds, which read as a murmuration at a distance. K black · W white · B wing gloss · F far wing · w far wing's white · G tail gloss · V tail tip · E eye

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/magpie.tsx#L89-L93)

### `apps/web/src/components/media-focus.ts`

#### 0015.109 `requestMediaFocus`

Clicking a thumbnail in the list opens the post window scrolled to that media and presses its play button. The dialog's payload stays a bare post id, because stepping with j/k and the nested layers depend on that, so the click leaves a one-shot request here instead. The window's body takes it when it mounts for that post, and a request for any other post is dropped. When the request is taken, it replaces the scroll to the first search hit.

### `apps/web/src/components/media-preview.tsx`

#### 0015.110 `MediaPreview`

Resting the mouse on a list thumbnail for 350ms shows its media large, docked to the left of the thumbnail. A light curved line runs from a dot beside the thumbnail to the preview. The rest of the page dims, with a cutout that keeps the thumbnail bright. It enters in 220ms with `cubic-bezier(0.32, 0.72, 0, 1)` (fading, sliding 12px from the thumbnail's side, and growing from 0.96, while the line draws itself), and leaves in 140ms ease-in. It is at most 640px wide and keeps the media's own shape, read from the loaded thumbnail. Leaving the thumbnail, clicking it, or any scroll closes it. The preview is a non-interactive picture: the post window still holds the controls.

Chosen from a prototype round. Rejected:

- Growing the thumbnail in place: too small to read screenshots or diagrams.
- A card beside the thumbnail with a caption line: it covered the post's text and added a surface.
- A large centered preview: big enough, but nothing tied it to its thumbnail.
- Growing out of the thumbnail and back: the tie showed only while it moved.
- A lit cutout with a centered preview: the ring sat too far from the preview on wide screens.
- A tinted wedge joining the two: the heaviest, and it covered the post's text.
- A frame with an arrow at the thumbnail: the white arrow disappeared against the white card.
- The wedge appearing after the preview grows out of the thumbnail: too busy.
- The line without the dim: the line and preview were lost against the cards.

#### 0015.117 `loadVideo`

The playable address of a video is read once per thumbnail and kept for the session. A read that failed is forgotten, so the next hover tries again.

#### 0015.111 `playWithSound`

Browsers allow audible autoplay only after the person has clicked or pressed a key on the page, and a hover is not such a gesture. The video tries to play with sound and, if the browser refuses, plays muted instead of not at all. A GIF has no sound, so it stays muted.

#### 0015.112 `MediaPreview enter`

Only a mouse on a device that can hover opens a preview: touch fires hover on tap, and the tap already opens the post. With reduced motion, the preview shows the still image and does not animate.

### `apps/web/src/components/merge-dialog.tsx`

#### 0015.34 `MergeDialog`

Picks the topic another one folds into, and confirms it: a merge has no undo.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/merge-dialog.tsx#L53)

### `apps/web/src/components/page-header.tsx`

#### 0015.35 `useIsMac`

Resolved after hydration: the server cannot know the platform, so it renders the Mac hint and the client corrects it.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/page-header.tsx#L81)

#### 0015.36 `PageHeader`

Changing the search or a filter from the pinned row deep in the list jumps back to the top of the new results, so the count and the first match are on screen instead of wherever the old scroll position lands.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/page-header.tsx#L277-L278)

#### 0015.37 `PageHeader (layout switch)`

A set-once choice, so it sits up here rather than in the pinned row.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/page-header.tsx#L307)

### `apps/web/src/components/post-body.tsx`

#### 0015.38 `PostText`

Post text with search matches marked and addresses shortened the way X shows them. With `links`, addresses become links; a card leaves them plain because the whole card opens the post. With `mentions`, @handles of saved authors filter to that author.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/post-body.tsx#L58-L63)

#### 0015.39 `Thumb`

A fixed square crop of one picture, with a play mark when it stands for a video or GIF. `small` is for crops under 40px.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/post-body.tsx#L159)

### `apps/web/src/components/post-card.tsx`

#### 0015.40 `PostCard`

A post as a card. Its pictures sit in the right margin as a square crop and a filmstrip, out of the reading flow, and its quote and linked page are one line each, so cards stay short and alike in height while nothing is hidden.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/post-card.tsx#L155-L159)

#### 0015.41 `PostCard text`

Blank lines would spend the four-line clamp on nothing.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/post-card.tsx#L164)

### `apps/web/src/components/post-dialog.tsx`

#### 0015.42 `LAYER`

Nested layers render inside this element, so it only places the dialog: the card inside carries the look and the stacking.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/post-dialog.tsx#L21)

#### 0015.43 `CARD`

Room above the card for the peeking edges of the posts behind it.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/post-dialog.tsx#L25)

#### 0015.44 `frontHeight`

While this layer is the one in front, keeps the stack's `--front-height` at its card's height, which the layers behind take on. It is set on the bottom layer and inherited, without a re-render.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/post-dialog.tsx#L28-L32)

#### 0015.45 `PostDialogProps.onShowAuthor`

Shows everything by a mentioned author, setting aside the search and categories that may exclude them.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/post-dialog.tsx#L60)

#### 0015.46 `PostDialog`

A post, and every post opened from its "More like this" stacked over it. Each pick opens a nested dialog on top, so closing one shows the post it was opened from, like a history.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/post-dialog.tsx#L70-L74)

#### 0015.47 `PostLayer root prop`

The bottom layer. Anything that changes the list behind closes it, and with it the whole stack.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/post-dialog.tsx#L84)

#### 0015.48 `PostLayer DialogBackdrop`

The page dims once; a nested backdrop is clear and only catches the click that closes it.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/post-dialog.tsx#L106)

#### 0015.49 `PostLayer finalFocus`

After stepping to other posts, closing lands on the card of the post last shown, when it is listed.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/post-dialog.tsx#L110)

#### 0015.50 `PostLayer onKeyDown`

Keys from popups portaled out of the dialog, like the topics editor, and from the layers stacked inside this one still bubble here through React.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/post-dialog.tsx#L121-L122)

#### 0015.51 `PostLayer DialogTitle author button`

The title names the dialog, so the button keeps the author's name and describes itself in `title`.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/post-dialog.tsx#L159)

#### 0015.52 `PostLayer body ref`

Picking a suggestion replaces the row that had focus, so focus returns to the dialog instead of the page.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/post-dialog.tsx#L211)

#### 0015.53 `PostLayer remove onClick`

The removed post's card goes away, so focus returns to where the dialog was opened from.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/post-dialog.tsx#L289)

#### 0015.109 `scrollToFirstHit`

Runs once per opened post (the body is keyed by post), so a re-render from a sync poll or an Ask never pulls the window back after the reader scrolls. A hit already in the top three quarters leaves the window at the top.

### `apps/web/src/components/post-layout.ts`

#### 0015.54 `LAYOUT_COOKIE`

Read by the page on the server, so the first paint already has the reader's layout.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/post-layout.ts#L4)

### `apps/web/src/components/post-list-row.tsx`

#### 0015.55 `Carries`

Glyphs for what a post carries besides text. One that holds a search hit is marked, so the row never looks like a false match.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/post-list-row.tsx#L18)

### `apps/web/src/components/post-list.tsx`

#### 0015.56 `PostList`

The matching posts, 60 at a time, with more added as the end comes into view. Give it a `key` that changes with the filter so the window starts over. Under a category filter, a divider sets unsure matches apart. `rows` lays them out as dense rows under month headings; `ranked` says an Ask ordered them, and `arriving` that it is still finding more.

A post removed from the screen stays a moment as a ghost while it leaves, and comes back the same way if the removal is undone.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/post-list.tsx#L30-L39)

#### 0015.57 `PostList motion state`

Compared on each new list, during render, so a leaving post never drops out for a frame. Each change that starts motion is a batch, cleared on its own timer, so the screen re-rendering (an Ask streaming, a sync poll) never cuts an animation short.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/post-list.tsx#L86-L88)

#### 0015.58 `PostList motion effect timers`

A leave fades for 150ms, then closes its gap for 200ms; a return opens, then fades in. Reduced motion only fades. No cleanup: a later batch must not cancel this one's timer.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/post-list.tsx#L113-L114)

#### 0015.59 `PostList month heading`

Pins under the tool row as one frosted band with it, so a long scroll always says which month it is in.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/post-list.tsx#L160)

#### 0015.60 `PostList card list --list-gap`

--list-gap lets a leaving card close its gap too, not just its height.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/post-list.tsx#L177)

### `apps/web/src/components/post-topics-editor.tsx`

#### 0015.61 `PostTopicsEditor`

Every topic a post is in, sure or possible, each removable, and a field to add another. One editor serves every trigger connected to its controller; a modal dialog needs an editor of its own inside its content.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/post-topics-editor.tsx#L72-L76)

#### 0015.62 `PostTopicsEditor listed effect`

A fix can take the post out of the filtered list, and its trigger with it; the editor has nothing left to point at.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/post-topics-editor.tsx#L96)

### `apps/web/src/components/resources-view.tsx`

#### 0015.63 `ResourcesView`

A video's channel says more than its host; anything else keeps the host.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/resources-view.tsx#L55)

### `apps/web/src/components/secret-field.tsx`

#### 0015.64 `SecretField`

A pasted secret: hidden by default, with a show toggle. Cookie names are set in mono, as X shows them.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/secret-field.tsx#L8)

### `apps/web/src/components/setup-gate.tsx`

#### 0015.65 `useStepFocus`

On a desktop the step's first field takes focus; on touch, or a step with no field, its title does once the step changes.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/setup-gate.tsx#L82)

#### 0015.66 `SetupGate`

First run: X and a Jev key are both required before the app shows. Two steps, X then Jev; a step already done is skipped. The first sync is asked for once both are saved.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/setup-gate.tsx#L97-L101)

#### 0015.67 `SetupGate backend state`

Recorded by the first secret saved, so it can change on step 1.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/setup-gate.tsx#L108)

#### 0015.68 `SetupGate open`

Both saved: the page renders the app instead of this.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/setup-gate.tsx#L113)

### `apps/web/src/components/sidebar-resizer.tsx`

#### 0015.69 `saveWidth`

Without storage the width still holds until the page is closed.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/sidebar-resizer.tsx#L39)

#### 0015.70 `SidebarResizer (shownWidth)`

A narrow window can hold the sidebar below its remembered width.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/sidebar-resizer.tsx#L58)

#### 0015.71 `SidebarResizer (start)`

Stops the press from starting a text selection.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/sidebar-resizer.tsx#L69)

#### 0015.72 `SidebarResizer (start)`

Measured, not remembered: a narrow window can hold the sidebar below its remembered width.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/sidebar-resizer.tsx#L74)

#### 0015.73 `SidebarResizer (keys)`

A narrow window can hold the sidebar below its remembered width; steps start from what is shown.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/sidebar-resizer.tsx#L90)

#### 0015.74 `SidebarResizer (className)`

The hit area sits mostly outside the sidebar, clear of its scrollbar; the line it shows is on the edge itself.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/sidebar-resizer.tsx#L127)

### `apps/web/src/components/sidebar.tsx`

#### 0015.75 `categoryQuery`

Narrows the tree only: the selection and the address stay as they are.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/sidebar.tsx#L87)

#### 0015.76 `category search onKeyDown`

With text to clear, Escape clears it and goes no further, so the narrow-screen panel stays open.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/sidebar.tsx#L157)

### `apps/web/src/components/sync-panel.ts`

#### 0015.77 `DOING_AFTER`

What a run is doing once `stage` is the last one it recorded. Stages are recorded when they finish.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/sync-panel.ts#L18)

#### 0015.78 `SyncPanel.synced`

When the last full sync finished, unless the title already says it.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/sync-panel.ts#L43)

#### 0015.79 `SyncPanel.fallbackWarning`

Shown under every state while secrets are kept in the fallback file.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/sync-panel.ts#L48)

#### 0015.80 `describeSync`

What the sync panel shows. The first state that applies wins: X needing a reconnect, an unreadable secret store, X not connected, a run in progress, a pending request, no worker, and otherwise how the last run went.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/sync-panel.ts#L101-L105)

### `apps/web/src/components/sync-status.tsx`

#### 0015.81 `SyncStatus`

The sidebar's sync panel. While all is well it is one compact line, the status and an icon-only Sync now. A warning, Connect X or Reconnect X gets the full panel, with the detail and a labelled action. The X account sits in a row of its own under either.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/sync-status.tsx#L95-L100)

#### 0015.115 `SyncStatus clock`

Relative times ("Synced 5 minutes ago") are measured from when the state was read on the server's render, then from a clock that ticks each minute after mount, so they keep moving while nothing is synced and the first render matches the server's. A refused Sync now message belongs to the state it was refused under, and goes away once a newer state is read.

#### 0015.82 `SyncStatus live region`

One element tree for both shapes, so the live region stays mounted and announces a change of state.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/sync-status.tsx#L120)

### `apps/web/src/components/tip.tsx`

#### 0015.83 `TipProvider`

One tooltip shared by every `Tip` inside. A modal dialog makes the rest of the page inert, so a dialog needs a provider of its own inside its content.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/tip.tsx#L10-L13)

#### 0015.84 `Tip`

Names an icon-only control. The control still needs its own `aria-label`.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/tip.tsx#L31)

### `apps/web/src/lib/category-search.ts`

#### 0015.85 `CategoryRows`

The category tree as the sidebar lists it, top to bottom.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/category-search.ts#L5)

#### 0015.86 `searchCategories`

The rows whose name contains the query, ignoring case and surrounding whitespace. A matching topic stays under its area; a matching area keeps every topic; the Hidden row's own name keeps everything under it. A blank query returns the rows unchanged.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/category-search.ts#L17-L22)

### `apps/web/src/lib/list-motion.ts`

#### 0015.87 `MAX_LEAVING`

More than this many posts leaving at once is a sync or a reload, not a removal, and nothing animates.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/list-motion.ts#L9)

### `apps/web/src/lib/magpie-events.ts`

#### 0015.88 `emitMagpie/useMagpieEvents`

Things the app did that the brand art reacts to: the sidebar mark flaps, the flock dives, glints or drops a bird. Reactions never delay or gate the action itself.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/magpie-events.ts#L2-L3)

### `apps/web/src/lib/month-runs.ts`

#### 0015.89 `monthRuns`

The shown posts as runs of one month each, for the Rows layout. A new run also starts where the unsure matches begin. Under Most liked, and while an Ask ranks the list, months mean nothing, so there is one run with no label.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/month-runs.ts#L7-L11)

### `apps/web/src/lib/murmuration.ts`

#### 0015.90 `murmuration module`

The murmuration behind the post list: up to MAX_BIRDS birds, as many as Flock asks for, in two flocks, one per gutter. Pure and DOM-free (the canvas, measuring and drawing live in components/flock.tsx), so it can be stepped in tests.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/murmuration.ts#L1-L2)

#### 0015.91 `createMurmuration (flocking model)`

```text
How a flock holds together and changes shape, as starling murmurations do:
- Each bird reacts to its K nearest neighbours (topological, like starlings), not to everyone within a radius,
  so the flock stays one body whether it is packed tight or stretched thin.
- Birds cruise at a near-constant speed and steer by turning toward a desired heading; they never brake or dart.
  Alignment dominates, so a turn started anywhere ripples through the body; that ripple is what folds the shape.
- A goal point drifts slowly round each gutter and the flock follows it, so the body keeps wheeling and stretching.
- Near the content column birds turn away gradually, over a margin, toward the goal,
  so the flock banks off the column instead of piling against it.
- The screen's other edges are soft: a flock may sweep up to LEASH of its gutter's width (at most OFFSCREEN) past them (the sidebar side, the window side,
  top and bottom) and wheel back in, as a real murmuration leaves the frame. Its goal stays on screen, so it always returns.
  Pinning's gold glint and the still flock under reduced motion stay on screen, since they are meant to be seen.
- Now and then a small scare sends nearby birds sharply off; alignment carries it through the flock as a wave.
- A pointer held in a gutter startles birds within SHY of it the same way, so the flock parts round it. A pointer over the
  column is ignored, since no bird flies there and the reader is reading; touch is ignored, since a tap is not a hover.
```

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/murmuration.ts#L4-L12)

#### 0015.92 `Bird.home / gutter ownership`

A bird always belongs to the gutter it is in. A pull toward the other gutter would hold it against the column's edge for good (it may never cross the text), which once showed as a line of birds stacked down that edge.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/murmuration.ts#L14-L15)

#### 0015.93 `Space`

Art pixels; the canvas draws each one as 2×2 CSS px.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/murmuration.ts#L19)

#### 0015.94 `Bird.phase`

Wingbeat phase; the frame is `Math.floor(phase) & 1`.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/murmuration.ts#L32)

#### 0015.95 `CELL`

neighbour grid; NEAR fits in the 5×5 cells round a bird

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/murmuration.ts#L51)

#### 0015.96 `NARROW`

a gutter thinner than this is too small to fly in: one flock crosses the column instead

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/murmuration.ts#L56)

#### 0015.97 `spawn`

New birds fly in from the outer edge (or the top) of the emptier gutter, so the two flocks stay even.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/murmuration.ts#L115)

#### 0015.98 `sendHome`

Out through the outer edge of the bird's own gutter, never across the column.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/murmuration.ts#L129)

#### 0015.99 `scare`

Away from the scare, and sideways to the bird's heading so it reads as a bank, not a scatter.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/murmuration.ts#L145)

#### 0015.100 `step (release budget)`

Arrivals and departures are released over time, proportional to the change, so a sift reads as one flow.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/murmuration.ts#L166)

#### 0015.101 `step (home reassignment)`

A bird in a gutter belongs to it. One still over the column (leaving the swirl) keeps the side it was given.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/murmuration.ts#L174)

#### 0015.102 `step (cohesion)`

Cohesion grows with distance, so stragglers rejoin and a packed core stays loose.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/murmuration.ts#L280)

#### 0015.103 `step (goal reach)`

The goal only steers the flock as a whole: a bird near it barely feels it, so the body keeps its own shape.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/murmuration.ts#L307)

#### 0015.104 `step (overColumn push)`

Nothing stays behind the text: a bird still over the column (leaving the swirl) is pushed out toward its own side.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/murmuration.ts#L350)

#### 0015.105 `setAsking`

The swirl splits down its middle and each half flies to its own gutter, so the two flocks come out even.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/murmuration.ts#L429)

### `apps/web/src/lib/resources.ts`

#### 0015.106 `resourceName`

What to call a resource. A title that is only its host says nothing (every video once read "youtube.com"), so the first saving post's words stand in, without its links, marked as a quote of the post. A post that is only a link names who shared it instead.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/resources.ts#L29-L34)

### `apps/web/src/lib/search.ts`

#### 0015.107 `highlightRanges`

Where the query occurs in the text. Each word is marked on its own, longest first so a word inside another is marked whole; with `phrase`, only the query as typed is marked, for searches that match it that way.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/search.ts#L12-L16)

#### 0015.108 `aroundHit`

The text from a little before the first match, when that match sits more than `after` characters in, so a clamped row or card still shows why it matched. It cuts at a word boundary and marks the cut with an ellipsis.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/search.ts#L24-L28)

### `apps/web/src/app/settings/page.tsx`

#### 0015.109 `Settings`

Settings is its own route, `/settings`, opened from a row in the sidebar footer, so the corpus screen's query-param state stays out of it. A back link returns to `/`. It holds the category focus setting, the X connection, the Jev key, and read-only status for background sync and the Claude skill link.

Changing the focus saves it first, then asks whether to re-sort existing areas, showing a preview of what would change. Apply writes only the previewed changes, and only to areas still unflagged and active. Choosing not to re-sort keeps the saved setting for new areas. The page is in `apps/web/src/components/settings-screen.tsx`; the preview dialog is `apps/web/src/components/resort-dialog.tsx`.

#### 0015.116 `FocusSection / JevSection messages`

Cache Components keeps the settings page's state when it is navigated away from (see the Next.js guide on preserving UI state). Saved notes, failures and "New key saved" are cleared when the page is hidden, so coming back does not show the result of an earlier visit. Unsaved drafts are kept.

### `apps/web/src/components/update-notice.tsx`

#### 0015.110 `UpdateNotice`

The update notice is one sidebar footer row, "Update to vX.Y.Z", above the sync status. It has the same height and type as the rows below it and a small primary-colored dot. Pressing it opens a popover to the right with the version you have, the full command (wrapped, never cut off), "Copy command", which shows "Copied" for 1.5 seconds, a "What's new" link to the release, and "Later". "Later" hides the row until a newer version comes out. The popover scales in from its trigger over 150ms, the same as the post topics editor.

Picked on 2026-11-21 from a live prototype in the real sidebar, against two other versions:

- An inline card that showed the command with small copy and hide buttons. Rejected: it was the biggest thing in the footer, the long command got cut off so you couldn't read what you would run, and its 28px buttons were under the 40px desktop minimum.
- An orange callout with one large "Copy update command" button and the command hidden. Rejected: it was the loudest thing in the sidebar, it competed with the orange used for selections, and it hid what runs in the user's terminal.
