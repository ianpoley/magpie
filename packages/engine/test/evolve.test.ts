import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ClaudeAdapter, ClaudeFailure, ClaudeRequest } from '../src/claude/cli.ts';
import { evolve } from '../src/evolve/evolve.ts';
import { tagPosts } from '../src/jev/tagger.ts';
import type { Store } from '../src/store/db.ts';
import {
  addPostTopic,
  deleteArea,
  deleteTopic,
  listUndo,
  mergeTopics,
  pinQuery,
  removePostTopic,
  renameTopic,
  setTopicHidden,
  undoChange,
} from '../src/store/edits.ts';
import { fakeJev, seedArea, seedLink, seedOverride, seedPost, seedScore, seedTopic, tempStore } from './fixtures/corpus.ts';
import type { FakeJev } from './fixtures/corpus.ts';

type Reply = Record<string, unknown> | ClaudeFailure;

const isSplitRequest = (request: ClaudeRequest): boolean =>
  request.schema.type === 'object' && 'subtopics' in request.schema.properties;

function fakeClaude(reply: (request: ClaudeRequest, call: number) => Reply): ClaudeAdapter & { requests: ClaudeRequest[] } {
  const requests: ClaudeRequest[] = [];
  return {
    requests,
    send: async (request) => {
      requests.push(request);
      const answer = reply(request, requests.length);
      if (answer.ok === false) return answer as ClaudeFailure;
      return { ok: true, value: answer, session: null };
    },
  };
}

const newTopic = (name: string, area = 'Tools', dev = true): Reply => ({
  name,
  area,
  area_is_dev: dev,
  definition: `Posts about ${name}.`,
});

const subtopics = (...names: string[]): Reply => ({
  subtopics: names.map((name) => ({ name, definition: `Posts about ${name}.` })),
});

function jevBy(rules: Record<string, (text: string) => number>, before?: () => void): FakeJev {
  return fakeJev((id, request) => {
    before?.();
    const instructions = request.questions[id].instructions as { topic: { name: string } };
    const state = request.state as { post: { text: string } };
    return rules[instructions.topic.name]?.(state.post.text) ?? 0.05;
  });
}

const has = (word: string) => (text: string) => (text.includes(word) ? 0.9 : 0.05);

function seedPosts(db: Store, prefix: string, count: number, text: string): string[] {
  return Array.from({ length: count }, (_, index) =>
    seedPost(db, `${prefix}-${String(index + 1).padStart(3, '0')}`, { text: `${text} number ${index + 1}` }),
  );
}

const unfiled = (db: Store): string[] =>
  db
    .prepare(`SELECT post_id FROM post_unfiled ORDER BY post_id`)
    .all()
    .map((row) => String(row.post_id));

const members = (db: Store, topicId: number, band: string): string[] =>
  db
    .prepare(`SELECT post_id FROM topic_membership WHERE topic_id = ? AND band = ? ORDER BY post_id`)
    .all(topicId, band)
    .map((row) => String(row.post_id));

const topicNamed = (db: Store, name: string) => db.prepare(`SELECT * FROM topics WHERE name = ?`).get(name);
const topicId = (db: Store, name: string): number => Number(topicNamed(db, name)?.id);
const count = (db: Store, table: string, where = '1 = 1'): number =>
  Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get()?.n);
const changes = (db: Store) =>
  db
    .prepare(`SELECT id, kind, source, post_count, undoable, undone_at FROM changes ORDER BY id`)
    .all()
    .map((row) => ({ ...row }));
const attempts = (db: Store) =>
  db
    .prepare(`SELECT kind, outcome FROM proposal_attempts ORDER BY id`)
    .all()
    .map((row) => `${row.kind}:${row.outcome}`);

function seedBroadTopic(db: Store, name = 'Frontend stuff'): { parent: number; area: number; posts: string[] } {
  const area = seedArea(db, 'Frontend');
  const parent = seedTopic(db, name, { areaId: area });
  const posts = [
    ...seedPosts(db, 'anim', 70, 'anim'),
    ...seedPosts(db, 'css', 55, 'css'),
    ...seedPosts(db, 'other', 5, 'other'),
  ];
  for (const id of posts) seedScore(db, id, parent, 0.9);
  return { parent, area, posts };
}

const splitRules = {
  Animations: (text: string) => (text.includes('anim') ? 0.9 : text.includes('other') ? 0.2 : 0.05),
  CSS: (text: string) => (text.includes('css-ish') ? 0.5 : text.includes('css') ? 0.9 : 0.05),
};

test('enough similar Unfiled posts create a topic, the log shows the change, and undoing it returns them to Unfiled', async (t) => {
  const { db } = tempStore(t);
  const zeta = seedPosts(db, 'zeta', 9, 'zeta tool');
  seedPosts(db, 'misc', 16, 'misc');
  const claude = fakeClaude(() => newTopic('Zeta'));
  const jev = jevBy({ Zeta: has('zeta') });

  const result = await evolve(db, { claude, jev });

  assert.deepEqual(result, { newTopics: 1, splits: 0, rejected: 0, dropped: 0, skipped: null });
  const topic = topicNamed(db, 'Zeta');
  assert.equal(topic?.state, 'active');
  assert.equal(topic?.kind, 'auto');
  assert.equal(db.prepare(`SELECT name FROM areas WHERE id = ?`).get(Number(topic?.area_id))?.name, 'Tools');
  assert.deepEqual(members(db, topicId(db, 'Zeta'), 'confident'), zeta);
  assert.equal(unfiled(db).length, 16);
  const logged = changes(db);
  assert.equal(logged.length, 1);
  assert.deepEqual(
    { kind: logged[0].kind, source: logged[0].source, post_count: logged[0].post_count, undoable: logged[0].undoable },
    { kind: 'new_topic', source: 'auto', post_count: 9, undoable: 1 },
  );
  assert.deepEqual(attempts(db), ['new_topic:applied']);

  const changeId = Number(logged[0].id);
  assert.deepEqual(listUndo(db, changeId).map((change) => change.id), [changeId]);
  const undone = undoChange(db, changeId);

  assert.deepEqual(undone.undone.map((change) => change.id), [changeId]);
  assert.equal(unfiled(db).length, 25);
  assert.equal(count(db, 'topics', `state = 'active'`), 0);
  assert.equal(count(db, 'areas'), 0);
  assert.equal(count(db, 'suppressed_proposals', `name = 'Zeta'`), 1);
  assert.notEqual(changes(db)[0].undone_at, null);

  const askedBefore = jev.requests.length;
  const again = await evolve(db, { claude, jev });
  assert.equal(again.newTopics, 0);
  assert.equal(again.rejected, 1);
  assert.equal(jev.requests.length, askedBefore);
  assert.equal(count(db, 'topics', `state = 'active'`), 0);
});

test('a new non-development area starts hidden and an existing area is reused whatever its letter case', async (t) => {
  const { db } = tempStore(t);
  const existing = seedArea(db, 'Tools');
  seedPosts(db, 'zeta', 10, 'zeta');
  seedPosts(db, 'vote', 10, 'vote');
  seedPosts(db, 'misc', 40, 'misc');
  const claude = fakeClaude((_, call) =>
    call === 1 ? newTopic('Zeta', 'tools') : call === 2 ? newTopic('Elections', 'Politics', false) : newTopic('Nothing'),
  );

  await evolve(db, { claude, jev: jevBy({ Zeta: has('zeta'), Elections: has('vote') }) });

  assert.equal(topicNamed(db, 'Zeta')?.area_id, existing);
  const politics = db.prepare(`SELECT hidden, is_dev FROM areas WHERE name = 'Politics'`).get();
  assert.deepEqual({ ...politics }, { hidden: 1, is_dev: 0 });
});

test('a proposed topic matching too few Unfiled posts is rejected and logged as an attempt, not a change', async (t) => {
  const { db } = tempStore(t);
  seedPosts(db, 'zeta', 5, 'zeta tool');
  seedPosts(db, 'misc', 20, 'misc');

  const result = await evolve(db, { claude: fakeClaude(() => newTopic('Zeta')), jev: jevBy({ Zeta: has('zeta') }) });

  assert.deepEqual(result, { newTopics: 0, splits: 0, rejected: 1, dropped: 0, skipped: null });
  assert.equal(count(db, 'topics'), 0);
  assert.equal(count(db, 'changes'), 0);
  assert.deepEqual(attempts(db), ['new_topic:rejected']);
  assert.equal(unfiled(db).length, 25);
});

test('after a round that created nothing, no new round runs until Unfiled has grown by a quarter', async (t) => {
  const { db } = tempStore(t);
  seedPosts(db, 'first', 200, 'misc');
  const claude = fakeClaude(() => newTopic('Zeta'));
  const jev = jevBy({});

  await evolve(db, { claude, jev });
  assert.equal(claude.requests.length, 1);

  seedPosts(db, 'second', 49, 'misc');
  await evolve(db, { claude, jev });
  assert.equal(claude.requests.length, 1);

  seedPosts(db, 'third', 1, 'misc');
  await evolve(db, { claude, jev });
  assert.equal(claude.requests.length, 2);
});

test('after a round that created nothing, a new round also needs 25 Unfiled posts no earlier round saw', async (t) => {
  const { db } = tempStore(t);
  seedPosts(db, 'first', 40, 'misc');
  const claude = fakeClaude(() => newTopic('Zeta'));
  const jev = jevBy({});

  await evolve(db, { claude, jev });
  seedPosts(db, 'second', 24, 'misc');
  await evolve(db, { claude, jev });
  assert.equal(claude.requests.length, 1);

  seedPosts(db, 'third', 1, 'misc');
  await evolve(db, { claude, jev });
  assert.equal(claude.requests.length, 2);
});

test('posts still waiting on a link do not count toward the new-topic trigger', async (t) => {
  const { db } = tempStore(t);
  seedPosts(db, 'ready', 24, 'zeta');
  for (const id of seedPosts(db, 'waiting', 5, 'zeta')) seedLink(db, id, `https://t.co/${id}`, { status: 'new' });
  const claude = fakeClaude(() => newTopic('Zeta'));

  const result = await evolve(db, { claude, jev: jevBy({ Zeta: has('zeta') }) });

  assert.equal(claude.requests.length, 0);
  assert.deepEqual(result, { newTopics: 0, splits: 0, rejected: 0, dropped: 0, skipped: null });
});

test('a round that created a topic runs again in the same run while 25 eligible Unfiled posts remain', async (t) => {
  const { db } = tempStore(t);
  seedPosts(db, 'alpha', 10, 'alpha');
  seedPosts(db, 'beta', 10, 'beta');
  seedPosts(db, 'misc', 40, 'misc');
  const claude = fakeClaude((_, call) => newTopic(['Alpha', 'Beta', 'Gamma'][call - 1]));
  const jev = jevBy({ Alpha: has('alpha'), Beta: has('beta') });

  const result = await evolve(db, { claude, jev });

  assert.deepEqual(result, { newTopics: 2, splits: 0, rejected: 1, dropped: 0, skipped: null });
  assert.equal(claude.requests.length, 3);
  assert.equal(unfiled(db).length, 40);
  assert.equal(count(db, 'areas'), 1);

  await evolve(db, { claude, jev });
  assert.equal(claude.requests.length, 3);
});

test('when Claude fails after a topic was created, the next run carries on with the posts that remain', async (t) => {
  const { db } = tempStore(t);
  seedPosts(db, 'alpha', 10, 'alpha');
  seedPosts(db, 'beta', 10, 'beta');
  seedPosts(db, 'misc', 40, 'misc');
  const failure: ClaudeFailure = { ok: false, reason: 'timeout', message: 'took too long' };
  const claude = fakeClaude((_, call) => (call === 1 ? newTopic('Alpha') : call === 2 ? failure : newTopic('Beta')));
  const jev = jevBy({ Alpha: has('alpha'), Beta: has('beta') });

  const first = await evolve(db, { claude, jev });
  assert.equal(first.newTopics, 1);
  assert.equal(first.skipped?.reason, 'claude');

  const second = await evolve(db, { claude, jev });
  assert.equal(second.newTopics, 1);
  assert.equal(topicNamed(db, 'Beta')?.state, 'active');
});

test('evolution with Claude failing changes nothing and reports the skip', async (t) => {
  const { db } = tempStore(t);
  seedPosts(db, 'zeta', 25, 'zeta');
  const claude = fakeClaude(() => ({ ok: false, reason: 'missing', message: 'no CLI' }));
  const jev = jevBy({ Zeta: has('zeta') });

  const result = await evolve(db, { claude, jev });

  assert.deepEqual(result, {
    newTopics: 0,
    splits: 0,
    rejected: 0,
    dropped: 0,
    skipped: { reason: 'claude', message: 'missing: no CLI' },
  });
  assert.equal(jev.requests.length, 0);
  for (const table of ['topics', 'areas', 'changes', 'proposal_attempts', 'proposal_seen_posts']) {
    assert.equal(count(db, table), 0, table);
  }
});

test('a failed scoring request skips the round instead of rejecting the proposal', async (t) => {
  const { db } = tempStore(t);
  seedPosts(db, 'zeta', 25, 'zeta');
  const jev = fakeJev(() => {
    throw new Error('rate limited');
  });

  const result = await evolve(db, { claude: fakeClaude(() => newTopic('Zeta')), jev });

  assert.equal(result.skipped?.reason, 'jev');
  assert.equal(result.rejected, 0);
  assert.equal(count(db, 'topics'), 0);
  assert.equal(count(db, 'proposal_attempts'), 0);
});

test('a deleted topic is not created again under the same name', async (t) => {
  const { db } = tempStore(t);
  const old = seedTopic(db, 'Zeta');
  for (const id of seedPosts(db, 'zeta', 25, 'zeta')) seedScore(db, id, old, 0.05);
  deleteTopic(db, old);
  const jev = jevBy({ Zeta: has('zeta') });

  const result = await evolve(db, { claude: fakeClaude(() => newTopic('zeta')), jev });

  assert.equal(result.rejected, 1);
  assert.equal(jev.requests.length, 0);
  assert.equal(count(db, 'topics', `state = 'active'`), 0);
});

test('a proposal under a new name is rejected when most of its matches are a deleted topic\'s last matches', async (t) => {
  const { db } = tempStore(t);
  const old = seedTopic(db, 'Old');
  const oldPosts = seedPosts(db, 'old', 10, 'legacy');
  const rest = seedPosts(db, 'rest', 15, 'misc');
  for (const id of oldPosts) seedScore(db, id, old, 0.9);
  for (const id of rest) seedScore(db, id, old, 0.05);
  deleteTopic(db, old);
  const fresh = (text: string) => (text.includes('legacy') || /number [12]$/.test(text) ? 0.9 : 0.05);

  const result = await evolve(db, { claude: fakeClaude(() => newTopic('Fresh name')), jev: jevBy({ 'Fresh name': fresh }) });

  assert.equal(result.newTopics, 0);
  assert.equal(result.rejected, 1);
  assert.equal(count(db, 'topics', `state = 'active'`), 0);
  assert.equal(count(db, 'changes'), 0);
});

test('a topic over the size limit splits into subtopics that hold its posts, and the log shows one split', async (t) => {
  const { db } = tempStore(t);
  const { parent, area, posts } = seedBroadTopic(db);
  const claude = fakeClaude((request) => {
    assert.ok(isSplitRequest(request));
    return subtopics('Animations', 'CSS');
  });

  const result = await evolve(db, { claude, jev: jevBy(splitRules) });

  assert.deepEqual(result, { newTopics: 0, splits: 1, rejected: 0, dropped: 0, skipped: null });
  assert.equal(db.prepare(`SELECT state FROM topics WHERE id = ?`).get(parent)?.state, 'split');
  const animations = topicNamed(db, 'Animations');
  assert.deepEqual(
    { state: animations?.state, area_id: animations?.area_id, split_from: animations?.split_from },
    { state: 'active', area_id: area, split_from: parent },
  );
  assert.equal(members(db, topicId(db, 'Animations'), 'confident').length, 70);
  assert.equal(members(db, topicId(db, 'CSS'), 'confident').length, 55);
  assert.deepEqual(
    members(db, topicId(db, 'Animations'), 'unsure'),
    posts.filter((id) => id.startsWith('other')),
  );
  assert.deepEqual(members(db, topicId(db, 'CSS'), 'unsure'), []);
  const logged = changes(db);
  assert.equal(logged.length, 1);
  assert.deepEqual({ kind: logged[0].kind, post_count: logged[0].post_count }, { kind: 'split', post_count: 130 });
  assert.deepEqual(attempts(db), ['split:applied']);
});

test('undoing a split restores the parent with its earlier posts and locks it', async (t) => {
  const { db } = tempStore(t);
  const { parent, posts } = seedBroadTopic(db);
  const claude = fakeClaude(() => subtopics('Animations', 'CSS'));
  const jev = jevBy(splitRules);
  await evolve(db, { claude, jev });

  undoChange(db, Number(changes(db)[0].id));

  const restored = db.prepare(`SELECT state, locked FROM topics WHERE id = ?`).get(parent);
  assert.deepEqual({ ...restored }, { state: 'active', locked: 1 });
  assert.deepEqual(members(db, parent, 'confident'), [...posts].sort());
  assert.equal(count(db, 'topics', `state = 'active'`), 1);
  assert.equal(count(db, 'suppressed_proposals'), 2);

  const before = claude.requests.length;
  await evolve(db, { claude, jev });
  assert.equal(claude.requests.length, before);
});

test('undoing a split after the user deleted its area leaves the posts Unfiled', async (t) => {
  const { db } = tempStore(t);
  const { area } = seedBroadTopic(db);
  await evolve(db, { claude: fakeClaude(() => subtopics('Animations', 'CSS')), jev: jevBy(splitRules) });
  deleteArea(db, area);

  undoChange(db, Number(changes(db)[0].id));

  assert.equal(count(db, 'topics', `state = 'active'`), 0);
  assert.equal(unfiled(db).length, 130);
});

test('per-post fixes on a split topic carry to its subtopics', async (t) => {
  const { db } = tempStore(t);
  const { parent } = seedBroadTopic(db);
  removePostTopic(db, 'anim-001', parent);
  const added = seedPost(db, 'added-1', { text: 'css-ish note' });
  seedScore(db, added, parent, 0.1);
  addPostTopic(db, added, parent);

  const jev = jevBy(splitRules);
  const result = await evolve(db, { claude: fakeClaude(() => subtopics('Animations', 'CSS')), jev });
  await tagPosts(db, { jev });

  assert.equal(result.splits, 1);
  assert.equal(count(db, 'scores', `post_id = 'anim-001' AND topic_id = ${topicId(db, 'Animations')} AND probability > 0.7`), 1);
  const animations = topicId(db, 'Animations');
  const css = topicId(db, 'CSS');
  assert.equal(count(db, 'topic_membership', `post_id = 'anim-001'`), 0);
  assert.equal(members(db, animations, 'confident').length, 69);
  assert.ok(members(db, css, 'confident').includes(added));
  assert.ok(!members(db, animations, 'confident').includes(added));
});

test('a split whose subtopics do not hold enough of the parent is rejected and not proposed again until the parent grows', async (t) => {
  const { db } = tempStore(t);
  const { parent } = seedBroadTopic(db);
  const claude = fakeClaude(() => subtopics('Animations', 'Typography'));
  const jev = jevBy(splitRules);

  const result = await evolve(db, { claude, jev });

  assert.deepEqual(result, { newTopics: 0, splits: 0, rejected: 1, dropped: 0, skipped: null });
  assert.equal(db.prepare(`SELECT state FROM topics WHERE id = ?`).get(parent)?.state, 'active');
  assert.equal(count(db, 'topics'), 1);
  assert.equal(count(db, 'changes'), 0);
  assert.deepEqual(attempts(db), ['split:rejected']);

  await evolve(db, { claude, jev });
  assert.equal(claude.requests.length, 1);
});

test('topics the user merged into, renamed, hid, or pinned are never split', async (t) => {
  const { db } = tempStore(t);
  const posts = seedPosts(db, 'post', 130, 'anim');
  const absorbed = seedTopic(db, 'Agents');
  const survivor = seedTopic(db, 'AI tooling');
  const renamed = seedTopic(db, 'Renamed soon');
  const hidden = seedTopic(db, 'Hidden soon');
  for (const id of posts) {
    for (const topic of [absorbed, survivor, renamed, hidden]) seedScore(db, id, topic, 0.9);
  }
  mergeTopics(db, absorbed, survivor);
  renameTopic(db, renamed, 'Renamed');
  setTopicHidden(db, hidden, true);
  const pinned = pinQuery(db, { query: 'motion', scores: posts.map((postId) => ({ postId, probability: 0.9 })) });
  const claude = fakeClaude(() => subtopics('Animations', 'CSS'));

  const result = await evolve(db, { claude, jev: jevBy(splitRules) });

  assert.equal(claude.requests.length, 0);
  assert.deepEqual(result, { newTopics: 0, splits: 0, rejected: 0, dropped: 0, skipped: null });
  for (const topic of [survivor, renamed, hidden, pinned.topicId]) {
    assert.equal(db.prepare(`SELECT state FROM topics WHERE id = ?`).get(topic)?.state, 'active');
    assert.equal(members(db, topic, 'confident').length, 130);
  }
});

test('a topic the user locks while its split is being scored is left alone, and the attempt is logged as dropped', async (t) => {
  const { db } = tempStore(t);
  const { parent } = seedBroadTopic(db);
  let renamedOnce = false;
  const jev = jevBy(splitRules, () => {
    if (renamedOnce) return;
    renamedOnce = true;
    renameTopic(db, parent, 'My frontend');
  });

  const result = await evolve(db, { claude: fakeClaude(() => subtopics('Animations', 'CSS')), jev });

  assert.deepEqual(result, { newTopics: 0, splits: 0, rejected: 0, dropped: 1, skipped: null });
  const row = db.prepare(`SELECT state, name FROM topics WHERE id = ?`).get(parent);
  assert.deepEqual({ ...row }, { state: 'active', name: 'My frontend' });
  assert.equal(members(db, parent, 'confident').length, 130);
  assert.equal(count(db, 'topics'), 1);
  assert.equal(count(db, 'changes'), 0);
  assert.deepEqual(attempts(db), ['split:dropped']);
});

test('a failure midway through applying a change leaves the store as it was before the change', async (t) => {
  const { db } = tempStore(t);
  seedPosts(db, 'zeta', 25, 'zeta');
  db.exec(
    `CREATE TRIGGER fail_late BEFORE INSERT ON change_topics BEGIN SELECT RAISE(ABORT, 'disk full'); END`,
  );

  await assert.rejects(
    evolve(db, { claude: fakeClaude(() => newTopic('Zeta')), jev: jevBy({ Zeta: has('zeta') }) }),
    /disk full/,
  );

  assert.equal(count(db, 'topics', `state = 'active'`), 0);
  assert.equal(count(db, 'areas'), 0);
  assert.equal(count(db, 'changes'), 0);
  assert.equal(count(db, 'proposal_attempts'), 0);
  assert.equal(unfiled(db).length, 25);
});

test('undoing a topic\'s creation after that topic was split undoes the split first, then the creation, and reports both', async (t) => {
  const { db } = tempStore(t);
  seedPosts(db, 'anim', 70, 'anim');
  seedPosts(db, 'css', 55, 'css');
  seedPosts(db, 'other', 5, 'other frontend');
  seedPosts(db, 'misc', 20, 'misc');
  const claude = fakeClaude((request) => (isSplitRequest(request) ? subtopics('Animations', 'CSS') : newTopic('Big', 'Frontend')));
  const jev = jevBy({ ...splitRules, Big: (text) => (/anim|css|frontend/.test(text) ? 0.9 : 0.05) });

  const result = await evolve(db, { claude, jev });
  assert.deepEqual(result, { newTopics: 1, splits: 1, rejected: 0, dropped: 0, skipped: null });
  const [creation, split] = changes(db);
  assert.deepEqual([creation.kind, split.kind], ['new_topic', 'split']);

  assert.deepEqual(
    listUndo(db, Number(creation.id)).map((change) => change.kind),
    ['split', 'new_topic'],
  );
  const undone = undoChange(db, Number(creation.id));

  assert.deepEqual(undone.undone.map((change) => change.kind), ['split', 'new_topic']);
  assert.equal(count(db, 'topics', `state = 'active'`), 0);
  assert.equal(unfiled(db).length, 150);
  assert.equal(count(db, 'changes', `source = 'auto' AND undone_at IS NULL`), 0);
});

const strandedMerges = (db: Store): number =>
  Number(
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM topics t JOIN topics target ON target.id = t.merged_into
         WHERE t.state = 'merged' AND target.state <> 'active' AND target.state <> 'merged'`,
      )
      .get()?.n,
  );

test('undoing a topic\'s creation brings back a topic the user merged into it, with its posts and fixes', async (t) => {
  const { db } = tempStore(t);
  const zeta = seedPosts(db, 'zeta', 9, 'zeta tool');
  const misc = seedPosts(db, 'misc', 16, 'misc');
  const mine = seedTopic(db, 'My tools');
  for (const id of [...zeta, ...misc]) seedScore(db, id, mine, 0.05);
  for (const id of ['mine-1', 'mine-2', 'mine-3']) seedPost(db, id, { text: `${id} text` });
  seedScore(db, 'mine-1', mine, 0.9);
  seedScore(db, 'mine-2', mine, 0.9);
  seedScore(db, 'mine-3', mine, 0.1);
  seedOverride(db, 'mine-3', mine, 'add');
  await evolve(db, { claude: fakeClaude(() => newTopic('Zeta')), jev: jevBy({ Zeta: has('zeta') }) });
  const created = topicId(db, 'Zeta');
  mergeTopics(db, mine, created);
  addPostTopic(db, 'misc-001', created);
  assert.deepEqual(members(db, created, 'confident'), ['mine-1', 'mine-2', 'mine-3', 'misc-001', ...zeta].sort());
  const changeId = Number(changes(db)[0].id);

  assert.deepEqual(listUndo(db, changeId).map((change) => change.restores), [['My tools']]);
  undoChange(db, changeId);

  assert.equal(topicNamed(db, 'Zeta')?.state, 'removed');
  const restored = db.prepare(`SELECT state, merged_into, locked FROM topics WHERE id = ?`).get(mine);
  assert.deepEqual({ ...restored }, { state: 'active', merged_into: null, locked: 1 });
  assert.deepEqual(members(db, mine, 'confident'), ['mine-1', 'mine-2', 'mine-3', 'misc-001']);
  assert.equal(strandedMerges(db), 0);
  assert.equal(unfiled(db).length, 24);
  assert.deepEqual(
    JSON.parse(String(db.prepare(`SELECT match_set_json FROM suppressed_proposals WHERE name = 'Zeta'`).get()?.match_set_json)),
    zeta,
  );
  assert.deepEqual(renameTopic(db, mine, 'Tools I use'), { topicId: mine, name: 'Tools I use' });
});

test('undoing a split brings back a topic the user merged into one of its subtopics', async (t) => {
  const { db } = tempStore(t);
  const { parent, posts } = seedBroadTopic(db);
  const mine = seedTopic(db, 'Motion notes');
  seedPost(db, 'mine-1', { text: 'mine-1 text' });
  seedScore(db, 'mine-1', mine, 0.9);
  seedScore(db, 'mine-1', parent, 0.05);
  for (const id of posts) seedScore(db, id, mine, 0.05);
  await evolve(db, { claude: fakeClaude(() => subtopics('Animations', 'CSS')), jev: jevBy(splitRules) });
  const animations = topicId(db, 'Animations');
  mergeTopics(db, mine, animations);
  addPostTopic(db, 'css-001', animations);
  const changeId = Number(changes(db)[0].id);

  assert.deepEqual(listUndo(db, changeId).map((change) => change.restores), [['Motion notes']]);
  undoChange(db, changeId);

  const restored = db.prepare(`SELECT state, merged_into, locked FROM topics WHERE id = ?`).get(mine);
  assert.deepEqual({ ...restored }, { state: 'active', merged_into: null, locked: 1 });
  assert.deepEqual(members(db, mine, 'confident'), ['css-001', 'mine-1']);
  assert.deepEqual(members(db, parent, 'confident'), [...posts].sort());
  assert.equal(strandedMerges(db), 0);
  assert.equal(count(db, 'topics', `state = 'active'`), 2);
});

test('a created topic the user merged into another is left alone by the undo, and the confirmation promises nothing for it', async (t) => {
  const { db } = tempStore(t);
  const zeta = seedPosts(db, 'zeta', 9, 'zeta tool');
  const misc = seedPosts(db, 'misc', 16, 'misc');
  const first = seedTopic(db, 'My tools');
  const second = seedTopic(db, 'Everything else');
  for (const id of [...zeta, ...misc]) {
    seedScore(db, id, first, 0.05);
    seedScore(db, id, second, 0.05);
  }
  await evolve(db, { claude: fakeClaude(() => newTopic('Zeta')), jev: jevBy({ Zeta: has('zeta') }) });
  const created = topicId(db, 'Zeta');
  mergeTopics(db, first, created);
  mergeTopics(db, created, second);
  const changeId = Number(changes(db)[0].id);

  assert.deepEqual(listUndo(db, changeId).map((change) => change.restores), [[]]);
  undoChange(db, changeId);

  assert.equal(topicNamed(db, 'Zeta')?.state, 'merged');
  assert.equal(topicNamed(db, 'My tools')?.state, 'merged');
  assert.deepEqual(members(db, second, 'confident'), zeta);
});

for (const direction of ['lower-numbered into the higher', 'higher-numbered into the lower']) {
  test(`undoing a split whose subtopics the user merged, ${direction}, takes both out of use`, async (t) => {
    const { db } = tempStore(t);
    const { parent, posts } = seedBroadTopic(db);
    await evolve(db, { claude: fakeClaude(() => subtopics('Animations', 'CSS')), jev: jevBy(splitRules) });
    const [lower, higher] = [topicId(db, 'Animations'), topicId(db, 'CSS')].sort((a, b) => a - b);
    if (direction.startsWith('lower')) mergeTopics(db, lower, higher);
    else mergeTopics(db, higher, lower);
    const changeId = Number(changes(db)[0].id);

    assert.deepEqual(listUndo(db, changeId).map((change) => change.restores), [[]]);
    undoChange(db, changeId);

    assert.equal(db.prepare(`SELECT state FROM topics WHERE id = ?`).get(parent)?.state, 'active');
    assert.equal(topicNamed(db, 'Animations')?.state, 'removed');
    assert.equal(topicNamed(db, 'CSS')?.state, 'removed');
    assert.equal(count(db, 'suppressed_proposals', `name = 'Animations'`), 1);
    assert.equal(count(db, 'suppressed_proposals', `name = 'CSS'`), 1);
    assert.equal(count(db, 'topics', `state = 'active'`), 1);
    assert.equal(strandedMerges(db), 0);
    assert.deepEqual(members(db, parent, 'confident'), [...posts].sort());
  });
}

test('undoing a split still brings back the user\'s own topic when its subtopic was then merged into the other', async (t) => {
  const { db } = tempStore(t);
  const { parent, posts } = seedBroadTopic(db);
  const mine = seedTopic(db, 'Motion notes');
  seedPost(db, 'mine-1', { text: 'mine-1 text' });
  seedScore(db, 'mine-1', mine, 0.9);
  seedScore(db, 'mine-1', parent, 0.05);
  for (const id of posts) seedScore(db, id, mine, 0.05);
  await evolve(db, { claude: fakeClaude(() => subtopics('Animations', 'CSS')), jev: jevBy(splitRules) });
  const animations = topicId(db, 'Animations');
  mergeTopics(db, mine, animations);
  mergeTopics(db, animations, topicId(db, 'CSS'));
  const changeId = Number(changes(db)[0].id);

  assert.deepEqual(listUndo(db, changeId).flatMap((change) => change.restores), ['Motion notes']);
  undoChange(db, changeId);

  const restored = db.prepare(`SELECT state, merged_into, locked FROM topics WHERE id = ?`).get(mine);
  assert.deepEqual({ ...restored }, { state: 'active', merged_into: null, locked: 1 });
  assert.deepEqual(members(db, mine, 'confident'), ['mine-1']);
  assert.equal(topicNamed(db, 'Animations')?.state, 'removed');
  assert.equal(topicNamed(db, 'CSS')?.state, 'removed');
  assert.equal(strandedMerges(db), 0);
  assert.equal(count(db, 'topics', `state = 'active'`), 2);
});
