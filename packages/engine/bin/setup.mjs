#!/usr/bin/env bun
//
//     bun run setup [--yes]
//
// The first command after cloning. Bun runs this file, because Bun is the one
// tool a fresh machine is sure to have and a fresh clone has no node_modules
// yet. It installs the dependencies, finds a Node in the supported range
// (nvm and other version managers often put an older one first on PATH),
// then runs the setup walkthrough under that Node, so the services record it.
//
// No dependencies and no TypeScript: it has to run before both are in place.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

const parts = (version) => version.replace(/^v/, '').split('.').map(Number);

function compare(a, b) {
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Whether `v26.5.0` is inside a space-separated range of comparators such as `>=25.8.1 <27`. */
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

/** Every node binary worth trying: the ones on PATH first, in order, then the usual install locations. */
export function nodeCandidates(env = process.env, home = homedir()) {
  const onPath = (env.PATH ?? '').split(delimiter).filter(Boolean).map((dir) => join(dir, 'node'));
  const known = [
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
    join(home, '.volta', 'bin', 'node'),
    ...versionDirs(join(env.NVM_DIR || join(home, '.nvm'), 'versions', 'node'), ['bin', 'node']),
    ...versionDirs(join(home, '.local', 'share', 'fnm', 'node-versions'), ['installation', 'bin', 'node']),
    ...versionDirs(join(home, '.local', 'share', 'mise', 'installs', 'node'), ['bin', 'node']),
    ...versionDirs(join(home, '.asdf', 'installs', 'nodejs'), ['bin', 'node']),
  ];
  return [...new Set([...onPath, ...known])];
}

/**
 * The node to run: the first on PATH when it is in range, otherwise the
 * newest in range among the rest. `versionOf` returns null for a path that
 * is missing or does not run.
 */
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

function main() {
  const range = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).engines.node;

  console.log('Installing dependencies (bun install)');
  const bun = process.versions.bun ? process.execPath : 'bun';
  const installed = spawnSync(bun, ['install'], { cwd: ROOT, stdio: 'inherit' });
  if (installed.status !== 0) {
    console.error('bun install failed; fix the error above, then run bun run setup again.');
    process.exit(installed.status ?? 1);
  }

  const { chosen, first } = pickNode(nodeCandidates(), versionOf, range);
  if (!chosen) {
    const have = first ? `The node on your PATH is ${first.version} (${first.path}).` : 'No node was found.';
    console.error(`\nMagpie needs Node ${range} (.node-version names 26). ${have}`);
    console.error('Install Node 26, then run bun run setup again:');
    console.error('  nvm:      nvm install 26 && nvm use 26');
    console.error('  Homebrew: brew install node');
    console.error('  other:    https://nodejs.org');
    process.exit(1);
  }
  if (first && chosen.path !== first.path) {
    console.log(`Using Node ${chosen.version} at ${chosen.path}; the node first on your PATH is ${first.version}.`);
  }

  const env = { ...process.env, PATH: [dirname(chosen.path), process.env.PATH].filter(Boolean).join(delimiter) };
  const ran = spawnSync(chosen.path, [join(ROOT, 'packages', 'engine', 'bin', 'magpie.mjs'), 'setup', ...process.argv.slice(2)], {
    cwd: ROOT,
    env,
    stdio: 'inherit',
  });
  process.exit(ran.status ?? 1);
}

if (import.meta.main) main();
