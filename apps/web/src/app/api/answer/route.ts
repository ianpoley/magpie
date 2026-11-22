import { existsSync } from "node:fs";

import {
  ANSWER_SCHEMAS,
  answerPrompt,
  answerTimeoutMs,
  askedQuestion,
  checkQuotes,
  INTENT_QUESTION,
  intentFrom,
  READ_CHAR_BUDGET,
  readAnswerRequest,
  toAnswer,
  type AnswerFailure,
  type AnswerRecord,
  type QuoteSource,
} from "@/lib/answer";
import { isSameOriginJson } from "@/lib/ask";
import { engineAnswerModel, engineClaude, engineConfig, engineJev, engineQuestions, engineStore } from "@/lib/engine";
import { errorName } from "@/lib/error-name";

const refuse = (status: number, message: string): Response => Response.json({ message }, { status });

const FAILURES: Record<string, AnswerFailure> = { missing: "missing", timeout: "timeout" };

const flatText = (value: unknown): string =>
  typeof value === "string" ? value : Array.isArray(value) ? value.map(flatText).join("\n") : typeof value === "object" && value !== null ? Object.values(value).map(flatText).join("\n") : "";

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginJson(request.headers)) return refuse(403, "This question did not come from the app.");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse(400, "The question could not be read.");
  }
  const asked = readAnswerRequest(body);
  if (asked === null) return refuse(400, "An answer needs a question and the posts to read.");

  const [{ openStore }, { paths, ASK }, questions, { createClaudeCli, askJson }, { createJevClient }, { readAnswerModel, answerModelLabel }] = await Promise.all([
    engineStore(),
    engineConfig(),
    engineQuestions(),
    engineClaude(),
    engineJev(),
    engineAnswerModel(),
  ]);
  const { store } = paths();
  if (!existsSync(store)) return refuse(503, "Nothing has been synced yet.");

  const refs: Record<string, string> = {};
  const posts: string[] = [];
  const sources = new Map<string, QuoteSource>();
  try {
    const db = openStore(store, { readOnly: true });
    try {
      const visible = db.prepare(`SELECT author_name, created_at FROM posts WHERE id = ? AND id IN (SELECT id FROM visible_posts)`);
      const sent = questions.readPostContent(db, asked.postIds, ASK.answerCharLimit);
      const full = questions.readPostContent(db, asked.postIds, Number.POSITIVE_INFINITY);
      let chars = 0;
      for (const id of asked.postIds) {
        const row = visible.get(id);
        const content = sent.get(id);
        if (!row || !content) continue;
        const ref = `p${posts.length + 1}`;
        const line = JSON.stringify({ ref, author: String(row.author_name), written: String(row.created_at ?? "").slice(0, 10), ...content });
        if (posts.length > 0 && chars + line.length > READ_CHAR_BUDGET) break;
        chars += line.length;
        refs[ref] = id;
        posts.push(line);
        sources.set(id, { full: flatText(full.get(id)), sent: flatText(content) });
      }
    } finally {
      db.close();
    }
  } catch (error) {
    console.error("answer: could not read posts:", errorName(error));
    return refuse(503, "Answers are not available right now.");
  }
  if (posts.length === 0) return refuse(400, "None of those posts can be read.");

  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });

  const intent = intentFrom(
    await createJevClient()
      .then((jev) => jev.choose?.({ question: askedQuestion(asked) }, INTENT_QUESTION, { signal: abort.signal }) ?? null)
      .catch((error: unknown) => {
        console.error("answer: could not tell the question's intent:", errorName(error));
        return null;
      }),
  );
  const choice = readAnswerModel();
  const model = `${answerModelLabel(choice.model)} · ${choice.effort} effort`;
  const cli = createClaudeCli({ timeoutMs: answerTimeoutMs(choice.effort), choice });
  const today = new Date().toLocaleDateString("en-CA");
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (record: AnswerRecord): void => {
        if (!abort.signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(record)}\n`));
      };
      send({ type: "start", refs, read: posts.length, intent, model });
      const written = await askJson<unknown>(
        { send: (claudeRequest) => cli.send(claudeRequest, { onPartial: (text) => send({ type: "delta", text }), signal: abort.signal }) },
        { prompt: answerPrompt(asked, posts, intent, today), schema: ANSWER_SCHEMAS[intent] },
      );
      if (abort.signal.aborted) return;
      const shaped = written.ok ? toAnswer(written.value, intent, refs, { read: posts.length, model }, false) : null;
      const answer = shaped ? checkQuotes(shaped, sources) : null;
      if (!written.ok) console.error("answer: Claude did not answer:", written.reason);
      send(answer ? { type: "done", answer } : { type: "error", reason: written.ok ? "failed" : (FAILURES[written.reason] ?? "failed") });
      controller.close();
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
