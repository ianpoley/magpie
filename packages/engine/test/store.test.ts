import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';

import { openStore, transaction } from '../src/store/db.ts';
import { SCHEMA_VERSION } from '../src/store/schema.ts';
import { tempDir } from './fixtures/export.ts';

function storePath(t: TestContext): string {
  const { dir, cleanup } = tempDir();
  t.after(cleanup);
  return join(dir, 'nested', 'corpus.sqlite');
}

function schemaOf(db: DatabaseSync): unknown[] {
  return db
    .prepare(
      `SELECT type, name, tbl_name, sql FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`,
    )
    .all();
}

test('a fresh store records its schema version and holds every table', (t) => {
  const db = openStore(storePath(t));
  t.after(() => db.close());

  const version = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get();
  assert.equal(Number(version?.value), SCHEMA_VERSION);

  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .all()
    .map((row) => row.name);
  for (const table of [
    'meta',
    'posts',
    'links',
    'post_links',
    'resources',
    'resource_aliases',
    'areas',
    'topics',
    'scores',
    'overrides',
    'changes',
    'change_topics',
    'proposal_attempts',
    'proposal_seen_posts',
    'suppressed_proposals',
    'runs',
    'run_stages',
  ]) {
    assert.ok(tables.includes(table), `missing table ${table}`);
  }
});

test('a store is opened in WAL mode with foreign keys enforced', (t) => {
  const db = openStore(storePath(t));
  t.after(() => db.close());

  assert.equal(db.prepare('PRAGMA journal_mode').get()?.journal_mode, 'wal');
  assert.throws(() =>
    db
      .prepare(`INSERT INTO scores (post_id, topic_id, probability, scored_at) VALUES ('nope', 999, 0.5, 'now')`)
      .run(),
  );
});

test('opening a store written by newer code fails with a clear error', (t) => {
  const path = storePath(t);
  const db = openStore(path);
  db.prepare(`UPDATE meta SET value = ? WHERE key = 'schema_version'`).run(String(SCHEMA_VERSION + 1));
  db.close();

  const expected = new RegExp(`schema version ${SCHEMA_VERSION + 1}.*newer`, 'i');
  assert.throws(() => openStore(path), expected);
  assert.throws(() => openStore(path, { readOnly: true }), expected);
});

test('a fresh store and a migrated older store end with the same schema', (t) => {
  const fresh = openStore(storePath(t));
  t.after(() => fresh.close());

  const olderPath = storePath(t);
  openStore(olderPath).close();
  const raw = new DatabaseSync(olderPath);
  raw.exec('PRAGMA foreign_keys = OFF');
  for (const { name } of raw
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT IN ('meta') AND name NOT LIKE 'sqlite_%'`)
    .all()) {
    raw.exec(`DROP TABLE "${name}"`);
  }
  raw.exec(`UPDATE meta SET value = '0' WHERE key = 'schema_version'`);
  raw.close();

  const migrated = openStore(olderPath);
  t.after(() => migrated.close());
  assert.deepEqual(schemaOf(migrated), schemaOf(fresh));
  assert.equal(
    Number(migrated.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get()?.value),
    SCHEMA_VERSION,
  );
});

test('reopening a store keeps its rows', (t) => {
  const path = storePath(t);
  const first = openStore(path);
  first.prepare(`INSERT INTO areas (name, created_at) VALUES ('Tools', '2026-01-01')`).run();
  first.close();

  const second = openStore(path);
  t.after(() => second.close());
  assert.equal(second.prepare('SELECT count(*) AS n FROM areas').get()?.n, 1);
});

test('a read-only store can be read and refuses writes', (t) => {
  const path = storePath(t);
  const writer = openStore(path);
  t.after(() => writer.close());
  writer.prepare(`INSERT INTO areas (name, created_at) VALUES ('Tools', '2026-01-01')`).run();

  const reader = openStore(path, { readOnly: true });
  t.after(() => reader.close());
  assert.equal(reader.prepare('SELECT name FROM areas').get()?.name, 'Tools');
  assert.throws(() => reader.prepare(`INSERT INTO areas (name, created_at) VALUES ('X', 'now')`).run());
});

test('opening a missing store read-only fails instead of creating it', (t) => {
  assert.throws(() => openStore(storePath(t), { readOnly: true }));
});

test('a transaction commits on return and rolls back on throw', (t) => {
  const db = openStore(storePath(t));
  t.after(() => db.close());
  const insert = db.prepare(`INSERT INTO areas (name, created_at) VALUES (?, '2026-01-01')`);
  const count = () => db.prepare('SELECT count(*) AS n FROM areas').get()?.n;

  const returned = transaction(db, () => {
    insert.run('kept');
    return 'done';
  });
  assert.equal(returned, 'done');
  assert.equal(count(), 1);

  assert.throws(
    () =>
      transaction(db, () => {
        insert.run('lost');
        throw new Error('boom');
      }),
    /boom/,
  );
  assert.equal(count(), 1);
});

test('a transaction started inside another joins it', (t) => {
  const db = openStore(storePath(t));
  t.after(() => db.close());
  const insert = db.prepare(`INSERT INTO areas (name, created_at) VALUES (?, '2026-01-01')`);

  assert.throws(() =>
    transaction(db, () => {
      transaction(db, () => insert.run('inner'));
      throw new Error('outer fails');
    }),
  );
  assert.equal(db.prepare('SELECT count(*) AS n FROM areas').get()?.n, 0);
});

test('a store at schema version 2 migrates, keeps its data, and can mark a post removed', (t) => {
  const path = storePath(t);
  mkdirSync(dirname(path), { recursive: true });
  const old = new DatabaseSync(path);
  old.exec(readFileSync(join(import.meta.dirname, 'fixtures', 'store-v2.sql'), 'utf8'));
  old.exec(`
    INSERT INTO posts (id, text, url, author_handle, author_name, bookmarked, liked, first_seen_at)
    VALUES ('1', 'kept text', 'https://x.com/a/status/1', 'a', 'A', 1, 0, '2026-01-01'),
           ('2', 'other text', 'https://x.com/a/status/2', 'a', 'A', 0, 1, '2026-01-01');
    INSERT INTO areas (name, created_at) VALUES ('AI', '2026-01-01');
    INSERT INTO topics (area_id, name, definition, created_at) VALUES (1, 'Evals', 'Posts about evals.', '2026-01-01');
    INSERT INTO scores (post_id, topic_id, probability, scored_at) VALUES ('1', 1, 0.9, '2026-01-01');
    INSERT INTO overrides (post_id, topic_id, action, created_at) VALUES ('2', 1, 'add', '2026-01-01');
  `);
  old.close();

  const db = openStore(path);
  t.after(() => db.close());
  const members = () => db.prepare(`SELECT post_id FROM topic_membership ORDER BY post_id`).all().map((row) => row.post_id);

  assert.equal(Number(db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get()?.value), SCHEMA_VERSION);
  assert.deepEqual(
    db.prepare(`SELECT id, text, bookmarked, liked, removed_at FROM posts ORDER BY id`).all().map((row) => ({ ...row })),
    [
      { id: '1', text: 'kept text', bookmarked: 1, liked: 0, removed_at: null },
      { id: '2', text: 'other text', bookmarked: 0, liked: 1, removed_at: null },
    ],
  );
  assert.equal(db.prepare(`SELECT probability FROM scores WHERE post_id = '1'`).get()?.probability, 0.9);
  assert.equal(db.prepare(`SELECT action FROM overrides WHERE post_id = '2'`).get()?.action, 'add');
  assert.deepEqual(members(), ['1', '2']);

  db.prepare(`UPDATE posts SET removed_at = '2026-02-01' WHERE id = '1'`).run();
  assert.deepEqual(members(), ['2']);
});

test('a store borrowed from the main checkout is never migrated from a worktree, and is left as it was', (t) => {
  const path = storePath(t);
  mkdirSync(dirname(path), { recursive: true });
  const old = new DatabaseSync(path);
  old.exec(readFileSync(join(import.meta.dirname, 'fixtures', 'store-v2.sql'), 'utf8'));
  old.close();

  assert.throws(() => openStore(path, { inheritedFrom: '/home/someone/magpie' }), (error: Error) => {
    assert.match(error.message, /main checkout \/home\/someone\/magpie/);
    assert.match(error.message, /MAGPIE_ROOT/);
    return true;
  });
  const check = new DatabaseSync(path, { readOnly: true });
  assert.equal(Number(check.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get()?.value), 2);
  check.close();
});

test('a borrowed store already at the current schema opens read-write as usual', (t) => {
  const path = storePath(t);
  openStore(path).close();
  const db = openStore(path, { inheritedFrom: '/home/someone/magpie' });
  t.after(() => db.close());
  assert.equal(Number(db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get()?.value), SCHEMA_VERSION);
});
