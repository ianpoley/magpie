import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import type { DatabaseSync } from 'node:sqlite';

import { LINKS } from '../config.ts';
import { transaction } from '../store/db.ts';
import { errorText } from '../util.ts';
import { canonicalize, normalizeHost, npmPackageName } from './canonical.ts';
import type { Canonical } from './canonical.ts';
import { homepageHost, lookupRepo, onHost } from './github.ts';
import type { HttpFetch, HttpResponse } from './http.ts';

export type HostLookup = (host: string) => Promise<string[]>;

export type LinkDeps = {
  http: HttpFetch;
  now: () => Date;
  lookup?: HostLookup;
};

export type LinkCounts = {
  attempted: number;
  resolved: number;
  notResource: number;
  failed: number;
  unresolved: number;
  resources: number;
  homepagesChecked: number;
  homepagesPending: number;
  aliases: number;
};

type Outcome =
  | { status: 'resolved'; finalUrl: string; title: string; description: string | null }
  | { status: 'not_resource'; finalUrl: string };

class Unreadable extends Error {
  finalUrl: string;

  constructor(message: string, finalUrl: string) {
    super(message);
    this.finalUrl = finalUrl;
  }
}

const NPM_REGISTRY = 'https://registry.npmjs.org';
const YOUTUBE_OEMBED = 'https://www.youtube.com/oembed';

const TITLE_MAX = 300;
const DESCRIPTION_MAX = 1000;
const ERROR_MAX = 300;
const NOT_PUBLIC = 'address is not on the public web';

const WALL_TITLES = [
  /^just a moment/i,
  /^one moment/i,
  /^attention required/i,
  /^access denied/i,
  /^(403 )?forbidden$/i,
  /^403\b/,
  /^too many requests/i,
  /^checking your browser/i,
  /^security check/i,
  /^robot check/i,
  /^pardon our interruption/i,
  /^are you (a )?(human|robot)/i,
  /verify(ing)? (that )?you are (a )?human/i,
  /^(re)?captcha\b/i,
  /^(sign|log) ?in$/i,
  /^(sign|log) ?in (to\b|[-–—|·•])/i,
  /^please (sign|log) ?in\b/i,
];

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…',
  middot: '·', bull: '•', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
  copy: '©', reg: '®', trade: '™',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? whole;
    const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}

function plainText(raw: string | undefined | null, max: number): string | null {
  if (raw === undefined || raw === null) return null;
  const text = decodeEntities(raw)
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text === '' ? null : text.slice(0, max).trim();
}

function metaContents(html: string): Map<string, string> {
  const found = new Map<string, string>();
  let end = -1;
  for (const { index } of html.matchAll(/<meta\b/gi)) {
    if (end < index) end = html.indexOf('>', index);
    if (end === -1) break;
    const tag = html.slice(index, end + 1);
    const attributes: Record<string, string> = {};
    for (const match of tag.matchAll(/(?<![a-z:_-])([a-z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
      attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
    }
    const name = (attributes.property ?? attributes.name)?.toLowerCase();
    if (name && attributes.content !== undefined && !found.has(name)) found.set(name, attributes.content);
  }
  return found;
}

function titleText(html: string): string | undefined {
  const open = /<title\b/i.exec(html);
  if (open === null) return undefined;
  const tagEnd = html.indexOf('>', open.index);
  if (tagEnd === -1) return undefined;
  const close = /<\/title>/gi;
  close.lastIndex = tagEnd + 1;
  const closed = close.exec(html);
  return closed === null ? undefined : html.slice(tagEnd + 1, closed.index);
}

function pageMetadata(html: string): { title: string | null; description: string | null } {
  const meta = metaContents(html);
  return {
    title:
      plainText(meta.get('og:title'), TITLE_MAX) ??
      plainText(meta.get('twitter:title'), TITLE_MAX) ??
      plainText(titleText(html), TITLE_MAX),
    description:
      plainText(meta.get('og:description'), DESCRIPTION_MAX) ??
      plainText(meta.get('description'), DESCRIPTION_MAX) ??
      plainText(meta.get('twitter:description'), DESCRIPTION_MAX),
  };
}

function httpUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null;
  } catch {
    return null;
  }
}

function isPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('[') || /^\d+(\.\d+){3}$/.test(host)) return false;
  if (!host.includes('.')) return false;
  return !onHost(host, ['localhost', 'local', 'internal', 'lan', 'home.arpa']);
}

const NON_PUBLIC_ADDRESSES = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  NON_PUBLIC_ADDRESSES.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::', 96],
  ['::ffff:0:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['2001::', 32],
  ['2002::', 16],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  NON_PUBLIC_ADDRESSES.addSubnet(network, prefix, 'ipv6');
}

function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  return version !== 0 && !NON_PUBLIC_ADDRESSES.check(address, version === 6 ? 'ipv6' : 'ipv4');
}

const systemLookup: HostLookup = async (host) => (await dnsLookup(host, { all: true })).map((found) => found.address);

async function readPackage(page: URL, name: string, http: HttpFetch): Promise<Outcome> {
  try {
    const response = await http({
      url: `${NPM_REGISTRY}/${name.replace('/', '%2F')}/latest`,
      timeoutMs: LINKS.timeoutMs,
      maxBytes: LINKS.htmlCapBytes,
      headers: { accept: 'application/json' },
    });
    if (response.status !== 200) throw new Error(`npm registry http ${response.status}`);
    const fields = JSON.parse(response.body) as Record<string, unknown> | null;
    if (typeof fields !== 'object' || fields === null) throw new Error('npm registry sent an unexpected response');
    return {
      status: 'resolved',
      finalUrl: page.href,
      title: plainText(typeof fields.name === 'string' ? fields.name : null, TITLE_MAX) ?? name,
      description: plainText(typeof fields.description === 'string' ? fields.description : null, DESCRIPTION_MAX),
    };
  } catch (error) {
    throw new Unreadable(errorText(error), page.href);
  }
}

function youtubeVideo(url: string): string | null {
  const own = canonicalize(url);
  return own !== null && own.key.startsWith('youtube:') ? own.url : null;
}

async function readVideo(page: URL, watch: string, http: HttpFetch): Promise<Outcome> {
  try {
    const response = await http({
      url: `${YOUTUBE_OEMBED}?format=json&url=${encodeURIComponent(watch)}`,
      timeoutMs: LINKS.timeoutMs,
      maxBytes: LINKS.htmlCapBytes,
      headers: { accept: 'application/json' },
    });
    if (response.status !== 200) throw new Error(`youtube oembed http ${response.status}`);
    const fields = JSON.parse(response.body) as Record<string, unknown> | null;
    const title = typeof fields === 'object' && fields !== null && typeof fields.title === 'string' ? plainText(fields.title, TITLE_MAX) : null;
    if (title === null) throw new Error('youtube oembed sent no title');
    const channel = typeof fields?.author_name === 'string' ? plainText(fields.author_name, DESCRIPTION_MAX) : null;
    return { status: 'resolved', finalUrl: page.href, title, description: channel };
  } catch (error) {
    throw new Unreadable(errorText(error), page.href);
  }
}

async function follow(start: URL, http: HttpFetch, lookup: HostLookup): Promise<Outcome> {
  let url = start;
  for (let redirects = 0; ; redirects++) {
    if (onHost(normalizeHost(url.hostname), LINKS.notResourceHosts)) {
      return { status: 'not_resource', finalUrl: url.href };
    }
    if (!isPublicHost(url.hostname)) throw new Error(NOT_PUBLIC);

    const packageName = npmPackageName(url);
    if (packageName !== null) return readPackage(url, packageName, http);
    const watch = youtubeVideo(url.href);
    if (watch !== null) return readVideo(url, watch, http);

    const isDestination = !onHost(normalizeHost(url.hostname), LINKS.shortenerHosts);
    const unreachable = (error: unknown): unknown =>
      redirects > 0 && isDestination ? new Unreadable(errorText(error), url.href) : error;

    let addresses: string[];
    try {
      addresses = await lookup(url.hostname);
    } catch (error) {
      throw unreachable(error);
    }
    if (addresses.length === 0 || !addresses.every(isPublicAddress)) throw new Error(NOT_PUBLIC);

    let response: HttpResponse;
    try {
      response = await http({ url: url.href, timeoutMs: LINKS.timeoutMs, maxBytes: LINKS.htmlCapBytes });
    } catch (error) {
      throw unreachable(error);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      if (!location) throw new Error(`http ${response.status} without a location`);
      if (redirects >= LINKS.maxRedirects) throw new Error('too many redirects');
      let next: URL | null = null;
      try {
        next = httpUrl(new URL(location, url).href);
      } catch {
        next = null;
      }
      if (next === null) throw new Error('redirect to an address that is not a web page');
      url = next;
      continue;
    }
    if (response.status < 200 || response.status >= 400) {
      const message = `http ${response.status}`;
      throw isDestination ? new Unreadable(message, url.href) : new Error(message);
    }

    if (/^\s*(image|video|audio)\//i.test(response.headers['content-type'] ?? '')) {
      return { status: 'not_resource', finalUrl: url.href };
    }
    const { title, description } = pageMetadata(response.body);
    if (title !== null && WALL_TITLES.some((pattern) => pattern.test(title))) {
      const message = `bot wall or login page: ${title}`;
      throw isDestination ? new Unreadable(message, url.href) : new Error(message);
    }
    return { status: 'resolved', finalUrl: url.href, title: title ?? normalizeHost(url.hostname), description };
  }
}

async function resolveDue(db: DatabaseSync, deps: LinkDeps, counts: LinkCounts): Promise<void> {
  const due = db
    .prepare(
      `SELECT url, expanded_url, attempts, final_url FROM links
       WHERE status = 'new' OR (status = 'failed' AND next_attempt_at <= ?)
       ORDER BY url`,
    )
    .all(deps.now().toISOString());
  const succeed = db.prepare(
    `UPDATE links SET status = ?, final_url = ?, host = ?, title = ?, description = ?, attempts = attempts + 1,
       last_attempt_at = ?, next_attempt_at = NULL, resolved_at = ?, last_error = NULL
     WHERE url = ?`,
  );
  const fail = db.prepare(
    `UPDATE links SET status = ?, attempts = ?, last_attempt_at = ?, next_attempt_at = ?, last_error = ?,
       final_url = COALESCE(?, final_url), host = COALESCE(?, host)
     WHERE url = ?`,
  );
  const settle = db.prepare(
    `UPDATE links SET status = 'resolved', final_url = ?, host = ?, title = ?, description = NULL, attempts = ?,
       last_attempt_at = ?, next_attempt_at = NULL, resolved_at = ?, last_error = ?
     WHERE url = ?`,
  );

  const resolveOne = async (row: Record<string, unknown>): Promise<void> => {
    const written = String(row.url);
    counts.attempted++;
    try {
      const start = httpUrl(row.expanded_url) ?? httpUrl(written);
      if (start === null) throw new Error('not a web address');
      const outcome = await follow(start, deps.http, deps.lookup ?? systemLookup);
      const at = deps.now().toISOString();
      const host = normalizeHost(new URL(outcome.finalUrl).hostname);
      if (outcome.status === 'resolved') {
        succeed.run('resolved', outcome.finalUrl, host, outcome.title, outcome.description, at, at, written);
        counts.resolved++;
      } else {
        succeed.run('not_resource', outcome.finalUrl, host, null, null, at, at, written);
        counts.notResource++;
      }
    } catch (error) {
      const now = deps.now();
      const attempts = Number(row.attempts) + 1;
      const givenUp = attempts >= LINKS.maxAttempts;
      const retryAt = new Date(now.getTime() + LINKS.retryBaseGapMs * 2 ** (attempts - 1)).toISOString();
      const message = errorText(error).slice(0, ERROR_MAX);
      const learned = error instanceof Unreadable ? error.finalUrl : null;
      const finalUrl = learned ?? (row.final_url as string | null);
      const host = finalUrl === null ? null : normalizeHost(new URL(finalUrl).hostname);
      if (givenUp && finalUrl !== null && host !== null && !onHost(host, LINKS.notResourceHosts)) {
        settle.run(finalUrl, host, host, attempts, now.toISOString(), now.toISOString(), message, written);
        counts.resolved++;
        return;
      }
      const learnedHost = learned === null ? null : host;
      fail.run(
        givenUp ? 'unresolved' : 'failed',
        attempts,
        now.toISOString(),
        givenUp ? null : retryAt,
        message,
        learned,
        learnedHost,
        written,
      );
      if (givenUp) counts.unresolved++;
      else counts.failed++;
    }
  };

  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < due.length) await resolveOne(due[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(LINKS.concurrency, due.length) }, worker));
}

type ResourceRow = {
  id: number;
  kind: string;
  title: string | null;
  description: string | null;
  homepage: string | null;
};

function assignResources(db: DatabaseSync, now: Date): void {
  const at = now.toISOString();
  transaction(db, () => {
    const links: { row: Record<string, unknown>; own: Canonical }[] = [];
    for (const row of db
      .prepare(
        `SELECT url, final_url, host, title, description, resource_id FROM links WHERE status = 'resolved' ORDER BY url`,
      )
      .all()) {
      const own = canonicalize(String(row.final_url));
      if (own !== null) links.push({ row, own });
    }

    const resources = new Map<string, ResourceRow>();
    for (const row of db
      .prepare(`SELECT id, canonical_key, kind, title, description, homepage_url, homepage_status FROM resources`)
      .all()) {
      resources.set(String(row.canonical_key), {
        id: Number(row.id),
        kind: String(row.kind),
        title: row.title === null ? null : String(row.title),
        description: row.description === null ? null : String(row.description),
        homepage: row.homepage_status === 'ok' && row.homepage_url !== null ? String(row.homepage_url) : null,
      });
    }

    const linkedRepos = new Set(links.filter((link) => link.own.kind === 'repo').map((link) => link.own.key));
    const declared = new Map<string, { key: string; eligible: boolean }[]>();
    for (const key of linkedRepos) {
      const homepage = resources.get(key)?.homepage;
      const claim = homepage ? homepageHost(homepage) : null;
      if (claim === null) continue;
      declared.set(claim.host, [...(declared.get(claim.host) ?? []), { key, eligible: claim.eligible }]);
    }
    const aliasFor = new Map<string, string>();
    for (const [host, claims] of declared) {
      if (claims.length === 1 && claims[0].eligible) aliasFor.set(host, claims[0].key);
    }

    const targetOf = (own: Canonical): string =>
      own.kind === 'page' ? (aliasFor.get(own.host) ?? own.key) : own.key;

    const insert = db.prepare(
      `INSERT INTO resources (canonical_key, kind, url, host, title, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const describe = db.prepare(`UPDATE resources SET title = ?, description = ? WHERE id = ?`);
    const described = new Set<string>();
    const wasRead = ({ row }: (typeof links)[number]) => row.description !== null || row.title !== row.host;
    for (const { row, own } of [...links.filter(wasRead), ...links.filter((link) => !wasRead(link))]) {
      if (described.has(own.key) || targetOf(own) !== own.key) continue;
      described.add(own.key);
      const title =
        own.kind === 'repo' || own.kind === 'package'
          ? own.key.slice(own.key.indexOf(':') + 1)
          : (row.title as string | null);
      const description = row.description as string | null;
      const existing = resources.get(own.key);
      if (existing === undefined) {
        const id = Number(insert.run(own.key, own.kind, own.url, own.host, title, description, at).lastInsertRowid);
        resources.set(own.key, { id, kind: own.kind, title, description, homepage: null });
      } else if (own.kind !== 'repo' && (existing.title !== title || existing.description !== description)) {
        describe.run(title, description, existing.id);
      }
    }

    const point = db.prepare(`UPDATE links SET resource_id = ? WHERE url = ?`);
    for (const { row, own } of links) {
      const id = resources.get(targetOf(own))?.id ?? null;
      if (row.resource_id !== id) point.run(id, String(row.url));
    }

    const wanted = new Map([...aliasFor].map(([host, key]) => [`host:${host}`, resources.get(key)!.id]));
    const dropAlias = db.prepare(`DELETE FROM resource_aliases WHERE alias_key = ?`);
    for (const row of db.prepare(`SELECT alias_key, resource_id FROM resource_aliases`).all()) {
      const key = String(row.alias_key);
      if (wanted.get(key) === Number(row.resource_id)) wanted.delete(key);
      else dropAlias.run(key);
    }
    const addAlias = db.prepare(
      `INSERT INTO resource_aliases (alias_key, resource_id, kind, created_at) VALUES (?, ?, 'homepage', ?)`,
    );
    for (const [key, id] of wanted) addAlias.run(key, id, at);

    db.exec(`DELETE FROM resources WHERE id NOT IN (SELECT resource_id FROM links WHERE resource_id IS NOT NULL)`);
  });
}

async function lookupHomepages(db: DatabaseSync, deps: LinkDeps, counts: LinkCounts): Promise<boolean> {
  const waiting = db
    .prepare(
      `SELECT id, canonical_key FROM resources
       WHERE kind = 'repo' AND (homepage_status IS NULL OR homepage_status = 'pending') ORDER BY id`,
    )
    .all();
  const record = db.prepare(
    `UPDATE resources SET homepage_status = ?, homepage_url = ?, homepage_checked_at = ?,
       title = COALESCE(?, title), description = COALESCE(?, description)
     WHERE id = ?`,
  );
  let learned = false;
  for (const row of waiting) {
    const [owner, repo] = String(row.canonical_key).slice('github:'.length).split('/');
    const result = await lookupRepo(deps.http, owner, repo);
    const at = deps.now().toISOString();
    if (result.outcome === 'ok') {
      const title = plainText(result.fullName, TITLE_MAX);
      const description = plainText(result.description, DESCRIPTION_MAX);
      record.run('ok', result.homepage, at, title, description, row.id);
      counts.homepagesChecked++;
      learned = true;
    } else if (result.outcome === 'not_found') {
      record.run('not_found', null, at, null, null, row.id);
    } else {
      record.run('pending', null, at, null, null, row.id);
      if (result.outcome === 'rate_limited') break;
    }
  }
  return learned;
}

async function rereadVideos(db: DatabaseSync, deps: LinkDeps, counts: LinkCounts): Promise<void> {
  const stale = db
    .prepare(`SELECT url, final_url FROM links WHERE status = 'resolved' AND title = host AND attempts = 1 ORDER BY url`)
    .all()
    .flatMap((row) => {
      const watch = youtubeVideo(String(row.final_url));
      return watch === null ? [] : [{ url: String(row.url), page: new URL(String(row.final_url)), watch }];
    });
  const read = db.prepare(
    `UPDATE links SET title = ?, description = ?, attempts = attempts + 1, last_attempt_at = ?, last_error = NULL WHERE url = ?`,
  );
  const missed = db.prepare(`UPDATE links SET attempts = attempts + 1, last_attempt_at = ?, last_error = ? WHERE url = ?`);
  for (const { url, page, watch } of stale) {
    counts.attempted++;
    const at = deps.now().toISOString();
    try {
      const outcome = await readVideo(page, watch, deps.http);
      if (outcome.status !== 'resolved') continue;
      read.run(outcome.title, outcome.description, at, url);
      counts.resolved++;
    } catch (error) {
      missed.run(at, errorText(error).slice(0, ERROR_MAX), url);
    }
  }
}

export async function resolveLinks(db: DatabaseSync, deps: LinkDeps): Promise<LinkCounts> {
  const counts: LinkCounts = {
    attempted: 0,
    resolved: 0,
    notResource: 0,
    failed: 0,
    unresolved: 0,
    resources: 0,
    homepagesChecked: 0,
    homepagesPending: 0,
    aliases: 0,
  };
  await resolveDue(db, deps, counts);
  await rereadVideos(db, deps, counts);
  assignResources(db, deps.now());
  if (await lookupHomepages(db, deps, counts)) assignResources(db, deps.now());

  const count = (sql: string): number => Number(db.prepare(sql).get()?.n);
  counts.resources = count(`SELECT COUNT(*) AS n FROM resources`);
  counts.aliases = count(`SELECT COUNT(*) AS n FROM resource_aliases`);
  counts.homepagesPending = count(
    `SELECT COUNT(*) AS n FROM resources
     WHERE kind = 'repo' AND (homepage_status IS NULL OR homepage_status = 'pending')`,
  );
  return counts;
}
