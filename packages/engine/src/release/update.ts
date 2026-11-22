import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { RELEASES } from '../config.ts';
import { builtCommitFile } from '../service/index.ts';
import { formatVersion, isNewer, parseVersion, type Version } from './version.ts';

export type Release = { version: Version; url: string };
export type UpdateStatus = { installed: string | null; latest: string; url: string };

type Git = (args: string[]) => Promise<string | null>;

const gitIn =
  (dir: string): Git =>
  (args) =>
    new Promise((resolve) => {
      execFile('git', ['-C', dir, ...args], { timeout: RELEASES.timeoutMs, encoding: 'utf8' }, (error, stdout) => resolve(error ? null : stdout.trim()));
    });

function readBuiltCommit(codeRoot: string): string | null {
  try {
    return readFileSync(builtCommitFile(codeRoot), 'utf8').trim() || null;
  } catch {
    return null;
  }
}

export async function latestRelease(fetcher: typeof fetch = fetch): Promise<Release | null> {
  try {
    const response = await fetcher(`https://api.github.com/repos/${RELEASES.repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'magpie' },
      signal: AbortSignal.timeout(RELEASES.timeoutMs),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { tag_name?: unknown; html_url?: unknown };
    const version = typeof body.tag_name === 'string' ? parseVersion(body.tag_name) : null;
    return version && typeof body.html_url === 'string' ? { version, url: body.html_url } : null;
  } catch {
    return null;
  }
}

export async function updateStatus(
  codeRoot: string,
  deps: { git?: Git; release?: () => Promise<Release | null> } = {},
): Promise<UpdateStatus | null> {
  const built = readBuiltCommit(codeRoot);
  if (built === null) return null;
  const git = deps.git ?? gitIn(codeRoot);
  const [described, release] = await Promise.all([
    git(['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', built]),
    (deps.release ?? latestRelease)(),
  ]);
  if (release === null) return null;
  if (described === null && (await git(['cat-file', '-e', `${built}^{commit}`])) === null) return null;
  const installed = described === null ? null : parseVersion(described);
  if (installed !== null && !isNewer(release.version, installed)) return null;
  return { installed: installed && formatVersion(installed), latest: formatVersion(release.version), url: release.url };
}
