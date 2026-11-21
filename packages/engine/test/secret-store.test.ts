import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';

import { createJevClient } from '../src/jev/client.ts';
import { createSecretStore } from '../src/secrets/store.ts';
import { tempDir } from './fixtures/export.ts';

const SERVICE = 'magpie-test-service';
const SESSION = { authToken: 'abc%2E_-0123456789abcdef', ct0: 'def0123456789' };

type Stub = {
  path: string;
  calls: () => string[][];
  stdin: () => string;
  items: () => Record<string, string>;
};

function stubTool(t: TestContext, kind: 'security' | 'secret-tool', behavior: 'ok' | 'hang' | 'fail' = 'ok'): Stub {
  const { dir, cleanup } = tempDir();
  t.after(cleanup);
  const items = join(dir, 'items');
  mkdirSync(items);
  const path = join(dir, kind);
  const record = [
    `printf '%s\\0' "$@" >> '${dir}/argv'`,
    `printf '\\n' >> '${dir}/argv'`,
    behavior === 'hang' ? 'exec sleep 5' : '',
    behavior === 'fail' ? `echo 'stub refused' >&2; exit ${kind === 'security' ? 45 : 1}` : '',
    'after() { want=$1; shift; while [ $# -gt 0 ]; do if [ "$1" = "$want" ]; then printf %s "$2"; return; fi; shift; done; }',
  ];
  const security = [
    'if [ "$1" = "-i" ]; then',
    `  IFS= read -r line; printf '%s\\n' "$line" >> '${dir}/stdin'`,
    `  account=$(printf %s "$line" | sed -n "s/.* -a \\([^ ]*\\) .*/\\1/p")`,
    `  printf %s "$line" | sed -n "s/.* -w '\\(.*\\)'$/\\1/p" > '${items}'/"$account"`,
    '  exit 0',
    'fi',
    'account=$(after -a "$@")',
    'case "$1" in',
    `  find-generic-password) [ -f '${items}'/"$account" ] || exit 44; cat '${items}'/"$account" ;;`,
    `  delete-generic-password) [ -f '${items}'/"$account" ] || exit 44; rm '${items}'/"$account" ;;`,
    '  *) exit 2 ;;',
    'esac',
  ];
  const secretTool = [
    'account=$(after account "$@")',
    'case "$1" in',
    `  store) cat > '${items}'/"$account"; cat '${items}'/"$account" >> '${dir}/stdin' ;;`,
    `  lookup) [ -f '${items}'/"$account" ] || exit 1; cat '${items}'/"$account" ;;`,
    `  clear) rm -f '${items}'/"$account" ;;`,
    '  *) exit 2 ;;',
    'esac',
  ];
  writeFileSync(path, ['#!/bin/sh', ...record, ...(kind === 'security' ? security : secretTool), ''].join('\n'));
  chmodSync(path, 0o755);
  const read = (name: string) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8') : '');
  return {
    path,
    calls: () =>
      read('argv')
        .split('\n')
        .filter(Boolean)
        .map((line) => line.split('\0').slice(0, -1)),
    stdin: () => read('stdin'),
    items: () => Object.fromEntries(readdirSync(items).map((name) => [name, readFileSync(join(items, name), 'utf8')])),
  };
}

function configDir(t: TestContext): string {
  const { dir, cleanup } = tempDir();
  t.after(cleanup);
  return dir;
}

const env = (dir: string, extra: Record<string, string> = {}) => ({
  MAGPIE_CONFIG_DIR: dir,
  MAGPIE_KEYCHAIN_SERVICE: SERVICE,
  ...extra,
});

const recordedBackend = (dir: string): unknown => JSON.parse(readFileSync(join(dir, 'secret-backend.json'), 'utf8')).backend;

const modeOf = (path: string) => statSync(path).mode & 0o777;

test('on macOS the session travels to security on stdin only, and reads back as the same pair', async (t) => {
  const dir = configDir(t);
  const security = stubTool(t, 'security');
  const store = createSecretStore({ env: env(dir), platform: 'darwin', securityPath: security.path });

  assert.deepEqual(await store.set('x-session', SESSION), { ok: true, backend: 'keychain' });
  assert.deepEqual(await store.get('x-session'), { ok: true, value: SESSION });

  for (const argv of security.calls()) {
    assert.ok(!argv.some((arg) => arg.includes(SESSION.authToken) || arg.includes(SESSION.ct0)), argv.join(' '));
    assert.ok(!argv.includes('-A'));
  }
  assert.ok(security.stdin().includes(SESSION.authToken));
  assert.equal(recordedBackend(dir), 'keychain');
  assert.equal(existsSync(join(dir, 'secrets.env')), false);
});

test('on Linux the session travels to secret-tool on stdin only', async (t) => {
  const dir = configDir(t);
  const secretTool = stubTool(t, 'secret-tool');
  const store = createSecretStore({ env: env(dir), platform: 'linux', secretToolPath: secretTool.path });

  assert.deepEqual(await store.set('x-session', SESSION), { ok: true, backend: 'keychain' });
  assert.deepEqual(await store.get('x-session'), { ok: true, value: SESSION });

  for (const argv of secretTool.calls()) {
    assert.ok(!argv.some((arg) => arg.includes(SESSION.authToken)), argv.join(' '));
    assert.equal(argv[argv.indexOf('service') + 1], SERVICE);
  }
  assert.equal(JSON.parse(secretTool.items()['x-session']).authToken, SESSION.authToken);
});

test('a failed probe on Linux records the file backend and writes an owner-only file', async (t) => {
  const dir = configDir(t);
  const secretTool = stubTool(t, 'secret-tool', 'fail');
  const store = createSecretStore({ env: env(dir), platform: 'linux', secretToolPath: secretTool.path });

  assert.deepEqual(await store.set('x-session', SESSION), { ok: true, backend: 'file' });

  assert.equal(recordedBackend(dir), 'file');
  assert.equal(modeOf(join(dir, 'secrets.env')), 0o600);
  assert.deepEqual(await store.get('x-session'), { ok: true, value: SESSION });
});

test('with the keychain recorded, a hung security call reads as locked and the file is never used', async (t) => {
  const dir = configDir(t);
  writeFileSync(join(dir, 'secret-backend.json'), JSON.stringify({ backend: 'keychain' }));
  const security = stubTool(t, 'security', 'hang');
  const store = createSecretStore({ env: env(dir), platform: 'darwin', securityPath: security.path, timeoutMs: 300 });
  const started = Date.now();

  const read = await store.get('x-session');

  assert.equal(read.ok, false);
  assert.equal(!read.ok && read.reason, 'locked');
  assert.ok(Date.now() - started < 3_000);
  assert.equal(existsSync(join(dir, 'secrets.env')), false);
});

test('a fallback file other users can read is refused with a message saying so', async (t) => {
  const dir = configDir(t);
  writeFileSync(join(dir, 'secret-backend.json'), JSON.stringify({ backend: 'file' }));
  const file = join(dir, 'secrets.env');
  writeFileSync(file, `X_SESSION='${JSON.stringify(SESSION)}'\n`);
  chmodSync(file, 0o644);
  const store = createSecretStore({ env: env(dir), platform: 'darwin' });

  const read = await store.get('x-session');

  assert.equal(read.ok, false);
  assert.match(String(!read.ok && read.message), /other users.*chmod 600/s);
  assert.ok(!String(!read.ok && read.message).includes(SESSION.authToken));
});

test('cookies with a newline, a quote, a space or over 512 characters are rejected before any tool runs', async (t) => {
  const dir = configDir(t);
  const security = stubTool(t, 'security');
  const store = createSecretStore({ env: env(dir), platform: 'darwin', securityPath: security.path });

  for (const authToken of ['abc\ndef', "abc'def", 'abc"def', 'abc def', 'a'.repeat(513), '']) {
    const written = await store.set('x-session', { authToken, ct0: 'def' });
    assert.equal(!written.ok && written.reason, 'invalid', JSON.stringify(authToken));
  }
  assert.deepEqual(security.calls(), []);
  assert.equal(existsSync(join(dir, 'secret-backend.json')), false);
});

test('a deleted secret reads as not set', async (t) => {
  const dir = configDir(t);
  const security = stubTool(t, 'security');
  const store = createSecretStore({ env: env(dir), platform: 'darwin', securityPath: security.path });
  await store.set('x-session', SESSION);

  assert.deepEqual(await store.delete('x-session'), { ok: true });

  assert.deepEqual(await store.get('x-session'), { ok: true, value: null });
  assert.deepEqual(security.items(), {});
});

test('with the keychain recorded, a failed write is unavailable and never falls back to the file', async (t) => {
  const dir = configDir(t);
  writeFileSync(join(dir, 'secret-backend.json'), JSON.stringify({ backend: 'keychain' }));
  const security = stubTool(t, 'security', 'fail');
  const store = createSecretStore({ env: env(dir), platform: 'darwin', securityPath: security.path });

  const written = await store.set('x-session', SESSION);

  assert.equal(!written.ok && written.reason, 'unavailable');
  assert.equal(recordedBackend(dir), 'keychain');
  assert.equal(existsSync(join(dir, 'secrets.env')), false);
});

test('delete removes the secret from both the keychain and the fallback file', async (t) => {
  const dir = configDir(t);
  const security = stubTool(t, 'security');
  const store = createSecretStore({ env: env(dir), platform: 'darwin', securityPath: security.path });
  await store.set('x-session', SESSION);
  const file = join(dir, 'secrets.env');
  writeFileSync(file, `X_SESSION='${JSON.stringify(SESSION)}'\nTYPESAFE_API_KEY='kept-key'\n`, { mode: 0o600 });

  assert.deepEqual(await store.delete('x-session'), { ok: true });

  assert.deepEqual(security.items(), {});
  assert.ok(!readFileSync(file, 'utf8').includes(SESSION.authToken));
  assert.match(readFileSync(file, 'utf8'), /TYPESAFE_API_KEY='kept-key'/);
});

test('with the file recorded, delete succeeds even when the OS store refuses', async (t) => {
  const dir = configDir(t);
  const secretTool = stubTool(t, 'secret-tool', 'fail');
  const store = createSecretStore({ env: env(dir), platform: 'linux', secretToolPath: secretTool.path });
  await store.set('x-session', SESSION);

  assert.deepEqual(await store.delete('x-session'), { ok: true });

  assert.deepEqual(await store.get('x-session'), { ok: true, value: null });
});

function useProcessEnv(t: TestContext, values: Record<string, string | undefined>) {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(values)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('the Jev client takes its key from the store, and without one fails with the no-key error', async (t) => {
  const dir = configDir(t);
  useProcessEnv(t, {
    MAGPIE_CONFIG_DIR: dir,
    MAGPIE_SECRET_BACKEND: 'file',
    MAGPIE_KEYCHAIN_SERVICE: SERVICE,
    TYPESAFE_API_KEY: undefined,
  });

  await assert.rejects(createJevClient(), /TYPESAFE_API_KEY is not set/);

  assert.deepEqual(await createSecretStore().set('typesafe-api-key', 'ts-key_123'), { ok: true, backend: 'file' });
  const client = await createJevClient();
  assert.equal(typeof client.ask, 'function');
  assert.match(readFileSync(join(dir, 'secrets.env'), 'utf8'), /TYPESAFE_API_KEY='ts-key_123'/);
});

test('with no backend recorded, the Jev key is read from an existing secrets file without changing it', async (t) => {
  const dir = configDir(t);
  useProcessEnv(t, {
    MAGPIE_CONFIG_DIR: dir,
    MAGPIE_SECRET_BACKEND: undefined,
    MAGPIE_KEYCHAIN_SERVICE: SERVICE,
    TYPESAFE_API_KEY: undefined,
  });
  const file = join(dir, 'secrets.env');
  const text = '# keys for the corpus\nexport TYPESAFE_API_KEY="legacy-key"\n';
  writeFileSync(file, text, { mode: 0o600 });
  const before = statSync(file).mtimeMs;

  const client = await createJevClient();

  assert.equal(typeof client.ask, 'function');
  assert.deepEqual(await createSecretStore().get('typesafe-api-key'), { ok: true, value: 'legacy-key' });
  assert.deepEqual(await createSecretStore().get('x-session'), { ok: true, value: null });
  assert.equal(readFileSync(file, 'utf8'), text);
  assert.equal(statSync(file).mtimeMs, before);
  assert.equal(existsSync(join(dir, 'secret-backend.json')), false);
});
