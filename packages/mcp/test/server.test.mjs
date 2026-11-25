import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

import { seedArea, seedLink, seedPost, seedScore, seedTopic, tempStore } from '../../engine/test/fixtures/corpus.ts';
import { magpieMcpHandler } from '../server.mjs';

const CORPUS = fileURLToPath(new URL('../../skill/test/fixtures/corpus', import.meta.url));
const THREE_DAYS_AGO = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

function seedStore(t) {
  const { db, path } = tempStore(t);
  for (const id of ['101', '104', '105']) seedPost(db, id, { bookmarked: true });
  const animation = seedTopic(db, 'Animation', { areaId: seedArea(db, 'UI') });
  const elections = seedTopic(db, 'Elections', { areaId: seedArea(db, 'Politics', { hidden: true }) });
  seedScore(db, '101', animation, 0.9);
  seedScore(db, '105', animation, 0.8);
  seedScore(db, '104', elections, 0.9);
  seedLink(db, '101', 'https://t.co/repo', { status: 'resolved', title: 'A repo' });
  seedLink(db, '101', 'https://t.co/video', { status: 'not_resource' });
  db.prepare(`UPDATE posts SET removed_at = '2026-02-01T00:00:00.000Z' WHERE id = '105'`).run();
  const runId = Number(db.prepare(`INSERT INTO runs (started_at, status) VALUES (?, 'complete')`).run(THREE_DAYS_AGO).lastInsertRowid);
  db.prepare(`INSERT INTO run_stages (run_id, stage, outcome, finished_at) VALUES (?, 'x_bookmarks', 'ok', ?)`).run(runId, THREE_DAYS_AGO);
  db.close();
  return path;
}

async function connect(t, store) {
  const handler = magpieMcpHandler(() => ({ store, dir: CORPUS }));
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1/mcp'), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  }));
  t.after(async () => {
    await client.close();
    await handler.close();
  });
  return name => async args => client.callTool({ name, arguments: args });
}

const payload = result => {
  assert.ok(!result.isError, result.content[0]?.text);
  return JSON.parse(result.content.at(-1).text);
};
const ids = result => payload(result).posts.map(p => p.id);

test('search_posts takes an author with or without @ and filters by date', async t => {
  const search = (await connect(t, seedStore(t)))('search_posts');
  const withAt = payload(await search({ terms: 'animation', author: '@Alpha_Dev' })).posts;
  const without = payload(await search({ terms: 'animation', author: 'alpha_dev' })).posts;
  assert.ok(withAt.length > 0);
  assert.deepEqual(withAt.map(p => p.id), without.map(p => p.id));
  assert.ok(withAt.every(p => p.handle.toLowerCase() === 'alpha_dev'));

  const recent = payload(await search({ terms: 'animation', since: '2026-03-15' })).posts;
  assert.ok(recent.every(p => Date.parse(p.created) >= Date.parse('2026-03-15')));

  assert.ok((await search({ terms: 'animation', since: 'yesterday' })).isError);
});

test('with a store, results lead with the corpus age and leave out hidden and removed posts', async t => {
  const tool = await connect(t, seedStore(t));

  const categories = await tool('list_categories')({});
  assert.match(categories.content[0].text, /^Note: this corpus last synced from X 3 days ago/);
  assert.match(categories.content[0].text, /host machine/);
  assert.deepEqual(payload(categories).map(group => group.area), ['UI']);

  const unknown = await tool('topic_posts')({ name: 'Animatoin' });
  assert.ok(unknown.isError);
  assert.match(unknown.content[0].text, /Closest: Animation\. Call list_categories/);

  const hidden = await tool('topic_posts')({ name: 'Elections' });
  assert.match(hidden.content.at(-1).text, /hidden by default/);
  assert.deepEqual(ids(await tool('topic_posts')({ name: 'Elections', include_hidden: true })), ['104']);
  assert.deepEqual(ids(await tool('topic_posts')({ name: 'Animation', include_hidden: true })), ['101']);

  const [first] = payload(await tool('topic_posts')({ name: 'Animation' })).posts;
  assert.deepEqual(first.links, [{ url: 'https://t.co/repo', title: 'A repo' }]);

  const found = ids(await tool('search_posts')({ terms: 'animation', limit: 50 }));
  assert.ok(found.includes('101'));
  assert.ok(!found.includes('104') && !found.includes('105'));
  const withHidden = ids(await tool('search_posts')({ terms: 'animation', limit: 50, include_hidden: true }));
  assert.ok(withHidden.includes('104') && !withHidden.includes('105'));
});

test('without a store every tool refuses, keyword search included', async t => {
  const tool = await connect(t, join(CORPUS, 'no-store.sqlite'));
  for (const [name, args] of [['list_categories', {}], ['topic_posts', { name: 'Animation' }], ['search_posts', { terms: 'animation' }]]) {
    const result = await tool(name)(args);
    assert.ok(result.isError, name);
    assert.match(result.content[0].text, /has not built its store/);
  }
});
