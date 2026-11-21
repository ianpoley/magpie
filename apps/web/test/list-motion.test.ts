import assert from "node:assert/strict";
import { test } from "node:test";

import { listChanges, withGhosts } from "../src/lib/list-motion.ts";
import { post } from "./fixtures/snapshot.ts";

const [a, b, c, d, e] = ["a", "b", "c", "d", "e"].map((id) => post(id));
const ids = (posts: { id: string }[]) => posts.map((p) => p.id);

test("a removed post on screen becomes a ghost and is put back where it sat while it leaves", () => {
  const { ghosts, entrances } = listChanges([a, b, c], [a, c], 60, new Set(), false);
  assert.deepEqual(ghosts.map((g) => [g.post.id, g.index]), [["b", 1]]);
  assert.equal(entrances.size, 0);
  assert.deepEqual(ids(withGhosts([a, c], ghosts)), ["a", "b", "c"]);
});

test("a post that leaves from beyond what is shown, or many at once, does not animate", () => {
  assert.deepEqual(listChanges([a, b, c], [a, b], 2, new Set(), false).ghosts, []);
  assert.deepEqual(listChanges([a, b, c, d, e], [a], 60, new Set(), false).ghosts, []);
});

test("a removed post that comes back returns; a new one arrives only while an Ask is finding matches", () => {
  assert.equal(listChanges([a, c], [a, b, c], 60, new Set(["b"]), false).entrances.get("b"), "return");
  assert.equal(listChanges([a], [a, b], 60, new Set(), true).entrances.get("b"), "arrive");
  assert.equal(listChanges([a], [a, b], 60, new Set(), false).entrances.size, 0);
});

test("a ghost whose post is listed again is not doubled", () => {
  assert.deepEqual(ids(withGhosts([a, b, c], [{ post: b, index: 1 }])), ["a", "b", "c"]);
});
