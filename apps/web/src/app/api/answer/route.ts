import { existsSync } from "node:fs";

import { ANSWER_TIMEOUT_MS, answerPrompt, answerSchema, finishAnswer, readAnswerRequest, type AnswerFailure, type AnswerRecord, type WrittenAnswer } from "@/lib/answer";
import { isSameOriginJson } from "@/lib/ask";
import { engineClaude, engineConfig, engineQuestions, engineStore } from "@/lib/engine";
import { errorName } from "@/lib/error-name";

const refuse = (status: number, message: string): Response => Response.json({ message }, { status });

const FAILURES: Record<string, AnswerFailure> = { missing: "missing", timeout: "timeout" };

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

  const [{ openStore }, { paths }, questions, { createClaudeCli, askJson }] = await Promise.all([engineStore(), engineConfig(), engineQuestions(), engineClaude()]);
  const { store } = paths();
  if (!existsSync(store)) return refuse(503, "Nothing has been synced yet.");

  const refs: Record<string, string> = {};
  const posts: string[] = [];
  try {
    const db = openStore(store, { readOnly: true });
    try {
      const visible = db.prepare(`SELECT author_name, created_at FROM posts WHERE id = ? AND id IN (SELECT id FROM visible_posts)`);
      const contents = questions.readPostContent(db, asked.postIds);
      for (const id of asked.postIds) {
        const row = visible.get(id);
        const content = contents.get(id);
        if (!row || !content) continue;
        const ref = `p${posts.length + 1}`;
        refs[ref] = id;
        posts.push(JSON.stringify({ ref, author: String(row.author_name), written: String(row.created_at ?? "").slice(0, 10), ...content }));
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
  const cli = createClaudeCli({ timeoutMs: ANSWER_TIMEOUT_MS });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (record: AnswerRecord): void => {
        if (!abort.signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(record)}\n`));
      };
      send({ type: "start", refs, read: posts.length });
      const written = await askJson<WrittenAnswer>(
        { send: (claudeRequest) => cli.send(claudeRequest, { onPartial: (text) => send({ type: "delta", text }), signal: abort.signal }) },
        { prompt: answerPrompt(asked, posts), schema: answerSchema },
      );
      if (abort.signal.aborted) return;
      const answer = written.ok ? finishAnswer(written.value, refs, posts.length) : null;
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
