import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_FILTER } from "../src/lib/filter.ts";
import { monthRuns } from "../src/lib/month-runs.ts";
import { post } from "./fixtures/snapshot.ts";

const at = (id: string, iso: string, addedIso = iso) => post(id, { createdAt: iso, addedAtMs: Date.parse(addedIso) });
const posts = [at("a", "2026-11-20T00:00:00Z"), at("b", "2026-11-02T00:00:00Z", "2026-10-30T00:00:00Z"), at("c", "2026-10-15T00:00:00Z")];

test("rows group into one run per month, each counting every post of that month, not just those shown", () => {
  const runs = monthRuns(posts, 1, null, DEFAULT_FILTER, false);
  assert.deepEqual(runs.map((run) => [run.label, run.count, run.posts.length]), [["November 2026", 2, 1]]);
  assert.deepEqual(
    monthRuns(posts, 3, null, DEFAULT_FILTER, false).map((run) => run.label),
    ["November 2026", "October 2026"],
  );
});

test("sorting by when saved groups by that date instead", () => {
  const runs = monthRuns(posts, 3, null, { ...DEFAULT_FILTER, sort: "added" }, false);
  assert.deepEqual(runs.map((run) => run.posts.map((p) => p.id)), [["a"], ["b", "c"]]);
});

test("unsure matches start a run of their own, even in the same month", () => {
  const runs = monthRuns(posts, 3, 1, DEFAULT_FILTER, false);
  assert.deepEqual(runs.map((run) => [run.label, run.possible]), [["November 2026", false], ["November 2026", true], ["October 2026", true]]);
});

test("a ranked Ask has no headings, only one unlabelled run", () => {
  for (const runs of [monthRuns(posts, 3, null, { ...DEFAULT_FILTER, sort: "most_liked" }, true), monthRuns(posts, 3, null, DEFAULT_FILTER, true)]) {
    assert.deepEqual(runs.map((run) => [run.label, run.year, run.posts.length]), [[null, null, 3]]);
  }
});

test("under Most liked, posts group in 1-2-5 steps of their likes, with no year", () => {
  const liked = [1_900_000, 120_000, 100_000, 4_200, 999, 150].map((likes, i) => post(`l${i}`, { likeCount: likes }));
  const runs = monthRuns(liked, 6, null, { ...DEFAULT_FILTER, sort: "most_liked" }, false);
  assert.deepEqual(
    runs.map((run) => [run.label, run.year, run.count]),
    [["1M+ likes", null, 1], ["100K+ likes", null, 2], ["2K+ likes", null, 1], ["500+ likes", null, 1], ["Under 200 likes", null, 1]],
  );
});

test("a dated run carries its year, so dates under it can drop theirs", () => {
  assert.deepEqual(monthRuns(posts, 3, null, DEFAULT_FILTER, false).map((run) => run.year), [2026, 2026]);
});

test("a post with no date sits under Undated", () => {
  assert.equal(monthRuns([post("x", { createdAt: null })], 1, null, DEFAULT_FILTER, false)[0].label, "Undated");
});

test("a window that starts mid-month knows how many of the month's posts come before it", () => {
  const nov = [1, 2, 3, 4].map((day) => at(`n${day}`, `2026-11-2${day}T00:00:00Z`));
  const runs = monthRuns([...nov, at("o", "2026-10-15T00:00:00Z")], 5, null, DEFAULT_FILTER, false, 2);
  assert.deepEqual(runs.map((run) => [run.label, run.offset, run.count, run.posts.map((p) => p.id)]), [["November 2026", 2, 4, ["n3", "n4"]], ["October 2026", 0, 1, ["o"]]]);
});
