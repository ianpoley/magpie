import assert from "node:assert/strict";
import { test } from "node:test";

import { debugSyncState } from "../src/components/home-debug-flags.ts";
import { syncProgress } from "../src/components/sync-progress.ts";
import type { SyncState } from "../src/lib/types.ts";

const REAL: SyncState = {
  readAt: Date.parse("2026-06-01T12:00:00.000Z"),
  connection: "connected",
  handle: "magpie",
  secretBackend: "keychain",
  secretStoreLocked: false,
  running: false,
  requested: false,
  workerAlive: true,
  nextRunAt: null,
  storeExists: true,
  lastRun: null,
  lastCompleteRunAt: "2026-05-31T12:00:00.000Z",
};

const shown = (state: SyncState) => syncProgress(state).phases.map((phase) => `${phase.label}: ${phase.status}: ${phase.detail}`);

test("a first sync reading links shows the fetch and import done and topics still to come", () => {
  assert.deepEqual(shown(debugSyncState(REAL, "first-sync", "links", false)), [
    "Fetch from X: done: Bookmarks and likes",
    "Import posts: done: Saved on this computer",
    "Read links: current: Reading the links in your posts",
    "Find topics: upcoming: The longest step, often 10 minutes or more",
  ]);
});

test("a first sync past discovery counts the links and is on its last step", () => {
  assert.deepEqual(shown(debugSyncState(REAL, "first-sync", "retag", false)).slice(2), [
    "Read links: done: 3,057 links checked",
    "Find topics: current: Sorting every post into its topics",
  ]);
});

test("a first sync with no stage done yet is fetching from X", () => {
  const state = debugSyncState(REAL, "first-sync", "default", false);
  assert.equal(shown({ ...state, lastRun: state.lastRun && { ...state.lastRun, stages: [] } })[0], "Fetch from X: current: Checking your X sign-in");
});

test("a later sync sorts new posts instead of finding topics", () => {
  const progress = syncProgress(debugSyncState(REAL, "running", "tag", false));
  assert.equal(progress.firstSync, false);
  assert.equal(shown(debugSyncState(REAL, "running", "tag", false))[3], "Sort into topics: current: Tagging new posts");
});

test("a sync that is not running has no start time", () => {
  assert.equal(syncProgress(REAL).startedAt, null);
});
