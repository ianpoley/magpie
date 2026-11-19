import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ClaudeAdapter } from '../src/claude/cli.ts';
import { runDiscovery } from '../src/claude/discovery.ts';
import { tagPosts } from '../src/jev/tagger.ts';
import type { Store } from '../src/store/db.ts';
import {
  EditError,
  addPostTopic,
  deleteArea,
  deleteTopic,
  listUndo,
  mergeTopics,
  pinQuery,
  removePost,
  removePostTopic,
  renameArea,
  renameTopic,
  restorePost,
  setAreaHidden,
  setTopicHidden,
  undoChange,
  unpin,
} from '../src/store/edits.ts';
import { fakeJev, seedArea, seedOverride, seedPost, seedScore, seedTopic, tempStore } from './fixtures/corpus.ts';

const topicRow = (db: Store, id: number) => db.prepare(`SELECT * FROM topics WHERE id = ?`).get(id);
const areaRow = (db: Store, id: number) => db.prepare(`SELECT * FROM areas WHERE id = ?`).get(id);

const members = (db: Store, topicId: number, band?: string): string[] =>
  db
    .prepare(`SELECT post_id, band FROM topic_membership WHERE topic_id = ? ORDER BY post_id`)
    .all(topicId)
    .filter((row) => !band || row.band === band)
    .map((row) => String(row.post_id));

const unfiled = (db: Store): string[] =>
  db
    .prepare(`SELECT post_id FROM post_unfiled ORDER BY post_id`)
    .all()
    .map((row) => String(row.post_id));

const throwsCode = (fn: () => unknown, code: string) =>
  assert.throws(fn, (error) => error instanceof EditError && error.code === code);

test('renaming a topic or an area changes its name and locks it', (t) => {
  const { db } = tempStore(t);
  const area = seedArea(db, 'AI');
  const topic = seedTopic(db, 'Evals', { areaId: area });

  renameTopic(db, topic, '  Model evals ');
  renameArea(db, area, 'Machine learning');

  assert.equal(topicRow(db, topic)?.name, 'Model evals');
  assert.equal(topicRow(db, topic)?.locked, 1);
  assert.equal(areaRow(db, area)?.name, 'Machine learning');
  assert.equal(areaRow(db, area)?.locked, 1);
});

test('invalid edits throw a typed error and change nothing', (t) => {
  const { db } = tempStore(t);
  const topic = seedTopic(db, 'Evals');
  const gone = seedTopic(db, 'Old', { state: 'deleted' });
  seedPost(db, 'p1');

  throwsCode(() => renameTopic(db, topic, '   '), 'invalid_name');
  throwsCode(() => renameTopic(db, 999, 'X'), 'unknown_topic');
  throwsCode(() => renameArea(db, 999, 'X'), 'unknown_area');
  throwsCode(() => mergeTopics(db, topic, topic), 'merge_into_self');
  throwsCode(() => mergeTopics(db, topic, gone), 'not_active');
  throwsCode(() => addPostTopic(db, 'missing', topic), 'unknown_post');
  throwsCode(() => addPostTopic(db, 'p1', gone), 'not_active');
  throwsCode(() => unpin(db, topic), 'not_pinned');
  throwsCode(() => listUndo(db, 999), 'unknown_change');

  assert.equal(topicRow(db, topic)?.name, 'Evals');
  assert.equal(topicRow(db, topic)?.locked, 0);
});

test('merging a topic into another moves its per-post fixes and keeps its definition scoring for the survivor', async (t) => {
  const { db } = tempStore(t);
  const agents = seedTopic(db, 'Agents');
  const tooling = seedTopic(db, 'AI tooling');
  for (const id of ['p1', 'p2', 'p3', 'p4']) seedPost(db, id);
  seedScore(db, 'p1', agents, 0.9);
  seedScore(db, 'p1', tooling, 0.1);
  seedScore(db, 'p2', agents, 0.9);
  seedScore(db, 'p2', tooling, 0.9);
  seedOverride(db, 'p2', agents, 'remove');
  seedScore(db, 'p3', agents, 0.1);
  seedScore(db, 'p3', tooling, 0.1);
  seedOverride(db, 'p3', agents, 'add');
  seedScore(db, 'p4', agents, 0.9);
  seedScore(db, 'p4', tooling, 0.9);
  seedOverride(db, 'p4', agents, 'remove');
  seedOverride(db, 'p4', tooling, 'add');

  mergeTopics(db, agents, tooling);

  assert.equal(topicRow(db, agents)?.state, 'merged');
  assert.equal(topicRow(db, agents)?.merged_into, tooling);
  assert.equal(topicRow(db, tooling)?.locked, 1);
  assert.deepEqual(
    db.prepare(`SELECT post_id, topic_id, action FROM overrides ORDER BY post_id`).all().map((row) => ({ ...row })),
    [
      { post_id: 'p2', topic_id: tooling, action: 'remove' },
      { post_id: 'p3', topic_id: tooling, action: 'add' },
      { post_id: 'p4', topic_id: tooling, action: 'add' },
    ],
  );
  assert.deepEqual(members(db, tooling, 'confident'), ['p1', 'p3', 'p4']);

  seedPost(db, 'p5');
  const jev = fakeJev((questionId) => (questionId === `topic_${agents}` ? 0.95 : 0.05));
  await tagPosts(db, { jev });
  assert.deepEqual(members(db, tooling, 'confident'), ['p1', 'p3', 'p4', 'p5']);
});

test('deleting a topic returns posts with no other confident topic to Unfiled and keeps its last matches', (t) => {
  const { db } = tempStore(t);
  const evals = seedTopic(db, 'Evals');
  const agents = seedTopic(db, 'Agents');
  for (const id of ['p1', 'p2']) seedPost(db, id);
  seedScore(db, 'p1', evals, 0.9);
  seedScore(db, 'p2', evals, 0.9);
  seedScore(db, 'p2', agents, 0.8);

  deleteTopic(db, evals);

  assert.equal(topicRow(db, evals)?.state, 'deleted');
  assert.deepEqual(JSON.parse(String(topicRow(db, evals)?.last_match_json)), ['p1', 'p2']);
  assert.deepEqual(members(db, evals), []);
  assert.deepEqual(unfiled(db), ['p1']);
});

test('deleting an area deletes its topics and returns posts with no other confident topic to Unfiled', (t) => {
  const { db } = tempStore(t);
  const ai = seedArea(db, 'AI');
  const frontend = seedArea(db, 'Frontend');
  const evals = seedTopic(db, 'Evals', { areaId: ai });
  const agents = seedTopic(db, 'Agents', { areaId: ai });
  const animations = seedTopic(db, 'Animations', { areaId: frontend });
  for (const id of ['p1', 'p2', 'p3']) seedPost(db, id);
  seedScore(db, 'p1', evals, 0.9);
  seedScore(db, 'p2', agents, 0.9);
  seedScore(db, 'p3', agents, 0.9);
  seedScore(db, 'p3', animations, 0.9);

  const result = deleteArea(db, ai);

  assert.deepEqual(result.topicIds, [evals, agents]);
  assert.equal(areaRow(db, ai)?.state, 'deleted');
  assert.equal(topicRow(db, evals)?.state, 'deleted');
  assert.equal(topicRow(db, agents)?.state, 'deleted');
  assert.equal(topicRow(db, animations)?.state, 'active');
  assert.deepEqual(unfiled(db), ['p1', 'p2']);
});

test('hiding and unhiding a topic or an area flags its posts and locks it', (t) => {
  const { db } = tempStore(t);
  const area = seedArea(db, 'Politics');
  const elections = seedTopic(db, 'Elections', { areaId: area });
  const other = seedTopic(db, 'Evals');
  seedPost(db, 'p1');
  seedPost(db, 'p2');
  seedScore(db, 'p1', elections, 0.9);
  seedScore(db, 'p2', other, 0.9);
  const hidden = () =>
    db
      .prepare(`SELECT post_id FROM post_hidden ORDER BY post_id`)
      .all()
      .map((row) => String(row.post_id));

  setAreaHidden(db, area, true);
  assert.deepEqual(hidden(), ['p1']);
  assert.equal(areaRow(db, area)?.locked, 1);
  assert.equal(topicRow(db, elections)?.locked, 0);

  setAreaHidden(db, area, false);
  assert.deepEqual(hidden(), []);

  setTopicHidden(db, other, true);
  assert.deepEqual(hidden(), ['p2']);
  assert.equal(topicRow(db, other)?.locked, 1);
  setTopicHidden(db, other, false);
  assert.deepEqual(hidden(), []);
});

test('a per-post add or remove outlasts a later re-tag and does not lock the topic', async (t) => {
  const { db } = tempStore(t);
  const animations = seedTopic(db, 'Animations');
  seedPost(db, 'p1');
  seedPost(db, 'p2');
  seedScore(db, 'p1', animations, 0.9);
  seedScore(db, 'p2', animations, 0.1);

  removePostTopic(db, 'p1', animations);
  addPostTopic(db, 'p2', animations);
  assert.deepEqual(members(db, animations, 'confident'), ['p2']);

  db.exec(`DELETE FROM scores`);
  await tagPosts(db, { jev: fakeJev((_, request) => (JSON.stringify(request.state).includes('p1') ? 0.95 : 0.05)) });

  assert.deepEqual(members(db, animations, 'confident'), ['p2']);
  assert.equal(topicRow(db, animations)?.locked, 0);

  addPostTopic(db, 'p1', animations);
  assert.deepEqual(members(db, animations, 'confident'), ['p1', 'p2']);
});

test('pinning a query stores a locked topic under the Pinned area with its scores, and the next tagging pass scores new posts against it', async (t) => {
  const { db } = tempStore(t);
  seedPost(db, 'p1');
  seedPost(db, 'p2');

  const first = pinQuery(db, {
    query: 'scroll-driven animation',
    scores: [
      { postId: 'p1', probability: 0.9 },
      { postId: 'p2', probability: 0.1 },
    ],
  });
  const second = pinQuery(db, { query: 'evals for agents', scores: [{ postId: 'p1', probability: 0.2 }] });

  const pinned = topicRow(db, first.topicId);
  assert.equal(pinned?.kind, 'pinned');
  assert.equal(pinned?.state, 'active');
  assert.equal(pinned?.locked, 1);
  assert.equal(pinned?.name, 'scroll-driven animation');
  assert.equal(pinned?.query, 'scroll-driven animation');
  assert.equal(first.areaId, second.areaId);
  assert.deepEqual(
    db.prepare(`SELECT name, kind FROM areas`).all().map((row) => ({ ...row })),
    [{ name: 'Pinned', kind: 'system' }],
  );
  assert.deepEqual(members(db, first.topicId, 'confident'), ['p1']);
  assert.deepEqual(unfiled(db), ['p2']);

  seedPost(db, 'p3', { text: 'CSS scroll timelines are here' });
  const jev = fakeJev((questionId) => (questionId === `topic_${first.topicId}` ? 0.92 : 0.05));
  await tagPosts(db, { jev });

  assert.deepEqual(members(db, first.topicId, 'confident'), ['p1', 'p3']);
});

test('pinning rejects an empty query, an unknown post, or a probability outside 0 to 1', (t) => {
  const { db } = tempStore(t);
  seedPost(db, 'p1');

  throwsCode(() => pinQuery(db, { query: ' ', scores: [] }), 'invalid_name');
  throwsCode(() => pinQuery(db, { query: 'q', scores: [{ postId: 'nope', probability: 0.5 }] }), 'unknown_post');
  throwsCode(() => pinQuery(db, { query: 'q', scores: [{ postId: 'p1', probability: 1.5 }] }), 'invalid_score');

  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM topics`).get()?.n, 0);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM areas`).get()?.n, 0);
});

test('unpinning removes the pinned topic and its scores and leaves no tombstone', (t) => {
  const { db } = tempStore(t);
  seedPost(db, 'p1');
  const { topicId } = pinQuery(db, { query: 'local-first sync', scores: [{ postId: 'p1', probability: 0.9 }] });

  unpin(db, topicId);

  assert.equal(topicRow(db, topicId), undefined);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM scores`).get()?.n, 0);
  assert.deepEqual(unfiled(db), ['p1']);
});

test('deleting a pinned topic unpins it', (t) => {
  const { db } = tempStore(t);
  const { topicId } = pinQuery(db, { query: 'local-first sync', scores: [] });

  deleteTopic(db, topicId);

  assert.equal(topicRow(db, topicId), undefined);
});

test('the Pinned area cannot be renamed, hidden, or deleted', (t) => {
  const { db } = tempStore(t);
  const { areaId } = pinQuery(db, { query: 'local-first sync', scores: [] });

  throwsCode(() => renameArea(db, areaId, 'Mine'), 'system_area');
  throwsCode(() => setAreaHidden(db, areaId, true), 'system_area');
  throwsCode(() => deleteArea(db, areaId), 'system_area');
});

test('the first discovery pass writes one log entry that offers no undo', async (t) => {
  const { db } = tempStore(t);
  seedPost(db, 'p1');
  const replies = [
    { topics: [{ name: 'Evals', area: 'AI', definition: 'Posts about evals.' }] },
    { areas: [{ name: 'AI', dev: true, topics: [{ name: 'Evals', definition: 'Posts about evals.' }] }] },
  ];
  const claude: ClaudeAdapter = {
    send: async () => ({ ok: true, value: replies.shift(), session: null }),
  };

  const result = await runDiscovery(db, { claude });
  assert.equal(result.status, 'created');

  const changes = db.prepare(`SELECT id FROM changes`).all();
  assert.equal(changes.length, 1);
  const changeId = Number(changes[0].id);
  throwsCode(() => listUndo(db, changeId), 'not_undoable');
  throwsCode(() => undoChange(db, changeId), 'not_undoable');
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM topics WHERE state = 'active'`).get()?.n, 1);
});

test('removing a post takes it out of every topic and restoring it returns it with its topics and fixes, with no model call', (t) => {
  const { db } = tempStore(t);
  const evals = seedTopic(db, 'Evals');
  const agents = seedTopic(db, 'Agents');
  const tooling = seedTopic(db, 'Tooling');
  seedScore(db, seedPost(db, '1'), evals, 0.9);
  seedScore(db, '1', agents, 0.9);
  seedScore(db, '1', tooling, 0.1);
  addPostTopic(db, '1', tooling);
  removePostTopic(db, '1', agents);
  seedScore(db, seedPost(db, 'other'), evals, 0.9);
  for (const topic of [agents, tooling]) seedScore(db, 'other', topic, 0.1);
  const kept = () => [
    db.prepare(`SELECT topic_id, probability, scored_at FROM scores WHERE post_id = '1' ORDER BY topic_id`).all(),
    db.prepare(`SELECT topic_id, action, created_at FROM overrides WHERE post_id = '1' ORDER BY topic_id`).all(),
  ];
  const before = kept();

  assert.deepEqual(removePost(db, '1'), { postId: '1' });

  assert.deepEqual(members(db, evals), ['other']);
  assert.deepEqual(members(db, tooling), []);
  assert.deepEqual(unfiled(db), []);
  assert.deepEqual(kept(), before);

  assert.deepEqual(restorePost(db, '1'), { postId: '1' });

  assert.deepEqual(members(db, evals, 'confident'), ['1', 'other']);
  assert.deepEqual(members(db, tooling, 'confident'), ['1']);
  assert.deepEqual(members(db, agents), []);
  assert.deepEqual(kept(), before);
  assert.deepEqual(
    db.prepare(`SELECT post_id FROM pairs_to_score`).all(),
    [],
    'a restored post needs nothing scored again',
  );
});

test('removing a post twice keeps the first removal time, and an unknown post is a typed error', (t) => {
  const { db } = tempStore(t);
  seedPost(db, '1');
  const removedAt = () => db.prepare(`SELECT removed_at FROM posts WHERE id = '1'`).get()?.removed_at;

  removePost(db, '1');
  const first = removedAt();
  assert.equal(typeof first, 'string');
  db.prepare(`UPDATE posts SET removed_at = '2026-01-01T00:00:00.000Z' WHERE id = '1'`).run();
  removePost(db, '1');
  assert.equal(removedAt(), '2026-01-01T00:00:00.000Z');

  restorePost(db, '1');
  restorePost(db, '1');
  assert.equal(removedAt(), null);

  throwsCode(() => removePost(db, 'nope'), 'unknown_post');
  throwsCode(() => restorePost(db, 'nope'), 'unknown_post');
});
