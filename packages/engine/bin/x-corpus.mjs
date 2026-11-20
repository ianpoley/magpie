#!/usr/bin/env node
//
// x-corpus.mjs
// The x-corpus command line: check the machine, install or remove the two
// background services (the web app and the sync worker), store the Jev key,
// and run a sync by hand.
//
//     node packages/engine/bin/x-corpus.mjs <command>   (or: bun run setup, bun run service:install, ...)
//
// Exits 0 on success, 1 when the command failed and 2 for a bad argument.

import { readFileSync } from 'node:fs';

const USAGE = `Usage: x-corpus.mjs <command>

Commands:
  setup                                check Node, the pinned Birdclaw and bird, the Claude CLI and the secret store
  service install                      build the web app, then install (or update) and restart both background services
  service uninstall [--purge-secrets]  stop and remove both services; --purge-secrets also deletes the stored
                                       X cookies and Jev key and disconnects X
  service status                       show both services, the worker's heartbeat, the secret backend and the node they run
  secrets set-jev                      store the Jev (TypeSafe) API key, read from stdin (typed hidden at a terminal)
  sync [options]                       run one whole sync now (sync --help lists the options)`;

// A Node too old to run TypeScript would fail with a loader error; name the range instead.
let service;
try {
  service = await import('../src/service/index.ts');
} catch (error) {
  if (error?.code !== 'ERR_UNKNOWN_FILE_EXTENSION') throw error;
  const range = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')).engines?.node;
  console.error(`x-corpus needs Node ${range}; this is Node ${process.version}.`);
  process.exit(1);
}

function usage(message) {
  if (message) console.error(`${message}\n`);
  console.error(USAGE);
  process.exit(2);
}

const fail = (prefix, error) => {
  console.error(`${prefix} ${error instanceof Error ? error.message : error}`);
  process.exit(1);
};

async function setup() {
  const checks = await service.setupChecks();
  for (const check of checks) console.log(`[setup] ${service.formatCheck(check)}`);
  if (checks.some((check) => check.level === 'fail')) {
    console.error('[setup] fix the failed checks above, then run setup again');
    process.exit(1);
  }
  console.log('[setup] ready: run bun run service:install to start the background services');
}

const ago = (ms) => (ms < 120_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`);

async function status() {
  const report = await service.serviceStatus();
  for (const unit of report.units) {
    const state = !unit.installed ? 'not installed' : unit.running ? 'running' : unit.loaded ? 'loaded, not running' : 'installed, not loaded';
    console.log(`[status] ${unit.name.padEnd(16)} ${state}${unit.installed ? `  (${unit.file})` : ''}`);
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
async function readKey() {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    let text = '';
    for await (const chunk of stdin) text += chunk;
    return text.trim();
  }
  process.stderr.write('Jev (TypeSafe) API key (typing is hidden): ');
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
  case 'setup':
    if (sub !== undefined) usage(`setup takes no arguments`);
    await setup();
    break;
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
  // Moving an existing install onto the secret store and these services gets its own `migrate` command here.
  case undefined:
  case '--help':
  case 'help':
    console.log(USAGE);
    break;
  default:
    usage(`unknown command: ${command}`);
}
