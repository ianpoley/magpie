import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CLONE_ROOT = join(dirname(realpathSync(fileURLToPath(import.meta.url))), '..', '..');

const KNOWN_SCHEMA_VERSION = 8;
const BASELINE_SCHEMA_VERSION = 8;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export class CorpusError extends Error {}

export class CategoryNotFound extends CorpusError {
  constructor(name, closest) {
    super(`No category named "${name}".${closest.length ? ` Closest: ${closest.join(', ')}.` : ''}`);
  }
}

export class StoreTooNew extends CorpusError {
  constructor(store, version) {
    super(`The store at ${store} has schema version ${version}; this script knows version ${KNOWN_SCHEMA_VERSION}.`);
    this.version = version;
    this.known = KNOWN_SCHEMA_VERSION;
  }
}

export class NoExports extends CorpusError {
  constructor(dir) {
    super(`No corpus found in ${dir}.`);
  }
}

export function corpusPaths(env = process.env) {
  const store = env.MAGPIE_STORE
    || (env.MAGPIE_DIR ? join(env.MAGPIE_DIR, '..', 'state', 'corpus.sqlite') : join(CLONE_ROOT, 'state', 'corpus.sqlite'));
  const dir = env.MAGPIE_DIR || join(CLONE_ROOT, 'data');
  return { store, dir };
}

async function loadSqlite(store) {
  const emitWarning = process.emitWarning;
  process.emitWarning = (warning, ...rest) => {
    const type = rest[0] && typeof rest[0] === 'object' ? rest[0].type : rest[0];
    if (type === 'ExperimentalWarning' || (warning && warning.name === 'ExperimentalWarning')) return;
    emitWarning.call(process, warning, ...rest);
  };
  try {
    return await import('node:sqlite');
  } catch {
    throw new CorpusError(`This node (${process.version}) has no node:sqlite, so the store at ${store} cannot be read. Use node 22.13 or newer.`);
  } finally {
    process.emitWarning = emitWarning;
  }
}

export async function openStore({ store }) {
  if (!existsSync(store)) return null;
  const { DatabaseSync } = await loadSqlite(store);
  const db = new DatabaseSync(store, { readOnly: true });
  db.exec('PRAGMA busy_timeout = 5000');
  const hasMeta = db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meta'`).get();
  const row = hasMeta ? db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() : null;
  const version = row ? Number(row.value) : 0;
  if (version > KNOWN_SCHEMA_VERSION) {
    db.close();
    throw new StoreTooNew(store, version);
  }
  if (version < BASELINE_SCHEMA_VERSION) {
    db.close();
    return null;
  }
  return db;
}

export function staleNote(db, remedy) {
  const row = db.prepare(`SELECT MAX(finished_at) AS at FROM run_stages WHERE stage = 'x_bookmarks' AND outcome = 'ok'`).get();
  const at = Date.parse(row?.at ?? '');
  if (Number.isNaN(at)) {
    if (!db.prepare(`SELECT 1 FROM run_stages WHERE stage = 'x_bookmarks' LIMIT 1`).get()) return null;
    return `Note: no sync from X has succeeded yet, so this corpus may be missing saves. Tell the user; ${remedy}`;
  }
  if (Date.now() - at < STALE_AFTER_MS) return null;
  const days = Math.floor((Date.now() - at) / STALE_AFTER_MS);
  return `Note: this corpus last synced from X ${days === 1 ? '1 day' : `${days} days`} ago (${new Date(at).toISOString().slice(0, 10)}), `
    + `so newer saves are missing. Tell the user; ${remedy}`;
}

function hiddenPostIds(db) {
  return new Set(db.prepare('SELECT post_id FROM post_hidden').all().map(r => String(r.post_id)));
}

function removedPostIds(db) {
  return new Set(db.prepare('SELECT id FROM posts WHERE removed_at IS NOT NULL').all().map(r => String(r.id)));
}

const fold = s => String(s).trim().replace(/\s+/g, ' ').toLowerCase();

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

function readCategories(db, includeHidden) {
  const areas = db.prepare(`SELECT id, name, hidden FROM areas WHERE state = 'active' ORDER BY position, id`).all();
  const areaById = new Map(areas.map(a => [a.id, a]));
  const topics = db.prepare(
    `SELECT id, area_id, name, definition, hidden FROM topics WHERE state = 'active' ORDER BY position, id`,
  ).all().map(t => {
    const area = areaById.get(t.area_id) || null;
    return { ...t, area, hidden: t.hidden === 1 || (area !== null && area.hidden === 1) };
  });
  const hiddenPosts = includeHidden ? new Set() : hiddenPostIds(db);
  const members = new Map(topics.map(t => [t.id, []]));
  for (const m of db.prepare('SELECT post_id, topic_id, band, strength FROM topic_membership').all()) {
    if (hiddenPosts.has(String(m.post_id))) continue;
    const list = members.get(m.topic_id);
    if (list) list.push(m);
  }
  return { areas, topics, members };
}

export function categoryGroups(db, { includeHidden = false } = {}) {
  const { areas, topics, members } = readCategories(db, includeHidden);
  const shown = topics.filter(t => includeHidden || !t.hidden);
  return [...areas, null]
    .filter(area => area === null || includeHidden || area.hidden !== 1)
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
}

function closestNames(areas, topics, wanted, includeHidden) {
  const names = [...new Set([
    ...areas.filter(a => includeHidden || a.hidden !== 1).map(a => a.name),
    ...topics.filter(t => includeHidden || !t.hidden).map(t => t.name),
  ])];
  return names
    .map(n => {
      const folded = fold(n);
      const contains = folded.includes(wanted) || wanted.includes(folded);
      return { n, distance: contains ? 0 : editDistance(folded, wanted), limit: Math.max(2, Math.floor(wanted.length / 3)) };
    })
    .filter(x => x.distance <= x.limit)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5)
    .map(x => x.n);
}

function resolveCategory(db, name, includeHidden) {
  const { areas, topics, members } = readCategories(db, includeHidden);
  const wanted = fold(name);
  const named = topics.filter(t => fold(t.name) === wanted || (t.area && fold(t.area.name) === wanted));
  if (!named.length && !areas.some(a => fold(a.name) === wanted)) {
    throw new CategoryNotFound(name, closestNames(areas, topics, wanted, includeHidden));
  }
  const label = named.length && fold(named[0].name) !== wanted ? named[0].area.name : (named[0]?.name ?? name);
  const used = named.filter(t => includeHidden || !t.hidden);
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

export function topicPosts(db, name, { limit = 12, includeHidden = false } = {}) {
  const { label, hiddenOnly, best } = resolveCategory(db, name, includeHidden);
  const posts = new Map(db.prepare(
    `SELECT id, text, created_at, url, author_handle, author_name, bookmarked, liked FROM posts`,
  ).all().map(p => [p.id, p]));
  const ranked = [...best.values()]
    .map(m => ({ m, p: posts.get(m.post_id) }))
    .filter(x => x.p)
    .sort((a, b) => (b.m.band === 'confident') - (a.m.band === 'confident')
      || b.m.strength - a.m.strength
      || (Date.parse(b.p.created_at) || 0) - (Date.parse(a.p.created_at) || 0));
  const top = ranked.slice(0, limit).map(({ m, p }) => ({
    type: [p.bookmarked ? 'bookmark' : null, p.liked ? 'like' : null].filter(Boolean).join('+'),
    id: p.id,
    handle: p.author_handle,
    name: p.author_name,
    created: p.created_at,
    url: p.url,
    text: p.text,
    band: m.band,
  }));
  const confident = ranked.filter(x => x.m.band === 'confident').length;
  return { label, hiddenOnly, total: ranked.length, confident, posts: top };
}

export function topicResources(db, name, { limit = 12, includeHidden = false } = {}) {
  const { label, hiddenOnly, best } = resolveCategory(db, name, includeHidden);
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
  return { label, hiddenOnly, total: ranked.length, resources: ranked.slice(0, limit) };
}

const decodeEntities = text => String(text ?? '').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');

function loadExport(dir, file) {
  const p = join(dir, file);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean)
    .map(r => ({ ...r, text: decodeEntities(r.text), name: decodeEntities(r.name) }));
}

function exportedPosts(dir, source) {
  const records = [];
  if (source === 'all' || source === 'bookmarks') records.push(...loadExport(dir, 'bookmarks.normalized.jsonl'));
  if (source === 'all' || source === 'likes') records.push(...loadExport(dir, 'likes.normalized.jsonl'));
  if (!records.length) throw new NoExports(dir);
  const byKey = new Map();
  for (const r of records) {
    const key = r.id || r.url || `${r.handle}:${String(r.text).slice(0, 40)}`;
    const prev = byKey.get(key);
    if (!prev) byKey.set(key, { ...r });
    else if (!String(prev.type).split('+').includes(r.type)) prev.type = `${prev.type}+${r.type}`;
  }
  return [...byKey.values()];
}

const STOP = new Set(['the','a','an','and','or','to','of','in','on','for','with','is','are',
  'my','me','i','how','what','about','any','from','that','this','it']);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function scorer(terms) {
  const qterms = terms.map(t => t.toLowerCase()).filter(Boolean);
  const scoreTerms = qterms.filter(t => t.length >= 3 && !STOP.has(t));
  const usable = scoreTerms.length ? scoreTerms : qterms;
  if (!usable.length) return null;
  const phrase = usable.join(' ');
  return r => {
    const hay = `${r.text}\n${r.handle}\n${r.name}`.toLowerCase();
    let distinct = 0, total = 0;
    for (const t of usable) {
      const m = hay.match(new RegExp(esc(t), 'g'));
      if (m) { distinct++; total += m.length; }
    }
    if (!distinct) return 0;
    const phraseBonus = usable.length > 1 && hay.includes(phrase) ? 50 : 0;
    return distinct * 1000 + Math.min(total, 50) + phraseBonus;
  };
}

export function searchPosts(paths, db, terms, { source = 'all', limit = 12, author = null, since = null, includeHidden = false } = {}) {
  let records = exportedPosts(paths.dir, source);
  if (db) {
    const dropped = removedPostIds(db);
    if (!includeHidden) for (const id of hiddenPostIds(db)) dropped.add(id);
    records = records.filter(r => !dropped.has(String(r.id)));
  }
  if (author) records = records.filter(r => String(r.handle || '').toLowerCase() === author);
  if (since) {
    const t = Date.parse(since);
    if (!isNaN(t)) records = records.filter(r => Date.parse(r.created) >= t);
  }
  const score = scorer(terms);
  const scored = score
    ? records.map(r => ({ r, s: score(r) })).filter(x => x.s > 0)
    : records.map(r => ({ r, s: 0 }));
  scored.sort((a, b) => b.s - a.s || (Date.parse(b.r.created) || 0) - (Date.parse(a.r.created) || 0));
  return { total: scored.length, posts: scored.slice(0, limit).map(x => ({ ...x.r, score: x.s })) };
}
