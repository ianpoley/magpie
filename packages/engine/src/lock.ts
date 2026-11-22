import { execFileSync } from 'node:child_process';
import { linkSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type LockAttempt = { held: true; release: () => void } | { held: false; pid: number };

type LockRecord = { pid: number; boot: string | null; started: string | null };

const TAKEOVER_ATTEMPTS = 3;

let thisBoot: string | null | undefined;
let thisStart: string | null | undefined;

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

function startTime(pid: number): string | null {
  try {
    if (process.platform === 'darwin') {
      const out = execFileSync('/bin/ps', ['-o', 'lstart=', '-p', String(pid)], {
        encoding: 'utf8',
        timeout: 5_000,
        env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' },
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return out.trim() || null;
    }
    if (process.platform === 'linux') {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

function ownStartTime(): string | null {
  if (thisStart === undefined) thisStart = startTime(process.pid);
  return thisStart;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function parseRecord(text: string | null): LockRecord | null {
  if (text === null) return null;
  try {
    const record = JSON.parse(text) as Partial<LockRecord>;
    if (!Number.isInteger(record.pid) || (record.pid as number) <= 0) return null;
    return {
      pid: record.pid as number,
      boot: typeof record.boot === 'string' ? record.boot : null,
      started: typeof record.started === 'string' ? record.started : null,
    };
  } catch {
    return null;
  }
}

const readRecord = (path: string): LockRecord | null => parseRecord(readText(path));

function holderOf(record: LockRecord | null): number | null {
  if (record === null || record.pid === process.pid) return null;
  const boot = bootIdentity();
  if (record.boot !== null && boot !== null && record.boot !== boot) return null;
  if (!isAlive(record.pid)) return null;
  if (record.started === null) return record.pid;
  const started = startTime(record.pid);
  return started !== null && started !== record.started ? null : record.pid;
}

export function lockHolder(path: string): number | null {
  return holderOf(readRecord(path));
}

function setAsideStale(path: string, stale: string): void {
  const aside = `${path}.${process.pid}.stale`;
  try {
    renameSync(path, aside);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  try {
    if (readText(aside) !== stale) linkSync(aside, path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  } finally {
    rmSync(aside, { force: true });
  }
}

export function acquireLock(path: string): LockAttempt {
  mkdirSync(dirname(path), { recursive: true });
  const draft = `${path}.${process.pid}.tmp`;
  writeFileSync(draft, `${JSON.stringify({ pid: process.pid, boot: bootIdentity(), started: ownStartTime() })}\n`);
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        linkSync(draft, path);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const text = readText(path);
        const holder = holderOf(parseRecord(text));
        if (holder !== null) return { held: false, pid: holder };
        if (attempt >= TAKEOVER_ATTEMPTS) throw error;
        if (text !== null) setAsideStale(path, text);
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
