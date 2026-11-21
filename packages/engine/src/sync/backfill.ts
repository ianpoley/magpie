import { X_SYNC } from '../config.ts';
import { isRecord } from '../util.ts';
import type { Collection, SyncMode } from '../x/birdclaw.ts';
import { readJsonObject, updateJson } from './state.ts';

type BackfillEntry = { completedAt?: string; failedAt?: string };

function entryOf(state: Record<string, unknown>, collection: Collection): BackfillEntry {
  const backfill = state.backfill;
  const entry = isRecord(backfill) ? backfill[collection] : undefined;
  return isRecord(entry) ? (entry as BackfillEntry) : {};
}

export function backfillMode(path: string, collection: Collection, now: Date): SyncMode {
  const entry = entryOf(readJsonObject(path), collection);
  if (entry.completedAt) return 'incremental';
  const failedAt = entry.failedAt ? Date.parse(entry.failedAt) : Number.NaN;
  return now.getTime() - failedAt < X_SYNC.backfillRetryMs ? 'incremental' : 'backfill';
}

export function recordBackfill(path: string, collection: Collection, outcome: 'completed' | 'failed', now: Date): void {
  const at = now.toISOString();
  const entry: BackfillEntry = outcome === 'completed' ? { completedAt: at } : { failedAt: at };
  updateJson(path, (state) => ({
    ...state,
    backfill: { ...(isRecord(state.backfill) ? state.backfill : {}), [collection]: entry },
  }));
}
