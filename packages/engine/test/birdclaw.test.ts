import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';

import { X_SYNC } from '../src/config.ts';
import { createBirdclaw } from '../src/x/birdclaw.ts';
import type { BirdclawOptions } from '../src/x/birdclaw.ts';
import { exportPost, tempDir } from './fixtures/export.ts';

const AUTH = 'authTOKENvalue0123456789abcdef';
const CT0 = 'ct0VALUE9876543210fedcba';
const session = { authToken: AUTH, ct0: CT0 };

const WHOAMI_OK = 'user: @someone (Some One)\nuser_id: 42\nengine: graphql\ncredentials: env/auto-detected cookies\n';
const WHOAMI_AMBIGUOUS = '[err] Failed to determine current user: Could not parse settings page for user info\n';
const PROBE_401 =
  '[err] Failed to fetch bookmarks: HTTP 401: {"errors":[{"message":"Could not authenticate you","code":32}]}\n';

/** What one stub does when its first argument is `when`. */
type Behavior = { stdout?: string; stderr?: string; code?: number; sleepSeconds?: number; script?: string };

type Call = { argv: string[]; env: Record<string, string> };

/**
 * A shell stub that logs every call (argv and environment) and then acts by
 * its first argument. Output goes through files so it needs no escaping.
 */
function writeStub(dir: string, name: string, behaviors: Record<string, Behavior>): { path: string; calls: () => Call[] } {
  const path = join(dir, name);
  const log = join(dir, `${name}.log`);
  const cases = Object.entries(behaviors).map(([when, behavior], index) => {
    const out = join(dir, `${name}.${index}.out`);
    const err = join(dir, `${name}.${index}.err`);
    writeFileSync(out, behavior.stdout ?? '');
    writeFileSync(err, behavior.stderr ?? '');
    const body = [
      behavior.script ?? '',
      behavior.sleepSeconds ? `sleep ${behavior.sleepSeconds}` : '',
      `cat '${out}'`,
      `cat '${err}' >&2`,
      `exit ${behavior.code ?? 0}`,
    ].join('\n');
    return `  ${when})\n${body}\n  ;;`;
  });
  writeFileSync(
    path,
    [
      '#!/bin/sh',
      `{ echo '--call'; for a in "$@"; do printf 'arg %s\\n' "$a"; done; env | sed 's/^/env /'; } >> '${log}'`,
      'case "$1" in',
      ...cases,
      '  *) exit 99 ;;',
      'esac',
      '',
    ].join('\n'),
  );
  chmodSync(path, 0o755);
  return {
    path,
    calls: () => {
      if (!existsSync(log)) return [];
      return readFileSync(log, 'utf8')
        .split('--call\n')
        .slice(1)
        .map((block) => {
          const call: Call = { argv: [], env: {} };
          for (const line of block.split('\n')) {
            if (line.startsWith('arg ')) call.argv.push(line.slice(4));
            if (line.startsWith('env ')) {
              const [key, ...rest] = line.slice(4).split('=');
              call.env[key] = rest.join('=');
            }
          }
          return call;
        });
    },
  };
}

function setup(
  t: TestContext,
  stubs: { bird?: Record<string, Behavior>; birdclaw?: Record<string, Behavior> },
  timeouts?: BirdclawOptions['timeouts'],
) {
  const { dir, cleanup } = tempDir();
  t.after(cleanup);
  const bird = writeStub(dir, 'bird', stubs.bird ?? {});
  const birdclaw = writeStub(dir, 'birdclaw', stubs.birdclaw ?? {});
  const env = {
    X_CORPUS_BIRD_BIN: bird.path,
    X_CORPUS_BIRDCLAW_BIN: birdclaw.path,
    HOME: dir,
    BIRDCLAW_HOME: join(dir, 'birdclaw-home'),
    PATH: process.env.PATH,
  };
  return { dir, bird, birdclaw, adapter: createBirdclaw({ env, timeouts }) };
}

test('whoami returns the handle, with the cookies in the environment and never in argv', async (t) => {
  const { bird, adapter } = setup(t, { bird: { whoami: { stdout: WHOAMI_OK } } });

  assert.deepEqual(await adapter.whoami(session), { ok: true, handle: 'someone' });

  const [call] = bird.calls();
  assert.equal(call.env.AUTH_TOKEN, AUTH);
  assert.equal(call.env.CT0, CT0);
  assert.ok(!call.argv.some((arg) => arg.includes(AUTH) || arg.includes(CT0)));
  assert.equal(bird.calls().length, 1);
});

test('with only one cookie nothing is spawned', async (t) => {
  const { bird, birdclaw, dir, adapter } = setup(t, {
    bird: { whoami: { stdout: WHOAMI_OK } },
    birdclaw: { sync: {}, search: { stdout: '[]' } },
  });
  const half = { authToken: AUTH };

  const checked = await adapter.whoami(half);
  assert.equal(!checked.ok && checked.reason, 'missing_cookies');
  const synced = await adapter.sync({ authToken: AUTH, ct0: '' }, 'bookmarks', 'incremental');
  assert.equal(!synced.ok && synced.reason, 'missing_cookies');
  const exported = await adapter.export(null, 'bookmarks', join(dir, 'bookmarks.json'));
  assert.equal(!exported.ok && exported.reason, 'missing_cookies');

  assert.equal(bird.calls().length, 0);
  assert.equal(birdclaw.calls().length, 0);
});

test('an ambiguous whoami failure followed by a probe that X rejects is a rejection', async (t) => {
  const { bird, adapter } = setup(t, {
    bird: {
      whoami: { stderr: WHOAMI_AMBIGUOUS, code: 1 },
      bookmarks: { stderr: PROBE_401, code: 1 },
    },
  });

  const result = await adapter.whoami(session);

  assert.equal(!result.ok && result.reason, 'rejected');
  const probe = bird.calls()[1];
  assert.deepEqual(probe.argv.slice(0, 3), ['bookmarks', '-n', '1']);
  assert.ok(!probe.argv.includes('--all'));
  assert.equal(probe.env.AUTH_TOKEN, AUTH);
  assert.equal(probe.env.CT0, CT0);
});

test('an ambiguous whoami failure followed by a probe that hits a server error is transient', async (t) => {
  const { adapter } = setup(t, {
    bird: {
      whoami: { stderr: WHOAMI_AMBIGUOUS, code: 1 },
      bookmarks: { stderr: '[err] Failed to fetch bookmarks: HTTP 503: upstream unavailable\n', code: 1 },
    },
  });

  const result = await adapter.whoami(session);

  assert.equal(!result.ok && result.reason, 'transient');
});

test('an ambiguous whoami failure followed by a probe that succeeds is ok with an unknown handle', async (t) => {
  const { adapter } = setup(t, {
    bird: {
      whoami: { stderr: WHOAMI_AMBIGUOUS, code: 1 },
      bookmarks: { stdout: 'one bookmark\n' },
    },
  });

  assert.deepEqual(await adapter.whoami(session), { ok: true, handle: null });
});

test('a rate-limited whoami is transient and runs no probe', async (t) => {
  const { bird, adapter } = setup(t, {
    bird: {
      whoami: { stderr: '[err] Failed to determine current user: HTTP 429: Rate limit exceeded\n', code: 1 },
      bookmarks: { stderr: PROBE_401, code: 1 },
    },
  });

  const result = await adapter.whoami(session);

  assert.equal(!result.ok && result.reason, 'transient');
  assert.deepEqual(
    bird.calls().map((call) => call.argv[0]),
    ['whoami'],
  );
});

test('a network failure or a whoami that outlives its timeout is transient', async (t) => {
  const offline = setup(t, {
    bird: {
      whoami: { stderr: 'Error: getaddrinfo ENOTFOUND x.com\n', code: 1 },
      bookmarks: { stderr: PROBE_401, code: 1 },
    },
  });
  const slow = setup(t, { bird: { whoami: { sleepSeconds: 5, stdout: WHOAMI_OK } } }, { preflightMs: 200 });

  const offlineResult = await offline.adapter.whoami(session);
  const started = Date.now();
  const slowResult = await slow.adapter.whoami(session);

  assert.equal(!offlineResult.ok && offlineResult.reason, 'transient');
  assert.equal(!slowResult.ok && slowResult.reason, 'transient');
  assert.ok(Date.now() - started < 3_000);
});

test('cookie values are cleaned out of child output before it is returned', async (t) => {
  const { adapter } = setup(t, {
    bird: {
      whoami: { stderr: `[err] sent auth_token=${AUTH}; ct0=${CT0}\n`, code: 1 },
      bookmarks: { stderr: `[err] HTTP 503 with csrf ${CT0}\n`, code: 1 },
    },
    birdclaw: { sync: { stdout: `{"error":"bad cookie ${AUTH}"}`, stderr: `ct0 was ${CT0}`, code: 1 } },
  });

  const whoami = await adapter.whoami(session);
  const synced = await adapter.sync(session, 'likes', 'incremental');

  for (const result of [whoami, synced]) {
    assert.equal(result.ok, false);
    const message = !result.ok ? result.message : '';
    assert.ok(message.length > 0);
    assert.ok(!message.includes(AUTH), message);
    assert.ok(!message.includes(CT0), message);
  }
});

test('the bird and Birdclaw children get only the environment they need', async (t) => {
  const { bird, birdclaw, adapter } = setup(t, {
    bird: { whoami: { stdout: WHOAMI_OK } },
    birdclaw: { sync: { stdout: '{"ok":true}' } },
  });

  await adapter.whoami(session);
  await adapter.sync(session, 'bookmarks', 'incremental');

  const shellAdded = new Set(['PWD', 'SHLVL', '_', 'OLDPWD']);
  for (const call of [bird.calls()[0], birdclaw.calls()[0]]) {
    const keys = Object.keys(call.env).filter((key) => !shellAdded.has(key)).sort();
    assert.deepEqual(keys, ['AUTH_TOKEN', 'BIRDCLAW_BIRD_COMMAND', 'BIRDCLAW_HOME', 'CT0', 'HOME', 'PATH']);
    assert.equal(call.env.BIRDCLAW_BIRD_COMMAND, bird.path);
    assert.ok(call.env.PATH.startsWith(`${dirname(process.execPath)}:`));
  }
});

test('a collection not yet backfilled syncs its whole history; a backfilled one syncs incrementally', async (t) => {
  const { birdclaw, adapter } = setup(t, { birdclaw: { sync: { stdout: '{"ok":true}' } } });

  assert.deepEqual(await adapter.sync(session, 'bookmarks', 'backfill'), { ok: true });
  assert.deepEqual(await adapter.sync(session, 'likes', 'incremental'), { ok: true });

  const [backfill, incremental] = birdclaw.calls().map((call) => call.argv);
  assert.deepEqual(backfill.slice(0, 2), ['sync', 'bookmarks']);
  assert.equal(backfill[backfill.indexOf('--mode') + 1], 'bird');
  assert.ok(backfill.includes('--all'));
  assert.ok(backfill.includes('--refresh'));
  assert.ok(!backfill.includes('--max-pages'));
  assert.ok(!backfill.includes('--early-stop'));

  assert.deepEqual(incremental.slice(0, 2), ['sync', 'likes']);
  assert.equal(incremental[incremental.indexOf('--mode') + 1], 'bird');
  assert.ok(incremental.includes('--early-stop'));
  assert.equal(incremental[incremental.indexOf('--max-pages') + 1], '50');
  assert.ok(!incremental.includes('--all'));
});

test('a backfill gets the long timeout and an incremental sync the short one', async (t) => {
  const { adapter } = setup(
    t,
    { birdclaw: { sync: { sleepSeconds: 1, stdout: '{"ok":true}' } } },
    { incrementalMs: 200, backfillMs: 5_000 },
  );

  const incremental = await adapter.sync(session, 'bookmarks', 'incremental');
  const backfill = await adapter.sync(session, 'bookmarks', 'backfill');

  assert.equal(!incremental.ok && incremental.reason, 'timeout');
  assert.deepEqual(backfill, { ok: true });
  assert.equal(X_SYNC.backfillTimeoutMs, 6 * 60 * 60 * 1000);
  assert.ok(X_SYNC.incrementalTimeoutMs < X_SYNC.backfillTimeoutMs);
});

test('a timed-out sync also stops the processes Birdclaw started', async (t) => {
  // The stub's HOME is the test's temp dir, where it leaves its background child's pid.
  const { dir, adapter } = setup(
    t,
    { birdclaw: { sync: { script: 'sleep 30 &\necho $! > "$HOME/grandchild.pid"\nwait' } } },
    { incrementalMs: 300 },
  );

  const started = Date.now();
  const result = await adapter.sync(session, 'bookmarks', 'incremental');
  assert.equal(!result.ok && result.reason, 'timeout');
  assert.ok(Date.now() - started < 5_000, 'the call waited for the background child to finish on its own');

  const pid = Number(readFileSync(join(dir, 'grandchild.pid'), 'utf8'));
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

test('an export drops posts whose id is not a numeric X status id', async (t) => {
  const posts = [exportPost('1876543210987654321'), exportPost('tweet_006'), exportPost('42'), exportPost('tweet_001')];
  const { birdclaw, dir, adapter } = setup(t, { birdclaw: { search: { stdout: JSON.stringify(posts, null, 2) } } });
  const outFile = join(dir, 'data', 'bookmarks.json');

  const result = await adapter.export(session, 'bookmarks', outFile);

  assert.deepEqual(result, { ok: true, kept: 2, dropped: 2 });
  const written = JSON.parse(readFileSync(outFile, 'utf8')) as { id: string }[];
  assert.deepEqual(written, [posts[0], posts[2]]);
  assert.ok(!existsSync(`${outFile}.tmp`));
  const argv = birdclaw.calls()[0].argv;
  assert.deepEqual(argv.slice(0, 3), ['search', 'tweets', '--bookmarked']);
  assert.ok(argv.includes('--json'));
});

test('a failing export keeps the previous file and removes the partial one', async (t) => {
  const { dir, adapter } = setup(t, {
    birdclaw: { search: { stdout: '[{"id": "1", "text": "half writ', stderr: 'database is locked', code: 1 } },
  });
  const outFile = join(dir, 'likes.json');
  const previous = JSON.stringify([exportPost('7')]);
  writeFileSync(outFile, previous);

  const result = await adapter.export(session, 'likes', outFile);

  assert.equal(!result.ok && result.reason, 'exit');
  assert.equal(readFileSync(outFile, 'utf8'), previous);
  assert.ok(!existsSync(`${outFile}.tmp`));
});

test('an export that is not a JSON array keeps the previous file', async (t) => {
  const { dir, adapter } = setup(t, { birdclaw: { search: { stdout: 'not json' } } });
  const outFile = join(dir, 'likes.json');
  writeFileSync(outFile, '[]');

  const result = await adapter.export(session, 'likes', outFile);

  assert.equal(!result.ok && result.reason, 'output');
  assert.equal(readFileSync(outFile, 'utf8'), '[]');
  assert.ok(!existsSync(`${outFile}.tmp`));
});

test('the pinned Birdclaw exports a fresh database without its demo posts', async () => {
  const { dir, cleanup } = tempDir();
  try {
    mkdirSync(join(dir, 'home'));
    const adapter = createBirdclaw({
      env: { HOME: join(dir, 'home'), BIRDCLAW_HOME: join(dir, 'birdclaw-home'), PATH: '/usr/bin:/bin' },
    });
    const outFile = join(dir, 'bookmarks.json');

    const result = await adapter.export(session, 'bookmarks', outFile);

    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(JSON.parse(readFileSync(outFile, 'utf8')), []);
    assert.ok(result.ok && result.dropped > 0);
  } finally {
    cleanup();
  }
});
