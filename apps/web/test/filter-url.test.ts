import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_FILTER, applyFilter } from "../src/lib/filter.ts";
import { linkedQuery, parseLinked, parseSelection, selectionQuery } from "../src/lib/filter-url.ts";
import { AGENTS, AI, AREAS, EVALS, FRONTEND, NOW, TOPICS, snapshot } from "./fixtures/snapshot.ts";

const fromQuery = (query: string) => parseSelection(Object.fromEntries(new URLSearchParams(query)));

test("one topic round-trips through the URL", () => {
  const query = selectionQuery({ topicIds: [12], areaIds: [], unfiled: false });
  assert.equal(query, "topics=12");
  assert.deepEqual(fromQuery(query), { topicIds: [12], areaIds: [], unfiled: false });
});

test("several topics round-trip, written in ascending order whatever order they were picked in", () => {
  const query = selectionQuery({ topicIds: [15, 12, 100], areaIds: [], unfiled: false });
  assert.equal(query, "topics=12,15,100");
  assert.deepEqual(fromQuery(query), { topicIds: [12, 15, 100], areaIds: [], unfiled: false });
});

test("an area with a topic round-trips", () => {
  const query = selectionQuery({ topicIds: [12], areaIds: [7, 3], unfiled: false });
  assert.equal(query, "topics=12&areas=3,7");
  assert.deepEqual(fromQuery(query), { topicIds: [12], areaIds: [3, 7], unfiled: false });
});

test("Unfiled round-trips", () => {
  const query = selectionQuery({ topicIds: [], areaIds: [], unfiled: true });
  assert.equal(query, "unfiled=1");
  assert.deepEqual(fromQuery(query), { topicIds: [], areaIds: [], unfiled: true });
});

test("an empty selection produces no query parameters", () => {
  assert.equal(selectionQuery({ topicIds: [], areaIds: [], unfiled: false }), "");
  assert.deepEqual(parseSelection({}), { topicIds: [], areaIds: [], unfiled: false });
});

test("Unfiled replaces a topic or area selection in both directions", () => {
  assert.equal(selectionQuery({ topicIds: [12], areaIds: [3], unfiled: true }), "unfiled=1");
  assert.deepEqual(fromQuery("unfiled=1&topics=12&areas=3"), { topicIds: [], areaIds: [], unfiled: true });
});

test("a URL naming a topic that no longer exists restores the rest of the selection and drops that id", () => {
  const corpus = snapshot({ areas: AREAS, topics: TOPICS });
  const selection = fromQuery(`topics=${EVALS},999&areas=${FRONTEND},888`);
  const result = applyFilter(corpus, { ...DEFAULT_FILTER, ...selection }, NOW);
  assert.deepEqual(result.dropped, { topicIds: [999], areaIds: [888] });
  assert.equal(selectionQuery(result.state), `topics=${EVALS}&areas=${FRONTEND}`);
});

test("a URL naming an area with one of its own topics reduces to the topic", () => {
  const corpus = snapshot({ areas: AREAS, topics: TOPICS });
  const result = applyFilter(corpus, { ...DEFAULT_FILTER, ...fromQuery(`topics=${AGENTS}&areas=${AI}`) }, NOW);
  assert.equal(selectionQuery(result.state), `topics=${AGENTS}`);
});

test("malformed ids are ignored and the well-formed ones kept", () => {
  assert.deepEqual(fromQuery("topics=abc,-4,0,7,1.5,1e3,%20,0x10,,7,3&areas=NaN"), {
    topicIds: [7, 3],
    areaIds: [],
    unfiled: false,
  });
});

test("only unfiled=1 turns Unfiled on", () => {
  assert.equal(fromQuery("unfiled=true").unfiled, false);
  assert.equal(fromQuery("unfiled=0").unfiled, false);
  assert.equal(fromQuery("unfiled=").unfiled, false);
});

test("a very long parameter is ignored and an oversized id is skipped", () => {
  const long = Array.from({ length: 5000 }, (_, index) => index + 1).join(",");
  assert.deepEqual(fromQuery(`topics=${long}&areas=3`), { topicIds: [], areaIds: [3], unfiled: false });
  assert.deepEqual(fromQuery("topics=99999999999999999999,5").topicIds, [5]);
});

test("no more than 50 ids are accepted per parameter", () => {
  const sixty = Array.from({ length: 60 }, (_, index) => index + 1);
  assert.deepEqual(fromQuery(`topics=${sixty.join(",")}`).topicIds, sixty.slice(0, 50));
});

test("a repeated parameter is read from its first value without an error", () => {
  assert.deepEqual(parseSelection({ topics: ["12,15", "9"], areas: ["3"], unfiled: ["1", "0"] }), {
    topicIds: [],
    areaIds: [],
    unfiled: true,
  });
  assert.deepEqual(parseSelection({ topics: ["12,15", "9"] }).topicIds, [12, 15]);
});

test("an author round-trips after the category selection", () => {
  const query = linkedQuery({ topicIds: [12], areaIds: [], unfiled: false, collection: "everything", author: "ada_l", keyword: "" });
  assert.equal(query, "topics=12&author=ada_l");
  assert.deepEqual(parseLinked(Object.fromEntries(new URLSearchParams(query))), { topicIds: [12], areaIds: [], unfiled: false, collection: "everything", author: "ada_l", keyword: "" });
  assert.equal(linkedQuery({ topicIds: [], areaIds: [], unfiled: false, collection: "everything", author: "ada_l", keyword: "" }), "author=ada_l");
  assert.equal(linkedQuery({ topicIds: [], areaIds: [], unfiled: false, collection: "everything", author: null, keyword: "" }), "");
});

test("an author that is not an X handle is ignored", () => {
  for (const author of ["", "has space", "a".repeat(16), "<script>", "ada&topics=1"]) {
    assert.equal(parseLinked({ author }).author, null, author);
  }
  assert.equal(parseLinked({ author: ["first_one", "second"] }).author, "first_one");
});

test("search words round-trip last, encoded, and trimmed", () => {
  const query = linkedQuery({ topicIds: [], areaIds: [3], unfiled: false, collection: "everything", author: null, keyword: "  evals & agents " });
  assert.equal(query, "areas=3&q=evals%20%26%20agents");
  assert.equal(parseLinked(Object.fromEntries(new URLSearchParams(query))).keyword, "evals & agents");
  assert.equal(parseLinked({ q: "x".repeat(500) }).keyword.length, 200);
  assert.equal(parseLinked({}).keyword, "");
});

test("Bookmarks or Likes round-trips first, and anything else means Everything", () => {
  const query = linkedQuery({ topicIds: [12], areaIds: [], unfiled: false, collection: "likes", author: null, keyword: "" });
  assert.equal(query, "collection=likes&topics=12");
  assert.equal(parseLinked(Object.fromEntries(new URLSearchParams(query))).collection, "likes");
  assert.equal(parseLinked({ collection: "bookmarks" }).collection, "bookmarks");
  for (const collection of [undefined, "", "everything", "Likes", "toString"]) {
    assert.equal(parseLinked({ collection }).collection, "everything", String(collection));
  }
});

test("long search words are cut to the same 200 characters when written as when read, without splitting an emoji", () => {
  const linked = { topicIds: [], areaIds: [], unfiled: false, collection: "everything" as const, author: null };
  const long = `${"x".repeat(199)}🐦 tail`;
  const query = linkedQuery({ ...linked, keyword: long });
  const read = parseLinked(Object.fromEntries(new URLSearchParams(query))).keyword;
  assert.equal(read, `${"x".repeat(199)}🐦`);
  assert.equal(linkedQuery({ ...linked, keyword: read }), query);
  assert.equal(parseLinked({ q: `${"y".repeat(199)} z` }).keyword, "y".repeat(199));
});
