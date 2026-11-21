---
title: "Turbopack build fails on a static import of the engine workspace package"
date: 2026-11-19
category: build-errors
module: apps/web
problem_type: build_error
component: tooling
symptoms:
  - "`next build` fails with \"Module not found: Can't resolve '../../..'\" pointing at the engine's config module"
  - "Adding the engine to `serverExternalPackages` changes nothing"
root_cause: wrong_api
resolution_type: code_fix
severity: medium
framework_version: "next 16.4.6"
tags: [turbopack, nextjs, workspace-package, import-meta-url, type-stripping, monorepo]
---

# Turbopack build fails on a static import of the engine workspace package

## Problem

The web app needs the engine's store, edit, config and Jev modules on the server. The engine is a workspace package of raw `.ts` files that node runs directly, and a static import of it from the web app fails the Turbopack build.

## Symptoms

- `next build` stops with `Module not found: Can't resolve '../../..'` (as recorded in this session). The path is the first argument of `new URL('../../..', import.meta.url)` in `paths()` in `packages/engine/src/config.ts`, which is how the engine finds the repo root from its own location on disk.
- Every engine module the web app loads imports `config.ts`, so any static runtime import of the engine reaches it.

## What Didn't Work

- **`transpilePackages`.** The plan named it as the way in (KTD3 in `docs/plans/2026-11-19-1053-feat-corpus-screen-categories-plan.md`). It does not apply: the bundled Next docs say Turbopack already transpiles workspace packages by itself, and transpiling was never the failure. The failure is consistent with the bundler treating `new URL(<relative path>, import.meta.url)` as a file reference to resolve at build time.
- **`serverExternalPackages`.** The plan's risk table named it as the fallback. Per this session's finding it is ignored for a workspace package, so the engine was still bundled and the same error came back.
- **A thin `.mjs` re-export**, the plan's other fallback, was not tried. It would presumably still be bundled, and a bundled copy of the engine no longer sits at the path it derives the repo root from.

## Solution

Load the engine at runtime and keep the bundler away from it. `apps/web/src/lib/engine.ts` exports one loader per engine module:

```ts
export const engineStore = () => import(/* turbopackIgnore: true */ "@magpie/engine/src/store/db.ts");
```

Callers await the loader inside the server function that needs it:

```ts
const [{ openStore }, { paths }] = await Promise.all([engineStore(), engineConfig()]);
```

Type-only imports stay static, because they are erased before bundling:

```ts
import type { JevClient, JevRequest } from "@magpie/engine/src/jev/client.ts";
```

A web module that needs another engine module adds a loader line to `engine.ts`. It does not import the engine itself.

## Why This Works

`turbopackIgnore` leaves the `import()` in the server output as written, so node resolves `@magpie/engine` through the workspace link when the server runs and executes the `.ts` file with its own type stripping. The module then runs from its real location, and `import.meta.url` in `config.ts` points into `packages/engine/src`, so the repo root, and with it the default store path, resolve correctly.

A bundled engine would lose that even if the build passed: `import.meta.url` would likely point into the build output, and the store path would be derived from the wrong directory unless `MAGPIE_ROOT` or `MAGPIE_STORE` were set.

The engine keeps to erasable TypeScript syntax so that launchd's node can run it with no build step. The same property is what lets the web server load it unbundled.

## Prevention

- `apps/web/README.md` states the rule (engine code is loaded only through `apps/web/src/lib/engine.ts`) and the comment at the top of `engine.ts` states the reason. Nothing enforces it before `next build`.
- A lint rule would catch it at edit time. Recommended, not yet added: in `apps/web/eslint.config.mjs`, `@typescript-eslint/no-restricted-imports` with a pattern for `@magpie/engine` and `@magpie/engine/*`, `allowTypeImports: true` (the object form `{ group, allowTypeImports, message }`), and the message "Load engine code through src/lib/engine.ts; a static import breaks the Turbopack build." The rule does not flag `import()`, so the loaders in `engine.ts` pass. The web tests import engine modules and fixtures by relative path and are not matched by the pattern.
- Do not reach for `transpilePackages` or `serverExternalPackages` to remove the loaders. Both were ruled out above.
- If the engine ever stops deriving paths from `import.meta.url`, bundling becomes possible again. Re-test with a static import and `next build` before deleting the loaders.

## Related Issues

- `apps/web/src/lib/snapshot.ts`, `apps/web/src/app/actions.ts` and `apps/web/src/app/api/ask/route.ts` are the callers of the loaders.
- Bundled docs: `apps/web/node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md` (the `turbopackIgnore` comment) and `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/transpilePackages.md`.
