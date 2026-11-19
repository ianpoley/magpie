import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
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
