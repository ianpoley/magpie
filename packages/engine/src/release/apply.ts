import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { RELEASES } from '../config.ts';
import { lockHolder } from '../lock.ts';

export type ApplyRecord = {
  state: 'applying' | 'applied' | 'failed' | 'skipped';
  target: string;
  startedAt: string;
  finishedAt: string | null;
};

export type Checkout = {
  toplevel: string | null;
  root: string;
  branch: string | null;
  built: string | null;
  head: string | null;
};

export type LocalUpdate = { kind: 'applying'; startedAt: string } | { kind: 'failed'; log: string } | { kind: 'pending' };

export const applyFiles = (stateDir: string, logsDir: string) => ({
  record: join(stateDir, 'update.json'),
  lock: join(stateDir, 'update.lock'),
  log: join(logsDir, 'update.log'),
});

export function behindReason(checkout: Checkout): string | null {
  if (checkout.toplevel !== checkout.root) return 'this is not the main checkout';
  if (checkout.branch !== RELEASES.branch) return `the checkout is not on ${RELEASES.branch}`;
  if (checkout.built === null) return 'the services were never installed from this checkout';
  if (checkout.head === null || checkout.built === checkout.head) return 'the services already run this commit';
  return null;
}

export function hookSkipReason(hook: string, args: string[], checkout: Checkout): string | null {
  if (hook === 'post-rewrite' && args[0] !== 'rebase') return 'an amend, not a pull';
  return behindReason(checkout);
}

export function readApplyRecord(path: string): ApplyRecord | null {
  try {
    const record = JSON.parse(readFileSync(path, 'utf8')) as ApplyRecord;
    return typeof record.state === 'string' && typeof record.target === 'string' ? record : null;
  } catch {
    return null;
  }
}

export function writeApplyRecord(path: string, record: ApplyRecord): void {
  mkdirSync(dirname(path), { recursive: true });
  const draft = `${path}.${process.pid}.tmp`;
  writeFileSync(draft, `${JSON.stringify(record)}\n`);
  renameSync(draft, path);
}

export function localUpdate(
  checkout: Checkout,
  files: ReturnType<typeof applyFiles>,
  deps: { holder?: (path: string) => number | null; read?: (path: string) => ApplyRecord | null } = {},
): LocalUpdate | null {
  if (behindReason(checkout) !== null) return null;
  const record = (deps.read ?? readApplyRecord)(files.record);
  if ((deps.holder ?? lockHolder)(files.lock) !== null) return { kind: 'applying', startedAt: record?.startedAt ?? new Date().toISOString() };
  if (record?.state === 'failed' && record.target === checkout.head) return { kind: 'failed', log: files.log };
  return { kind: 'pending' };
}
