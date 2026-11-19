import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_FILTER,
  applyFilter,
  categoryCounts,
  mostSavedAuthors,
  postChips,
  selectTopicOnly,
  toggleArea,
  toggleAuthor,
  toggleTopic,
  toggleUnfiled,
} from "../src/lib/filter.ts";
import type { FilterState } from "../src/lib/types.ts";
import {
  AGENTS,
  AI,
  ANIMATIONS,
  AREAS,
  ELECTIONS,
  EVALS,
  FRONTEND,
  NOW,
  POLITICS,
  TOPICS,
  ids,
  post,
  snapshot,
} from "./fixtures/snapshot.ts";

const filter = (overrides: Partial<FilterState>): FilterState => ({ ...DEFAULT_FILTER, ...overrides });

const corpus = snapshot({
  areas: AREAS,
  topics: TOPICS,
  posts: [
    post("both", { in: { [EVALS]: "confident", [AGENTS]: "confident" } }),
    post("evals", { in: { [EVALS]: "confident" } }),
    post("agents", { in: { [AGENTS]: "confident" } }),
    post("anim", { in: { [ANIMATIONS]: "confident" } }),
    post("anim-evals", { in: { [ANIMATIONS]: "confident", [EVALS]: "confident" } }),
    post("politics", { in: { [ELECTIONS]: "confident" }, hidden: true }),
    post("loose"),
  ],
});

const run = (overrides: Partial<FilterState>, snap = corpus) => applyFilter(snap, filter(overrides), NOW);
const sorted = (overrides: Partial<FilterState>, snap = corpus) => ids(run(overrides, snap).posts).sort();

test("several topics show only posts in all of them", () => {
  assert.deepEqual(sorted({ topicIds: [EVALS, AGENTS] }), ["both"]);
});

test("an area shows posts in any of its topics", () => {
  assert.deepEqual(sorted({ areaIds: [AI] }), ["agents", "anim-evals", "both", "evals"]);
});

test("an area with a topic from another area needs both", () => {
  assert.deepEqual(sorted({ areaIds: [AI], topicIds: [ANIMATIONS] }), ["anim-evals"]);
});

test("an area selected with one of its own topics is the topic alone", () => {
  const result = run({ areaIds: [AI], topicIds: [EVALS] });
  assert.deepEqual(ids(result.posts).sort(), sorted({ topicIds: [EVALS] }));
  assert.deepEqual(result.state.areaIds, []);
});

test("confident posts come before unsure posts under every sort", () => {
  const snap = snapshot({
    areas: AREAS,
    topics: TOPICS,
    posts: [
      post("unsure-new", { in: { [EVALS]: "unsure" }, createdAt: "2026-06-10T00:00:00.000Z", likeCount: 900 }),
      post("sure-old", { in: { [EVALS]: "confident" }, createdAt: "2026-01-01T00:00:00.000Z", likeCount: 1 }),
      post("sure-new", { in: { [EVALS]: "confident" }, createdAt: "2026-06-01T00:00:00.000Z", likeCount: 5 }),
      post("unsure-old", { in: { [EVALS]: "unsure" }, createdAt: "2025-12-01T00:00:00.000Z", likeCount: 2 }),
    ],
  });
  const order = (sort: FilterState["sort"]) => run({ topicIds: [EVALS], sort }, snap);
  assert.deepEqual(ids(order("newest").posts), ["sure-new", "sure-old", "unsure-new", "unsure-old"]);
  assert.deepEqual(ids(order("oldest").posts), ["sure-old", "sure-new", "unsure-old", "unsure-new"]);
  assert.deepEqual(ids(order("most_liked").posts), ["sure-new", "sure-old", "unsure-new", "unsure-old"]);
  assert.equal(order("newest").unsureStart, 2);
});

test("a post unsure in one of several selected topics still matches, after the fully confident ones", () => {
  const snap = snapshot({
    areas: AREAS,
    topics: TOPICS,
    posts: [
      post("half", { in: { [EVALS]: "confident", [AGENTS]: "unsure" }, createdAt: "2026-06-10T00:00:00.000Z" }),
      post("full", { in: { [EVALS]: "confident", [AGENTS]: "confident" }, createdAt: "2026-01-01T00:00:00.000Z" }),
    ],
  });
  assert.deepEqual(ids(run({ topicIds: [EVALS, AGENTS] }, snap).posts), ["full", "half"]);
});

test("without a category selection there is no unsure tier", () => {
  assert.equal(run({}).unsureStart, null);
});

test("hidden posts stay out of Everything until revealed or their area is selected", () => {
  assert.ok(!sorted({}).includes("politics"));
  assert.deepEqual(sorted({ areaIds: [POLITICS] }), ["politics"]);
  assert.deepEqual(sorted({ topicIds: [ELECTIONS] }), ["politics"]);
  assert.ok(sorted({ revealHidden: true }).includes("politics"));
});

test("Unfiled returns posts with no confident topic", () => {
  const snap = snapshot({
    areas: AREAS,
    topics: TOPICS,
    posts: [post("filed", { in: { [EVALS]: "confident" } }), post("maybe", { in: { [EVALS]: "unsure" } }), post("none")],
  });
  assert.deepEqual(sorted({ unfiled: true }, snap), ["maybe", "none"]);
  assert.deepEqual(sorted({ topicIds: [EVALS] }, snap), ["filed", "maybe"]);
});

test("Unfiled ignores a topic selection", () => {
  const result = run({ unfiled: true, topicIds: [EVALS], areaIds: [FRONTEND] });
  assert.deepEqual(ids(result.posts), ["loose"]);
  assert.deepEqual(result.state.topicIds, []);
  assert.deepEqual(result.state.areaIds, []);
});

test("each further filter narrows the result", () => {
  const week = "2026-06-12T00:00:00.000Z";
  const old = "2025-01-01T00:00:00.000Z";
  const media = [{ type: "image", url: "https://example.com/a.png" }];
  const base = { in: { [EVALS]: "confident" as const }, liked: true, authorHandle: "ada", text: "tracing tips", createdAt: week, media };
  const snap = snapshot({
    areas: AREAS,
    topics: TOPICS,
    posts: [
      post("hit", base),
      post("other-topic", { ...base, in: { [ANIMATIONS]: "confident" } }),
      post("not-liked", { ...base, liked: false }),
      post("other-author", { ...base, authorHandle: "bob" }),
      post("other-text", { ...base, text: "nothing relevant" }),
      post("too-old", { ...base, createdAt: old }),
      post("no-media", { ...base, media: [] }),
    ],
  });
  let state = filter({});
  const count = () => applyFilter(snap, state, NOW).posts.length;
  assert.equal(count(), 7);
  state = { ...state, topicIds: [EVALS] };
  assert.equal(count(), 6);
  state = { ...state, collection: "likes" };
  assert.equal(count(), 5);
  state = { ...state, author: "Ada" };
  assert.equal(count(), 4);
  state = { ...state, keyword: "TRACING" };
  assert.equal(count(), 3);
  state = { ...state, timeRange: "week" };
  assert.equal(count(), 2);
  state = { ...state, mediaOnly: true };
  assert.deepEqual(ids(applyFilter(snap, state, NOW).posts), ["hit"]);
});

test("time ranges are a week, a month and a year back from now", () => {
  const snap = snapshot({
    posts: [
      post("d3", { createdAt: "2026-06-12T12:00:00.000Z" }),
      post("d20", { createdAt: "2026-05-26T12:00:00.000Z" }),
      post("d200", { createdAt: "2025-11-27T12:00:00.000Z" }),
      post("d500", { createdAt: "2025-01-31T12:00:00.000Z" }),
      post("undated", { createdAt: null }),
    ],
  });
  assert.deepEqual(sorted({ timeRange: "week" }, snap), ["d3"]);
  assert.deepEqual(sorted({ timeRange: "month" }, snap), ["d20", "d3"]);
  assert.deepEqual(sorted({ timeRange: "year" }, snap), ["d20", "d200", "d3"]);
  assert.equal(run({ timeRange: "all" }, snap).posts.length, 5);
});

test("bookmarks and likes collections", () => {
  const snap = snapshot({
    posts: [post("b", { bookmarked: true, liked: false }), post("l", { bookmarked: false, liked: true }), post("bl", { liked: true })],
  });
  assert.deepEqual(sorted({ collection: "bookmarks" }, snap), ["b", "bl"]);
  assert.deepEqual(sorted({ collection: "likes" }, snap), ["bl", "l"]);
});

test("a topic id the snapshot no longer has is dropped and reported; the rest applies", () => {
  const result = run({ topicIds: [EVALS, 999], areaIds: [777] });
  assert.deepEqual(result.dropped, { topicIds: [999], areaIds: [777] });
  assert.deepEqual(result.state.topicIds, [EVALS]);
  assert.deepEqual(ids(result.posts).sort(), ["anim-evals", "both", "evals"]);
});

test("hidden posts are absent from keyword results, author counts and totals until revealed", () => {
  const snap = snapshot({
    areas: AREAS,
    topics: TOPICS,
    posts: [
      post("seen", { text: "ballot design", authorHandle: "ada", authorName: "Ada" }),
      post("h1", { text: "ballot count", authorHandle: "pol", authorName: "Pol", hidden: true, in: { [ELECTIONS]: "confident" } }),
      post("h2", { text: "ballot news", authorHandle: "pol", authorName: "Pol", hidden: true, in: { [ELECTIONS]: "confident" } }),
    ],
  });
  assert.deepEqual(sorted({ keyword: "ballot" }, snap), ["seen"]);
  assert.deepEqual(sorted({ keyword: "ballot", revealHidden: true }, snap), ["h1", "h2", "seen"]);
  assert.equal(run({}, snap).posts.length, 1);
  assert.equal(run({ revealHidden: true }, snap).posts.length, 3);
  assert.deepEqual(mostSavedAuthors(snap.posts, false).map((a) => [a.handle, a.count]), [["ada", 1]]);
  assert.deepEqual(mostSavedAuthors(snap.posts, true).map((a) => [a.handle, a.count]), [["pol", 2], ["ada", 1]]);
});

test("most-saved authors are capped at ten, most saved first", () => {
  const posts = Array.from({ length: 12 }, (_, i) => i).flatMap((i) =>
    Array.from({ length: i + 1 }, (_, n) => post(`a${i}-${n}`, { authorHandle: `author${i}` })),
  );
  const top = mostSavedAuthors(posts, false);
  assert.equal(top.length, 10);
  assert.deepEqual([top[0].handle, top[0].count, top[9].handle], ["author11", 12, "author2"]);
});

test("chips are a post's confident topics, plus a selected unsure topic marked possible", () => {
  const p = post("p", { in: { [EVALS]: "confident", [AGENTS]: "unsure", [ANIMATIONS]: "unsure" } });
  assert.deepEqual(postChips(p, filter({})), [{ topicId: EVALS, possible: false }]);
  assert.deepEqual(postChips(p, filter({ topicIds: [AGENTS] })), [
    { topicId: EVALS, possible: false },
    { topicId: AGENTS, possible: true },
  ]);
});

test("selection changes", () => {
  const start = filter({ topicIds: [EVALS], areaIds: [FRONTEND], unfiled: false, keyword: "x" });
  assert.deepEqual(toggleTopic(start, AGENTS).topicIds, [EVALS, AGENTS]);
  assert.deepEqual(toggleTopic(start, EVALS).topicIds, []);
  assert.deepEqual(toggleArea(start, FRONTEND).areaIds, []);
  assert.deepEqual(toggleArea(start, AI).areaIds, [FRONTEND, AI]);

  const chip = selectTopicOnly(start, ANIMATIONS);
  assert.deepEqual([chip.topicIds, chip.areaIds, chip.unfiled, chip.keyword], [[ANIMATIONS], [], false, "x"]);

  const unfiled = toggleUnfiled(start);
  assert.deepEqual([unfiled.topicIds, unfiled.areaIds, unfiled.unfiled], [[], [], true]);
  assert.equal(toggleUnfiled(unfiled).unfiled, false);
  assert.equal(toggleTopic(unfiled, EVALS).unfiled, false);

  assert.equal(toggleAuthor(start, "ada").author, "ada");
  assert.equal(toggleAuthor(toggleAuthor(start, "ada"), "Ada").author, null);
});

test("a category's count is the number of posts selecting it alone lists, with and without hidden posts", () => {
  const snap = snapshot({
    areas: AREAS,
    topics: TOPICS,
    posts: [
      post("a", { in: { [EVALS]: "confident" } }),
      post("b", { in: { [EVALS]: "confident" } }),
      post("c", { hidden: true, in: { [EVALS]: "confident", [ELECTIONS]: "confident" } }),
      post("loose", {}),
      post("loose-hidden", { hidden: true, unfiled: true, in: { [ELECTIONS]: "unsure" } }),
    ],
  });
  const listed = (state: Partial<FilterState>) => applyFilter(snap, filter(state), NOW).posts.length;

  const off = categoryCounts(snap, false);
  assert.equal(off.topics.get(EVALS), 2);
  assert.equal(off.topics.get(EVALS), listed({ topicIds: [EVALS] }));
  assert.equal(off.areas.get(AI), listed({ areaIds: [AI] }));
  assert.equal(off.unfiled, 1);
  assert.equal(off.unfiled, listed({ unfiled: true }));

  const on = categoryCounts(snap, true);
  assert.equal(on.topics.get(EVALS), 3);
  assert.equal(on.topics.get(EVALS), listed({ topicIds: [EVALS], revealHidden: true }));
  assert.equal(on.areas.get(AI), listed({ areaIds: [AI], revealHidden: true }));
  assert.equal(on.unfiled, listed({ unfiled: true, revealHidden: true }));

  // A hidden topic and its hidden area keep their own posts: selecting either shows them.
  assert.equal(off.topics.get(ELECTIONS), 2);
  assert.equal(off.topics.get(ELECTIONS), listed({ topicIds: [ELECTIONS] }));
  assert.equal(off.areas.get(POLITICS), listed({ areaIds: [POLITICS] }));
});

test("recently added puts the posts a later sync found first, then newest within a sync", () => {
  const first = Date.parse("2026-06-01T00:00:00.000Z");
  const later = Date.parse("2026-06-10T00:00:00.000Z");
  const snap = snapshot({
    posts: [
      post("new-in-first", { createdAt: "2026-05-30T00:00:00.000Z", addedAtMs: first }),
      post("old-in-first", { createdAt: "2025-01-01T00:00:00.000Z", addedAtMs: first }),
      post("old-saved-later", { createdAt: "2024-01-01T00:00:00.000Z", addedAtMs: later }),
    ],
  });
  assert.deepEqual(ids(run({ sort: "added" }, snap).posts), ["old-saved-later", "new-in-first", "old-in-first"]);
  assert.deepEqual(ids(run({ sort: "newest" }, snap).posts), ["new-in-first", "old-in-first", "old-saved-later"]);
});
