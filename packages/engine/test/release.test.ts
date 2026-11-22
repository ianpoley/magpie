import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';

import { updateStatus } from '../src/release/update.ts';
import { nextVersion, parseVersion } from '../src/release/version.ts';
import { tempDir } from './fixtures/export.ts';

test('parseVersion reads only plain vX.Y.Z tags', () => {
  assert.deepEqual(parseVersion('v1.20.3'), [1, 20, 3]);
  assert.equal(parseVersion('1.2.3'), null);
  assert.equal(parseVersion('v1.2.3-beta'), null);
});

test('nextVersion bumps by the strongest conventional commit since the last tag', () => {
  assert.deepEqual(nextVersion([1, 2, 3], ['fix: a', 'docs: b']), [1, 2, 4]);
  assert.deepEqual(nextVersion([1, 2, 3], ['fix: a', 'feat(web): b']), [1, 3, 0]);
  assert.deepEqual(nextVersion([1, 2, 3], ['feat!: a']), [2, 0, 0]);
  assert.deepEqual(nextVersion([1, 2, 3], ['fix: a\n\nBREAKING CHANGE: b']), [2, 0, 0]);
  assert.deepEqual(nextVersion([0, 4, 1], ['refactor(x)!: a']), [0, 5, 0]);
  assert.equal(nextVersion([1, 2, 3], ['docs: a', 'chore: b', 'a fix: in the body']), null);
  assert.deepEqual(nextVersion(null, ['fix: a']), [0, 1, 0]);
});

function clone(t: TestContext, builtCommit?: string): string {
  const { dir, cleanup } = tempDir();
  t.after(cleanup);
  if (builtCommit !== undefined) {
    mkdirSync(join(dir, 'apps', 'web', '.next'), { recursive: true });
    writeFileSync(join(dir, 'apps', 'web', '.next', 'magpie-commit'), `${builtCommit}\n`);
  }
  return dir;
}

const release = (tag: string) => async () => ({ version: parseVersion(tag)!, url: `https://example.test/${tag}` });
const described = (tag: string | null) => async (args: string[]) => (args[0] === 'describe' ? tag : '');
const gitFails = async () => null;

test('updateStatus nudges only when the latest release is newer than the build', async (t) => {
  const root = clone(t, 'abc123');
  assert.deepEqual(await updateStatus(root, { git: described('v0.2.0'), release: release('v0.3.0') }), {
    installed: 'v0.2.0',
    latest: 'v0.3.0',
    url: 'https://example.test/v0.3.0',
    autoApplies: false,
  });
  mkdirSync(join(root, '.git', 'hooks'), { recursive: true });
  for (const hook of ['post-merge', 'post-rewrite']) writeFileSync(join(root, '.git', 'hooks', hook), '#!/bin/sh\nMAGPIE_UPDATE_HOOK=1\n');
  const withHooks = async (args: string[]) => (args[0] === 'rev-parse' && args[1] === '--git-path' ? '.git/hooks' : described('v0.2.0')(args));
  assert.equal((await updateStatus(root, { git: withHooks, release: release('v0.3.0') }))?.autoApplies, true);
  assert.equal(await updateStatus(root, { git: described('v0.3.0'), release: release('v0.3.0') }), null);
  assert.equal(await updateStatus(root, { git: described('v0.4.0'), release: release('v0.3.0') }), null);
});

test('updateStatus nudges a build that has no release tag yet', async (t) => {
  const status = await updateStatus(clone(t, 'abc123'), { git: described(null), release: release('v0.1.0') });
  assert.equal(status?.installed, null);
  assert.equal(status?.latest, 'v0.1.0');
});

test('updateStatus stays quiet without a service build or a reachable release', async (t) => {
  assert.equal(await updateStatus(clone(t), { git: described('v0.1.0'), release: release('v0.2.0') }), null);
  assert.equal(await updateStatus(clone(t, 'abc123'), { git: described('v0.1.0'), release: async () => null }), null);
  assert.equal(await updateStatus(clone(t, 'abc123'), { git: gitFails, release: release('v0.2.0') }), null);
});
