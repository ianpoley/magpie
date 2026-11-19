import assert from "node:assert/strict";
import { test } from "node:test";

import { highlightRanges, matchesKeyword } from "../src/lib/search.ts";
import { post } from "./fixtures/snapshot.ts";

const quoted = {
  id: "q",
  text: "Quoted words about Shaders",
  createdAt: null,
  authorHandle: "qq",
  authorName: "Quo Ted",
  authorAvatarUrl: null,
  authorAvatarHue: null,
  media: [],
};

const p = post("1", {
  text: "A note on Tracing",
  quoted,
  authorName: "Ada Lovelace",
  authorHandle: "ada_l",
  linkedPages: [{ title: "Motion Library Docs", url: null, host: null }],
});

test("matches text, quoted text, author name, handle and linked page titles, ignoring case", () => {
  for (const query of ["tracing", "SHADERS", "lovelace", "ADA_L", "motion library"]) {
    assert.equal(matchesKeyword(p, query), true, query);
  }
  assert.equal(matchesKeyword(p, "absent"), false);
});

test("an empty or blank query matches every post", () => {
  assert.equal(matchesKeyword(p, ""), true);
  assert.equal(matchesKeyword(p, "   "), true);
});

test("surrounding whitespace in the query is ignored", () => {
  assert.equal(matchesKeyword(p, "  tracing "), true);
});

test("highlight ranges index the original string", () => {
  assert.deepEqual(highlightRanges("Evals, evals and EVALS", "evals"), [[0, 5], [7, 12], [17, 22]]);
  assert.deepEqual(highlightRanges("nothing here", "evals"), []);
  assert.deepEqual(highlightRanges("anything", " "), []);
});

test("regex characters match literally", () => {
  const cpp = post("2", { text: "why c++ (and a.b) [works]" });
  assert.equal(matchesKeyword(cpp, "c++"), true);
  assert.equal(matchesKeyword(cpp, "a.b"), true);
  assert.equal(matchesKeyword(post("3", { text: "axb" }), "a.b"), false);
  assert.equal(matchesKeyword(post("4", { text: "plain" }), ".*"), false);
  assert.deepEqual(highlightRanges("why c++ (and a.b) [works]", "(and a.b)"), [[8, 12], [13, 17]]);
});

test("every word must occur, in any order and in any field", () => {
  for (const query of ["tracing note", "Shaders tracing", "ada tracing", "motion docs lovelace"]) {
    assert.equal(matchesKeyword(p, query), true, query);
  }
  assert.equal(matchesKeyword(p, "tracing absent"), false);
});

test("each word is highlighted, and a longer word wins where words overlap", () => {
  assert.deepEqual(highlightRanges("Evals for agents", "agents evals"), [[0, 5], [10, 16]]);
  assert.deepEqual(highlightRanges("evals", "eval evals"), [[0, 5]]);
});
