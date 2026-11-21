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

test("under Most liked or a ranked Ask there are no months, only one unlabelled run", () => {
  for (const runs of [monthRuns(posts, 3, null, { ...DEFAULT_FILTER, sort: "most_liked" }, false), monthRuns(posts, 3, null, DEFAULT_FILTER, true)]) {
    assert.deepEqual(runs.map((run) => [run.label, run.posts.length]), [[null, 3]]);
  }
});

test("a post with no date sits under Undated", () => {
  assert.equal(monthRuns([post("x", { createdAt: null })], 1, null, DEFAULT_FILTER, false)[0].label, "Undated");
});
