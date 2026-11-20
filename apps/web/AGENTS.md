<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## UI components: use UI SDK

Build UI elements with UI SDK (`@ui-sdk/react` + `@ui-sdk/core`, gallery: https://ui-sdk.dev/sink) whenever a component exists for it. Only hand-roll when UI SDK has no fit.

- Before using it, read `node_modules/@ui-sdk/react/docs/llms.txt`. For a new component, search `node_modules/@ui-sdk/react/docs/core.md` by heading and read `rendering.md` next to it. Per-component docs: `node_modules/@ui-sdk/react/docs/components/`.
- Import each component from its own entry (`import { Dialog, DialogTrigger } from "@ui-sdk/react/dialog"`); there is no root import.
- Components are unstyled; default styles come from `@ui-sdk/core/web.css`, imported in `src/app/globals.css` in `layer(components)` under `@layer ui-sdk`. Style with Tailwind classes.
- ui-sdk modules already ship `"use client"`; your own wrappers that hold state/callbacks need `"use client"` (see `docs/server-rendering.md`).

## Design system: Murmur

Follow `DESIGN.md`. Use the tokens in `src/app/globals.css` (Tailwind utilities like `bg-canvas`, `text-ink-muted`, `bg-bm-soft`, `rounded-card`, `shadow-card`, `bg-side`, `bg-primary-fill`, `bg-wash`, `font-display`) and `authorHue()` from `src/lib/author-hues.ts`. No raw hex or new colors; add a token (in OKLCH, contrast-checked) if one is missing.
