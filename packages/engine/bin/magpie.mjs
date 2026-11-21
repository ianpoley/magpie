#!/usr/bin/env node
//
//     node packages/engine/bin/magpie.mjs <command>   (or: bun run setup, bun run service:install, ...)
//
// Exits 0 on success, 1 when the command failed and 2 for a bad argument.

import { readFileSync } from 'node:fs';

const USAGE = `Usage: magpie.mjs <command>

Commands:
  setup [--yes]                        check this machine, then take each first-run step not done yet: background
                                       services, Connect X, the Jev key and the Claude skill. At a terminal it asks
                                       first; --yes takes the steps that hold no secret and replace nothing; with
                                       neither it only reports what is left
  service install                      build the web app, then install (or update) and restart both background services
  service uninstall [--purge-secrets]  stop and remove both services; --purge-secrets also deletes the stored
                                       X cookies and Jev key and disconnects X
  service status                       show both services, the worker's heartbeat, the secret backend and the node they run
  secrets set-jev                      store the Jev (TypeSafe) API key, read from stdin (typed hidden at a terminal)
  sync [options]                       run one whole sync now (sync --help lists the options)
  migrate [--timeout-minutes N]        move an install run by the old nightly LaunchAgent onto the secret store
                                       and these services; nothing old is deleted until the new worker finishes
                                       one good sync, and any failure puts the old job back (default wait 15 min)`;

// A Node too old to run TypeScript would fail with a loader error; name the range instead.
let service;
try {
  service = await import('../src/service/index.ts');
} catch (error) {
  if (error?.code !== 'ERR_UNKNOWN_FILE_EXTENSION') throw error;
  const range = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')).engines?.node;
  console.error(`magpie needs Node ${range}; this is Node ${process.version}.`);
  process.exit(1);
}
const { errorText } = await import('../src/util.ts');

function usage(message) {
  if (message) console.error(`${message}\n`);
  console.error(USAGE);
  process.exit(2);
}

const fail = (prefix, error) => {
  console.error(`${prefix} ${errorText(error)}`);
  process.exit(1);
};

/** Yes or no at a terminal; Enter takes the default. */
async function confirm(question, defaultYes) {
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} ${defaultYes ? '[Y/n]' : '[y/N]'} `)).trim().toLowerCase();
  rl.close();
  return answer === '' ? defaultYes : answer.startsWith('y');
}

/** Polls for the X connection until it appears or the person presses Enter. */
function waitForConnection(readConnection) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const finish = (value) => {
      clearInterval(timer);
      stdin.off('data', onData);
      stdin.pause();
      resolve(value);
    };
    const onData = () => finish(undefined);
    const timer = setInterval(() => {
      const connection = readConnection();
      if (connection) finish(connection);
    }, 2_000);
    stdin.on('data', onData);
    stdin.resume();
  });
}

async function setup(args) {
  const yes = args.includes('--yes');
  const { spawn, spawnSync } = await import('node:child_process');
  const { existsSync, lstatSync, realpathSync } = await import('node:fs');
  const { homedir } = await import('node:os');
  const { join } = await import('node:path');
  const { codeRoot, mainCheckout, paths, usesLegacyNames } = await import('../src/config.ts');
  const { createSecretStore } = await import('../src/secrets/store.ts');
  const { readConnection } = await import('../src/sync/state.ts');
  const { walkthrough } = await import('../src/setup/walkthrough.ts');

  const code = codeRoot();
  const main = mainCheckout(code);
  const files = paths();
  const log = (line) => console.log(line);
  const connection = () => {
    const found = readConnection(files.xConnection);
    return found ? { handle: found.handle } : undefined;
  };
  const skillDir = join(code, 'packages', 'skill');
  const skillLink = join(homedir(), '.claude', 'skills', 'magpie');

  const result = await walkthrough({
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    yes,
    log,
    confirm,
    secret: (prompt) => readKey(prompt),
    checks: () => service.setupChecks(),
    worktreeOf: main === code ? null : main,
    legacy: service.legacyInstall(),
    async services() {
      const status = await service.serviceStatus();
      return {
        installed: status.units.every((unit) => unit.installed),
        running: status.units.every((unit) => unit.running),
        dataRoot: status.dataRoot,
        here: status.here,
        legacy: status.legacyUnits.length > 0 || usesLegacyNames(),
      };
    },
    install: () => service.installService({ log: (line) => log(`  ${line}`) }),
    async migrate() {
      const { migrate } = await import('../src/migrate/legacy.ts');
      const done = await migrate({ log: (line) => log(`  ${line}`) });
      return done.ok ? { ok: true, message: '' } : { ok: false, message: `${done.message} ${done.state.join(' ')}` };
    },
    connection,
    appUrl: `http://127.0.0.1:${service.webPort()}`,
    async openApp(url) {
      const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
      spawn(opener, [url], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
    },
    waitForConnection: () => waitForConnection(connection),
    async jevStored() {
      const read = await createSecretStore().get('typesafe-api-key');
      return read.ok && Boolean(read.value);
    },
    async storeJev(key) {
      const stored = await createSecretStore().set('typesafe-api-key', key);
      if (!stored.ok) return { ok: false, message: stored.message };
      return { ok: true, message: stored.backend === 'keychain' ? 'in the OS secret store' : `in ${files.secrets}, owner-only` };
    },
    skill() {
      if (!existsSync(join(homedir(), '.claude'))) return 'none';
      try {
        lstatSync(skillLink);
      } catch {
        return 'missing';
      }
      try {
        return realpathSync(skillLink) === realpathSync(skillDir) ? 'linked' : 'elsewhere';
      } catch {
        return 'elsewhere';
      }
    },
    async linkSkill() {
      spawnSync('bash', [join(skillDir, 'install.sh')], { stdio: 'inherit' });
    },
  });
  if (!result.ok) process.exit(1);
}

const ago = (ms) => (ms < 120_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`);

async function status() {
  const report = await service.serviceStatus();
  for (const unit of report.units) {
    const state = !unit.installed ? 'not installed' : unit.running ? 'running' : unit.loaded ? 'loaded, not running' : 'installed, not loaded';
    console.log(`[status] ${unit.name.padEnd(16)} ${state}${unit.installed ? `  (${unit.file})` : ''}`);
  }
  if (report.legacyUnits.length > 0) {
    console.log('[status] old names         these services still run as x-corpus: run bun run setup (or bun run service:install) to rename them to magpie');
  }
  const { worker } = report;
  if (worker === null) console.log('[status] worker heartbeat  none: the worker has not run here');
  else {
    const doing = worker.state === 'running' ? 'syncing' : `idle, ${worker.schedule}${worker.nextRunAt ? `, next run ${worker.nextRunAt}` : ''}`;
    const stale = worker.fresh ? '' : ' (stale: the worker is not running)';
    console.log(`[status] worker heartbeat  ${ago(worker.heartbeatAgeMs)} ago${stale}; ${doing}`);
  }
  const backend = {
    keychain: 'the OS secret store',
    file: 'the owner-only secrets file (no OS secret store was usable)',
  }[report.secretBackend] ?? 'none recorded yet (nothing has been stored)';
  console.log(`[status] secret backend    ${backend}`);
  const { node } = report;
  if (node.path === null) console.log('[status] node              no service is installed');
  else if (!node.exists) console.log(`[status] node              ${node.path} is gone: the services cannot start; run bun run service:install`);
  else if (node.inRange === null) console.log(`[status] node              ${node.path} did not report its version`);
  else {
    const verdict = node.inRange ? `within ${node.range}` : `outside ${node.range}: run bun run service:install with a Node in range`;
    console.log(`[status] node              ${node.path} (${node.version}, ${verdict})`);
  }
}

async function serviceCommand(sub, args) {
  const log = (line) => console.log(`[service] ${line}`);
  if (sub === 'install' && args.length === 0) {
    await service.installService({ log }).catch((error) => fail('[service] install failed:', error));
  } else if (sub === 'uninstall' && args.every((arg) => arg === '--purge-secrets')) {
    const purgeSecrets = args.includes('--purge-secrets');
    await service.uninstallService({ log, purgeSecrets }).catch((error) => fail('[service] uninstall failed:', error));
  } else if (sub === 'status' && args.length === 0) {
    await status();
  } else {
    usage(`unknown service command: ${[sub, ...args].join(' ')}`);
  }
}

/** The key from stdin: typed with echo off at a terminal, otherwise everything piped in. */
async function readKey(prompt = 'Jev (TypeSafe) API key (typing is hidden): ') {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    let text = '';
    for await (const chunk of stdin) text += chunk;
    return text.trim();
  }
  process.stderr.write(prompt);
  return new Promise((resolve) => {
    let key = '';
    const finish = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      process.stderr.write('\n');
    };
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\u0003') {
          finish();
          process.exit(130);
        }
        if (char === '\r' || char === '\n' || char === '\u0004') {
          finish();
          resolve(key.trim());
          return;
        }
        key = char === '\u007f' || char === '\b' ? key.slice(0, -1) : key + char;
      }
    };
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
    stdin.resume();
  });
}

async function setJev() {
  const key = await readKey();
  if (!key) fail('[secrets]', 'no key was given; nothing was stored');
  const { paths } = await import('../src/config.ts');
  const { createSecretStore } = await import('../src/secrets/store.ts');
  const stored = await createSecretStore().set('typesafe-api-key', key);
  if (!stored.ok) fail('[secrets] the key was not stored:', stored.message);
  const where =
    stored.backend === 'keychain'
      ? 'the OS secret store'
      : `${paths().secrets}, an owner-only plaintext file, because no OS secret store was usable`;
  console.log(`[secrets] the Jev key is stored in ${where}`);
}

async function migrateCommand(args) {
  let timeoutMs;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') {
      console.log(USAGE);
      return;
    }
    if (args[i] === '--timeout-minutes' && /^\d+(\.\d+)?$/.test(args[i + 1] ?? '') && Number(args[i + 1]) > 0) {
      timeoutMs = Number(args[++i]) * 60_000;
    } else {
      usage(`unknown migrate argument: ${args[i]}`);
    }
  }
  const { migrate } = await import('../src/migrate/legacy.ts');
  const result = await migrate({ timeoutMs, log: (line) => console.log(`[migrate] ${line}`) }).catch((error) =>
    fail('[migrate] the migration stopped unexpectedly; check the old job and the services by hand:', error),
  );
  if (!result.ok) {
    console.error(`[migrate] the migration did not complete: ${result.message}`);
    console.error('[migrate] this machine is now in this state:');
    for (const line of result.state) console.error(`[migrate]   ${line}`);
    process.exit(1);
  }
}

const [command, sub, ...rest] = process.argv.slice(2);
switch (command) {
  case 'setup': {
    const args = [sub, ...rest].filter((arg) => arg !== undefined);
    if (args.some((arg) => arg !== '--yes')) usage(`unknown setup argument: ${args.find((arg) => arg !== '--yes')}`);
    await setup(args);
    break;
  }
  case 'service':
    await serviceCommand(sub, rest);
    break;
  case 'secrets':
    if (sub !== 'set-jev' || rest.length > 0) usage(`unknown secrets command: ${[sub, ...rest].join(' ')}`);
    await setJev();
    break;
  case 'sync':
    // The sync command reads its own options from argv, so it sees them without the word `sync`.
    process.argv.splice(2, 1);
    await import('./sync.mjs');
    break;
  case 'migrate':
    await migrateCommand([sub, ...rest].filter((arg) => arg !== undefined));
    break;
  case undefined:
  case '--help':
  case 'help':
    console.log(USAGE);
    break;
  default:
    usage(`unknown command: ${command}`);
}
