#!/usr/bin/env node
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
  sync [options]                       run one whole sync now (sync --help lists the options)`;

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

async function confirm(question, defaultYes) {
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} ${defaultYes ? '[Y/n]' : '[y/N]'} `)).trim().toLowerCase();
  rl.close();
  return answer === '' ? defaultYes : answer.startsWith('y');
}

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
  const { join } = await import('node:path');
  const { codeRoot, mainCheckout, paths } = await import('../src/config.ts');
  const { createSecretStore } = await import('../src/secrets/store.ts');
  const { readConnection } = await import('../src/sync/state.ts');
  const { walkthrough } = await import('../src/setup/walkthrough.ts');
  const { skillLinkState } = await import('../src/setup/skill-link.ts');

  const code = codeRoot();
  const main = mainCheckout(code);
  const files = paths();
  const log = (line) => console.log(line);
  const connection = () => {
    const found = readConnection(files.xConnection);
    return found ? { handle: found.handle } : undefined;
  };
  const skillDir = join(code, 'packages', 'skill');

  const result = await walkthrough({
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    yes,
    log,
    confirm,
    secret: (prompt) => readKey(prompt),
    checks: () => service.setupChecks(),
    worktreeOf: main === code ? null : main,
    async services() {
      const status = await service.serviceStatus();
      return {
        installed: status.units.every((unit) => unit.installed),
        running: status.units.every((unit) => unit.running),
        dataRoot: status.dataRoot,
        here: status.here,
        upgradeSafeNode: status.node.upgradeSafePath,
        buildBehindCode: status.buildBehindCode,
      };
    },
    install: () => service.installService({ log: (line) => log(`  ${line}`) }),
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
    skill: skillLinkState,
    async linkSkill() {
      return spawnSync('bash', [join(skillDir, 'install.sh')], { stdio: 'inherit' }).status === 0;
    },
  });
  if (!result.ok) process.exit(1);
}

const ago = (ms) => {
  if (ms < 120_000) return `${Math.round(ms / 1000)} s`;
  if (ms < 120 * 60_000) return `${Math.round(ms / 60_000)} min`;
  return `${Math.round(ms / 3_600_000)} h`;
};

async function status() {
  const report = await service.serviceStatus();
  for (const unit of report.units) {
    const state = !unit.installed ? 'not installed' : unit.running ? 'running' : unit.loaded ? 'loaded, not running' : 'installed, not loaded';
    console.log(`[status] ${unit.name.padEnd(16)} ${state}${unit.installed ? `  (${unit.file})` : ''}`);
  }
  if (report.units.some((unit) => unit.name.endsWith('-web') && unit.running)) {
    console.log(`[status] web app           ${report.appUrl}`);
  }
  const { worker } = report;
  if (worker === null) console.log('[status] worker heartbeat  none: the worker has not run here');
  else {
    const doing = worker.state === 'running' ? 'syncing' : `idle, ${worker.schedule}${worker.nextRunAt ? `, next run in ${ago(Math.max(0, Date.parse(worker.nextRunAt) - Date.now()))}` : ''}`;
    const stale = worker.fresh ? '' : ' (stale: the worker is not running)';
    console.log(`[status] worker heartbeat  ${ago(worker.heartbeatAgeMs)} ago${stale}; ${doing}`);
    const last = worker.lastAttempt;
    if (last === null) console.log('[status] last sync         none yet');
    else {
      const when = `finished ${ago(Date.now() - Date.parse(last.finishedAt))} ago (${last.trigger === 'request' ? 'requested' : 'scheduled'})`;
      console.log(`[status] last sync         ${last.result}, ${when}${last.message ? `: ${last.message}` : ''}`);
    }
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
  if (node.upgradeSafePath) {
    console.log(`[status]                   Homebrew deletes this path when it upgrades Node, and the services stop: run bun run service:install to use ${node.upgradeSafePath}`);
  }
  if (report.buildBehindCode) {
    console.log('[status] build             the services run an earlier commit than this checkout (a git pull?): run bun run service:install to rebuild and restart them');
  }
  if (report.bootHint) console.log(`[status] boot              ${report.bootHint}`);
  const healthy =
    report.units.every((unit) => unit.running) &&
    worker !== null &&
    worker.fresh &&
    node.exists &&
    node.inRange !== false &&
    !report.buildBehindCode;
  if (!healthy) process.exitCode = 1;
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
  case 'sync': {
    const { syncCommand } = await import('./sync.mjs');
    await syncCommand([sub, ...rest].filter((arg) => arg !== undefined));
    break;
  }
  case undefined:
  case '--help':
  case 'help':
    console.log(USAGE);
    break;
  default:
    usage(`unknown command: ${command}`);
}
