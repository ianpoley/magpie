import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const WEB_BUILDS = ['.next-a', '.next-b'] as const;
const LEGACY_WEB_BUILD = '.next';

export const webDir = (codeRoot: string) => join(codeRoot, 'apps', 'web');
export const liveBuildFile = (codeRoot: string) => join(webDir(codeRoot), '.next-active');

export function liveWebBuild(codeRoot: string): string {
  try {
    const name = readFileSync(liveBuildFile(codeRoot), 'utf8').trim();
    return (WEB_BUILDS as readonly string[]).includes(name) ? name : LEGACY_WEB_BUILD;
  } catch {
    return LEGACY_WEB_BUILD;
  }
}

export const idleWebBuild = (codeRoot: string) => (liveWebBuild(codeRoot) === WEB_BUILDS[0] ? WEB_BUILDS[1] : WEB_BUILDS[0]);
export const builtCommitFile = (codeRoot: string) => join(webDir(codeRoot), liveWebBuild(codeRoot), 'magpie-commit');

export function readBuiltCommit(codeRoot: string): string | null {
  try {
    return readFileSync(builtCommitFile(codeRoot), 'utf8').trim() || null;
  } catch {
    return null;
  }
}

export function clearGeneratedTypes(codeRoot: string): void {
  for (const build of [LEGACY_WEB_BUILD, ...WEB_BUILDS]) {
    for (const types of [['types'], ['dev', 'types']]) rmSync(join(webDir(codeRoot), build, ...types), { recursive: true, force: true });
  }
}
