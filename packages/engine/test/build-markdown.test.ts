import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';

import { exportPost, tempDir } from './fixtures/export.ts';

const SCRIPT = fileURLToPath(new URL('../bin/build-markdown.mjs', import.meta.url));

function build(t: TestContext, exported: unknown) {
  const { dir, cleanup } = tempDir();
  t.after(cleanup);
  const input = join(dir, 'bookmarks.json');
  writeFileSync(input, JSON.stringify(exported));
  const jsonl = join(dir, 'bookmarks.normalized.jsonl');
  const result = spawnSync(process.execPath, [SCRIPT, input, join(dir, 'md'), 'bookmark', jsonl], { encoding: 'utf8' });
  return { result, jsonl, dir };
}

test('a Birdclaw export is read by its pinned fields, with the author display name as the name', (t) => {
  const { result, jsonl } = build(t, [exportPost('101', { handle: 'ada', text: 'Hello  world', createdAt: '2026-11-20T10:00:00.000Z' })]);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(jsonl, 'utf8')), {
    type: 'bookmark',
    id: '101',
    handle: 'ada',
    name: 'Name of ada',
    created: '2026-11-20T10:00:00.000Z',
    url: 'https://x.com/ada/status/101',
    text: 'Hello  world',
  });
});

test('an export that is not an array of Birdclaw posts fails loudly and writes nothing', (t) => {
  for (const exported of [{ posts: [exportPost('1')] }, [{ id: '1', text: 'no author' }], [{ ...exportPost('2'), id: 2 }]]) {
    const { result, jsonl, dir } = build(t, exported);
    assert.equal(result.status, 1, JSON.stringify(exported));
    assert.match(result.stderr, /Birdclaw export/);
    assert.equal(existsSync(jsonl), false);
    assert.equal(existsSync(join(dir, 'md')), false);
  }
});

test('a rebuild removes the files of posts that left the export and leaves no draft behind', (t) => {
  const { dir } = build(t, [exportPost('1', { handle: 'ada' }), exportPost('2', { handle: 'bob' })]);
  const input = join(dir, 'bookmarks.json');
  writeFileSync(input, JSON.stringify([exportPost('2', { handle: 'bob' })]));

  const again = spawnSync(process.execPath, [SCRIPT, input, join(dir, 'md'), 'bookmark', join(dir, 'bookmarks.normalized.jsonl')], { encoding: 'utf8' });

  assert.equal(again.status, 0, again.stderr);
  const files = readdirSync(join(dir, 'md'));
  assert.equal(files.length, 2);
  assert.ok(files.includes('index.md'));
  assert.ok(files.some((name) => name.includes('_bob_2')));
  assert.ok(!readdirSync(dir).some((name) => name.endsWith('.tmp')));
});
