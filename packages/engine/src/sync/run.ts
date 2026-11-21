import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Paths } from '../config.ts';
import { acquireLock } from '../lock.ts';
import { runPipeline, startRun } from '../pipeline.ts';
import type { OpenRun, PipelineDeps, PipelineOptions, PipelineResult, StageBody, StageName, StageReport, Upstream } from '../pipeline.ts';
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

export type XAuthStatus = 'ok' | 'rejected' | 'transient' | 'not_connected';
export type XAuth = { status: XAuthStatus; handle: string | null; message: string | null };

export type Locked = { status: 'locked'; pid: number };

export type SyncRunResult = Locked | (PipelineResult & { status: 'complete'; xOk: boolean; auth: XAuth });
export type CategorizeResult = Locked | (PipelineResult & { status: 'complete' });

const COLLECTIONS = [
  { collection: 'bookmarks', stage: 'x_bookmarks', label: 'bookmark' },
  { collection: 'likes', stage: 'x_likes', label: 'like' },
] as const;

export const X_COLLECTION_STAGES: readonly StageName[] = COLLECTIONS.map((collection) => collection.stage);
const X_STAGES: readonly StageName[] = ['x_auth', ...X_COLLECTION_STAGES];

export const xFailureDetail = (stages: StageReport[]): string | null =>
  stages
    .filter((report) => X_STAGES.includes(report.stage) && report.outcome === 'failed')
    .map((report) => `${report.stage}: ${report.message}`)
    .join('; ')
    .slice(0, MESSAGE_MAX_CHARS) || null;

const skipped = (message: string): StageBody => ({ outcome: 'skipped', counts: {}, message });

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

export function runSync(files: SyncFiles, deps: SyncDeps, options: PipelineOptions = {}): Promise<SyncRunResult> {
  return underLock(files, deps, async (run) => {
    const { auth, upstream } = await xStages(run, files, deps);
    const result = await runPipeline(run, upstream, files, deps, options);
    return { status: 'complete', ...result, xOk: upstream.result === 'ok', auth };
  });
}

export function runCategorize(
  files: SyncFiles,
  deps: PipelineDeps,
  options: PipelineOptions = {},
): Promise<CategorizeResult> {
  return underLock(files, deps, async (run) => ({
    status: 'complete',
    ...(await runPipeline(run, readSyncStatus(files.syncStatus) ?? previousUpstream(run), files, deps, options)),
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
  const synced = run.stages.filter((report) => X_COLLECTION_STAGES.includes(report.stage) && report.outcome === 'ok').length === 2;
  const upstream: Upstream = synced ? { result: 'ok', detail: null } : { result: 'failed', detail: xFailureDetail(run.stages) };

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

function previousUpstream(run: OpenRun): Upstream {
  const row = run.db
    .prepare(`SELECT upstream_sync, upstream_sync_detail FROM runs WHERE id < ? ORDER BY id DESC LIMIT 1`)
    .get(run.id) as { upstream_sync: Upstream['result']; upstream_sync_detail: string | null } | undefined;
  return row ? { result: row.upstream_sync, detail: row.upstream_sync_detail } : { result: 'unknown', detail: null };
}

function readSyncStatus(path: string): Upstream | null {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
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
