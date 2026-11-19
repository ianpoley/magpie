import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';

import type { ClaudeAdapter, ClaudeRequest, ClaudeSendResult } from '../src/claude/cli.ts';
import { runDiscovery } from '../src/claude/discovery.ts';
import { DISCOVERY } from '../src/config.ts';
import { ingest } from '../src/ingest.ts';
import { openStore } from '../src/store/db.ts';
import { exportPost, tempDir, writeExports } from './fixtures/export.ts';
import type { ExportPost } from './fixtures/export.ts';

function setup(t: TestContext, bookmarks: ExportPost[]): DatabaseSync {
  const { dir, cleanup } = tempDir();
  const db = openStore(join(dir, 'corpus.sqlite'));
  t.after(() => {
    db.close();
    cleanup();
  });
  ingest(db, writeExports(dir, { bookmarks, likes: [] }));
  return db;
}

const ok = (value: unknown): ClaudeSendResult => ({ ok: true, value, session: null });

/** Answers each request with the next scripted reply and keeps the prompts it was sent. */
function fakeClaude(replies: ClaudeSendResult[]): ClaudeAdapter & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    prompts,
    send: async (request: ClaudeRequest) => {
      prompts.push(request.prompt);
      const reply = replies[prompts.length - 1];
      if (!reply) throw new Error(`unexpected call ${prompts.length}`);
      return reply;
    },
  };
}

const candidates = (...names: string[]) =>
  ok({ topics: names.map((name) => ({ name, area: 'AI', definition: `Posts about ${name}.` })) });

const merged = ok({
  areas: [
    {
      name: 'AI',
      dev: true,
      topics: [
        { name: 'Evals', definition: 'Measuring model quality with test suites.' },
        { name: 'Agents', definition: 'Building autonomous LLM agents.' },
      ],
    },
    { name: 'Politics', dev: false, topics: [{ name: 'Elections', definition: 'Election news and commentary.' }] },
  ],
});

const areas = (db: DatabaseSync) =>
  db.prepare('SELECT name, is_dev, hidden, kind, state FROM areas ORDER BY position').all();
const topics = (db: DatabaseSync) =>
  db
    .prepare(
      `SELECT t.name, t.definition, a.name AS area, t.kind, t.state, t.locked, t.hidden
       FROM topics t JOIN areas a ON a.id = t.area_id ORDER BY a.position, t.position`,
    )
    .all();
const count = (db: DatabaseSync, table: string) =>
  Number(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n);

const posts = (n: number) => Array.from({ length: n }, (_, i) => exportPost(String(i + 1)));

test('a valid merged proposal creates areas and topics, with non-dev areas hidden', async (t) => {
  const db = setup(t, posts(3));
  const claude = fakeClaude([candidates('Evals', 'Agents', 'Elections'), merged]);

  const result = await runDiscovery(db, { claude });

  assert.equal(result.status, 'created');
  assert.deepEqual(
    areas(db).map((row) => ({ ...row })),
    [
      { name: 'AI', is_dev: 1, hidden: 0, kind: 'auto', state: 'active' },
      { name: 'Politics', is_dev: 0, hidden: 1, kind: 'auto', state: 'active' },
    ],
  );
  assert.deepEqual(
    topics(db).map((row) => ({ ...row })),
    [
      { name: 'Evals', definition: 'Measuring model quality with test suites.', area: 'AI', kind: 'auto', state: 'active', locked: 0, hidden: 0 },
      { name: 'Agents', definition: 'Building autonomous LLM agents.', area: 'AI', kind: 'auto', state: 'active', locked: 0, hidden: 0 },
      { name: 'Elections', definition: 'Election news and commentary.', area: 'Politics', kind: 'auto', state: 'active', locked: 0, hidden: 0 },
    ],
  );
});

test('the first pass is logged as one change that cannot be undone', async (t) => {
  const db = setup(t, posts(3));

  await runDiscovery(db, { claude: fakeClaude([candidates('Evals'), merged]) });

  const changes = db.prepare('SELECT summary, source, undoable, post_count FROM changes').all();
  assert.deepEqual(
    changes.map((row) => ({ ...row })),
    [{ summary: 'Initial categories', source: 'auto', undoable: 0, post_count: 3 }],
  );
});

test('merged output that fails the schema is rejected and nothing is written', async (t) => {
  const db = setup(t, posts(3));
  const bad = ok({ areas: [{ name: 'AI', dev: 'yes', topics: [{ name: 'Evals' }] }] });

  const result = await runDiscovery(db, { claude: fakeClaude([candidates('Evals'), bad]) });

  assert.equal(result.status, 'failed');
  assert.equal(result.status === 'failed' && result.failure.reason, 'schema');
  assert.equal(count(db, 'areas') + count(db, 'topics') + count(db, 'changes'), 0);
});

test('a name with markup or control characters is stored stripped and length-capped', async (t) => {
  const db = setup(t, posts(1));
  const dirty = ok({
    areas: [
      {
        name: '<script>alert(1)</script>AI\u0000 **Tools**',
        dev: true,
        topics: [
          {
            name: `<b>Evals</b>\u0007‮ \`and\`\n[benchmarks](https://evil.example) ${'x'.repeat(200)}`,
            definition: `<img src=x onerror=alert(1)>Measuring\u0000 models. ${'y'.repeat(1000)}`,
          },
        ],
      },
    ],
  });

  await runDiscovery(db, { claude: fakeClaude([candidates('Evals'), dirty]) });

  const [area] = areas(db);
  const [topic] = topics(db);
  assert.equal(area.name, 'alert(1)AI Tools');
  assert.match(String(topic.name), /^Evals and benchmarks x+$/);
  assert.equal(String(topic.name).length, DISCOVERY.nameMaxChars);
  assert.match(String(topic.definition), /^Measuring models\. y+$/);
  assert.equal(String(topic.definition).length, DISCOVERY.definitionMaxChars);
});

test('a failed Claude call writes nothing and reports the failure', async (t) => {
  for (const reason of ['exit', 'timeout', 'missing'] as const) {
    const db = setup(t, posts(3));
    const failure = { ok: false, reason, message: 'boom' } as const;

    const atBatch = await runDiscovery(db, { claude: fakeClaude([failure]) });
    const atMerge = await runDiscovery(db, { claude: fakeClaude([candidates('Evals'), failure]) });

    assert.deepEqual(atBatch, { status: 'failed', failure });
    assert.deepEqual(atMerge, { status: 'failed', failure });
    assert.equal(count(db, 'areas') + count(db, 'topics') + count(db, 'changes'), 0);
  }
});

test('discovery does not run when topics already exist', async (t) => {
  const db = setup(t, posts(3));
  await runDiscovery(db, { claude: fakeClaude([candidates('Evals'), merged]) });
  const second = fakeClaude([]);

  const result = await runDiscovery(db, { claude: second });

  assert.deepEqual(result, { status: 'skipped', reason: 'topics_exist' });
  assert.equal(second.prompts.length, 0);
  assert.equal(count(db, 'topics'), 3);
  assert.equal(count(db, 'changes'), 1);
});

test('discovery does not run on an empty store', async (t) => {
  const db = setup(t, []);
  const claude = fakeClaude([]);

  assert.deepEqual(await runDiscovery(db, { claude }), { status: 'skipped', reason: 'no_posts' });
  assert.equal(claude.prompts.length, 0);
});

test('the corpus is read in batches and same-named candidates merge into one', async (t) => {
  const db = setup(t, posts(DISCOVERY.batchSize + 1));
  const claude = fakeClaude([candidates('Evals', 'Agents'), candidates('evals ', 'Elections'), merged]);

  await runDiscovery(db, { claude });

  assert.equal(claude.prompts.length, 3);
  const mergePrompt = claude.prompts[2];
  assert.equal(mergePrompt.match(/"name":"evals ?"/gi)?.length, 1);
  assert.match(mergePrompt, /"name":"Agents"/);
  assert.match(mergePrompt, /"name":"Elections"/);
});

test('a topic the merged list names twice is stored once', async (t) => {
  const db = setup(t, posts(1));
  const twice = ok({
    areas: [
      { name: 'AI', dev: true, topics: [{ name: 'Evals', definition: 'First definition.' }] },
      { name: 'ai', dev: true, topics: [{ name: 'Agents', definition: 'Agents.' }] },
      { name: 'Testing', dev: true, topics: [{ name: '<i>evals</i>', definition: 'Second definition.' }] },
    ],
  });

  await runDiscovery(db, { claude: fakeClaude([candidates('Evals'), twice]) });

  assert.deepEqual(
    topics(db).map((row) => `${row.area}/${row.name}: ${row.definition}`),
    ['AI/Evals: First definition.', 'AI/Agents: Agents.'],
  );
  assert.deepEqual(areas(db).map((row) => row.name), ['AI']);
});

test('each post reaches Claude as truncated text with its quoted text and resolved link titles', async (t) => {
  const long = `START ${'z'.repeat(DISCOVERY.postCharLimit * 2)} END_OF_POST`;
  const db = setup(t, [
    exportPost('1', {
      text: long,
      quoted: exportPost('900', { text: 'the quoted words' }),
      urls: [{ url: 'https://t.co/resolved' }, { url: 'https://t.co/pending' }],
    }),
  ]);
  db.prepare(`UPDATE links SET status = 'resolved', title = 'Motion library docs' WHERE url = ?`).run(
    'https://t.co/resolved',
  );
  db.prepare(`UPDATE links SET status = 'unresolved', title = 'Just a moment...' WHERE url = ?`).run(
    'https://t.co/pending',
  );
  const claude = fakeClaude([candidates('Evals'), merged]);

  await runDiscovery(db, { claude });

  const batchPrompt = claude.prompts[0];
  assert.ok(!batchPrompt.includes('Just a moment'));
  assert.match(batchPrompt, /START z+/);
  assert.ok(!batchPrompt.includes('END_OF_POST'));
  assert.ok(!batchPrompt.includes('z'.repeat(DISCOVERY.postCharLimit + 1)));
  assert.match(batchPrompt, /the quoted words/);
  assert.match(batchPrompt, /Motion library docs/);
});

test('posts that left both collections are not sent', async (t) => {
  const db = setup(t, [exportPost('1', { text: 'still saved' }), exportPost('2', { text: 'GONE_POST' })]);
  db.prepare(`UPDATE posts SET bookmarked = 0, liked = 0 WHERE id = '2'`).run();
  const claude = fakeClaude([candidates('Evals'), merged]);

  await runDiscovery(db, { claude });

  assert.match(claude.prompts[0], /still saved/);
  assert.ok(!claude.prompts[0].includes('GONE_POST'));
});
