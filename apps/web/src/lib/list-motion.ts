import type { Post } from "./types.ts";

/** A post that just left the list, kept in its old place while it animates out. `index` is where it sat. */
export type Ghost = { post: Post; index: number };

/** How a post animates in: back from an undone removal, or newly found by a running Ask. */
export type Entrance = "return" | "arrive";

/** More than this many posts leaving at once is a sync or a reload, not a removal, and nothing animates. */
const MAX_LEAVING = 3;

/**
 * What changed between two versions of the list, for its motion. Posts that
 * were on screen (`shown`) and are gone become ghosts. Posts that are new come
 * back if they were removed earlier (`removed`), or arrive while an Ask is
 * still finding matches (`arriving`). Anything else changes with no motion.
 */
export function listChanges(
  previous: Post[],
  next: Post[],
  shown: number,
  removed: ReadonlySet<string>,
  arriving: boolean,
): { ghosts: Ghost[]; entrances: Map<string, Entrance> } {
  const nextIds = new Set(next.map((post) => post.id));
  const previousIds = new Set(previous.map((post) => post.id));
  const gone = previous.slice(0, shown).flatMap((post, index) => (nextIds.has(post.id) ? [] : [{ post, index }]));
  const entrances = new Map<string, Entrance>();
  for (const post of next) {
    if (previousIds.has(post.id)) continue;
    if (removed.has(post.id)) entrances.set(post.id, "return");
    else if (arriving) entrances.set(post.id, "arrive");
  }
  return { ghosts: gone.length <= MAX_LEAVING ? gone : [], entrances };
}

/** The list with each ghost put back where it sat, unless the post is listed again. */
export function withGhosts(posts: Post[], ghosts: Ghost[]): Post[] {
  const listed = new Set(posts.map((post) => post.id));
  const out = [...posts];
  for (const ghost of [...ghosts].sort((a, b) => a.index - b.index)) {
    if (listed.has(ghost.post.id)) continue;
    out.splice(Math.min(ghost.index, out.length), 0, ghost.post);
  }
  return out;
}
