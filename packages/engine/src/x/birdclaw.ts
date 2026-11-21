import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname } from 'node:path';

import { X_SYNC, paths, xTools } from '../config.ts';
import type { XTool } from '../config.ts';
import type { XSession } from '../secrets/store.ts';
import { MESSAGE_MAX_CHARS, errorText } from '../util.ts';

export type Collection = 'bookmarks' | 'likes';
export type SyncMode = 'backfill' | 'incremental';
export type Cookies = Partial<XSession> | null;

export type WhoamiResult =
  | { ok: true; handle: string | null }
  | { ok: false; reason: 'missing_cookies' | 'rejected' | 'transient'; message: string };

export type RunFailure = { ok: false; reason: 'missing_cookies' | 'timeout' | 'exit' | 'output'; message: string };
export type SyncResult = { ok: true } | RunFailure;
export type ExportResult = { ok: true; kept: number; dropped: number } | RunFailure;

export interface XAdapter {
  whoami(session: Cookies): Promise<WhoamiResult>;
  sync(session: Cookies, collection: Collection, mode: SyncMode): Promise<SyncResult>;
  export(session: Cookies, collection: Collection, outFile: string): Promise<ExportResult>;
}

export type BirdclawOptions = {
  env?: Record<string, string | undefined>;
  timeouts?: Partial<{ preflightMs: number; incrementalMs: number; backfillMs: number; exportMs: number }>;
};

const TRANSIENT = /ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|fetch failed|HTTP 429\b|HTTP 5\d\d\b/;
const AUTH = /HTTP 40[13]\b|"code"\s*:\s*32\b/;
const HANDLE = /^user: @([A-Za-z0-9_]+)/m;
const NUMERIC_ID = /^\d+$/;
const OUTPUT_KEEP_CHARS = 64 * 1024;

type Child = { code: number | null; timedOut: boolean; stdout: string; stderr: string; spawnError: string | null };

const pairOf = (session: Cookies): XSession | null =>
  session?.authToken && session.ct0 ? { authToken: session.authToken, ct0: session.ct0 } : null;

function clean(text: string, pair: XSession): string {
  let cleaned = text;
  for (const value of [pair.authToken, pair.ct0]) cleaned = cleaned.split(value).join('[redacted]');
  return cleaned.trim().slice(0, MESSAGE_MAX_CHARS);
}

const missingCookies = { ok: false, reason: 'missing_cookies', message: 'Both X cookies (auth_token and ct0) are needed.' } as const;

export type Birdclaw = XAdapter & {
  killActive(): void;
};

function killGroup(child: ChildProcess): void {
  try {
    if (child.pid) process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}

export function createBirdclaw(options: BirdclawOptions = {}): Birdclaw {
  const env = options.env ?? process.env;
  const timeouts = {
    preflightMs: options.timeouts?.preflightMs ?? X_SYNC.preflightTimeoutMs,
    incrementalMs: options.timeouts?.incrementalMs ?? X_SYNC.incrementalTimeoutMs,
    backfillMs: options.timeouts?.backfillMs ?? X_SYNC.backfillTimeoutMs,
    exportMs: options.timeouts?.exportMs ?? X_SYNC.exportTimeoutMs,
  };
  const active = new Set<ChildProcess>();
  let tools: ReturnType<typeof xTools> | undefined;

  function childEnv(pair: XSession, bird: XTool): Record<string, string> {
    return {
      AUTH_TOKEN: pair.authToken,
      CT0: pair.ct0,
      BIRDCLAW_BIRD_COMMAND: bird.path,
      BIRDCLAW_HOME: paths(env).birdclawHome,
      HOME: env.HOME || homedir(),
      PATH: `${dirname(process.execPath)}:${env.PATH || '/usr/bin:/bin'}`,
    };
  }

  function run(
    pair: XSession,
    tool: 'bird' | 'birdclaw',
    args: string[],
    timeoutMs: number,
    stdoutFd?: number,
  ): Promise<Child> {
    return new Promise((resolve) => {
      tools ??= xTools(env);
      const { path, pinned } = tools[tool];
      const [command, argv] = pinned ? [process.execPath, [path, ...args]] : [path, args];
      const result: Child = { code: null, timedOut: false, stdout: '', stderr: '', spawnError: null };
      const child = spawn(command, argv, {
        env: childEnv(pair, tools.bird) as NodeJS.ProcessEnv,
        stdio: ['ignore', stdoutFd ?? 'pipe', 'pipe'],
        detached: true,
      });
      active.add(child);
      const keep = (text: string) => text.slice(-OUTPUT_KEEP_CHARS);
      child.stdout?.setEncoding('utf8').on('data', (chunk: string) => (result.stdout = keep(result.stdout + chunk)));
      child.stderr?.setEncoding('utf8').on('data', (chunk: string) => (result.stderr = keep(result.stderr + chunk)));
      const timer = setTimeout(() => {
        result.timedOut = true;
        killGroup(child);
      }, timeoutMs);
      child.on('error', (error) => {
        result.spawnError = errorText(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        active.delete(child);
        result.code = code;
        resolve(result);
      });
    });
  }

  function failure(pair: XSession, child: Child, what: string, timeoutMs: number): RunFailure {
    if (child.timedOut) return { ok: false, reason: 'timeout', message: `${what} did not finish within ${timeoutMs} ms.` };
    const detail = child.spawnError ?? `${child.stderr} ${child.stdout}`;
    return { ok: false, reason: 'exit', message: clean(`${what} exited with code ${child.code}. ${detail}`, pair) };
  }

  const succeeded = (child: Child) => !child.timedOut && child.spawnError === null && child.code === 0;
  const textOf = (child: Child) => (child.timedOut ? 'timed out' : `${child.spawnError ?? ''} ${child.stderr} ${child.stdout}`);

  return {
    killActive() {
      for (const child of active) killGroup(child);
    },

    async whoami(session) {
      const pair = pairOf(session);
      if (!pair) return missingCookies;

      const who = await run(pair, 'bird', ['whoami', '--plain'], timeouts.preflightMs);
      if (succeeded(who)) return { ok: true, handle: HANDLE.exec(who.stdout)?.[1] ?? null };
      const whoText = textOf(who);
      if (who.timedOut || TRANSIENT.test(whoText)) {
        return { ok: false, reason: 'transient', message: clean(`bird whoami failed: ${whoText}`, pair) };
      }

      const probe = await run(pair, 'bird', ['bookmarks', '-n', '1', '--plain'], timeouts.preflightMs);
      if (succeeded(probe)) return { ok: true, handle: null };
      const probeText = textOf(probe);
      if (!probe.timedOut && AUTH.test(probeText)) {
        return { ok: false, reason: 'rejected', message: clean(`X rejected the cookies: ${probeText}`, pair) };
      }
      return { ok: false, reason: 'transient', message: clean(`bird could not check the cookies: ${probeText}`, pair) };
    },

    async sync(session, collection, mode) {
      const pair = pairOf(session);
      if (!pair) return missingCookies;
      const args = ['sync', collection, '--mode', 'bird', '--limit', String(X_SYNC.limit)];
      if (mode === 'backfill') args.push('--all');
      else args.push('--max-pages', String(X_SYNC.maxPages), '--early-stop');
      args.push('--refresh', '--json');
      const timeoutMs = mode === 'backfill' ? timeouts.backfillMs : timeouts.incrementalMs;

      const child = await run(pair, 'birdclaw', args, timeoutMs);
      return succeeded(child) ? { ok: true } : failure(pair, child, `birdclaw sync ${collection}`, timeoutMs);
    },

    async export(session, collection, outFile) {
      const pair = pairOf(session);
      if (!pair) return missingCookies;
      const flag = collection === 'bookmarks' ? '--bookmarked' : '--liked';
      const tmp = `${outFile}.tmp`;
      const what = `birdclaw export of ${collection}`;

      let child: Child;
      try {
        mkdirSync(dirname(outFile), { recursive: true });
        const fd = openSync(tmp, 'w');
        try {
          child = await run(pair, 'birdclaw', ['search', 'tweets', flag, '--limit', String(X_SYNC.limit), '--json'], timeouts.exportMs, fd);
        } finally {
          closeSync(fd);
        }
      } catch (error) {
        rmSync(tmp, { force: true });
        return { ok: false, reason: 'exit', message: clean(`${what} could not start: ${errorText(error)}`, pair) };
      }
      if (!succeeded(child)) {
        rmSync(tmp, { force: true });
        return failure(pair, child, what, timeouts.exportMs);
      }

      let records: unknown;
      try {
        records = JSON.parse(readFileSync(tmp, 'utf8'));
      } catch {
        records = null;
      }
      if (!Array.isArray(records)) {
        rmSync(tmp, { force: true });
        return { ok: false, reason: 'output', message: `${what} did not print a JSON array.` };
      }
      const kept = records.filter((record: { id?: unknown } | null) => NUMERIC_ID.test(String(record?.id ?? '')));
      writeFileSync(tmp, `${JSON.stringify(kept, null, 2)}\n`);
      renameSync(tmp, outFile);
      return { ok: true, kept: kept.length, dropped: records.length - kept.length };
    },
  };
}
