import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';

import { ingest } from '../src/ingest.ts';
import { openStore } from '../src/store/db.ts';
import { exportPost, tempDir, writeExports } from './fixtures/export.ts';

function setup(t: TestContext): { db: DatabaseSync; dir: string } {
  const { dir, cleanup } = tempDir();
  const db = openStore(join(dir, 'corpus.sqlite'));
  t.after(() => {
    db.close();
    cleanup();
  });
  return { db, dir };
}

function flags(db: DatabaseSync): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of db.prepare('SELECT id, bookmarked, liked FROM posts ORDER BY id').all()) {
    out[String(row.id)] = `${row.bookmarked ? 'B' : '-'}${row.liked ? 'L' : '-'}`;
  }
  return out;
}

function dump(db: DatabaseSync): unknown {
  return ['posts', 'links', 'post_links'].map((table) =>
    db.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all(),
  );
}

function totalChanges(db: DatabaseSync): unknown {
  return db.prepare('SELECT total_changes() AS n').get()?.n;
}

const posts = (ids: string[]) => ids.map((id) => exportPost(id));

test('a post in both exports becomes one row with both flags set', (t) => {
  const { db, dir } = setup(t);
  const paths = writeExports(dir, { bookmarks: posts(['1', '2']), likes: posts(['2', '3']) });

  const result = ingest(db, paths);

  assert.deepEqual(flags(db), { '1': 'B-', '2': 'BL', '3': '-L' });
  assert.equal(result.posts.total, 3);
  assert.equal(result.posts.visible, 3);
  assert.equal(result.posts.inserted, 3);
});

test('a post is stored with its author, text, quoted post, media and counts', (t) => {
  const { db, dir } = setup(t);
  const quoted = exportPost('900', { text: 'the quoted text', handle: 'quotee' });
  const post = exportPost('1', {
    text: 'look at this',
    handle: 'alice',
    createdAt: '2026-03-04T05:06:07.000Z',
    likeCount: 42,
    media: [{ url: 'https://img.example/a.png', type: 'image' }],
    quoted,
  });
  ingest(db, writeExports(dir, { bookmarks: [post], likes: [] }));

  const row = db.prepare(`SELECT * FROM posts WHERE id = '1'`).get();
  assert.ok(row);
  assert.equal(row.text, 'look at this');
  assert.equal(row.author_handle, 'alice');
  assert.equal(row.author_name, 'Name of alice');
  assert.equal(row.author_avatar_url, 'https://img.example/alice.jpg');
  assert.equal(row.created_at, '2026-03-04T05:06:07.000Z');
  assert.equal(row.url, 'https://x.com/alice/status/1');
  assert.equal(row.like_count, 42);
  assert.deepEqual(JSON.parse(String(row.media_json)), [{ url: 'https://img.example/a.png', type: 'image' }]);
  const storedQuote = JSON.parse(String(row.quoted_json));
  assert.equal(storedQuote.text, 'the quoted text');
  assert.equal(storedQuote.author.handle, 'quotee');
});

test('each link in a post becomes a link row shared by the posts that carry it', (t) => {
  const { db, dir } = setup(t);
  const shared = { url: 'https://t.co/shared', expandedUrl: 'https://example.com/lib' };
  const paths = writeExports(dir, {
    bookmarks: [
      exportPost('1', { urls: [shared, { url: 'https://t.co/other' }] }),
      exportPost('2', { urls: [shared] }),
      exportPost('3'),
    ],
    likes: [],
  });

  const result = ingest(db, paths);

  assert.deepEqual(
    db.prepare('SELECT url, expanded_url, status, attempts FROM links ORDER BY url').all().map((r) => ({ ...r })),
    [
      { url: 'https://t.co/other', expanded_url: 'https://t.co/other', status: 'new', attempts: 0 },
      { url: 'https://t.co/shared', expanded_url: 'https://example.com/lib', status: 'new', attempts: 0 },
    ],
  );
  assert.deepEqual(
    db.prepare('SELECT post_id, link_url, position FROM post_links ORDER BY post_id, position').all().map((r) => ({ ...r })),
    [
      { post_id: '1', link_url: 'https://t.co/shared', position: 0 },
      { post_id: '1', link_url: 'https://t.co/other', position: 1 },
      { post_id: '2', link_url: 'https://t.co/shared', position: 0 },
    ],
  );
  assert.equal(result.links.added, 2);
});

test('a post absent from both exports keeps its row with both flags cleared', (t) => {
  const { db, dir } = setup(t);
  const ids = Array.from({ length: 30 }, (_, i) => String(i + 1));
  ingest(db, writeExports(dir, { bookmarks: posts(ids), likes: posts(ids) }));

  const remaining = ids.slice(1);
  const result = ingest(db, writeExports(dir, { bookmarks: posts(remaining), likes: posts(remaining) }));

  assert.equal(flags(db)['1'], '--');
  assert.equal(flags(db)['2'], 'BL');
  assert.equal(result.posts.total, 30);
  assert.equal(result.posts.visible, 29);
  assert.equal(result.bookmarks.cleared, 1);
  assert.equal(result.likes.cleared, 1);
});

test('a post that leaves bookmarks but stays liked remains visible as a like only', (t) => {
  const { db, dir } = setup(t);
  const ids = Array.from({ length: 30 }, (_, i) => String(i + 1));
  ingest(db, writeExports(dir, { bookmarks: posts(ids), likes: posts(ids) }));

  const result = ingest(db, writeExports(dir, { bookmarks: posts(ids.slice(1)), likes: posts(ids) }));

  assert.equal(flags(db)['1'], '-L');
  assert.equal(result.posts.visible, 30);
});

test('a likes export 10% smaller than the stored likes clears no flags and reports the skip', (t) => {
  const { db, dir } = setup(t);
  const ids = Array.from({ length: 20 }, (_, i) => String(i + 1));
  ingest(db, writeExports(dir, { bookmarks: posts(['1']), likes: posts(ids) }));

  const result = ingest(db, writeExports(dir, { bookmarks: posts(['1']), likes: posts(ids.slice(2)) }));

  assert.equal(flags(db)['1'], 'BL');
  assert.equal(flags(db)['2'], '-L');
  assert.equal(result.likes.skippedShrink, true);
  assert.equal(result.likes.cleared, 0);
  assert.equal(result.bookmarks.skippedShrink, false);
  assert.equal(result.posts.visible, 20);
});

test('a shrunken export still adds the new posts it carries', (t) => {
  const { db, dir } = setup(t);
  const ids = Array.from({ length: 20 }, (_, i) => String(i + 1));
  ingest(db, writeExports(dir, { bookmarks: [], likes: posts(ids) }));

  ingest(db, writeExports(dir, { bookmarks: [], likes: posts(['1', '99']) }));

  assert.equal(flags(db)['99'], '-L');
  assert.equal(flags(db)['2'], '-L');
});

test('re-running ingest on the same files changes no rows', (t) => {
  const { db, dir } = setup(t);
  const paths = writeExports(dir, {
    bookmarks: [exportPost('1', { urls: [{ url: 'https://t.co/a' }] }), exportPost('2')],
    likes: [exportPost('2'), exportPost('3', { quoted: exportPost('900') })],
  });
  ingest(db, paths);
  const before = dump(db);
  const changesBefore = totalChanges(db);

  const result = ingest(db, paths);

  assert.equal(totalChanges(db), changesBefore);
  assert.deepEqual(dump(db), before);
  assert.equal(result.posts.inserted, 0);
  assert.equal(result.posts.updated, 0);
  assert.equal(result.links.added, 0);
});

test('a changed post is updated in place and keeps the time it was first seen', (t) => {
  const { db, dir } = setup(t);
  ingest(db, writeExports(dir, { bookmarks: [exportPost('1', { likeCount: 1 })], likes: [] }));
  db.prepare(`UPDATE posts SET first_seen_at = '2020-01-01T00:00:00.000Z'`).run();

  const result = ingest(db, writeExports(dir, { bookmarks: [exportPost('1', { likeCount: 7 })], likes: [] }));

  const row = db.prepare(`SELECT like_count, first_seen_at FROM posts WHERE id = '1'`).get();
  assert.equal(row?.like_count, 7);
  assert.equal(row?.first_seen_at, '2020-01-01T00:00:00.000Z');
  assert.equal(result.posts.updated, 1);
});

test('re-ingesting a post leaves the resolution state of its links alone', (t) => {
  const { db, dir } = setup(t);
  const paths = writeExports(dir, {
    bookmarks: [exportPost('1', { urls: [{ url: 'https://t.co/a' }] })],
    likes: [],
  });
  ingest(db, paths);
  db.prepare(`UPDATE links SET status = 'resolved', final_url = 'https://example.com/', attempts = 1`).run();

  ingest(db, paths);

  const link = db.prepare('SELECT status, final_url, attempts FROM links').get();
  assert.deepEqual({ ...link }, { status: 'resolved', final_url: 'https://example.com/', attempts: 1 });
});

test('an export wrapped in an envelope object is read like a bare array', (t) => {
  const { db, dir } = setup(t);
  const paths = writeExports(dir, {
    bookmarks: { meta: { count: 2 }, data: { items: posts(['1', '2']) } },
    likes: posts(['2']),
  });

  ingest(db, paths);

  assert.deepEqual(flags(db), { '1': 'B-', '2': 'BL' });
});

test('a malformed export file leaves the store unchanged and reports the error', (t) => {
  const { db, dir } = setup(t);
  const good = writeExports(dir, { bookmarks: posts(['1', '2']), likes: posts(['2']) });
  ingest(db, good);
  const before = dump(db);

  writeFileSync(good.likesPath, '[{"id": "5", "text": "trunc');
  writeFileSync(good.bookmarksPath, JSON.stringify(posts(['1', '2', '3'])));
  assert.throws(() => ingest(db, good), /likes\.json/);
  assert.deepEqual(dump(db), before);

  writeFileSync(good.likesPath, JSON.stringify({ error: 'rate limited' }));
  assert.throws(() => ingest(db, good), /likes\.json/);
  assert.deepEqual(dump(db), before);

  assert.throws(() => ingest(db, { ...good, likesPath: join(dir, 'absent.json') }), /absent\.json/);
  assert.deepEqual(dump(db), before);
});
