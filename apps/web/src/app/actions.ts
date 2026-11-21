"use server";

import { existsSync, rmSync } from "node:fs";

import { refresh } from "next/cache";

import { MAX_QUERY_CHARS } from "@/lib/ask";
import { engineBirdclaw, engineConfig, engineEdits, engineJev, engineSecrets, engineStore, engineSyncState } from "@/lib/engine";
import { errorName } from "@/lib/error-name";
import { readSyncFiles, readSyncState } from "@/lib/sync-state";
import type { ActionErrorCode, ActionResult, SyncState, UndoStep } from "@/lib/types";

type Store = ReturnType<Awaited<ReturnType<typeof engineStore>>["openStore"]>;
type Edits = Awaited<ReturnType<typeof engineEdits>>;

const MAX_NAME_CHARS = 200;
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

/** Takes a post out of the local corpus. Nothing changes on X. */
export async function removePost(post: string) {
  return withStore(WRITE, () => postId(post), (db, edits, removed) => edits.removePost(db, removed));
}

export async function restorePost(post: string) {
  return withStore(WRITE, () => postId(post), (db, edits, restored) => edits.restorePost(db, restored));
}

export async function pinQuery(query: string, scores: { postId: string; probability: number }[]) {
  return withStore(
    WRITE,
    () => ({ query: words(query, "A search", MAX_QUERY_CHARS), scores: pinScores(scores) }),
    (db, edits, args) => edits.pinQuery(db, args),
  );
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

// None of the X connection and Sync now actions needs the store. Cookie values
// are never logged or sent back: errors are logged by name only.

// What X sets as cookie values, and all the secret store accepts.
const COOKIE = /^[A-Za-z0-9%._-]{1,512}$/;

function cookie(value: unknown, name: string): string {
  if (typeof value !== "string" || !COOKIE.test(value)) {
    throw new InvalidInput(`${name} must be 1 to 512 letters, digits or the characters % . _ - with no spaces or line breaks.`);
  }
  return value;
}

const refused = (code: ActionErrorCode, message: string) => ({ ok: false as const, code, message });

const LOCKED_MESSAGE = "Can't reach the keychain. Unlock it, then try again.";

/** The secret store's failure as the code the UI shows. */
const storeFailure = (reason: "locked" | "unavailable" | "invalid") =>
  reason === "invalid" ? refused("invalid_input", "Those cookies could not be stored.") : refused("secret_store_locked", LOCKED_MESSAGE);

async function guarded<T extends object>(what: string, work: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof InvalidInput) return refused("invalid_input", error.message);
    console.error(`${what}:`, errorName(error));
    return refused("failed", "That did not work. Try again.");
  }
}

/**
 * Checks the pasted cookies with X and stores them only if X accepts them.
 * A stored pair starts a new connection, which also clears a pause after X
 * refused the old one, and asks for a sync.
 */
export async function connectX(authToken: string, ct0: string): Promise<ActionResult<{ handle: string | null; sync: SyncState }>> {
  return guarded("connect X", async () => {
    const session = { authToken: cookie(authToken, "auth_token"), ct0: cookie(ct0, "ct0") };
    const [{ createBirdclaw }, { createSecretStore }, state, { paths }] = await Promise.all([
      engineBirdclaw(),
      engineSecrets(),
      engineSyncState(),
      engineConfig(),
    ]);
    const who = await createBirdclaw().whoami(session);
    if (!who.ok) {
      if (who.reason === "rejected") return refused("x_rejected", "X didn't accept these cookies. Copy fresh ones from a tab where you're signed in to x.com.");
      if (who.reason === "transient") return refused("x_unreachable", "X couldn't be reached. Check your connection and try again.");
      return refused("invalid_input", "Both auth_token and ct0 are needed.");
    }
    const store = createSecretStore();
    const saved = await store.set("x-session", session);
    if (!saved.ok) return storeFailure(saved.reason);
    const files = paths();
    state.writeConnection(files.xConnection, { handle: who.handle, connectedAt: new Date().toISOString() });
    // The first sync waits for the Jev key too: setup asks for it next.
    const jev = await store.get("typesafe-api-key");
    if (!jev.ok || jev.value) state.writeSyncRequest(files.syncRequest);
    return { ok: true, handle: who.handle, sync: await readSyncState() };
  });
}

// What the secret store accepts as an API key.
const API_KEY = /^[\x21\x23-\x26\x28-\x5b\x5d-\x7e]{1,512}$/;

/**
 * Checks the pasted Jev key with TypeSafe and stores it only if TypeSafe
 * accepts it. With X already connected, that completes setup, so it asks for
 * a sync. The key is never logged or sent back.
 */
export async function saveJevKey(key: string): Promise<ActionResult<{ sync: SyncState }>> {
  return guarded("save the Jev key", async () => {
    if (typeof key !== "string" || !API_KEY.test(key)) {
      throw new InvalidInput("The key is 1 to 512 characters with no spaces, quotes or backslashes. Copy it again.");
    }
    const [{ checkJevKey }, { createSecretStore }, state, { paths }] = await Promise.all([engineJev(), engineSecrets(), engineSyncState(), engineConfig()]);
    const checked = await checkJevKey(key);
    if (!checked.ok) {
      if (checked.reason === "rejected") return refused("jev_rejected", "Jev didn't accept this key. Check that you copied all of it.");
      return refused("jev_unreachable", "Jev couldn't be reached. Check your connection and try again.");
    }
    const saved = await createSecretStore().set("typesafe-api-key", key);
    if (!saved.ok) return saved.reason === "invalid" ? refused("invalid_input", saved.message) : refused("secret_store_locked", LOCKED_MESSAGE);
    if ((await readSyncFiles()).connection !== "not_connected") state.writeSyncRequest(paths().syncRequest);
    return { ok: true, sync: await readSyncState() };
  });
}

export async function disconnectX(): Promise<ActionResult<{ sync: SyncState }>> {
  return guarded("disconnect X", async () => {
    const [{ createSecretStore }, { paths }] = await Promise.all([engineSecrets(), engineConfig()]);
    const deleted = await createSecretStore().delete("x-session");
    if (!deleted.ok) return storeFailure(deleted.reason);
    rmSync(paths().xConnection, { force: true });
    return { ok: true, sync: await readSyncState() };
  });
}

export async function requestSync(): Promise<ActionResult<{ sync: SyncState }>> {
  return guarded("request a sync", async () => {
    const [{ paths }, state] = await Promise.all([engineConfig(), engineSyncState()]);
    const current = await readSyncFiles();
    if (current.connection === "not_connected") return refused("not_connected", "Connect X first, then sync.");
    if (current.running) return refused("run_in_progress", "A sync is already running.");
    if (!current.workerAlive) {
      return refused(
        "no_worker",
        "Background sync isn't running. Start it with bun run service:install, or sync once by hand with bun run sync.",
      );
    }
    state.writeSyncRequest(paths().syncRequest);
    return { ok: true, sync: await readSyncState() };
  });
}
