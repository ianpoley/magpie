#!/usr/bin/env bun

import { spawn, spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { RELEASES, paths } = await import('../src/config.ts');
const { acquireLock, lockHolder } = await import('../src/lock.ts');
const { applyFiles, behindReason, hookSkipReason, writeApplyRecord } = await import('../src/release/apply.ts');
const { readBuiltCommit } = await import('../src/service/web-build.ts');

const realpath = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};

const ROOT = realpath(fileURLToPath(new URL('../../..', import.meta.url)));
const SELF = fileURLToPath(import.meta.url);
const SETUP = join(ROOT, 'packages', 'engine', 'bin', 'setup.mjs');
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
const files = () => {
  const { stateDir, logsDir } = paths(env);
  return { ...applyFiles(stateDir, logsDir), logsDir };
};

function git(cwd, args) {
  const ran = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env });
  return ran.status === 0 ? ran.stdout.trim() : null;
}

function checkout(cwd) {
  const toplevel = git(cwd, ['rev-parse', '--show-toplevel']);
  return {
    toplevel: toplevel && realpath(toplevel),
    root: ROOT,
    branch: git(ROOT, ['symbolic-ref', '--short', '-q', 'HEAD']),
    built: readBuiltCommit(ROOT),
    head: git(ROOT, ['rev-parse', 'HEAD']),
  };
}

function fromHook(hook, args) {
  if (hookSkipReason(hook, args, checkout(process.cwd())) !== null) return;
  const { lock, log, logsDir } = files();
  if (lockHolder(lock) !== null) {
    console.error('magpie: an update is already being applied, and it picks up this pull too.');
    return;
  }
  mkdirSync(logsDir, { recursive: true });
  const out = openSync(log, 'a');
  spawn(process.execPath, [SELF, '--apply'], { cwd: ROOT, env, detached: true, stdio: ['ignore', out, out] }).unref();
  closeSync(out);
  console.error(`magpie: applying this update in the background. The app rebuilds and restarts in a minute or two (log: ${log}).`);
}

function applyRound(record) {
  const before = checkout(ROOT);
  if (behindReason(before) !== null) return false;
  const startedAt = new Date().toISOString();
  writeApplyRecord(record, { state: 'applying', target: before.head, startedAt, finishedAt: null });
  console.log(`\n==> ${startedAt} applying ${before.head}; the services ran ${before.built}`);
  const ran = spawnSync(process.execPath, [SETUP, '--after-pull'], { cwd: ROOT, env, stdio: ['ignore', 'inherit', 'inherit'] });
  const finishedAt = new Date().toISOString();
  if (ran.status === RELEASES.nothingToApplyExit) {
    writeApplyRecord(record, { state: 'skipped', target: before.head, startedAt, finishedAt });
    console.log('==> nothing to apply');
    return false;
  }
  const applied = readBuiltCommit(ROOT) === before.head;
  writeApplyRecord(record, { state: applied ? 'applied' : 'failed', target: before.head, startedAt, finishedAt });
  console.log(applied ? `==> applied ${before.head}` : `==> failed: the services still run ${readBuiltCommit(ROOT)}. Run bun run setup in ${ROOT}.`);
  return applied;
}

function apply() {
  const { lock, record } = files();
  const held = acquireLock(lock);
  if (!held.held) return;
  try {
    for (let round = 0; round < RELEASES.applyRounds && applyRound(record); round++);
  } finally {
    held.release();
  }
}

const [mode, ...args] = process.argv.slice(2);
try {
  if (mode === '--apply') apply();
  else if (mode) fromHook(mode, args);
} catch (error) {
  console.error(`magpie: the update after git pull did not start: ${error instanceof Error ? error.message : String(error)}`);
}
