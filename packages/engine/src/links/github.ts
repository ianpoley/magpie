import { LINKS } from '../config.ts';
import { errorText } from '../util.ts';
import { canonicalize, normalizeHost } from './canonical.ts';
import type { HttpFetch } from './http.ts';

export type RepoLookup =
  | { outcome: 'ok'; fullName: string | null; description: string | null; homepage: string | null }
  | { outcome: 'not_found' }
  | { outcome: 'rate_limited' }
  | { outcome: 'error'; message: string };

const API = 'https://api.github.com';

function homepageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const written = value.trim();
  try {
    const parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(written) ? written : `https://${written}`);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href.slice(0, 500) : null;
  } catch {
    return null;
  }
}

export async function lookupRepo(http: HttpFetch, owner: string, repo: string): Promise<RepoLookup> {
  try {
    const response = await http({
      url: `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      timeoutMs: LINKS.timeoutMs,
      maxBytes: LINKS.htmlCapBytes,
      headers: { accept: 'application/vnd.github+json' },
    });
    const outOfAllowance =
      response.headers['x-ratelimit-remaining'] === '0' || response.headers['retry-after'] !== undefined;
    if (response.status === 429 || (response.status === 403 && outOfAllowance)) return { outcome: 'rate_limited' };
    if (response.status === 404) return { outcome: 'not_found' };
    if (response.status !== 200) return { outcome: 'error', message: `http ${response.status}` };
    const data: unknown = JSON.parse(response.body);
    if (typeof data !== 'object' || data === null) return { outcome: 'error', message: 'unexpected response' };
    const fields = data as Record<string, unknown>;
    return {
      outcome: 'ok',
      fullName: typeof fields.full_name === 'string' ? fields.full_name : null,
      description: typeof fields.description === 'string' ? fields.description : null,
      homepage: homepageUrl(fields.homepage),
    };
  } catch (error) {
    return { outcome: 'error', message: errorText(error) };
  }
}

export function onHost(host: string, hosts: readonly string[]): boolean {
  return hosts.some((listed) => host === listed || host.endsWith(`.${listed}`));
}

export function homepageHost(homepage: string): { host: string; eligible: boolean } | null {
  const canonical = canonicalize(homepage);
  if (canonical === null) return null;
  const parsed = new URL(homepage);
  const host = normalizeHost(parsed.hostname);
  const eligible = canonical.kind === 'page' && parsed.pathname === '/' && host !== 'github.com' && !onHost(host, LINKS.sharedHosts);
  return { host, eligible };
}
