import { SCHEDULE } from '../config.ts';
import { needsReconnect } from './state.ts';
import type { ScheduleStatus, SchedulerState, SyncRequest, XConnection } from './state.ts';

/** Everything the schedule depends on, read fresh on every tick. */
export type ScheduleInput = {
  now: Date;
  intervalHours: number;
  scheduler: SchedulerState;
  connection: XConnection | null;
  request: SyncRequest | null;
  /** A run is in progress: this worker's own, or another command's holding the run lock. */
  running: boolean;
  /** The last time a run was seen in progress. A request that waited behind it is fresh for its full time after. */
  lastBusyAt: Date | null;
};

/**
 * run          start a run now, for a request or for the schedule; null to wait
 * dropRequest  the pending request is stale: remove it without running it
 * nextRunAt    the next scheduled run; null while paused or not connected
 */
export type Decision = {
  run: 'request' | 'schedule' | null;
  dropRequest: boolean;
  schedule: ScheduleStatus;
  nextRunAt: Date | null;
};

/** SYNC_INTERVAL_HOURS from the settings file; any missing, non-numeric or non-positive value means the default. */
export function intervalHours(settings: Record<string, string>): number {
  const hours = Number(settings.SYNC_INTERVAL_HOURS);
  return Number.isFinite(hours) && hours > 0 ? hours : SCHEDULE.defaultIntervalHours;
}

/** When the next scheduled run is due, and what it is waiting for. */
function nextRun(input: ScheduleInput): { schedule: ScheduleStatus; nextRunAt: Date | null } {
  if (input.connection === null) return { schedule: 'not_connected', nextRunAt: null };
  if (needsReconnect(input.connection)) return { schedule: 'paused', nextRunAt: null };
  const { lastAttempt, consecutiveFailures } = input.scheduler;
  const finishedAt = lastAttempt ? Date.parse(lastAttempt.finishedAt) : Number.NaN;
  if (Number.isNaN(finishedAt)) return { schedule: 'scheduled', nextRunAt: input.now };
  const backoff = consecutiveFailures > 0 ? SCHEDULE.backoffMs[consecutiveFailures - 1] : undefined;
  if (backoff !== undefined) return { schedule: 'backoff', nextRunAt: new Date(finishedAt + backoff) };
  return { schedule: 'scheduled', nextRunAt: new Date(finishedAt + input.intervalHours * 60 * 60 * 1000) };
}

/**
 * What the worker does on this tick. Nothing starts while a run is in
 * progress, and a pending request then stays for later. Otherwise a fresh
 * request runs whatever the schedule says, which is how Sync now checks a
 * rejected session again. Without one, a run starts once the next scheduled
 * time has passed, so a worker that wakes or starts late catches up at once.
 */
export function decide(input: ScheduleInput): Decision {
  const { schedule, nextRunAt } = nextRun(input);
  if (input.running) return { run: null, dropRequest: false, schedule, nextRunAt };

  if (input.request !== null) {
    // An unreadable time parses to NaN and is never fresh.
    const since = Math.max(Date.parse(input.request.createdAt), input.lastBusyAt?.getTime() ?? 0);
    if (input.now.getTime() - since <= SCHEDULE.requestTtlMs) {
      return { run: 'request', dropRequest: false, schedule, nextRunAt };
    }
  }
  const dropRequest = input.request !== null;
  const due = nextRunAt !== null && input.now.getTime() >= nextRunAt.getTime();
  return { run: due ? 'schedule' : null, dropRequest, schedule, nextRunAt };
}
