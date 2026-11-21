import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';

import { paths } from '../src/config.ts';
import type { Paths } from '../src/config.ts';
import { createSecretStore } from '../src/secrets/store.ts';
import type { SyncRunResult, XAuth } from '../src/sync/run.ts';
import { readConnection, readSchedulerState, readWorkerStatus, writeConnection, writeSyncRequest } from '../src/sync/state.ts';
import type { LastAttempt, WorkerStatus } from '../src/sync/state.ts';
import { startWorker } from '../src/sync/worker.ts';
import { tempDir } from './fixtures/export.ts';

const LOCK_MODULE = fileURLToPath(new URL('../src/lock.ts', import.meta.url));
const WORKER_BIN = fileURLToPath(new URL('../bin/worker.mjs', import.meta.url));
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const GEN = '2026-11-01T09:00:00.000Z';
const TICK_MS = 20;

const ok: XAuth = { status: 'ok', handle: 'someone', message: null };
const rejected: XAuth = { status: 'rejected', handle: null, message: 'X rejected the cookies: HTTP 401' };
const transient: XAuth = { status: 'transient', handle: null, message: 'bird whoami failed: fetch failed' };

const complete = (auth: XAuth, runId = 1): SyncRunResult => ({
  status: 'complete',
  runId,
  upstreamSync: auth.status === 'ok' ? 'ok' : 'failed',
  stages: [],
  xOk: auth.status === 'ok',
  auth,
});

const attemptAgo = (ms: number): LastAttempt => ({
  trigger: 'schedule',
  startedAt: new Date(Date.now() - ms - MINUTE).toISOString(),
  finishedAt: new Date(Date.now() - ms).toISOString(),
  result: 'ok',
  runId: 1,
  message: null,
});

/** A fake orchestrator: each call takes the next result, or waits for `hold` when one is given. */
function fakeRun(results: (() => Promise<SyncRunResult>)[] | SyncRunResult) {
  let calls = 0;
  const run = async () => {
    const next = Array.isArray(results) ? results[Math.min(calls, results.length - 1)] : async () => results;
    calls++;
    return next();
  };
  return { run, calls: () => calls };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

async function waitFor(what: string, check: () => boolean, timeoutMs = 3_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const ticks = (count: number) => new Promise((resolve) => setTimeout(resolve, TICK_MS * count));

type Setup = { files: Paths; status: () => WorkerStatus | null };

function setup(
  t: TestContext,
  options: { connected?: boolean; lastAttempt?: LastAttempt | null; settings?: string } = {},
): Setup {
  const { dir, cleanup } = tempDir();
  t.after(cleanup);
  const files = paths({ MAGPIE_ROOT: dir, MAGPIE_CONFIG_DIR: join(dir, 'config') });
  mkdirSync(files.stateDir, { recursive: true });
  mkdirSync(files.configDir, { recursive: true });
  if (options.connected ?? true) writeConnection(files.xConnection, { handle: 'someone', connectedAt: GEN });
  const lastAttempt = options.lastAttempt === undefined ? attemptAgo(HOUR) : options.lastAttempt;
  if (lastAttempt) writeFileSync(files.schedulerState, JSON.stringify({ lastAttempt, consecutiveFailures: 0 }));
  if (options.settings) writeFileSync(files.settings, options.settings);
  return { files, status: () => readWorkerStatus(files.workerStatus) };
}

function start(t: TestContext, files: Paths, run: () => Promise<SyncRunResult>) {
  const worker = startWorker({ files, runSync: run, secretBackend: () => 'file', tickMs: TICK_MS });
  t.after(() => worker.stop());
  return worker;
}

test('a tick writes the heartbeat and next run time, and a request is consumed exactly once', async (t) => {
  const { files, status } = setup(t);
  const fake = fakeRun(complete(ok));
  const before = Date.now();
  start(t, files, fake.run);

  await waitFor('the first status', () => status() !== null);
  const first = status()!;
  assert.equal(first.state, 'idle');
  assert.equal(first.schedule, 'scheduled');
  assert.equal(first.pid, process.pid);
  assert.equal(first.secretBackend, 'file');
  assert.ok(Date.parse(first.heartbeatAt) >= before - 1000);
  const lastFinished = Date.parse(readSchedulerState(files.schedulerState).lastAttempt!.finishedAt);
  assert.equal(Date.parse(first.nextRunAt!), lastFinished + 3 * HOUR);
  assert.equal(fake.calls(), 0);

  writeSyncRequest(files.syncRequest);
  await waitFor('the requested run', () => fake.calls() === 1);
  await waitFor('the run to be recorded', () => status()?.lastAttempt?.trigger === 'request');
  await ticks(10);
  assert.equal(fake.calls(), 1);
  assert.ok(!existsSync(files.syncRequest));
  const after = status()!;
  assert.equal(after.state, 'idle');
  assert.equal(after.lastAttempt?.result, 'ok');
  assert.equal(Date.parse(after.nextRunAt!), Date.parse(after.lastAttempt!.finishedAt) + 3 * HOUR);
});

test('the heartbeat keeps going during a run, and a request made meanwhile waits for it, then runs', async (t) => {
  const { files, status } = setup(t, { lastAttempt: null });
  const first = deferred<SyncRunResult>();
  const fake = fakeRun([() => first.promise, async () => complete(ok, 2)]);
  const worker = startWorker({ files, runSync: fake.run, secretBackend: () => 'file', tickMs: TICK_MS });
  // Release the held run first, so a failed assertion cannot leave stop() waiting on it.
  t.after(() => {
    first.resolve(complete(ok, 1));
    return worker.stop();
  });

  await waitFor('the first run', () => fake.calls() === 1);
  await waitFor('a running status', () => status()?.state === 'running');
  const heartbeat = Date.parse(status()!.heartbeatAt);
  writeSyncRequest(files.syncRequest);
  await ticks(10);
  assert.ok(Date.parse(status()!.heartbeatAt) > heartbeat, 'no heartbeat while the run was in progress');
  assert.equal(status()!.state, 'running');
  assert.equal(status()!.nextRunAt, null);
  assert.equal(fake.calls(), 1);
  assert.ok(existsSync(files.syncRequest), 'the request was taken while a run was in progress');

  first.resolve(complete(ok, 1));
  await waitFor('the waiting request to run', () => fake.calls() === 2);
  await waitFor('the second run to be recorded', () => status()?.lastAttempt?.runId === 2);
  assert.ok(!existsSync(files.syncRequest));
  assert.equal(status()!.lastAttempt?.trigger, 'request');
});

test('while another process holds the run lock, a request stays in place and no run starts', async (t) => {
  const { files, status } = setup(t);
  const script = `
    import { acquireLock } from ${JSON.stringify(LOCK_MODULE)};
    const lock = acquireLock(process.argv[1]);
    console.log(lock.held ? 'held' : 'busy');
    setInterval(() => {}, 1000);
  `;
  const holder = spawn(process.execPath, ['--input-type=module', '-e', script, files.lock], { stdio: ['ignore', 'pipe', 'inherit'] });
  t.after(() => holder.kill('SIGKILL'));
  const first = await new Promise<string>((resolve) =>
    holder.stdout!.setEncoding('utf8').once('data', (chunk: string) => resolve(chunk.trim())),
  );
  assert.equal(first, 'held');

  writeSyncRequest(files.syncRequest);
  const fake = fakeRun(complete(ok));
  start(t, files, fake.run);
  await waitFor('a status', () => status() !== null);
  await ticks(10);

  assert.equal(fake.calls(), 0);
  assert.ok(existsSync(files.syncRequest));
  assert.equal(status()!.state, 'running');
});

test('a request 11 minutes old is dropped without running', async (t) => {
  const { files, status } = setup(t);
  writeSyncRequest(files.syncRequest, new Date(Date.now() - 11 * MINUTE));
  const fake = fakeRun(complete(ok));
  start(t, files, fake.run);

  await waitFor('a status', () => status() !== null);
  await ticks(5);
  assert.ok(!existsSync(files.syncRequest));
  assert.equal(fake.calls(), 0);
});

test('an X rejection marks the connection it ran with, pauses the schedule, and later ticks do not run', async (t) => {
  const { files, status } = setup(t, { lastAttempt: null });
  const fake = fakeRun(complete(rejected));
  start(t, files, fake.run);

  await waitFor('the run to be recorded', () => status()?.lastAttempt?.result === 'rejected');
  await ticks(10);
  assert.equal(fake.calls(), 1);
  const connection = readConnection(files.xConnection)!;
  assert.equal(connection.rejection?.generation, GEN);
  assert.equal(connection.rejection?.message, rejected.message);
  assert.equal(status()!.schedule, 'paused');
  assert.equal(status()!.nextRunAt, null);
});

test('a rejection from a run that used an older connection leaves a reconnect alone', async (t) => {
  const { files, status } = setup(t, { lastAttempt: null });
  const reconnectedAt = '2026-11-20T11:30:00.000Z';
  const fake = fakeRun([
    async () => {
      // The owner reconnects while the run is checking the old cookies.
      writeConnection(files.xConnection, { handle: 'someone', connectedAt: reconnectedAt });
      return complete(rejected);
    },
  ]);
  start(t, files, fake.run);

  await waitFor('the run to be recorded', () => status()?.lastAttempt?.result === 'rejected');
  assert.deepEqual(readConnection(files.xConnection), { handle: 'someone', connectedAt: reconnectedAt });
  assert.notEqual(status()!.schedule, 'paused');
});

test('a transient failure backs off for a minute and does not pause', async (t) => {
  const { files, status } = setup(t, { lastAttempt: null });
  const fake = fakeRun(complete(transient));
  start(t, files, fake.run);

  await waitFor('the run to be recorded', () => status()?.lastAttempt?.result === 'transient');
  const recorded = status()!;
  assert.equal(recorded.schedule, 'backoff');
  assert.equal(Date.parse(recorded.nextRunAt!), Date.parse(recorded.lastAttempt!.finishedAt) + MINUTE);
  assert.equal(readSchedulerState(files.schedulerState).consecutiveFailures, 1);
  assert.equal(readConnection(files.xConnection)?.rejection, undefined);
  assert.equal(fake.calls(), 1);
});

test('Sync now while paused checks again, and a passing check clears the pause and fills in the handle', async (t) => {
  const { files, status } = setup(t);
  writeConnection(files.xConnection, {
    handle: null,
    connectedAt: GEN,
    rejection: { generation: GEN, at: new Date().toISOString(), message: 'X rejected the cookies' },
  });
  const fake = fakeRun(complete({ status: 'ok', handle: 'renamed', message: null }));
  start(t, files, fake.run);
  await waitFor('a paused status', () => status()?.schedule === 'paused');

  writeSyncRequest(files.syncRequest);
  await waitFor('the check to be recorded', () => status()?.lastAttempt?.trigger === 'request');
  assert.deepEqual(readConnection(files.xConnection), { handle: 'renamed', connectedAt: GEN });
  await waitFor('a scheduled status', () => status()?.schedule === 'scheduled');
});

test('SYNC_INTERVAL_HOURS in the settings file changes the next run without a restart', async (t) => {
  const { files, status } = setup(t);
  start(t, files, fakeRun(complete(ok)).run);
  const lastFinished = Date.parse(readSchedulerState(files.schedulerState).lastAttempt!.finishedAt);

  await waitFor('the 3-hour schedule', () => Date.parse(status()?.nextRunAt ?? '') === lastFinished + 3 * HOUR);
  writeFileSync(files.settings, 'SYNC_INTERVAL_HOURS=6\n');
  await waitFor('the 6-hour schedule', () => Date.parse(status()?.nextRunAt ?? '') === lastFinished + 6 * HOUR);
});

test('recording a run keeps the backfill state in the same file', async (t) => {
  const { files, status } = setup(t, { lastAttempt: null });
  const backfill = { bookmarks: { completedAt: '2026-11-19T00:00:00.000Z' } };
  writeFileSync(files.schedulerState, JSON.stringify({ backfill }));
  start(t, files, fakeRun(complete(ok)).run);

  await waitFor('the run to be recorded', () => status()?.lastAttempt?.result === 'ok');
  assert.deepEqual(JSON.parse(readFileSync(files.schedulerState, 'utf8')).backfill, backfill);
});

test('a run that throws is a failed attempt, and the worker keeps ticking', async (t) => {
  const { files, status } = setup(t, { lastAttempt: null });
  const fake = fakeRun([
    async () => {
      throw new Error('the store could not be opened');
    },
  ]);
  start(t, files, fake.run);

  await waitFor('the run to be recorded', () => status()?.lastAttempt?.result === 'failed');
  assert.equal(status()!.lastAttempt?.message, 'the store could not be opened');
  assert.equal(status()!.schedule, 'backoff');
  const heartbeat = Date.parse(status()!.heartbeatAt);
  await waitFor('a later heartbeat', () => Date.parse(status()!.heartbeatAt) > heartbeat);
});

test('corrupt state files read as a fresh state', async (t) => {
  const { files, status } = setup(t);
  writeFileSync(files.schedulerState, '{ not json');
  writeFileSync(files.workerStatus, 'garbage');
  const fake = fakeRun(complete(ok));
  start(t, files, fake.run);

  // With no record of a past run, a connected worker syncs at once.
  await waitFor('the run to be recorded', () => status()?.lastAttempt?.result === 'ok');
  assert.equal(fake.calls(), 1);
});

test('without an X connection nothing is scheduled', async (t) => {
  const { files, status } = setup(t, { connected: false, lastAttempt: null });
  const fake = fakeRun(complete(ok));
  start(t, files, fake.run);

  await waitFor('a status', () => status() !== null);
  await ticks(5);
  assert.equal(fake.calls(), 0);
  assert.equal(status()!.schedule, 'not_connected');
  assert.equal(status()!.nextRunAt, null);
});

test('SIGTERM during a run kills the tool processes it started, releases the run lock and exits 0', async (t) => {
  const { dir, cleanup } = tempDir();
  t.after(cleanup);
  const home = join(dir, 'home');
  mkdirSync(home);
  // A bird whose whoami hangs with a child of its own, and records that child's pid.
  const bird = join(dir, 'bird');
  writeFileSync(bird, '#!/bin/sh\nsleep 30 &\necho $! > "$HOME/grandchild.pid"\nwait\n');
  chmodSync(bird, 0o755);
  const env: Record<string, string | undefined> = {
    ...process.env,
    MAGPIE_ROOT: dir,
    MAGPIE_CONFIG_DIR: join(dir, 'config'),
    MAGPIE_SECRET_BACKEND: 'file',
    MAGPIE_BIRD_BIN: bird,
    MAGPIE_BIRDCLAW_BIN: '/usr/bin/false',
    BIRDCLAW_HOME: join(dir, 'birdclaw'),
    HOME: home,
  };
  for (const name of ['TYPESAFE_API_KEY', 'MAGPIE_DATA_DIR', 'MAGPIE_STORE', 'MAGPIE_KEYCHAIN_SERVICE']) delete env[name];
  const files = paths(env);
  const stored = await createSecretStore({ env }).set('x-session', { authToken: 'authTOKENvalue0123', ct0: 'ct0VALUE9876' });
  assert.ok(stored.ok);
  writeConnection(files.xConnection, { handle: 'someone', connectedAt: GEN });

  const worker = spawn(process.execPath, [WORKER_BIN], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => worker.kill('SIGKILL'));
  let output = '';
  worker.stdout!.setEncoding('utf8').on('data', (chunk: string) => (output += chunk));
  worker.stderr!.setEncoding('utf8').on('data', (chunk: string) => (output += chunk));
  const exited = new Promise<number | null>((resolve) => worker.on('exit', (code) => resolve(code)));

  const pidFile = join(home, 'grandchild.pid');
  await waitFor('bird whoami to start', () => existsSync(pidFile) && readFileSync(pidFile, 'utf8').trim() !== '', 10_000);
  assert.equal(readWorkerStatus(files.workerStatus)?.state, 'running');
  assert.ok(existsSync(files.lock));

  worker.kill('SIGTERM');
  assert.equal(await exited, 0, output);
  const pid = Number(readFileSync(pidFile, 'utf8'));
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  assert.ok(!existsSync(files.lock), 'the run lock was left behind');
});
