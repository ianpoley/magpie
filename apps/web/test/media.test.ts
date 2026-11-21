import assert from "node:assert/strict";
import { test } from "node:test";

import { mediaKind, mediaNoun } from "../src/lib/media.ts";

const photo = { type: "image", url: "https://pbs.twimg.com/media/abc.jpg" };
const video = { type: "image", url: "https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/a.jpg" };
const amplify = { type: "image", url: "https://pbs.twimg.com/amplify_video_thumb/1/img/a.jpg" };
const gif = { type: "image", url: "https://pbs.twimg.com/tweet_video_thumb/a.jpg" };

test("a poster frame's address says whether it stands for a video or a GIF", () => {
  assert.equal(mediaKind(photo), "photo");
  assert.equal(mediaKind(video), "video");
  assert.equal(mediaKind(amplify), "video");
  assert.equal(mediaKind(gif), "gif");
  assert.equal(mediaKind({ type: "video", url: "https://example.com/a.jpg" }), "video");
});

test("media is counted the way a reader would say it, and a mixed set counts as photos", () => {
  assert.equal(mediaNoun([photo]), "Photo");
  assert.equal(mediaNoun([photo, photo, photo]), "3 photos");
  assert.equal(mediaNoun([video]), "Video");
  assert.equal(mediaNoun([gif, gif]), "2 GIFs");
  assert.equal(mediaNoun([video, photo]), "2 photos");
});
