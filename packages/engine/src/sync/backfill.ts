import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { X_SYNC } from '../config.ts';
import { isRecord } from '../util.ts';
import type { Collection, SyncMode } from '../x/birdclaw.ts';

/**
 * Which collections have had their full-history sync, kept under `backfill`
 * in the scheduler state file:
 *
 *   { "backfill": { "bookmarks": { "completedAt": "<ISO time>" }, "likes": { "failedAt": "<ISO time>" } }, ... }
 *
 * The file's other keys belong to the scheduler and are kept as they are.
 * A missing or unreadable file means no collection is backfilled yet.
 */
type BackfillEntry = { completedAt?: string; failedAt?: string };

function readState(path: string): Record<string, unknown> {
  try {
    const state: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return isRecord(state) ? state : {};
  } catch {
    return {};
  }
}

function entryOf(state: Record<string, unknown>, collection: Collection): BackfillEntry {
  const backfill = state.backfill;
  const entry = isRecord(backfill) ? backfill[collection] : undefined;
  return isRecord(entry) ? (entry as BackfillEntry) : {};
}

/**
 * How the next sync of `collection` runs: a full-history backfill until one
 * has succeeded, except that after a failed one the next try waits a day and
 * the runs in between sync incrementally.
 */
export function backfillMode(path: string, collection: Collection, now: Date): SyncMode {
  const entry = entryOf(readState(path), collection);
  if (entry.completedAt) return 'incremental';
  const failedAt = entry.failedAt ? Date.parse(entry.failedAt) : Number.NaN;
  return now.getTime() - failedAt < X_SYNC.backfillRetryMs ? 'incremental' : 'backfill';
}

/** Records how a backfill of `collection` ended. Written to a `.tmp` file, then renamed into place. */
export function recordBackfill(path: string, collection: Collection, outcome: 'completed' | 'failed', now: Date): void {
  const state = readState(path);
  const backfill = isRecord(state.backfill) ? state.backfill : {};
  const at = now.toISOString();
  const entry: BackfillEntry = outcome === 'completed' ? { completedAt: at } : { failedAt: at };
  const next = { ...state, backfill: { ...backfill, [collection]: entry } };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(`${path}.tmp`, path);
}
