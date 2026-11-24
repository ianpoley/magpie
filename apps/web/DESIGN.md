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
- **Page header** (`components/page-header.tsx`, `components/search-status.tsx`), decided 2026-11-22 in `/proto/header` (Flat, with the quiet line in the Meaning wording). Nothing in it is a card or carries a shadow.
  - The title row holds the title (30px display), a count line (`N posts · N bookmarked · N liked`, or `N resources` on the Resources view), and on the right Posts / Resources as underlined text tabs and Cards / Rows as two icons. The count line hides during a meaning search, because the line under the field says the count.
  - The tool row under it holds one search field (a translucent fill with a hairline border, no shadow), then Time, Sort, Media and an icon-only Surprise as borderless text controls. A changed Time or Sort and a pressed Media take the peach fill. It pins to the top on scroll over a frosted strip (`shadow-pinned`). Under 1,024px the pinned row also carries the menu button once it pins, so the filters and the answer stay one press away. Changing a filter while it's pinned jumps back to the top of the results.
  - One quiet line under the field, also pinned, says what the search is doing. Its text starts in line with the text in the field. Only one of these shows at a time:
    - While you type: the Find topic button (⌘↵), then where the keyword matches already live: "3 of 3 are already in UI Components & shadcn · Open topic", or "Reads every saved post for what the words mean" when no topic holds half of them.
    - During a meaning search: "Reading 880 of 2,308 posts for what they mean…", then "275 posts match by meaning · 202 already in Animations & Motion · Pin as topic · Open topic · Clear". With no clear home it says "…match by meaning, not exact words". Posts that could not be read add a rose "N posts could not be read" and Try again. An Ask says "N posts that may answer your question", with Answer under 1,024px.
    - A topic is named only when it holds at least half of 3 or more listed posts, and never when it is the topic already shown (`lib/topic-overlap.ts`).
  - Pin as topic is an orange text button, the only primary-coloured action in the header. Clear ends the search, so a search can be left even after the field is emptied. Editing the query swaps in Run again ↵.
  - A 2px progress line runs along the bottom of the field while Jev reads, then fades.
  - Filter chips (area, topic, Unfiled, author) are outlined, sit in the pinned strip under the field, and end in Clear all when there are two or more. The keyword has no chip, since the field shows it. On the Resources view the kind switch sits there too.
  - The count is announced to screen readers once typing pauses, not on every keystroke.
  - The eyebrow shows only when it adds something: the collection, the area or the author.
- **Search has three intents, and each has one home.** Decided 2026-11-22 in `/proto/search-intents` (Two homes). Each step up costs more:
  - **Keyword** (free): typing in the main field filters live.
  - **Find topic** (Jev): the Find topic button that appears once you type in the main field, or ⌘↵ (Ctrl ↵). Jev reads every saved post for the meaning of the words, and the list shows the matches. The line under the field reports it and offers **Pin as topic**. No chat starts, and the answer card stays where it is.
  - **Ask** (Jev, then Claude): only from the answer card in the sidebar. The list shows the sources, and the line under the field says "N posts that may answer your question", with no Pin.
  - Plain Enter never starts a paid run. Once one is open, Enter re-runs it after an edit, and Escape puts the words back. Otherwise Escape clears the field, and Escape in an empty field leaves it, so j and k move through the list. A keyword search that matches nothing offers Find by meaning in its empty state, beside Clear filters.
- **Primary fills:** a vertical gradient from `primary-top` to `primary`, with `shadow-primary`. Solid UI SDK buttons and the segmented-control indicator get it automatically, except in the page header, which uses text tabs.
- **Cards:** white `surface` on `canvas`, with `rounded-card` (16px) and `shadow-card`, which carries a warm sunrise glow underneath. On hover, `shadow-card-hover` adds a primary-tinted lift. Nothing gets a border for depth.
- **Post list** (`components/post-list.tsx`), decided 2026-11-20 in `/proto/density`. The list has two layouts, Cards (the default) and Rows. A Cards/Rows switch sits beside Posts/Resources in the title row, not in the pinned row, because you set it once. The choice is kept in the `magpie-layout` cookie, so the server renders it on the first paint. Switching leaves the scroll where it is, so the switch stays under the pointer.
  - **Cards** (`post-card.tsx`): attachments sit in the card's right margin, out of the reading flow. The lead picture is a 120px square crop, with a filmstrip of 36px crops and a `+n` under it. If the post has no pictures, the quote's pictures are used and labelled "In the quote". A video or GIF gets a play mark. The quote and the linked page are one-line strips. Text clamps at 4 lines, with blank lines collapsed. The footer spans the whole card under both columns: up to three topic chips and a `+n` on the left, the actions against the card's right edge. Nothing is hidden: every count is shown, and the post opens to all of it. About 244px a post, against 570px before.
    - On a phone, the date and likes go on their own line under the handle, so a long handle never hides them. The post window shortens the handle first.
  - **Rows** (`post-list-row.tsx`): an inbox on one white sheet per month, with hairline dividers. Each row shows the author line (name, handle, date, and glyphs for photos, quote and link) and two lines of text. Under that sit up to three topic chips and the four actions. A 72px thumbnail goes on the right. Month headings with counts pin under the tool row as one frosted band with it. There are no headings under Most liked or during an Ask, since those aren't in date order. About 122px a post.
    - On a phone, a row leaves out the @handle so the name shows whole, unless the search matched the handle. The photo, quote and link marks show as icons only, and clip cleanly when there is no room.
  - **Post window** (`post-dialog.tsx`): pictures show full width. A video or GIF shows its thumbnail with a play button; pressing it fetches the stream from X and plays it in place with native controls. GIFs loop muted, and with reduced motion on they wait for you to press play. If X sends nothing, the thumbnail offers Open on X instead. Previous and next sit beside Close, and on a phone they move to the left of the footer so the author's name keeps its room. A trailing address that the link card below already names is left out of the text, as on cards. A quote carries a pill in its corner: Open post when you saved the quoted post too, which stacks it on top like More like this, or Open on X when you didn't. In a quote, the author's name (in their hue) and any @handle of an author you saved show that author's posts, as they do in the post. A reply says so above its text, with the same pill to the post it answers. Above More like this, Quoted by lists the saved posts that quote this one, and opens them the same way.
  - **Editing in a filtered view:** a post whose topics you change stays in the list, in its usual place, even once it no longer matches (say, it leaves Unfiled). It goes when you change the filter, search or sort, so you can add several topics without the post or its popover vanishing.
  - **Remove and Undo:** after Remove, focus moves to the next post, or the one before at the end. Undo puts focus back on the restored post. In the Removed window, Restore moves focus to the next row. Removing from the post window closes it on the post, never on "This post is no longer saved".
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
  - Starting an Ask brings the answer card forward. Clearing the Ask sends it back. A Find topic never moves the cards. The peeking edge, Ask in the filters header and Filters in the answer header swap by hand without ending the Ask. While the answer card is behind, Answer in the filters header carries the update notice's dot on its icon: it pulses while the Ask judges and Claude writes, then stays until the answer card has been in front. On a card narrower than 17rem the button drops its label and keeps the icon.
  - Before any Ask the answer card is a place to start one: a heading, two lines on what happens, and a question field.
  - **The answer takes the shape the question asks for.** Decided 2026-11-22 in `/proto/ask-format`, round 2 (Shaped, plain). Jev reads the question and picks one of four shapes; anything else, or a guess under 50%, is Explain:
    - **Find** ("prompts to clean up a codebase"): a shortlist of the actual items, best first. Each has a name, one line on what it is for, the item itself copied word for word in a quote block with a Copy button, and its source chips. A quote that runs to the end of a trimmed post says "This is only the start" and links to the post. A line names what the posts do not cover.
    - **Explain** ("what do people think about X"): the bottom line, then 2 to 5 themes with sources, then a "Where they disagree" panel when they do.
    - **Compare** ("X vs Y"): the verdict, then one card per option with what it is best for, + strengths and − weaknesses, then "How to choose".
    - **How-to** ("how do I set up X"): the approach, numbered steps with sources, then a "Watch out for" panel. Only steps are numbered, because only steps have an order.
  - Claude writes in plain style: one idea per sentence, active voice, plain words, no dashes or semicolons, and the posts' own certainty and numbers. Quotes are exempt and stay character for character. The route drops any quote its cited post does not contain.
  - The answer streams in, lead first, then each section as it arrives, with source chips that carry the author's avatar and handle. When a section cites two posts by one author, their chips add the day each was posted. Placeholder lines hold the space until the first words arrive. A source chip scrolls the list to that post and marks it, or opens the post when the list does not show it.
  - Under the last answer, "Ask next" offers 2 or 3 follow-up questions as chips. Pressing one asks it.
  - The footer names the model and effort and what was read: "Written by Opus 5.5 · medium effort from the 417 strongest of 511 matches (144 confident)."
  - Claude reads every match it can: confident matches first, then possible ones, strongest first, up to 400,000 characters, with up to 8,000 characters of each post. The Answers tab in Settings picks the model (Opus 5.5 by default, Sonnet 5.5, Haiku 5.5, Fable 5.2) and the effort (medium by default). Higher effort waits longer before giving up: up to 15 minutes at Max.
  - A follow-up field sits at the foot of the card. A follow-up's question scrolls to the top of the card, with room below it for the answer to stream into. New chat, in the header, clears the conversation and leaves the card in front.
  - Under 1,024px the sidebar is a sheet, and the same deck is inside it. The Ask panel gets an Answer button that opens the sheet. A source chip there closes the sheet first, then scrolls to the post.
  - A post a source chip points at is marked: a 2px primary ring on a card (`shadow-cited`), a primary bar and soft fill on a row.
  - The answer never shares the main column with the results.
- **Settings window** (`components/settings-dialog.tsx`), decided 2026-11-22 in `/proto/settings` (Window). The Settings page was growing fast. Settings is now a dialog over the app, not a route, opened from the Settings row in the sidebar footer, in the sheet too.
  - Section tabs sit down the left: Categories, X, Answers, Jev key, Status. The selected section shows on the right with its heading and one line on what it does. A rose dot on a tab marks a section that needs attention (X not connected, no Jev key, background sync stopped or the Claude skill not linked).
  - Under 640px the tabs become a row along the top that scrolls sideways.
  - Panels stay mounted, so a draft survives a switch to another tab. The window reads the settings fresh each time it opens, because saves don't refresh the page and Status changes outside the app.
  - Each section keeps its own save: Categories and Jev key have a Save or Replace key button. Model and effort save as soon as they change.
  - The Settings row in the sidebar footer carries the same rose dot when any tab needs attention. A tab holding a draft you haven't saved (a changed focus, a typed Jev key) carries an orange dot until you save it or empty it. Closing the window still discards the draft.
  - ⌘, (Ctrl+, elsewhere) opens Settings when no other window is open. ⌘↵ in Categories saves the focus, as Save would.
  - In an answer's footer, the model name ("Opus 5.5 · medium effort") opens Settings on the Answers tab.
  - Status rows that need `bun run setup` have a Copy command button, with the update notice's copy behaviour. When the Claude skill links to another copy of Magpie, the row names that copy's folder.
  - The copy follows the plain style (rewritten with ste80-humanizer): one idea per sentence, an actor in every sentence, "your Claude plan" as the one term for plan use.
- **Controls:** pills (`--ui-radius: 999px`). Inner surfaces use `rounded-inner` (10px), and avatars use `rounded-avatar` (12px).
- **Toasts:** a pill sized to its text, at most the screen width less 2rem. A long message wraps inside it.
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
  - Sidebar sections fold open or shut over 200ms ease-out when you press their heading. On load they start as you left them, without folding: the closed ones are also kept in the `magpie-sidebar-closed` cookie, so the server renders them closed.
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

Sync progress round (2026-11-24, in place in the real sidebar, driven by the debug flags): **Steps** ✅ was chosen for the first sync, and the main card got the same step list. No reason was given for passing on the others. The costs below were seen in the prototype and are not the user's reasons.
- **Current:** one line, "Syncing now" over the stage. No sense of progress or what is left.
- **Meter:** "Step 3 of 4" with a segmented bar. It sits on "4 of 4" for most of a first sync.
- **Story:** a sentence that grows with what is done, steps behind a toggle. Four or five lines in the footer.

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

Header round 2 (2026-11-22, `/proto/header`, on the real screen with a fake Jev run): **Flat** ✅, then its run line reworded to **Meaning**, given a Clear and the topic overlap. The user's complaint: the header and Topic search "feel bloated, disjointed… the containers and actions feel bloated". A critique scored it 24/40: one Topic search shown in three places, the query and ✕ twice, five orange fills, a card styled as a post. The user's reasons are quoted; the other costs were measured in the prototype.
- **Current:** the Topic search card pushed the first post from 146 to 281px (433 on a phone).
- **Bar:** field and tools in one white bar, the run inside it. The list never moved, but the query had less room to type.
- **Headline:** the query became the page title. It showed the query twice and made the idle header taller.
- Flat's run line was then tried In field, In count (Pin scrolled away when pinned), As chip, and as a Quiet line. The quiet line was kept for "the minimalism". Its "Topic search · read all 2,308" label was dropped: "I don't understand the topic search text". Of About, Keep? and Bare, Meaning was kept.
- No Clear came first; the user found "no way to clear" once the field was empty.

Ask format round (2026-11-22, `/proto/ask-format`, four real questions answered by Claude from the same posts): **Shaped** ✅, then **Shaped, plain** ✅ in round 2. The user had to "do a lot of digging to find what I wanted once the result appeared": the answer described prompts instead of handing them over.
- **Points:** the old lead and 3 to 6 numbered points for every question. A comparison and a how-to came back as the same short list.
- **Points+:** Points with the new instructions (today's date, ranked posts, looser word limits, follow-ups). Kept as the control, so a win could be told apart from better instructions. It still had nowhere to put a verdict or a quote.
- **Prose:** Claude picks the shape, in light markdown with citations inline. The most natural to read, but the least predictable layout, and inline avatars made small tap targets.
- Round 2: Shaped against Shaped with the plain-style rules in the prompt. The rules cut the STE checker's findings from 31 to 16 over the four answers and kept every quote word for word. A second rewrite pass was rejected: it doubles the wait, breaks streaming and puts quotes at risk.

Search intents round (2026-11-22, `/proto/search-intents`, on the real screen): **Two homes** ✅. The main field owns keyword, Find topic and Pin; the sidebar owns Ask. The user wanted the three intents explicit: "a keyword match", "querying for new topic matches (with an ability to pin that topic if it looks useful)", and "starting a chat session in the sidebar". Before this round, ⌘↵ in the main field ran Jev and Claude together, so pinning a topic also started a chat nobody asked for. No reason was given for passing on the others. The costs below were seen in the prototype.
- **Current:** one ⌘↵ for both Find and Ask, with Pin beside the chat's sources.
- **Verbs:** Find topic (⌘↵) and Ask (⇧⌘↵) both in the main field. Two actions squeezed the field, so they folded to icons at normal widths.
- **Ladder:** keyword only in the field, then a three-step strip under it: Words (free), Meaning (Jev, then Pin), Answer (Claude from the same matches). The strip showed on every keyword search and pushed the list about 130px down.
- Cost kept with Two homes: an Ask from the sidebar runs its own Jev pass, so it cannot reuse a Find that is already open.

Settings round (2026-11-22, `/proto/settings`, on the real screen): **Window** ✅. The user's reason for the round: "the setting page is growing quickly". They also asked for one direction that keeps settings in the left sidebar. No reason was given for passing on the others. The costs below were seen in the prototype.
- **Page:** the `/settings` route as it was. It takes you off the posts, and each new section makes one long scroll with no navigation.
- **Deck card:** settings as a third sidebar card, which shuffles forward from the footer row. It opens as a list of sections with one-line summaries, and each section opens inside the card. It was tight at the 220px minimum width (effort became a dropdown), and it hid the answer card while open.
- **In place:** no settings area at all. Focus opened from a button on the Categories header, model and effort from a chip in the answer card header, and the Jev key and status from a footer row. There was no single place to look things over, and every new setting needed a home of its own.

Grove (2026-11-19) beat Citrus, Lagoon, Riso, Spectrum, Ultraviolet, Tidepool and Sunset in two `/proto/style` rounds, then gave way to Murmur when the app was renamed Magpie.
