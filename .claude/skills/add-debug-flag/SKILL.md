---
name: add-debug-flag
description: Add a debug flag to a Magpie page so a developer can force a hard-to-reach UI state (a sync stage, an empty corpus, a failed update, a setup step, a variant) from a deep-linkable querystring without touching real data. Use whenever someone wants to fake, force, preview, mock or deep-link a UI state, add a `?flag` toggle, expose a state in the bottom-right debug flags dialog, or wire a local-dev testing affordance into a component, even if they don't say "debug flag".
---

# Add a debug flag

Magpie's debug flags (ported from SteelEngine) let a developer put a page into a specific UI state by visiting a querystring such as `?sync=first-sync`, `?posts=none` or `?key-file`. Flags are declared per page, appear in the bottom-right debug flags dialog on pages that register them, and do nothing outside `next dev`. Read `docs/adr/0015-web-ui.md` entries 0015.121 to 0015.125 for why it works this way.

The goal is near-zero clutter: one declaration, plus one substitution that feeds a value the component already renders from. Do not add `if (flag) return <Fake />` branches.

## Where things live

| Piece | File | Use from |
| --- | --- | --- |
| `defineDebugFlags`, `debugFlagsEnabled` | `apps/web/src/lib/debug-flags/define.ts` | flag-set modules |
| Parse contract | `apps/web/src/lib/debug-flags/parse.ts` | the readers only |
| `getDebugFlag`, `isDebugFlagActive`, `getDebugFlagValue` | `apps/web/src/lib/debug-flags/server.ts` | server components (`page.tsx`) |
| `useDebugFlag`, `useDebugFlagActive`, `useDebugFlagValue`, `useDebugFlagQuery`, `useRegisterDebugFlags`, `RegisterDebugFlags` | `apps/web/src/components/debug-flags/client.ts` | client components |
| Registry, launcher, provider | `apps/web/src/components/debug-flags/` | already mounted in `app/layout.tsx` |

Existing sets: `components/home-debug-flags.ts` (setup step, saved posts, sync state, sync stage, cookies in a file) and `components/update-debug-flags.ts` (update notice). Extend one of these when the state belongs to it.

## Steps

### 1. Declare the set at module scope

Create or extend a `*-debug-flags.ts` beside the component. It must be a plain `.ts` module with relative `.ts` imports (no `@/`, no `"use client"`), so server pages, client components and `node --test` can all import it. Define the set at module scope: registration keys off the set's identity.

```ts
import { defineDebugFlags } from "../lib/debug-flags/define.ts";

const ROLES = ["viewer", "editor"] as const;

export const widgetDebugFlags = defineDebugFlags("widgets", {
  emptyWidgets: { label: "Empty widget list", description: "Render the list with no widgets." },
  widgetRole: { label: "View as role", description: "Render the toolbar as this role.", control: { type: "enum", options: ROLES } },
});

export type WidgetRole = (typeof ROLES)[number] | "default";
```

- The property name is the accessor; the querystring key is its kebab case (`emptyWidgets` → `?empty-widgets`). Pass `key` only to override it.
- No `control` means a boolean that is on when the key is present.
- `{ type: "number", min, max, step }` parses, snaps and clamps. `{ type: "enum", options }` accepts only its options. `{ type: "text" }` passes the value through.
- Keep options in a named `as const` tuple, so a type like `WidgetRole` can be derived from it.
- Keys must not collide with the filter keys in `lib/filter-url.ts`: `collection`, `topics`, `areas`, `unfiled`, `author`, `q`, `time`, `sort`, `media`, `view`.
- Every flag needs a `label` and a `description`; the dialog shows both.

### 2. Register the set

- Client component: call `useRegisterDebugFlags(widgetDebugFlags)` with its other hooks.
- Server component: render `<RegisterDebugFlags flags={widgetDebugFlags} />` beside the output. When a page has several branches (like `page.tsx` choosing `SetupGate` or `CorpusScreen`), register in each one, so the flag can be turned off from any of them.

### 3. Substitute into an existing render path

Find the value that drives the state and replace it. Use `"default"` as the fallback for an enum, so "no override" is distinct from every option.

```ts
const fakeRole = useDebugFlagValue(widgetDebugFlags.widgetRole, "default");
const widgets = useDebugFlag(widgetDebugFlags.emptyWidgets, realWidgets, NO_WIDGETS);
const role = fakeRole === "default" ? realRole : fakeRole;
```

On the server, read the awaited `searchParams` the same way:

```ts
const step = getDebugFlagValue(values, homeDebugFlags.setup, "default");
```

Put any fake-value builder (like `debugSyncState`, `debugSnapshot`, `debugUpdate`) in the flag-set module, as a pure function of the real value and the flag values. If a builder creates objects, wrap the call in `useMemo` so the fake keeps its identity across renders and effects that depend on it don't re-run.

### 4. Keep the flags in a rewritten address

`CorpusScreen` rebuilds the whole querystring when the filter changes. It keeps flags by appending `useDebugFlagQuery(DEBUG_FLAG_SETS)`. If you add a set on the home page, add it to `DEBUG_FLAG_SETS` in `components/corpus-screen.tsx`. Any other component that writes the address must do the same.

## Worked example: the sync state

`homeDebugFlags.sync` is an enum, not a boolean, because the panel's real state depends on the connection, the worker, the lock and the last run; a tester needs to name the state they want. `CorpusScreen` substitutes the sync controller's state:

```ts
const { state: liveSyncState, update: updateSync } = useSyncStatus(initialSync);
const fakeSync = useDebugFlagValue(homeDebugFlags.sync, "default");
const fakeStage = useDebugFlagValue(homeDebugFlags.syncStage, "default");
const fakeKeyFile = useDebugFlagActive(homeDebugFlags.keyFile);
const sync = useMemo(
  () => ({ state: debugSyncState(liveSyncState, fakeSync, fakeStage, fakeKeyFile), update: updateSync }),
  [liveSyncState, updateSync, fakeSync, fakeStage, fakeKeyFile],
);
```

Everything that reads `sync.state` (the sidebar panel, the settings and Connect X dialogs, the empty state) now shows the faked state, and the real polling keeps running.

Rule of thumb: when the real state has several inputs, use an enum that names each target state over a boolean that only inverts the default.

## Rules that apply here

- A flag fakes what the page reads, not what it writes. Buttons and forms on a faked screen still run their real actions (Sync now, Connect X, saving the Jev key). Say so in the flag's description when the faked screen offers an action that changes real data.
- No code comments (`bun run lint:comments`). Put a decision the code cannot state in `docs/adr/0015-web-ui.md`.
- Test a fake builder only if its cccc cognitive score is above 5 (see `CLAUDE.md`); `debugSyncState` is tested in `apps/web/test/debug-flags.test.ts` against `describeSync`.
- Use UI SDK components and Murmur tokens if you touch the launcher.

## Checklist

- [ ] Set declared with `defineDebugFlags` at module scope, in a `.ts` module with relative `.ts` imports.
- [ ] Every flag has a `label` and a `description`; keys don't collide with filter keys.
- [ ] Set registered on every branch of the page that can show the state.
- [ ] Value substituted into an existing render path, memoized if the fake is an object.
- [ ] Set added to `DEBUG_FLAG_SETS` if the page rewrites its address.
- [ ] Checked in `bun run dev`: the flag appears in the bottom-right dialog, toggles the state, and survives a filter change.
