import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BANDS } from '../src/config.ts';
import { openStore } from '../src/store/db.ts';
import type { Store } from '../src/store/db.ts';
import { syncBands } from '../src/store/membership.ts';
import {
  seedArea,
  seedLink,
  seedOverride,
  seedPost,
  seedScore,
  seedTopic,
  tempStore,
} from './fixtures/corpus.ts';

type Member = { post_id: string; band: string };

function membersOf(db: Store, topicId: number): Member[] {
  return db
    .prepare(
      `SELECT post_id, band FROM topic_membership WHERE topic_id = ?
       ORDER BY band = 'confident' DESC, strength DESC`,
    )
    .all(topicId)
    .map((row) => ({ post_id: String(row.post_id), band: String(row.band) }));
}

const ids = (db: Store, view: string): string[] =>
  db
    .prepare(`SELECT post_id FROM ${view} ORDER BY post_id`)
    .all()
    .map((row) => String(row.post_id));

test('a topic holds its confident matches first, then its unsure ones', (t) => {
  const { db } = tempStore(t);
  const evals = seedTopic(db, 'Evals');
  seedScore(db, seedPost(db, 'unsure'), evals, 0.5);
  seedScore(db, seedPost(db, 'confident'), evals, 0.9);

  assert.deepEqual(membersOf(db, evals), [
    { post_id: 'confident', band: 'confident' },
    { post_id: 'unsure', band: 'unsure' },
  ]);
});

test('a post scoring below the unsure threshold is not in the topic', (t) => {
  const { db } = tempStore(t);
  const evals = seedTopic(db, 'Evals');
  seedScore(db, seedPost(db, 'p1'), evals, 0.2);

  assert.deepEqual(membersOf(db, evals), []);
});

test('scores exactly on a threshold fall in the higher band', (t) => {
  const { db } = tempStore(t);
  const evals = seedTopic(db, 'Evals');
  seedScore(db, seedPost(db, 'at-confident'), evals, BANDS.confident);
  seedScore(db, seedPost(db, 'at-unsure'), evals, BANDS.unsure);

  assert.deepEqual(membersOf(db, evals), [
    { post_id: 'at-confident', band: 'confident' },
    { post_id: 'at-unsure', band: 'unsure' },
  ]);
});

test('a post whose best score is unsure is in that topic and also Unfiled', (t) => {
  const { db } = tempStore(t);
  const evals = seedTopic(db, 'Evals');
  const agents = seedTopic(db, 'Agents');
  seedPost(db, 'p1');
  seedScore(db, 'p1', evals, 0.6);
  seedScore(db, 'p1', agents, 0.1);
  seedScore(db, seedPost(db, 'filed'), evals, 0.8);

  assert.deepEqual(membersOf(db, evals), [
    { post_id: 'filed', band: 'confident' },
    { post_id: 'p1', band: 'unsure' },
  ]);
  assert.deepEqual(ids(db, 'post_unfiled'), ['p1']);
});

test('a post the user removed from a topic is absent despite a confident score', (t) => {
  const { db } = tempStore(t);
  const animations = seedTopic(db, 'Animations');
  seedScore(db, seedPost(db, 'p1'), animations, 0.9);
  seedOverride(db, 'p1', animations, 'remove');

  assert.deepEqual(membersOf(db, animations), []);
  assert.deepEqual(ids(db, 'post_unfiled'), ['p1']);
});

test('a post the user added to a topic is a confident member with no score', (t) => {
  const { db } = tempStore(t);
  const animations = seedTopic(db, 'Animations');
  seedPost(db, 'p1');
  seedOverride(db, 'p1', animations, 'add');

  assert.deepEqual(membersOf(db, animations), [{ post_id: 'p1', band: 'confident' }]);
  assert.deepEqual(ids(db, 'post_unfiled'), []);
});

test('a post a split carried onto a subtopic stays there as unsure with a low score', (t) => {
  const { db } = tempStore(t);
  const subtopic = seedTopic(db, 'Spring physics');
  seedScore(db, seedPost(db, 'p1'), subtopic, 0.1);
  seedOverride(db, 'p1', subtopic, 'unsure');

  assert.deepEqual(membersOf(db, subtopic), [{ post_id: 'p1', band: 'unsure' }]);
});

test('a score against a merged-away topic counts for the topic that survived', (t) => {
  const { db } = tempStore(t);
  const tooling = seedTopic(db, 'AI tooling');
  const agents = seedTopic(db, 'Agents', { state: 'merged', mergedInto: tooling });
  const older = seedTopic(db, 'Autonomous agents', { state: 'merged', mergedInto: agents });
  seedScore(db, seedPost(db, 'via-merged'), agents, 0.9);
  seedScore(db, seedPost(db, 'via-chain'), older, 0.5);
  seedPost(db, 'both');
  seedScore(db, 'both', agents, 0.4);
  seedScore(db, 'both', tooling, 0.8);

  assert.deepEqual(membersOf(db, tooling), [
    { post_id: 'via-merged', band: 'confident' },
    { post_id: 'both', band: 'confident' },
    { post_id: 'via-chain', band: 'unsure' },
  ]);
  assert.deepEqual(membersOf(db, agents), []);
  assert.deepEqual(membersOf(db, older), []);
});

test('only active topics have members', (t) => {
  const { db } = tempStore(t);
  seedPost(db, 'p1');
  for (const state of ['proposed', 'split', 'deleted', 'removed']) {
    const topic = seedTopic(db, `A ${state} topic`, { state });
    seedScore(db, 'p1', topic, 0.9);
    assert.deepEqual(membersOf(db, topic), [], state);
  }
  const deleted = seedTopic(db, 'Deleted with a fix', { state: 'deleted' });
  seedOverride(db, 'p1', deleted, 'add');
  assert.deepEqual(membersOf(db, deleted), []);
  assert.deepEqual(ids(db, 'post_unfiled'), ['p1']);
});

test('a post in neither collection has no memberships and is not Unfiled', (t) => {
  const { db } = tempStore(t);
  const evals = seedTopic(db, 'Evals');
  seedScore(db, seedPost(db, 'gone', { bookmarked: false, liked: false }), evals, 0.9);
  seedPost(db, 'gone-unscored', { bookmarked: false, liked: false });

  assert.deepEqual(membersOf(db, evals), []);
  assert.deepEqual(ids(db, 'post_unfiled'), []);
  assert.deepEqual(ids(db, 'post_pending'), []);
});

test('changing the two thresholds changes memberships with the same scores', (t) => {
  const { db } = tempStore(t);
  const evals = seedTopic(db, 'Evals');
  seedScore(db, seedPost(db, 'p60'), evals, 0.6);
  seedScore(db, seedPost(db, 'p25'), evals, 0.25);

  syncBands(db);
  assert.deepEqual(membersOf(db, evals), [{ post_id: 'p60', band: 'unsure' }]);

  syncBands(db, { confident: 0.55, unsure: 0.2 });
  assert.deepEqual(membersOf(db, evals), [
    { post_id: 'p60', band: 'confident' },
    { post_id: 'p25', band: 'unsure' },
  ]);
  assert.deepEqual(ids(db, 'post_unfiled'), ['p25']);
});

test('a store opened read-only before any sync already answers with the default thresholds', (t) => {
  const { db, path } = tempStore(t);
  const evals = seedTopic(db, 'Evals');
  seedScore(db, seedPost(db, 'p1'), evals, 0.75);
  seedScore(db, seedPost(db, 'p2'), evals, 0.35);
  db.close();

  const reader = openStore(path, { readOnly: true });
  t.after(() => reader.close());
  assert.deepEqual(membersOf(reader, evals), [
    { post_id: 'p1', band: 'confident' },
    { post_id: 'p2', band: 'unsure' },
  ]);
});

test('a post whose only match is unsure and in a hidden area is hidden', (t) => {
  const { db } = tempStore(t);
  const politics = seedTopic(db, 'Elections', { areaId: seedArea(db, 'Politics', { hidden: true }) });
  const evals = seedTopic(db, 'Evals', { areaId: seedArea(db, 'AI') });
  seedPost(db, 'p1');
  seedScore(db, 'p1', politics, 0.5);
  seedScore(db, 'p1', evals, 0.1);

  assert.deepEqual(ids(db, 'post_hidden'), ['p1']);
  assert.equal(
    db.prepare(`SELECT hidden FROM topic_membership WHERE post_id = 'p1' AND topic_id = ?`).get(politics)?.hidden,
    1,
  );
});

test('a post confident in a hidden topic and in a visible topic is not hidden', (t) => {
  const { db } = tempStore(t);
  const hiddenTopic = seedTopic(db, 'Elections', { hidden: true });
  const evals = seedTopic(db, 'Evals');
  seedPost(db, 'p1');
  seedScore(db, 'p1', hiddenTopic, 0.95);
  seedScore(db, 'p1', evals, 0.75);

  assert.deepEqual(ids(db, 'post_hidden'), []);
});

test('hiding follows the best match when no visible match is confident', (t) => {
  const { db } = tempStore(t);
  const hiddenTopic = seedTopic(db, 'Elections', { hidden: true });
  const evals = seedTopic(db, 'Evals');
  const score = (post: string, hiddenScore: number, visibleScore: number) => {
    seedPost(db, post);
    seedScore(db, post, hiddenTopic, hiddenScore);
    seedScore(db, post, evals, visibleScore);
  };
  score('confident-hidden-unsure-visible', 0.9, 0.6);
  score('unsure-hidden-stronger', 0.6, 0.4);
  score('unsure-visible-stronger', 0.4, 0.6);
  score('no-match', 0.1, 0.1);

  assert.deepEqual(ids(db, 'post_hidden'), ['confident-hidden-unsure-visible', 'unsure-hidden-stronger']);
});

test('a pinned topic claims a post from Unfiled but does not affect hiding', (t) => {
  const { db } = tempStore(t);
  const pinnedArea = seedArea(db, 'Pinned', { kind: 'system' });
  const pinned = seedTopic(db, 'scroll-driven animation', { areaId: pinnedArea, kind: 'pinned' });
  const hiddenTopic = seedTopic(db, 'Elections', { hidden: true });
  const evals = seedTopic(db, 'Evals');
  seedPost(db, 'pinned-only');
  seedScore(db, 'pinned-only', pinned, 0.9);
  seedScore(db, 'pinned-only', evals, 0.5);
  seedPost(db, 'pinned-and-hidden');
  seedScore(db, 'pinned-and-hidden', pinned, 0.9);
  seedScore(db, 'pinned-and-hidden', hiddenTopic, 0.5);

  assert.deepEqual(ids(db, 'post_unfiled'), []);
  assert.deepEqual(ids(db, 'post_hidden'), ['pinned-and-hidden']);
});

test('a post is pending while a score is missing or a link is still due for retry', (t) => {
  const { db } = tempStore(t);
  const evals = seedTopic(db, 'Evals');
  const agents = seedTopic(db, 'Agents');
  const mergedAway = seedTopic(db, 'Autonomous agents', { state: 'merged', mergedInto: agents });
  seedTopic(db, 'Not yet active', { state: 'proposed' });
  const scoreAll = (post: string) => {
    seedPost(db, post);
    for (const topic of [evals, agents, mergedAway]) seedScore(db, post, topic, 0.1);
  };

  scoreAll('settled');
  seedLink(db, 'settled', 'https://t.co/done', { status: 'resolved', resolvedAt: '2025-12-31T00:00:00.000Z' });
  seedLink(db, 'settled', 'https://t.co/gaveup', { status: 'unresolved' });
  seedLink(db, 'settled', 'https://t.co/post', { status: 'not_resource' });

  seedPost(db, 'missing-one');
  seedScore(db, 'missing-one', evals, 0.1);
  seedScore(db, 'missing-one', agents, 0.1);

  scoreAll('link-new');
  seedLink(db, 'link-new', 'https://t.co/new', { status: 'new' });
  scoreAll('link-failed');
  seedLink(db, 'link-failed', 'https://t.co/failed', { status: 'failed' });

  assert.deepEqual(ids(db, 'post_pending'), ['link-failed', 'link-new', 'missing-one']);
});

test('a remove recorded on a merged-away topic discards only that definition', (t) => {
  const { db } = tempStore(t);
  const tooling = seedTopic(db, 'AI tooling');
  const agents = seedTopic(db, 'Agents', { state: 'merged', mergedInto: tooling });
  seedPost(db, 'only-via-removed');
  seedScore(db, 'only-via-removed', agents, 0.9);
  seedOverride(db, 'only-via-removed', agents, 'remove');
  seedPost(db, 'also-direct');
  seedScore(db, 'also-direct', agents, 0.9);
  seedScore(db, 'also-direct', tooling, 0.5);
  seedOverride(db, 'also-direct', agents, 'remove');

  assert.deepEqual(membersOf(db, tooling), [{ post_id: 'also-direct', band: 'unsure' }]);
});

test('a post removed from the corpus is in no topic and is not Unfiled, hidden, or pending', (t) => {
  const { db } = tempStore(t);
  const evals = seedTopic(db, 'Evals');
  const politics = seedArea(db, 'Politics', { hidden: true });
  const elections = seedTopic(db, 'Elections', { areaId: politics });
  const remove = (post: string) => db.prepare(`UPDATE posts SET removed_at = '2026-02-01T00:00:00.000Z' WHERE id = ?`).run(post);

  for (const post of ['kept', 'filed']) {
    seedScore(db, seedPost(db, post), evals, 0.9);
    seedScore(db, post, elections, 0.1);
  }
  seedOverride(db, seedPost(db, 'fixed'), evals, 'add');
  seedScore(db, 'fixed', elections, 0.1);
  seedScore(db, 'fixed', evals, 0.1);
  seedScore(db, seedPost(db, 'in-hidden'), elections, 0.9);
  seedScore(db, 'in-hidden', evals, 0.1);
  seedPost(db, 'unscored');
  seedScore(db, seedPost(db, 'link-due'), evals, 0.1);
  seedScore(db, 'link-due', elections, 0.1);
  seedLink(db, 'link-due', 'https://t.co/new', { status: 'new' });

  assert.deepEqual(membersOf(db, evals).map((m) => m.post_id).sort(), ['filed', 'fixed', 'kept']);
  assert.deepEqual(ids(db, 'post_unfiled'), ['link-due', 'unscored']);
  assert.deepEqual(ids(db, 'post_hidden'), ['in-hidden']);
  assert.deepEqual(ids(db, 'post_pending'), ['link-due', 'unscored']);
  assert.deepEqual(ids(db, 'pairs_to_score'), ['unscored', 'unscored']);

  for (const post of ['filed', 'fixed', 'in-hidden', 'unscored', 'link-due']) remove(post);

  assert.deepEqual(membersOf(db, evals), [{ post_id: 'kept', band: 'confident' }]);
  assert.deepEqual(membersOf(db, elections), []);
  for (const view of ['post_unfiled', 'post_hidden', 'post_pending', 'pairs_to_score']) {
    assert.deepEqual(ids(db, view), [], view);
  }
});
