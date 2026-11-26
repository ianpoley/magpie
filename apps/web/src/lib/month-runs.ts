import type { FilterState, Post } from "./types.ts";

const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export type Run = { key: string; label: string | null; year: number | null; count: number; offset: number; possible: boolean; posts: Post[] };

const LIKE_FLOORS = [1_000_000, 500_000, 200_000, 100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500, 200];
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact" });

const likeTier = (likes: number): string => {
  const floor = LIKE_FLOORS.find((step) => likes >= step);
  return floor === undefined ? `Under ${COMPACT.format(LIKE_FLOORS.at(-1)!)} likes` : `${COMPACT.format(floor)}+ likes`;
};

export function monthRuns(posts: Post[], shown: number, unsureStart: number | null, filter: FilterState, ranked: boolean, first = 0): Run[] {
  const dated = !ranked && filter.sort !== "most_liked";
  const keyOf = (post: Post, index: number) => {
    const ms = filter.sort === "added" ? (post.addedAtMs ?? post.createdAtMs) : post.createdAtMs;
    const label = ranked ? null : !dated ? likeTier(post.likeCount) : ms === null ? "Undated" : MONTH.format(ms);
    const possible = unsureStart !== null && index >= unsureStart;
    const year = !dated || ms === null ? null : new Date(ms).getUTCFullYear();
    return { key: `${possible ? "p" : "c"}:${label}`, label, year, possible };
  };
  const counts = new Map<string, number>();
  posts.forEach((post, index) => {
    const { key } = keyOf(post, index);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const before = (key: string) => {
    let offset = 0;
    while (first - offset - 1 >= 0 && keyOf(posts[first - offset - 1], first - offset - 1).key === key) offset++;
    return offset;
  };
  const runs: Run[] = [];
  posts.slice(first, shown).forEach((post, at) => {
    const index = first + at;
    const { key, label, year, possible } = keyOf(post, index);
    const last = runs.at(-1);
    if (last?.key === key) last.posts.push(post);
    else runs.push({ key, label, year, count: counts.get(key) ?? 0, offset: runs.length === 0 ? before(key) : 0, possible, posts: [post] });
  });
  return runs;
}
