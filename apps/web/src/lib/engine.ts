/**
 * The engine is loaded by node when the server runs, not bundled: its modules
 * are TypeScript that node runs directly, and they find the repo root from
 * their own location on disk, which a bundled copy would lose.
 */

export const engineStore = () => import(/* turbopackIgnore: true */ "@magpie/engine/src/store/db.ts");
export const engineEdits = () => import(/* turbopackIgnore: true */ "@magpie/engine/src/store/edits.ts");
export const engineConfig = () => import(/* turbopackIgnore: true */ "@magpie/engine/src/config.ts");
export const engineJev = () => import(/* turbopackIgnore: true */ "@magpie/engine/src/jev/client.ts");
export const engineQuestions = () => import(/* turbopackIgnore: true */ "@magpie/engine/src/jev/questions.ts");
export const engineSecrets = () => import(/* turbopackIgnore: true */ "@magpie/engine/src/secrets/store.ts");
export const engineSyncState = () => import(/* turbopackIgnore: true */ "@magpie/engine/src/sync/state.ts");
export const engineLock = () => import(/* turbopackIgnore: true */ "@magpie/engine/src/lock.ts");
export const engineBirdclaw = () => import(/* turbopackIgnore: true */ "@magpie/engine/src/x/birdclaw.ts");
