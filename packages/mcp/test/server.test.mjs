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
  assert.deepEqual(payload(await search({ terms: '', id: '101' })).posts.map(p => p.id), ['101']);
  assert.deepEqual(payload(await search({ terms: '', id: '104' })).posts, []);
  assert.ok((await search({ terms: 'animation', since: '2026-13-40' })).isError);
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

  const pastTheEnd = payload(await tool('topic_posts')({ name: 'Animation', offset: 1 }));
  assert.deepEqual([pastTheEnd.total, pastTheEnd.posts], [1, []]);

  const [first] = payload(await tool('topic_posts')({ name: 'Animation' })).posts;
  assert.deepEqual(first.links, [{ url: 'https://t.co/repo', title: 'A repo' }]);

  const found = ids(await tool('search_posts')({ terms: 'animation', limit: 50 }));
  assert.ok(found.includes('101'));
  assert.ok(!found.includes('104') && !found.includes('105'));
  const hits = payload(await tool('search_posts')({ terms: 'animation', limit: 50 })).posts;
  assert.deepEqual(hits.find(p => p.id === '101').topics, ['Animation']);
  assert.ok(hits.every(p => !p.topics.includes('Elections')));
  const hiddenHit = payload(await tool('search_posts')({ terms: 'animation', limit: 50, include_hidden: true })).posts.find(p => p.id === '104');
  assert.deepEqual(hiddenHit.topics, ['Elections']);
  const withHidden = ids(await tool('search_posts')({ terms: 'animation', limit: 50, include_hidden: true }));
  assert.ok(withHidden.includes('104') && !withHidden.includes('105'));
});

test('search_posts also matches what a post quotes and links to, and offset reads past the first page', async t => {
  const { db, path } = tempStore(t);
  seedPost(db, '101');
  seedPost(db, '102', { quoted: { full_text: 'A quokka field guide' } });
  seedPost(db, '201');
  seedPost(db, '202');
  seedLink(db, '101', 'https://t.co/kit', { status: 'resolved', host: 'example.com', title: 'Zebra toolkit', description: 'Draws okapi stripes' });
  seedLink(db, '201', 'https://t.co/pending', { status: 'not_resource', title: 'Zebra pending' });
  seedLink(db, '202', 'https://t.co/bare', { status: 'resolved', host: 'zebra.dev', title: 'Zebra.dev' });
  db.close();
  const search = (await connect(t, path))('search_posts');

  assert.deepEqual(ids(await search({ terms: 'zebra' })), ['101']);
  assert.deepEqual(ids(await search({ terms: 'okapi' })), ['101']);
  assert.deepEqual(ids(await search({ terms: 'quokka' })), ['102']);

  const all = payload(await search({ terms: 'animation', limit: 50 }));
  const pages = [];
  for (let offset = 0; offset < all.total; offset += 2) {
    const page = payload(await search({ terms: 'animation', limit: 2, offset }));
    assert.equal(page.total, all.total);
    pages.push(...page.posts.map(p => p.id));
  }
  assert.ok(all.total > 2);
  assert.deepEqual(pages, all.posts.map(p => p.id));
  assert.deepEqual(payload(await search({ terms: 'animation', offset: all.total })).posts, []);
  assert.ok((await search({ terms: 'animation', offset: -1 })).isError);
});

test('a topic reads newest first or from a date, and each resource says when it was last shared', async t => {
  const { db, path } = tempStore(t);
  const topic = seedTopic(db, 'Agents', { areaId: seedArea(db, 'AI') });
  const written = { 301: '2026-01-10', 302: '2026-06-10', 303: '2026-03-10' };
  for (const [index, id] of Object.keys(written).entries()) {
    seedPost(db, id);
    db.prepare(`UPDATE posts SET created_at = ? WHERE id = ?`).run(`${written[id]}T00:00:00.000Z`, id);
    seedScore(db, id, topic, 0.9 - index * 0.05);
  }
  const resourceId = Number(db.prepare(
    `INSERT INTO resources (canonical_key, kind, url, host, title, created_at) VALUES ('page:kit', 'page', 'https://kit.example', 'kit.example', 'Kit', '2026-01-01T00:00:00.000Z')`,
  ).run().lastInsertRowid);
  for (const id of ['301', '303']) {
    seedLink(db, id, `https://t.co/${id}`, { status: 'resolved' });
    db.prepare(`UPDATE links SET resource_id = ? WHERE url = ?`).run(resourceId, `https://t.co/${id}`);
  }
  db.close();
  const tool = await connect(t, path);

  assert.deepEqual(ids(await tool('topic_posts')({ name: 'Agents' })), ['301', '302', '303']);
  assert.deepEqual(ids(await tool('topic_posts')({ name: 'Agents', sort: 'newest' })), ['302', '303', '301']);
  const recent = payload(await tool('topic_posts')({ name: 'Agents', since: '2026-02-01' }));
  assert.deepEqual([recent.total, recent.posts.map(p => p.id)], [2, ['302', '303']]);
  assert.ok((await tool('topic_posts')({ name: 'Agents', since: 'last month' })).isError);

  const [kit] = payload(await tool('topic_resources')({ name: 'Agents' })).resources;
  assert.deepEqual([kit.posts, kit.last_shared], [2, '2026-03-10T00:00:00.000Z']);
  const [recentKit] = payload(await tool('topic_resources')({ name: 'Agents', since: '2026-02-01' })).resources;
  assert.equal(recentKit.posts, 1);
  assert.deepEqual(payload(await tool('topic_resources')({ name: 'Agents', since: '2026-04-01' })).resources, []);
});

test('without a store every tool refuses, keyword search included', async t => {
  const tool = await connect(t, join(CORPUS, 'no-store.sqlite'));
  for (const [name, args] of [['list_categories', {}], ['topic_posts', { name: 'Animation' }], ['search_posts', { terms: 'animation' }]]) {
    const result = await tool(name)(args);
    assert.ok(result.isError, name);
    assert.match(result.content[0].text, /has not built its store/);
  }
});
