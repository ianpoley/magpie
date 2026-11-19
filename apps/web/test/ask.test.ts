import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import { ASK, BANDS } from "../../../packages/engine/src/config.ts";
import type { JevClient, JevRequest } from "../../../packages/engine/src/jev/client.ts";
import { askQuestionId, askRequest, hasSomethingToJudge, readPostContent } from "../../../packages/engine/src/jev/questions.ts";
import { pinQuery } from "../../../packages/engine/src/store/edits.ts";
import { fakeJev, seedLink, seedPost, tempStore } from "../../../packages/engine/test/fixtures/corpus.ts";
import {
  MAX_QUERY_CHARS,
  askPosts,
  cleanQuery,
  createAskRunner,
  isSameOriginJson,
  rankAsk,
  readAskPosts,
  type AskDeps,
  type AskRecord,
  type AskScore,
} from "../src/lib/ask.ts";
import { DEFAULT_FILTER } from "../src/lib/filter.ts";
import { NOW, ids, post, snapshot } from "./fixtures/snapshot.ts";

const deps = (jev: JevClient, overrides: Partial<AskDeps> = {}): AskDeps => ({
  jev,
  buildRequest: askRequest,
  questionId: askQuestionId,
  hasSomethingToJudge,
  chunkSize: ASK.chunkSize,
  concurrency: ASK.concurrency,
  bands: BANDS,
  ...overrides,
});

function seeded(t: TestContext, count: number) {
  const { db } = tempStore(t);
  for (let n = 1; n <= count; n++) seedPost(db, String(n));
  return db;
}

async function collect(records: AsyncIterable<AskRecord>): Promise<AskRecord[]> {
  const all: AskRecord[] = [];
  for await (const record of records) all.push(record);
  return all;
}

const scoresIn = (records: AskRecord[]): AskScore[] => records.flatMap((record) => (record.type === "scores" ? record.scores : []));
const postOf = (request: JevRequest, postId: string) =>
  (request.questions[askQuestionId(postId)].instructions as { post: Record<string, unknown> }).post;

test("a query over 100 posts judges every post once, in requests of the configured size", async (t) => {
  const db = seeded(t, 100);
  const jev = fakeJev(() => 0.8);
  const records = await collect(askPosts(deps(jev, { chunkSize: 40 }), "animations", readAskPosts(db, readPostContent)));

  assert.deepEqual(records[0], { type: "start", total: 100, bands: BANDS });
  assert.deepEqual(records.at(-1), { type: "done" });
  assert.deepEqual(
    jev.requests.map((request) => Object.keys(request.questions).length).sort((a, b) => b - a),
    [40, 40, 20],
  );
  const judged = scoresIn(records).map((score) => score.postId);
  assert.equal(judged.length, 100);
  assert.equal(new Set(judged).size, 100);
  assert.ok(scoresIn(records).every((score) => score.probability === 0.8));
});

test("each answer comes back under the post it was asked about", async (t) => {
  const db = seeded(t, 5);
  const jev = fakeJev((questionId) => (questionId === askQuestionId("3") ? 0.9 : 0.1));
  const records = await collect(askPosts(deps(jev), "animations", readAskPosts(db, readPostContent)));
  assert.deepEqual(
    scoresIn(records).filter((score) => score.probability === 0.9),
    [{ postId: "3", probability: 0.9 }],
  );
});

test("one failed request is reported and the others still return", async (t) => {
  const db = seeded(t, 100);
  const jev = fakeJev((_, request) => {
    if (askQuestionId("1") in request.questions) throw new Error("boom");
    return 0.8;
  });
  const failures: unknown[] = [];
  const records = await collect(
    askPosts(deps(jev, { chunkSize: 40, onChunkError: (error) => failures.push(error) }), "animations", readAskPosts(db, readPostContent)),
  );
  assert.deepEqual(
    records.filter((record) => record.type === "error"),
    [{ type: "error", posts: 40 }],
  );
  assert.equal(scoresIn(records).length, 60);
  assert.equal(failures.length, 1);
  assert.deepEqual(records.at(-1), { type: "done" });
});

test("an empty or whitespace query is refused and makes no request", async (t) => {
  assert.equal(cleanQuery(""), null);
  assert.equal(cleanQuery("  \n\t "), null);
  assert.equal(cleanQuery(42), null);
  assert.equal(cleanQuery("x".repeat(MAX_QUERY_CHARS + 1)), null);
  assert.equal(cleanQuery("  evals   for\nagents "), "evals for agents");

  const db = seeded(t, 3);
  const jev = fakeJev();
  assert.deepEqual(await collect(askPosts(deps(jev), "   ", readAskPosts(db, readPostContent))), []);
  assert.equal(jev.requests.length, 0);

  let sent = 0;
  const runner = createAskRunner(async () => {
    sent++;
    return new Response("");
  });
  runner.ask("   ");
  assert.equal(sent, 0);
  assert.equal(runner.getState(), null);
});

test("a query with backticks and quotes reaches Jev unchanged, as data", async (t) => {
  const db = seeded(t, 1);
  const jev = fakeJev();
  const query = "`post` is \"great\" 'yes' ${x} \\ </q>";
  await collect(askPosts(deps(jev), query, readAskPosts(db, readPostContent)));
  assert.equal(jev.requests.length, 1);
  assert.deepEqual(jev.requests[0].state, { topic: query });
  assert.deepEqual(JSON.parse(JSON.stringify(jev.requests[0])), jev.requests[0]);
});

test("a post longer than the limit is cut in its question", async (t) => {
  const { db } = tempStore(t);
  seedPost(db, "1", { text: "word ".repeat(2000) });
  const jev = fakeJev();
  await collect(askPosts(deps(jev), "animations", readAskPosts(db, readPostContent)));
  assert.equal(String(postOf(jev.requests[0], "1").text).length, ASK.contentCharLimit);
});

test("a link-only post is asked about with its page's title and description", async (t) => {
  const { db } = tempStore(t);
  seedPost(db, "1", { text: "https://t.co/abc" });
  seedLink(db, "1", "https://t.co/abc", { status: "resolved", host: "spring.dev", title: "Spring", description: "Physics animation for React" });
  const jev = fakeJev();
  await collect(askPosts(deps(jev), "animations", readAskPosts(db, readPostContent)));
  assert.deepEqual(postOf(jev.requests[0], "1").linked_pages, [
    { host: "spring.dev", title: "Spring", description: "Physics animation for React" },
  ]);
});

test("a post with nothing to judge is not asked about and counts as no match", async (t) => {
  const { db } = tempStore(t);
  seedPost(db, "1", { text: "https://t.co/abc" });
  seedPost(db, "2", { text: "a real post" });
  const jev = fakeJev(() => 0.9);
  const records = await collect(askPosts(deps(jev), "animations", readAskPosts(db, readPostContent)));
  assert.deepEqual(Object.keys(jev.requests[0].questions), [askQuestionId("2")]);
  assert.deepEqual(
    scoresIn(records).sort((a, b) => a.postId.localeCompare(b.postId)),
    [
      { postId: "1", probability: 0 },
      { postId: "2", probability: 0.9 },
    ],
  );
});

test("posts that are no longer bookmarked or liked are not asked about", async (t) => {
  const { db } = tempStore(t);
  seedPost(db, "1");
  seedPost(db, "2", { bookmarked: false, liked: false });
  assert.deepEqual(
    readAskPosts(db, readPostContent).map((entry) => entry.id),
    ["1"],
  );
});

test("posts removed from the corpus are not asked about", async (t) => {
  const { db } = tempStore(t);
  seedPost(db, "1");
  seedPost(db, "2");
  db.prepare(`UPDATE posts SET removed_at = '2026-02-01T00:00:00.000Z' WHERE id = '2'`).run();
  assert.deepEqual(
    readAskPosts(db, readPostContent).map((entry) => entry.id),
    ["1"],
  );
});

test("aborting stops new requests, cancels the ones in flight, and reports no error", async (t) => {
  const db = seeded(t, 100);
  const abort = new AbortController();
  const signals: AbortSignal[] = [];
  const jev: JevClient = {
    ask(_, options) {
      const signal = options?.signal as AbortSignal;
      signals.push(signal);
      return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    },
  };
  const run = collect(askPosts(deps(jev, { chunkSize: 10, concurrency: 2 }), "animations", readAskPosts(db, readPostContent), abort.signal));
  await new Promise((resolve) => setImmediate(resolve));
  abort.abort();
  const records = await run;
  assert.equal(signals.length, 2);
  assert.ok(signals.every((signal) => signal.aborted));
  assert.deepEqual(
    records.filter((record) => record.type === "error" || record.type === "done"),
    [],
  );
});

test("pinning after a query stores the scores already computed and asks Jev nothing more", async (t) => {
  const db = seeded(t, 50);
  const jev = fakeJev((questionId) => (questionId === askQuestionId("7") ? 0.95 : 0.2));
  const scores = scoresIn(await collect(askPosts(deps(jev), "scroll animation", readAskPosts(db, readPostContent))));
  const asked = jev.requests.length;

  const { topicId } = pinQuery(db, { query: "scroll animation", scores });
  assert.equal(jev.requests.length, asked);
  const stored = db.prepare(`SELECT post_id, probability FROM scores WHERE topic_id = ? ORDER BY probability DESC`).all(topicId);
  assert.equal(stored.length, 50);
  assert.deepEqual({ ...stored[0] }, { post_id: "7", probability: 0.95 });
  assert.deepEqual({ ...db.prepare(`SELECT name, kind, locked FROM topics WHERE id = ?`).get(topicId) }, {
    name: "scroll animation",
    kind: "pinned",
    locked: 1,
  });
});

test("results leave out posts below the unsure line and rank unsure after confident", () => {
  const snap = snapshot({ posts: [post("a"), post("b"), post("c"), post("d"), post("e")] });
  const ranked = rankAsk(
    snap,
    DEFAULT_FILTER,
    [
      { postId: "a", probability: 0.5 },
      { postId: "b", probability: 0.29 },
      { postId: "c", probability: 0.75 },
      { postId: "d", probability: 0.99 },
      { postId: "e", probability: 0.3 },
    ],
    { confident: 0.7, unsure: 0.3 },
    NOW,
  );
  assert.deepEqual(ids(ranked.posts), ["d", "c", "a", "e"]);
  assert.equal(ranked.unsureStart, 2);
});

test("results leave out hidden posts and follow the collection, author, time and media filters", () => {
  const snap = snapshot({
    posts: [
      post("plain"),
      post("hidden", { hidden: true }),
      post("liked", { bookmarked: false, liked: true }),
      post("other", { authorHandle: "else" }),
      post("old", { createdAt: "2020-01-01T00:00:00.000Z" }),
      post("media", { media: [{ type: "image", url: "https://example.com/a.png" }] }),
    ],
  });
  const scores = snap.posts.map((entry) => ({ postId: entry.id, probability: 0.9 }));
  const shown = (filter: Partial<typeof DEFAULT_FILTER>) =>
    ids(rankAsk(snap, { ...DEFAULT_FILTER, ...filter }, scores, BANDS, NOW).posts).sort();

  assert.deepEqual(shown({}), ["liked", "media", "old", "other", "plain"]);
  assert.deepEqual(shown({ revealHidden: true }), ["hidden", "liked", "media", "old", "other", "plain"]);
  assert.deepEqual(shown({ collection: "likes" }), ["liked"]);
  assert.deepEqual(shown({ author: "else" }), ["other"]);
  assert.deepEqual(shown({ timeRange: "year" }), ["liked", "media", "other", "plain"]);
  assert.deepEqual(shown({ mediaOnly: true }), ["media"]);
});

test("results ignore the category selection and the keyword, which belong to browsing", () => {
  const snap = snapshot({ posts: [post("a", { in: { 10: "confident" } }), post("b")] });
  const scores = [
    { postId: "a", probability: 0.9 },
    { postId: "b", probability: 0.8 },
  ];
  const ranked = rankAsk(snap, { ...DEFAULT_FILTER, topicIds: [10], keyword: "nothing has this", unfiled: true }, scores, BANDS, NOW);
  assert.deepEqual(ids(ranked.posts), ["a", "b"]);
});

const encoder = new TextEncoder();
const line = (record: AskRecord): Uint8Array => encoder.encode(`${JSON.stringify(record)}\n`);

function handFed(signal?: AbortSignal) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
  signal?.addEventListener("abort", () => {
    try {
      controller.error(new DOMException("aborted", "AbortError"));
    } catch {}
  });
  return { response: new Response(body), push: (record: AskRecord) => controller.enqueue(line(record)), close: () => controller.close() };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

test("records split across network chunks are joined", async () => {
  const text = `${JSON.stringify({ type: "start", total: 2, bands: BANDS })}\n${JSON.stringify({ type: "scores", scores: [{ postId: "1", probability: 0.9 }] })}\n${JSON.stringify({ type: "done" })}\n`;
  const bytes = encoder.encode(text);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, 9));
      controller.enqueue(bytes.slice(9, 70));
      controller.enqueue(bytes.slice(70));
      controller.close();
    },
  });
  const runner = createAskRunner(async () => new Response(body));
  runner.ask("evals");
  await settle();
  assert.deepEqual(runner.getState(), {
    query: "evals",
    status: "done",
    total: 2,
    judged: 1,
    failed: 0,
    scores: [{ postId: "1", probability: 0.9 }],
    bands: BANDS,
  });
});

test("the runner shows progress as records arrive and finishes when the stream does", async () => {
  const feed = handFed();
  const runner = createAskRunner(async () => feed.response);
  let changes = 0;
  runner.subscribe(() => changes++);
  runner.ask("  evals for   agents ");
  assert.deepEqual(runner.getState(), { query: "evals for agents", status: "running", total: null, judged: 0, failed: 0, scores: [], bands: null });

  feed.push({ type: "start", total: 3, bands: BANDS });
  feed.push({ type: "scores", scores: [{ postId: "1", probability: 0.9 }] });
  feed.push({ type: "error", posts: 2 });
  await settle();
  assert.deepEqual(runner.getState(), {
    query: "evals for agents",
    status: "running",
    total: 3,
    judged: 1,
    failed: 2,
    scores: [{ postId: "1", probability: 0.9 }],
    bands: BANDS,
  });
  feed.push({ type: "done" });
  feed.close();
  await settle();
  assert.equal(runner.getState()?.status, "done");
  assert.ok(changes >= 3);
});

test("a second query aborts the first, and nothing from the first is shown", async () => {
  const feeds: { query: string; signal: AbortSignal; feed: ReturnType<typeof handFed> }[] = [];
  const runner = createAskRunner(async (query, signal) => {
    // The first feed ignores the abort, like a response already in the pipe.
    const feed = handFed(feeds.length === 0 ? undefined : signal);
    feeds.push({ query, signal, feed });
    return feed.response;
  });

  runner.ask("first");
  await settle();
  feeds[0].feed.push({ type: "start", total: 2, bands: BANDS });
  feeds[0].feed.push({ type: "scores", scores: [{ postId: "1", probability: 0.9 }] });
  await settle();
  assert.equal(runner.getState()?.scores.length, 1);

  runner.ask("second");
  assert.equal(feeds[0].signal.aborted, true);
  assert.deepEqual(runner.getState()?.scores, []);
  await settle();
  feeds[0].feed.push({ type: "scores", scores: [{ postId: "2", probability: 0.8 }] });
  feeds[0].feed.push({ type: "done" });
  feeds[0].feed.close();
  feeds[1].feed.push({ type: "start", total: 5, bands: BANDS });
  await settle();
  assert.deepEqual(runner.getState(), { query: "second", status: "running", total: 5, judged: 0, failed: 0, scores: [], bands: BANDS });
});

test("a refused or broken request ends as failed and keeps what had arrived", async () => {
  const refused = createAskRunner(async () => Response.json({ message: "no" }, { status: 503 }));
  refused.ask("evals");
  await settle();
  assert.equal(refused.getState()?.status, "failed");

  const feed = handFed();
  const broken = createAskRunner(async () => feed.response);
  broken.ask("evals");
  feed.push({ type: "start", total: 4, bands: BANDS });
  feed.push({ type: "scores", scores: [{ postId: "1", probability: 0.9 }] });
  feed.close();
  await settle();
  assert.equal(broken.getState()?.status, "failed");
  assert.equal(broken.getState()?.scores.length, 1);
});

test("asking again keeps the earlier answers until new ones replace them; clearing drops everything", async () => {
  const feeds: ReturnType<typeof handFed>[] = [];
  const signals: AbortSignal[] = [];
  const runner = createAskRunner(async (_, signal) => {
    const feed = handFed(signal);
    feeds.push(feed);
    signals.push(signal);
    return feed.response;
  });
  runner.ask("evals");
  await settle();
  feeds[0].push({ type: "start", total: 2, bands: BANDS });
  feeds[0].push({ type: "scores", scores: [{ postId: "1", probability: 0.4 }] });
  feeds[0].push({ type: "error", posts: 1 });
  feeds[0].push({ type: "done" });
  feeds[0].close();
  await settle();

  runner.ask("evals");
  assert.deepEqual(runner.getState()?.scores, [{ postId: "1", probability: 0.4 }]);
  assert.equal(runner.getState()?.failed, 0);
  await settle();
  feeds[1].push({ type: "start", total: 2, bands: BANDS });
  feeds[1].push({
    type: "scores",
    scores: [
      { postId: "1", probability: 0.6 },
      { postId: "2", probability: 0.9 },
    ],
  });
  await settle();
  assert.deepEqual(runner.getState()?.scores, [
    { postId: "1", probability: 0.6 },
    { postId: "2", probability: 0.9 },
  ]);
  assert.equal(runner.getState()?.judged, 2);

  runner.clear();
  assert.equal(runner.getState(), null);
  assert.equal(signals[1].aborted, true);
});

const HOST = "127.0.0.1:3000";
const requestHeaders = (headers: Record<string, string>) => new Headers({ host: HOST, ...headers });

test("a JSON request from the app's own page is accepted", () => {
  assert.equal(
    isSameOriginJson(
      requestHeaders({ "content-type": "application/json", origin: `http://${HOST}`, "sec-fetch-site": "same-origin" }),
    ),
    true,
  );
  assert.equal(isSameOriginJson(requestHeaders({ "content-type": "Application/JSON; charset=utf-8", origin: `http://${HOST}` })), true);
});

test("a JSON request with no origin, as a local script sends, is accepted", () => {
  assert.equal(isSameOriginJson(requestHeaders({ "content-type": "application/json" })), true);
  assert.equal(isSameOriginJson(requestHeaders({ "content-type": "application/json", "sec-fetch-site": "none" })), true);
});

test("a request that is not JSON is refused, since another site can send it without asking", () => {
  assert.equal(isSameOriginJson(requestHeaders({ "content-type": "text/plain", origin: `http://${HOST}` })), false);
  assert.equal(isSameOriginJson(requestHeaders({ origin: `http://${HOST}` })), false);
});

test("a request from another origin is refused", () => {
  const json = { "content-type": "application/json" };
  assert.equal(isSameOriginJson(requestHeaders({ ...json, origin: "https://elsewhere.example" })), false);
  assert.equal(isSameOriginJson(requestHeaders({ ...json, origin: "http://127.0.0.1:4000" })), false);
  assert.equal(isSameOriginJson(requestHeaders({ ...json, origin: "null" })), false);
  assert.equal(isSameOriginJson(new Headers({ ...json, origin: `http://${HOST}` })), false);
});

test("a request the browser marks as cross-site is refused", () => {
  const json = { "content-type": "application/json" };
  assert.equal(isSameOriginJson(requestHeaders({ ...json, "sec-fetch-site": "cross-site" })), false);
  assert.equal(isSameOriginJson(requestHeaders({ ...json, "sec-fetch-site": "same-site", origin: `http://${HOST}` })), false);
});

test("a request addressed to a name that is not this machine is refused, whatever origin it gives", () => {
  const rebound = { "content-type": "application/json", "sec-fetch-site": "same-origin" };
  assert.equal(isSameOriginJson(new Headers({ ...rebound, host: "evil.example:3000", origin: "http://evil.example:3000" })), false);
  assert.equal(isSameOriginJson(new Headers({ ...rebound, host: "127.0.0.1.evil.example:3000", origin: "http://127.0.0.1.evil.example:3000" })), false);
  assert.equal(isSameOriginJson(new Headers({ "content-type": "application/json", host: "evil.example:3000" })), false);
  for (const host of ["127.0.0.1:3000", "localhost:3000", "[::1]:3000", "localhost"]) {
    assert.equal(isSameOriginJson(new Headers({ ...rebound, host, origin: `http://${host}` })), true, host);
  }
});
