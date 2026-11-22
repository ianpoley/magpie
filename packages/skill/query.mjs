#!/usr/bin/env node
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLONE_ROOT = join(dirname(realpathSync(fileURLToPath(import.meta.url))), '..', '..');

const SUBCOMMANDS = ['categories', 'topic', 'resources'];
const args = process.argv.slice(2);
const command = SUBCOMMANDS.includes(args[0]) ? args.shift() : null;
const opts = { source: 'all', limit: 12, json: false, full: false, author: null, since: null, includeHidden: false };
const terms = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--source') opts.source = String(args[++i] || 'all').toLowerCase();
  else if (a === '--limit') opts.limit = Math.max(1, parseInt(args[++i], 10) || 12);
  else if (a === '--author') opts.author = String(args[++i] || '').replace(/^@/, '').toLowerCase();
  else if (a === '--since') opts.since = args[++i];
  else if (a === '--full') opts.full = true;
  else if (a === '--json') opts.json = true;
  else if (a === '--include-hidden') opts.includeHidden = true;
  else if (a === '-h' || a === '--help') { usage(); process.exit(0); }
  else terms.push(a);
}

function usage() {
  console.log(`magpie query — search the user's saved X bookmarks & likes

Usage:
  node query.mjs <terms...> [--source bookmarks|likes|all] [--limit N]
                 [--author handle] [--since YYYY-MM-DD] [--full] [--json]
                 [--include-hidden]
  node query.mjs categories [--include-hidden] [--json]
  node query.mjs topic <name> [--limit N] [--full] [--json] [--include-hidden]
  node query.mjs resources <name> [--limit N] [--json] [--include-hidden]

categories lists the areas and topics the posts are sorted into, with counts.
topic and resources take an area or topic name from that list.
Hidden areas and topics, and the posts in them, are left out unless
--include-hidden is given. Posts removed from the corpus are never returned.

Examples:
  node query.mjs animation react --limit 8
  node query.mjs "state machine" --source bookmarks --json
  node query.mjs terminal ui --author steipete --full
  node query.mjs categories
  node query.mjs topic "UI animation" --limit 20
  node query.mjs resources evals`);
}

const ENV_STORE = process.env.MAGPIE_STORE;
const ENV_DIR = process.env.MAGPIE_DIR;
const STORE = ENV_STORE || (ENV_DIR ? join(ENV_DIR, '..', 'state', 'corpus.sqlite') : join(CLONE_ROOT, 'state', 'corpus.sqlite'));
const KNOWN_SCHEMA_VERSION = 8;
const BASELINE_SCHEMA_VERSION = 8;

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function loadSqlite() {
  const emitWarning = process.emitWarning;
  process.emitWarning = (warning, ...rest) => {
    const type = rest[0] && typeof rest[0] === 'object' ? rest[0].type : rest[0];
    if (type === 'ExperimentalWarning' || (warning && warning.name === 'ExperimentalWarning')) return;
    emitWarning.call(process, warning, ...rest);
  };
  try {
    return await import('node:sqlite');
  } catch {
    return fail(`This node (${process.version}) has no node:sqlite, so the store at ${STORE} cannot be read. Use node 22.13 or newer.`);
  } finally {
    process.emitWarning = emitWarning;
  }
}

async function openStore() {
  if (!existsSync(STORE)) return null;
  const { DatabaseSync } = await loadSqlite();
  const db = new DatabaseSync(STORE, { readOnly: true });
  db.exec('PRAGMA busy_timeout = 5000');
  const hasMeta = db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meta'`).get();
  const row = hasMeta ? db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() : null;
  const version = row ? Number(row.value) : 0;
  if (version > KNOWN_SCHEMA_VERSION) {
    db.close();
    return fail(`The store at ${STORE} has schema version ${version}; this script knows version ${KNOWN_SCHEMA_VERSION}. `
      + `Update the magpie skill.`);
  }
  if (version < BASELINE_SCHEMA_VERSION) {
    db.close();
    return null;
  }
  return { db, version };
}

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

function warnIfStale(db) {
  const row = db.prepare(`SELECT MAX(finished_at) AS at FROM run_stages WHERE stage = 'x_bookmarks' AND outcome = 'ok'`).get();
  const at = Date.parse(row?.at ?? '');
  if (Number.isNaN(at)) {
    if (db.prepare(`SELECT 1 FROM run_stages WHERE stage = 'x_bookmarks' LIMIT 1`).get()) {
      console.error(`Note: no sync from X has succeeded yet, so this corpus may be missing saves. Tell the user; \`bun run service:status\` in ${CLONE_ROOT} shows why.\n`);
    }
    return;
  }
  if (Date.now() - at < STALE_AFTER_MS) return;
  const days = Math.floor((Date.now() - at) / STALE_AFTER_MS);
  console.error(`Note: this corpus last synced from X ${days === 1 ? '1 day' : `${days} days`} ago (${new Date(at).toISOString().slice(0, 10)}), `
    + `so newer saves are missing. Tell the user; \`bun run service:status\` in ${CLONE_ROOT} shows why.\n`);
}

function hiddenPostIds(db) {
  return new Set(db.prepare('SELECT post_id FROM post_hidden').all().map(r => String(r.post_id)));
}

function removedPostIds({ db }) {
  return new Set(db.prepare('SELECT id FROM posts WHERE removed_at IS NOT NULL').all().map(r => String(r.id)));
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const fold = s => String(s).trim().replace(/\s+/g, ' ').toLowerCase();
const clip = text => (opts.full ? text : (text.length > 400 ? text.slice(0, 400) + '…' : text));
const indent = text => text.split('\n').map(l => '   ' + l).join('\n');

function editDistance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length];
}

function readCategories(db) {
  const areas = db.prepare(`SELECT id, name, hidden FROM areas WHERE state = 'active' ORDER BY position, id`).all();
  const areaById = new Map(areas.map(a => [a.id, a]));
  const topics = db.prepare(
    `SELECT id, area_id, name, definition, hidden FROM topics WHERE state = 'active' ORDER BY position, id`,
  ).all().map(t => {
    const area = areaById.get(t.area_id) || null;
    return { ...t, area, hidden: t.hidden === 1 || (area !== null && area.hidden === 1) };
  });
  const hiddenPosts = opts.includeHidden ? new Set() : hiddenPostIds(db);
  const members = new Map(topics.map(t => [t.id, []]));
  for (const m of db.prepare('SELECT post_id, topic_id, band, strength FROM topic_membership').all()) {
    if (hiddenPosts.has(String(m.post_id))) continue;
    const list = members.get(m.topic_id);
    if (list) list.push(m);
  }
  return { areas, topics, members };
}

function runCategories(db) {
  const { areas, topics, members } = readCategories(db);
  const shown = topics.filter(t => opts.includeHidden || !t.hidden);
  const groups = [...areas, null]
    .filter(area => area === null || opts.includeHidden || area.hidden !== 1)
    .map(area => {
      const own = shown.filter(t => t.area === area);
      const confident = new Set();
      const rows = own.map(t => {
        const list = members.get(t.id);
        const sure = list.filter(m => m.band === 'confident');
        for (const m of sure) confident.add(m.post_id);
        return { topic: t.name, definition: t.definition, hidden: t.hidden, posts: sure.length, unsure: list.length - sure.length };
      });
      return { area: area ? area.name : null, hidden: area ? area.hidden === 1 : false, posts: confident.size, topics: rows };
    })
    .filter(group => group.area !== null || group.topics.length);

  if (opts.json) return console.log(JSON.stringify(groups, null, 2));
  if (!groups.length) return console.log('No categories yet. The sync job creates them; keyword search works meanwhile.');
  console.log(`Areas and topics, with the number of posts confidently in each${opts.includeHidden ? '' : ' (hidden ones left out; --include-hidden shows them)'}:\n`);
  for (const group of groups) {
    console.log(`${group.area ?? '(no area)'} — ${plural(group.posts, 'post')}${group.hidden ? ' [hidden]' : ''}`);
    for (const t of group.topics) {
      const unsure = t.unsure ? ` (+${t.unsure} unsure)` : '';
      console.log(`  ${t.topic} — ${plural(t.posts, 'post')}${unsure}${t.hidden && !group.hidden ? ' [hidden]' : ''}`);
      console.log(`      ${t.definition}`);
    }
    console.log('');
  }
}

function resolveCategory(db, name) {
  const { areas, topics, members } = readCategories(db);
  const wanted = fold(name);
  if (!wanted) fail(`Give an area or topic name, e.g. node query.mjs ${command} "<name>". Run "node query.mjs categories" to list them.`);
  const named = topics.filter(t => fold(t.name) === wanted || (t.area && fold(t.area.name) === wanted));
  if (!named.length && !areas.some(a => fold(a.name) === wanted)) {
    const names = [...new Set([
      ...areas.filter(a => opts.includeHidden || a.hidden !== 1).map(a => a.name),
      ...topics.filter(t => opts.includeHidden || !t.hidden).map(t => t.name),
    ])];
    const closest = names
      .map(n => {
        const folded = fold(n);
        const contains = folded.includes(wanted) || wanted.includes(folded);
        return { n, distance: contains ? 0 : editDistance(folded, wanted), limit: Math.max(2, Math.floor(wanted.length / 3)) };
      })
      .filter(x => x.distance <= x.limit)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5)
      .map(x => x.n);
    fail(`No category named "${name}".${closest.length ? ` Closest: ${closest.join(', ')}.` : ''} Run "node query.mjs categories" to list them.`);
  }
  const label = named.length && fold(named[0].name) !== wanted ? named[0].area.name : (named[0]?.name ?? name);
  const used = named.filter(t => opts.includeHidden || !t.hidden);
  const hiddenOnly = used.length === 0 && named.length > 0;

  const best = new Map();
  for (const t of used) {
    for (const m of members.get(t.id)) {
      const prev = best.get(m.post_id);
      const better = !prev || (m.band === 'confident') > (prev.band === 'confident')
        || (m.band === prev.band && m.strength > prev.strength);
      if (better) best.set(m.post_id, m);
    }
  }
  return { label, hiddenOnly, best };
}

function hiddenNotice(label) {
  return `"${label}" is hidden by default. Add --include-hidden to see it.`;
}

function runTopic(db, name) {
  const { label, hiddenOnly, best } = resolveCategory(db, name);
  const posts = new Map(db.prepare(
    `SELECT id, text, created_at, url, author_handle, author_name, bookmarked, liked FROM posts`,
  ).all().map(p => [p.id, p]));
  const ranked = [...best.values()]
    .map(m => ({ m, p: posts.get(m.post_id) }))
    .filter(x => x.p)
    .sort((a, b) => (b.m.band === 'confident') - (a.m.band === 'confident')
      || b.m.strength - a.m.strength
      || (Date.parse(b.p.created_at) || 0) - (Date.parse(a.p.created_at) || 0));
  const top = ranked.slice(0, opts.limit).map(({ m, p }) => ({
    type: [p.bookmarked ? 'bookmark' : null, p.liked ? 'like' : null].filter(Boolean).join('+'),
    id: p.id,
    handle: p.author_handle,
    name: p.author_name,
    created: p.created_at,
    url: p.url,
    text: p.text,
    band: m.band,
  }));

  if (opts.json) {
    if (hiddenOnly) console.error(hiddenNotice(label));
    return console.log(JSON.stringify(top, null, 2));
  }
  if (hiddenOnly) return console.log(hiddenNotice(label));
  const sure = ranked.filter(x => x.m.band === 'confident').length;
  console.log(`${plural(ranked.length, 'post')} in "${label}" (${sure} confident, ${ranked.length - sure} unsure); showing top ${top.length}:\n`);
  for (const [i, r] of top.entries()) {
    const date = String(r.created || '').slice(0, 10);
    console.log(`${i + 1}. @${r.handle} · ${date} · [${r.type}]${r.band === 'unsure' ? ' · unsure match' : ''}`);
    console.log(`   ${r.url}`);
    console.log(indent(clip(r.text)));
    console.log('');
  }
}

function runResources(db, name) {
  const { label, hiddenOnly, best } = resolveCategory(db, name);
  const byResource = new Map();
  const rows = db.prepare(
    `SELECT pl.post_id, r.id, r.title, r.kind, r.url, r.description
     FROM post_links pl
     JOIN links l ON l.url = pl.link_url
     JOIN resources r ON r.id = l.resource_id`,
  ).all();
  for (const row of rows) {
    if (!best.has(row.post_id)) continue;
    const entry = byResource.get(row.id) || { resource: row, posts: new Set() };
    entry.posts.add(row.post_id);
    byResource.set(row.id, entry);
  }
  const ranked = [...byResource.values()]
    .map(({ resource: r, posts }) => ({ title: r.title, kind: r.kind, url: r.url, description: r.description, posts: posts.size }))
    .sort((a, b) => b.posts - a.posts || String(a.title ?? a.url).localeCompare(String(b.title ?? b.url)));
  const top = ranked.slice(0, opts.limit);

  if (opts.json) {
    if (hiddenOnly) console.error(hiddenNotice(label));
    return console.log(JSON.stringify(top, null, 2));
  }
  if (hiddenOnly) return console.log(hiddenNotice(label));
  console.log(`${plural(ranked.length, 'resource')} linked from posts in "${label}"; showing top ${top.length}:\n`);
  for (const [i, r] of top.entries()) {
    console.log(`${i + 1}. ${r.title ?? r.url} · ${r.kind} · ${plural(r.posts, 'post')}`);
    console.log(`   ${r.url}`);
    if (r.description) console.log(`   ${r.description}`);
    console.log('');
  }
}

if (command) {
  const store = await openStore();
  if (!store) fail(`No category store at ${STORE}. The sync job creates it; keyword search (node query.mjs <terms...>) works without it. Override the path with MAGPIE_STORE.`);
  const { db } = store;
  warnIfStale(db);
  if (command === 'categories') runCategories(db);
  else if (command === 'topic') runTopic(db, terms.join(' '));
  else runResources(db, terms.join(' '));
  db.close();
  await new Promise(done => process.stdout.write('', done));
  process.exit(0);
}

const DIR = ENV_DIR || join(CLONE_ROOT, 'data');

function load(file) {
  const p = join(DIR, file);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

let records = [];
if (opts.source === 'all' || opts.source === 'bookmarks') records.push(...load('bookmarks.normalized.jsonl'));
if (opts.source === 'all' || opts.source === 'likes') records.push(...load('likes.normalized.jsonl'));

if (!records.length) {
  console.error(`No corpus found in ${DIR}. Is Magpie set up (bun run setup)? Override with MAGPIE_DIR.`);
  process.exit(1);
}

const byKey = new Map();
for (const r of records) {
  const key = r.id || r.url || `${r.handle}:${String(r.text).slice(0, 40)}`;
  const prev = byKey.get(key);
  if (!prev) byKey.set(key, { ...r });
  else if (!String(prev.type).split('+').includes(r.type)) prev.type = `${prev.type}+${r.type}`;
}
records = [...byKey.values()];

const store = await openStore();
if (store) {
  warnIfStale(store.db);
  const dropped = removedPostIds(store);
  if (!opts.includeHidden) for (const id of hiddenPostIds(store.db)) dropped.add(id);
  store.db.close();
  records = records.filter(r => !dropped.has(String(r.id)));
}
if (opts.author) records = records.filter(r => String(r.handle || '').toLowerCase() === opts.author);
if (opts.since) {
  const t = Date.parse(opts.since);
  if (!isNaN(t)) records = records.filter(r => Date.parse(r.created) >= t);
}

const STOP = new Set(['the','a','an','and','or','to','of','in','on','for','with','is','are',
  'my','me','i','how','what','about','any','from','that','this','it']);
const qterms = terms.map(t => t.toLowerCase()).filter(Boolean);
const scoreTerms = qterms.filter(t => t.length >= 3 && !STOP.has(t));
const usable = scoreTerms.length ? scoreTerms : qterms;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function score(r) {
  const hay = `${r.text}\n${r.handle}\n${r.name}`.toLowerCase();
  let distinct = 0, total = 0;
  for (const t of usable) {
    const m = hay.match(new RegExp(esc(t), 'g'));
    if (m) { distinct++; total += m.length; }
  }
  if (!distinct) return 0;
  const phrase = usable.join(' ');
  const phraseBonus = usable.length > 1 && hay.includes(phrase) ? 50 : 0;
  return distinct * 1000 + Math.min(total, 50) + phraseBonus;
}

let scored;
if (!usable.length) {
  scored = records.map(r => ({ r, s: 0 }));
} else {
  scored = records.map(r => ({ r, s: score(r) })).filter(x => x.s > 0);
}
scored.sort((a, b) => b.s - a.s || (Date.parse(b.r.created) || 0) - (Date.parse(a.r.created) || 0));
const top = scored.slice(0, opts.limit).map(x => ({ ...x.r, score: x.s }));

if (opts.json) {
  console.log(JSON.stringify(top, null, 2));
} else {
  const label = terms.length ? `"${terms.join(' ')}"` : '(most recent)';
  console.log(`Found ${scored.length} match(es) for ${label} in ${opts.source}; showing top ${top.length}:\n`);
  for (const [i, r] of top.entries()) {
    const date = String(r.created || '').slice(0, 10);
    console.log(`${i + 1}. @${r.handle} · ${date} · [${r.type}]`);
    console.log(`   ${r.url}`);
    console.log(indent(clip(r.text)));
    console.log('');
  }
  if (!top.length) console.log('No matches. Try broader/different terms, or --source all.');
}
