import assert from "node:assert/strict";
import { test } from "node:test";

import { resourceName, videoStill } from "../src/lib/resources.ts";
import { post, resource } from "./fixtures/snapshot.ts";

test("a YouTube video's still comes from its watch address; anything else has none", () => {
  assert.equal(videoStill("https://www.youtube.com/watch?v=AbZODZ_4VaM"), "https://i.ytimg.com/vi/AbZODZ_4VaM/mqdefault.jpg");
  assert.equal(videoStill("https://www.youtube.com/watch?v=AbZODZ_4VaM&t=4"), null);
  assert.equal(videoStill("https://vimeo.com/123"), null);
});

test("a resource titled only by its host is named by the first saving post's words, without its links", () => {
  const video = resource(1, ["a"], { kind: "video", host: "youtube.com", title: "youtube.com" });
  assert.deepEqual(resourceName(video, [post("a", { text: "https://youtu.be/x" }), post("b", { text: "Watch this:\n https://www.youtube.com/watch?v=x now" })]), {
    text: "Watch this: now",
    fromPost: true,
  });
  assert.deepEqual(resourceName(video, [post("a", { text: "https://youtu.be/x", authorName: "Ada" })]), { text: "Shared by Ada", fromPost: false });
  assert.deepEqual(resourceName(resource(2, [], { title: "Real title" }), []), { text: "Real title", fromPost: false });
  assert.deepEqual(resourceName(video, []), { text: "youtube.com", fromPost: false });
});
