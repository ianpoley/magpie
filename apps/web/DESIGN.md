# Magpie design system: Murmur

Decided 2026-11-20 in `/proto/magpie` (PR #3, deleted when the design shipped), after brand, Murmur-variation and header rounds.
It replaced Grove (emerald, 2026-11-19), whose rejected directions are listed at the end.
Tokens live in `src/app/globals.css` (`@theme`, plus a `:root` block for the pixel magpie's inks). The author hue family lives in `src/lib/author-hues.ts`.

## Direction

A dawn sky with a flock of tiny pixel magpies in it, and **the flock is your result set**. It's a data-heavy tool, so the brand sits around the content and never on top of it:

- **Palette:** a peach → powder-blue wash at the top of main, a dawn-indigo sidebar warmed by a faint sunrise, a **burnt-orange primary** (H 38) and **rose likes** (H 5), so likes never read as the primary. Bookmarks stay **indigo** (H 275).
- **The flock** is a murmuration in each gutter beside the list, with one bird per post on screen (up to 320). Each one flies as a single body that wheels, stretches and folds. Filtering, searching or asking sends birds home or brings them back over about 0.9s. While an ask is judging, they circle the search field. Surprise sends a bird diving, pinning glints a group gold, and removing a post drops one.
- **Pixel art lives in the logo, the flock and illustrations only**, never in UI text. The sidebar mark is a perched magpie with a coin in its bill. It beats its wings on load, when you act, and when the pointer reaches it. Empty states show a few birds circling an empty patch.
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
  - Birds bank inward over a 16 art-px margin before any edge, so the flock turns off edges instead of piling against them.
  - A bird always belongs to the gutter it's in. A pull toward the other gutter would pin it against the column's edge for good, since it may never cross the text. That once showed as a line of birds stacked down the edge.
  - It's a canvas fixed behind main's content column, which sits at `z-index: 1`.
    - Nothing ever moves behind text, except during the Ask swirl.
    - When an Ask ends, the swirl splits at its median, and each half flies out to its own gutter.
    - When the gutters are too narrow (under 28 art px), one flock crosses the column at a lower alpha (0.24 instead of 0.42).
  - Birds are drawn at 2 CSS px per art pixel with `image-rendering: pixelated`.
  - Reactions follow what already happened and never delay or gate an action. They're broadcast through `lib/magpie-events.ts`.
  - With reduced motion on, each flock is drawn still, as one loose body, and the mark and the empty-state birds rest.
- **Page header** (`components/page-header.tsx`):
  - The title row holds the title (30px display), a count line (`N posts · N bookmarked · N liked`, or `N resources` on the Resources view) and the Posts / Resources switch.
  - The tool row under it holds one search field, Time, Sort, the Media toggle and an icon-only Surprise. It pins to the top on scroll over a frosted strip (`shadow-pinned`). Changing a filter while it's pinned jumps back to the top of the results.
  - The eyebrow shows only when it adds something: the collection, the area or the author.
- **Ask is an action on the search field, not a mode.** You start it with the Ask button that appears once you type, or with ⌘↵ (Ctrl ↵). Plain Enter never starts an ask, because each one costs money. Once an ask is open, Enter re-runs it after an edit.
- **Primary fills:** a vertical gradient from `primary-top` to `primary`, with `shadow-primary`. Solid UI SDK buttons and the segmented-control indicator get it automatically.
- **Cards:** white `surface` on `canvas`, with `rounded-card` (16px) and `shadow-card`, which carries a warm sunrise glow underneath. On hover, `shadow-card-hover` adds a primary-tinted lift. Nothing gets a border for depth.
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

Header round (2026-11-20, on Murmur):
- **Current:** eyebrow, a 40px title and a solid Surprise me, then a Search/Ask mode toggle, filters, and a separate view-and-count row. The list started 285px down, the toggle truncated the field, and the count showed three times.
- **Compact:** the chosen layout, but static.
- **Sticky:** the pinned tool row under the big 40px title.
- **Command:** no title, just one bar. Too little brand.
- **Compact + sticky** ✅: the list starts about 145px down.

Grove (2026-11-19) beat Citrus, Lagoon, Riso, Spectrum, Ultraviolet, Tidepool and Sunset in two `/proto/style` rounds, then gave way to Murmur when the app was renamed Magpie.
