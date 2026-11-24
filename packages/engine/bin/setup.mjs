#!/usr/bin/env bun

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, delimiter, dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SETUP_WAIT_MS = 20 * 60_000;
const SETUP_POLL_MS = 2_000;

const parts = (version) => version.replace(/^v/, '').split('.').map(Number);

function compare(a, b) {
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function inRange(version, range) {
  const have = parts(version);
  return range
    .split(/\s+/)
    .filter(Boolean)
    .every((comparator) => {
      const [, op, want] = /^(>=|<=|>|<|=)?(.+)$/.exec(comparator);
      const diff = compare(have, parts(want));
      return { '>=': diff >= 0, '<=': diff <= 0, '>': diff > 0, '<': diff < 0, '=': diff === 0, undefined: diff === 0 }[op];
    });
}

const versionDirs = (dir, suffix) => {
  try {
    return readdirSync(dir).map((name) => join(dir, name, ...suffix));
  } catch {
    return [];
  }
};

export function nodeCandidates(env = process.env, home = homedir()) {
  const onPath = (env.PATH ?? '').split(delimiter).filter(Boolean).map((dir) => join(dir, 'node'));
  const known = [
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
    '/opt/homebrew/opt/node@26/bin/node',
    '/usr/local/opt/node@26/bin/node',
    join(home, '.volta', 'bin', 'node'),
    ...versionDirs(join(env.NVM_DIR || join(home, '.nvm'), 'versions', 'node'), ['bin', 'node']),
    ...versionDirs(join(home, '.local', 'share', 'fnm', 'node-versions'), ['installation', 'bin', 'node']),
    ...versionDirs(join(home, '.local', 'share', 'mise', 'installs', 'node'), ['bin', 'node']),
    ...versionDirs(join(home, '.asdf', 'installs', 'nodejs'), ['bin', 'node']),
  ];
  return [...new Set([...onPath, ...known])];
}

export function pickNode(candidates, versionOf, range) {
  const found = candidates.map((path) => ({ path, version: versionOf(path) })).filter((node) => node.version !== null);
  const first = found[0] ?? null;
  if (first && inRange(first.version, range)) return { chosen: first, first };
  const rest = found.filter((node) => inRange(node.version, range)).sort((a, b) => compare(parts(b.version), parts(a.version)));
  return { chosen: rest[0] ?? null, first };
}

function versionOf(path) {
  if (!existsSync(path)) return null;
  const ran = spawnSync(path, ['--version'], { encoding: 'utf8' });
  return ran.status === 0 ? ran.stdout.trim() : null;
}

async function holdSetupLock() {
  const { paths } = await import('../src/config.ts');
  const { acquireLock } = await import('../src/lock.ts');
  const { err, out } = await import('../src/terminal.ts');
  const path = join(paths().stateDir, 'setup.lock');
  const deadline = Date.now() + SETUP_WAIT_MS;
  let told = false;
  for (;;) {
    const attempt = acquireLock(path);
    if (attempt.held) return attempt.release;
    if (Date.now() > deadline) {
      console.error(err.red(`✗ Another Magpie setup (pid ${attempt.pid}) is still running after ${SETUP_WAIT_MS / 60_000} minutes. Stop it or wait, then run bun run setup again.`));
      process.exit(1);
    }
    if (!told) console.log(out.yellow(`▲ Another Magpie setup is running (pid ${attempt.pid}), such as the update that follows a git pull. Waiting for it to finish.`));
    told = true;
    await sleep(SETUP_POLL_MS);
  }
}

async function main() {
  const release = await holdSetupLock();
  const status = await run();
  release();
  process.exit(status);
}

export const nodeRange = () => JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).engines.node;

export async function chooseNode(range = nodeRange()) {
  const { err, terminalUi, tildePaths } = await import('../src/terminal.ts');
  const ui = terminalUi(err);
  const { chosen, first } = pickNode(nodeCandidates(), versionOf, range);
  if (!chosen) {
    const have = first ? `The node on your PATH is ${first.version} (${tildePaths(first.path)}).` : 'No working node was found.';
    console.error(`${ui.mark.fail} ${err.red(`Magpie needs Node ${range} (.node-version names 26).`)} ${have}`);
    console.error('  Install Node 26, then run the command again:');
    console.error(`    nvm       ${err.cyan('nvm install 26')}   ${err.dim('no nvm yet? https://github.com/nvm-sh/nvm#installing-and-updating')}`);
    console.error(`    Homebrew  ${err.cyan('brew install node@26')}`);
    console.error(`    other     ${err.dim('https://nodejs.org/en/download')}`);
    return null;
  }
  if (first && chosen.path !== first.path) {
    console.error(err.dim(`Using Node ${chosen.version} at ${tildePaths(chosen.path)}; the node first on your PATH is ${first.version}.`));
  }
  return chosen;
}

const isBunRunShim = (path) => basename(dirname(path)).startsWith('bun-node-');

export function bunPath(which = globalThis.Bun?.which('bun'), execPath = process.versions.bun ? process.execPath : '') {
  return which && !isBunRunShim(which) ? which : execPath;
}

export function runUnderNode(chosen, script, args) {
  const env = {
    ...process.env,
    MAGPIE_BUN: bunPath(),
    PATH: [dirname(chosen.path), process.env.PATH].filter(Boolean).join(delimiter),
  };
  const ran = spawnSync(chosen.path, [join(ROOT, script), ...args], { cwd: ROOT, env, stdio: 'inherit' });
  return ran.status ?? 1;
}

async function run() {
  const afterPull = process.argv.includes('--after-pull');
  const { ui } = await import('../src/terminal.ts');
  if (!afterPull) {
    console.log(ui.intro('Magpie setup'));
    console.log(ui.rail());
    console.log(ui.step('Installing dependencies'));
  }
  const bun = process.versions.bun ? process.execPath : 'bun';
  const installed = spawnSync(bun, ['install'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (installed.status !== 0) {
    process.stdout.write(installed.stdout ?? '');
    process.stderr.write(installed.stderr ?? '');
    console.error(ui.paint.red('bun install failed; fix the error above, then run bun run setup again.'));
    return installed.status ?? 1;
  }
  if (!afterPull) console.log(ui.rail(`${ui.mark.ok} ${ui.paint.dim('bun install finished')}`));

  const chosen = await chooseNode();
  if (!chosen) return 1;
  return runUnderNode(chosen, join('packages', 'engine', 'bin', 'magpie.mjs'), ['setup', ...process.argv.slice(2)]);
}

if (import.meta.main) await main();
