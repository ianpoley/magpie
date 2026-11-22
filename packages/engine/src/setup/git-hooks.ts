import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const UPDATE_HOOKS = ['post-merge', 'post-rewrite'] as const;
const MARKER = 'MAGPIE_UPDATE_HOOK=1';

export type UpdateHooksState = 'current' | 'outdated' | 'missing' | 'foreign';

export const hasUpdateHook = (text: string | null) => text !== null && text.includes(MARKER);

const quote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;

export const hookCommand = (hook: string, bun: string, runner: string) => `${quote(bun)} ${quote(runner)} ${hook} "$@" </dev/null || true`;

export function hookScript(hook: string, bun: string, runner: string): string {
  return ['#!/bin/sh', MARKER, `[ -x ${quote(bun)} ] && [ -f ${quote(runner)} ] || exit 0`, hookCommand(hook, bun, runner), 'exit 0', ''].join('\n');
}

function readHook(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function stateOf(text: string | null, wanted: string): UpdateHooksState {
  if (text === null) return 'missing';
  if (text === wanted) return 'current';
  return text.includes(MARKER) ? 'outdated' : 'foreign';
}

export function updateHooksState(hooksDir: string, bun: string, runner: string): UpdateHooksState {
  const states = UPDATE_HOOKS.map((hook) => stateOf(readHook(join(hooksDir, hook)), hookScript(hook, bun, runner)));
  if (states.includes('foreign')) return 'foreign';
  if (states.every((state) => state === 'current')) return 'current';
  return states.includes('missing') ? 'missing' : 'outdated';
}

export function foreignHooks(hooksDir: string): string[] {
  return UPDATE_HOOKS.filter((hook) => {
    const text = readHook(join(hooksDir, hook));
    return text !== null && !text.includes(MARKER);
  });
}

export function removeUpdateHooks(hooksDir: string): string[] {
  return UPDATE_HOOKS.filter((hook) => {
    const path = join(hooksDir, hook);
    if (!hasUpdateHook(readHook(path))) return false;
    rmSync(path);
    return true;
  });
}

export function installUpdateHooks(hooksDir: string, bun: string, runner: string): void {
  if (foreignHooks(hooksDir).length > 0) throw new Error('a git hook Magpie did not write is in the way');
  mkdirSync(hooksDir, { recursive: true });
  for (const hook of UPDATE_HOOKS) {
    const path = join(hooksDir, hook);
    writeFileSync(path, hookScript(hook, bun, runner));
    chmodSync(path, 0o755);
  }
}
