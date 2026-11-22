#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const [, , inPath, outDir, label = 'item', jsonlOut] = process.argv;
if (!inPath || !outDir) {
  console.error('usage: build-markdown.mjs <input.json> <outDir> <label> [normalizedJsonlOut]');
  process.exit(2);
}

let raw;
try { raw = JSON.parse(readFileSync(inPath, 'utf8')); }
catch (e) { console.error(`Could not parse ${inPath}: ${e.message}`); process.exit(1); }

const isText = (value) => typeof value === 'string' && value !== '';

function exportedPost(record, index) {
  const author = record?.author;
  if (!isText(record?.id) || typeof record.text !== 'string' || !isText(author?.handle)) {
    const keys = record && typeof record === 'object' ? Object.keys(record).join(', ') : typeof record;
    throw new Error(`post ${index} in ${inPath} is not in the Birdclaw export shape (needs id, text, author.handle; has ${keys})`);
  }
  const handle = author.handle;
  return {
    id: record.id,
    text: record.text,
    handle,
    name: isText(author.displayName) ? author.displayName : handle,
    created: isText(record.createdAt) ? record.createdAt : '',
    url: `https://x.com/${handle}/status/${record.id}`,
  };
}

if (!Array.isArray(raw)) {
  console.error(`${inPath} is not a Birdclaw export: expected a JSON array of posts, got ${raw === null ? 'null' : typeof raw}`);
  process.exit(1);
}

let items;
try { items = raw.map(exportedPost); }
catch (e) { console.error(e.message); process.exit(1); }

const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const slug = s => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'untitled';

mkdirSync(outDir, { recursive: true });

const writeWhole = (path, text) => {
  const draft = `${path}.${process.pid}.tmp`;
  writeFileSync(draft, text);
  renameSync(draft, path);
};

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
  writeWhole(join(outDir, fname), body);
  const snippet = clean(it.text).slice(0, 120);
  indexLines.push(`- [@${it.handle}](${it.url}) — ${snippet}${snippet.length >= 120 ? '…' : ''}`);
}
writeWhole(join(outDir, 'index.md'), indexLines.join('\n') + '\n');

if (jsonlOut) {
  const jsonl = items.map(i => JSON.stringify(
    { type: label, id: i.id, handle: i.handle, name: i.name, created: i.created, url: i.url, text: i.text }
  )).join('\n');
  writeWhole(jsonlOut, jsonl + (jsonl ? '\n' : ''));
}

for (const entry of readdirSync(outDir, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'index.md' && !seen.has(entry.name)) {
    rmSync(join(outDir, entry.name), { force: true });
  }
}

console.log(`Wrote ${items.length} ${label} files -> ${outDir}`);
