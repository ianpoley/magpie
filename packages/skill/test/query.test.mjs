import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { seedArea, seedLink, seedPost, seedScore, seedTopic, tempStore } from '../../engine/test/fixtures/corpus.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(HERE, '..');
const QUERY = join(SKILL_DIR, 'query.mjs');
const INSTALL = join(SKILL_DIR, 'install.sh');
const CORPUS = join(HERE, 'fixtures', 'corpus');
const GOLDEN = join(HERE, 'fixtures', 'golden');

// Recorded from the keyword-only script before categories existed.
const KEYWORD_SEARCHES = [
  { golden: 'terms.txt', args: ['animation', 'react', '--limit', '8'] },
  { golden: 'terms-json.txt', args: ['animation', 'react', '--json'] },
  { golden: 'phrase-bookmarks-json.txt', args: ['state machine', '--source', 'bookmarks', '--json'] },
  { golden: 'author-full.txt', args: ['animation', '--author', '@alpha_dev', '--full'] },
  { golden: 'since-likes.txt', args: ['animation', '--since', '2026-03-15', '--source', 'likes'] },
  { golden: 'recent.txt', args: [] },
  { golden: 'none.txt', args: ['zzzznothing'] },
  { golden: 'long-truncated.txt', args: ['--limit', '2', 'curves'] },
];

function run(storePath, args) {
  const result = spawnSync(process.execPath, [QUERY, ...args], {
    encoding: 'utf8',
    env: { ...process.env, X_CORPUS_DIR: CORPUS, X_CORPUS_STORE: storePath },
  });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

function json(storePath, args) {
  const result = run(storePath, [...args, '--json']);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function fixtureRecords() {
  const byId = new Map();
  for (const [file, flag] of [['bookmarks', 'bookmarked'], ['likes', 'liked']]) {
    const lines = readFileSync(join(CORPUS, `${file}.normalized.jsonl`), 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      const record = JSON.parse(line);
      byId.set(record.id, { ...byId.get(record.id), ...record, [flag]: true });
    }
  }
  return [...byId.values()];
}

/**
 * A store holding the fixture corpus:
 *   UI        > Animation       101, 105, 103 confident; 202 and 104 unsure
 *             > State machines  102 confident
 *   Politics  > Elections       104 confident
 * Post 201 is in no topic. Two resources are linked from Animation posts.
 */
function seedStore(t, { politicsHidden }) {
  const { db, path } = tempStore(t);
  for (const record of fixtureRecords()) {
    seedPost(db, record.id, { text: record.text, bookmarked: !!record.bookmarked, liked: !!record.liked });
    db.prepare(`UPDATE posts SET author_handle = ?, author_name = ?, created_at = ?, url = ? WHERE id = ?`).run(
      record.handle,
      record.name,
      record.created,
      record.url,
      record.id,
    );
  }
  const ui = seedArea(db, 'UI');
  const politics = seedArea(db, 'Politics', { hidden: politicsHidden });
  const animation = seedTopic(db, 'Animation', { areaId: ui });
  const machines = seedTopic(db, 'State machines', { areaId: ui });
  const elections = seedTopic(db, 'Elections', { areaId: politics });
  seedTopic(db, 'Animatronics', { areaId: ui, state: 'deleted' });

  seedScore(db, '101', animation, 0.9);
  seedScore(db, '105', animation, 0.8);
  seedScore(db, '103', animation, 0.75);
  seedScore(db, '202', animation, 0.5);
  seedScore(db, '104', animation, 0.4);
  seedScore(db, '102', machines, 0.9);
  seedScore(db, '104', elections, 0.9);

  const addResource = db.prepare(
    `INSERT INTO resources (canonical_key, kind, url, host, title, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?, '2026-01-01T00:00:00.000Z')`,
  );
  const link = (postId, url, resourceId) => {
    seedLink(db, postId, url, { status: 'resolved' });
    db.prepare(`UPDATE links SET resource_id = ? WHERE url = ?`).run(resourceId, url);
  };
  const motion = Number(
    addResource.run('github:example/motion-lib', 'repo', 'https://github.com/example/motion-lib', 'github.com', 'example/motion-lib', 'A synthetic animation library').lastInsertRowid,
  );
  const docs = Number(
    addResource.run('page:spring.example/docs', 'page', 'https://spring.example/docs', 'spring.example', 'Spring docs', null).lastInsertRowid,
  );
  link('101', 'https://t.co/a1', motion);
  link('105', 'https://t.co/a2', motion);
  link('202', 'https://t.co/a3', motion);
  link('101', 'https://t.co/a4', docs);
  link('104', 'https://t.co/a5', docs);

  db.close();
  return path;
}

function missingStore(t) {
  const dir = mkdtempSync(join(tmpdir(), 'x-corpus-skill-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'corpus.sqlite');
}

test('keyword search prints what it always printed when no store exists', (t) => {
  const store = missingStore(t);
  for (const { golden, args } of KEYWORD_SEARCHES) {
    const result = run(store, args);
    assert.equal(result.stdout, readFileSync(join(GOLDEN, golden), 'utf8'), golden);
    assert.equal(result.stderr, '', golden);
    assert.equal(result.status, 0, golden);
  }
});

test('keyword search prints what it always printed when the store hides no post', (t) => {
  const store = seedStore(t, { politicsHidden: false });
  for (const { golden, args } of KEYWORD_SEARCHES) {
    const result = run(store, args);
    assert.equal(result.stdout, readFileSync(join(GOLDEN, golden), 'utf8'), golden);
    assert.equal(result.stderr, '', golden);
    assert.equal(result.status, 0, golden);
  }
});

test('keyword search leaves out a hidden post unless asked to include it', (t) => {
  const store = seedStore(t, { politicsHidden: true });

  const byDefault = json(store, ['animation']);
  assert.deepEqual(byDefault.map((post) => post.id).sort(), ['101', '103', '105', '202']);
  assert.match(run(store, ['animation']).stdout, /^Found 4 match\(es\)/);

  const included = json(store, ['animation', '--include-hidden']);
  assert.deepEqual(included.map((post) => post.id).sort(), ['101', '103', '104', '105', '202']);
});

test('categories lists areas and topics with post counts and omits hidden areas', (t) => {
  const store = seedStore(t, { politicsHidden: true });

  assert.deepEqual(json(store, ['categories']), [
    {
      area: 'UI',
      hidden: false,
      posts: 4,
      topics: [
        { topic: 'Animation', definition: 'Posts about Animation.', hidden: false, posts: 3, unsure: 1 },
        { topic: 'State machines', definition: 'Posts about State machines.', hidden: false, posts: 1, unsure: 0 },
      ],
    },
  ]);

  const text = run(store, ['categories']);
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /UI.*4 posts/);
  assert.match(text.stdout, /Animation.*3 posts.*1 unsure/);
  assert.doesNotMatch(text.stdout, /Politics|Elections|Animatronics/);

  const all = json(store, ['categories', '--include-hidden']);
  assert.deepEqual(all.map((area) => [area.area, area.hidden, area.posts]), [['UI', false, 4], ['Politics', true, 1]]);
  assert.equal(all[0].topics[0].unsure, 2);
});

test('a hidden area returns no posts by default and its posts when asked', (t) => {
  const store = seedStore(t, { politicsHidden: true });

  assert.deepEqual(json(store, ['topic', 'politics']), []);
  const text = run(store, ['topic', 'politics']);
  assert.equal(text.status, 0);
  assert.doesNotMatch(text.stdout + text.stderr, /status\/104/);
  assert.match(text.stdout + text.stderr, /--include-hidden/);

  const shown = json(store, ['topic', 'politics', '--include-hidden']);
  assert.deepEqual(shown.map((post) => [post.id, post.band]), [['104', 'confident']]);
  assert.match(run(store, ['topic', 'politics', '--include-hidden']).stdout, /status\/104/);
});

test('topic lists confident posts before unsure ones', (t) => {
  const store = seedStore(t, { politicsHidden: true });

  const posts = json(store, ['topic', 'animation']);
  assert.deepEqual(posts.map((post) => [post.id, post.band]), [
    ['101', 'confident'],
    ['105', 'confident'],
    ['103', 'confident'],
    ['202', 'unsure'],
  ]);
  assert.deepEqual(
    { type: posts[0].type, handle: posts[0].handle, url: posts[0].url, text: posts[0].text },
    {
      type: 'bookmark+like',
      handle: 'alpha_dev',
      url: 'https://x.com/alpha_dev/status/101',
      text: 'Spring animation in react made simple\nwith a tiny hook',
    },
  );

  const text = run(store, ['topic', 'animation']).stdout;
  assert.ok(text.indexOf('status/103') < text.indexOf('status/202'));
  assert.match(text, /@alpha_dev · 2026-03-01 · \[bookmark\+like\]/);

  assert.deepEqual(json(store, ['topic', 'state', 'machines']).map((post) => post.id), ['102']);
  assert.deepEqual(json(store, ['topic', 'animation', '--limit', '2']).map((post) => post.id), ['101', '105']);
});

test('topic output larger than a pipe buffer arrives whole', (t) => {
  const { db, path } = tempStore(t);
  const topic = seedTopic(db, 'Animation', { areaId: seedArea(db, 'UI') });
  for (let i = 0; i < 300; i++) {
    seedPost(db, `p${i}`, { text: 'synthetic filler text '.repeat(50) });
    seedScore(db, `p${i}`, topic, 0.9);
  }
  db.close();

  assert.equal(json(path, ['topic', 'animation', '--limit', '300', '--full']).length, 300);
});

test('resources lists what a category links to, most-posted first', (t) => {
  const store = seedStore(t, { politicsHidden: true });

  assert.deepEqual(json(store, ['resources', 'animation']), [
    {
      title: 'example/motion-lib',
      kind: 'repo',
      url: 'https://github.com/example/motion-lib',
      description: 'A synthetic animation library',
      posts: 3,
    },
    { title: 'Spring docs', kind: 'page', url: 'https://spring.example/docs', description: null, posts: 1 },
  ]);

  const text = run(store, ['resources', 'animation']).stdout;
  assert.ok(text.indexOf('motion-lib') < text.indexOf('Spring docs'));
  assert.match(text, /3 posts/);

  assert.deepEqual(json(store, ['resources', 'politics']), []);
  assert.deepEqual(json(store, ['resources', 'politics', '--include-hidden']).map((r) => [r.title, r.posts]), [['Spring docs', 1]]);
});

test('a missing store is reported clearly by category commands', (t) => {
  const store = missingStore(t);
  for (const args of [['categories'], ['topic', 'animation'], ['resources', 'animation']]) {
    const result = run(store, args);
    assert.notEqual(result.status, 0, args.join(' '));
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.includes(store), result.stderr);
    assert.match(result.stderr, /No category store/);
  }
});

test('a store written by a newer schema version is refused', (t) => {
  const store = seedStore(t, { politicsHidden: true });
  const db = new DatabaseSync(store);
  db.prepare(`UPDATE meta SET value = '99' WHERE key = 'schema_version'`).run();
  db.close();

  for (const args of [['categories'], ['topic', 'animation'], ['resources', 'animation'], ['animation']]) {
    const result = run(store, args);
    assert.notEqual(result.status, 0, args.join(' '));
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /schema version 99/);
  }

  const withoutStore = run(store, ['animation', '--include-hidden']);
  assert.equal(withoutStore.status, 0, withoutStore.stderr);
  assert.match(withoutStore.stdout, /^Found 5 match\(es\)/);
});

test('an unknown category name suggests the closest names', (t) => {
  const store = seedStore(t, { politicsHidden: true });

  const result = run(store, ['topic', 'animaton']);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /No category named "animaton"/);
  assert.match(result.stderr, /Animation/);
  assert.doesNotMatch(result.stderr, /Animatronics|Elections|Politics/);

  assert.match(run(store, ['resources', 'state machine']).stderr, /State machines/);
});

test('no command changes the store file', (t) => {
  const store = seedStore(t, { politicsHidden: true });
  const before = statSync(store, { bigint: true });
  const commands = [
    ['animation'],
    ['animation', '--include-hidden'],
    ['categories'],
    ['categories', '--include-hidden'],
    ['topic', 'animation'],
    ['topic', 'politics', '--include-hidden'],
    ['resources', 'animation'],
    ['topic', 'animaton'],
  ];
  for (const args of commands) {
    run(store, args);
    const after = statSync(store, { bigint: true });
    assert.equal(after.mtimeNs, before.mtimeNs, args.join(' '));
    assert.equal(after.size, before.size, args.join(' '));
  }
});

function install(home) {
  const result = spawnSync('bash', [INSTALL], { encoding: 'utf8', env: { ...process.env, HOME: home } });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

function tempHome(t) {
  const home = mkdtempSync(join(tmpdir(), 'x-corpus-home-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

test('install links the skill into a home that has none, and can run again', (t) => {
  const home = tempHome(t);
  const target = join(home, '.claude', 'skills', 'x-corpus');

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = install(home);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(lstatSync(target).isSymbolicLink());
    assert.equal(realpathSync(target), realpathSync(SKILL_DIR));
    assert.doesNotMatch(result.stdout, /secrets\.env/);
  }
  assert.deepEqual(readdirSync(join(home, '.claude', 'skills')), ['x-corpus']);
  assert.ok(!existsSync(join(SKILL_DIR, 'skill')));
});

test('install moves an existing skill directory to a dated backup and leaves its secrets file there', (t) => {
  const home = tempHome(t);
  const skills = join(home, '.claude', 'skills');
  const target = join(skills, 'x-corpus');
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'SKILL.md'), 'old skill\n');
  writeFileSync(join(target, 'secrets.env'), 'export SYNTHETIC_KEY="not-a-real-secret"\n');

  const first = install(home);
  assert.equal(first.status, 0, first.stderr);
  assert.ok(lstatSync(target).isSymbolicLink());
  assert.equal(realpathSync(target), realpathSync(SKILL_DIR));

  const backups = readdirSync(skills).filter((name) => name !== 'x-corpus');
  assert.equal(backups.length, 1);
  assert.match(backups[0], /^x-corpus\.backup-\d{4}-\d{2}-\d{2}$/);
  const backup = join(skills, backups[0]);
  assert.equal(readFileSync(join(backup, 'SKILL.md'), 'utf8'), 'old skill\n');
  assert.equal(readFileSync(join(backup, 'secrets.env'), 'utf8'), 'export SYNTHETIC_KEY="not-a-real-secret"\n');
  assert.ok(!existsSync(join(SKILL_DIR, 'secrets.env')));
  const notices = first.stdout.split('\n').filter((line) => line.includes('secrets.env'));
  assert.equal(notices.length, 1);
  assert.ok(notices[0].includes(backup));
  assert.doesNotMatch(first.stdout + first.stderr, /not-a-real-secret/);

  const second = install(home);
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(readdirSync(skills).sort(), ['x-corpus', backups[0]].sort());
});
