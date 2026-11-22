# Magpie design system: Murmur

Decided 2026-11-20 in `/proto/magpie` (PR #3, deleted when the design shipped), after brand, Murmur-variation and header rounds.
It replaced Grove (emerald, 2026-11-19), whose rejected directions are listed at the end.
Tokens live in `src/app/globals.css` (`@theme`, plus a `:root` block for the pixel magpie's inks). The author hue family lives in `src/lib/author-hues.ts`.

## Direction

A dawn sky with a flock of tiny pixel magpies in it, and **the flock is your result set**. It's a data-heavy tool, so the brand sits around the content and never on top of it:

- **Palette:** a peach → powder-blue wash at the top of main, a dawn-indigo sidebar warmed by a faint sunrise, a **burnt-orange primary** (H 38) and **rose likes** (H 5), so likes never read as the primary. Bookmarks stay **indigo** (H 275).
- **The flock** is a murmuration in each gutter beside the list, with one bird per post on screen up to 100. Past that the flock grows with the log of the count, so the whole collection is the full 320 and each big category still flies its own size (2,002 posts → 320 birds, 1,213 → 283, 565 → 227). Each one flies as a single body that wheels, stretches and folds. Filtering, searching or asking sends birds home or brings them back over about 0.9s. While an ask is judging, they circle the search field. Surprise sends a bird diving, pinning glints a group gold, and removing a post drops one.
- **Pixel art lives in the logo, the flock and illustrations only**, never in UI text. The sidebar mark is a perched magpie with a coin in its bill. It beats its wings on load, when you act, and when the pointer reaches it. Empty states show three magpies circling an empty patch. Each one flies side-on (19×23 art px at 2px each) through a six-frame wingbeat played up and back down: wings up, level and edge-on, then down, with the far wing showing behind on the upstroke. Each bird turns to face the way it's flying. The flock's 6×3 birds read as a murmuration at a distance but as bars up close, so the empty state doesn't use them.
- **Every author gets one of 8 matched hues** (`authorHue(handle)`), so you learn to spot repeat authors.

## Rules

- **Color math:** every color is OKLCH. Every text/background pair is ≥ 4.5:1 WCAG, and so is every sidebar gradient stop against its text. Checked on 2026-11-20; the lowest pair is like-text on like-soft at 6.1:1.
- **Sidebar:** `bg-side`, a dawn indigo → slate gradient interpolated in OKLab, with a `sunrise` glow at the bottom left. Text on it is `side-ink`, or `side-muted` for counts and labels.
- **Top of main:** `bg-wash` runs `dawn` → `morning` → `canvas` over the first 820px. It's a background, never an overlay on content.
- **The flock:**
  - The flight is `lib/murmuration.ts`, a pure module with seeded tests. The canvas, measuring and drawing are in `components/flock.tsx`.
  - Starling rules:
    - Each bird follows its 7 nearest neighbours.
    - Birds cruise at a near-constant speed and turn rather than brake.
    - Alignment outweighs everything else, so a turn ripples through the body.
    - A goal point drifts round each gutter, and the flock follows it as a whole.
    - Every 7–14s a small scare banks a few birds sharply, and the turn travels through the flock as a wave.
  - Birds bank away over a 16 art-px margin before the column, so the flock turns off it instead of piling against it.
  - The other edges are soft: a flock can sweep past the sidebar side, the window side, the top and the bottom, and wheels back in, up to 40% of its gutter's width out (at most 48 art px), so a narrow gutter doesn't lose most of its flock. Its goal stays on screen, so it always returns. The gold glint and the still, reduced-motion flock stay on screen.
  - A bird always belongs to the gutter it's in. A pull toward the other gutter would pin it against the column's edge for good, since it may never cross the text. That once showed as a line of birds stacked down the edge.
  - It's a canvas fixed behind main's content column, which sits at `z-index: 1`.
    - Nothing ever moves behind text, except during the Ask swirl.
    - When an Ask ends, the swirl splits at its median, and each half flies out to its own gutter.
    - When the gutters are too narrow (under 28 art px), one flock crosses the column at a lower alpha (0.24 instead of 0.42).
  - Birds are drawn at 2 CSS px per art pixel with `image-rendering: pixelated`.
  - The flock steps and draws at most once every 10ms, so a 120Hz screen draws it at 60fps. Birds move in 2px steps, so the extra frames showed nothing. Screens at 100Hz or less draw every frame.
  - A mouse or pen pointer in a gutter startles the birds within 14 art px of it, and the turn ripples through the flock as a scare does, so the flock parts around it. Over the column, on touch and with reduced motion on, the pointer does nothing.
  - Reactions follow what already happened and never delay or gate an action. They're broadcast through `lib/magpie-events.ts`.
  - With reduced motion on, each flock is drawn still, as one loose body, and the mark and the empty-state birds rest. Turning the setting on or off changes the flock at once, without a reload.
- **Page header** (`components/page-header.tsx`):
  - The title row holds the title (30px display), a count line (`N posts · N bookmarked · N liked`, or `N resources` on the Resources view) and the Posts / Resources switch.
  - The tool row under it holds one search field, Time, Sort, the Media toggle and an icon-only Surprise. It pins to the top on scroll over a frosted strip (`shadow-pinned`). Changing a filter while it's pinned jumps back to the top of the results.
  - The eyebrow shows only when it adds something: the collection, the area or the author.
- **Ask is an action on the search field, not a mode.** You start it with the Ask button that appears once you type, or with ⌘↵ (Ctrl ↵). Plain Enter never starts an ask, because each one costs money. Once an ask is open, Enter re-runs it after an edit, and Escape puts the asked question back. A search that matches nothing offers Ask instead in its empty state, beside Clear filters.
- **Primary fills:** a vertical gradient from `primary-top` to `primary`, with `shadow-primary`. Solid UI SDK buttons and the segmented-control indicator get it automatically.
- **Cards:** white `surface` on `canvas`, with `rounded-card` (16px) and `shadow-card`, which carries a warm sunrise glow underneath. On hover, `shadow-card-hover` adds a primary-tinted lift. Nothing gets a border for depth.
- **Post list** (`components/post-list.tsx`), decided 2026-11-20 in `/proto/density`. The list has two layouts, Cards (the default) and Rows. A Cards/Rows switch sits beside Posts/Resources in the title row, not in the pinned row, because you set it once. The choice is kept in the `magpie-layout` cookie, so the server renders it on the first paint. Switching leaves the scroll where it is, so the switch stays under the pointer.
  - **Cards** (`post-card.tsx`): attachments sit in the card's right margin, out of the reading flow. The lead picture is a 120px square crop, with a filmstrip of 36px crops and a `+n` under it. If the post has no pictures, the quote's pictures are used and labelled "In the quote". A video or GIF gets a play mark. The quote and the linked page are one-line strips. Text clamps at 4 lines, with blank lines collapsed. The footer spans the whole card under both columns: up to three topic chips and a `+n` on the left, the actions against the card's right edge. Nothing is hidden: every count is shown, and the post opens to all of it. About 244px a post, against 570px before.
  - **Rows** (`post-list-row.tsx`): an inbox on one white sheet per month, with hairline dividers. Each row shows the author line (name, handle, date, and glyphs for photos, quote and link) and two lines of text. Under that sit up to three topic chips and the four actions. A 72px thumbnail goes on the right. Month headings with counts pin under the tool row as one frosted band with it. There are no headings under Most liked or during an Ask, since those aren't in date order. About 122px a post.
  - **Post window** (`post-dialog.tsx`): pictures show full width. A video or GIF shows its thumbnail with a play button; pressing it fetches the stream from X and plays it in place with native controls. GIFs loop muted, and with reduced motion on they wait for you to press play. If X sends nothing, the thumbnail offers Open on X instead. Previous and next sit beside Close, and on a phone they move to the left of the footer so the author's name keeps its room. A trailing address that the link card below already names is left out of the text, as on cards. A quote carries a pill in its corner: Open post when you saved the quoted post too, which stacks it on top like More like this, or Open on X when you didn't. In a quote, the author's name (in their hue) and any @handle of an author you saved show that author's posts, as they do in the post. A reply says so above its text, with the same pill to the post it answers. Above More like this, Quoted by lists the saved posts that quote this one, and opens them the same way.
  - **Editing in a filtered view:** a post whose topics you change stays in the list, in its usual place, even once it no longer matches (say, it leaves Unfiled). It goes when you change the filter, search or sort, so you can add several topics without the post or its popover vanishing.
  - **Likes:** the post window's date line ends with the post's likes on X (`1.9M likes`). Under Most liked, cards and rows add it to theirs too, so the order explains itself.
  - A search hit past the clamp moves the text to start just before the hit. In the post window, a long post opened from a search starts scrolled to its first hit. A hit in a quote or a link title marks its strip or glyph, so a match never looks false.
- **First-run setup** (`components/setup-gate.tsx`), decided 2026-11-20 in `/proto/setup`. X and a Jev key are both required. Until both are saved, the page shows only the setup screen, which is the dawn sidebar on the left with the mark and the two steps, and the form on the wash.
  - Step 1 connects X (`auth_token`, `ct0`), and step 2 saves the Jev key. A step that's already done is skipped, so an install with X but no key opens at step 2. Back returns to X.
  - Each value is checked before it's stored. X is checked with whoami. The Jev key is checked by listing the account's models, which costs nothing. A refusal shows under its field, and an unreachable service or a locked keychain shows under the form.
  - The first sync is asked for once both are saved. A locked keychain counts as a stored key, so it shows the app and its warning, never the setup screen.
  - Copy says what happens and stops. There's no slogan.
- **Ask answer** (`components/answer-card.tsx`, `components/sidebar-deck.tsx`), decided 2026-11-22 in `/proto/ask-brief`. An Ask ends in a written answer, and the answer is a conversation.
  - The sidebar is a deck of two cards. The filters card is the sidebar as it was. The answer card sits behind it, 12px to the right and at 0.96 scale, so its edge shows. Both have 18px right corners. A bed in the sidebar's own color lies under them, so no page color shows through while a card is smaller than full size. The sidebar's resize handle sits just past the peeking edge, so the whole edge brings that card forward. Under a mouse pointer or keyboard focus, the card behind slides out 4px more (`--deck-nudge`, 150ms ease-out), so the edge reads as something to press.
  - The answer card has its own surface, `bg-answer`: dusk plum running to rose, with the same sunrise glow as the sidebar. Its text and controls use the sidebar's inks. The two colors are what make the peeking edge read.
  - **The swap is a shuffle.** The back card slides out to the right by 42% of its width, passes over the top and settles in front, while the front card drops back. 350ms, `cubic-bezier(0.645, 0.045, 0.355, 1)` on each half. The prototype started at 460ms; the user asked for 350ms. The front card stays full size until the other has passed over it. With reduced motion on, the cards trade places at once. The values live in `globals.css` as `--deck-*`.
  - Starting an Ask brings the answer card forward. Clearing the Ask sends it back. The peeking edge, Ask in the filters header and Filters in the answer header swap by hand without ending the Ask. While the answer card is behind, Answer in the filters header carries the update notice's dot on its icon: it pulses while the Ask judges and Claude writes, then stays until the answer card has been in front. On a card narrower than 17rem the button drops its label and keeps the icon.
  - Before any Ask the answer card is a place to start one: a heading, two lines on what happens, and a question field.
  - The answer streams in: the lead sentence, then each point with its title, text and source chips. Placeholder lines hold the space until the first words arrive. A source chip scrolls the list to that post and marks it, or opens the post when the list does not show it.
  - A follow-up field sits at the foot of the card. A follow-up's question scrolls to the top of the card, with room below it for the answer to stream into. New chat, in the header, clears the conversation and leaves the card in front.
  - Under 1,024px the sidebar is a sheet, and the same deck is inside it. The Ask panel gets an Answer button that opens the sheet. A source chip there closes the sheet first, then scrolls to the post.
  - A post a source chip points at is marked: a 2px primary ring on a card (`shadow-cited`), a primary bar and soft fill on a row.
  - The answer never shares the main column with the results.
- **Controls:** pills (`--ui-radius: 999px`). Inner surfaces use `rounded-inner` (10px), and avatars use `rounded-avatar` (12px).
- **Type:**
  - Text is Hanken Grotesk.
  - Display headings and the `magpie` wordmark use `font-display`, which is Bricolage Grotesque at weight 700 with −0.035em tracking.
  - Eyebrow labels are 11px uppercase at +0.08em and weight 600.
  - Body text is 15px with a 1.55 line height.
  - Live numbers use `tabular-nums`.
- **Bird inks:** `--color-bird*`, `--color-coin*` and `--color-gold-*` in the `:root` block. The canvas reads them at start and the SVG sprites read them as fills. They are art colors, not text colors, so add no utilities for them.
- **Search hits:** `mark` uses the lime `--color-mark`. Selected text uses `--color-selection`, a peach tint.
- **Motion:**
  - UI: 150ms ease-out on color and shadow. Presses scale to 0.96. Hover effects only apply behind `(hover: hover) and (pointer: fine)`.
  - Sprite animations: stepped frames (`steps(1)`), never tweened.
  - Post list: a removed post fades out over 150ms ease-in. Its gap then closes over 200ms `cubic-bezier(0.77, 0, 0.175, 1)`. Undo plays it in reverse: the gap opens, then the post fades in over 200ms `cubic-bezier(0.22, 1, 0.36, 1)`. A match an Ask finds while it runs rises 4px and fades in over 200ms. Pictures fade in over 200ms when they finish loading, and cached ones show at once. With reduced motion on, posts only fade and gaps change at once.
  - Sidebar sections fold open or shut over 200ms ease-out when you press their heading. On load they start as you left them, without folding.
  - Never animated: list swaps from typing, filtering or sorting, j/k movement, and the Cards/Rows switch.

## Known gaps

- **Dark mode:** not designed yet. A dusk/night remap was prototyped as "Daylight" and not taken.
- **Wide-gamut screens:** P3 has headroom for the primary and the collection colors, but nothing uses it yet.

## Rejected

Brand round (2026-11-19, all on the real screen): Night, Gold, Nest, Mischief, City, Holo, Window, Gouache, Quiet. **Murmur** ✅ was chosen as the most alive while still scanning like a data tool.
- Rejected outright: strict 1-bit/monochrome ledgers, RPG inventory grids, and simplified feeds that drop features.

Murmur variations (2026-11-20). None was taken, and plain Murmur stays:
- **Plumage:** birds colored by bookmarked/liked, clustered by area.
- **Roost:** the flock perches on the sidebar tree rows.
- **Migration:** the right gutter as a clickable minimap of the list.
- **Daylight:** a clock-driven dawn, day, dusk and night theme.

Setup round (2026-11-20, `/proto/setup`): **Gate** ✅ was chosen, then split into two steps with the copy cut back, at the user's request. No reason was given for passing on the others. The costs below were seen in the prototype and are not the user's reasons.
- **Current:** a "Nothing has synced yet" card and a Connect X button in the sidebar, with no Jev at all. On a phone, Connect X was hidden behind the menu.
- **Steps:** a centered card with numbered how-to steps and a "You're set" screen. It had the most clicks before the app.
- **Checklist:** setup inside the app shell as a two-item checklist, done in any order. The shell made it look as if Magpie already worked.
- Gate as one form, with all three fields and one button, became the two-step Gate.

Post density round (2026-11-20, `/proto/density`, on the real list): **Margin ⇄ Index** ✅ was chosen. It's Margin's cards with a switch to Index's rows. No reason was given for passing on the others. The costs below were measured in the prototype and are not the user's reasons.
- **Current:** a full-width media grid in every card. About 570px a post.
- **Margin alone** (about 244px a post) and **Index alone** (about 122px a post): taken together instead.
- **Lens:** "show inline" toggles in the pinned row for each kind (Photos, Quotes, Links, Long text), with set-aside things folded into pips you can open per post. About 242px a post. Its toggles made the pinned row two lines tall.
- **Reader:** a list beside a pinned reading pane. About 91px a post in the list. It widens main past 800px, so the flock was off.

Header round (2026-11-20, on Murmur):
- **Current:** eyebrow, a 40px title and a solid Surprise me, then a Search/Ask mode toggle, filters, and a separate view-and-count row. The list started 285px down, the toggle truncated the field, and the count showed three times.
- **Compact:** the chosen layout, but static.
- **Sticky:** the pinned tool row under the big 40px title.
- **Command:** no title, just one bar. Too little brand.
- **Compact + sticky** ✅: the list starts about 145px down.

Ask answer round (2026-11-22, `/proto/ask-brief`, on the real screen with real asks): **the answer as a second sidebar card, swapped with Shuffle** ✅. The user's reasons are quoted; the other costs were seen in the prototype.
- **Current:** the Ask panel ends at "Judged all N posts" and a ranked list. The question is never answered.
- **Brief:** the answer inside the Ask panel, above the list. The first card started about 900px lower.
- **Threaded:** each point as a heading over the posts it cites, then "Also matched". The list reshuffled when the answer landed.
- **Margin:** the answer in a rail to the right of the list, tried as Jump, Glide, Tuck (the sidebar slides away for room) and Anchored (the column always sits left). Liked first, then turned down: "it can't share space with the result column in the middle. It either needs to take it over or it needs to take over the left sidebar." It also needed about 1,100px of main area, or a narrower post column.
- **Column** and **Woven:** the conversation takes over the result column, with matches behind an Answer / Matches switch. Woven put the cited cards under each point. Passed over for the sidebar.
- **Sidebar, plain swap:** the answer replaces the sidebar's contents in the same indigo. It became the deck: "tucked under but to the right a little bit of the main sidebar", so the swap reads as "a card being swapped".
- **Deal:** the front card exits left and returns behind. The second half read as a pause.
- **Lift:** both cards meet halfway and trade depth, with no sideways travel. The least card-like.
- A light edge showed round a card mid-swap, because nothing lay under the cards. The bed fixed it.
- The answer card in the sidebar's indigo: the peeking edge did not read, so it got its own surface.

Grove (2026-11-19) beat Citrus, Lagoon, Riso, Spectrum, Ultraviolet, Tidepool and Sunset in two `/proto/style` rounds, then gave way to Murmur when the app was renamed Magpie.
