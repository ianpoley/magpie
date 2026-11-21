import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';

import { paths } from '../src/config.ts';
import { migrate } from '../src/migrate/legacy.ts';
import type { MigrateOptions } from '../src/migrate/legacy.ts';
import { createSecretStore } from '../src/secrets/store.ts';
import type { CommandResult } from '../src/service/index.ts';
import { openStore } from '../src/store/db.ts';
import { backfillMode } from '../src/sync/backfill.ts';
import type { SyncRunResult } from '../src/sync/run.ts';
import { readConnection } from '../src/sync/state.ts';
import { startWorker } from '../src/sync/worker.ts';
import type { Worker } from '../src/sync/worker.ts';
import type { Cookies, WhoamiResult } from '../src/x/birdclaw.ts';
import { tempDir } from './fixtures/export.ts';

const LABEL = 'com.example.legacy-sync-test';
const AUTH_TOKEN = 'authtok0123456789abcdef';
const CT0 = 'ct0value0123456789';
const JEV_KEY = 'jev-key-0123456789abcdef';
const BIRD_ENV = `# X cookies for bird\nexport AUTH_TOKEN="${AUTH_TOKEN}"\nexport CT0="${CT0}"\n`;
const SECRETS_ENV = `TYPESAFE_API_KEY=${JEV_KEY}\n`;
const PLIST = '<?xml version="1.0"?><plist><dict><key>Label</key><string>legacy</string></dict></plist>\n';

type Keychain = 'ok' | 'fail' | 'fail-writes';

type Machine = {
  options: MigrateOptions & { env: Record<string, string> };
  home: string;
  birdEnv: string;
  secretsEnv: string;
  syncStatus: string;
  plist: string;
  events: string[];
  output: string[];
  checked: Cookies[];
  loaded: Set<string>;
  keychain: () => Record<string, string>;
  keychainCalls: () => string[];
  atInstall: { connection: boolean; backend: boolean } | null;
};

function stubSecurity(dir: string, mode: Keychain): { path: string; items: () => Record<string, string>; calls: () => string[] } {
  const items = join(dir, 'items');
  mkdirSync(items);
  const path = join(dir, 'security');
  const log = join(dir, 'calls');
  writeFileSync(
    path,
    [
      '#!/bin/sh',
      mode === 'fail' ? 'exit 45' : '',
      'after() { want=$1; shift; while [ $# -gt 0 ]; do if [ "$1" = "$want" ]; then printf %s "$2"; return; fi; shift; done; }',
      'if [ "$1" = "-i" ]; then',
      '  IFS= read -r line',
      `  account=$(printf %s "$line" | sed -n "s/.* -a \\([^ ]*\\) .*/\\1/p")`,
      `  echo "add $account" >> '${log}'`,
      mode === 'fail-writes' ? '  [ "$account" = probe ] || exit 45' : '',
      `  printf %s "$line" | sed -n "s/.* -w '\\(.*\\)'$/\\1/p" > '${items}'/"$account"`,
      '  exit 0',
      'fi',
      'account=$(after -a "$@")',
      `echo "$1 $account" >> '${log}'`,
      'case "$1" in',
      `  find-generic-password) [ -f '${items}'/"$account" ] || exit 44; cat '${items}'/"$account" ;;`,
      `  delete-generic-password) [ -f '${items}'/"$account" ] || exit 44; rm '${items}'/"$account" ;;`,
      '  *) exit 2 ;;',
      'esac',
      '',
    ].join('\n'),
  );
  chmodSync(path, 0o755);
  return {
    path,
    items: () => Object.fromEntries(readdirSync(items).map((name) => [name, readFileSync(join(items, name), 'utf8')])),
    calls: () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []),
  };
}

function fakeRun(store: string, likes: 'ok' | 'failed'): () => Promise<SyncRunResult> {
  return async () => {
    const db = openStore(store);
    try {
      const at = new Date().toISOString();
      const runId = Number(
        db.prepare(`INSERT INTO runs (started_at, finished_at, status, upstream_sync) VALUES (?, ?, 'complete', ?)`).run(at, at, likes === 'ok' ? 'ok' : 'failed')
          .lastInsertRowid,
      );
      const stages = [
        { stage: 'x_auth', outcome: 'ok' },
        { stage: 'x_bookmarks', outcome: 'ok' },
        { stage: 'x_likes', outcome: likes },
      ] as const;
      for (const { stage, outcome } of stages) {
        db.prepare(`INSERT INTO run_stages (run_id, stage, outcome, message) VALUES (?, ?, ?, ?)`).run(
          runId,
          stage,
          outcome,
          outcome === 'ok' ? null : 'HTTP 500',
        );
      }
      return {
        status: 'complete',
        runId,
        upstreamSync: likes === 'ok' ? 'ok' : 'failed',
        stages: stages.map(({ stage, outcome }) => ({ stage, outcome, counts: {}, message: outcome === 'ok' ? null : 'HTTP 500' })),
        xOk: likes === 'ok',
        auth: { status: 'ok', handle: 'owner', message: null },
      } as SyncRunResult;
    } finally {
      db.close();
    }
  };
}

function fakeMachine(
  t: TestContext,
  setup: { whoami?: WhoamiResult; keychain?: Keychain; worker?: 'ok' | 'likes-fail' | 'none' } = {},
): Machine {
  const { dir: base, cleanup } = tempDir();
  const home = join(base, 'home');
  const root = join(base, 'clone');
  const configDir = join(home, '.config', 'magpie');
  mkdirSync(join(home, '.birdclaw'), { recursive: true });
  mkdirSync(join(home, 'Library', 'LaunchAgents'), { recursive: true });
  mkdirSync(join(root, 'data'), { recursive: true });
  mkdirSync(configDir, { recursive: true });
  const stubDir = join(base, 'stub');
  mkdirSync(stubDir);
  const security = stubSecurity(stubDir, setup.keychain ?? 'ok');

  const env = { MAGPIE_ROOT: root, MAGPIE_CONFIG_DIR: configDir, MAGPIE_KEYCHAIN_SERVICE: 'magpie-migrate-test', BIRDCLAW_HOME: join(home, '.birdclaw') };
  const files = paths(env);
  const plist = join(home, 'Library', 'LaunchAgents', `${LABEL}.plist`);
  writeFileSync(join(home, '.birdclaw', 'bird.env'), BIRD_ENV);
  writeFileSync(files.secrets, SECRETS_ENV);
  writeFileSync(files.syncStatus, '{"bookmarks":{"exit":0},"likes":{"exit":0}}\n');
  writeFileSync(plist, PLIST);

  let worker: Worker | null = null;
  t.after(async () => {
    await worker?.stop();
    cleanup();
  });
  const machine: Machine = {
    home,
    birdEnv: join(home, '.birdclaw', 'bird.env'),
    secretsEnv: files.secrets,
    syncStatus: files.syncStatus,
    plist,
    events: [],
    output: [],
    checked: [],
    loaded: new Set([LABEL]),
    keychain: security.items,
    keychainCalls: security.calls,
    atInstall: null,
    options: {
      env,
      platform: 'darwin',
      home,
      uid: 501,
      legacyLabel: LABEL,
      secretStore: { securityPath: security.path },
      timeoutMs: 3_000,
      pollMs: 20,
      log: (line) => machine.output.push(line),
      x: {
        async whoami(session) {
          machine.checked.push(session);
          return setup.whoami ?? { ok: true, handle: 'owner' };
        },
      },
      run: async (command, args): Promise<CommandResult> => {
        machine.events.push([command, ...args].join(' '));
        const done = (code = 0): CommandResult => ({ code, stdout: code === 0 ? 'state = not running\n' : '', stderr: code === 0 ? '' : 'refused' });
        if (command !== 'launchctl') return done(64);
        const [verb, target, file] = args;
        const label = target.split('/').pop()!;
        if (verb === 'print') return done(machine.loaded.has(label) ? 0 : 113);
        if (verb === 'bootout') return machine.loaded.delete(label) ? done() : done(113);
        if (verb === 'bootstrap') {
          const name = file.split('/').pop()!.replace(/\.plist$/, '');
          if (machine.loaded.has(name) || !existsSync(file)) return done(5);
          machine.loaded.add(name);
          return done();
        }
        return done(64);
      },
      installServices: async () => {
        machine.events.push('install');
        machine.atInstall = { connection: existsSync(files.xConnection), backend: existsSync(files.secretBackend) };
        if ((setup.worker ?? 'ok') === 'none') return;
        worker = startWorker({
          files,
          runSync: fakeRun(files.store, setup.worker === 'likes-fail' ? 'failed' : 'ok'),
          secretBackend: () => null,
          tickMs: 20,
        });
      },
      uninstallServices: async () => {
        machine.events.push('uninstall');
        await worker?.stop();
        worker = null;
      },
    },
  };
  return machine;
}

const SECRET_VALUES = [AUTH_TOKEN, CT0, JEV_KEY];

function assertNoSecretsPrinted(machine: Machine) {
  const printed = machine.output.join('\n');
  for (const value of SECRET_VALUES) assert.ok(!printed.includes(value), `printed a secret value:\n${printed}`);
}

function assertLegacyIntact(machine: Machine) {
  assert.equal(readFileSync(machine.birdEnv, 'utf8'), BIRD_ENV);
  assert.equal(readFileSync(machine.secretsEnv, 'utf8'), SECRETS_ENV);
  assert.ok(existsSync(machine.syncStatus));
  assert.equal(readFileSync(machine.plist, 'utf8'), PLIST);
  assert.ok(machine.loaded.has(LABEL), 'the old job is loaded');
}

function assertNothingRecorded(machine: Machine) {
  const files = paths(machine.options.env);
  assert.equal(existsSync(files.secretBackend), false, 'no secret backend is recorded');
  assert.equal(readConnection(files.xConnection), null, 'no X connection is recorded');
}

test('a successful migration checks the cookies, stores the secrets, connects X, swaps the old job for the services and deletes the plaintext files only after a good sync', async (t) => {
  const machine = fakeMachine(t);
  const files = paths(machine.options.env);

  const result = await migrate(machine.options);
  assert.equal(result.ok, true, machine.output.join('\n'));

  assert.deepEqual(machine.checked, [{ authToken: AUTH_TOKEN, ct0: CT0 }]);

  assert.deepEqual(JSON.parse(machine.keychain()['x-session']), { authToken: AUTH_TOKEN, ct0: CT0 });
  assert.equal(machine.keychain()['typesafe-api-key'], JEV_KEY);
  const store = createSecretStore({ env: machine.options.env, platform: 'darwin', securityPath: machine.options.secretStore?.securityPath });
  assert.equal(store.backend(), 'keychain');
  assert.deepEqual(await store.get('typesafe-api-key'), { ok: true, value: JEV_KEY });

  const connection = readConnection(files.xConnection);
  assert.equal(connection?.handle, 'owner');
  assert.ok(connection && !Number.isNaN(Date.parse(connection.connectedAt)));

  assert.deepEqual(machine.atInstall, { connection: true, backend: true });
  const bootout = machine.events.indexOf(`launchctl bootout gui/501/${LABEL}`);
  assert.ok(bootout >= 0 && bootout < machine.events.indexOf('install'), machine.events.join('\n'));
  assert.ok(!machine.events.includes('uninstall'));
  assert.ok(!machine.loaded.has(LABEL));

  for (const path of [machine.birdEnv, machine.secretsEnv, machine.syncStatus, machine.plist]) assert.equal(existsSync(path), false, path);
  const deleted = [machine.birdEnv, machine.secretsEnv, machine.syncStatus, machine.plist].map((path) =>
    machine.output.findIndex((line) => line.includes('deleted') && line.includes(path)),
  );
  assert.ok(deleted.every((index, i) => index >= 0 && (i === 0 || index > deleted[i - 1])), machine.output.join('\n'));
  assertNoSecretsPrinted(machine);
});

test('after a successful migration both collections count as backfilled, so the first worker sync is incremental', async (t) => {
  const machine = fakeMachine(t);
  const files = paths(machine.options.env);
  assert.equal(backfillMode(files.schedulerState, 'bookmarks', new Date()), 'backfill');

  const result = await migrate(machine.options);
  assert.equal(result.ok, true, machine.output.join('\n'));
  assert.equal(backfillMode(files.schedulerState, 'bookmarks', new Date()), 'incremental');
  assert.equal(backfillMode(files.schedulerState, 'likes', new Date()), 'incremental');
});

test('when X rejects the cookies the migration stops before writing anything', async (t) => {
  const machine = fakeMachine(t, { whoami: { ok: false, reason: 'rejected', message: 'HTTP 401: Could not authenticate you' } });

  const result = await migrate(machine.options);
  assert.equal(result.ok, false);
  assert.deepEqual(machine.keychainCalls(), [], 'the keychain was never touched');
  assert.deepEqual(machine.events, [], 'launchctl was never run and no service was installed');
  assertNothingRecorded(machine);
  assertLegacyIntact(machine);
  assertNoSecretsPrinted(machine);
});

test('when X cannot be reached the migration stops before writing anything', async (t) => {
  const machine = fakeMachine(t, { whoami: { ok: false, reason: 'transient', message: 'fetch failed' } });

  const result = await migrate(machine.options);
  assert.equal(result.ok, false);
  assert.deepEqual(machine.keychainCalls(), []);
  assert.deepEqual(machine.events, []);
  assertNothingRecorded(machine);
  assertLegacyIntact(machine);
});

test('when only the file fallback is usable the migration refuses before changing anything', async (t) => {
  const machine = fakeMachine(t, { keychain: 'fail' });

  const result = await migrate(machine.options);
  assert.equal(result.ok, false);
  assert.match(result.ok ? '' : result.message, /plaintext/);
  assert.deepEqual(machine.keychain(), {});
  assert.deepEqual(machine.events, []);
  assertNothingRecorded(machine);
  assertLegacyIntact(machine);
});

test('when a secret cannot be written nothing is booted out and both plaintext files are untouched', async (t) => {
  const machine = fakeMachine(t, { keychain: 'fail-writes' });

  const result = await migrate(machine.options);
  assert.equal(result.ok, false);
  assert.deepEqual(machine.events.filter((event) => !event.startsWith('launchctl print')), []);
  assert.deepEqual(machine.keychain(), {});
  assertNothingRecorded(machine);
  assertLegacyIntact(machine);
  assertNoSecretsPrinted(machine);
});

test('when the first sync under the new service fails to sync likes, the services are removed and the old job runs again with its files', async (t) => {
  const machine = fakeMachine(t, { worker: 'likes-fail' });

  const result = await migrate(machine.options);
  assert.equal(result.ok, false);
  assert.match(result.ok ? '' : result.message, /x_likes/);
  assert.ok(machine.events.includes('uninstall'));
  assert.ok(machine.events.includes(`launchctl bootstrap gui/501 ${machine.plist}`));
  assertLegacyIntact(machine);
  assertNothingRecorded(machine);
  assert.deepEqual(machine.keychain(), {});
  assertNoSecretsPrinted(machine);
});

test('when no sync finishes in time the migration rolls back, and the legacy Jev key read works again', async (t) => {
  const machine = fakeMachine(t, { worker: 'none' });
  machine.options.timeoutMs = 300;

  const result = await migrate(machine.options);
  assert.equal(result.ok, false);
  assert.match(result.ok ? '' : result.message, /did not finish/);
  assert.ok(machine.events.includes('uninstall'));
  assertLegacyIntact(machine);
  assertNothingRecorded(machine);
  assert.equal(existsSync(paths(machine.options.env).syncRequest), false, 'the unanswered sync request is removed');

  const store = createSecretStore({ env: machine.options.env, platform: 'darwin', securityPath: machine.options.secretStore?.securityPath });
  assert.equal(store.backend(), null);
  assert.deepEqual(await store.get('typesafe-api-key'), { ok: true, value: JEV_KEY });

  const state = result.ok ? '' : result.state.join('\n');
  assert.match(state, new RegExp(`${LABEL}.*loaded again`));
  assert.match(state, /services are removed/);
  assert.ok(!SECRET_VALUES.some((value) => state.includes(value)));
  assertNoSecretsPrinted(machine);
});
