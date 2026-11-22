import type { ClaudeAdapter } from './claude/cli.ts';
import { runDiscovery } from './claude/discovery.ts';
import type { Paths } from './config.ts';
import { evolve } from './evolve/evolve.ts';
import { readFocus } from './focus/setting.ts';
import { ingest } from './ingest.ts';
import type { JevClient } from './jev/client.ts';
import { scorePairs, tagPosts } from './jev/tagger.ts';
import type { TagResult } from './jev/tagger.ts';
import type { HttpFetch } from './links/http.ts';
import { resolveLinks } from './links/resolve.ts';
import type { HostLookup } from './links/resolve.ts';
import type { Store } from './store/db.ts';
import { syncBands } from './store/membership.ts';
import { MESSAGE_MAX_CHARS, errorText } from './util.ts';

export type ExportFiles = {
  bookmarksExport: string;
  likesExport: string;
};

export type PipelineFiles = ExportFiles & Pick<Paths, 'categoryFocus' | 'store'>;

const WAITING_FOR_FOCUS = 'Waiting for the category focus choice in setup.';

export type PipelineDeps = {
  http: HttpFetch;
  lookup?: HostLookup;
  jev: JevClient;
  claude: ClaudeAdapter;
};

export type PipelineOptions = {
  limitPosts?: number;
  skipEvolve?: boolean;
  skipLinks?: boolean;
};

export type StageName =
  | 'x_auth'
  | 'x_bookmarks'
  | 'x_likes'
  | 'export'
  | 'markdown'
  | 'ingest'
  | 'links'
  | 'tag'
  | 'discovery'
  | 'evolve'
  | 'retag';

export type StageOutcome = 'ok' | 'warning' | 'failed' | 'skipped';

export type StageReason = 'secret_store_unreadable';

export type StageReport = {
  stage: StageName;
  outcome: StageOutcome;
  counts: Record<string, unknown>;
  message: string | null;
  reason?: StageReason;
};

export type UpstreamSync = 'ok' | 'failed' | 'unknown';

export type Upstream = { result: UpstreamSync; detail: string | null };

export type PipelineResult = { runId: number; upstreamSync: UpstreamSync; stages: StageReport[] };

export type StageBody = Omit<StageReport, 'stage' | 'message'> & { message?: string | null };

export type OpenRun = {
  db: Store;
  id: number;
  now: () => Date;
  stages: StageReport[];
  stage: (name: StageName, work: () => Promise<StageBody | null> | StageBody | null) => Promise<void>;
};

export function startRun(db: Store, now: () => Date = () => new Date()): OpenRun {
  const stamp = (): string => now().toISOString();
  db.prepare(
    `UPDATE runs SET status = 'failed', finished_at = ?, message = 'The run was interrupted.' WHERE status = 'running'`,
  ).run(stamp());
  const id = Number(db.prepare(`INSERT INTO runs (started_at) VALUES (?)`).run(stamp()).lastInsertRowid);

  const stages: StageReport[] = [];
  const record = db.prepare(
    `INSERT INTO run_stages (run_id, stage, outcome, counts_json, message, reason, started_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const stage: OpenRun['stage'] = async (name, work) => {
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
      ...(body.reason ? { reason: body.reason } : {}),
    };
    stages.push(report);
    record.run(id, name, report.outcome, JSON.stringify(report.counts), report.message, report.reason ?? null, startedAt, stamp());
  };
  return { db, id, now, stages, stage };
}

export async function runPipeline(
  run: OpenRun,
  upstream: Upstream,
  files: PipelineFiles,
  deps: PipelineDeps,
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  const { db, id: runId, now, stage, stages } = run;
  const stamp = (): string => now().toISOString();
  db.prepare(`UPDATE runs SET upstream_sync = ?, upstream_sync_detail = ? WHERE id = ?`).run(
    upstream.result,
    upstream.detail,
    runId,
  );
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
    const { chosen, ...focus } = readFocus(files);
    if (!chosen) {
      await stage('discovery', () => skipped(WAITING_FOR_FOCUS));
      await stage('evolve', () => skipped(WAITING_FOR_FOCUS));
    } else {
      await stage('discovery', async () => {
        const result = await runDiscovery(db, { claude: deps.claude, focus, runId });
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
          const { skipped: stopped, ...counts } = await evolve(db, { claude: deps.claude, jev: deps.jev, focus, runId, now });
          topicsCreated = counts.newTopics + counts.splits > 0;
          return {
            outcome: stopped ? 'warning' : 'ok',
            counts,
            message: stopped && `Stopped early, ${stopped.reason} could not be reached: ${stopped.message}`,
          };
        });
      }
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
  return { runId, upstreamSync: upstream.result, stages };
}
