import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { BackendName } from '../secrets/store.ts';
import { isRecord } from '../util.ts';

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

export function updateJson(path: string, change: (current: Record<string, unknown>) => Record<string, unknown>): void {
  writeJson(path, change(readJsonObject(path)));
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

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

export const needsReconnect = (connection: XConnection | null): boolean =>
  connection?.rejection !== undefined && connection.rejection.generation === connection.connectedAt;

export type SyncRequest = { createdAt: string };

export function writeSyncRequest(path: string, now: Date = new Date()): void {
  writeJson(path, { createdAt: now.toISOString() });
}

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

export type AttemptResult = 'ok' | 'failed' | 'transient' | 'rejected' | 'not_connected';

export type LastAttempt = {
  trigger: 'request' | 'schedule';
  startedAt: string;
  finishedAt: string;
  result: AttemptResult;
  runId: number | null;
  message: string | null;
};

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

export type ScheduleStatus = 'scheduled' | 'backoff' | 'paused' | 'not_connected';

export type WorkerStatus = {
  pid: number;
  heartbeatAt: string;
  state: 'idle' | 'running';
  schedule: ScheduleStatus;
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
