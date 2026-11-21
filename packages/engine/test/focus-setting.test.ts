import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';

import { DEV_FOCUS_WORDING } from '../src/config.ts';
import { FOCUS_MARKER_VERSION, readFocus, writeFocus } from '../src/focus/setting.ts';
import { openStore } from '../src/store/db.ts';
import { tempDir } from './fixtures/export.ts';

type Area = { kind: 'auto' | 'system'; state: 'active' | 'deleted' };

function install(t: TestContext): { categoryFocus: string; store: string } {
  const { dir, cleanup } = tempDir();
  t.after(cleanup);
  return { categoryFocus: join(dir, 'config', 'category-focus.json'), store: join(dir, 'state', 'corpus.sqlite') };
}

function seedStore(path: string, options: { version: number; marker?: boolean; areas?: Area[] }): void {
  const db = openStore(path, { inheritedFrom: null });
  try {
    for (const area of options.areas ?? []) {
      db.prepare(`INSERT INTO areas (name, kind, state, created_at) VALUES ('Area', ?, ?, '2026-01-01')`).run(area.kind, area.state);
    }
    db.prepare(`UPDATE meta SET value = ? WHERE key = 'schema_version'`).run(String(options.version));
    if (options.marker) db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('category_focus_legacy', '1')`).run();
  } finally {
    db.close();
  }
}

const NOT_CHOSEN = { mode: 'all', focus: '', chosen: false };
const LEGACY = { mode: 'focus', focus: DEV_FOCUS_WORDING, chosen: true };

test('a saved setting resolves to itself', (t) => {
  const files = install(t);
  seedStore(files.store, { version: FOCUS_MARKER_VERSION, marker: true, areas: [{ kind: 'auto', state: 'active' }] });
  writeFocus(files.categoryFocus, { mode: 'focus', focus: 'cooking' });
  assert.deepEqual(readFocus(files), { mode: 'focus', focus: 'cooking', chosen: true });
});

test('an upgraded store carrying the legacy marker resolves to the dev focus', (t) => {
  const files = install(t);
  seedStore(files.store, { version: FOCUS_MARKER_VERSION, marker: true });
  assert.deepEqual(readFocus(files), LEGACY);
});

test('a store not yet upgraded with an active auto area resolves to the dev focus', (t) => {
  const files = install(t);
  seedStore(files.store, { version: FOCUS_MARKER_VERSION - 1, areas: [{ kind: 'auto', state: 'active' }] });
  assert.deepEqual(readFocus(files), LEGACY);
});

test('an upgraded store whose areas came after the upgrade is not chosen', (t) => {
  const files = install(t);
  seedStore(files.store, { version: FOCUS_MARKER_VERSION, areas: [{ kind: 'auto', state: 'active' }] });
  assert.deepEqual(readFocus(files), NOT_CHOSEN);
});

test('a store not yet upgraded with only system or deleted areas is not chosen', (t) => {
  const files = install(t);
  seedStore(files.store, {
    version: FOCUS_MARKER_VERSION - 1,
    areas: [
      { kind: 'system', state: 'active' },
      { kind: 'auto', state: 'deleted' },
    ],
  });
  assert.deepEqual(readFocus(files), NOT_CHOSEN);
});

test('no store file is not chosen', (t) => {
  assert.deepEqual(readFocus(install(t)), NOT_CHOSEN);
});
