export type ResourceKind = 'repo' | 'package' | 'video' | 'page';

export type Canonical = {
  key: string;
  kind: ResourceKind;
  /** The address to show and open for the resource. */
  url: string;
  /** Lowercase, without `www.`. */
  host: string;
};

const TRACKING_PARAM = /^(utm_.+|fbclid|gclid|gclsrc|dclid|msclkid|mc_cid|mc_eid|igshid|si|ref|ref_src|ref_url)$/i;

/** First path segments on github.com that are site pages, not account names. */
const GITHUB_SITE_PAGES = new Set([
  'about', 'account', 'apps', 'codespaces', 'collections', 'contact', 'copilot', 'customer-stories', 'enterprise',
  'events', 'explore', 'features', 'issues', 'join', 'login', 'marketplace', 'mobile', 'new', 'notifications',
  'organizations', 'orgs', 'pricing', 'pulls', 'readme', 'resources', 'search', 'security', 'settings', 'site',
  'solutions', 'sponsors', 'team', 'topics', 'trending', 'users',
]);

const YOUTUBE_ID = /^[\w-]{6,}$/;

export function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

function parse(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null;
  } catch {
    return null;
  }
}

function youtubeId(host: string, segments: string[], parsed: URL): string | null {
  let id: string | null = null;
  if (host === 'youtu.be') id = segments[0] ?? null;
  else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (segments[0] === 'watch') id = parsed.searchParams.get('v');
    else if (['shorts', 'live', 'embed', 'v'].includes(segments[0])) id = segments[1] ?? null;
  }
  return id !== null && YOUTUBE_ID.test(id) ? id : null;
}

/**
 * The identity of the thing a final URL points at. Two URLs with the same key
 * are the same resource. Returns null for anything that is not an http(s) URL.
 */
export function canonicalize(url: string): Canonical | null {
  const parsed = parse(url);
  if (parsed === null) return null;
  const host = normalizeHost(parsed.hostname);
  const segments = parsed.pathname.split('/').filter(Boolean);

  if (host === 'github.com' && segments.length >= 2 && !GITHUB_SITE_PAGES.has(segments[0].toLowerCase())) {
    const owner = segments[0].toLowerCase();
    const repo = segments[1].toLowerCase().replace(/\.git$/, '');
    return { key: `github:${owner}/${repo}`, kind: 'repo', url: `https://github.com/${owner}/${repo}`, host };
  }

  if (host === 'npmjs.com' && segments[0] === 'package' && segments.length >= 2) {
    const scoped = segments[1].startsWith('@') && segments.length >= 3;
    const name = (scoped ? `${segments[1]}/${segments[2]}` : segments[1]).toLowerCase();
    return { key: `npm:${name}`, kind: 'package', url: `https://www.npmjs.com/package/${name}`, host };
  }

  const video = youtubeId(host, segments, parsed);
  if (video !== null) {
    return { key: `youtube:${video}`, kind: 'video', url: `https://www.youtube.com/watch?v=${video}`, host: 'youtube.com' };
  }

  const kept = [...parsed.searchParams].filter(([name]) => !TRACKING_PARAM.test(name));
  const query = new URLSearchParams(kept);
  const shown = new URL(parsed.href);
  shown.hash = '';
  shown.search = query.toString();
  query.sort();
  const path = parsed.pathname.replace(/\/+$/, '');
  const sorted = query.toString();
  return { key: `${host}${path}${sorted ? `?${sorted}` : ''}`, kind: 'page', url: shown.href, host };
}
