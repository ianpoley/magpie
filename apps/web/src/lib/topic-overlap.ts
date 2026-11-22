import type { Post, Topic } from "./types.ts";

export type TopicOverlap = { topic: Topic; count: number; of: number };

const MIN_POSTS = 3;

export function topicOverlap(posts: Post[], topicsById: Map<number, Topic>, shownTopicIds: number[]): TopicOverlap | null {
  if (posts.length < MIN_POSTS) return null;
  const counts = new Map<number, number>();
  for (const post of posts) {
    for (const { topicId } of post.memberships) counts.set(topicId, (counts.get(topicId) ?? 0) + 1);
  }
  let best: { topicId: number; count: number } | null = null;
  for (const [topicId, count] of counts) {
    if (best === null || count > best.count) best = { topicId, count };
  }
  if (best === null || best.count * 2 < posts.length || shownTopicIds.includes(best.topicId)) return null;
  const topic = topicsById.get(best.topicId);
  return topic ? { topic, count: best.count, of: posts.length } : null;
}
