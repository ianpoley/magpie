import { existsSync } from "node:fs";

import { askPosts, cleanQuery, isSameOriginJson, readAskPosts, type AskPost, type AskRecord } from "@/lib/ask";
import { engineConfig, engineJev, engineQuestions, engineStore } from "@/lib/engine";
import { errorName } from "@/lib/error-name";

const refuse = (status: number, message: string): Response => Response.json({ message }, { status });

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginJson(request.headers)) return refuse(403, "This search did not come from the app.");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse(400, "The search could not be read.");
  }
  const query = cleanQuery(typeof body === "object" && body !== null ? (body as Record<string, unknown>).query : null);
  if (query === null) return refuse(400, "A search needs between 1 and 500 characters.");

  const [{ openStore }, { paths, ASK, BANDS }, { createJevClient }, questions] = await Promise.all([
    engineStore(),
    engineConfig(),
    engineJev(),
    engineQuestions(),
  ]);
  const { store } = paths();
  if (!existsSync(store)) return refuse(503, "Nothing has been synced yet.");

  let jev: Awaited<ReturnType<typeof createJevClient>>;
  let posts: AskPost[];
  try {
    jev = await createJevClient();
    const db = openStore(store, { readOnly: true });
    try {
      posts = readAskPosts(db, questions.readPostContent);
    } finally {
      db.close();
    }
  } catch (error) {
    console.error("ask: could not start:", errorName(error));
    return refuse(503, "Magpie could not read the Jev key or your saved posts. Check the Jev key in Settings, then try again.");
  }

  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });
  const records = askPosts(
    {
      jev,
      buildRequest: questions.askRequest,
      questionId: questions.askQuestionId,
      hasSomethingToJudge: questions.hasSomethingToJudge,
      requestTokenBudget: ASK.requestTokenBudget,
      concurrency: ASK.concurrency,
      bands: BANDS,
      onChunkError: (error) => console.error("ask: a request failed:", errorName(error)),
    },
    query,
    posts,
    abort.signal,
  );

  const encoder = new TextEncoder();
  const line = (record: AskRecord): Uint8Array => encoder.encode(`${JSON.stringify(record)}\n`);
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await records.next();
      if (done || abort.signal.aborted) controller.close();
      else controller.enqueue(line(value));
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
