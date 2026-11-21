import { TAGGING } from '../config.ts';
import { transaction } from '../store/db.ts';
import type { Store } from '../store/db.ts';
import { syncBands } from '../store/membership.ts';
import { errorText } from '../util.ts';
import type { JevClient } from './client.ts';
import { hasSomethingToJudge, readPostContent, taggingRequest, topicQuestionId } from './questions.ts';
import type { TopicDefinition } from './questions.ts';

export type TagDeps = {
  jev: JevClient;
  now?: () => Date;
  concurrency?: number;
};

export type ScorePair = { postId: string; topicId: number };

export type TagResult = {
  posts: number;
  scored: number;
  withoutContent: number;
  failed: number;
  scores: number;
  errors: string[];
};

const MAX_ERRORS = 5;

export async function tagPosts(db: Store, deps: TagDeps): Promise<TagResult> {
  syncBands(db);
  const pairs = db
    .prepare(`SELECT post_id, topic_id FROM pairs_to_score ORDER BY post_id, topic_id`)
    .all()
    .map((row) => ({ postId: String(row.post_id), topicId: Number(row.topic_id) }));
  return scorePairs(db, deps, pairs);
}

export async function scorePairs(db: Store, deps: TagDeps, pairs: ScorePair[]): Promise<TagResult> {
  const now = deps.now ?? (() => new Date());
  const result: TagResult = { posts: 0, scored: 0, withoutContent: 0, failed: 0, scores: 0, errors: [] };

  const topicIdsByPost = new Map<string, number[]>();
  for (const { postId, topicId } of pairs) {
    const topicIds = topicIdsByPost.get(postId);
    if (topicIds) topicIds.push(topicId);
    else topicIdsByPost.set(postId, [topicId]);
  }

  const topics = new Map<number, TopicDefinition>();
  const readTopic = db.prepare(
    `SELECT id, CASE WHEN kind = 'pinned' AND query IS NOT NULL THEN query ELSE name END AS name, definition
     FROM topics WHERE id = ?`,
  );
  for (const { topicId } of pairs) {
    if (topics.has(topicId)) continue;
    const row = readTopic.get(topicId);
    if (!row) throw new Error(`Topic ${topicId} does not exist`);
    topics.set(topicId, { id: topicId, name: String(row.name), definition: String(row.definition) });
  }

  const write = db.prepare(
    `INSERT INTO scores (post_id, topic_id, probability, scored_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (post_id, topic_id) DO UPDATE SET
       probability = excluded.probability, scored_at = excluded.scored_at`,
  );
  const store = (postId: string, probabilities: Map<number, number>, scoredAt: string): void => {
    transaction(db, () => {
      for (const [topicId, probability] of probabilities) write.run(postId, topicId, probability, scoredAt);
    });
    result.scores += probabilities.size;
  };

  let failuresInARow = 0;
  let lastFailure = '';

  const scorePost = async (postId: string, topicIds: number[]): Promise<'scored' | 'failed' | 'skipped'> => {
    const scoredAt = now().toISOString();
    const content = readPostContent(db, [postId]).get(postId);
    if (!content) return 'skipped';
    result.posts += 1;

    if (!hasSomethingToJudge(content)) {
      store(postId, new Map(topicIds.map((topicId) => [topicId, 0])), scoredAt);
      result.withoutContent += 1;
      return 'skipped';
    }

    try {
      const request = taggingRequest(
        content,
        topicIds.map((topicId) => topics.get(topicId) as TopicDefinition),
      );
      const answers = await deps.jev.ask(request);
      const probabilities = new Map<number, number>();
      for (const topicId of topicIds) {
        const probability = answers[topicQuestionId(topicId)];
        if (typeof probability !== 'number' || !(probability >= 0 && probability <= 1)) {
          throw new Error(`Jev gave no probability for topic ${topicId}`);
        }
        probabilities.set(topicId, probability);
      }
      store(postId, probabilities, scoredAt);
      result.scored += 1;
      failuresInARow = 0;
      return 'scored';
    } catch (error) {
      result.failed += 1;
      failuresInARow += 1;
      const message = errorText(error);
      lastFailure = message;
      if (result.errors.length < MAX_ERRORS && !result.errors.includes(message)) result.errors.push(message);
      return 'failed';
    }
  };

  const queue = [...topicIdsByPost];
  let stopped = false;
  let probe: Promise<void> | null = null;
  const tryFarEnd = async (): Promise<void> => {
    try {
      let outcome = 'skipped';
      while (outcome === 'skipped') {
        const last = queue.pop();
        if (!last) return;
        outcome = await scorePost(last[0], last[1]);
      }
      if (outcome === 'failed' && failuresInARow > TAGGING.maxConsecutiveFailures) stopped = true;
    } finally {
      probe = null;
    }
  };
  const workers = Array.from({ length: Math.max(1, deps.concurrency ?? TAGGING.concurrency) }, async () => {
    while (!stopped) {
      if (probe || (queue.length > 0 && failuresInARow >= TAGGING.maxConsecutiveFailures)) {
        await (probe ??= tryFarEnd());
        continue;
      }
      const next = queue.shift();
      if (!next) return;
      await scorePost(next[0], next[1]);
    }
  });
  await Promise.all(workers);
  if (queue.length > 0) {
    result.posts += queue.length;
    result.failed += queue.length;
    result.errors.unshift(
      `Stopped after ${failuresInARow} posts in a row failed (${lastFailure}); ` +
        `${queue.length} posts were not tried and will be tried again next run.`,
    );
  }
  return result;
}
