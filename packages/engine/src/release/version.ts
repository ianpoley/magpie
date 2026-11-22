export type Version = readonly [major: number, minor: number, patch: number];
export type Bump = 'major' | 'minor' | 'patch';

const TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
const BREAKING = /^[a-z]+(\([^)]*\))?!:|^BREAKING[ -]CHANGE:/m;
const FEATURE = /^feat(\([^)]*\))?:/;
const FIX = /^(fix|perf)(\([^)]*\))?:/;

export const FIRST_VERSION: Version = [0, 1, 0];

export function parseVersion(tag: string): Version | null {
  const match = TAG.exec(tag.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export const formatVersion = (version: Version): string => `v${version.join('.')}`;

export function isNewer(candidate: Version, current: Version): boolean {
  const differs = [0, 1, 2].find((part) => candidate[part] !== current[part]);
  return differs !== undefined && candidate[differs] > current[differs];
}

export function bumpFor(messages: string[]): Bump | null {
  if (messages.some((message) => BREAKING.test(message))) return 'major';
  if (messages.some((message) => FEATURE.test(message))) return 'minor';
  if (messages.some((message) => FIX.test(message))) return 'patch';
  return null;
}

export function nextVersion(last: Version | null, messages: string[]): Version | null {
  const bump = bumpFor(messages);
  if (bump === null) return null;
  if (last === null) return FIRST_VERSION;
  const [major, minor, patch] = last;
  if (bump === 'major' && major > 0) return [major + 1, 0, 0];
  if (bump === 'patch') return [major, minor, patch + 1];
  return [major, minor + 1, 0];
}
