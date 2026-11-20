import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { BackendName } from '../secrets/store.ts';
import { isRecord } from '../util.ts';

/**
 * The small JSON files the worker, the web app and the CLI share. None holds
 * a secret. Every write goes to a private `.tmp` file that is then renamed
 * into place, so a reader never sees half a file. A missing or unreadable
 * file reads as empty, never as an error.
 */

export function readJsonObject(path: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}

/** Reads the object at `path` now, applies `change` and writes the result, so keys others wrote are kept. */
export function updateJson(path: string, change: (current: Record<string, unknown>) => Record<string, unknown>): void {
  writeJson(path, change(readJsonObject(path)));
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

// The X connection record: who is connected and since when. `connectedAt` is
// the connection generation; a rejection counts only for the generation it
// names, so a run that used older cookies can never pause a newer connection.

export type XRejection = { generation: string; at: string; message: string | null };
export type XConnection = { handle: string | null; connectedAt: string; rejection?: XRejection };

export function readConnection(path: string): XConnection | null {
  const record = readJsonObject(path);
  const connectedAt = text(record.connectedAt);
  if (connectedAt === null) return null;
  const connection: XConnection = { handle: text(record.handle), connectedAt };
  const rejection = record.rejection;
  if (isRecord(rejection) && text(rejection.generation) !== null && text(rejection.at) !== null) {
    connection.rejection = { generation: rejection.generation as string, at: rejection.at as string, message: text(rejection.message) };
  }
  return connection;
}

export function writeConnection(path: string, connection: XConnection): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeJson(path, connection);
}

/** True when the record holds a rejection of its own generation: scheduled syncs wait for a reconnect. */
export const needsReconnect = (connection: XConnection | null): boolean =>
  connection?.rejection !== undefined && connection.rejection.generation === connection.connectedAt;

// A sync request: present from a Sync now click (or a new connection) until
// the worker starts the run it asked for.

export type SyncRequest = { createdAt: string };

export function writeSyncRequest(path: string, now: Date = new Date()): void {
  writeJson(path, { createdAt: now.toISOString() });
}

/**
 * The pending request, or null when there is none. A file that cannot be
 * read as a request has an empty `createdAt`, which never counts as fresh.
 */
export function readSyncRequest(path: string): SyncRequest | null {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    value = null;
  }
  return { createdAt: (isRecord(value) && text(value.createdAt)) || '' };
}

export function removeSyncRequest(path: string): void {
  rmSync(path, { force: true });
}

// The scheduler's part of the scheduler state file. The `backfill` key in the
// same file belongs to the sync run and is left alone.

/**
 * How one worker-started run ended:
 *   ok             X answered and both collections synced
 *   failed         the run could not start, or a collection's sync failed
 *   transient      X, the network or the secret store could not answer
 *   rejected       X refused the stored session
 *   not_connected  no X session is stored
 */
export type AttemptResult = 'ok' | 'failed' | 'transient' | 'rejected' | 'not_connected';

export type LastAttempt = {
  trigger: 'request' | 'schedule';
  startedAt: string;
  finishedAt: string;
  result: AttemptResult;
  runId: number | null;
  message: string | null;
};

/** `consecutiveFailures` counts failed and transient attempts since the last one that was not. */
export type SchedulerState = { lastAttempt: LastAttempt | null; consecutiveFailures: number };

const RESULTS: readonly string[] = ['ok', 'failed', 'transient', 'rejected', 'not_connected'];

function parseAttempt(value: unknown): LastAttempt | null {
  if (!isRecord(value)) return null;
  const startedAt = text(value.startedAt);
  const finishedAt = text(value.finishedAt);
  if (startedAt === null || finishedAt === null || !RESULTS.includes(String(value.result))) return null;
  return {
    trigger: value.trigger === 'request' ? 'request' : 'schedule',
    startedAt,
    finishedAt,
    result: value.result as AttemptResult,
    runId: typeof value.runId === 'number' ? value.runId : null,
    message: text(value.message),
  };
}

export function readSchedulerState(path: string): SchedulerState {
  const state = readJsonObject(path);
  const failures = state.consecutiveFailures;
  return {
    lastAttempt: parseAttempt(state.lastAttempt),
    consecutiveFailures: Number.isInteger(failures) && (failures as number) > 0 ? (failures as number) : 0,
  };
}

export function writeSchedulerState(path: string, scheduler: SchedulerState): void {
  updateJson(path, (current) => ({ ...current, ...scheduler }));
}

// The worker's status, rewritten every tick. A heartbeat older than a couple
// of ticks means no worker is running.

/**
 * What the schedule is waiting for:
 *   scheduled      the next interval
 *   backoff        a retry after a failed attempt
 *   paused         X rejected the session; nothing is scheduled until a reconnect
 *   not_connected  X is not connected; nothing is scheduled
 */
export type ScheduleStatus = 'scheduled' | 'backoff' | 'paused' | 'not_connected';

export type WorkerStatus = {
  pid: number;
  heartbeatAt: string;
  /** `running` while any sync holds the run lock, the worker's own or another command's. */
  state: 'idle' | 'running';
  schedule: ScheduleStatus;
  /** The next scheduled run; null while running, paused or not connected. */
  nextRunAt: string | null;
  lastAttempt: LastAttempt | null;
  secretBackend: BackendName | null;
};

export function writeWorkerStatus(path: string, status: WorkerStatus): void {
  writeJson(path, status);
}

export function readWorkerStatus(path: string): WorkerStatus | null {
  const status = readJsonObject(path);
  if (text(status.heartbeatAt) === null) return null;
  return status as WorkerStatus;
}
