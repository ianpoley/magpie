import { execFileSync } from 'node:child_process';
import { linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type LockAttempt = { held: true; release: () => void } | { held: false; pid: number };

/** What the lock file holds: the owner's pid and the boot it was taken in. */
type LockRecord = { pid: number; boot: string | null };

let thisBoot: string | null | undefined;

/**
 * Names the current boot of this machine, or null when it cannot be read.
 * Both are random ids fixed for the life of a boot. The boot time is not
 * used: macOS moves it when the clock is stepped, which would make a live
 * lock look stale.
 */
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
    // EPERM: the process exists but belongs to someone else.
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

/**
 * The pid of the process running a sync, read from the lock file at `path`,
 * or null when no run is in progress. A lock counts only while its owner is
 * alive, was started in this boot, and is not this process: after a reboot,
 * or in a process that reused a dead owner's pid, the old lock is stale.
 */
export function lockHolder(path: string): number | null {
  const record = readRecord(path);
  if (record === null || record.pid === process.pid) return null;
  const boot = bootIdentity();
  if (record.boot !== null && boot !== null && record.boot !== boot) return null;
  return isAlive(record.pid) ? record.pid : null;
}

/**
 * Takes the lock file at `path` for this process, so two runs never overlap.
 * A stale lock (see `lockHolder`) is taken over; a live one is left alone
 * and reported with its owner's pid.
 */
export function acquireLock(path: string): LockAttempt {
  mkdirSync(dirname(path), { recursive: true });
  // Written whole under a private name, then linked into place: the link
  // fails when the lock exists, and a reader never sees a half-written file.
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
  return {
    held: true,
    release: () => {
      if (readRecord(path)?.pid === process.pid) rmSync(path, { force: true });
    },
  };
}
