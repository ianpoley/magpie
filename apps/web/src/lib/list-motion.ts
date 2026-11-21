import type { Post } from "./types.ts";

export type Ghost = { post: Post; index: number };

export type Entrance = "return" | "arrive";

const MAX_LEAVING = 3;

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

export function withGhosts(posts: Post[], ghosts: Ghost[]): Post[] {
  const listed = new Set(posts.map((post) => post.id));
  const out = [...posts];
  for (const ghost of [...ghosts].sort((a, b) => a.index - b.index)) {
    if (listed.has(ghost.post.id)) continue;
    out.splice(Math.min(ghost.index, out.length), 0, ghost.post);
  }
  return out;
}
