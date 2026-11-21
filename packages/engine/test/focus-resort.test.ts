import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ClaudeAdapter, ClaudeRequest, ClaudeSendResult } from '../src/claude/cli.ts';
import { applyResort, previewResort } from '../src/focus/resort.ts';
import type { FocusSetting } from '../src/focus/setting.ts';
import type { Store } from '../src/store/db.ts';
import { seedArea, tempStore } from './fixtures/corpus.ts';

const ALL: FocusSetting = { mode: 'all', focus: '' };
const CLIMBING: FocusSetting = { mode: 'focus', focus: 'climbing and cooking' };

function fakeClaude(reply: ClaudeSendResult): ClaudeAdapter & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    prompts,
    send: async (request: ClaudeRequest) => {
      prompts.push(request.prompt);
      return reply;
    },
  };
}

const judged = (areas: { name: string; in_focus: boolean }[]): ClaudeSendResult => ({
  ok: true,
  value: { areas },
  session: null,
});

const setByOwner = (db: Store, id: number, hidden: boolean) =>
  db.prepare(`UPDATE areas SET hidden = ?, set_by_owner = 1 WHERE id = ?`).run(hidden ? 1 : 0, id);

const states = (db: Store) =>
  Object.fromEntries(
    db
      .prepare(`SELECT name, hidden FROM areas ORDER BY id`)
      .all()
      .map((row) => [String(row.name), Number(row.hidden)]),
  );

test('showing everything previews the auto-hidden areas as shown, skips hand-set ones, and asks no one', async (t) => {
  const { db } = tempStore(t);
  const politics = seedArea(db, 'Politics', { hidden: true });
  setByOwner(db, politics, false);
  const sports = seedArea(db, 'Sports', { hidden: true });
  const cooking = seedArea(db, 'Cooking', { hidden: true });
  seedArea(db, 'Visible', { hidden: false });
  seedArea(db, 'Unsorted', { hidden: true, kind: 'system' });
  const claude = fakeClaude(judged([]));

  const preview = await previewResort(db, ALL, { claude });

  assert.deepEqual(preview, {
    ok: true,
    toHide: [],
    toShow: [
      { id: sports, name: 'Sports' },
      { id: cooking, name: 'Cooking' },
    ],
  });
  assert.equal(claude.prompts.length, 0);
});

test('a focus target hides visible areas judged outside it, leaves agreeing and omitted names alone', async (t) => {
  const { db } = tempStore(t);
  const ai = seedArea(db, 'AI');
  seedArea(db, 'Cooking');
  seedArea(db, 'Gardening');
  const bouldering = seedArea(db, 'Bouldering', { hidden: true });
  setByOwner(db, seedArea(db, 'Trail running'), false);
  const claude = fakeClaude(
    judged([
      { name: 'ai', in_focus: false },
      { name: 'Cooking', in_focus: true },
      { name: 'Bouldering', in_focus: true },
    ]),
  );

  const preview = await previewResort(db, CLIMBING, { claude });

  assert.deepEqual(preview, {
    ok: true,
    toHide: [{ id: ai, name: 'AI' }],
    toShow: [{ id: bouldering, name: 'Bouldering' }],
  });
  assert.equal(claude.prompts.length, 1);
  const prompt = claude.prompts[0];
  assert.match(prompt, /climbing and cooking/);
  assert.match(prompt, /"Trail running"/);
  assert.match(prompt, /"Gardening"/);
  assert.equal(prompt.split('\n').filter((line) => line === JSON.stringify('Trail running')).length, 1);
});

test('a focus target with no unset areas asks no one', async (t) => {
  const { db } = tempStore(t);
  setByOwner(db, seedArea(db, 'Politics'), true);
  const claude = fakeClaude(judged([]));

  assert.deepEqual(await previewResort(db, CLIMBING, { claude }), { ok: true, toHide: [], toShow: [] });
  assert.equal(claude.prompts.length, 0);
});

test('a failed judgment returns the failure and changes no area', async (t) => {
  const { db } = tempStore(t);
  seedArea(db, 'AI');
  seedArea(db, 'Cooking', { hidden: true });
  const before = states(db);
  const claude = fakeClaude({ ok: false, reason: 'timeout', message: 'The CLI did not finish within 60000 ms.' });

  const preview = await previewResort(db, CLIMBING, { claude });

  assert.deepEqual(preview, { ok: false, reason: 'timeout', message: 'The CLI did not finish within 60000 ms.' });
  assert.deepEqual(states(db), before);
});

test('apply changes only previewed areas still unset by the owner', async (t) => {
  const { db } = tempStore(t);
  const ai = seedArea(db, 'AI');
  const sports = seedArea(db, 'Sports', { hidden: true });
  const politics = seedArea(db, 'Politics', { hidden: true });
  const gone = seedArea(db, 'Gone', { hidden: true });
  const undone = seedArea(db, 'Undone', { hidden: true });
  const preview = {
    toHide: [{ id: ai, name: 'AI' }],
    toShow: [
      { id: sports, name: 'Sports' },
      { id: politics, name: 'Politics' },
      { id: gone, name: 'Gone' },
      { id: undone, name: 'Undone' },
    ],
  };
  setByOwner(db, politics, true);
  db.prepare(`UPDATE areas SET state = 'deleted' WHERE id = ?`).run(gone);
  db.prepare(`DELETE FROM areas WHERE id = ?`).run(undone);
  seedArea(db, 'Newcomer', { hidden: true });

  assert.deepEqual(applyResort(db, preview), { changed: 2, skipped: 3 });

  assert.deepEqual(states(db), { AI: 1, Sports: 0, Politics: 1, Gone: 1, Newcomer: 1 });
  const flags = db.prepare(`SELECT locked, set_by_owner, updated_at FROM areas WHERE id IN (?, ?)`).all(ai, sports);
  for (const row of flags) {
    assert.equal(row.locked, 0);
    assert.equal(row.set_by_owner, 0);
    assert.ok(row.updated_at);
  }
});
