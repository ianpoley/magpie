import type { DatabaseSync } from "node:sqlite";

import type { JevClient, JevRequest } from "@magpie/engine/src/jev/client.ts";
import type { PostContent } from "@magpie/engine/src/jev/questions.ts";

import { applyFilter } from "./filter.ts";
import type { FilterResult, FilterState, Snapshot } from "./types.ts";

export const MAX_QUERY_CHARS = 500;

export type Bands = { confident: number; unsure: number };

export type AskScore = { postId: string; probability: number };

export type AskRecord =
  | { type: "start"; total: number; bands: Bands }
  | { type: "scores"; scores: AskScore[] }
  /** One request failed; this many posts went unjudged. */
  | { type: "error"; posts: number }
  | { type: "done" };

export function cleanQuery(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned === "" || cleaned.length > MAX_QUERY_CHARS ? null : cleaned;
}

const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/**
 * True when a `Host` header names this machine, on any port. A page elsewhere
 * that points its own name at this machine still sends its own name here.
 */
export function isLoopbackHost(host: string | null): boolean {
  return host !== null && LOOPBACK_HOST.test(host);
}

/**
 * True when a request can only have come from the app's own page or from a
 * local script. A page on another site can post without asking only if the
 * body is not declared as JSON, and a browser names where a request began.
 * A page that points its own name at this machine passes both, so the app
 * must also have been addressed as this machine.
 */
export function isSameOriginJson(headers: Headers): boolean {
  if (!headers.get("content-type")?.trim().toLowerCase().startsWith("application/json")) return false;
  if (!isLoopbackHost(headers.get("host"))) return false;
  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin" && fetchSite !== "none") return false;
  const origin = headers.get("origin");
  if (origin === null) return true;
  try {
    return new URL(origin).host === headers.get("host");
  } catch {
    return false;
  }
}

export type AskPost = { id: string; content: PostContent };

export function readAskPosts(db: DatabaseSync, readPostContent: (db: DatabaseSync, postIds: string[]) => Map<string, PostContent>): AskPost[] {
  const postIds = db
    .prepare(`SELECT id FROM posts WHERE id IN (SELECT id FROM visible_posts) ORDER BY created_at DESC, id`)
    .all()
    .map((row) => String(row.id));
  const contents = readPostContent(db, postIds);
  return postIds.flatMap((id) => {
    const content = contents.get(id);
    return content ? [{ id, content }] : [];
  });
}

export type AskDeps = {
  jev: JevClient;
  buildRequest: (query: string, posts: AskPost[]) => JevRequest;
  questionId: (postId: string) => string;
  hasSomethingToJudge: (content: PostContent) => boolean;
  /** Posts per request. */
  chunkSize: number;
  /** Requests in flight at once. */
  concurrency: number;
  bands: Bands;
  onChunkError?: (error: unknown) => void;
};

/**
 * Judges every post against one search and yields the answers as each request
 * returns. A failed request becomes an error record and the rest carry on. An
 * abort cancels the requests in flight and ends the stream with no more records.
 */
export async function* askPosts(deps: AskDeps, rawQuery: string, posts: AskPost[], signal?: AbortSignal): AsyncGenerator<AskRecord> {
  const query = cleanQuery(rawQuery);
  if (query === null) return;
  yield { type: "start", total: posts.length, bands: deps.bands };

  const judgeable: AskPost[] = [];
  const empty: AskScore[] = [];
  for (const post of posts) {
    // Asked anyway, Jev answers near the unsure line for a post that says nothing.
    if (deps.hasSomethingToJudge(post.content)) judgeable.push(post);
    else empty.push({ postId: post.id, probability: 0 });
  }
  if (empty.length > 0) yield { type: "scores", scores: empty };

  const chunks: AskPost[][] = [];
  const size = Math.max(1, deps.chunkSize);
  for (let start = 0; start < judgeable.length; start += size) chunks.push(judgeable.slice(start, start + size));

  const ready: AskRecord[] = [];
  let wake = (): void => {};
  const judge = async (chunk: AskPost[]): Promise<void> => {
    try {
      const answers = await deps.jev.ask(deps.buildRequest(query, chunk), { signal });
      const scores = chunk.map(({ id }) => {
        const probability = answers[deps.questionId(id)];
        if (typeof probability !== "number" || !(probability >= 0 && probability <= 1)) throw new Error(`No probability for post ${id}`);
        return { postId: id, probability };
      });
      ready.push({ type: "scores", scores });
    } catch (error) {
      if (signal?.aborted) return;
      deps.onChunkError?.(error);
      ready.push({ type: "error", posts: chunk.length });
    }
  };

  let next = 0;
  let working = Math.min(Math.max(1, deps.concurrency), chunks.length);
  for (let worker = 0; worker < working; worker++) {
    void (async () => {
      while (next < chunks.length && !signal?.aborted) {
        await judge(chunks[next++]);
        wake();
      }
      working--;
      wake();
    })();
  }

  while (working > 0 || ready.length > 0) {
    if (signal?.aborted) return;
    if (ready.length === 0) await new Promise<void>((resolve) => (wake = resolve));
    yield* ready.splice(0);
  }
  if (!signal?.aborted) yield { type: "done" };
}

/**
 * The posts a search matched, under the filters that still apply while asking:
 * collection, author, time range, media, and hidden posts. Confident matches
 * come first, then unsure ones, each strongest first. The category selection
 * and the keyword belong to browsing and are set aside.
 */
export function rankAsk(snapshot: Snapshot, filter: FilterState, scores: AskScore[], bands: Bands, now: number): FilterResult {
  const result = applyFilter(snapshot, { ...filter, topicIds: [], areaIds: [], unfiled: false, keyword: "" }, now);
  const probability = new Map(scores.map((score) => [score.postId, score.probability]));
  const strongestFirst = (a: { id: string }, b: { id: string }): number => (probability.get(b.id) ?? 0) - (probability.get(a.id) ?? 0);
  const matched = result.posts.filter((post) => (probability.get(post.id) ?? 0) >= bands.unsure);
  const confident = matched.filter((post) => (probability.get(post.id) ?? 0) >= bands.confident).sort(strongestFirst);
  const unsure = matched.filter((post) => (probability.get(post.id) ?? 0) < bands.confident).sort(strongestFirst);
  return { ...result, posts: [...confident, ...unsure], unsureStart: confident.length };
}

async function* readAskStream(body: ReadableStream<Uint8Array>): AsyncGenerator<AskRecord> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffered += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) if (line.trim() !== "") yield JSON.parse(line) as AskRecord;
      if (done) break;
    }
    if (buffered.trim() !== "") yield JSON.parse(buffered) as AskRecord;
  } finally {
    reader.cancel().catch(() => {});
  }
}

export type AskState = {
  query: string;
  /** "failed" when the request was refused or broke off before it finished. */
  status: "running" | "done" | "failed";
  /** Posts being judged; null until the server says. */
  total: number | null;
  /** Posts answered so far by this request. */
  judged: number;
  /** Posts this request could not get an answer for. */
  failed: number;
  scores: AskScore[];
  bands: Bands | null;
};

export type AskRunner = {
  subscribe: (listener: () => void) => () => void;
  getState: () => AskState | null;
  /** Starts a search, cancelling the one in flight. An empty search is ignored. */
  ask: (query: string) => void;
  clear: () => void;
};

/**
 * Runs one search at a time against `send` and holds what the screen shows.
 * Only the latest search may change the state, so a late answer to an earlier
 * one is never shown. Asking the same search again keeps its earlier answers
 * on screen while fresh ones replace them.
 */
export function createAskRunner(send: (query: string, signal: AbortSignal) => Promise<Response>): AskRunner {
  let state: AskState | null = null;
  let inFlight: AbortController | null = null;
  const listeners = new Set<() => void>();

  const set = (next: AskState | null): void => {
    state = next;
    for (const listener of listeners) listener();
  };

  const run = async (query: string, abort: AbortController): Promise<void> => {
    const current = (): boolean => inFlight === abort;
    const answers = new Map((state?.scores ?? []).map((score) => [score.postId, score.probability]));
    let finished = false;
    try {
      const response = await send(query, abort.signal);
      if (!current()) return;
      if (!response.ok || !response.body) throw new Error("refused");
      for await (const record of readAskStream(response.body)) {
        if (!current() || !state) return;
        if (record.type === "start") set({ ...state, total: record.total, bands: record.bands });
        else if (record.type === "error") set({ ...state, failed: state.failed + record.posts });
        else if (record.type === "done") finished = true;
        else {
          for (const score of record.scores) answers.set(score.postId, score.probability);
          const scores = [...answers].map(([postId, probability]) => ({ postId, probability }));
          set({ ...state, judged: state.judged + record.scores.length, scores });
        }
      }
    } catch {
      // Handled below: anything short of a finished stream is a failure.
    }
    if (current() && state) set({ ...state, status: finished ? "done" : "failed" });
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState: () => state,
    ask(rawQuery) {
      const query = cleanQuery(rawQuery);
      if (query === null) return;
      inFlight?.abort();
      const abort = (inFlight = new AbortController());
      const kept = state?.query === query ? state : null;
      set({ query, status: "running", total: null, judged: 0, failed: 0, scores: kept?.scores ?? [], bands: kept?.bands ?? null });
      void run(query, abort);
    },
    clear() {
      inFlight?.abort();
      inFlight = null;
      set(null);
    },
  };
}
