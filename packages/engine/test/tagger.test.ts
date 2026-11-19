import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { BANDS } from '../src/config.ts';
import type { JevClient } from '../src/jev/client.ts';
import { hasSomethingToJudge, postContent, topicQuestionId } from '../src/jev/questions.ts';
import { scorePairs, tagPosts } from '../src/jev/tagger.ts';
import { parseSecrets, readSecrets } from '../src/secrets.ts';
import { openStore } from '../src/store/db.ts';
import type { Store } from '../src/store/db.ts';
import { fakeJev, seedLink, seedOverride, seedPost, seedScore, seedTopic, tempStore } from './fixtures/corpus.ts';
import { tempDir } from './fixtures/export.ts';

const ids = (db: Store, view: string): string[] =>
  db
    .prepare(`SELECT post_id FROM ${view} ORDER BY post_id`)
    .all()
    .map((row) => String(row.post_id));

test('a secrets file is parsed without a shell: export prefix, quotes, comments', () => {
  const secrets = parseSecrets(
    [
      '# keys for the corpus',
      'export TYPESAFE_API_KEY="ts-abc=123"',
      "OTHER='single quoted'",
      'BARE=value # trailing note',
      '',
      'not a line $(rm -rf /)',
    ].join('\n'),
  );
  assert.deepEqual(secrets, {
    TYPESAFE_API_KEY: 'ts-abc=123',
    OTHER: 'single quoted',
    BARE: 'value',
  });
});

test('reading secrets from a missing file yields none; from a file, its keys', (t) => {
  const { dir, cleanup } = tempDir();
  t.after(cleanup);
  assert.deepEqual(readSecrets(join(dir, 'absent.env')), {});
  const path = join(dir, 'secrets.env');
  writeFileSync(path, 'export TYPESAFE_API_KEY="k1"\n');
  assert.deepEqual(readSecrets(path), { TYPESAFE_API_KEY: 'k1' });
});

test('post content names only the parts a post has', () => {
  assert.deepEqual(postContent({ text: 'plain post' }), { text: 'plain post' });
  assert.deepEqual(
    postContent({
      text: 'this is wild',
      quotedText: 'the quoted words',
      links: [
        { host: 'github.com', title: 'acme/spring', description: 'React animation library' },
        { host: null, title: null, description: null },
        { host: 'example.com', title: 'Example', description: null },
      ],
    }),
    {
      text: 'this is wild',
      quoted_post: 'the quoted words',
      linked_pages: [
        { host: 'github.com', title: 'acme/spring', description: 'React animation library' },
        { host: 'example.com', title: 'Example' },
      ],
    },
  );
});

test('a page known only by its host is nothing to judge', () => {
  const content = postContent({
    text: 'https://t.co/abc',
    links: [{ host: 'example.com', title: 'Example.com', description: null }],
  });
  assert.deepEqual(content, { text: 'https://t.co/abc' });
  assert.equal(hasSomethingToJudge(content), false);
  assert.equal(hasSomethingToJudge(postContent({ text: 'look https://t.co/abc' })), true);
});

test('post content is cut to the character limit, post text first', () => {
  const content = postContent(
    {
      text: 'a'.repeat(80),
      quotedText: 'b'.repeat(80),
      links: [{ host: 'example.com', title: 'c'.repeat(80), description: 'd'.repeat(80) }],
    },
    100,
  );
  assert.equal(content.text, 'a'.repeat(80));
  assert.equal(content.quoted_post, 'b'.repeat(20));
  assert.equal(content.linked_pages, undefined);
});

const answerByTopic =
  (probabilities: Record<number, number>, otherwise = 0.1) =>
  (questionId: string): number => {
    for (const [topicId, probability] of Object.entries(probabilities)) {
      if (questionId === topicQuestionId(Number(topicId))) return probability;
    }
    return otherwise;
  };

const scoreRows = (db: Store) =>
  db
    .prepare(`SELECT post_id, topic_id, probability FROM scores ORDER BY post_id, topic_id`)
    .all()
    .map((row) => ({ ...row }));

const members = (db: Store, topicId: number): string[] =>
  db
    .prepare(`SELECT post_id FROM topic_membership WHERE topic_id = ? ORDER BY post_id`)
    .all(topicId)
    .map((row) => String(row.post_id));

test('a link-only post is sent with its resolved page title and description', async (t) => {
  const { db } = tempStore(t);
  const animations = seedTopic(db, 'Animations', {
    definition: 'Motion and animation in web and mobile interfaces.',
  });
  seedPost(db, 'p1', { text: 'this is wild 🔥 https://t.co/abc' });
  seedLink(db, 'p1', 'https://t.co/abc', {
    status: 'resolved',
    host: 'github.com',
    title: 'acme/spring: a React animation library',
    description: 'Spring physics animations for React.',
    resolvedAt: '2026-01-02T00:00:00.000Z',
  });
  seedLink(db, 'p1', 'https://t.co/pending', { status: 'failed', title: 'never sent' });
  const jev = fakeJev(answerByTopic({ [animations]: 0.92 }));

  const result = await tagPosts(db, { jev });

  assert.equal(jev.requests.length, 1);
  assert.deepEqual(jev.requests[0].state, {
    post: {
      text: 'this is wild 🔥 https://t.co/abc',
      linked_pages: [
        {
          host: 'github.com',
          title: 'acme/spring: a React animation library',
          description: 'Spring physics animations for React.',
        },
      ],
    },
  });
  const question = JSON.stringify(jev.requests[0].questions[topicQuestionId(animations)]);
  assert.match(question, /Animations/);
  assert.match(question, /Motion and animation in web and mobile interfaces\./);
  assert.deepEqual(members(db, animations), ['p1']);
  assert.deepEqual(scoreRows(db), [{ post_id: 'p1', topic_id: animations, probability: 0.92 }]);
  assert.equal(result.scored, 1);
  assert.equal(result.failed, 0);
});

test('a quoted post is part of what is judged', async (t) => {
  const { db } = tempStore(t);
  seedTopic(db, 'Evals');
  seedPost(db, 'p1', { text: 'yoink', quoted: { id: 'q1', text: 'How we grade agent output' } });
  const jev = fakeJev();

  await tagPosts(db, { jev });

  assert.deepEqual(jev.requests[0].state, {
    post: { text: 'yoink', quoted_post: 'How we grade agent output' },
  });
});

test('every visible post gets a score for every active and merged-away definition', async (t) => {
  const { db } = tempStore(t);
  const evals = seedTopic(db, 'Evals');
  const agents = seedTopic(db, 'Agents', { state: 'merged', mergedInto: evals });
  seedTopic(db, 'Deleted', { state: 'deleted' });
  seedTopic(db, 'Proposed', { state: 'proposed' });
  seedPost(db, 'bookmarked');
  seedPost(db, 'liked', { bookmarked: false, liked: true });
  seedPost(db, 'gone', { bookmarked: false, liked: false });
  const jev = fakeJev(answerByTopic({ [evals]: 0.8, [agents]: 0.4 }));

  const result = await tagPosts(db, { jev });

  assert.deepEqual(scoreRows(db), [
    { post_id: 'bookmarked', topic_id: evals, probability: 0.8 },
    { post_id: 'bookmarked', topic_id: agents, probability: 0.4 },
    { post_id: 'liked', topic_id: evals, probability: 0.8 },
    { post_id: 'liked', topic_id: agents, probability: 0.4 },
  ]);
  assert.equal(jev.requests.length, 2);
  assert.deepEqual(ids(db, 'post_pending'), []);
  assert.deepEqual({ posts: result.posts, scored: result.scored, scores: result.scores }, { posts: 2, scored: 2, scores: 4 });
});

test('a failed request leaves that post unscored and the run goes on', async (t) => {
  const { db } = tempStore(t);
  const evals = seedTopic(db, 'Evals');
  for (const id of ['p1', 'p2', 'p3']) seedPost(db, id, { text: `text of ${id}` });
  const jev = fakeJev((_id, request) => {
    if (JSON.stringify(request.state).includes('text of p2')) throw new Error('Jev is overloaded');
    return 0.9;
  });

  const result = await tagPosts(db, { jev, concurrency: 1 });

  assert.deepEqual(scoreRows(db).map((row) => row.post_id), ['p1', 'p3']);
  assert.deepEqual(members(db, evals), ['p1', 'p3']);
  assert.deepEqual(ids(db, 'post_pending'), ['p2']);
  assert.deepEqual({ scored: result.scored, failed: result.failed }, { scored: 2, failed: 1 });
  assert.match(result.errors[0], /Jev is overloaded/);
});

test('an answer that is missing or not a probability fails the post instead of scoring it', async (t) => {
  const { db } = tempStore(t);
  const evals = seedTopic(db, 'Evals');
  const agents = seedTopic(db, 'Agents');
  seedPost(db, 'p1');
  const partial: JevClient = {
    async ask() {
      return { [topicQuestionId(evals)]: 0.9, [topicQuestionId(agents)]: Number.NaN };
    },
  };

  const result = await tagPosts(db, { jev: partial });

  assert.deepEqual(scoreRows(db), []);
  assert.equal(result.failed, 1);
});

test('scores are stored as each request returns, and the next run asks only for the rest', async (t) => {
  const { db, path } = tempStore(t);
  seedTopic(db, 'Evals');
  for (const id of ['p1', 'p2', 'p3', 'p4']) seedPost(db, id, { text: `text of ${id}` });
  const reader = openStore(path, { readOnly: true });
  t.after(() => reader.close());

  const storedWhenAsked: number[] = [];
  let calls = 0;
  const dropsAfterTwo = fakeJev(() => {
    storedWhenAsked.push(Number(reader.prepare(`SELECT count(*) AS n FROM scores`).get()?.n));
    calls += 1;
    if (calls > 2) throw new Error('connection lost');
    return 0.8;
  });
  await tagPosts(db, { jev: dropsAfterTwo, concurrency: 1 });
  assert.deepEqual(storedWhenAsked, [0, 1, 2, 2]);

  const second = fakeJev(() => 0.8);
  const result = await tagPosts(db, { jev: second });

  const asked = second.requests.map((request) => (request.state as { post: { text: string } }).post.text).sort();
  assert.deepEqual(asked, ['text of p3', 'text of p4']);
  assert.equal(result.posts, 2);
  assert.equal(scoreRows(db).length, 4);
});

test('adding a topic asks every post about the new definition only', async (t) => {
  const { db } = tempStore(t);
  const evals = seedTopic(db, 'Evals');
  for (const id of ['p1', 'p2']) seedPost(db, id);
  await tagPosts(db, { jev: fakeJev(() => 0.8) });

  const agents = seedTopic(db, 'Agents');
  const jev = fakeJev(() => 0.4);
  await tagPosts(db, { jev });

  assert.equal(jev.requests.length, 2);
  for (const request of jev.requests) {
    assert.deepEqual(Object.keys(request.questions), [topicQuestionId(agents)]);
  }
  assert.deepEqual(scoreRows(db), [
    { post_id: 'p1', topic_id: evals, probability: 0.8 },
    { post_id: 'p1', topic_id: agents, probability: 0.4 },
    { post_id: 'p2', topic_id: evals, probability: 0.8 },
    { post_id: 'p2', topic_id: agents, probability: 0.4 },
  ]);

  const idle = fakeJev();
  assert.equal((await tagPosts(db, { jev: idle })).posts, 0);
  assert.equal(idle.requests.length, 0);
});

test('a topic the user removed from a post stays off it through a full re-tag', async (t) => {
  const { db } = tempStore(t);
  const animations = seedTopic(db, 'Animations');
  seedPost(db, 'p1');
  seedPost(db, 'p2');
  await tagPosts(db, { jev: fakeJev(() => 0.9) });
  seedOverride(db, 'p1', animations, 'remove');

  db.exec('DELETE FROM scores');
  await tagPosts(db, { jev: fakeJev(() => 0.9) });

  assert.equal(scoreRows(db).length, 2);
  assert.deepEqual(members(db, animations), ['p2']);
});

test('a post scored before its link resolved is scored again with the page, once', async (t) => {
  const { db } = tempStore(t);
  const animations = seedTopic(db, 'Animations');
  seedPost(db, 'p1', { text: 'this is wild https://t.co/abc' });
  seedLink(db, 'p1', 'https://t.co/abc', { status: 'new' });
  seedPost(db, 'p2');
  const clock = (iso: string) => () => new Date(iso);

  await tagPosts(db, { jev: fakeJev(() => 0.2), now: clock('2026-03-01T00:00:00.000Z') });
  assert.deepEqual(members(db, animations), []);

  db.prepare(
    `UPDATE links SET status = 'resolved', host = 'github.com', title = 'acme/spring',
       description = 'React animation library', resolved_at = '2026-03-02T00:00:00.000Z'
     WHERE url = 'https://t.co/abc'`,
  ).run();
  const afterResolve = fakeJev(() => 0.9);
  await tagPosts(db, { jev: afterResolve, now: clock('2026-03-03T00:00:00.000Z') });

  assert.equal(afterResolve.requests.length, 1);
  assert.match(JSON.stringify(afterResolve.requests[0].state), /React animation library/);
  assert.deepEqual(members(db, animations), ['p1']);

  const third = fakeJev(() => 0.9);
  await tagPosts(db, { jev: third, now: clock('2026-03-04T00:00:00.000Z') });
  assert.equal(third.requests.length, 0);
});

test('a re-score that fails keeps the post in the topics it already had', async (t) => {
  const { db } = tempStore(t);
  const animations = seedTopic(db, 'Animations');
  seedPost(db, 'p1');
  seedScore(db, 'p1', animations, 0.9, '2026-03-01T00:00:00.000Z');
  seedLink(db, 'p1', 'https://t.co/abc', {
    status: 'resolved',
    title: 'acme/spring',
    resolvedAt: '2026-03-02T00:00:00.000Z',
  });
  const failing = fakeJev(() => {
    throw new Error('timeout');
  });

  const result = await tagPosts(db, { jev: failing });

  assert.equal(result.failed, 1);
  assert.deepEqual(members(db, animations), ['p1']);
  assert.deepEqual(ids(db, 'post_pending'), ['p1']);
});

test('a post with nothing to judge is not sent and matches no topic until a link resolves', async (t) => {
  const { db } = tempStore(t);
  const evals = seedTopic(db, 'Evals');
  seedPost(db, 'bare', { text: 'https://t.co/abc  https://t.co/def' });
  seedLink(db, 'bare', 'https://t.co/abc', { status: 'unresolved' });
  const jev = fakeJev(() => 0.9);

  const result = await tagPosts(db, { jev, now: () => new Date('2026-03-01T00:00:00.000Z') });

  assert.equal(jev.requests.length, 0);
  assert.equal(result.withoutContent, 1);
  assert.deepEqual(scoreRows(db), [{ post_id: 'bare', topic_id: evals, probability: 0 }]);
  assert.deepEqual(ids(db, 'post_unfiled'), ['bare']);
  assert.deepEqual(ids(db, 'post_pending'), []);

  db.prepare(
    `UPDATE links SET status = 'resolved', title = 'An evals guide', resolved_at = '2026-03-02T00:00:00.000Z'
     WHERE url = 'https://t.co/abc'`,
  ).run();
  await tagPosts(db, { jev, now: () => new Date('2026-03-03T00:00:00.000Z') });

  assert.equal(jev.requests.length, 1);
  assert.deepEqual(members(db, evals), ['bare']);
});

test('a run stores the configured thresholds where the membership view reads them', async (t) => {
  const { db } = tempStore(t);
  db.prepare(`UPDATE meta SET value = '0.99' WHERE key IN ('band_confident', 'band_unsure')`).run();

  await tagPosts(db, { jev: fakeJev() });

  const stored = Object.fromEntries(
    db
      .prepare(`SELECT key, value FROM meta WHERE key IN ('band_confident', 'band_unsure')`)
      .all()
      .map((row) => [row.key, Number(row.value)]),
  );
  assert.deepEqual(stored, { band_confident: BANDS.confident, band_unsure: BANDS.unsure });
});

test('chosen topics can be scored against chosen posts before the topics are active', async (t) => {
  const { db } = tempStore(t);
  const proposed = seedTopic(db, 'Proposed', { state: 'proposed' });
  seedTopic(db, 'Evals');
  for (const id of ['p1', 'p2', 'p3']) seedPost(db, id);
  const jev = fakeJev(() => 0.75);

  const result = await scorePairs(db, { jev }, [
    { postId: 'p1', topicId: proposed },
    { postId: 'p3', topicId: proposed },
  ]);

  assert.deepEqual(scoreRows(db), [
    { post_id: 'p1', topic_id: proposed, probability: 0.75 },
    { post_id: 'p3', topic_id: proposed, probability: 0.75 },
  ]);
  assert.equal(result.scored, 2);
});
