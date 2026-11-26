#!/usr/bin/env node
import {
  CLONE_ROOT,
  CategoryNotFound,
  CorpusError,
  NoExports,
  StoreTooNew,
  categoryGroups,
  corpusPaths,
  openStore,
  searchPosts,
  staleNote,
  topicPosts,
  topicResources,
} from './corpus.mjs';

const SUBCOMMANDS = ['categories', 'topic', 'resources'];
const args = process.argv.slice(2);
const command = SUBCOMMANDS.includes(args[0]) ? args.shift() : null;
const opts = { source: 'all', limit: 12, json: false, full: false, author: null, since: null, sort: 'strength', includeHidden: false };
const terms = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--source') opts.source = String(args[++i] || 'all').toLowerCase();
  else if (a === '--limit') opts.limit = Math.max(1, parseInt(args[++i], 10) || 12);
  else if (a === '--author') opts.author = String(args[++i] || '').replace(/^@/, '').toLowerCase();
  else if (a === '--since') opts.since = args[++i];
  else if (a === '--sort') opts.sort = args[++i] === 'newest' ? 'newest' : 'strength';
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
  node query.mjs topic <name> [--limit N] [--since YYYY-MM-DD] [--sort newest]
                 [--full] [--json] [--include-hidden]
  node query.mjs resources <name> [--limit N] [--since YYYY-MM-DD] [--json]
                 [--include-hidden]

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

function fail(message) {
  console.error(message);
  process.exit(1);
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const clip = text => (opts.full ? text : (text.length > 400 ? text.slice(0, 400) + '…' : text));
const indent = text => text.split('\n').map(l => '   ' + l).join('\n');
const hiddenNotice = label => `"${label}" is hidden by default. Add --include-hidden to see it.`;

function warnIfStale(db) {
  const note = staleNote(db, `\`bun run service:status\` in ${CLONE_ROOT} shows why.`);
  if (note) console.error(`${note}\n`);
}

function printPost(i, r, suffix = '') {
  const date = String(r.created || '').slice(0, 10);
  console.log(`${i + 1}. @${r.handle} · ${date} · [${r.type}]${suffix}`);
  console.log(`   ${r.url}`);
  console.log(indent(clip(r.text)));
  console.log('');
}

function runCategories(db) {
  const groups = categoryGroups(db, opts);
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

function runTopic(db, name) {
  const { label, hiddenOnly, total, confident, posts } = topicPosts(db, name, opts);
  if (opts.json) {
    if (hiddenOnly) console.error(hiddenNotice(label));
    return console.log(JSON.stringify(posts, null, 2));
  }
  if (hiddenOnly) return console.log(hiddenNotice(label));
  console.log(`${plural(total, 'post')} in "${label}" (${confident} confident, ${total - confident} unsure); showing top ${posts.length}:\n`);
  for (const [i, r] of posts.entries()) printPost(i, r, r.band === 'unsure' ? ' · unsure match' : '');
}

function runResources(db, name) {
  const { label, hiddenOnly, total, resources } = topicResources(db, name, opts);
  if (opts.json) {
    if (hiddenOnly) console.error(hiddenNotice(label));
    return console.log(JSON.stringify(resources, null, 2));
  }
  if (hiddenOnly) return console.log(hiddenNotice(label));
  console.log(`${plural(total, 'resource')} linked from posts in "${label}"; showing top ${resources.length}:\n`);
  for (const [i, r] of resources.entries()) {
    const lastShared = r.last_shared ? ` · last shared ${String(r.last_shared).slice(0, 10)}` : '';
    console.log(`${i + 1}. ${r.title ?? r.url} · ${r.kind} · ${plural(r.posts, 'post')}${lastShared}`);
    console.log(`   ${r.url}`);
    if (r.description) console.log(`   ${r.description}`);
    console.log('');
  }
}

function runCommand(db) {
  if (command === 'categories') return runCategories(db);
  const name = terms.join(' ');
  if (!name.trim()) fail(`Give an area or topic name, e.g. node query.mjs ${command} "<name>". Run "node query.mjs categories" to list them.`);
  if (command === 'topic') runTopic(db, name);
  else runResources(db, name);
}

function runSearch(paths, db) {
  const { total, posts } = searchPosts(paths, db, terms, opts);
  if (opts.json) return console.log(JSON.stringify(posts, null, 2));
  const label = terms.length ? `"${terms.join(' ')}"` : '(most recent)';
  console.log(`Found ${total} match(es) for ${label} in ${opts.source}; showing top ${posts.length}:\n`);
  for (const [i, r] of posts.entries()) printPost(i, r);
  if (!posts.length) console.log('No matches. Try broader/different terms, or --source all.');
}

const paths = corpusPaths();
let db = null;
try {
  db = await openStore(paths);
  if (command && !db) fail(`No category store at ${paths.store}. The sync job creates it; keyword search (node query.mjs <terms...>) works without it. Override the path with MAGPIE_STORE.`);
  if (db) warnIfStale(db);
  if (command) runCommand(db);
  else runSearch(paths, db);
} catch (error) {
  if (error instanceof CategoryNotFound) fail(`${error.message} Run "node query.mjs categories" to list them.`);
  if (error instanceof StoreTooNew) fail(`${error.message} Update the magpie skill.`);
  if (error instanceof NoExports) fail(`${error.message} Is Magpie set up (bun run setup)? Override with MAGPIE_DIR.`);
  if (error instanceof CorpusError) fail(error.message);
  throw error;
} finally {
  db?.close();
}
