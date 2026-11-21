import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { after, test, type TestContext } from "node:test";

import { openStore } from "../../../packages/engine/src/store/db.ts";
import { seedArea, seedPost, seedTopic } from "../../../packages/engine/test/fixtures/corpus.ts";
import { tempDir } from "../../../packages/engine/test/fixtures/export.ts";
import { refreshes } from "./fixtures/next-cache.ts";

const scratch = tempDir();
after(scratch.cleanup);
const MISSING_STORE = join(scratch.dir, "missing", "corpus.sqlite");
process.env.MAGPIE_STORE = MISSING_STORE;

const SRC = new URL("../src/", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/cache") return nextResolve(new URL("./fixtures/next-cache.ts", import.meta.url).href, context);
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC).href, context);
    return nextResolve(specifier, context);
  },
});
const actions = await import("../src/app/actions.ts");

const wrongType = <T,>(value: unknown): T => value as T;

function useStore(t: TestContext): { path: string; topicId: number; pinnedAreaId: number } {
  const { dir, cleanup } = tempDir();
  const path = join(dir, "corpus.sqlite");
  const db = openStore(path);
  const topicId = seedTopic(db, "Agents");
  const pinnedAreaId = seedArea(db, "Pinned", { kind: "system" });
  seedPost(db, "p1");
  db.close();
  process.env.MAGPIE_STORE = path;
  t.after(() => {
    process.env.MAGPIE_STORE = MISSING_STORE;
    cleanup();
  });
  return { path, topicId, pinnedAreaId };
}

function read<T>(path: string, fn: (db: ReturnType<typeof openStore>) => T): T {
  const db = openStore(path, { readOnly: true });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

const topicName = (path: string, topicId: number): unknown =>
  read(path, (db) => db.prepare(`SELECT name FROM topics WHERE id = ?`).get(topicId)?.name);

const code = (result: { ok: boolean; code?: string }): string => (result.ok ? "ok" : String(result.code));

test("an id that is not a positive whole number is refused before the store is looked for", async () => {
  const refused = [
    await actions.renameTopic(1.5, "Name"),
    await actions.renameTopic(0, "Name"),
    await actions.renameTopic(wrongType("3"), "Name"),
    await actions.renameArea(-1, "Name"),
    await actions.mergeTopics(1, wrongType(null)),
    await actions.deleteTopic(Number.NaN),
    await actions.deleteArea(wrongType("1")),
    await actions.setTopicHidden(wrongType({}), true),
    await actions.addPostTopic("p1", 2 ** 60),
    await actions.listUndo(wrongType("1")),
    await actions.undoChange(0),
  ];

  assert.deepEqual(refused.map(code), refused.map(() => "invalid_input"));
});

test("a name, a search or a post id over its length limit is refused, and one at the limit is not", async () => {
  assert.equal(code(await actions.renameTopic(1, "n".repeat(201))), "invalid_input");
  assert.equal(code(await actions.renameArea(1, "n".repeat(201))), "invalid_input");
  assert.equal(code(await actions.renameTopic(1, wrongType(7))), "invalid_input");
  assert.equal(code(await actions.pinQuery("q".repeat(501), [])), "invalid_input");
  assert.equal(code(await actions.removePost("9".repeat(65))), "invalid_input");
  assert.equal(code(await actions.addPostTopic("", 1)), "invalid_input");
  assert.equal(code(await actions.restorePost(wrongType(12345))), "invalid_input");
  assert.equal(code(await actions.setAreaHidden(1, wrongType("yes"))), "invalid_input");

  assert.equal(code(await actions.renameTopic(1, "n".repeat(200))), "no_store");
  assert.equal(code(await actions.removePost("9".repeat(64))), "no_store");
});

test("pinning refuses scores that are not a list, hold a score without a number, or are too many", async () => {
  assert.equal(code(await actions.pinQuery("agents", wrongType({ postId: "p1", probability: 0.9 }))), "invalid_input");
  assert.equal(code(await actions.pinQuery("agents", [wrongType({ postId: "p1" })])), "invalid_input");
  assert.equal(code(await actions.pinQuery("agents", [wrongType({ postId: "p1", probability: "0.9" })])), "invalid_input");
  assert.equal(code(await actions.pinQuery("agents", [wrongType(null)])), "invalid_input");
  assert.equal(code(await actions.pinQuery("agents", [{ postId: "9".repeat(65), probability: 0.9 }])), "invalid_input");
  const one = { postId: "p1", probability: 0.9 };
  assert.equal(code(await actions.pinQuery("agents", Array.from({ length: 50_001 }, () => one))), "invalid_input");

  assert.equal(code(await actions.pinQuery("agents", Array.from({ length: 50_000 }, () => one))), "no_store");
});

test("an edit before the first sync reports that there is no store and creates none", async () => {
  const before = refreshes.count;

  const result = await actions.renameTopic(1, "Name");

  assert.deepEqual(result, { ok: false, code: "no_store", message: "Nothing has been synced yet." });
  assert.equal(existsSync(MISSING_STORE), false);
  assert.equal(existsSync(join(scratch.dir, "missing")), false);
  assert.equal(refreshes.count, before);
});

test("an edit the store refuses comes back with the reason's code and refreshes nothing", async (t) => {
  const { path, topicId, pinnedAreaId } = useStore(t);
  const before = refreshes.count;

  assert.equal(code(await actions.renameArea(pinnedAreaId, "Mine")), "system_area");
  assert.equal(code(await actions.deleteTopic(topicId + 100)), "unknown_topic");
  assert.equal(code(await actions.addPostTopic("nobody", topicId)), "unknown_post");
  assert.equal(code(await actions.listUndo(999)), "unknown_change");

  assert.equal(read(path, (db) => db.prepare(`SELECT name FROM areas WHERE id = ?`).get(pinnedAreaId)?.name), "Pinned");
  assert.equal(refreshes.count, before);
});

test("an edit that goes through is stored and refreshes the page once", async (t) => {
  const { path, topicId } = useStore(t);
  const before = refreshes.count;

  const result = await actions.renameTopic(topicId, "  Coding agents ");

  assert.deepEqual(result, { ok: true, topicId, name: "Coding agents" });
  assert.equal(topicName(path, topicId), "Coding agents");
  assert.equal(refreshes.count, before + 1);
});

test("a refused edit leaves the store as it was", async (t) => {
  const { path, topicId } = useStore(t);
  const before = refreshes.count;

  assert.equal(code(await actions.renameTopic(topicId, "n".repeat(201))), "invalid_input");
  assert.equal(code(await actions.addPostTopic("9".repeat(65), topicId)), "invalid_input");

  assert.equal(topicName(path, topicId), "Agents");
  assert.equal(read(path, (db) => db.prepare(`SELECT COUNT(*) AS n FROM overrides`).get()?.n), 0);
  assert.equal(refreshes.count, before);
});
