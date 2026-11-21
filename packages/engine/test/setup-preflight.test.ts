import assert from 'node:assert/strict';
import { test } from 'node:test';

// @ts-expect-error: a plain .mjs entry with no type declarations; it has to run before TypeScript and dependencies exist.
import { inRange, pickNode } from '../bin/setup.mjs';

const RANGE = '>=25.8.1 <27';

test('the range check matches the engines field', () => {
  assert.equal(inRange('v26.5.0', RANGE), true);
  assert.equal(inRange('v25.8.1', RANGE), true);
  assert.equal(inRange('v25.8.0', RANGE), false);
  assert.equal(inRange('v24.17.0', RANGE), false);
  assert.equal(inRange('v27.0.0', RANGE), false);
});

test('the first node on PATH is used when it is in range', () => {
  const versions: Record<string, string> = { '/a/node': 'v26.1.0', '/b/node': 'v26.5.0' };
  const { chosen } = pickNode(['/a/node', '/b/node'], (path: string) => versions[path] ?? null, RANGE);
  assert.equal(chosen.path, '/a/node');
});

test('when nvm puts an old node first, the newest node in range elsewhere is used, and the old one is reported', () => {
  const versions: Record<string, string> = {
    '/nvm/v24/bin/node': 'v24.17.0',
    '/opt/homebrew/bin/node': 'v26.5.0',
    '/nvm/v26.1/bin/node': 'v26.1.0',
    '/nvm/v27/bin/node': 'v27.0.0',
  };
  const { chosen, first } = pickNode(Object.keys(versions), (path: string) => versions[path] ?? null, RANGE);
  assert.equal(chosen.path, '/opt/homebrew/bin/node');
  assert.equal(first.version, 'v24.17.0');
});

test('no node in range gives no choice, and missing paths are skipped', () => {
  const { chosen, first } = pickNode(['/gone/node', '/old/node'], (path: string) => (path === '/old/node' ? 'v22.0.0' : null), RANGE);
  assert.equal(chosen, null);
  assert.equal(first.path, '/old/node');
});

