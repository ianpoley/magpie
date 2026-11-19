"use server";

import { existsSync } from "node:fs";

import { refresh } from "next/cache";

import { engineConfig, engineEdits, engineStore } from "@/lib/engine";
import type { ActionResult, UndoStep } from "@/lib/types";

type Store = ReturnType<Awaited<ReturnType<typeof engineStore>>["openStore"]>;
type Edits = Awaited<ReturnType<typeof engineEdits>>;

const MAX_NAME_CHARS = 200;
const MAX_QUERY_CHARS = 500;
const MAX_POST_ID_CHARS = 64;
const MAX_PIN_SCORES = 50_000;

class InvalidInput extends Error {}

function id(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new InvalidInput(`${what} is not an id.`);
  return value;
}

function postId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_POST_ID_CHARS) {
    throw new InvalidInput("That is not a post id.");
  }
  return value;
}

function words(value: unknown, what: string, max: number): string {
  if (typeof value !== "string") throw new InvalidInput(`${what} must be text.`);
  if (value.length > max) throw new InvalidInput(`${what} can be at most ${max} characters.`);
  return value;
}

function flag(value: unknown): boolean {
  if (typeof value !== "boolean") throw new InvalidInput("Expected true or false.");
  return value;
}

function pinScores(value: unknown): { postId: string; probability: number }[] {
  if (!Array.isArray(value) || value.length > MAX_PIN_SCORES) throw new InvalidInput("The scores are not a list of the expected size.");
  return value.map((entry: unknown) => {
    const score = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
    if (typeof score.probability !== "number") throw new InvalidInput("A score is not a number.");
    return { postId: postId(score.postId), probability: score.probability };
  });
}

/**
 * Runs one edit against the store. `prepare` checks the arguments before the
 * store is opened; a server action is an endpoint anyone on this machine can
 * post to, so nothing it receives is trusted to have the declared type.
 */
async function withStore<A, T extends object>(
  options: { write: boolean },
  prepare: () => A,
  run: (db: Store, edits: Edits, args: A) => T,
): Promise<ActionResult<T>> {
  let args: A;
  try {
    args = prepare();
  } catch (error) {
    if (error instanceof InvalidInput) return { ok: false, code: "invalid_input", message: error.message };
    throw error;
  }
  const [{ openStore }, edits, { paths }] = await Promise.all([engineStore(), engineEdits(), engineConfig()]);
  const { store } = paths();
  // Opening for writing would create the store; only the sync job does that.
  if (!existsSync(store)) return { ok: false, code: "no_store", message: "Nothing has been synced yet." };
  let result: T;
  try {
    const db = openStore(store, { readOnly: !options.write });
    try {
      result = run(db, edits, args);
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof edits.EditError) return { ok: false, code: error.code, message: error.message };
    console.error(error);
    return { ok: false, code: "failed", message: "The change could not be saved." };
  }
  if (options.write) refresh();
  return { ok: true, ...result };
}

const WRITE = { write: true };

export async function renameTopic(topicId: number, name: string) {
  return withStore(
    WRITE,
    () => ({ topicId: id(topicId, "The topic"), name: words(name, "A name", MAX_NAME_CHARS) }),
    (db, edits, args) => edits.renameTopic(db, args.topicId, args.name),
  );
}

export async function renameArea(areaId: number, name: string) {
  return withStore(
    WRITE,
    () => ({ areaId: id(areaId, "The area"), name: words(name, "A name", MAX_NAME_CHARS) }),
    (db, edits, args) => edits.renameArea(db, args.areaId, args.name),
  );
}

export async function mergeTopics(fromId: number, intoId: number) {
  return withStore(
    WRITE,
    () => ({ fromId: id(fromId, "The topic to merge"), intoId: id(intoId, "The topic to merge into") }),
    (db, edits, args) => edits.mergeTopics(db, args.fromId, args.intoId),
  );
}

export async function deleteTopic(topicId: number) {
  return withStore(WRITE, () => id(topicId, "The topic"), (db, edits, topic) => edits.deleteTopic(db, topic));
}

export async function deleteArea(areaId: number) {
  return withStore(WRITE, () => id(areaId, "The area"), (db, edits, area) => edits.deleteArea(db, area));
}

export async function setTopicHidden(topicId: number, hidden: boolean) {
  return withStore(
    WRITE,
    () => ({ topicId: id(topicId, "The topic"), hidden: flag(hidden) }),
    (db, edits, args) => edits.setTopicHidden(db, args.topicId, args.hidden),
  );
}

export async function setAreaHidden(areaId: number, hidden: boolean) {
  return withStore(
    WRITE,
    () => ({ areaId: id(areaId, "The area"), hidden: flag(hidden) }),
    (db, edits, args) => edits.setAreaHidden(db, args.areaId, args.hidden),
  );
}

export async function addPostTopic(post: string, topicId: number) {
  return withStore(
    WRITE,
    () => ({ post: postId(post), topicId: id(topicId, "The topic") }),
    (db, edits, args) => edits.addPostTopic(db, args.post, args.topicId),
  );
}

export async function removePostTopic(post: string, topicId: number) {
  return withStore(
    WRITE,
    () => ({ post: postId(post), topicId: id(topicId, "The topic") }),
    (db, edits, args) => edits.removePostTopic(db, args.post, args.topicId),
  );
}

export async function pinQuery(query: string, scores: { postId: string; probability: number }[]) {
  return withStore(
    WRITE,
    () => ({ query: words(query, "A search", MAX_QUERY_CHARS), scores: pinScores(scores) }),
    (db, edits, args) => edits.pinQuery(db, args),
  );
}

export async function unpin(topicId: number) {
  return withStore(WRITE, () => id(topicId, "The topic"), (db, edits, topic) => edits.unpin(db, topic));
}

/** Every change that undoing this one would reverse, newest first, for the confirmation. */
export async function listUndo(changeId: number) {
  return withStore(
    { write: false },
    () => id(changeId, "The change"),
    (db, edits, change): { changes: UndoStep[] } => ({ changes: edits.listUndo(db, change) }),
  );
}

export async function undoChange(changeId: number) {
  return withStore(WRITE, () => id(changeId, "The change"), (db, edits, change) => edits.undoChange(db, change));
}
