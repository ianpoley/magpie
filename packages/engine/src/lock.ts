import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type LockAttempt = { held: true; release: () => void } | { held: false; pid: number };

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function ownerOf(path: string): number | null {
  try {
    const pid = Number.parseInt(readFileSync(path, 'utf8'), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/**
 * Takes the lock file at `path` for this process, so two runs never overlap.
 * The file holds the owner's process id. A lock whose owner is no longer
 * running is taken over; one whose owner is alive is left alone and reported
 * with that owner's pid.
 */
export function acquireLock(path: string): LockAttempt {
  mkdirSync(dirname(path), { recursive: true });
  for (let attempt = 0; ; attempt++) {
    try {
      writeFileSync(path, `${process.pid}\n`, { flag: 'wx' });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || attempt > 0) throw error;
      const owner = ownerOf(path);
      if (owner !== null && isAlive(owner)) return { held: false, pid: owner };
      rmSync(path, { force: true });
    }
  }
  return {
    held: true,
    release: () => {
      if (ownerOf(path) === process.pid) rmSync(path, { force: true });
    },
  };
}
