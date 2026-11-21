import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';

import { paths } from '../src/config.ts';
import type { Paths } from '../src/config.ts';
import { acquireLock } from '../src/lock.ts';
import type { XSession } from '../src/secrets/store.ts';
import { openStore } from '../src/store/db.ts';
import type { Store } from '../src/store/db.ts';
import { runSync } from '../src/sync/run.ts';
import type { SyncDeps } from '../src/sync/run.ts';
import type { Collection, WhoamiResult, XAdapter } from '../src/x/birdclaw.ts';
import { exportPost, tempDir, writeExports } from './fixtures/export.ts';
import type { ExportPost } from './fixtures/export.ts';
import { fakes } from './fixtures/pipeline.ts';

const ENGINE = fileURLToPath(new URL('..', import.meta.url));
const LOCK_MODULE = join(ENGINE, 'src', 'lock.ts');
const SESSION: XSession = { authToken: 'authTOKENvalue0123', ct0: 'ct0VALUE9876' };
const HOUR = 60 * 60 * 1000;

type FakeX = XAdapter & { calls: string[] };

function fakeX(
  options: {
    whoami?: WhoamiResult;
    fail?: Partial<Record<Collection, string>>;
    posts?: Partial<Record<Collection, ExportPost[]>>;
    onWhoami?: () => void;
  } = {},
): FakeX {
  const calls: string[] = [];
  return {
    calls,
    async whoami() {
      calls.push('whoami');
      options.onWhoami?.();
      return options.whoami ?? { ok: true, handle: 'someone' };
    },
    async sync(_session, collection, mode) {
      calls.push(`sync ${collection} ${mode}`);
      const message = options.fail?.[collection];
      return message ? { ok: false, reason: 'exit', message } : { ok: true };
    },
    async export(_session, collection, outFile) {
      calls.push(`export ${collection}`);
      const posts = options.posts?.[collection] ?? [];
      mkdirSync(dirname(outFile), { recursive: true });
      writeFileSync(outFile, JSON.stringify(posts));
      return { ok: true, kept: posts.length, dropped: 0 };
    },
  };
}

const secretsWith = (session: XSession | null): SyncDeps['secrets'] =>
  ({
    get: async (name: string) => ({ ok: true, value: name === 'x-session' ? session : null }),
  }) as SyncDeps['secrets'];

function setup(t: TestContext): { dir: string; files: Paths } {
  const { dir, cleanup } = tempDir();
  t.after(cleanup);
  const files = paths({ MAGPIE_ROOT: dir });
  mkdirSync(files.dataDir);
  return { dir, files };
}

function read<T>(files: Paths, fn: (db: Store) => T): T {
  const db = openStore(files.store, { readOnly: true });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

const stageRows = (db: Store, runId: number): [string, string][] =>
  db
    .prepare(`SELECT stage, outcome FROM run_stages WHERE run_id = ? ORDER BY id`)
    .all(runId)
    .map((row) => [String(row.stage), String(row.outcome)]);

async function holdLock(t: TestContext, path: string): Promise<ChildProcess> {
  const script = `
    import { acquireLock } from ${JSON.stringify(LOCK_MODULE)};
    const lock = acquireLock(process.argv[1]);
    console.log(lock.held ? 'held' : 'busy');
    setInterval(() => {}, 1000);
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script, path], { stdio: ['ignore', 'pipe', 'inherit'] });
  t.after(() => child.kill('SIGKILL'));
  const first = await new Promise<string>((resolve) =>
    child.stdout!.setEncoding('utf8').once('data', (chunk: string) => resolve(chunk.trim())),
  );
  assert.equal(first, 'held');
  return child;
}

function cliEnv(dir: string): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    MAGPIE_ROOT: dir,
    MAGPIE_CONFIG_DIR: join(dir, 'config'),
    MAGPIE_SECRET_BACKEND: 'file',
    MAGPIE_BIRD_BIN: '/usr/bin/false',
    MAGPIE_BIRDCLAW_BIN: '/usr/bin/false',
    BIRDCLAW_HOME: join(dir, 'birdclaw'),
    HOME: join(dir, 'home'),
  };
  for (const name of ['TYPESAFE_API_KEY', 'MAGPIE_DATA_DIR', 'MAGPIE_STORE', 'MAGPIE_KEYCHAIN_SERVICE']) delete env[name];
  return env;
}

function runCli(dir: string, script: string, ...args: string[]) {
  return spawnSync(process.execPath, [join(ENGINE, 'bin', script), ...args], { env: cliEnv(dir), encoding: 'utf8' });
}

const linked = (id: string): ExportPost =>
  exportPost(id, { urls: [{ url: `https://t.co/short${id}`, expandedUrl: `https://docs-${id}.dev/guide` }] });

test('a full run records the X stages, export and markdown, then the categorize stages, in one run row', async (t) => {
  const { files } = setup(t);
  const x = fakeX({ posts: { bookmarks: [linked('1')], likes: [exportPost('2')] } });

  const result = await runSync(files, { ...fakes(), x, secrets: secretsWith(SESSION) });

  assert.equal(result.status, 'complete');
  if (result.status !== 'complete') return;
  const expected: [string, string][] = [
    ['x_auth', 'ok'],
    ['x_bookmarks', 'ok'],
    ['x_likes', 'ok'],
    ['export', 'ok'],
    ['markdown', 'ok'],
    ['ingest', 'ok'],
    ['links', 'ok'],
    ['tag', 'ok'],
    ['discovery', 'ok'],
    ['retag', 'ok'],
  ];
  assert.deepEqual(
    result.stages.map((stage) => [stage.stage, stage.outcome]),
    expected,
  );
  assert.equal(result.upstreamSync, 'ok');
  assert.equal(result.xOk, true);
  assert.deepEqual(result.auth, { status: 'ok', handle: 'someone', message: null });
  read(files, (db) => {
    const runs = db.prepare(`SELECT id, status, upstream_sync, message FROM runs`).all();
    assert.equal(runs.length, 1);
    assert.deepEqual([runs[0].status, runs[0].upstream_sync, runs[0].message], ['complete', 'ok', null]);
    assert.deepEqual(stageRows(db, Number(runs[0].id)), expected);
    assert.equal(Number(db.prepare(`SELECT count(*) AS n FROM posts`).get()?.n), 2);
  });
  assert.ok(existsSync(join(files.markdownDir, 'bookmarks', 'index.md')));
  assert.ok(existsSync(join(files.markdownDir, 'likes', 'index.md')));
  assert.equal(readFileSync(join(files.dataDir, 'likes.normalized.jsonl'), 'utf8').trim().split('\n').length, 1);
  assert.equal(existsSync(files.lock), false);
});

test('a failed likes sync marks the upstream sync failed and categorize still runs on the export', async (t) => {
  const { files } = setup(t);
  const x = fakeX({
    fail: { likes: 'birdclaw sync likes exited with code 1.' },
    posts: { bookmarks: [exportPost('1')], likes: [exportPost('2')] },
  });

  const result = await runSync(files, { ...fakes(), x, secrets: secretsWith(SESSION) }, { skipLinks: true });

  assert.equal(result.status, 'complete');
  if (result.status !== 'complete') return;
  assert.equal(result.upstreamSync, 'failed');
  assert.equal(result.xOk, false);
  assert.equal(result.auth.status, 'ok');
  read(files, (db) => {
    const row = db.prepare(`SELECT upstream_sync, upstream_sync_detail, message FROM runs WHERE id = ?`).get(result.runId);
    assert.equal(row?.upstream_sync, 'failed');
    assert.match(String(row?.upstream_sync_detail), /exited with code 1/);
    assert.match(String(row?.message), /failed: x_likes/);
    const recorded = Object.fromEntries(stageRows(db, result.runId));
    assert.equal(recorded.x_likes, 'failed');
    assert.equal(recorded.ingest, 'ok');
    assert.equal(recorded.tag, 'ok');
    assert.equal(Number(db.prepare(`SELECT count(*) AS n FROM posts WHERE liked = 1`).get()?.n), 1);
  });
});

test('the sync command reports a run in progress and exits 1 without opening the store', async (t) => {
  const { dir, files } = setup(t);
  const holder = await holdLock(t, files.lock);

  const cli = runCli(dir, 'sync.mjs');

  assert.equal(cli.status, 1);
  assert.match(cli.stderr, new RegExp(`already in progress \\(pid ${holder.pid}\\)`));
  assert.equal(existsSync(files.store), false);
  assert.equal(JSON.parse(readFileSync(files.lock, 'utf8')).pid, holder.pid);
});

test('a lock holding this process id is taken over', async (t) => {
  const { files } = setup(t);
  writeExports(files.dataDir, { bookmarks: [], likes: [] });
  const leftover = acquireLock(files.lock);
  assert.equal(leftover.held, true);
  const x = fakeX();

  const result = await runSync(files, { ...fakes(), x, secrets: secretsWith(SESSION) });

  assert.equal(result.status, 'complete');
  assert.ok(x.calls.includes('whoami'));
  assert.equal(existsSync(files.lock), false);
});

test('a live process on this boot keeps the lock, and the same pid from another boot does not', async (t) => {
  const { files } = setup(t);
  writeExports(files.dataDir, { bookmarks: [], likes: [] });
  const holder = await holdLock(t, files.lock);
  const x = fakeX();
  const deps = { ...fakes(), x, secrets: secretsWith(SESSION) };

  assert.deepEqual(await runSync(files, deps), { status: 'locked', pid: holder.pid });
  assert.equal(x.calls.length, 0);
  assert.equal(existsSync(files.store), false);

  const lock = JSON.parse(readFileSync(files.lock, 'utf8'));
  writeFileSync(files.lock, JSON.stringify({ ...lock, boot: 'a-boot-before-the-last-restart' }));
  const result = await runSync(files, deps);

  assert.equal(result.status, 'complete');
  assert.ok(x.calls.includes('whoami'));
});

test('a lock whose owner died without releasing it is taken over', async (t) => {
  const { files } = setup(t);
  writeExports(files.dataDir, { bookmarks: [], likes: [] });
  const crashed = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', `import { acquireLock } from ${JSON.stringify(LOCK_MODULE)}; acquireLock(process.argv[1]);`, files.lock],
    { encoding: 'utf8' },
  );
  assert.equal(JSON.parse(readFileSync(files.lock, 'utf8')).pid, crashed.pid);
  const x = fakeX();

  const result = await runSync(files, { ...fakes(), x, secrets: secretsWith(SESSION) });

  assert.equal(result.status, 'complete');
  assert.equal(existsSync(files.lock), false);
});

test('a run left running by a killed run is marked interrupted, and the new run stays running until it finishes', async (t) => {
  const { files } = setup(t);
  writeExports(files.dataDir, { bookmarks: [], likes: [] });
  const db = openStore(files.store);
  db.prepare(`INSERT INTO runs (started_at, status) VALUES ('2026-01-01T00:00:00.000Z', 'running')`).run();
  db.close();
  let duringRun: unknown[] = [];
  const x = fakeX({
    onWhoami: () => {
      duringRun = read(files, (store) =>
        store.prepare(`SELECT status, message FROM runs ORDER BY id`).all().map((row) => [row.status, row.message]),
      );
    },
  });

  await runSync(files, { ...fakes(), x, secrets: secretsWith(SESSION) });

  assert.deepEqual(duringRun, [
    ['failed', 'The run was interrupted.'],
    ['running', null],
  ]);
  read(files, (store) =>
    assert.deepEqual(
      store.prepare(`SELECT status FROM runs ORDER BY id`).all().map((row) => row.status),
      ['failed', 'complete'],
    ),
  );
});

test('a backfill runs until it succeeds, and a failed one is retried at most once a day', async (t) => {
  const { files } = setup(t);
  mkdirSync(dirname(files.schedulerState), { recursive: true });
  writeFileSync(files.schedulerState, JSON.stringify({ lastScheduledRunAt: '2026-11-20T00:00:00.000Z' }));
  const start = new Date('2026-11-20T12:00:00.000Z');
  const runAt = async (offsetMs: number, fail: Partial<Record<Collection, string>> = {}) => {
    const x = fakeX({ fail });
    const now = () => new Date(start.getTime() + offsetMs);
    await runSync(files, { ...fakes(), now, x, secrets: secretsWith(SESSION) }, { skipLinks: true, skipEvolve: true });
    return x.calls.filter((call) => call.startsWith('sync'));
  };

  assert.deepEqual(await runAt(0, { likes: 'birdclaw sync likes timed out.' }), [
    'sync bookmarks backfill',
    'sync likes backfill',
  ]);
  const state = JSON.parse(readFileSync(files.schedulerState, 'utf8'));
  assert.equal(state.lastScheduledRunAt, '2026-11-20T00:00:00.000Z');
  assert.equal(state.backfill.bookmarks.completedAt, start.toISOString());
  assert.equal(state.backfill.likes.failedAt, start.toISOString());

  assert.deepEqual(await runAt(3 * HOUR), ['sync bookmarks incremental', 'sync likes incremental']);
  assert.deepEqual(await runAt(25 * HOUR), ['sync bookmarks incremental', 'sync likes backfill']);
  assert.deepEqual(await runAt(26 * HOUR), ['sync bookmarks incremental', 'sync likes incremental']);
});

test('with no X session the run skips the X auth check, calls no X tool and still categorizes', async (t) => {
  const { files } = setup(t);
  writeExports(files.dataDir, { bookmarks: [exportPost('1')], likes: [] });
  const x = fakeX();

  const result = await runSync(files, { ...fakes(), x, secrets: secretsWith(null) }, { skipLinks: true });

  assert.deepEqual(x.calls, []);
  assert.equal(result.status, 'complete');
  if (result.status !== 'complete') return;
  assert.equal(result.auth.status, 'not_connected');
  assert.equal(result.xOk, false);
  assert.deepEqual(result.stages.slice(0, 3).map((stage) => [stage.stage, stage.outcome]), [
    ['x_auth', 'skipped'],
    ['markdown', 'ok'],
    ['ingest', 'ok'],
  ]);
  read(files, (db) => {
    assert.equal(db.prepare(`SELECT upstream_sync FROM runs WHERE id = ?`).get(result.runId)?.upstream_sync, 'unknown');
    assert.equal(Number(db.prepare(`SELECT count(*) AS n FROM posts`).get()?.n), 1);
  });
});

test('when X rejects the session, neither collection is synced and the run reports the rejection', async (t) => {
  const { files } = setup(t);
  const x = fakeX({
    whoami: { ok: false, reason: 'rejected', message: 'X rejected the cookies: HTTP 401' },
    posts: { bookmarks: [exportPost('1')], likes: [] },
  });

  const result = await runSync(files, { ...fakes(), x, secrets: secretsWith(SESSION) }, { skipLinks: true });

  assert.equal(result.status, 'complete');
  if (result.status !== 'complete') return;
  assert.deepEqual(result.auth, { status: 'rejected', handle: null, message: 'X rejected the cookies: HTTP 401' });
  assert.equal(result.upstreamSync, 'failed');
  assert.equal(result.xOk, false);
  assert.equal(x.calls.filter((call) => call.startsWith('sync')).length, 0);
  assert.deepEqual(result.stages.slice(0, 3).map((stage) => [stage.stage, stage.outcome]), [
    ['x_auth', 'failed'],
    ['x_bookmarks', 'skipped'],
    ['x_likes', 'skipped'],
  ]);
});

test('a secret store that cannot be read counts as a transient failure, not a disconnect', async (t) => {
  const { files } = setup(t);
  writeExports(files.dataDir, { bookmarks: [], likes: [] });
  const x = fakeX();
  const secrets = {
    get: async () => ({ ok: false, reason: 'locked', message: 'The keychain is locked.' }),
  } as unknown as SyncDeps['secrets'];

  const result = await runSync(files, { ...fakes(), x, secrets }, { skipLinks: true });

  assert.deepEqual(x.calls, []);
  assert.equal(result.status, 'complete');
  if (result.status !== 'complete') return;
  assert.equal(result.auth.status, 'transient');
  assert.match(String(result.auth.message), /keychain is locked/);
  assert.equal(result.stages[0].outcome, 'failed');
});

test('the categorize command records the upstream sync from the sync status file', async (t) => {
  const { dir, files } = setup(t);
  writeExports(files.dataDir, { bookmarks: [], likes: [] });
  const at = '2026-11-19T09:00:00.000Z';
  writeFileSync(files.syncStatus, JSON.stringify({ bookmarks: { exit: 0, at }, likes: { exit: 1, at } }));

  const cli = runCli(dir, 'categorize.mjs', '--skip-links', '--skip-evolve');

  assert.equal(cli.status, 0, cli.stderr);
  writeFileSync(files.syncStatus, JSON.stringify({ bookmarks: { exit: 0, at }, likes: { exit: 0, at } }));
  const second = runCli(dir, 'categorize.mjs', '--skip-links', '--skip-evolve');

  assert.equal(second.status, 0, second.stderr);
  read(files, (db) => {
    const rows = db.prepare(`SELECT status, upstream_sync FROM runs ORDER BY id`).all();
    assert.deepEqual(
      rows.map((row) => [row.status, row.upstream_sync]),
      [
        ['complete', 'failed'],
        ['complete', 'ok'],
      ],
    );
  });
});

test('the categorize command records an unknown upstream sync when there is no status file', async (t) => {
  const { dir, files } = setup(t);
  writeExports(files.dataDir, { bookmarks: [], likes: [] });

  const cli = runCli(dir, 'categorize.mjs', '--skip-links', '--skip-evolve');

  assert.equal(cli.status, 0, cli.stderr);
  read(files, (db) => assert.equal(db.prepare(`SELECT upstream_sync FROM runs`).get()?.upstream_sync, 'unknown'));
});

test('the categorize command waits its turn behind a whole sync run', async (t) => {
  const { dir, files } = setup(t);
  writeExports(files.dataDir, { bookmarks: [], likes: [] });
  const holder = await holdLock(t, join(dir, 'state', 'run.lock'));

  const cli = runCli(dir, 'categorize.mjs', '--skip-links', '--skip-evolve');

  assert.equal(cli.status, 1);
  assert.match(cli.stderr, new RegExp(`pid ${holder.pid}`));
  assert.equal(existsSync(files.store), false);
});
