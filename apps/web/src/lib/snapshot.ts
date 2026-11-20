import { existsSync } from "node:fs";

import { connection } from "next/server";

import { engineConfig, engineStore } from "./engine.ts";
import { errorName } from "./error-name.ts";
import { emptySnapshot, readSnapshot } from "./read-snapshot.ts";
import { readSyncState } from "./sync-state.ts";
import type { Snapshot, SyncState } from "./types.ts";

/**
 * The corpus as it is in the store right now. Render the caller inside a
 * Suspense boundary: the store is read on every request, never at build time.
 * A store that does not exist yet gives an empty snapshot and is not created,
 * and so does one that exists but cannot be opened yet, as during the first
 * sync.
 */
export async function loadSnapshot(): Promise<Snapshot> {
  // node:sqlite is synchronous, so without this the read would be prerendered.
  await connection();
  const [{ openStore }, { paths }] = await Promise.all([engineStore(), engineConfig()]);
  const { store } = paths();
  if (!existsSync(store)) return emptySnapshot(false);
  let db: ReturnType<typeof openStore>;
  try {
    db = openStore(store, { readOnly: true });
  } catch (error) {
    console.error("snapshot: the store could not be opened:", errorName(error));
    return emptySnapshot(false);
  }
  try {
    return readSnapshot(db);
  } finally {
    db.close();
  }
}

/**
 * Takes the last run from `snapshot` when it read the store; a store that is
 * missing or could not be opened is checked here, as the status route does.
 */
export async function loadSyncState(snapshot: Snapshot): Promise<SyncState> {
  await connection();
  if (!snapshot.storeExists) return readSyncState();
  const { storeExists, lastRun, lastCompleteRunAt } = snapshot;
  return readSyncState({ storeExists, lastRun, lastCompleteRunAt });
}
