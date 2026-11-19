import { readFileSync } from 'node:fs';

import type { ClaudeAdapter } from './claude/cli.ts';
import { runDiscovery } from './claude/discovery.ts';
import { evolve } from './evolve/evolve.ts';
import { ingest } from './ingest.ts';
import type { JevClient } from './jev/client.ts';
import { scorePairs, tagPosts } from './jev/tagger.ts';
import type { TagResult } from './jev/tagger.ts';
import type { HttpFetch } from './links/http.ts';
import { resolveLinks } from './links/resolve.ts';
import type { HostLookup } from './links/resolve.ts';
import { acquireLock } from './lock.ts';
import { openStore } from './store/db.ts';
import type { Store } from './store/db.ts';
import { syncBands } from './store/membership.ts';
import { MESSAGE_MAX_CHARS, errorText, isRecord } from './util.ts';

/** Every file a run touches. None has a default, so a caller always says which corpus it means. */
export type PipelineFiles = {
  store: string;
  lock: string;
  bookmarksExport: string;
  likesExport: string;
  syncStatus: string;
};

export type PipelineDeps = {
  http: HttpFetch;
  /** How link hosts are resolved before they are requested. Defaults to the system resolver. */
  lookup?: HostLookup;
  jev: JevClient;
  claude: ClaudeAdapter;
  now?: () => Date;
};

export type PipelineOptions = {
  /** At most this many posts are scored in the run, counted across both tagging passes. */
  limitPosts?: number;
  /** Leave the category list alone: no first discovery and no evolution, so no Claude call. */
  skipEvolve?: boolean;
  skipLinks?: boolean;
};

/**
 * `tag` is the pass over what the run started with; `retag` is the pass that
 * scores posts against topics the same run created. A run records `discovery`
 * while no automatic topic exists and `evolve` once one does, never both.
 */
export type StageName = 'ingest' | 'links' | 'tag' | 'discovery' | 'evolve' | 'retag';

/**
 * ok       the stage did its work
 * warning  it finished, but part of its work is left for a later run
 * failed   it did nothing useful: it threw, or no post could be scored
 * skipped  it was not attempted
 */
export type StageOutcome = 'ok' | 'warning' | 'failed' | 'skipped';

export type StageReport = {
  stage: StageName;
  outcome: StageOutcome;
  counts: Record<string, unknown>;
  message: string | null;
};

export type UpstreamSync = 'ok' | 'failed' | 'unknown';

export type PipelineResult =
  | { status: 'locked'; pid: number }
  | { status: 'complete'; runId: number; upstreamSync: UpstreamSync; stages: StageReport[] };

type StageBody = Omit<StageReport, 'stage' | 'message'> & { message?: string | null };

/**
 * How the X sync that ran before this went. The sync script writes one entry
 * per collection with the exit status of its `birdclaw sync` and when it ran:
 *
 *   { "bookmarks": { "exit": 0, "at": "<ISO time>" }, "likes": { "exit": 0, "at": "<ISO time>" } }
 *
 * Any nonzero exit means failed. It is ok only when both collections report
 * zero. A missing or unreadable file, or a missing collection, means unknown.
 */
function readSyncStatus(path: string): { result: UpstreamSync; detail: string | null } {
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

/**
 * One sync of the store: load the exports, resolve links, score posts against
 * topics, then let the category list grow (the first list when none exists,
 * new and split topics afterwards) and score posts against whatever was added.
 *
 * Each stage commits its own work and is recorded in `run_stages`. A stage
 * that fails does not stop the ones after it, with one exception: when no post
 * could be scored, the category list is left alone for that run. So the run
 * row ends `complete` whenever the run reached its end, and its message names
 * any stage that failed or warned. Only a run that was killed ends `failed`.
 *
 * Returns `locked`, having touched nothing, when another live run holds the
 * lock. Throws when the store cannot be opened.
 */
export async function runPipeline(
  files: PipelineFiles,
  deps: PipelineDeps,
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  const lock = acquireLock(files.lock);
  if (!lock.held) return { status: 'locked', pid: lock.pid };
  let db: Store | null = null;
  try {
    db = openStore(files.store);
    return await runStages(db, files, deps, options);
  } finally {
    if (db?.isOpen) db.close();
    lock.release();
  }
}

async function runStages(
  db: Store,
  files: PipelineFiles,
  deps: PipelineDeps,
  options: PipelineOptions,
): Promise<PipelineResult> {
  const now = deps.now ?? (() => new Date());
  const stamp = (): string => now().toISOString();

  // The lock is ours, so a run still marked running was killed before it could finish.
  db.prepare(
    `UPDATE runs SET status = 'failed', finished_at = ?, message = 'The run was interrupted.' WHERE status = 'running'`,
  ).run(stamp());

  const upstream = readSyncStatus(files.syncStatus);
  const runId = Number(
    db
      .prepare(`INSERT INTO runs (started_at, upstream_sync, upstream_sync_detail) VALUES (?, ?, ?)`)
      .run(stamp(), upstream.result, upstream.detail).lastInsertRowid,
  );

  const stages: StageReport[] = [];
  const record = db.prepare(
    `INSERT INTO run_stages (run_id, stage, outcome, counts_json, message, started_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  /** Runs one stage and records it. A stage that returns null did not apply and leaves no record. */
  const stage = async (name: StageName, work: () => Promise<StageBody | null> | StageBody | null): Promise<void> => {
    const startedAt = stamp();
    let body: StageBody | null;
    try {
      body = await work();
    } catch (error) {
      body = { outcome: 'failed', counts: {}, message: errorText(error) };
    }
    if (body === null) return;
    const report: StageReport = {
      stage: name,
      outcome: body.outcome,
      counts: body.counts,
      message: body.message ? body.message.slice(0, MESSAGE_MAX_CHARS) : null,
    };
    stages.push(report);
    record.run(runId, name, report.outcome, JSON.stringify(report.counts), report.message, startedAt, stamp());
  };
  const skipped = (message: string): StageBody => ({ outcome: 'skipped', counts: {}, message });

  await stage('ingest', () => ({
    outcome: 'ok',
    counts: ingest(db, { bookmarksPath: files.bookmarksExport, likesPath: files.likesExport }),
  }));

  await stage('links', async () => {
    if (options.skipLinks) return skipped('Skipped on request.');
    const counts = await resolveLinks(db, { http: deps.http, lookup: deps.lookup, now });
    return { outcome: 'ok', counts };
  });

  let postsLeft = options.limitPosts ?? Infinity;
  let taggingFailed = false;
  const tag = async (): Promise<StageBody> => {
    const tagDeps = { jev: deps.jev, now };
    let result: TagResult;
    try {
      if (postsLeft === Infinity) {
        result = await tagPosts(db, tagDeps);
      } else {
        syncBands(db);
        const pairs = db
          .prepare(
            `SELECT post_id, topic_id FROM pairs_to_score
             WHERE post_id IN (SELECT DISTINCT post_id FROM pairs_to_score ORDER BY post_id LIMIT ?)
             ORDER BY post_id, topic_id`,
          )
          .all(Math.max(0, postsLeft))
          .map((row) => ({ postId: String(row.post_id), topicId: Number(row.topic_id) }));
        postsLeft -= new Set(pairs.map((pair) => pair.postId)).size;
        result = await scorePairs(db, tagDeps, pairs);
      }
    } catch (error) {
      taggingFailed = true;
      throw error;
    }
    const { errors, ...counts } = result;
    taggingFailed = result.failed > 0 && result.scored === 0;
    return {
      outcome: taggingFailed ? 'failed' : result.failed > 0 ? 'warning' : 'ok',
      counts,
      message: errors.join('; '),
    };
  };
  await stage('tag', tag);

  let topicsExist = false;
  let topicsCreated = false;
  if (options.skipEvolve) {
    await stage('evolve', () => skipped('Skipped on request.'));
  } else if (taggingFailed) {
    await stage('evolve', () => skipped('No post could be scored, so the category list was left alone.'));
  } else {
    await stage('discovery', async () => {
      const result = await runDiscovery(db, { claude: deps.claude, runId });
      if (result.status === 'created') {
        topicsCreated = true;
        return { outcome: 'ok', counts: { areas: result.areas, topics: result.topics, posts: result.posts } };
      }
      if (result.status === 'failed') {
        return {
          outcome: 'warning',
          counts: {},
          message: `Claude gave no category list (${result.failure.reason}): ${result.failure.message}`,
        };
      }
      if (result.reason === 'no_posts') return skipped('There are no posts to categorize.');
      topicsExist = true;
      return null;
    });
    if (topicsExist) {
      await stage('evolve', async () => {
        const { skipped: stopped, ...counts } = await evolve(db, { claude: deps.claude, jev: deps.jev, runId, now });
        topicsCreated = counts.newTopics + counts.splits > 0;
        return {
          outcome: stopped ? 'warning' : 'ok',
          counts,
          message: stopped && `Stopped early, ${stopped.reason} could not be reached: ${stopped.message}`,
        };
      });
    }
  }

  if (topicsCreated) await stage('retag', tag);

  const named = (outcome: StageOutcome): string | null => {
    const names = stages.filter((report) => report.outcome === outcome).map((report) => report.stage);
    return names.length > 0 ? `${outcome}: ${names.join(', ')}` : null;
  };
  const message = [named('failed'), named('warning')].filter((part) => part !== null).join('; ') || null;
  db.prepare(`UPDATE runs SET status = 'complete', finished_at = ?, message = ? WHERE id = ?`).run(
    stamp(),
    message,
    runId,
  );
  return { status: 'complete', runId, upstreamSync: upstream.result, stages };
}
