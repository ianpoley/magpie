import assert from "node:assert/strict";
import { test } from "node:test";

import { createChatRunner, partialAnswer, readAnswerRequest, type AnswerRecord, type AnswerRequest, type ChatRunner } from "../src/lib/answer.ts";

const REFS = { p1: "100", p2: "200", p3: "300" };

test("a half-written answer shows what has arrived so far", () => {
  assert.equal(partialAnswer('{"le', REFS, 3), null);
  assert.deepEqual(partialAnswer('{"lead": "Run a bounded lo', REFS, 3), { lead: "Run a bounded lo", points: [], read: 3 });

  const twoPoints = '{"lead": "Use a \\"judge\\".", "points": [{"title": "Split roles", "body": "One builds.\\nOne checks.", "refs": ["p2", "p1", "p9"]}, {"title": "Reset con';
  assert.deepEqual(partialAnswer(twoPoints, REFS, 3), {
    lead: 'Use a "judge".',
    points: [
      { title: "Split roles", body: "One builds.\nOne checks.", postIds: ["200", "100"] },
      { title: "Reset con", body: "", postIds: [] },
    ],
    read: 3,
  });
});

test("an escape cut in half does not blank the text before it", () => {
  assert.equal(partialAnswer('{"lead": "Caf\\u00', REFS, 3)?.lead, "Caf");
  assert.equal(partialAnswer('{"lead": "line one\\', REFS, 3)?.lead, "line one");
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
  assert.equal(readAnswerRequest({ query: "q", postIds: Array.from({ length: 60 }, (_, index) => String(index)) })?.postIds.length, 40);
});

const answerOf = (lead: string) => ({ lead, points: [{ title: "T", body: "B", postIds: ["100"] }], read: 3 });

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

test("the first answer is written from the confident posts, and a follow-up reuses them with the conversation", async () => {
  const { chat, requests, settled } = runner((_, call) => stream([{ type: "start", refs: REFS, read: 3 }, { type: "done", answer: answerOf(`answer ${call}`) }]));

  chat.start("how?", IDS);
  await settled();
  assert.deepEqual(chat.getState()?.turns, [{ question: "how?", status: "done", answer: answerOf("answer 1") }]);

  chat.start("how?", ["999"]);
  chat.followUp("  and then? ");
  await settled();

  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1], { query: "how?", postIds: IDS, thread: [{ question: "how?", answer: "answer 1\n1. T. B" }], followUp: "and then?" });
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
            controller.enqueue(line({ type: "start", refs: REFS, read: 3 }));
            controller.enqueue(line({ type: "delta", text: '{"lead": "Half an ans' }));
            await held;
            controller.enqueue(line({ type: "done", answer: answerOf("Half an answer.") }));
            controller.close();
          },
        }),
      ),
  );

  chat.start("how?", IDS);
  await settled();
  assert.deepEqual(chat.getState()?.turns[0], { question: "how?", status: "writing", answer: { lead: "Half an ans", points: [], read: 3 } });

  release();
  await settled();
  assert.equal(chat.getState()?.turns[0].status, "done");
});

test("too few confident posts ends without asking Claude", async () => {
  const { chat, requests, settled } = runner(() => stream([]));

  chat.start("how?", ["100", "200"]);
  await settled();

  assert.equal(requests.length, 0);
  assert.deepEqual(chat.getState(), { root: "how?", confident: 2, turns: [{ question: "how?", status: "few", answer: null }] });
  chat.followUp("more?");
  assert.equal(chat.getState()?.turns.length, 1);

  chat.start("how?", ["100", "200"]);
  assert.equal(requests.length, 0);
  chat.start("how?", IDS);
  assert.equal(requests.length, 1);
  assert.equal(chat.getState()?.turns[0].status, "writing");
});

test("a missing CLI is unavailable, and other failures can be tried again", async () => {
  const missing = runner(() => stream([{ type: "start", refs: REFS, read: 3 }, { type: "error", reason: "missing" }]));
  missing.chat.start("how?", IDS);
  await missing.settled();
  assert.equal(missing.chat.getState()?.turns[0].status, "unavailable");
  missing.chat.retry();
  assert.equal(missing.requests.length, 1);

  const flaky = runner((_, call) =>
    call === 1 ? new Response("no", { status: 503 }) : call === 2 ? stream([{ type: "start", refs: REFS, read: 3 }]) : stream([{ type: "done", answer: answerOf("third time") }]),
  );
  flaky.chat.start("how?", IDS);
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

  chat.start("how?", IDS);
  chat.clear();
  release();
  for (let turn = 0; turn < 20; turn++) await new Promise((resolve) => setImmediate(resolve));

  assert.equal((signalSeen as AbortSignal | null)?.aborted, true);
  assert.equal(chat.getState(), null);
});
