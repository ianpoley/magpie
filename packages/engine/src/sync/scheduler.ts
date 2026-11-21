import { SCHEDULE } from '../config.ts';
import { needsReconnect } from './state.ts';
import type { ScheduleStatus, SchedulerState, SyncRequest, XConnection } from './state.ts';

export type ScheduleInput = {
  now: Date;
  intervalHours: number;
  scheduler: SchedulerState;
  connection: XConnection | null;
  request: SyncRequest | null;
  running: boolean;
  lastBusyAt: Date | null;
};

export type Decision = {
  run: 'request' | 'schedule' | null;
  dropRequest: boolean;
  schedule: ScheduleStatus;
  nextRunAt: Date | null;
};

export function intervalHours(settings: Record<string, string>): number {
  const hours = Number(settings.SYNC_INTERVAL_HOURS);
  return Number.isFinite(hours) && hours > 0 ? hours : SCHEDULE.defaultIntervalHours;
}

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

export function decide(input: ScheduleInput): Decision {
  const { schedule, nextRunAt } = nextRun(input);
  if (input.running) return { run: null, dropRequest: false, schedule, nextRunAt };

  if (input.request !== null) {
    const since = Math.max(Date.parse(input.request.createdAt), input.lastBusyAt?.getTime() ?? 0);
    if (input.now.getTime() - since <= SCHEDULE.requestTtlMs) {
      return { run: 'request', dropRequest: false, schedule, nextRunAt };
    }
  }
  const dropRequest = input.request !== null;
  const due = nextRunAt !== null && input.now.getTime() >= nextRunAt.getTime();
  return { run: due ? 'schedule' : null, dropRequest, schedule, nextRunAt };
}
