import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkQuotes,
  createChatRunner,
  MAX_POST_IDS,
  parsePartialJson,
  partialAnswer,
  readAnswerRequest,
  type Answer,
  type AnswerRecord,
  type AnswerRequest,
  type AnswerStart,
  type ChatRunner,
} from "../src/lib/answer.ts";

const REFS = { p1: "100", p2: "200", p3: "300" };
const START: AnswerStart = { refs: REFS, read: 3, intent: "explain", model: "Opus 5.5 · medium effort" };

test("half-written JSON reads as far as it has arrived", () => {
  assert.equal(parsePartialJson(""), null);
  assert.deepEqual(parsePartialJson('{"le'), {});
  assert.deepEqual(parsePartialJson('{"lead": "Run a bounded lo'), { lead: "Run a bounded lo" });
  assert.deepEqual(parsePartialJson('{"lead": "x", "items": [{"name": "A", "refs": ["p1", "p'), { lead: "x", items: [{ name: "A", refs: ["p1", "p"] }] });
  assert.deepEqual(parsePartialJson('{"lead": "x", "items": [{"name": "A"}, {"na'), { lead: "x", items: [{ name: "A" }, {}] });
  assert.deepEqual(parsePartialJson('{"lead": "x", "ok": tr'), { lead: "x" });
  assert.deepEqual(parsePartialJson('{"lead": "x", "gaps": "a } and ] in text'), { lead: "x", gaps: "a } and ] in text" });
});

test("an escape cut in half does not blank the text before it", () => {
  assert.deepEqual(parsePartialJson('{"lead": "Caf\\u00'), { lead: "Caf" });
  assert.deepEqual(parsePartialJson('{"lead": "line one\\'), { lead: "line one" });
  assert.deepEqual(parsePartialJson('{"lead": "say \\"hi\\" now'), { lead: 'say "hi" now' });
});

test("a half-written answer keeps each shape's sections, maps refs to posts and drops refs never sent", () => {
  assert.equal(partialAnswer('{"le', START), null);
  const json = '{"lead": "Use a judge.", "themes": [{"title": "Split roles", "body": "One builds.", "refs": ["p2", "p1", "p9"]}, {"title": "Reset con';
  assert.deepEqual(partialAnswer(json, START), {
    intent: "explain",
    lead: "Use a judge.",
    themes: [
      { title: "Split roles", body: "One builds.", postIds: ["200", "100"] },
      { title: "Reset con", body: "", postIds: [] },
    ],
    disagreement: "",
    followUps: [],
    read: 3,
    model: START.model,
  });
  const find = partialAnswer('{"lead": "Two prompts.", "items": [{"name": "Health check", "what": "Audit", "quote": "Read this entire', { ...START, intent: "find" });
  assert.deepEqual(find?.intent === "find" ? find.items : null, [{ name: "Health check", what: "Audit", quote: "Read this entire", quoteCut: false, postIds: [] }]);
  const shortened = partialAnswer('{"lead": "One.", "items": [{"name": "Audit", "what": "w", "quote": "Read this", "complete": false, "refs": ["p1"]}]}', { ...START, intent: "find" });
  assert.equal(shortened?.intent === "find" ? shortened.items[0].quoteCut : null, true);
});

const findAnswer = (quote: string, postIds = ["100"]): Answer => ({
  intent: "find",
  lead: "l",
  items: [{ name: "n", what: "w", quote, quoteCut: false, postIds }],
  gaps: "",
  followUps: [],
  read: 1,
  model: "m",
});
const quoteOf = (answer: Answer) => (answer.intent === "find" ? { quote: answer.items[0].quote, cut: answer.items[0].quoteCut } : null);

test("a quote survives only when its cited post holds it, and is marked cut when it runs to the end of a trimmed post", () => {
  const full = "Prompt: Read this entire project and find what\u2019s broken.\nFix what you\u2019re sure about, then list the rest.";
  const sources = new Map([["100", { full, sent: full }]]);
  assert.deepEqual(quoteOf(checkQuotes(findAnswer("read this entire project and find what's broken. fix what you're sure about"), sources)), {
    quote: "read this entire project and find what's broken. fix what you're sure about",
    cut: false,
  });
  assert.deepEqual(quoteOf(checkQuotes(findAnswer("Read this entire project … list the rest."), sources))?.cut, false);
  assert.deepEqual(quoteOf(checkQuotes(findAnswer("Delete half the codebase."), sources)), { quote: "", cut: false });
  assert.deepEqual(quoteOf(checkQuotes(findAnswer("Read this entire project", ["999"]), sources)), { quote: "", cut: false });

  const trimmed = new Map([["100", { full, sent: full.slice(0, 50).trim() }]]);
  assert.deepEqual(quoteOf(checkQuotes(findAnswer(full.slice(8, 50).trim()), trimmed)), { quote: full.slice(8, 50).trim(), cut: true });
  assert.deepEqual(quoteOf(checkQuotes(findAnswer("Read this entire project"), trimmed))?.cut, false);
});

test("an answer request needs a question and posts, and a follow-up needs the conversation", () => {
  assert.equal(readAnswerRequest({ query: "  ", postIds: ["1"] }), null);
  assert.equal(readAnswerRequest({ query: "q", postIds: [] }), null);
  assert.equal(readAnswerRequest({ query: "q", postIds: ["1"], followUp: "more?" }), null);
  assert.deepEqual(readAnswerRequest({ query: " q ", postIds: ["1", 2, "3"], thread: [{ question: "q", answer: "a" }] }), { query: "q", postIds: ["1", "3"], thread: [], followUp: null });
  assert.deepEqual(readAnswerRequest({ query: "q", postIds: ["1"], thread: [{ question: "q", answer: "a" }, { answer: "no question" }], followUp: " more? " }), {
    query: "q",
    postIds: ["1"],
    thread: [{ question: "q", answer: "a" }],
    followUp: "more?",
  });
  assert.equal(readAnswerRequest({ query: "q", postIds: Array.from({ length: MAX_POST_IDS + 10 }, (_, index) => String(index)) })?.postIds.length, MAX_POST_IDS);
});

const answerOf = (lead: string): Answer => ({
  intent: "explain",
  lead,
  themes: [{ title: "T", body: "B", postIds: ["100"] }],
  disagreement: "",
  followUps: [],
  read: 3,
  model: START.model,
});

const stream = (records: AnswerRecord[]): Response => new Response(records.map((record) => `${JSON.stringify(record)}\n`).join(""));

function runner(reply: (request: AnswerRequest, call: number) => Response | Promise<Response>): { chat: ChatRunner; requests: AnswerRequest[]; settled: () => Promise<void> } {
  const requests: AnswerRequest[] = [];
  let pending: Promise<unknown> = Promise.resolve();
  const chat = createChatRunner((request) => {
    requests.push(request);
    const sent = Promise.resolve(reply(request, requests.length));
    pending = sent.catch(() => {});
    return sent;
  });
  const settled = async () => {
    await pending;
    for (let turn = 0; turn < 20; turn++) await new Promise((resolve) => setImmediate(resolve));
  };
  return { chat, requests, settled };
}

const IDS = ["100", "200", "300"];

test("the first answer is written from the ranked posts, and a follow-up reuses them with the conversation", async () => {
  const { chat, requests, settled } = runner((_, call) => stream([{ type: "start", ...START }, { type: "done", answer: answerOf(`answer ${call}`) }]));

  chat.start("how?", IDS, 3);
  await settled();
  assert.deepEqual(chat.getState()?.turns, [{ question: "how?", status: "done", answer: answerOf("answer 1") }]);

  chat.start("how?", ["999"], 1);
  chat.followUp("  and then? ");
  await settled();

  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1], { query: "how?", postIds: IDS, thread: [{ question: "how?", answer: "answer 1\n- T. B" }], followUp: "and then?" });
  assert.deepEqual(chat.getState()?.turns.map((turn) => [turn.question, turn.status, turn.answer?.lead]), [
    ["how?", "done", "answer 1"],
    ["and then?", "done", "answer 2"],
  ]);
});

test("text shows while it is being written", async () => {
  let release = (): void => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const encoder = new TextEncoder();
  const line = (record: AnswerRecord) => encoder.encode(`${JSON.stringify(record)}\n`);
  const { chat, settled } = runner(
    () =>
      new Response(
        new ReadableStream<Uint8Array>({
          async start(controller) {
            controller.enqueue(line({ type: "start", ...START }));
            controller.enqueue(line({ type: "delta", text: '{"lead": "Half an ans' }));
            await held;
            controller.enqueue(line({ type: "done", answer: answerOf("Half an answer.") }));
            controller.close();
          },
        }),
      ),
  );

  chat.start("how?", IDS, 3);
  await settled();
  assert.deepEqual(chat.getState()?.turns[0], { question: "how?", status: "writing", answer: { ...answerOf("Half an ans"), themes: [] } });

  release();
  await settled();
  assert.equal(chat.getState()?.turns[0].status, "done");
});

test("too few confident posts ends without asking Claude", async () => {
  const { chat, requests, settled } = runner(() => stream([]));

  chat.start("how?", ["100", "200", "300", "400"], 2);
  await settled();

  assert.equal(requests.length, 0);
  assert.deepEqual(chat.getState(), { root: "how?", confident: 2, matched: 4, turns: [{ question: "how?", status: "few", answer: null }] });
  chat.followUp("more?");
  assert.equal(chat.getState()?.turns.length, 1);

  chat.start("how?", ["100", "200", "300", "400"], 2);
  assert.equal(requests.length, 0);
  chat.start("how?", IDS, 3);
  assert.equal(requests.length, 1);
  assert.equal(chat.getState()?.turns[0].status, "writing");
});

test("a missing CLI is unavailable, and other failures can be tried again", async () => {
  const missing = runner(() => stream([{ type: "start", ...START }, { type: "error", reason: "missing" }]));
  missing.chat.start("how?", IDS, 3);
  await missing.settled();
  assert.equal(missing.chat.getState()?.turns[0].status, "unavailable");
  missing.chat.retry();
  assert.equal(missing.requests.length, 1);

  const flaky = runner((_, call) =>
    call === 1 ? new Response("no", { status: 503 }) : call === 2 ? stream([{ type: "start", ...START }]) : stream([{ type: "done", answer: answerOf("third time") }]),
  );
  flaky.chat.start("how?", IDS, 3);
  await flaky.settled();
  assert.equal(flaky.chat.getState()?.turns[0].status, "failed");
  flaky.chat.retry();
  await flaky.settled();
  assert.equal(flaky.chat.getState()?.turns[0].status, "failed");
  flaky.chat.retry();
  await flaky.settled();
  assert.deepEqual(flaky.chat.getState()?.turns[0], { question: "how?", status: "done", answer: answerOf("third time") });
});

test("clearing cancels the call in flight and a late answer changes nothing", async () => {
  let signalSeen: AbortSignal | null = null;
  let release = (): void => {};
  const chat = createChatRunner((_, signal) => {
    signalSeen = signal;
    return new Promise<Response>((resolve) => (release = () => resolve(stream([{ type: "done", answer: answerOf("late") }]))));
  });

  chat.start("how?", IDS, 3);
  chat.clear();
  release();
  for (let turn = 0; turn < 20; turn++) await new Promise((resolve) => setImmediate(resolve));

  assert.equal((signalSeen as AbortSignal | null)?.aborted, true);
  assert.equal(chat.getState(), null);
});
