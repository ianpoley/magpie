import type { FilterState, Post } from "./types.ts";

const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export type Run = { key: string; label: string | null; count: number; possible: boolean; posts: Post[] };

/**
 * The shown posts as runs of one month each, for the Rows layout. A new run
 * also starts where the unsure matches begin. Under Most liked, and while an
 * Ask ranks the list, months mean nothing, so there is one run with no label.
 */
export function monthRuns(posts: Post[], shown: number, unsureStart: number | null, filter: FilterState, ranked: boolean): Run[] {
  const dated = !ranked && filter.sort !== "most_liked";
  const keyOf = (post: Post, index: number) => {
    const ms = filter.sort === "added" ? post.addedAtMs : post.createdAtMs;
    const label = !dated ? null : ms === null ? "Undated" : MONTH.format(ms);
    const possible = unsureStart !== null && index >= unsureStart;
    return { key: `${possible ? "p" : "c"}:${label}`, label, possible };
  };
  const counts = new Map<string, number>();
  posts.forEach((post, index) => {
    const { key } = keyOf(post, index);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const runs: Run[] = [];
  posts.slice(0, shown).forEach((post, index) => {
    const { key, label, possible } = keyOf(post, index);
    const last = runs.at(-1);
    if (last?.key === key) last.posts.push(post);
    else runs.push({ key, label, count: counts.get(key) ?? 0, possible, posts: [post] });
  });
  return runs;
}
