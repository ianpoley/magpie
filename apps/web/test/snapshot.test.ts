import assert from "node:assert/strict";
import { test } from "node:test";

import { openStore } from "../../../packages/engine/src/store/db.ts";
import {
  seedArea,
  seedLink,
  seedOverride,
  seedPost,
  seedScore,
  seedTopic,
  tempStore,
} from "../../../packages/engine/test/fixtures/corpus.ts";
import { DEFAULT_FILTER, applyFilter } from "../src/lib/filter.ts";
import { readSnapshot } from "../src/lib/read-snapshot.ts";

const AT = "2026-01-01T00:00:00.000Z";
const shown = (snap: ReturnType<typeof readSnapshot>, overrides = {}) =>
  applyFilter(snap, { ...DEFAULT_FILTER, ...overrides }, Date.parse(AT))
    .posts.map((p) => p.id)
    .sort();

test("an empty store gives an empty snapshot", (t) => {
  const { db } = tempStore(t);
  assert.deepEqual(readSnapshot(db), {
    storeExists: true,
    posts: [],
    removed: [],
    areas: [],
    topics: [],
    resources: [],
    changes: [],
    lastRun: null,
    lastCompleteRunAt: null,
  });
});

test("the snapshot reads through a read-only handle", (t) => {
  const { db, path } = tempStore(t);
  seedPost(db, "1");
  const readOnly = openStore(path, { readOnly: true });
  t.after(() => readOnly.close());
  assert.equal(readSnapshot(readOnly).posts.length, 1);
});

test("posts without categories are all visible and uncategorized", (t) => {
  const { db } = tempStore(t);
  seedPost(db, "1");
  seedPost(db, "2", { bookmarked: false, liked: true });
  const snap = readSnapshot(db);
  assert.deepEqual(snap.topics, []);
  assert.deepEqual(
    snap.posts.map((p) => [p.id, p.hidden, p.unfiled, p.memberships, p.bookmarked, p.liked]),
    [
      ["1", false, true, [], true, false],
      ["2", false, true, [], false, true],
    ],
  );
  assert.deepEqual(shown(snap), ["1", "2"]);
});

test("a post in neither collection is left out", (t) => {
  const { db } = tempStore(t);
  seedPost(db, "gone", { bookmarked: false, liked: false });
  seedPost(db, "kept");
  assert.deepEqual(readSnapshot(db).posts.map((p) => p.id), ["kept"]);
});

test("memberships carry the band, confident first, and topics carry counts", (t) => {
  const { db } = tempStore(t);
  const ai = seedArea(db, "AI");
  const evals = seedTopic(db, "Evals", { areaId: ai });
  const agents = seedTopic(db, "Agents", { areaId: ai });
  seedTopic(db, "Draft", { areaId: ai, state: "proposed" });
  seedPost(db, "1");
  seedPost(db, "2");
  seedScore(db, "1", evals, 0.5);
  seedScore(db, "1", agents, 0.9);
  seedScore(db, "2", evals, 0.8);
  seedScore(db, "2", agents, 0.1);

  const snap = readSnapshot(db);
  const byId = new Map(snap.posts.map((p) => [p.id, p]));
  assert.deepEqual(byId.get("1")?.memberships, [
    { topicId: agents, band: "confident" },
    { topicId: evals, band: "unsure" },
  ]);
  assert.deepEqual(byId.get("2")?.memberships, [{ topicId: evals, band: "confident" }]);
  assert.equal(byId.get("1")?.unfiled, false);
  assert.deepEqual(
    snap.topics.map((topic) => [topic.name, topic.areaId, topic.postCount, topic.confidentCount]),
    [
      ["Evals", ai, 2, 1],
      ["Agents", ai, 1, 1],
    ],
  );
  assert.deepEqual(snap.areas.map((area) => [area.name, area.postCount]), [["AI", 2]]);
});

test("a hidden area hides its posts unless a visible topic also claims them", (t) => {
  const { db } = tempStore(t);
  const ai = seedArea(db, "AI");
  const politics = seedArea(db, "Politics", { hidden: true });
  const evals = seedTopic(db, "Evals", { areaId: ai });
  const elections = seedTopic(db, "Elections", { areaId: politics });
  seedPost(db, "politics-only");
  seedPost(db, "both");
  seedPost(db, "evals-only");
  seedScore(db, "politics-only", elections, 0.9);
  seedScore(db, "both", elections, 0.9);
  seedScore(db, "both", evals, 0.9);
  seedScore(db, "evals-only", evals, 0.9);

  const snap = readSnapshot(db);
  assert.deepEqual(snap.posts.filter((p) => p.hidden).map((p) => p.id), ["politics-only"]);
  assert.equal(snap.topics.find((topic) => topic.id === elections)?.hidden, true);
  assert.equal(snap.topics.find((topic) => topic.id === elections)?.hiddenSelf, false);
  assert.deepEqual(shown(snap), ["both", "evals-only"]);
  assert.deepEqual(shown(snap, { areaIds: [politics] }), ["both", "politics-only"]);
  assert.deepEqual(shown(snap, { revealHidden: true }), ["both", "evals-only", "politics-only"]);
});

test("a post still waiting on a score is pending", (t) => {
  const { db } = tempStore(t);
  const evals = seedTopic(db, "Evals", { areaId: seedArea(db, "AI") });
  seedPost(db, "scored");
  seedPost(db, "waiting");
  seedScore(db, "scored", evals, 0.9);
  assert.deepEqual(readSnapshot(db).posts.map((p) => [p.id, p.pending]), [
    ["scored", false],
    ["waiting", true],
  ]);
});

test("posts linking to one resource share it, and link titles are searchable", (t) => {
  const { db } = tempStore(t);
  const resourceId = Number(
    db
      .prepare(
        `INSERT INTO resources (canonical_key, kind, url, host, title, created_at)
         VALUES ('github:acme/motion', 'repo', 'https://github.com/acme/motion', 'github.com', 'acme/motion', ?)`,
      )
      .run(AT).lastInsertRowid,
  );
  for (const id of ["1", "2", "3", "4"]) {
    seedPost(db, id);
    seedLink(db, id, `https://t.co/${id}`, { status: "resolved", title: `Motion page ${id}`, host: "motion.example" });
  }
  seedPost(db, "unsaved", { bookmarked: false });
  seedLink(db, "unsaved", "https://t.co/u", { status: "resolved", title: "Motion" });
  seedPost(db, "plain");
  db.prepare(`UPDATE links SET resource_id = ?`).run(resourceId);

  const snap = readSnapshot(db);
  assert.deepEqual(snap.resources, [
    {
      id: resourceId,
      kind: "repo",
      url: "https://github.com/acme/motion",
      host: "github.com",
      title: "acme/motion",
      postIds: ["1", "2", "3", "4"],
    },
  ]);
  assert.deepEqual(snap.posts.find((p) => p.id === "3")?.linkedPages, [{ title: "Motion page 3", url: null, host: "motion.example" }]);
  assert.deepEqual(shown(snap, { keyword: "motion page 3" }), ["3"]);
});

test("quoted post and media are projected to the fields the screen shows", (t) => {
  const { db } = tempStore(t);
  seedPost(db, "1", {
    quoted: {
      id: "q1",
      text: "quoted words",
      createdAt: "2025-12-31T00:00:00.000Z",
      author: { handle: "qq", displayName: "Quo Ted", avatarUrl: "https://example.com/q.png", avatarHue: 40, bio: "long bio" },
      media: [{ url: "https://example.com/m.png", type: "image" }],
      entities: { urls: [] },
    },
  });
  db.prepare(`UPDATE posts SET media_json = ?, created_at = ?, like_count = 7 WHERE id = '1'`).run(
    JSON.stringify([{ url: "https://example.com/own.png", type: "image" }, { nope: true }]),
    "2026-02-03T04:05:06.000Z",
  );
  const [post] = readSnapshot(db).posts;
  assert.deepEqual(post.quoted, {
    id: "q1",
    text: "quoted words",
    createdAt: "2025-12-31T00:00:00.000Z",
    authorHandle: "qq",
    authorName: "Quo Ted",
    authorAvatarUrl: "https://example.com/q.png",
    authorAvatarHue: 40,
    media: [{ type: "image", url: "https://example.com/m.png" }],
  });
  assert.deepEqual(post.media, [{ type: "image", url: "https://example.com/own.png" }]);
  assert.equal(post.createdAtMs, Date.parse("2026-02-03T04:05:06.000Z"));
  assert.equal(post.likeCount, 7);
});

test("the change log is newest first and marks what can still be undone", (t) => {
  const { db } = tempStore(t);
  const add = db.prepare(
    `INSERT INTO changes (kind, source, summary, post_count, snapshot_json, undoable, undone_at, created_at)
     VALUES (?, ?, ?, ?, '{"topicId":1}', ?, ?, ?)`,
  );
  add.run("initial", "auto", "Initial categories", 40, 0, null, AT);
  add.run("new_topic", "auto", "New topic: Evals", 12, 1, null, AT);
  add.run("split", "auto", "Split Agents", 30, 1, "2026-01-02T00:00:00.000Z", AT);
  add.run("undo", "user", "Undid: Split Agents", 30, 0, null, "2026-01-02T00:00:00.000Z");

  const { changes } = readSnapshot(db);
  assert.deepEqual(
    changes.map((c) => [c.kind, c.undoable, c.undoneAt]),
    [
      ["undo", false, null],
      ["split", false, "2026-01-02T00:00:00.000Z"],
      ["new_topic", true, null],
      ["initial", false, null],
    ],
  );
  assert.deepEqual(Object.keys(changes[2]).sort(), [
    "createdAt", "id", "kind", "postCount", "source", "summary", "undoable", "undoneAt",
  ]);
  assert.equal(changes[2].postCount, 12);
});

test("the last run carries its stages, and the last complete run is remembered", (t) => {
  const { db } = tempStore(t);
  const run = db.prepare(
    `INSERT INTO runs (started_at, finished_at, status, upstream_sync, upstream_sync_detail) VALUES (?, ?, ?, ?, ?)`,
  );
  run.run("2026-01-01T00:00:00.000Z", "2026-01-01T00:05:00.000Z", "complete", "ok", null);
  const lastId = Number(
    run.run("2026-01-02T00:00:00.000Z", "2026-01-02T00:04:00.000Z", "failed", "failed", "bookmarks export failed").lastInsertRowid,
  );
  const stage = db.prepare(`INSERT INTO run_stages (run_id, stage, outcome, counts_json, message) VALUES (?, ?, ?, ?, ?)`);
  stage.run(lastId, "ingest", "ok", '{"posts":3,"note":"x"}', null);
  stage.run(lastId, "links", "failed", "{}", "network down");

  const snap = readSnapshot(db);
  assert.equal(snap.lastCompleteRunAt, "2026-01-01T00:05:00.000Z");
  assert.deepEqual(snap.lastRun, {
    id: lastId,
    startedAt: "2026-01-02T00:00:00.000Z",
    finishedAt: "2026-01-02T00:04:00.000Z",
    status: "failed",
    upstreamSync: "failed",
    upstreamSyncDetail: "bookmarks export failed",
    message: null,
    stages: [
      { stage: "ingest", outcome: "ok", message: null, counts: { posts: 3 } },
      { stage: "links", outcome: "failed", message: "network down", counts: {} },
    ],
  });
});

test("hidden and Unfiled agree with the store's own views", (t) => {
  const { db } = tempStore(t);
  const ai = seedArea(db, "AI");
  const politics = seedArea(db, "Politics", { hidden: true });
  const pinned = seedArea(db, "Pinned", { kind: "system" });
  const evals = seedTopic(db, "Evals", { areaId: ai });
  const secret = seedTopic(db, "Secret", { areaId: ai, hidden: true });
  const elections = seedTopic(db, "Elections", { areaId: politics });
  const query = seedTopic(db, "my search", { areaId: pinned, kind: "pinned" });
  const old = seedTopic(db, "Old polls", { areaId: politics, state: "merged", mergedInto: elections });

  const cases: Record<string, [number, number | "add" | "remove" | "unsure"][]> = {
    "none": [],
    "visible-sure": [[evals, 0.9]],
    "hidden-sure": [[elections, 0.9]],
    "hidden-topic-sure": [[secret, 0.9]],
    "both-sure": [[evals, 0.8], [elections, 0.95]],
    "hidden-unsure-wins": [[evals, 0.4], [elections, 0.6]],
    "visible-unsure-wins": [[evals, 0.6], [elections, 0.4]],
    "unsure-tie": [[evals, 0.5], [elections, 0.5]],
    "hidden-sure-visible-unsure": [[evals, 0.6], [elections, 0.9]],
    "pin-only": [[query, 0.9]],
    "pin-and-hidden-unsure": [[query, 0.9], [elections, 0.5]],
    "added-visible": [[evals, "add"], [elections, 0.9]],
    "added-hidden": [[elections, "add"], [evals, 0.5]],
    "removed-hidden": [[elections, 0.9], [elections, "remove"], [evals, 0.4]],
    "carried": [[elections, "unsure"]],
    "merged-in": [[old, 0.9]],
    "low": [[evals, 0.1], [elections, 0.2]],
  };
  for (const [id, rows] of Object.entries(cases)) {
    seedPost(db, id);
    for (const [topicId, value] of rows) {
      if (typeof value === "number") seedScore(db, id, topicId, value);
      else seedOverride(db, id, topicId, value);
    }
  }

  const flagged = (view: string) => db.prepare(`SELECT post_id FROM ${view} ORDER BY post_id`).all().map((row) => String(row.post_id));
  const snap = readSnapshot(db);
  const derived = (flag: "hidden" | "unfiled") => snap.posts.filter((p) => p[flag]).map((p) => p.id).sort();
  assert.deepEqual(derived("hidden"), flagged("post_hidden"));
  assert.deepEqual(derived("unfiled"), flagged("post_unfiled"));
  assert.ok(derived("hidden").length >= 4 && derived("hidden").length < snap.posts.length);
});

test("a removed post is listed apart and counts toward no post list, topic, area, or resource", (t) => {
  const { db } = tempStore(t);
  const ai = seedArea(db, "AI");
  const evals = seedTopic(db, "Evals", { areaId: ai });
  const addResource = (key: string) =>
    Number(
      db
        .prepare(`INSERT INTO resources (canonical_key, kind, url, host, title, created_at) VALUES (?, 'repo', ?, 'github.com', ?, ?)`)
        .run(key, `https://github.com/${key}`, key, AT).lastInsertRowid,
    );
  const shared = addResource("acme/shared");
  const onlyRemoved = addResource("acme/only-removed");
  const link = (postId: string, url: string, resourceId: number) => {
    seedLink(db, postId, url, { status: "resolved", title: `Page ${url}` });
    db.prepare(`UPDATE links SET resource_id = ? WHERE url = ?`).run(resourceId, url);
  };
  for (const id of ["kept", "gone", "gone-earlier", "gone-unsaved"]) seedScore(db, seedPost(db, id), evals, 0.9);
  link("kept", "https://t.co/a", shared);
  link("gone", "https://t.co/b", shared);
  link("gone", "https://t.co/c", onlyRemoved);
  db.prepare(`UPDATE posts SET author_handle = 'ada', author_name = 'Ada', created_at = ?, liked = 1 WHERE id = 'gone'`).run("2026-01-05T00:00:00.000Z");
  db.prepare(`UPDATE posts SET removed_at = ? WHERE id = 'gone'`).run("2026-02-02T00:00:00.000Z");
  db.prepare(`UPDATE posts SET removed_at = ? WHERE id = 'gone-earlier'`).run("2026-02-01T00:00:00.000Z");
  db.prepare(`UPDATE posts SET removed_at = ?, bookmarked = 0 WHERE id = 'gone-unsaved'`).run("2026-02-03T00:00:00.000Z");

  const snap = readSnapshot(db);

  assert.deepEqual(snap.posts.map((p) => p.id), ["kept"]);
  assert.deepEqual(shown(snap), ["kept"]);
  assert.deepEqual(snap.removed.map((p) => p.id), ["gone", "gone-earlier"]);
  assert.deepEqual(snap.removed[0], {
    id: "gone",
    text: "post gone text",
    createdAt: "2026-01-05T00:00:00.000Z",
    url: "https://x.com/someone/status/gone",
    authorHandle: "ada",
    authorName: "Ada",
    authorAvatarUrl: null,
    bookmarked: true,
    liked: true,
    removedAt: "2026-02-02T00:00:00.000Z",
  });
  assert.deepEqual(
    snap.topics.map((topic) => [topic.name, topic.postCount, topic.confidentCount]),
    [["Evals", 1, 1]],
  );
  assert.deepEqual(snap.areas.map((area) => [area.name, area.postCount]), [["AI", 1]]);
  assert.deepEqual(
    snap.resources.map((resource) => [resource.id, resource.postIds]),
    [[shared, ["kept"]]],
  );
});

test("post text reads with resolved links expanded, and search finds the destination", (t) => {
  const { db } = tempStore(t);
  seedPost(db, "9", { text: "Try this https://t.co/abc https://t.co/pic" });
  seedLink(db, "9", "https://t.co/abc", { status: "resolved" });
  seedLink(db, "9", "https://t.co/pic", { status: "not_resource" });
  db.prepare(`UPDATE links SET final_url = ? WHERE url = ?`).run("https://github.com/acme/widget", "https://t.co/abc");
  db.prepare(`UPDATE links SET final_url = ? WHERE url = ?`).run("https://x.com/someone/status/9/photo/1", "https://t.co/pic");
  const snap = readSnapshot(db);
  assert.equal(snap.posts[0].text, "Try this https://github.com/acme/widget");
  assert.deepEqual(shown(snap, { keyword: "acme widget" }), ["9"]);
});
