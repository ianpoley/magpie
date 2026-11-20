import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname } from 'node:path';

import { X_SYNC, paths, xTools } from '../config.ts';
import type { XTool } from '../config.ts';
import type { XSession } from '../secrets/store.ts';
import { MESSAGE_MAX_CHARS, errorText } from '../util.ts';

export type Collection = 'bookmarks' | 'likes';
/** `backfill` pulls a collection's whole history; `incremental` stops at posts already stored. */
export type SyncMode = 'backfill' | 'incremental';
/** The cookie pair as read or pasted; either half may be missing. */
export type Cookies = Partial<XSession> | null;

/**
 * The X auth check:
 *   ok               the cookies work; `handle` is null when only the bookmark probe confirmed them
 *   missing_cookies  one or both cookies are absent, so nothing ran
 *   rejected         X refused the cookies
 *   transient        a network problem, rate limit, server error or timeout: try again later
 */
export type WhoamiResult =
  | { ok: true; handle: string | null }
  | { ok: false; reason: 'missing_cookies' | 'rejected' | 'transient'; message: string };

/**
 * Why a sync or export failed:
 *   missing_cookies  one or both cookies are absent, so nothing ran
 *   timeout          the child was killed after running too long
 *   exit             the child exited nonzero or could not be started
 *   output           the export was not a JSON array
 */
export type RunFailure = { ok: false; reason: 'missing_cookies' | 'timeout' | 'exit' | 'output'; message: string };
export type SyncResult = { ok: true } | RunFailure;
/** `dropped` counts posts left out because their id is not a numeric X status id. */
export type ExportResult = { ok: true; kept: number; dropped: number } | RunFailure;

/** Talks to X through bird and the local Birdclaw database. Implemented below and by fakes in tests. */
export interface XAdapter {
  whoami(session: Cookies): Promise<WhoamiResult>;
  sync(session: Cookies, collection: Collection, mode: SyncMode): Promise<SyncResult>;
  /** Writes the collection's stored posts to `outFile`, replacing it only when the export succeeds. */
  export(session: Cookies, collection: Collection, outFile: string): Promise<ExportResult>;
}

export type BirdclawOptions = {
  /** Where tool overrides, HOME, PATH and BIRDCLAW_HOME are read from. */
  env?: Record<string, string | undefined>;
  timeouts?: Partial<{ preflightMs: number; incrementalMs: number; backfillMs: number; exportMs: number }>;
};

// A network problem, rate limit, server error: X may answer next time.
const TRANSIENT = /ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|fetch failed|HTTP 429\b|HTTP 5\d\d\b/;
// X refused the cookies: HTTP 401 or 403, or its "Could not authenticate you" error code.
const AUTH = /HTTP 40[13]\b|"code"\s*:\s*32\b/;
// bird whoami --plain prints `user: @handle (Display Name)`.
const HANDLE = /^user: @([A-Za-z0-9_]+)/m;
const NUMERIC_ID = /^\d+$/;
const OUTPUT_KEEP_CHARS = 64 * 1024;

type Child = { code: number | null; timedOut: boolean; stdout: string; stderr: string; spawnError: string | null };

const pairOf = (session: Cookies): XSession | null =>
  session?.authToken && session.ct0 ? { authToken: session.authToken, ct0: session.ct0 } : null;

/** Removes every cookie value from child output, then caps it. Cleaning first means a cap can never leave half a value. */
function clean(text: string, pair: XSession): string {
  let cleaned = text;
  for (const value of [pair.authToken, pair.ct0]) cleaned = cleaned.split(value).join('[redacted]');
  return cleaned.trim().slice(0, MESSAGE_MAX_CHARS);
}

const missingCookies = { ok: false, reason: 'missing_cookies', message: 'Both X cookies (auth_token and ct0) are needed.' } as const;

export function createBirdclaw(options: BirdclawOptions = {}): XAdapter {
  const env = options.env ?? process.env;
  const timeouts = {
    preflightMs: options.timeouts?.preflightMs ?? X_SYNC.preflightTimeoutMs,
    incrementalMs: options.timeouts?.incrementalMs ?? X_SYNC.incrementalTimeoutMs,
    backfillMs: options.timeouts?.backfillMs ?? X_SYNC.backfillTimeoutMs,
    exportMs: options.timeouts?.exportMs ?? X_SYNC.exportTimeoutMs,
  };

  // The cookies travel only in this environment, built from nothing so no
  // other secret in the parent's environment reaches the child. bird reads
  // AUTH_TOKEN and CT0 itself and never falls back to browser cookies while
  // both are set; PATH starts with this node, so the tools' `#!/usr/bin/env
  // node` lines run on the same pinned runtime.
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

  /** The single place bird and Birdclaw are spawned, and only with both cookies. */
  function run(
    pair: XSession,
    tool: 'bird' | 'birdclaw',
    args: string[],
    timeoutMs: number,
    stdoutFd?: number,
  ): Promise<Child> {
    return new Promise((resolve) => {
      const tools = xTools(env);
      const { path, pinned } = tools[tool];
      const [command, argv] = pinned ? [process.execPath, [path, ...args]] : [path, args];
      const result: Child = { code: null, timedOut: false, stdout: '', stderr: '', spawnError: null };
      // Its own process group, so a timeout also stops the bird child Birdclaw started.
      const child = spawn(command, argv, {
        env: childEnv(pair, tools.bird),
        stdio: ['ignore', stdoutFd ?? 'pipe', 'pipe'],
        detached: true,
      });
      const keep = (text: string) => text.slice(-OUTPUT_KEEP_CHARS);
      child.stdout?.setEncoding('utf8').on('data', (chunk: string) => (result.stdout = keep(result.stdout + chunk)));
      child.stderr?.setEncoding('utf8').on('data', (chunk: string) => (result.stderr = keep(result.stderr + chunk)));
      const timer = setTimeout(() => {
        result.timedOut = true;
        try {
          if (child.pid) process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }, timeoutMs);
      child.on('error', (error) => {
        result.spawnError = errorText(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
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
    async whoami(session) {
      const pair = pairOf(session);
      if (!pair) return missingCookies;

      const who = await run(pair, 'bird', ['whoami', '--plain'], timeouts.preflightMs);
      if (succeeded(who)) return { ok: true, handle: HANDLE.exec(who.stdout)?.[1] ?? null };
      const whoText = textOf(who);
      if (who.timedOut || TRANSIENT.test(whoText)) {
        return { ok: false, reason: 'transient', message: clean(`bird whoami failed: ${whoText}`, pair) };
      }

      // bird's last whoami fallback scrapes a settings page, and its error
      // hides the HTTP status before it. One page of bookmarks with the same
      // cookies settles whether X refuses them.
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
      // An empty Birdclaw database seeds demo posts with ids like `tweet_006`.
      const kept = records.filter((record: { id?: unknown } | null) => NUMERIC_ID.test(String(record?.id ?? '')));
      writeFileSync(tmp, `${JSON.stringify(kept, null, 2)}\n`);
      renameSync(tmp, outFile);
      return { ok: true, kept: kept.length, dropped: records.length - kept.length };
    },
  };
}
