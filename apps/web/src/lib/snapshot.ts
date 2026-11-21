import { existsSync } from "node:fs";

import { connection } from "next/server";

import { engineConfig, engineStore } from "./engine.ts";
import { errorName } from "./error-name.ts";
import { emptySnapshot, readSnapshot } from "./read-snapshot.ts";
import { readSyncState } from "./sync-state.ts";
import type { Snapshot, SyncState } from "./types.ts";

export async function loadSnapshot(): Promise<Snapshot> {
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

export async function loadSyncState(snapshot: Snapshot): Promise<SyncState> {
  await connection();
  if (!snapshot.storeExists) return readSyncState();
  const { storeExists, lastRun, lastCompleteRunAt } = snapshot;
  return readSyncState({ storeExists, lastRun, lastCompleteRunAt });
}
