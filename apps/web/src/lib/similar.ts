import type { Post, Snapshot } from "./types.ts";

const SHARED_RESOURCE = 3;
const SHARED_CONFIDENT_TOPIC = 2;
const SHARED_UNSURE_TOPIC = 1;
/** One confident topic in common is too loose to call two posts alike. */
const MIN_SCORE = 4;

/**
 * Other posts most like this one: sharing a linked resource counts most, then
 * a topic both are confidently in, then a topic either is only unsure about.
 * Posts outside `candidates` are never suggested. Ties go to the newer post.
 */
export function similarPosts(snapshot: Snapshot, post: Post, candidates: Post[], limit: number): Post[] {
  const scores = new Map<string, number>();
  const add = (id: string, points: number) => {
    if (id !== post.id) scores.set(id, (scores.get(id) ?? 0) + points);
  };
  for (const resource of snapshot.resources) {
    if (!resource.postIds.includes(post.id)) continue;
    for (const id of resource.postIds) add(id, SHARED_RESOURCE);
  }
  const bands = new Map(post.memberships.map(({ topicId, band }) => [topicId, band]));
  for (const other of candidates) {
    for (const { topicId, band } of other.memberships) {
      const mine = bands.get(topicId);
      if (mine === undefined) continue;
      add(other.id, mine === "confident" && band === "confident" ? SHARED_CONFIDENT_TOPIC : SHARED_UNSURE_TOPIC);
    }
  }
  return candidates
    .filter((other) => (scores.get(other.id) ?? 0) >= MIN_SCORE)
    .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0))
    .slice(0, limit);
}
