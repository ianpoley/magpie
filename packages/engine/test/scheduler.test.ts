import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decide, intervalHours } from '../src/sync/scheduler.ts';
import type { ScheduleInput } from '../src/sync/scheduler.ts';
import type { AttemptResult, LastAttempt, XConnection } from '../src/sync/state.ts';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const NOW = new Date('2026-11-20T12:00:00.000Z');
const GEN = '2026-11-01T09:00:00.000Z';
const NEXT_GEN = '2026-11-20T11:30:00.000Z';

const ago = (ms: number, from: Date = NOW): Date => new Date(from.getTime() - ms);
const later = (ms: number, from: Date = NOW): Date => new Date(from.getTime() + ms);

const connected: XConnection = { handle: 'someone', connectedAt: GEN };
const rejectedFor = (generation: string, connectedAt: string = GEN): XConnection => ({
  handle: 'someone',
  connectedAt,
  rejection: { generation, at: ago(HOUR).toISOString(), message: 'X rejected the cookies' },
});

const attempt = (finishedAt: Date, result: AttemptResult = 'ok'): LastAttempt => ({
  trigger: 'schedule',
  startedAt: ago(MINUTE, finishedAt).toISOString(),
  finishedAt: finishedAt.toISOString(),
  result,
  runId: 1,
  message: null,
});

function input(overrides: Partial<ScheduleInput> = {}): ScheduleInput {
  return {
    now: NOW,
    intervalHours: 3,
    scheduler: { lastAttempt: attempt(ago(HOUR)), consecutiveFailures: 0 },
    connection: connected,
    request: null,
    running: false,
    lastBusyAt: null,
    ...overrides,
  };
}

test('a run that finished 5 hours ago with a 3-hour interval is overdue, so the first tick after start runs', () => {
  const decision = decide(input({ scheduler: { lastAttempt: attempt(ago(5 * HOUR)), consecutiveFailures: 0 } }));
  assert.equal(decision.run, 'schedule');
});

test('a run 1 hour ago and no request: wait, with the next run 2 hours from now', () => {
  const decision = decide(input());
  assert.equal(decision.run, null);
  assert.equal(decision.schedule, 'scheduled');
  assert.deepEqual(decision.nextRunAt, later(2 * HOUR));
});

test('a connection that has never synced runs at once', () => {
  const decision = decide(input({ scheduler: { lastAttempt: null, consecutiveFailures: 0 } }));
  assert.equal(decision.run, 'schedule');
});

test('after a failed attempt the retries come 1, 5, then 15 minutes later, then the normal interval', () => {
  const failedAt = NOW;
  const at = (failures: number, elapsed: number) =>
    decide(
      input({
        now: later(elapsed, failedAt),
        scheduler: { lastAttempt: attempt(failedAt, 'transient'), consecutiveFailures: failures },
      }),
    );

  const first = at(1, 30 * 1000);
  assert.equal(first.run, null);
  assert.equal(first.schedule, 'backoff');
  assert.deepEqual(first.nextRunAt, later(MINUTE, failedAt));
  assert.equal(at(1, 61 * 1000).run, 'schedule');

  assert.equal(at(2, 4 * MINUTE).run, null);
  assert.deepEqual(at(2, 0).nextRunAt, later(5 * MINUTE, failedAt));
  assert.equal(at(2, 5 * MINUTE + 1000).run, 'schedule');

  assert.equal(at(3, 14 * MINUTE).run, null);
  assert.deepEqual(at(3, 0).nextRunAt, later(15 * MINUTE, failedAt));
  assert.equal(at(3, 15 * MINUTE + 1000).run, 'schedule');

  const fourth = at(4, 16 * MINUTE);
  assert.equal(fourth.run, null);
  assert.equal(fourth.schedule, 'scheduled');
  assert.deepEqual(fourth.nextRunAt, later(3 * HOUR, failedAt));
});

test('a rejection of the current connection pauses the schedule, and later due ticks do not run', () => {
  for (const sinceLastRun of [5 * HOUR, 10 * HOUR, 48 * HOUR]) {
    const decision = decide(
      input({
        connection: rejectedFor(GEN),
        scheduler: { lastAttempt: attempt(ago(sinceLastRun), 'rejected'), consecutiveFailures: 0 },
      }),
    );
    assert.equal(decision.run, null);
    assert.equal(decision.schedule, 'paused');
    assert.equal(decision.nextRunAt, null);
  }
});

test('a pause wins over a pending backoff retry', () => {
  const decision = decide(
    input({
      connection: rejectedFor(GEN),
      scheduler: { lastAttempt: attempt(ago(2 * MINUTE), 'transient'), consecutiveFailures: 1 },
    }),
  );
  assert.equal(decision.run, null);
  assert.equal(decision.schedule, 'paused');
});

test('a transient failure backs off and does not pause', () => {
  const decision = decide(
    input({ scheduler: { lastAttempt: attempt(ago(30 * 1000), 'transient'), consecutiveFailures: 1 } }),
  );
  assert.equal(decision.schedule, 'backoff');
  assert.notEqual(decision.nextRunAt, null);
});

test('a rejection recorded for an older generation is ignored after a reconnect', () => {
  const waiting = decide(input({ connection: rejectedFor(GEN, NEXT_GEN) }));
  assert.equal(waiting.schedule, 'scheduled');
  assert.deepEqual(waiting.nextRunAt, later(2 * HOUR));

  const due = decide(
    input({
      connection: rejectedFor(GEN, NEXT_GEN),
      scheduler: { lastAttempt: attempt(ago(4 * HOUR)), consecutiveFailures: 0 },
    }),
  );
  assert.equal(due.run, 'schedule');
});

test('Sync now while paused runs, as a check again', () => {
  const decision = decide(
    input({ connection: rejectedFor(GEN), request: { createdAt: ago(20 * 1000).toISOString() } }),
  );
  assert.equal(decision.run, 'request');
});

test('a fresh request runs now, ahead of the schedule', () => {
  const decision = decide(input({ request: { createdAt: ago(9 * MINUTE).toISOString() } }));
  assert.equal(decision.run, 'request');
  assert.equal(decision.dropRequest, false);
});

test('while a run is in progress a request is left in place and nothing starts', () => {
  const decision = decide(
    input({
      running: true,
      lastBusyAt: NOW,
      request: { createdAt: ago(MINUTE).toISOString() },
      scheduler: { lastAttempt: attempt(ago(5 * HOUR)), consecutiveFailures: 0 },
    }),
  );
  assert.equal(decision.run, null);
  assert.equal(decision.dropRequest, false);
});

test('a request 11 minutes old is dropped without running', () => {
  const decision = decide(input({ request: { createdAt: ago(11 * MINUTE).toISOString() } }));
  assert.equal(decision.run, null);
  assert.equal(decision.dropRequest, true);
});

test('a request that cannot be read is dropped', () => {
  const decision = decide(input({ request: { createdAt: '' } }));
  assert.equal(decision.run, null);
  assert.equal(decision.dropRequest, true);
});

test('a request that waited behind a long run gets its full ten minutes after that run ends', () => {
  const decision = decide(
    input({ request: { createdAt: ago(2 * HOUR).toISOString() }, lastBusyAt: ago(2 * MINUTE) }),
  );
  assert.equal(decision.run, 'request');
});

test('without an X connection nothing is scheduled', () => {
  const decision = decide(input({ connection: null, scheduler: { lastAttempt: null, consecutiveFailures: 0 } }));
  assert.equal(decision.run, null);
  assert.equal(decision.schedule, 'not_connected');
  assert.equal(decision.nextRunAt, null);
});

test('the interval comes from SYNC_INTERVAL_HOURS, and a missing or unusable value means 3 hours', () => {
  assert.equal(intervalHours({ SYNC_INTERVAL_HOURS: '6' }), 6);
  assert.equal(intervalHours({ SYNC_INTERVAL_HOURS: '0.5' }), 0.5);
  for (const settings of [{} as Record<string, string>, { SYNC_INTERVAL_HOURS: '0' }, { SYNC_INTERVAL_HOURS: '-2' }, { SYNC_INTERVAL_HOURS: 'often' }]) {
    assert.equal(intervalHours(settings), 3);
  }

  const decision = decide(
    input({ intervalHours: 6, scheduler: { lastAttempt: attempt(ago(4 * HOUR)), consecutiveFailures: 0 } }),
  );
  assert.equal(decision.run, null);
  assert.deepEqual(decision.nextRunAt, later(2 * HOUR));
});
