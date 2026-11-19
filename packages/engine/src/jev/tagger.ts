import { ASK } from '../config.ts';
import { transaction } from '../store/db.ts';
import type { Store } from '../store/db.ts';
import { syncBands } from '../store/membership.ts';
import type { JevClient } from './client.ts';
import { hasSomethingToJudge, readPostContent, taggingRequest, topicQuestionId } from './questions.ts';
import type { TopicDefinition } from './questions.ts';

export type TagDeps = {
  jev: JevClient;
  now?: () => Date;
  /** Requests in flight at once. */
  concurrency?: number;
};

export type ScorePair = { postId: string; topicId: number };

export type TagResult = {
  /** Posts that needed at least one score. */
  posts: number;
  /** Posts Jev answered for. */
  scored: number;
  /** Posts with nothing to judge, stored as matching no topic without a request. */
  withoutContent: number;
  /** Posts whose request failed; they keep whatever scores they had and are tried again next run. */
  failed: number;
  /** Score rows written. */
  scores: number;
  /** Up to five distinct failure messages. */
  errors: string[];
};

const MAX_ERRORS = 5;

/**
 * Scores every visible post against every topic definition it has no current
 * score for, one request per post, storing each post's scores as its request
 * returns. Safe to run again after an interruption: only what is still
 * missing is asked.
 */
export async function tagPosts(db: Store, deps: TagDeps): Promise<TagResult> {
  syncBands(db);
  const pairs = db
    .prepare(`SELECT post_id, topic_id FROM pairs_to_score ORDER BY post_id, topic_id`)
    .all()
    .map((row) => ({ postId: String(row.post_id), topicId: Number(row.topic_id) }));
  return scorePairs(db, deps, pairs);
}

/**
 * Scores the given post and topic pairs, whatever state the topics are in,
 * replacing any score a pair already has.
 */
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
  const readTopic = db.prepare(`SELECT id, name, definition FROM topics WHERE id = ?`);
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

  const scorePost = async (postId: string, topicIds: number[]): Promise<void> => {
    const scoredAt = now().toISOString();
    const content = readPostContent(db, [postId]).get(postId);
    if (!content) return;
    result.posts += 1;

    if (!hasSomethingToJudge(content)) {
      store(postId, new Map(topicIds.map((topicId) => [topicId, 0])), scoredAt);
      result.withoutContent += 1;
      return;
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
    } catch (error) {
      result.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      if (result.errors.length < MAX_ERRORS && !result.errors.includes(message)) result.errors.push(message);
    }
  };

  const queue = [...topicIdsByPost];
  const workers = Array.from({ length: Math.max(1, deps.concurrency ?? ASK.concurrency) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) await scorePost(next[0], next[1]);
  });
  await Promise.all(workers);
  return result;
}
