#!/usr/bin/env node
/*
 * build-markdown.mjs <input.json> <outDir> <label> [normalizedJsonlOut]
 *
 * Reads a birdclaw `--json` envelope, finds the array of tweets inside it
 * (whatever the exact envelope shape turns out to be), and writes:
 *   - one markdown file per tweet in <outDir>
 *   - an index.md listing in <outDir>
 *   - an optional flat normalized .jsonl at [normalizedJsonlOut]
 *
 * It is deliberately tolerant of unknown field names and logs the keys it
 * actually saw, so the field mapping can be tuned after the first real run.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [, , inPath, outDir, label = 'item', jsonlOut] = process.argv;
if (!inPath || !outDir) {
  console.error('usage: build-markdown.mjs <input.json> <outDir> <label> [normalizedJsonlOut]');
  process.exit(2);
}

let raw;
try { raw = JSON.parse(readFileSync(inPath, 'utf8')); }
catch (e) { console.error(`Could not parse ${inPath}: ${e.message}`); process.exit(1); }

// Walk the envelope and return the largest array whose elements look tweet-ish.
function findTweetArray(node, best = []) {
  if (Array.isArray(node)) {
    const tweety = node.filter(x => x && typeof x === 'object' &&
      (x.text || x.full_text || x.content || x.tweet || x.id || x.id_str || x.rest_id || x.tweet_id));
    if (tweety.length > best.length) best = node;
    for (const el of node) best = findTweetArray(el, best);
    return best;
  }
  if (node && typeof node === 'object') for (const v of Object.values(node)) best = findTweetArray(v, best);
  return best;
}

const arr = findTweetArray(raw);
if (!arr.length) {
  console.error(`No tweet-like array found in ${inPath}. Top-level keys: ${Object.keys(raw || {}).join(', ')}`);
}

const pick = (o, keys) => { for (const k of keys) if (o && o[k] != null && o[k] !== '') return o[k]; return undefined; };
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const slug = s => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'untitled';

function norm(t) {
  const id = pick(t, ['id', 'id_str', 'rest_id', 'tweet_id']);
  const text = pick(t, ['full_text', 'text', 'content', 'tweet']) ?? '';
  const author = t.author || t.user || t.core || t.account || {};
  const handle = pick(t, ['handle', 'screen_name', 'username']) ||
                 pick(author, ['handle', 'screen_name', 'username']) || 'unknown';
  const name = pick(t, ['name', 'display_name']) || pick(author, ['name', 'display_name']) || handle;
  const created = pick(t, ['created_at', 'createdAt', 'date', 'timestamp']);
  const url = pick(t, ['url', 'permalink']) ||
    (id ? (handle !== 'unknown' ? `https://x.com/${handle}/status/${id}` : `https://x.com/i/status/${id}`) : '');
  return { id: id != null ? String(id) : '', text: String(text), handle: String(handle), name: String(name),
           created: created ? String(created) : '', url: String(url), raw: t };
}

mkdirSync(outDir, { recursive: true });
const items = arr.map(norm);

const indexLines = [`# ${label}s (${items.length})`, '', `_Last built: ${new Date().toISOString()}_`, ''];
const seen = new Set();
for (const it of items) {
  let base = `${(it.created || '').slice(0, 10) || 'nodate'}_${it.handle}_${it.id || slug(it.text)}`
    .replace(/[\/\\:]/g, '-');
  let fname = `${base}.md`, n = 1;
  while (seen.has(fname)) fname = `${base}-${n++}.md`;
  seen.add(fname);
  const body = [
    '---',
    `type: ${label}`,
    `id: ${it.id}`,
    `author: "@${it.handle}"`,
    `name: ${JSON.stringify(it.name)}`,
    `created: ${it.created}`,
    `url: ${it.url}`,
    '---',
    '',
    it.text.split('\n').map(l => `> ${l}`).join('\n'),
    '',
    `— [@${it.handle}](${it.url})${it.created ? ' · ' + it.created : ''}`,
    '',
  ].join('\n');
  writeFileSync(join(outDir, fname), body);
  const snippet = clean(it.text).slice(0, 120);
  indexLines.push(`- [@${it.handle}](${it.url}) — ${snippet}${snippet.length >= 120 ? '…' : ''}`);
}
writeFileSync(join(outDir, 'index.md'), indexLines.join('\n') + '\n');

if (jsonlOut) {
  const jsonl = items.map(i => JSON.stringify(
    { type: label, id: i.id, handle: i.handle, name: i.name, created: i.created, url: i.url, text: i.text }
  )).join('\n');
  writeFileSync(jsonlOut, jsonl + (jsonl ? '\n' : ''));
}

console.log(`Wrote ${items.length} ${label} files -> ${outDir}`);
if (items[0]) console.log(`Fields seen on first record: ${Object.keys(items[0].raw).join(', ')}`);
