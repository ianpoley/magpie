import assert from "node:assert/strict";
import { test } from "node:test";

import { aroundHit, highlightRanges, matchesKeyword } from "../src/lib/search.ts";
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

test("a phrase in quotes must occur as written, alongside any other words", () => {
  const evals = post("5", { text: "Agent skills for evals", authorName: "Ada" });
  const apart = post("6", { text: "Skills every agent needs" });
  assert.equal(matchesKeyword(evals, '"agent skills"'), true);
  assert.equal(matchesKeyword(apart, '"agent skills"'), false);
  assert.equal(matchesKeyword(apart, "agent skills"), true);
  assert.equal(matchesKeyword(evals, '“agent skills” ada'), true);
  assert.equal(matchesKeyword(evals, '"agent skills'), true);
  assert.deepEqual(highlightRanges("Agent skills for evals", '"agent skills" evals'), [[0, 12], [17, 22]]);
});

test("addresses on X itself are not searched, other addresses are", () => {
  const linking = post("7", { text: "Thread: https://x.com/otherperson/status/123 and https://github.com/acme/status-page" });
  assert.equal(matchesKeyword(linking, "otherperson"), false);
  assert.equal(matchesKeyword(linking, "acme"), true);
  assert.equal(matchesKeyword(linking, "status-page"), true);
});

test("phrase highlighting marks the query only as typed", () => {
  assert.deepEqual(highlightRanges("Coding Agent Tools", "agent tools", true), [[7, 18]]);
  assert.deepEqual(highlightRanges("Agent Skills", "agent tools", true), []);
});

test("a match past the cutoff starts the text just before it, at a word boundary", () => {
  const text = `${"lead in words ".repeat(12)}the needle is here`;
  const shown = aroundHit(text, "needle", 40, 12);
  assert.ok(shown.startsWith("…"));
  assert.ok(shown.includes("the needle is here"));
  assert.ok(!shown.startsWith("…ead"), "cuts between words");
});

test("a match before the cutoff, or no match, leaves the text whole", () => {
  assert.equal(aroundHit("the needle early", "needle", 40), "the needle early");
  assert.equal(aroundHit("nothing here", "needle", 0), "nothing here");
  assert.equal(aroundHit("anything", "", 0), "anything");
});
