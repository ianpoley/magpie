/**
 * The engine is loaded by node when the server runs, not bundled: its modules
 * are TypeScript that node runs directly, and they find the repo root from
 * their own location on disk, which a bundled copy would lose.
 */

export const engineStore = () => import(/* turbopackIgnore: true */ "@x-corpus/engine/src/store/db.ts");
export const engineEdits = () => import(/* turbopackIgnore: true */ "@x-corpus/engine/src/store/edits.ts");
export const engineConfig = () => import(/* turbopackIgnore: true */ "@x-corpus/engine/src/config.ts");
