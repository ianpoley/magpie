import { existsSync } from "node:fs";

import { engineConfig, engineLock, engineSecrets, engineStore, engineSyncState } from "./engine.ts";
import { errorName } from "./error-name.ts";
import { readRuns } from "./read-snapshot.ts";
import type { Run, SyncState } from "./types.ts";

const freshWithin = (iso: string | null | undefined, maxAgeMs: number, now: number): boolean => {
  const ms = iso ? Date.parse(iso) : Number.NaN;
  return !Number.isNaN(ms) && now - ms < maxAgeMs;
};

type Runs = Pick<SyncState, "storeExists" | "lastRun" | "lastCompleteRunAt">;
type SyncFiles = Omit<SyncState, "secretStoreLocked" | keyof Runs>;

function lastRunOf(store: string, openStore: Awaited<ReturnType<typeof engineStore>>["openStore"]): Runs {
  if (!existsSync(store)) return { storeExists: false, lastRun: null, lastCompleteRunAt: null };
  try {
    const db = openStore(store, { readOnly: true });
    try {
      return { storeExists: true, ...readRuns(db) };
    } finally {
      db.close();
    }
  } catch (error) {
    console.error("sync status: the store could not be read:", errorName(error));
    return { storeExists: true, lastRun: null, lastCompleteRunAt: null };
  }
}

const sessionUnreadable = (run: Run | null): boolean =>
  run?.stages.some((stage) => stage.stage === "x_auth" && stage.reason === "secret_store_unreadable") === true;

export async function readSyncFiles(): Promise<SyncFiles> {
  const [{ paths, SCHEDULE }, { createSecretStore }, state, { lockHolder }] = await Promise.all([
    engineConfig(),
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
  return {
    readAt: now,
    connection: connection === null ? "not_connected" : state.needsReconnect(connection) ? "needs_reconnect" : "connected",
    handle: connection?.handle ?? null,
    secretBackend: createSecretStore().backend(),
    running: lockHolder(files.lock) !== null,
    requested: freshWithin(request?.createdAt, SCHEDULE.requestTtlMs, now),
    workerAlive,
    nextRunAt: workerAlive && typeof worker?.nextRunAt === "string" ? worker.nextRunAt : null,
  };
}

export async function readSyncState(runs?: Runs): Promise<SyncState> {
  const [{ paths }, { openStore }] = await Promise.all([engineConfig(), engineStore()]);
  const read = runs ?? lastRunOf(paths().store, openStore);
  const { readAt, connection, handle, secretBackend, running, requested, workerAlive, nextRunAt } = await readSyncFiles();
  return {
    readAt,
    connection,
    handle,
    secretBackend,
    secretStoreLocked: sessionUnreadable(read.lastRun),
    running,
    requested,
    workerAlive,
    nextRunAt,
    ...read,
  };
}

export async function readJevKeyStored(): Promise<boolean> {
  const { createSecretStore } = await engineSecrets();
  const read = await createSecretStore().get("typesafe-api-key");
  return !read.ok || read.value !== null;
}
