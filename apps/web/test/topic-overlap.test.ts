import assert from "node:assert/strict";
import { test } from "node:test";

import { topicOverlap } from "../src/lib/topic-overlap.ts";
import { post, topic } from "./fixtures/snapshot.ts";

const motion = topic(1, 10, "Animations & Motion");
const css = topic(2, 10, "Modern CSS");
const topicsById = new Map([motion, css].map((t) => [t.id, t]));

const inMotion = (id: string) => post(id, { in: { 1: "confident" } });
const inCss = (id: string) => post(id, { in: { 2: "unsure" } });

test("names the topic that holds at least half of the listed posts", () => {
  const overlap = topicOverlap([inMotion("a"), inMotion("b"), inCss("c"), post("d")], topicsById, []);
  assert.deepEqual(overlap && { name: overlap.topic.name, count: overlap.count, of: overlap.of }, { name: "Animations & Motion", count: 2, of: 4 });
});

test("says nothing when no topic holds half, when fewer than three posts are listed, or when that topic is already shown", () => {
  assert.equal(topicOverlap([inMotion("a"), inCss("b"), post("c"), post("d"), post("e")], topicsById, []), null);
  assert.equal(topicOverlap([inMotion("a"), inMotion("b")], topicsById, []), null);
  assert.equal(topicOverlap([inMotion("a"), inMotion("b"), inMotion("c")], topicsById, [1]), null);
});
