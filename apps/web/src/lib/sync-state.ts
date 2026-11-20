import { existsSync } from "node:fs";

import { engineConfig, engineLock, engineSecrets, engineStore, engineSyncState } from "./engine.ts";
import { readRuns } from "./read-snapshot.ts";
import type { Run, SyncState } from "./types.ts";

// The engine's run records a secret store that could not be read with this
// at the start of the auth stage's message; nothing typed carries it.
const SESSION_UNREADABLE = "The X session could not be read";

const freshWithin = (iso: string | null | undefined, maxAgeMs: number, now: number): boolean => {
  const ms = iso ? Date.parse(iso) : Number.NaN;
  return !Number.isNaN(ms) && now - ms < maxAgeMs;
};

function lastRunOf(store: string, openStore: Awaited<ReturnType<typeof engineStore>>["openStore"]) {
  if (!existsSync(store)) return { storeExists: false, lastRun: null, lastCompleteRunAt: null };
  try {
    const db = openStore(store, { readOnly: true });
    try {
      return { storeExists: true, ...readRuns(db) };
    } finally {
      db.close();
    }
  } catch (error) {
    // Mid-way through the first sync the store can exist before it can be read.
    console.error("sync status: the store could not be read:", error instanceof Error ? error.name : "unknown error");
    return { storeExists: true, lastRun: null, lastCompleteRunAt: null };
  }
}

const sessionUnreadable = (run: Run | null): boolean =>
  run?.stages.some((stage) => stage.stage === "x_auth" && stage.outcome === "failed" && stage.message?.startsWith(SESSION_UNREADABLE)) ===
  true;

/**
 * Reads the sync state from the small files the worker and the CLI share,
 * plus the store's last run. Nothing here reads a secret: the backend name
 * comes from its record file.
 */
export async function readSyncState(): Promise<SyncState> {
  const [{ paths, SCHEDULE }, { openStore }, { createSecretStore }, state, { lockHolder }] = await Promise.all([
    engineConfig(),
    engineStore(),
    engineSecrets(),
    engineSyncState(),
    engineLock(),
  ]);
  const files = paths();
  const now = Date.now();
  const connection = state.readConnection(files.xConnection);
  const worker = state.readWorkerStatus(files.workerStatus);
  const workerAlive = freshWithin(worker?.heartbeatAt, SCHEDULE.heartbeatStaleMs, now);
  const request = state.readSyncRequest(files.syncRequest);
  const runs = lastRunOf(files.store, openStore);
  return {
    readAt: now,
    connection: connection === null ? "not_connected" : state.needsReconnect(connection) ? "needs_reconnect" : "connected",
    handle: connection?.handle ?? null,
    secretBackend: createSecretStore().backend(),
    secretStoreLocked: sessionUnreadable(runs.lastRun),
    running: lockHolder(files.lock) !== null,
    requested: freshWithin(request?.createdAt, SCHEDULE.requestTtlMs, now),
    workerAlive,
    nextRunAt: workerAlive && typeof worker?.nextRunAt === "string" ? worker.nextRunAt : null,
    ...runs,
  };
}
