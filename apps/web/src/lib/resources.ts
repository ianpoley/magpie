import type { Post, ResourceGroup, Snapshot } from "./types.ts";

/**
 * The resources the given posts link to, most-saved first. Each lists the
 * posts among `posts` that link to it, in the order given; a post with
 * several links counts under each, and a post with none appears nowhere.
 */
export function resourcesFor(snapshot: Snapshot, posts: Post[]): ResourceGroup[] {
  const rank = new Map(posts.map((post, index) => [post.id, index]));
  const groups: ResourceGroup[] = [];
  for (const resource of snapshot.resources) {
    const indexes = resource.postIds.flatMap((id) => rank.get(id) ?? []);
    if (indexes.length === 0) continue;
    indexes.sort((a, b) => a - b);
    groups.push({ resource, posts: indexes.map((index) => posts[index]) });
  }
  return groups.sort((a, b) => b.posts.length - a.posts.length || a.resource.id - b.resource.id);
}
