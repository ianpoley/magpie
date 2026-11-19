# x-corpus design system: Grove

Decided 2026-11-19 from two rounds of `/proto/style` (prototype deleted after the decision).
Tokens live in `src/app/globals.css` (`@theme`); the author hue family lives in `src/lib/author-hues.ts`.

## Direction

Cohesive, bright, lively, still professional. A multi-hue system where **color carries meaning**:

- **Emerald primary** (H 160), used for actions, the selected state and focus of attention.
- **Collections get their own hues:** bookmarks are **indigo** (H 275) and likes are **coral** (H 25). They show up in chips and counts.
- **Every author gets one of 8 matched hues** (`authorHue(handle)`). It tints their avatar background and ring and colors their name, so you learn to spot repeat authors.
- **Neutrals are tinted toward the brand hue** (H 165), so they never look like flat grey.

## Rules

- **Color math:** every color is OKLCH. Each role keeps one hue. Chroma is a *fraction of that hue's sRGB ceiling*, not a shared absolute value. Every text/background pair is ≥ 4.5:1 WCAG, and so is every sidebar gradient stop against its text.
- **Sidebar:** a forest → teal gradient (`bg-side`), interpolated in OKLCH, with a soft glow at the bottom. Text on it is `side-ink`, or `side-muted` for counts and labels. The active item is a white 16% wash.
- **Top of main:** a faint double radial wash (`bg-wash`) behind the page title. It's a background, never an overlay on content.
- **Primary fills:** a vertical gradient `primary-top` → `primary` with a tinted glow (`shadow-primary`). Solid UI SDK buttons and the segmented-control indicator get this automatically. Hover darkens via `color-mix(… 90%, black)`.
- **Cards:** white `surface` on the tinted `canvas`, using `rounded-card` (16px) and `shadow-card`. On hover, `shadow-card-hover` adds a primary-tinted lift. Nothing is bordered for depth.
- **Tinted tiles** (empty states): washed with their role's soft color (`linear-gradient(135deg, role-soft, surface 78%)`), with a solid gradient icon chip. The stat-tile row from the prototype was removed once the screen was built.
- **Controls:** pills (`--ui-radius: 999px`). Inner surfaces such as quotes and images use `rounded-inner` (10px); avatars use `rounded-avatar` (12px).
- **Type:** Hanken Grotesk only.
  - Display headings: 800 weight, −0.035em tracking, `text-wrap: balance`.
  - Eyebrow labels: 11px uppercase, +0.08em, 600 weight, in `ink-muted`.
  - Body: 15px at 1.55 line height, capped at 65ch.
  - Live numbers use `tabular-nums`.
- **Search hits:** `mark` uses the lime `--color-mark`.
- **Images:** a 1px inset outline, black at 10%.
- **Motion:** 150ms ease-out on color and shadow only. Presses scale to 0.96. Hover effects are gated behind `(hover: hover) and (pointer: fine)`.

## Known gaps

- **Dark mode:** not designed yet. Derive it by remapping these roles (inverting L), not by picking new colors. Until then `color-scheme: light`.
- **Success states:** need a hue other than emerald, so "it worked" doesn't read as "primary action". Teal-cyan (H ~195) or the indigo would work.
- **Wide-gamut screens:** P3 has headroom for the primary and the collection colors (+20–30% chroma), but nothing uses it yet. Layer it behind `@media (color-gamut: p3)` when wanted.

## Rejected

Round 1 (four directions):
- **Citrus:** warm tangerine and raspberry, soft cards, Bricolage Grotesque. Friendly, but read as casual.
- **Lagoon:** cool blue and aqua, flat hairline rows, IBM Plex plus mono. Crisp, but the least memorable.
- **Riso:** editorial spot inks on paper, ink outlines, Instrument Serif. Distinctive, but too opinionated for dense data.
- **Spectrum** (chosen to riff on): violet sidebar plus author hue coding. Liked the system, wanted it pushed harder.

Round 2 (Spectrum pushed with gradients, tinted tiles, gradient fills and vivid rings):
- **Spectrum** (original): too flat once compared with the pushed versions.
- **Ultraviolet:** indigo → magenta. Too close to the generic "AI product purple".
- **Tidepool:** navy → teal, cobalt primary. Professional, but the coral/violet chips lacked punch.
- **Sunset:** plum → orange, rose primary. The boldest, but the saturated aqua bookmark tint risked fatigue.
- **Grove** ✅: fresh and distinct from purple SaaS apps. Indigo and coral collections contrast clearly with emerald.
