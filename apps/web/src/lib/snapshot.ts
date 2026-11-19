import { existsSync } from "node:fs";

import { connection } from "next/server";

import { engineConfig, engineStore } from "./engine.ts";
import { emptySnapshot, readSnapshot } from "./read-snapshot.ts";
import type { Snapshot } from "./types.ts";

/**
 * The corpus as it is in the store right now. Render the caller inside a
 * Suspense boundary: the store is read on every request, never at build time.
 * A store that does not exist yet gives an empty snapshot and is not created.
 */
export async function loadSnapshot(): Promise<Snapshot> {
  // node:sqlite is synchronous, so without this the read would be prerendered.
  await connection();
  const [{ openStore }, { paths }] = await Promise.all([engineStore(), engineConfig()]);
  const { store } = paths();
  if (!existsSync(store)) return emptySnapshot(false);
  const db = openStore(store, { readOnly: true });
  try {
    return readSnapshot(db);
  } finally {
    db.close();
  }
}
