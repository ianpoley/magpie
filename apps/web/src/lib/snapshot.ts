import { existsSync } from "node:fs";

import { connection } from "next/server";

import { engineConfig, engineStore } from "./engine.ts";
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
    console.error("snapshot: the store could not be opened:", error instanceof Error ? error.name : "unknown error");
    return emptySnapshot(false);
  }
  try {
    return readSnapshot(db);
  } finally {
    db.close();
  }
}

/** The background sync's state, read on every request like the snapshot. Needs no store. */
export async function loadSyncState(): Promise<SyncState> {
  await connection();
  return readSyncState();
}
