import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { applyFiles, hookSkipReason, localUpdate } from '../src/release/apply.ts';
import type { ApplyRecord, Checkout } from '../src/release/apply.ts';
import { installUpdateHooks, removeUpdateHooks, updateHooksState } from '../src/setup/git-hooks.ts';
import { tempDir } from './fixtures/export.ts';

const BEHIND: Checkout = { toplevel: '/clone', root: '/clone', branch: 'main', built: 'aaa', head: 'bbb' };

test('a pull applies itself only on main in the main checkout, when the services run an older commit', () => {
  assert.equal(hookSkipReason('post-merge', ['0'], BEHIND), null);
  assert.equal(hookSkipReason('post-rewrite', ['rebase'], BEHIND), null);
  assert.match(hookSkipReason('post-rewrite', ['amend'], BEHIND)!, /amend/);
  assert.match(hookSkipReason('post-merge', ['0'], { ...BEHIND, toplevel: '/clone-wt' })!, /main checkout/);
  assert.match(hookSkipReason('post-merge', ['0'], { ...BEHIND, branch: 'feat/x' })!, /not on main/);
  assert.match(hookSkipReason('post-merge', ['0'], { ...BEHIND, branch: null })!, /not on main/);
  assert.match(hookSkipReason('post-merge', ['0'], { ...BEHIND, built: null })!, /never installed/);
  assert.match(hookSkipReason('post-merge', ['0'], { ...BEHIND, built: 'bbb' })!, /already run/);
});

test('the app reports an update as applying while the runner holds its lock, failed for this commit, else pending', () => {
  const files = applyFiles('/state', '/logs');
  const record = (state: ApplyRecord['state'], target = 'bbb'): ApplyRecord => ({ state, target, startedAt: '2026-11-22T10:00:00.000Z', finishedAt: null });
  const free = () => null;

  assert.deepEqual(localUpdate(BEHIND, files, { holder: () => 4242, read: () => record('applying') }), { kind: 'applying', startedAt: '2026-11-22T10:00:00.000Z' });
  assert.deepEqual(localUpdate(BEHIND, files, { holder: free, read: () => record('failed') }), { kind: 'failed', log: '/logs/update.log' });
  assert.deepEqual(localUpdate(BEHIND, files, { holder: free, read: () => record('failed', 'aaa') }), { kind: 'pending' });
  assert.deepEqual(localUpdate(BEHIND, files, { holder: free, read: () => record('applying') }), { kind: 'pending' });
  assert.deepEqual(localUpdate(BEHIND, files, { holder: free, read: () => null }), { kind: 'pending' });
  assert.equal(localUpdate({ ...BEHIND, branch: 'feat/x' }, files, { holder: free, read: () => record('failed') }), null);
  assert.equal(localUpdate({ ...BEHIND, built: 'bbb' }, files, { holder: () => 4242, read: () => null }), null);
});

test('the update hooks run the runner with the hook name and its arguments, never fail the pull, and leave a foreign hook alone', (t) => {
  const { dir, cleanup } = tempDir();
  t.after(cleanup);
  const hooks = join(dir, "it's hooks");
  const bun = join(dir, 'fake bun');
  const runner = join(dir, 'after-pull.mjs');
  const calls = join(dir, 'calls.txt');
  writeFileSync(bun, `#!/bin/sh\necho "$@" >> '${calls}'\nexit 3\n`);
  chmodSync(bun, 0o755);
  writeFileSync(runner, '');

  assert.equal(updateHooksState(hooks, bun, runner), 'missing');
  installUpdateHooks(hooks, bun, runner);
  assert.equal(updateHooksState(hooks, bun, runner), 'current');
  assert.equal(updateHooksState(hooks, join(dir, 'moved bun'), runner), 'outdated');

  const ran = spawnSync('sh', [join(hooks, 'post-rewrite'), 'rebase'], { encoding: 'utf8' });
  assert.equal(ran.status, 0);
  assert.equal(readFileSync(calls, 'utf8'), `${runner} post-rewrite rebase\n`);

  installUpdateHooks(hooks, join(dir, 'missing bun'), runner);
  assert.equal(spawnSync('sh', [join(hooks, 'post-merge'), '0']).status, 0);
  assert.equal(readFileSync(calls, 'utf8'), `${runner} post-rewrite rebase\n`);

  writeFileSync(join(hooks, 'post-merge'), '#!/bin/sh\nnpx lint-staged\n');
  assert.equal(updateHooksState(hooks, bun, runner), 'foreign');
  assert.throws(() => installUpdateHooks(hooks, bun, runner), /did not write/);
  assert.equal(readFileSync(join(hooks, 'post-merge'), 'utf8'), '#!/bin/sh\nnpx lint-staged\n');

  assert.deepEqual(removeUpdateHooks(hooks), ['post-rewrite']);
  assert.equal(readFileSync(join(hooks, 'post-merge'), 'utf8'), '#!/bin/sh\nnpx lint-staged\n');
  assert.equal(updateHooksState(hooks, bun, runner), 'foreign');
});
