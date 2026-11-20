import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Paths } from '../config.ts';
import { acquireLock } from '../lock.ts';
import { runPipeline, startRun } from '../pipeline.ts';
import type { OpenRun, PipelineDeps, PipelineOptions, PipelineResult, StageBody, Upstream } from '../pipeline.ts';
import type { SecretStore, XSession } from '../secrets/store.ts';
import { openStore } from '../store/db.ts';
import type { Store } from '../store/db.ts';
import { MESSAGE_MAX_CHARS, errorText, isRecord } from '../util.ts';
import type { Collection, XAdapter } from '../x/birdclaw.ts';
import { backfillMode, recordBackfill } from './backfill.ts';

const BUILD_MARKDOWN = fileURLToPath(new URL('../../bin/build-markdown.mjs', import.meta.url));
const STDERR_KEEP_CHARS = 4 * 1024;

export type SyncFiles = Pick<
  Paths,
  'store' | 'lock' | 'dataDir' | 'markdownDir' | 'bookmarksExport' | 'likesExport' | 'syncStatus' | 'schedulerState'
>;

export type SyncDeps = PipelineDeps & {
  x: XAdapter;
  secrets: Pick<SecretStore, 'get'>;
};

/**
 * What the X auth check found:
 *   ok             the session works; `handle` is null when X confirmed it without naming the account
 *   rejected       X refused the session
 *   transient      X, the network or the secret store could not answer: try again later
 *   not_connected  no X session is stored
 */
export type XAuthStatus = 'ok' | 'rejected' | 'transient' | 'not_connected';
export type XAuth = { status: XAuthStatus; handle: string | null; message: string | null };

export type Locked = { status: 'locked'; pid: number };

/** `xOk` is true only when both the bookmarks and the likes sync succeeded. */
export type SyncRunResult = Locked | (PipelineResult & { status: 'complete'; xOk: boolean; auth: XAuth });
export type CategorizeResult = Locked | (PipelineResult & { status: 'complete' });

const COLLECTIONS = [
  { collection: 'bookmarks', stage: 'x_bookmarks', label: 'bookmark' },
  { collection: 'likes', stage: 'x_likes', label: 'like' },
] as const;

const skipped = (message: string): StageBody => ({ outcome: 'skipped', counts: {}, message });

/** Holds the run lock, opens the store and starts the run row for `work`. */
async function underLock<T>(files: SyncFiles, deps: PipelineDeps, work: (run: OpenRun) => Promise<T>): Promise<Locked | T> {
  const lock = acquireLock(files.lock);
  if (!lock.held) return { status: 'locked', pid: lock.pid };
  let db: Store | null = null;
  try {
    db = openStore(files.store);
    return await work(startRun(db, deps.now));
  } finally {
    if (db?.isOpen) db.close();
    lock.release();
  }
}

/**
 * One whole sync: check the X session, sync bookmarks and likes, export them
 * to JSON, build the markdown, then categorize. Everything runs under the run
 * lock and is recorded in one run row, X stages first.
 *
 * Without a stored session nothing talks to X: the run records `x_auth` as
 * skipped and categorizes the exports already on disk. When the check fails,
 * neither collection is synced, but the export from the local Birdclaw
 * database still runs. A collection's sync failing fails only that stage.
 *
 * Returns `locked`, having touched nothing, while another live run holds the
 * lock. Throws when the store cannot be opened.
 */
export function runSync(files: SyncFiles, deps: SyncDeps, options: PipelineOptions = {}): Promise<SyncRunResult> {
  return underLock(files, deps, async (run) => {
    const { auth, upstream } = await xStages(run, files, deps);
    const result = await runPipeline(run, upstream, files, deps, options);
    const synced = result.stages.filter(
      (stage) => (stage.stage === 'x_bookmarks' || stage.stage === 'x_likes') && stage.outcome === 'ok',
    );
    return { status: 'complete', ...result, xOk: synced.length === 2, auth };
  });
}

/**
 * The categorize stages alone, under the same run lock. The upstream X sync
 * is read from the sync status file the legacy sync script writes.
 */
export function runCategorize(
  files: SyncFiles,
  deps: PipelineDeps,
  options: PipelineOptions = {},
): Promise<CategorizeResult> {
  return underLock(files, deps, async (run) => ({
    status: 'complete',
    ...(await runPipeline(run, readSyncStatus(files.syncStatus), files, deps, options)),
  }));
}

type AuthCheck = { auth: XAuth; session: XSession | null; body: StageBody };

async function checkAuth(deps: SyncDeps): Promise<AuthCheck> {
  const read = await deps.secrets.get('x-session');
  if (!read.ok) {
    const message = `The X session could not be read: ${read.message}`;
    return {
      auth: { status: 'transient', handle: null, message },
      session: null,
      body: { outcome: 'failed', counts: {}, message },
    };
  }
  if (read.value === null) {
    return {
      auth: { status: 'not_connected', handle: null, message: null },
      session: null,
      body: skipped('X is not connected.'),
    };
  }
  const session = read.value;
  const who = await deps.x.whoami(session);
  if (who.ok) {
    return { auth: { status: 'ok', handle: who.handle, message: null }, session, body: { outcome: 'ok', counts: { handle: who.handle } } };
  }
  const status = who.reason === 'missing_cookies' ? 'not_connected' : who.reason;
  return {
    auth: { status, handle: null, message: who.message },
    session,
    body: { outcome: 'failed', counts: { reason: who.reason }, message: who.message },
  };
}

async function xStages(run: OpenRun, files: SyncFiles, deps: SyncDeps): Promise<{ auth: XAuth; upstream: Upstream }> {
  let checked: AuthCheck | undefined;
  await run.stage('x_auth', async () => (checked = await checkAuth(deps)).body);
  const auth: XAuth = checked?.auth ?? { status: 'transient', handle: null, message: run.stages.at(-1)?.message ?? null };
  const session = checked?.session ?? null;

  if (auth.status === 'not_connected') {
    await markdownStage(run, files);
    return { auth, upstream: { result: 'unknown', detail: 'X is not connected.' } };
  }

  for (const { collection, stage } of COLLECTIONS) {
    await run.stage(stage, async () => {
      if (auth.status !== 'ok' || session === null) return skipped('Skipped because the X auth check failed.');
      const mode = backfillMode(files.schedulerState, collection, run.now());
      const result = await deps.x.sync(session, collection, mode);
      if (mode === 'backfill') recordBackfill(files.schedulerState, collection, result.ok ? 'completed' : 'failed', run.now());
      return result.ok
        ? { outcome: 'ok', counts: { mode } }
        : { outcome: 'failed', counts: { mode, reason: result.reason }, message: result.message };
    });
  }
  const xReports = run.stages.filter((report) => ['x_auth', 'x_bookmarks', 'x_likes'].includes(report.stage));
  const synced = xReports.filter((report) => report.stage !== 'x_auth' && report.outcome === 'ok').length === 2;
  const failures = xReports.filter((report) => report.outcome === 'failed');
  const upstream: Upstream = synced
    ? { result: 'ok', detail: null }
    : {
        result: 'failed',
        detail: failures.map((report) => `${report.stage}: ${report.message}`).join('; ').slice(0, MESSAGE_MAX_CHARS) || null,
      };

  await run.stage('export', async () => {
    if (session === null) return skipped('Skipped because the X session could not be read.');
    const counts: Record<string, unknown> = {};
    const errors: string[] = [];
    for (const { collection } of COLLECTIONS) {
      const result = await deps.x.export(session, collection, exportFile(files, collection));
      if (result.ok) counts[collection] = { kept: result.kept, dropped: result.dropped };
      else errors.push(`${collection}: ${result.message}`);
    }
    const outcome = errors.length === 0 ? 'ok' : errors.length === COLLECTIONS.length ? 'failed' : 'warning';
    return { outcome, counts, message: errors.join('; ') };
  });
  await markdownStage(run, files);
  return { auth, upstream };
}

const exportFile = (files: SyncFiles, collection: Collection): string =>
  collection === 'bookmarks' ? files.bookmarksExport : files.likesExport;

/** Builds the browsable markdown and the normalized JSONL from each export on disk. */
function markdownStage(run: OpenRun, files: SyncFiles): Promise<void> {
  return run.stage('markdown', async () => {
    const built: string[] = [];
    const errors: string[] = [];
    for (const { collection, label } of COLLECTIONS) {
      const json = exportFile(files, collection);
      if (!existsSync(json)) continue;
      const out = join(files.markdownDir, collection);
      const jsonl = join(files.dataDir, `${collection}.normalized.jsonl`);
      const error = await buildMarkdown([json, out, label, jsonl]);
      if (error === null) built.push(collection);
      else errors.push(`${collection}: ${error}`);
    }
    if (built.length + errors.length === 0) return skipped('There is no export to build from.');
    const outcome = errors.length === 0 ? 'ok' : built.length === 0 ? 'failed' : 'warning';
    return { outcome, counts: { built: built.join(', ') }, message: errors.join('; ') };
  });
}

/** Runs `bin/build-markdown.mjs` on this node. Resolves to null on success, else why it failed. */
function buildMarkdown(args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    let stderr = '';
    const child = spawn(process.execPath, [BUILD_MARKDOWN, ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr = (stderr + chunk).slice(-STDERR_KEEP_CHARS)));
    child.on('error', (error) => resolve(`build-markdown could not start: ${errorText(error)}`));
    child.on('close', (code) =>
      resolve(code === 0 ? null : `build-markdown exited with code ${code}. ${stderr.trim()}`.trim()),
    );
  });
}

/**
 * How the X sync that ran before this went, as the legacy sync script records
 * it: one entry per collection with the exit status of its `birdclaw sync`
 * and when it ran:
 *
 *   { "bookmarks": { "exit": 0, "at": "<ISO time>" }, "likes": { "exit": 0, "at": "<ISO time>" } }
 *
 * Any nonzero exit means failed. It is ok only when both collections report
 * zero. A missing or unreadable file, or a missing collection, means unknown.
 */
function readSyncStatus(path: string): Upstream {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { result: 'unknown', detail: null };
    return { result: 'unknown', detail: errorText(error).slice(0, MESSAGE_MAX_CHARS) };
  }
  let status: unknown;
  try {
    status = JSON.parse(text);
  } catch {
    return { result: 'unknown', detail: 'The sync status file is not JSON.' };
  }
  const exits = ['bookmarks', 'likes'].map((collection) => {
    const entry = isRecord(status) ? status[collection] : undefined;
    return isRecord(entry) && typeof entry.exit === 'number' ? entry.exit : null;
  });
  const detail = JSON.stringify(status).slice(0, MESSAGE_MAX_CHARS);
  if (exits.some((exit) => exit !== null && exit !== 0)) return { result: 'failed', detail };
  return { result: exits.every((exit) => exit === 0) ? 'ok' : 'unknown', detail };
}
