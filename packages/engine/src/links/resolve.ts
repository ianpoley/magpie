import type { DatabaseSync } from 'node:sqlite';

import { LINKS } from '../config.ts';
import { transaction } from '../store/db.ts';
import { canonicalize, normalizeHost } from './canonical.ts';
import type { Canonical } from './canonical.ts';
import { homepageHost, lookupRepo, onHost } from './github.ts';
import type { HttpFetch } from './http.ts';

export type LinkDeps = {
  http: HttpFetch;
  now: () => Date;
};

export type LinkCounts = {
  /** Links tried this run: new ones and failed ones whose retry gap has passed. */
  attempted: number;
  resolved: number;
  notResource: number;
  /** Attempts that failed and will be retried. */
  failed: number;
  /** Links given up on this run after the last allowed attempt. */
  unresolved: number;
  /** Resources in the store after this run. */
  resources: number;
  /** Repos whose declared homepage was learned this run. */
  homepagesChecked: number;
  /** Repos still waiting for a homepage lookup. */
  homepagesPending: number;
  /** Hosts that stand for a repo after this run. */
  aliases: number;
};

type Outcome =
  | { status: 'resolved'; finalUrl: string; title: string; description: string | null }
  | { status: 'not_resource'; finalUrl: string };

const TITLE_MAX = 300;
const DESCRIPTION_MAX = 1000;
const ERROR_MAX = 300;

/** Titles served in place of the page: bot checks, blocks and login prompts. */
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

/** Page metadata is untrusted: keep plain, single-line, bounded text only. */
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
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes: Record<string, string> = {};
    for (const match of tag.matchAll(/([a-z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
      attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
    }
    const name = (attributes.property ?? attributes.name)?.toLowerCase();
    if (name && attributes.content !== undefined && !found.has(name)) found.set(name, attributes.content);
  }
  return found;
}

function pageMetadata(html: string): { title: string | null; description: string | null } {
  const meta = metaContents(html);
  const titleTag = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return {
    title:
      plainText(meta.get('og:title'), TITLE_MAX) ??
      plainText(meta.get('twitter:title'), TITLE_MAX) ??
      plainText(titleTag, TITLE_MAX),
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

/** Link text comes from strangers, so only addresses on the public web are requested. */
function isPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host.startsWith('[') || /^\d+(\.\d+){3}$/.test(host)) return false;
  if (!host.includes('.')) return false;
  return !onHost(host, ['localhost', 'local', 'internal', 'lan', 'home.arpa']);
}

async function follow(start: URL, http: HttpFetch): Promise<Outcome> {
  let url = start;
  for (let redirects = 0; ; redirects++) {
    if (onHost(normalizeHost(url.hostname), LINKS.notResourceHosts)) {
      return { status: 'not_resource', finalUrl: url.href };
    }
    if (!isPublicHost(url.hostname)) throw new Error('address is not on the public web');

    const response = await http({ url: url.href, timeoutMs: LINKS.timeoutMs, maxBytes: LINKS.htmlCapBytes });

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
    if (response.status < 200 || response.status >= 400) throw new Error(`http ${response.status}`);

    if (/^\s*(image|video|audio)\//i.test(response.headers['content-type'] ?? '')) {
      return { status: 'not_resource', finalUrl: url.href };
    }
    const { title, description } = pageMetadata(response.body);
    if (title !== null && WALL_TITLES.some((pattern) => pattern.test(title))) {
      throw new Error(`bot wall or login page: ${title}`);
    }
    return { status: 'resolved', finalUrl: url.href, title: title ?? normalizeHost(url.hostname), description };
  }
}

async function resolveDue(db: DatabaseSync, deps: LinkDeps, counts: LinkCounts): Promise<void> {
  const due = db
    .prepare(
      `SELECT url, expanded_url, attempts FROM links
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
    `UPDATE links SET status = ?, attempts = ?, last_attempt_at = ?, next_attempt_at = ?, last_error = ?
     WHERE url = ?`,
  );

  // Each result is one statement written as soon as it arrives, so a crash or
  // a later failure keeps every link already resolved.
  const resolveOne = async (row: Record<string, unknown>): Promise<void> => {
    const written = String(row.url);
    counts.attempted++;
    try {
      const start = httpUrl(row.expanded_url) ?? httpUrl(written);
      if (start === null) throw new Error('not a web address');
      const outcome = await follow(start, deps.http);
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
      const message = (error instanceof Error ? error.message : String(error)).slice(0, ERROR_MAX);
      fail.run(givenUp ? 'unresolved' : 'failed', attempts, now.toISOString(), givenUp ? null : retryAt, message, written);
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

/**
 * Brings every resolved link's resource, and the homepage aliases, in line
 * with what is known now. It recomputes rather than appends, because a repo's
 * homepage is usually learned after the site's own links were filed, and a
 * second repo naming the same host takes an alias away again.
 */
function assignResources(db: DatabaseSync, now: Date): void {
  const at = now.toISOString();
  transaction(db, () => {
    const links: { row: Record<string, unknown>; own: Canonical }[] = [];
    for (const row of db
      .prepare(`SELECT url, final_url, title, description, resource_id FROM links WHERE status = 'resolved' ORDER BY url`)
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
    for (const { row, own } of links) {
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
        // A repo keeps what GitHub said about it; other kinds follow their first link.
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

/** Asks GitHub for the homepage of each repo not yet answered. Returns whether anything was learned. */
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
      // The unauthenticated allowance is spent; the rest wait for a later run.
      if (result.outcome === 'rate_limited') break;
    }
  }
  return learned;
}

/**
 * The link stage of a sync. Follows every new or retry-due link to its final
 * URL, reads the page's title and description, files each resolved link under
 * a resource, and groups a library's site with the repo that declares it as
 * homepage. A link that fails is recorded and retried on a later run; nothing
 * a single link or GitHub does makes the stage throw.
 */
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
