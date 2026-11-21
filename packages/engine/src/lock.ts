import { execFileSync } from 'node:child_process';
import { linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type LockAttempt = { held: true; release: () => void } | { held: false; pid: number };

type LockRecord = { pid: number; boot: string | null };

let thisBoot: string | null | undefined;

function bootIdentity(): string | null {
  if (thisBoot !== undefined) return thisBoot;
  try {
    if (process.platform === 'darwin') {
      const out = execFileSync('/usr/sbin/sysctl', ['-n', 'kern.bootsessionuuid'], { encoding: 'utf8', timeout: 5_000 });
      thisBoot = out.trim() || null;
    } else if (process.platform === 'linux') {
      thisBoot = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim() || null;
    } else {
      thisBoot = null;
    }
  } catch {
    thisBoot = null;
  }
  return thisBoot;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function readRecord(path: string): LockRecord | null {
  try {
    const record = JSON.parse(readFileSync(path, 'utf8')) as Partial<LockRecord>;
    if (!Number.isInteger(record.pid) || (record.pid as number) <= 0) return null;
    return { pid: record.pid as number, boot: typeof record.boot === 'string' ? record.boot : null };
  } catch {
    return null;
  }
}

export function lockHolder(path: string): number | null {
  const record = readRecord(path);
  if (record === null || record.pid === process.pid) return null;
  const boot = bootIdentity();
  if (record.boot !== null && boot !== null && record.boot !== boot) return null;
  return isAlive(record.pid) ? record.pid : null;
}

export function acquireLock(path: string): LockAttempt {
  mkdirSync(dirname(path), { recursive: true });
  const draft = `${path}.${process.pid}.tmp`;
  writeFileSync(draft, `${JSON.stringify({ pid: process.pid, boot: bootIdentity() })}\n`);
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        linkSync(draft, path);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const holder = lockHolder(path);
        if (holder !== null) return { held: false, pid: holder };
        if (attempt > 0) throw error;
        rmSync(path, { force: true });
      }
    }
  } finally {
    rmSync(draft, { force: true });
  }
  return { held: true, release: () => releaseLock(path) };
}

export function releaseLock(path: string): void {
  if (readRecord(path)?.pid === process.pid) rmSync(path, { force: true });
}
