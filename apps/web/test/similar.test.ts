import assert from "node:assert/strict";
import { test } from "node:test";

import { similarPosts } from "../src/lib/similar.ts";
import { post, resource, snapshot } from "./fixtures/snapshot.ts";

const base = post("base", { in: { 1: "confident", 2: "confident", 3: "unsure" } });
const twoTopics = post("two", { in: { 1: "confident", 2: "confident" }, createdAt: "2026-01-01T00:00:00.000Z" });
const twoTopicsNewer = post("newer", { in: { 1: "confident", 2: "confident" }, createdAt: "2026-05-01T00:00:00.000Z" });
const oneTopic = post("one", { in: { 1: "confident" } });
const sharedLink = post("link", { in: { 9: "confident" } });
const unsureOnly = post("unsure", { in: { 1: "unsure", 2: "unsure", 3: "unsure" } });
const all = [base, twoTopics, twoTopicsNewer, oneTopic, sharedLink, unsureOnly];
const snap = snapshot({ posts: all, resources: [resource(1, ["base", "link"])] });

test("posts sharing two confident topics come first, newer first on a tie", () => {
  assert.deepEqual(similarPosts(snap, base, all, 2).map((p) => p.id), ["newer", "two"]);
});

test("one confident topic in common is not enough, but a shared link plus a topic is", () => {
  const ids = similarPosts(snap, base, all, 10).map((p) => p.id);
  assert.equal(ids.includes("one"), false);
  assert.equal(ids.includes("link"), false);
  const linkAndTopic = post("link", { in: { 1: "confident" } });
  const withTopic = [base, linkAndTopic];
  assert.deepEqual(similarPosts(snapshot({ posts: withTopic, resources: [resource(1, ["base", "link"])] }), base, withTopic, 5).map((p) => p.id), ["link"]);
});

test("unsure overlaps count for less, and the post itself and posts outside the candidates never appear", () => {
  const ids = similarPosts(snap, base, all, 10).map((p) => p.id);
  assert.equal(ids.includes("base"), false);
  assert.deepEqual(ids, ["newer", "two"]);
  assert.deepEqual(similarPosts(snap, base, [base, twoTopics], 10).map((p) => p.id), ["two"]);
});
