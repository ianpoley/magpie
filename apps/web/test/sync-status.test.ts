import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";

import { cleanupScratch, connectionPath, freshInstall, holdRunLock, stateDir, resolveLikeNext, writeHeartbeat } from "./fixtures/sync-env.ts";
import { createSecretStore } from "../../../packages/engine/src/secrets/store.ts";
import { openStore } from "../../../packages/engine/src/store/db.ts";
import { writeConnection, writeSyncRequest } from "../../../packages/engine/src/sync/state.ts";
import type { Run, SyncState } from "../src/lib/types.ts";

after(cleanupScratch);
resolveLikeNext();
const { describeSync } = await import("../src/components/sync-panel.ts");
const { GET } = await import("../src/app/api/sync-status/route.ts");
const { loadSnapshot } = await import("../src/lib/snapshot.ts");

const NOW = Date.parse("2026-06-01T12:00:00.000Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

function run(status: string, stages: [stage: string, outcome: string, message?: string][] = []): Run {
  return {
    id: 7,
    startedAt: at(-10 * MINUTE),
    finishedAt: status === "running" ? null : at(-5 * MINUTE),
    status,
    upstreamSync: "ok",
    upstreamSyncDetail: null,
    message: null,
    stages: stages.map(([stage, outcome, message]) => ({ stage, outcome, message: message ?? null, counts: {} })),
  };
}

function state(overrides: Partial<SyncState> = {}): SyncState {
  return {
    readAt: NOW,
    connection: "connected",
    handle: "owner",
    secretBackend: "keychain",
    secretStoreLocked: false,
    running: false,
    requested: false,
    workerAlive: true,
    nextRunAt: at(HOUR),
    storeExists: true,
    lastRun: run("complete", [["x_auth", "ok"], ["x_bookmarks", "ok"], ["x_likes", "ok"]]),
    lastCompleteRunAt: at(-2 * HOUR),
    ...overrides,
  };
}

test("a run in progress shows as syncing even when one of its stages already failed", () => {
  const panel = describeSync(
    state({ running: true, nextRunAt: null, lastRun: run("running", [["x_auth", "ok"], ["x_bookmarks", "ok"], ["x_likes", "failed", "HTTP 500"]]) }),
    NOW,
  );

  assert.equal(panel.kind, "running");
  assert.equal(panel.title, "Syncing now");
  assert.equal(panel.detail, "Exporting from Birdclaw");
  assert.equal(panel.action.disabled, true);
});

test("each sync state gets its own message and one action, in priority order", () => {
  const rows = [
    [state({ connection: "needs_reconnect", secretStoreLocked: true, running: true }), "needs_reconnect", "X needs reconnecting", "Reconnect X"],
    [state({ secretStoreLocked: true, running: true }), "secret_store_locked", "Can't read the keychain", "Sync now"],
    [state({ connection: "not_connected", handle: null, running: true }), "not_connected", "Connect X to start syncing", "Connect X"],
    [state({ running: true, requested: true }), "running", "Syncing now", "Sync now"],
    [state({ requested: true }), "requested", "Sync requested", "Sync now"],
    [state({ workerAlive: false, nextRunAt: null }), "no_worker", "Background sync isn't running", "Sync now"],
    [state(), "idle", "Synced 2 hr ago", "Sync now"],
  ] as const;

  for (const [input, kind, title, action] of rows) {
    const panel = describeSync(input, NOW);
    assert.deepEqual([panel.kind, panel.title, panel.action.label], [kind, title, action], kind);
  }
});

test("only syncing and a pending request disable Sync now", () => {
  assert.equal(describeSync(state({ requested: true }), NOW).action.disabled, true);
  assert.equal(describeSync(state({ running: true }), NOW).action.disabled, true);
  assert.equal(describeSync(state(), NOW).action.disabled, false);
  assert.equal(describeSync(state({ workerAlive: false }), NOW).action.disabled, false);
  assert.equal(describeSync(state({ secretStoreLocked: true }), NOW).action.disabled, false);
});

test("needing to reconnect is shown in full, beside the warning that secrets are in a file", () => {
  const panel = describeSync(state({ connection: "needs_reconnect", secretBackend: "file", nextRunAt: null }), NOW);

  assert.equal(panel.kind, "needs_reconnect");
  assert.equal(panel.clamp, false);
  assert.match(panel.fallbackWarning ?? "", /file/);
  assert.equal(describeSync(state({ secretBackend: "keychain" }), NOW).fallbackWarning, null);
  assert.equal(describeSync(state({ secretBackend: null }), NOW).fallbackWarning, null);
});

test("an idle install shows its last sync and its next run, and the account it is connected as", () => {
  const panel = describeSync(state(), NOW);

  assert.equal(panel.nextRun, "Next sync in 1 hr");
  assert.equal(panel.connection, "Connected as @owner");
  assert.equal(describeSync(state({ handle: null }), NOW).connection, "Connected");
  assert.equal(describeSync(state({ connection: "not_connected", handle: null }), NOW).connection, null);
});

test("an idle install whose last run failed still says which stage failed", () => {
  const panel = describeSync(state({ lastRun: run("complete", [["x_auth", "ok"], ["x_likes", "failed", "HTTP 500"]]) }), NOW);

  assert.equal(panel.kind, "idle");
  assert.equal(panel.title, "Likes from X failed");
  assert.equal(panel.detail, "HTTP 500");
  assert.equal(panel.warning, true);
});

test("before anything has synced the panel says so, under whichever state applies", () => {
  const empty = { storeExists: false, lastRun: null, lastCompleteRunAt: null };

  assert.equal(describeSync(state(empty), NOW).title, "Nothing synced yet");
  const notConnected = describeSync(state({ ...empty, connection: "not_connected", handle: null, nextRunAt: null }), NOW);
  assert.equal(notConnected.title, "Connect X to start syncing");
  assert.equal(notConnected.synced, "Nothing synced yet");
});

test("the status route says the secrets are in the fallback file, and never sends the cookie values", async (t) => {
  freshInstall(t);
  const session = { authToken: "statusTOKEN0123456789", ct0: "statusCT0abcdef" };
  assert.equal((await createSecretStore().set("x-session", session)).ok, true);
  writeConnection(connectionPath, { handle: "owner", connectedAt: new Date().toISOString() });
  writeHeartbeat(10_000, new Date(Date.now() + HOUR).toISOString());

  const response = await GET(new Request("http://127.0.0.1:3030/api/sync-status", { headers: { host: "127.0.0.1:3030", "content-type": "application/json" } }));
  const body = await response.text();
  const sync = JSON.parse(body) as SyncState;

  assert.equal(response.status, 200);
  assert.equal(sync.secretBackend, "file");
  assert.equal(sync.connection, "connected");
  assert.equal(sync.workerAlive, true);
  assert.match(describeSync(sync, sync.readAt).fallbackWarning ?? "", /file/);
  for (const value of [session.authToken, session.ct0]) assert.equal(body.includes(value), false);
  const snapshot = JSON.stringify(await loadSnapshot());
  for (const value of [session.authToken, session.ct0]) assert.equal(snapshot.includes(value), false);
});

test("the status route shows a run held by another process and a fresh request", async (t) => {
  freshInstall(t);
  writeConnection(connectionPath, { handle: "owner", connectedAt: new Date().toISOString() });
  writeHeartbeat(10_000);
  writeSyncRequest(join(stateDir, "sync-request"));
  holdRunLock(t);

  const response = await GET(new Request("http://127.0.0.1:3030/api/sync-status", { headers: { host: "127.0.0.1:3030", "content-type": "application/json" } }));
  const sync = (await response.json()) as SyncState;

  assert.deepEqual([sync.running, sync.requested], [true, true]);
});

test("the status route reads the last run from the store, and a run that could not read the X session shows the keychain as locked", async (t) => {
  freshInstall(t);
  writeConnection(connectionPath, { handle: "owner", connectedAt: new Date().toISOString() });
  writeHeartbeat(10_000);
  const db = openStore(join(stateDir, "corpus.sqlite"));
  db.prepare(`INSERT INTO runs (started_at, finished_at, status) VALUES (?, ?, 'complete')`).run(at(-3 * HOUR), at(-3 * HOUR));
  const runId = Number(db.prepare(`INSERT INTO runs (started_at, status) VALUES (?, 'running')`).run(at(-MINUTE)).lastInsertRowid);
  db.prepare(`INSERT INTO run_stages (run_id, stage, outcome, counts_json, message) VALUES (?, 'x_auth', 'failed', '{}', ?)`).run(
    runId,
    "The X session could not be read: The secret store is locked or did not answer (security exited 36).",
  );
  db.close();

  const response = await GET(new Request("http://127.0.0.1:3030/api/sync-status", { headers: { host: "127.0.0.1:3030", "content-type": "application/json" } }));
  const sync = (await response.json()) as SyncState;

  assert.deepEqual([sync.storeExists, sync.lastRun?.id, sync.lastRun?.status, sync.lastCompleteRunAt], [true, runId, "running", at(-3 * HOUR)]);
  assert.equal(sync.secretStoreLocked, true);
  assert.equal(describeSync(sync, sync.readAt).kind, "secret_store_locked");
});

test("the status route answers only the app's own page", async () => {
  const crossSite = await GET(
    new Request("http://127.0.0.1:3030/api/sync-status", {
      headers: { host: "127.0.0.1:3030", "content-type": "application/json", "sec-fetch-site": "cross-site" },
    }),
  );
  const elsewhere = await GET(new Request("http://evil.test/api/sync-status", { headers: { host: "evil.test", "content-type": "application/json" } }));

  assert.equal(crossSite.status, 403);
  assert.equal(elsewhere.status, 403);
});

test("a store file that cannot be opened reads as an empty corpus instead of failing the page", async (t) => {
  freshInstall(t);
  writeFileSync(join(stateDir, "corpus.sqlite"), "this is not a database, only some text long enough to be read as a header");

  const snapshot = await loadSnapshot();

  assert.equal(snapshot.posts.length, 0);
  assert.equal(snapshot.lastRun, null);
});
