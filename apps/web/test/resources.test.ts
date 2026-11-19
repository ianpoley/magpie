import assert from "node:assert/strict";
import { test } from "node:test";

import { resourcesFor } from "../src/lib/resources.ts";
import { ids, post, resource, snapshot } from "./fixtures/snapshot.ts";

const posts = [post("a"), post("b"), post("c"), post("d"), post("plain")];
const snap = snapshot({
  posts,
  resources: [
    resource(1, ["a"], { title: "Small" }),
    resource(2, ["a", "b", "c", "d"], { title: "Animation library" }),
    resource(3, ["c", "d"], { title: "Mid" }),
  ],
});

test("each resource is listed once, most-saved first, with its posts", () => {
  const groups = resourcesFor(snap, posts);
  assert.deepEqual(groups.map((g) => [g.resource.id, ids(g.posts)]), [
    [2, ["a", "b", "c", "d"]],
    [3, ["c", "d"]],
    [1, ["a"]],
  ]);
});

test("posts without a resource are absent", () => {
  const listed = resourcesFor(snap, posts).flatMap((g) => ids(g.posts));
  assert.ok(!listed.includes("plain"));
});

test("counts cover only the posts under the active filters", () => {
  const groups = resourcesFor(snap, [posts[2], posts[3], posts[4]]);
  assert.deepEqual(groups.map((g) => [g.resource.id, g.posts.length]), [[2, 2], [3, 2]]);
});

test("a resource's posts keep the order of the filtered list", () => {
  const groups = resourcesFor(snap, [posts[3], posts[0], posts[1]]);
  assert.deepEqual(ids(groups[0].posts), ["d", "a", "b"]);
});
