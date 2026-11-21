import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createSecretStore } from '../src/secrets/store.ts';
import type { CommandResult, ServiceOptions } from '../src/service/index.ts';
import { installService, serviceSpecs, serviceStatus, setupChecks, uninstallService } from '../src/service/index.ts';
import { renderPlist } from '../src/service/launchd.ts';
import { renderUnit } from '../src/service/systemd.ts';
import { writeConnection, writeWorkerStatus } from '../src/sync/state.ts';
import { tempDir } from './fixtures/export.ts';

const CLI = fileURLToPath(new URL('../bin/x-corpus.mjs', import.meta.url));
const NODE = '/opt/node-26/bin/node';
const SPEC_INPUT = { nodePath: NODE, codeRoot: '/srv/clone', repoRoot: '/srv/clone', home: '/home/someone', port: 3030 };
const SECRET_SESSION = { authToken: 'tok0123456789abcdef', ct0: 'ct00123456789' };
const JEV_KEY = 'jev-key-0123456789abcdef';

function dir(t: TestContext): string {
  const { dir: path, cleanup } = tempDir();
  t.after(cleanup);
  return path;
}

/** Every string in the plist's ProgramArguments array. */
function programArguments(plist: string): string[] {
  const block = /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(plist)?.[1] ?? '';
  return [...block.matchAll(/<string>([^<]*)<\/string>/g)].map((match) => match[1]);
}

/** The plist's EnvironmentVariables as an object. */
function plistEnv(plist: string): Record<string, string> {
  const block = /<key>EnvironmentVariables<\/key>\s*<dict>([\s\S]*?)<\/dict>/.exec(plist)?.[1] ?? '';
  return Object.fromEntries([...block.matchAll(/<key>([^<]*)<\/key>\s*<string>([^<]*)<\/string>/g)].map((m) => [m[1], m[2]]));
}

const plistString = (plist: string, key: string) =>
  new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(plist)?.[1];

test('on macOS each service is a plist that runs the captured node directly with an explicit PATH, restarts on failure and logs under logs/', () => {
  const specs = serviceSpecs(SPEC_INPUT);
  assert.deepEqual(specs.map((spec) => spec.name), ['x-corpus-web', 'x-corpus-worker']);
  for (const spec of specs) {
    const plist = renderPlist(spec);
    assert.equal(plistString(plist, 'Label'), spec.name);
    const args = programArguments(plist);
    assert.equal(args[0], NODE);
    const path = plistEnv(plist).PATH.split(':');
    assert.equal(path[0], '/opt/node-26/bin');
    assert.ok(path.includes('/home/someone/.local/bin'));
    assert.equal(plistEnv(plist).X_CORPUS_ROOT, '/srv/clone');
    assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
    assert.match(plist, /<key>KeepAlive<\/key>\s*<dict>\s*<key>SuccessfulExit<\/key>\s*<false\/>\s*<\/dict>/);
    assert.ok(plistString(plist, 'StandardOutPath')?.startsWith('/srv/clone/logs/'));
    assert.ok(plistString(plist, 'StandardErrorPath')?.startsWith('/srv/clone/logs/'));
    assert.doesNotMatch(plist, /ianpoley|bash/);
  }
  const worker = renderPlist(specs[1]);
  assert.deepEqual(programArguments(worker).slice(1), ['/srv/clone/packages/engine/bin/worker.mjs']);
  assert.deepEqual(programArguments(renderPlist(specs[0])).slice(1, 2), ['/srv/clone/apps/web/node_modules/next/dist/bin/next']);
});

test('on Linux each service is a user unit of Type=exec that restarts on failure after a pause and starts with the user session', () => {
  for (const spec of serviceSpecs(SPEC_INPUT)) {
    const unit = renderUnit(spec);
    const lines = unit.split('\n');
    assert.ok(lines.includes('Type=exec'));
    assert.ok(lines.includes('Restart=on-failure'));
    const restartSec = lines.find((line) => line.startsWith('RestartSec='));
    assert.ok(restartSec && Number(restartSec.slice('RestartSec='.length)) > 0, unit);
    assert.ok(lines.includes('WantedBy=default.target'));
    const execStart = lines.find((line) => line.startsWith('ExecStart='));
    assert.ok(execStart?.startsWith(`ExecStart=${NODE} `), execStart);
    const pathLine = lines.find((line) => line.startsWith('Environment="PATH='));
    assert.ok(pathLine?.startsWith('Environment="PATH=/opt/node-26/bin:'), pathLine);
    assert.ok(pathLine?.includes(':/home/someone/.local/bin'), pathLine);
    assert.ok(lines.includes('Environment="X_CORPUS_ROOT=/srv/clone"'), unit);
    assert.ok(lines.some((line) => line.startsWith('StandardOutput=append:/srv/clone/logs/')), unit);
    assert.doesNotMatch(unit, /ianpoley/);
  }
});

test('the web service serves next start on loopback, on port 3030 unless X_CORPUS_PORT says otherwise', async (t) => {
  const web = (port?: number) => serviceSpecs({ ...SPEC_INPUT, ...(port ? { port } : {}) })[0];
  assert.deepEqual(programArguments(renderPlist(web())).slice(2), ['start', '-H', '127.0.0.1', '-p', '3030']);
  assert.match(renderUnit(web(4000)), /^ExecStart=\S+ \S+next start -H 127\.0\.0\.1 -p 4000$/m);

  // The installer reads the port from X_CORPUS_PORT.
  const machine = fakeMachine(t, 'darwin');
  await installService({ ...machine.options, env: { ...machine.options.env, X_CORPUS_PORT: '4000' } });
  assert.deepEqual(programArguments(machine.unit('x-corpus-web')).slice(-2), ['-p', '4000']);
});

type Machine = {
  options: ServiceOptions & { env: Record<string, string | undefined> };
  root: string;
  configDir: string;
  /** Every command run, as one string each, oldest first. */
  calls: string[];
  loaded: Set<string>;
  unitDir: string;
  unit: (name: string) => string;
  buildExit: number;
  /** What the unit files held when the build ran. */
  unitsAtBuild: Record<string, string | null>;
};

/**
 * A home, clone and config dir in a temp dir, with a fake runner that acts
 * like launchctl or systemctl: it keeps a set of loaded services and refuses
 * to bootstrap one twice or stop one that is not loaded.
 */
function fakeMachine(t: TestContext, platform: 'darwin' | 'linux'): Machine {
  const base = dir(t);
  const home = join(base, 'home');
  const root = join(base, 'clone');
  const configDir = join(base, 'config');
  mkdirSync(home);
  mkdirSync(root);
  const nodePath = join(base, 'node-26', 'bin', 'node');
  mkdirSync(join(base, 'node-26', 'bin'), { recursive: true });
  writeFileSync(nodePath, '');
  const unitDir = platform === 'darwin' ? join(home, 'Library', 'LaunchAgents') : join(home, '.config', 'systemd', 'user');
  const fileOf = (name: string) => join(unitDir, platform === 'darwin' ? `${name}.plist` : `${name}.service`);
  const machine: Machine = {
    root,
    configDir,
    calls: [],
    loaded: new Set(),
    unitDir,
    buildExit: 0,
    unitsAtBuild: {},
    unit: (name) => readFileSync(fileOf(name), 'utf8'),
    options: {
      platform,
      home,
      uid: 501,
      nodePath,
      nodeVersion: 'v26.5.0',
      codeRoot: root,
      env: { X_CORPUS_ROOT: root, X_CORPUS_CONFIG_DIR: configDir, X_CORPUS_SECRET_BACKEND: 'file' },
      log: () => {},
      run: async (command, args): Promise<CommandResult> => {
        machine.calls.push([command, ...args].join(' '));
        const done = (code = 0, stdout = ''): CommandResult => ({ code, stdout, stderr: code === 0 ? '' : 'refused' });
        if (command === nodePath && args[1] === 'build') {
          for (const name of ['x-corpus-web', 'x-corpus-worker']) {
            machine.unitsAtBuild[name] = existsSync(fileOf(name)) ? readFileSync(fileOf(name), 'utf8') : null;
          }
          return done(machine.buildExit);
        }
        if (command === nodePath && args[0] === '--version') return done(0, 'v26.5.0\n');
        if (command === 'launchctl') {
          const [verb, ...rest] = args;
          const label = (target: string) => target.split('/').pop()!;
          if (verb === 'print') return machine.loaded.has(label(rest[0])) ? done(0, 'state = running\n\tpid = 4242\n') : done(113);
          if (verb === 'enable') return done();
          if (verb === 'bootout') return machine.loaded.delete(label(rest[0])) ? done() : done(113);
          if (verb === 'bootstrap') {
            const name = rest[1].split('/').pop()!.replace(/\.plist$/, '');
            if (machine.loaded.has(name) || !existsSync(rest[1])) return done(5);
            machine.loaded.add(name);
            return done();
          }
          if (verb === 'kickstart') return machine.loaded.has(label(rest[1])) ? done() : done(113);
        }
        if (command === 'systemctl') {
          const [, verb, ...names] = args;
          const bare = names.filter((name) => !name.startsWith('-')).map((name) => name.replace(/\.service$/, ''));
          if (verb === 'daemon-reload') return done();
          if (verb === 'enable' || verb === 'restart') {
            if (!bare.every((name) => existsSync(fileOf(name)))) return done(5);
            if (verb === 'restart') bare.forEach((name) => machine.loaded.add(name));
            return done();
          }
          if (verb === 'stop' || verb === 'disable') {
            bare.forEach((name) => machine.loaded.delete(name));
            return done();
          }
          if (verb === 'is-enabled') return done(0, machine.loaded.has(bare[0]) ? 'enabled\n' : 'disabled\n');
          if (verb === 'is-active') return done(machine.loaded.has(bare[0]) ? 0 : 3, machine.loaded.has(bare[0]) ? 'active\n' : 'inactive\n');
        }
        return done(64);
      },
    },
  };
  return machine;
}

test('install stops the web service, builds, writes both plists, then loads and starts both; installing again updates them', async (t) => {
  const machine = fakeMachine(t, 'darwin');
  mkdirSync(machine.unitDir, { recursive: true });
  writeFileSync(join(machine.unitDir, 'x-corpus-web.plist'), 'old web plist');
  machine.loaded.add('x-corpus-web');

  await installService(machine.options);

  // The build ran against the old unit files, after the web service was stopped.
  assert.deepEqual(machine.unitsAtBuild, { 'x-corpus-web': 'old web plist', 'x-corpus-worker': null });
  const step = (prefix: string) => machine.calls.findIndex((call) => call.startsWith(prefix));
  assert.ok(step('launchctl bootout gui/501/x-corpus-web') < step(`${machine.options.nodePath} `), machine.calls.join('\n'));
  assert.ok(step(`${machine.options.nodePath} `) < step('launchctl bootstrap'));
  assert.ok(step('launchctl bootstrap') < step('launchctl kickstart'));
  for (const name of ['x-corpus-web', 'x-corpus-worker']) {
    assert.ok(machine.calls.includes(`launchctl bootstrap gui/501 ${join(machine.unitDir, `${name}.plist`)}`));
    assert.ok(machine.calls.includes(`launchctl kickstart -k gui/501/${name}`));
    assert.equal(programArguments(machine.unit(name))[0], machine.options.nodePath);
  }
  assert.deepEqual([...machine.loaded].sort(), ['x-corpus-web', 'x-corpus-worker']);
  assert.ok(statSync(join(machine.root, 'logs')).isDirectory());

  // The update path: both are loaded now, and installing again replaces them.
  await installService(machine.options);
  assert.deepEqual([...machine.loaded].sort(), ['x-corpus-web', 'x-corpus-worker']);
});

test('a failed build leaves the old units in place and loads nothing', async (t) => {
  const machine = fakeMachine(t, 'darwin');
  mkdirSync(machine.unitDir, { recursive: true });
  writeFileSync(join(machine.unitDir, 'x-corpus-web.plist'), 'old web plist');
  machine.buildExit = 1;

  await assert.rejects(installService(machine.options), /build/);
  assert.equal(machine.unit('x-corpus-web'), 'old web plist');
  assert.equal(existsSync(join(machine.unitDir, 'x-corpus-worker.plist')), false);
  assert.equal(machine.calls.some((call) => call.startsWith('launchctl bootstrap')), false);
});

test('install stops when the node running it is outside the supported range', async (t) => {
  const machine = fakeMachine(t, 'darwin');
  await assert.rejects(installService({ ...machine.options, nodeVersion: 'v24.17.0' }), />=25\.8\.1 <27/);
  assert.deepEqual(machine.calls, []);
});

test('install refuses from a linked git worktree, names the main checkout, and touches nothing', async (t) => {
  const machine = fakeMachine(t, 'darwin');
  const main = join(machine.root, '..', 'main');
  const worktree = join(machine.root, '..', 'worktree');
  mkdirSync(join(main, '.git', 'worktrees', 'wt'), { recursive: true });
  writeFileSync(join(main, '.git', 'worktrees', 'wt', 'commondir'), '../..\n');
  mkdirSync(worktree);
  writeFileSync(join(worktree, '.git'), `gitdir: ${join(main, '.git', 'worktrees', 'wt')}\n`);
  await assert.rejects(installService({ ...machine.options, codeRoot: worktree }), (error: Error) => {
    assert.match(error.message, /git worktree/);
    assert.ok(error.message.includes(main));
    return true;
  });
  assert.deepEqual(machine.calls, []);
  assert.equal(existsSync(machine.unitDir), false);
});

test('install on macOS refuses while the old nightly job is installed and points at migrate, unless migrate is the caller', async (t) => {
  const machine = fakeMachine(t, 'darwin');
  mkdirSync(machine.unitDir, { recursive: true });
  writeFileSync(join(machine.unitDir, 'com.ianpoley.birdclaw-nightly.plist'), 'old job');
  await assert.rejects(installService(machine.options), /bun run migrate/);
  assert.deepEqual(machine.calls, []);
  await installService({ ...machine.options, migrating: true });
  assert.ok(machine.loaded.has('x-corpus-worker'));
});

test('on Linux install writes both units, reloads systemd, enables and restarts both', async (t) => {
  const machine = fakeMachine(t, 'linux');
  await installService(machine.options);
  await installService(machine.options);
  for (const name of ['x-corpus-web', 'x-corpus-worker']) {
    assert.ok(machine.unit(name).includes(`ExecStart=${machine.options.nodePath} `));
  }
  const reload = machine.calls.lastIndexOf('systemctl --user daemon-reload');
  const enable = machine.calls.lastIndexOf('systemctl --user enable x-corpus-web.service x-corpus-worker.service');
  const restart = machine.calls.lastIndexOf('systemctl --user restart x-corpus-web.service x-corpus-worker.service');
  assert.ok(reload >= 0 && reload < enable && enable < restart, machine.calls.join('\n'));
  assert.ok(machine.calls.includes('systemctl --user stop x-corpus-web.service'));
  assert.deepEqual([...machine.loaded].sort(), ['x-corpus-web', 'x-corpus-worker']);
});

async function storeSecrets(machine: Machine) {
  const store = createSecretStore({ env: machine.options.env });
  assert.equal((await store.set('x-session', SECRET_SESSION)).ok, true);
  assert.equal((await store.set('typesafe-api-key', JEV_KEY)).ok, true);
  writeConnection(join(machine.configDir, 'x-connection.json'), { handle: 'someone', connectedAt: '2026-11-01T00:00:00.000Z' });
  return store;
}

for (const platform of ['darwin', 'linux'] as const) {
  test(`uninstall on ${platform} removes both units and keeps the secrets`, async (t) => {
    const machine = fakeMachine(t, platform);
    const store = await storeSecrets(machine);
    await installService(machine.options);

    await uninstallService(machine.options);
    assert.deepEqual(readdirSync(machine.unitDir), []);
    assert.deepEqual([...machine.loaded], []);
    assert.deepEqual(await store.get('x-session'), { ok: true, value: SECRET_SESSION });
    assert.deepEqual(await store.get('typesafe-api-key'), { ok: true, value: JEV_KEY });
  });
}

test('uninstall with purgeSecrets also deletes the secrets, the backend choice and the X connection', async (t) => {
  const machine = fakeMachine(t, 'darwin');
  await storeSecrets(machine);
  await installService(machine.options);

  await uninstallService({ ...machine.options, purgeSecrets: true });
  assert.deepEqual(readdirSync(machine.unitDir), []);
  // Read through a fresh store: with no backend recorded, nothing is set.
  const store = createSecretStore({ env: machine.options.env });
  assert.equal(store.backend(), null);
  assert.deepEqual(await store.get('x-session'), { ok: true, value: null });
  assert.equal(existsSync(join(machine.configDir, 'secrets.env')), false);
  assert.equal(existsSync(join(machine.configDir, 'x-connection.json')), false);
});

test('status reports each unit, the worker heartbeat, the recorded backend and the captured node', async (t) => {
  const machine = fakeMachine(t, 'darwin');
  await storeSecrets(machine);
  await installService(machine.options);
  writeWorkerStatus(join(machine.root, 'state', 'worker.json'), {
    pid: 4242,
    heartbeatAt: new Date(Date.now() - 30_000).toISOString(),
    state: 'idle',
    schedule: 'scheduled',
    nextRunAt: null,
    lastAttempt: null,
    secretBackend: 'file',
  });

  const status = await serviceStatus(machine.options);
  assert.deepEqual(
    status.units.map((unit) => [unit.name, unit.installed, unit.running]),
    [
      ['x-corpus-web', true, true],
      ['x-corpus-worker', true, true],
    ],
  );
  assert.ok(status.worker !== null && status.worker.heartbeatAgeMs >= 30_000 && status.worker.heartbeatAgeMs < 60_000);
  assert.equal(status.worker.fresh, true);
  assert.equal(status.secretBackend, 'file');
  assert.deepEqual(status.node, { path: machine.options.nodePath, exists: true, version: 'v26.5.0', inRange: true, range: '>=25.8.1 <27' });

  // After a Node upgrade removed the captured node, status says so.
  rmSync(machine.options.nodePath!);
  const after = await serviceStatus(machine.options);
  assert.equal(after.node.exists, false);
  assert.equal(after.node.inRange, null);
});

test('status before install reports nothing installed and no heartbeat', async (t) => {
  const machine = fakeMachine(t, 'linux');
  const status = await serviceStatus(machine.options);
  assert.deepEqual(status.units.map((unit) => [unit.installed, unit.running]), [
    [false, false],
    [false, false],
  ]);
  assert.equal(status.worker, null);
  assert.equal(status.node.path, null);
});

test('setup on Node 24.17 fails the Node check naming the required range, and checks nothing else', async () => {
  const checks = await setupChecks({ nodeVersion: 'v24.17.0', env: { X_CORPUS_SECRET_BACKEND: 'file' } });
  assert.equal(checks.length, 1);
  assert.equal(checks[0].level, 'fail');
  assert.match(checks[0].detail, />=25\.8\.1 <27/);
  assert.match(checks[0].detail, /24\.17\.0/);
});

test('setup on a supported Node finds the pinned Birdclaw and bird, and never records a secret backend', async (t) => {
  const configDir = dir(t);
  const checks = await setupChecks({ nodeVersion: 'v26.5.0', env: { X_CORPUS_CONFIG_DIR: configDir, X_CORPUS_SECRET_BACKEND: 'file' } });
  const byName = Object.fromEntries(checks.map((check) => [check.name, check]));
  assert.equal(byName.node.level, 'ok');
  assert.equal(byName.birdclaw.level, 'ok');
  assert.equal(byName.bird.level, 'ok');
  assert.ok(['ok', 'warn'].includes(byName.claude.level));
  assert.ok(byName['secret store']);
  assert.deepEqual(readdirSync(configDir), []);
});

test('secrets set-jev stores the key read from stdin and never prints it', (t) => {
  const configDir = dir(t);
  const result = spawnSync(process.execPath, [CLI, 'secrets', 'set-jev'], {
    input: `${JEV_KEY}\n`,
    encoding: 'utf8',
    env: { ...process.env, X_CORPUS_CONFIG_DIR: configDir, X_CORPUS_SECRET_BACKEND: 'file', TYPESAFE_API_KEY: '' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes(JEV_KEY) && !result.stderr.includes(JEV_KEY));
  assert.match(readFileSync(join(configDir, 'secrets.env'), 'utf8'), new RegExp(`TYPESAFE_API_KEY='${JEV_KEY}'`));
});
