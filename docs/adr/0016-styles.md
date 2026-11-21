# ADR 0016: Design tokens and styles

- Status: accepted
- Date: 2026-11-21

## Context

Magpie keeps no comments in its code. The decisions below used to be comments next to the code they explain. Each one records something the code cannot say by itself: why it was done this way, a rule from an outside system, or an invariant that must hold. Each entry names the file and the symbol it applies to, and links to where the comment last appeared, at commit `7ec16b3`.

When the code changes, update or remove the entry here in the same commit.

## Decisions

### `apps/web/src/app/globals.css`

#### 0016.1 `Murmur design system header`

Magpie design system — "Murmur". See apps/web/DESIGN.md for the rationale and rules. Every color is OKLCH, and every text/background pair (including each sidebar gradient stop) is ≥ 4.5:1 WCAG. Light only for now; dark mode is to be derived by remapping these roles.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/globals.css#L6-L10)

#### 0016.2 `--color-canvas/ink tokens`

surfaces + ink: a dawn sky, blue-grey ink (H 255) on cool canvas, warm sunken and lines (H 60)

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/globals.css#L22)

#### 0016.3 `--color-primary tokens`

primary: sunrise burnt orange; white on it stays >= 4.5:1 through the gradient

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/globals.css#L30)

#### 0016.4 `--color-bm/--color-like tokens`

collections: bookmarks = indigo, likes = rose (never reads as the orange primary)

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/globals.css#L37)

#### 0016.5 `--color-chip tokens`

topic chips: one warm neutral for every area; "possible" marks an unsure match

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/globals.css#L49)

#### 0016.6 `--color-success tokens`

success: teal-cyan, so "it worked" never reads as the primary action

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/globals.css#L55)

#### 0016.7 `--color-side tokens`

sidebar: dawn indigo into slate (blue hues, never purple), warmed by a faint sunrise at the bottom

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/globals.css#L59)

#### 0016.8 `bird ink :root vars`

```text
---- the pixel magpie's inks ----------------------------------------
Read by the flock's canvas and the SVG sprites, never as utilities, so they sit outside @theme
(which only emits the variables a utility uses).
```

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/globals.css#L172-L174)

#### 0016.9 `.side-scope`

Sidebar: every UI SDK part inside reads its colors from the ink that sits on the gradient.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/globals.css#L245)

#### 0016.10 `.side-scope mark`

The sidebar's light ink would vanish on the highlight.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/globals.css#L324)

#### 0016.11 `.side-scope .truncate > mark`

A name is never cut inside a match: the ellipsis takes the sidebar's light ink, which the highlight would hide. A match that does not fit goes whole.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/globals.css#L328)

#### 0016.12 `.flock-sky`

The sky: fixed over main's box, behind the content column (z-index 1). Low-res and scaled up, so every bird is crisp pixels.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/globals.css#L348)

#### 0016.13 `.orbit-face`

Facing: the sprite faces right; the bird flies left along the bottom of its orbit and right along the top.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/globals.css#L413)

#### 0016.14 `.pinned-row`

The tool row picks up a frosted sky once it is pinned to the top, so the list reads clearly as it slides under.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/globals.css#L423)

#### 0016.15 `.post-li motion`

```text
---- post list motion (components/post-list.tsx) ---------------------
Removing a post fades it out, then closes its gap. Undo opens the gap, then
fades it back. A match an Ask finds while you watch rises in. Nothing else
in the list moves: typing, filtering, sorting and j/k stay instant.
```

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/app/globals.css#L435-L438)

### `apps/web/src/components/category-menu.tsx`

#### 0016.16 `CategoryMenuTrigger`

On the selected row's wash the muted ink falls under 4.5:1, as it does for the count.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/category-menu.tsx#L67)

### `apps/web/src/components/category-tree.tsx`

#### 0016.17 `COUNT`

On the selected row's wash the muted ink falls under 4.5:1, so the count takes the full ink there.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/category-tree.tsx#L25)

### `apps/web/src/components/styles.ts`

#### 0016.18 `pageColors`

Popups mounted inside the sidebar read the page's colors, not the ink that sits on the gradient.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/components/styles.ts#L20)

### `apps/web/src/lib/author-hues.ts`

#### 0016.19 `AUTHOR_HUES`

Author hue family: 8 hues at equal lightness, each at the same fraction of its own sRGB chroma ceiling (bg 80%, fg/ring 90%), so they read as equally vivid. fg on bg ≥ 4.5:1. Use: tint an author's avatar background (bg), their name (fg), and the avatar ring (ring).

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/author-hues.ts#L1-L3)
