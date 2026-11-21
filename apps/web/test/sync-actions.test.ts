import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { after, test } from "node:test";

import {
  birdCalls,
  cleanupScratch,
  connectionPath,
  freshInstall,
  holdRunLock,
  syncRequestPath,
  resolveLikeNext,
  typesafeCalls,
  writeHeartbeat,
} from "./fixtures/sync-env.ts";
import { createSecretStore } from "../../../packages/engine/src/secrets/store.ts";
import { readConnection, writeConnection } from "../../../packages/engine/src/sync/state.ts";

after(cleanupScratch);
resolveLikeNext();
const actions = await import("../src/app/actions.ts");

const CT0 = "ct0secretVALUE987654";
const GOOD = "good0123456789abcdefTOKEN";
const MINUTE = 60_000;

const storedSession = async () => {
  const read = await createSecretStore().get("x-session");
  assert.equal(read.ok, true);
  return read.ok ? read.value : undefined;
};
const storedJevKey = async () => {
  const read = await createSecretStore().get("typesafe-api-key");
  assert.equal(read.ok, true);
  return read.ok ? read.value : undefined;
};
const saveTestJevKey = async () => assert.equal((await createSecretStore().set("typesafe-api-key", "goodJEVkey")).ok, true);
const code = (result: { ok: boolean; code?: string }): string => (result.ok ? "ok" : String(result.code));
const wrongType = <T,>(value: unknown): T => value as T;

test("connecting with cookies X accepts stores them, starts a new connection, asks for a sync and names the account", async (t) => {
  freshInstall(t);
  await saveTestJevKey();
  const old = { handle: "someone", connectedAt: "2026-01-01T00:00:00.000Z" };
  writeConnection(connectionPath, { ...old, rejection: { generation: old.connectedAt, at: old.connectedAt, message: "401" } });

  const result = await actions.connectX(GOOD, CT0);

  assert.equal(code(result), "ok");
  assert.equal(result.ok && result.handle, "owner");
  assert.deepEqual(await storedSession(), { authToken: GOOD, ct0: CT0 });
  const connection = readConnection(connectionPath);
  assert.equal(connection?.handle, "owner");
  assert.notEqual(connection?.connectedAt, old.connectedAt);
  assert.equal(connection?.rejection, undefined);
  assert.equal(existsSync(syncRequestPath), true);
  const sent = JSON.stringify(result);
  assert.equal(sent.includes(GOOD), false);
  assert.equal(sent.includes(CT0), false);
});

test("connecting X before a Jev key is saved stores the cookies but asks for no sync yet", async (t) => {
  freshInstall(t);

  const result = await actions.connectX(GOOD, CT0);

  assert.equal(code(result), "ok");
  assert.deepEqual(await storedSession(), { authToken: GOOD, ct0: CT0 });
  assert.equal(existsSync(syncRequestPath), false);
});

test("a Jev key TypeSafe accepts is stored, and with X connected setup is done, so a sync is asked for", async (t) => {
  freshInstall(t);
  writeConnection(connectionPath, { handle: "owner", connectedAt: new Date().toISOString() });
  const key = "goodKEY-0123456789abcdef";

  const result = await actions.saveJevKey(key);

  assert.equal(code(result), "ok");
  assert.equal(await storedJevKey(), key);
  assert.equal(existsSync(syncRequestPath), true);
  assert.deepEqual(typesafeCalls(), ["GET /v1/models"]);
  assert.equal(JSON.stringify(result).includes(key), false);
});

test("a Jev key saved before X is connected is stored, and no sync is asked for yet", async (t) => {
  freshInstall(t);

  const result = await actions.saveJevKey("goodKEY-0123456789abcdef");

  assert.equal(code(result), "ok");
  assert.equal(await storedJevKey(), "goodKEY-0123456789abcdef");
  assert.equal(existsSync(syncRequestPath), false);
});

test("a Jev key TypeSafe refuses, or that can't be checked, is not stored", async (t) => {
  freshInstall(t);
  writeConnection(connectionPath, { handle: "owner", connectedAt: new Date().toISOString() });

  const rejected = await actions.saveJevKey("wrongKEY-0123456789");
  const offline = await actions.saveJevKey("offlineKEY-0123456789");

  assert.equal(code(rejected), "jev_rejected");
  assert.equal(code(offline), "jev_unreachable");
  assert.equal(await storedJevKey(), null);
  assert.equal(existsSync(syncRequestPath), false);
});

test("a Jev key with a space, a newline or a quote, an empty one, or one that isn't text is refused before TypeSafe is asked", async (t) => {
  freshInstall(t);

  for (const key of ["good key", "goodkey\n", 'good"key', "", wrongType<string>(42)]) {
    assert.equal(code(await actions.saveJevKey(key)), "invalid_input", JSON.stringify(key));
  }
  assert.deepEqual(typesafeCalls(), []);
  assert.equal(await storedJevKey(), null);
});

test("cookies X refuses are reported as rejected and nothing is stored", async (t) => {
  freshInstall(t);

  const result = await actions.connectX("rejected0123456789TOKEN", CT0);

  assert.equal(code(result), "x_rejected");
  assert.equal(await storedSession(), null);
  assert.equal(readConnection(connectionPath), null);
  assert.equal(existsSync(syncRequestPath), false);
  assert.deepEqual(birdCalls(), ["whoami", "bookmarks"]);
});

test("when X cannot be reached the cookies are not stored and the owner is told to try again", async (t) => {
  freshInstall(t);

  const result = await actions.connectX("offline0123456789TOKEN", CT0);

  assert.equal(code(result), "x_unreachable");
  assert.equal(await storedSession(), null);
  assert.equal(readConnection(connectionPath), null);
  assert.equal(existsSync(syncRequestPath), false);
});

test("a cookie with a newline or of the wrong type is refused, naming the field, before X is asked", async (t) => {
  freshInstall(t);

  const newline = await actions.connectX(GOOD, "ct0\nsecret");
  const notText = await actions.connectX(wrongType(42), CT0);
  const empty = await actions.connectX(GOOD, "");

  assert.equal(code(newline), "invalid_input");
  assert.match(newline.ok ? "" : newline.message, /ct0/);
  assert.equal(code(notText), "invalid_input");
  assert.match(notText.ok ? "" : notText.message, /auth_token/);
  assert.equal(code(empty), "invalid_input");
  assert.deepEqual(birdCalls(), []);
  assert.equal(await storedSession(), null);
});

test("when whoami cannot say who it is but a page of bookmarks loads, the cookies are stored with no handle", async (t) => {
  freshInstall(t);

  const result = await actions.connectX("probe0123456789TOKEN", CT0);

  assert.equal(code(result), "ok");
  assert.equal(result.ok && result.handle, null);
  assert.deepEqual(await storedSession(), { authToken: "probe0123456789TOKEN", ct0: CT0 });
  assert.equal(readConnection(connectionPath)?.handle, null);
});

test("Sync now while another run holds the lock says a run is in progress and asks for nothing", async (t) => {
  freshInstall(t);
  writeConnection(connectionPath, { handle: "owner", connectedAt: new Date().toISOString() });
  writeHeartbeat(10_000);
  holdRunLock(t);

  const result = await actions.requestSync();

  assert.equal(code(result), "run_in_progress");
  assert.equal(existsSync(syncRequestPath), false);
});

test("Sync now with no live worker, or with X not connected, says why and asks for nothing", async (t) => {
  freshInstall(t);
  writeHeartbeat(10_000);
  assert.equal(code(await actions.requestSync()), "not_connected");

  writeConnection(connectionPath, { handle: "owner", connectedAt: new Date().toISOString() });
  writeHeartbeat(3 * MINUTE);
  const stale = await actions.requestSync();
  assert.equal(code(stale), "no_worker");
  assert.match(stale.ok ? "" : stale.message, /bun run service:install/);
  assert.equal(existsSync(syncRequestPath), false);
});

test("Sync now with a live worker and X connected asks for a sync and shows it as requested", async (t) => {
  freshInstall(t);
  writeConnection(connectionPath, { handle: "owner", connectedAt: new Date().toISOString() });
  writeHeartbeat(10_000);

  const result = await actions.requestSync();

  assert.equal(code(result), "ok");
  assert.equal(result.ok && result.sync.requested, true);
  assert.equal(existsSync(syncRequestPath), true);
});

test("disconnecting deletes the stored cookies and the connection, after which Sync now needs X connected", async (t) => {
  freshInstall(t);
  writeHeartbeat(10_000);
  assert.equal(code(await actions.connectX(GOOD, CT0)), "ok");

  const result = await actions.disconnectX();

  assert.equal(code(result), "ok");
  assert.equal(await storedSession(), null);
  assert.equal(readConnection(connectionPath), null);
  assert.equal(code(await actions.requestSync()), "not_connected");
});
