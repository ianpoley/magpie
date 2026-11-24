import assert from "node:assert/strict";
import { test } from "node:test";

import { debugSyncState, type SyncKind, type SyncStage } from "../src/components/home-debug-flags.ts";
import { describeSync } from "../src/components/sync-panel.ts";
import { defineDebugFlags, toKebabCase } from "../src/lib/debug-flags/define.ts";
import { flagQueryIn, readFlagValueIn, withFlag } from "../src/lib/debug-flags/parse.ts";
import type { SyncState } from "../src/lib/types.ts";

const flags = defineDebugFlags("test", {
  emptyList: { label: "Empty", description: "" },
  rows: { label: "Rows", description: "", control: { type: "number", min: 0, max: 10, step: 2 } },
  role: { key: "as-role", label: "Role", description: "", control: { type: "enum", options: ["viewer", "admin"] } },
  label: { label: "Label", description: "", control: { type: "text" } },
});

test("a flag's key is its property name in kebab case unless it names one", () => {
  assert.equal(toKebabCase("emptyList"), "empty-list");
  assert.equal(toKebabCase("HTMLParser"), "html-parser");
  assert.equal(toKebabCase("sync_stage name"), "sync-stage-name");
  assert.equal(flags.emptyList.key, "empty-list");
  assert.equal(flags.role.key, "as-role");
});

test("a value is read the same from browser params and from a server record", () => {
  for (const params of [new URLSearchParams("empty-list&rows=5&as-role=admin&label=hi"), { "empty-list": "", rows: ["5", "9"], "as-role": "admin", label: "hi" }]) {
    assert.equal(readFlagValueIn(params, flags.emptyList, false), true);
    assert.equal(readFlagValueIn(params, flags.rows, -1), 6);
    assert.equal(readFlagValueIn(params, flags.role, "default"), "admin");
    assert.equal(readFlagValueIn(params, flags.label, ""), "hi");
  }
});

test("an absent or invalid value falls back to the real one", () => {
  const params = new URLSearchParams("rows=lots&as-role=owner");
  assert.equal(readFlagValueIn(params, flags.emptyList, false), false);
  assert.equal(readFlagValueIn(params, flags.rows, -1), -1);
  assert.equal(readFlagValueIn(new URLSearchParams("rows="), flags.rows, -1), -1);
  assert.equal(readFlagValueIn(new URLSearchParams("rows=99"), flags.rows, -1), 10);
  assert.equal(readFlagValueIn(params, flags.role, "default"), "default");
});

test("only declared flags are carried into a rebuilt address, bare keys staying bare", () => {
  assert.equal(flagQueryIn(new URLSearchParams("topics=3&empty-list&as-role=admin&other=1"), [flags]), "empty-list&as-role=admin");
  assert.equal(withFlag("?topics=3&empty-list", "as-role", "viewer"), "topics=3&empty-list&as-role=viewer");
  assert.equal(withFlag("?topics=3&empty-list", "empty-list", null), "topics=3");
});

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

test("each faked sync state puts the sync panel in the state it names", () => {
  const panel = (kind: SyncKind, stage: SyncStage, keyFile: boolean) => describeSync(debugSyncState(REAL, kind, stage, keyFile), REAL.readAt);
  assert.equal(debugSyncState(REAL, "default", "default", false), REAL);
  assert.equal(panel("running", "tag", false).detail, "Tagging posts");
  assert.equal(panel("default", "export", false).detail, "Exporting from Birdclaw");
  assert.equal(debugSyncState(REAL, "first-sync", "default", false).lastCompleteRunAt, null);
  assert.equal(panel("never-synced", "default", false).title, "Nothing synced yet");
  assert.equal(panel("requested", "default", false).kind, "requested");
  assert.equal(panel("no-worker", "default", false).kind, "no_worker");
  assert.equal(panel("needs-reconnect", "default", false).kind, "needs_reconnect");
  assert.equal(panel("keychain-locked", "default", false).kind, "secret_store_locked");
  assert.equal(panel("stage-failed", "default", false).title, "Bookmarks from X failed");
  assert.equal(panel("run-failed", "default", false).title, "Last sync failed");
  assert.equal(panel("export-stale", "default", false).title, "X export is stale");
  assert.equal(panel("stage-warning", "default", false).title, "Link lookup had problems");
  assert.notEqual(panel("synced", "default", true).fallbackWarning, null);
});
