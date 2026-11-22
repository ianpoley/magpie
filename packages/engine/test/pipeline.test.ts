import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';

import { runPipeline, startRun } from '../src/pipeline.ts';
import type { ExportFiles, PipelineDeps, PipelineOptions } from '../src/pipeline.ts';
import { openStore } from '../src/store/db.ts';
import type { Store } from '../src/store/db.ts';
import { fakeJev, seedArea, seedTopic } from './fixtures/corpus.ts';
import { exportPost, tempDir, writeExports } from './fixtures/export.ts';
import type { ExportPost } from './fixtures/export.ts';
import { fakes } from './fixtures/pipeline.ts';

type Files = ExportFiles & { store: string };

function setup(t: TestContext): { files: Files; write: (bookmarks: ExportPost[], likes?: ExportPost[]) => void } {
  const { dir, cleanup } = tempDir();
  t.after(cleanup);
  const dataDir = join(dir, 'data');
  mkdirSync(dataDir);
  const files: Files = {
    store: join(dir, 'state', 'corpus.sqlite'),
    bookmarksExport: join(dataDir, 'bookmarks.json'),
    likesExport: join(dataDir, 'likes.json'),
  };
  return { files, write: (bookmarks, likes = []) => void writeExports(dataDir, { bookmarks, likes }) };
}

async function run(files: Files, deps: PipelineDeps, options?: PipelineOptions) {
  const db = openStore(files.store);
  try {
    return await runPipeline(startRun(db), { result: 'unknown', detail: null }, files, deps, options);
  } finally {
    db.close();
  }
}

function read<T>(files: Files, fn: (db: Store) => T): T {
  const db = openStore(files.store, { readOnly: true });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

const count = (db: Store, sql: string, ...args: (string | number)[]): number =>
  Number(db.prepare(sql).get(...args)?.n);

const stages = (db: Store, runId: number): Record<string, string> =>
  Object.fromEntries(
    db
      .prepare(`SELECT stage, outcome FROM run_stages WHERE run_id = ? ORDER BY id`)
      .all(runId)
      .map((row) => [String(row.stage), String(row.outcome)]),
  );

const linked = (id: string): ExportPost =>
  exportPost(id, {
    urls: [{ url: `https://t.co/short${id}`, expandedUrl: `https://docs-${id}.dev/guide` }],
  });

test('a first run ingests, resolves links, builds categories, scores every post and records the run', async (t) => {
  const { files, write } = setup(t);
  write([linked('1'), linked('2')], [exportPost('3')]);
  const deps = fakes();

  const result = await run(files, deps);

  assert.deepEqual(
    result.stages.map((stage) => [stage.stage, stage.outcome]),
    [
      ['ingest', 'ok'],
      ['links', 'ok'],
      ['tag', 'ok'],
      ['discovery', 'ok'],
      ['retag', 'ok'],
    ],
  );
  read(files, (db) => {
    assert.equal(count(db, `SELECT count(*) AS n FROM posts`), 3);
    assert.equal(count(db, `SELECT count(*) AS n FROM links WHERE status = 'resolved'`), 2);
    assert.equal(count(db, `SELECT count(*) AS n FROM links WHERE status <> 'resolved'`), 0);
    assert.equal(count(db, `SELECT count(*) AS n FROM topics WHERE state = 'active'`), 2);
    assert.equal(count(db, `SELECT count(*) AS n FROM scores`), 6);
    const runs = db.prepare(`SELECT id, status, finished_at, message FROM runs`).all();
    assert.equal(runs.length, 1);
    assert.equal(runs[0].status, 'complete');
    assert.notEqual(runs[0].finished_at, null);
    assert.equal(runs[0].message, null);
    assert.deepEqual(stages(db, result.runId), {
      ingest: 'ok',
      links: 'ok',
      tag: 'ok',
      discovery: 'ok',
      retag: 'ok',
    });
    const ingestCounts = JSON.parse(
      String(db.prepare(`SELECT counts_json FROM run_stages WHERE stage = 'ingest'`).get()?.counts_json),
    );
    assert.equal(ingestCounts.posts.inserted, 3);
  });
});

test('a post new in the export is ingested and scored in the same run', async (t) => {
  const { files, write } = setup(t);
  write([linked('1'), exportPost('2')]);
  const deps = fakes();
  await run(files, deps);

  write([linked('1'), exportPost('2'), exportPost('9', { text: 'a brand new save' })]);
  await run(files, deps);

  read(files, (db) => {
    assert.equal(count(db, `SELECT count(*) AS n FROM posts WHERE id = '9'`), 1);
    assert.equal(count(db, `SELECT count(*) AS n FROM scores WHERE post_id = '9'`), 2);
    assert.equal(count(db, `SELECT count(*) AS n FROM runs WHERE status = 'complete'`), 2);
  });
});

test('a run with nothing new calls neither Jev, Claude, nor the web', async (t) => {
  const { files, write } = setup(t);
  write([linked('1'), linked('2')], [exportPost('3')]);
  const deps = fakes();
  await run(files, deps);
  const before = [deps.httpCalls.length, deps.jev.requests.length, deps.claudeCalls.length];
  assert.ok(before.every((calls) => calls > 0));

  const second = await run(files, deps);

  assert.deepEqual([deps.httpCalls.length, deps.jev.requests.length, deps.claudeCalls.length], before);
  assert.ok(second.stages.every((stage) => stage.outcome === 'ok'));
});

test('a link stage that throws is recorded as failed and tagging still runs', async (t) => {
  const { files, write } = setup(t);
  write([linked('1'), exportPost('2')]);
  const db = openStore(files.store);
  seedTopic(db, 'Animations', { areaId: seedArea(db, 'Frontend') });
  db.exec(
    `CREATE TRIGGER links_frozen BEFORE UPDATE ON links
     BEGIN SELECT RAISE(ABORT, 'links cannot be written'); END`,
  );
  db.close();

  const result = await run(files, fakes());

  read(files, (store) => {
    const links = store.prepare(`SELECT outcome, message FROM run_stages WHERE stage = 'links'`).get();
    assert.equal(links?.outcome, 'failed');
    assert.match(String(links?.message), /links cannot be written/);
    assert.equal(stages(store, result.runId).tag, 'ok');
    assert.equal(count(store, `SELECT count(*) AS n FROM scores`), 2);
    const runRow = store.prepare(`SELECT status, message FROM runs WHERE id = ?`).get(result.runId);
    assert.equal(runRow?.status, 'complete');
    assert.match(String(runRow?.message), /links/);
  });
});

test('when Claude cannot be reached the category stage warns and the run still completes', async (t) => {
  const { files, write } = setup(t);
  write([exportPost('1'), exportPost('2')]);
  const deps = fakes({ claude: 'down' });

  const result = await run(files, deps);

  read(files, (db) => {
    const discovery = db.prepare(`SELECT outcome, message FROM run_stages WHERE stage = 'discovery'`).get();
    assert.equal(discovery?.outcome, 'warning');
    assert.match(String(discovery?.message), /not installed/);
    assert.equal(stages(db, result.runId).tag, 'ok');
    assert.equal(db.prepare(`SELECT status FROM runs WHERE id = ?`).get(result.runId)?.status, 'complete');
  });
});

test('when no post could be scored the tag stage fails and categories are left alone for that run', async (t) => {
  const { files, write } = setup(t);
  write([exportPost('1'), exportPost('2')]);
  const db = openStore(files.store);
  seedTopic(db, 'Animations', { areaId: seedArea(db, 'Frontend') });
  db.close();
  const deps = fakes({
    jev: fakeJev(() => {
      throw new Error('TYPESAFE_API_KEY is not set');
    }),
  });

  const result = await run(files, deps);

  read(files, (store) => {
    const tag = store.prepare(`SELECT outcome, message FROM run_stages WHERE stage = 'tag'`).get();
    assert.equal(tag?.outcome, 'failed');
    assert.match(String(tag?.message), /TYPESAFE_API_KEY is not set/);
    assert.equal(stages(store, result.runId).evolve, 'skipped');
    assert.equal(
      store.prepare(`SELECT message FROM run_stages WHERE stage = 'evolve'`).get()?.message,
      'No post could be scored, so the category list was left alone.',
    );
    assert.equal(store.prepare(`SELECT message FROM runs WHERE id = ?`).get(result.runId)?.message, 'failed: tag');
  });
  assert.equal(deps.claudeCalls.length, 0);
});

test('a post cap bounds how many posts are scored in the whole run', async (t) => {
  const { files, write } = setup(t);
  write(['1', '2', '3', '4', '5'].map((id) => exportPost(id)));
  const db = openStore(files.store);
  seedTopic(db, 'css tricks', { kind: 'pinned' });
  db.close();
  const deps = fakes();

  const result = await run(files, deps, { limitPosts: 2 });

  assert.ok(result.stages.some((stage) => stage.stage === 'retag'));
  read(files, (store) => {
    assert.equal(count(store, `SELECT count(*) AS n FROM topics WHERE kind = 'auto'`), 2);
    assert.equal(count(store, `SELECT count(*) AS n FROM scores`), 2);
  });
  assert.equal(deps.jev.requests.length, 2);
});

test('skipping links and categories leaves both untouched and still ingests', async (t) => {
  const { files, write } = setup(t);
  write([linked('1'), exportPost('2')]);
  const deps = fakes();

  const result = await run(files, deps, { skipLinks: true, skipEvolve: true });

  assert.deepEqual([deps.httpCalls.length, deps.claudeCalls.length], [0, 0]);
  read(files, (db) => {
    assert.equal(count(db, `SELECT count(*) AS n FROM posts`), 2);
    assert.equal(count(db, `SELECT count(*) AS n FROM links WHERE status = 'new'`), 1);
    assert.equal(count(db, `SELECT count(*) AS n FROM topics`), 0);
    const recorded = stages(db, result.runId);
    assert.equal(recorded.links, 'skipped');
    assert.equal(recorded.evolve, 'skipped');
  });
});

test('a run row left running by a killed run is closed by the next run', async (t) => {
  const { files, write } = setup(t);
  write([exportPost('1')]);
  const db = openStore(files.store);
  db.prepare(`INSERT INTO runs (started_at, status) VALUES ('2026-01-01T00:00:00.000Z', 'running')`).run();
  db.close();

  const result = await run(files, fakes());

  read(files, (store) => {
    assert.equal(count(store, `SELECT count(*) AS n FROM runs WHERE status = 'running'`), 0);
    assert.equal(
      store.prepare(`SELECT status FROM runs WHERE id <> ?`).get(result.runId)?.status,
      'failed',
    );
  });
});

test('the categorize stages keep their order, messages and run summary', async (t) => {
  const { files, write } = setup(t);
  write([linked('1'), exportPost('2')]);
  const db = openStore(files.store);
  db.prepare(`INSERT INTO runs (started_at, status) VALUES ('2026-01-01T00:00:00.000Z', 'running')`).run();
  db.exec(
    `CREATE TRIGGER links_frozen BEFORE UPDATE ON links
     BEGIN SELECT RAISE(ABORT, 'links cannot be written'); END`,
  );
  db.close();

  const result = await run(files, fakes({ claude: 'down' }));

  assert.deepEqual(
    result.stages.map((stage) => [stage.stage, stage.outcome]),
    [
      ['ingest', 'ok'],
      ['links', 'failed'],
      ['tag', 'ok'],
      ['discovery', 'warning'],
    ],
  );
  assert.equal(
    result.stages.find((stage) => stage.stage === 'discovery')?.message,
    'Claude gave no category list (missing): The CLI is not installed.',
  );
  read(files, (store) => {
    const rows = store.prepare(`SELECT id, status, message FROM runs ORDER BY id`).all();
    assert.deepEqual(
      rows.map((row) => [row.status, row.message]),
      [
        ['failed', 'The run was interrupted.'],
        ['complete', 'failed: links; warning: discovery'],
      ],
    );
  });

  const skippedRun = await run(files, fakes(), { skipLinks: true, skipEvolve: true });
  assert.deepEqual(
    skippedRun.stages.map((stage) => [stage.stage, stage.outcome, stage.message]),
    [
      ['ingest', 'ok', null],
      ['links', 'skipped', 'Skipped on request.'],
      ['tag', 'ok', null],
      ['evolve', 'skipped', 'Skipped on request.'],
    ],
  );
});
