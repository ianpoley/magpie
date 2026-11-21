import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { mainCheckout, paths } from '../src/config.ts';
import { tempDir } from './fixtures/export.ts';

/** A main checkout with one linked worktree, laid out the way git writes them. */
function checkouts(t: { after: (fn: () => void) => void }) {
  const { dir, cleanup } = tempDir();
  t.after(cleanup);
  const main = join(dir, 'main');
  const worktree = join(dir, 'worktrees', 'feature');
  const admin = join(main, '.git', 'worktrees', 'feature');
  mkdirSync(admin, { recursive: true });
  writeFileSync(join(admin, 'commondir'), '../..\n');
  mkdirSync(worktree, { recursive: true });
  writeFileSync(join(worktree, '.git'), `gitdir: ${admin}\n`);
  return { dir, main, worktree };
}

test('a linked worktree resolves to its main checkout; the main checkout to itself', (t) => {
  const { main, worktree } = checkouts(t);
  assert.equal(mainCheckout(worktree), main);
  assert.equal(mainCheckout(main), main);
});

test('a relative gitdir in the worktree .git file still finds the main checkout', (t) => {
  const { main, worktree } = checkouts(t);
  writeFileSync(join(worktree, '.git'), 'gitdir: ../../main/.git/worktrees/feature\n');
  assert.equal(mainCheckout(worktree), main);
});

test('a submodule, a plain directory and a bare repository stay where they are', (t) => {
  const { dir } = checkouts(t);
  const submodule = join(dir, 'sub');
  mkdirSync(join(dir, 'super', '.git', 'modules', 'sub'), { recursive: true });
  mkdirSync(submodule);
  writeFileSync(join(submodule, '.git'), `gitdir: ${join(dir, 'super', '.git', 'modules', 'sub')}\n`);
  assert.equal(mainCheckout(submodule), submodule);

  const plain = join(dir, 'plain');
  mkdirSync(plain);
  assert.equal(mainCheckout(plain), plain);

  const bareAdmin = join(dir, 'repo.git', 'worktrees', 'wt');
  const bareWorktree = join(dir, 'wt');
  mkdirSync(bareAdmin, { recursive: true });
  writeFileSync(join(bareAdmin, 'commondir'), '../..\n');
  mkdirSync(bareWorktree);
  writeFileSync(join(bareWorktree, '.git'), `gitdir: ${bareAdmin}\n`);
  assert.equal(mainCheckout(bareWorktree), bareWorktree);
});

test('X_CORPUS_ROOT still overrides the data root', () => {
  assert.equal(paths({ X_CORPUS_ROOT: '/srv/elsewhere' }).repoRoot, '/srv/elsewhere');
  assert.equal(paths({ X_CORPUS_ROOT: '/srv/elsewhere' }).store, '/srv/elsewhere/state/corpus.sqlite');
});
