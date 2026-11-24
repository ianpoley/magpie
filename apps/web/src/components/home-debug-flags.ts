import { defineDebugFlags } from "../lib/debug-flags/define.ts";
import type { Run, RunStage, Snapshot, SyncState } from "../lib/types.ts";

const SETUP_STEPS = ["x", "jev", "focus"] as const;
const POSTS_STATES = ["none", "no-store"] as const;
const SYNC_KINDS = ["never-synced", "first-sync", "running", "requested", "synced", "no-worker", "needs-reconnect", "keychain-locked", "stage-failed", "run-failed", "export-stale", "stage-warning"] as const;
const STAGES = ["x_auth", "x_bookmarks", "x_likes", "export", "markdown", "ingest", "links", "tag", "discovery", "evolve", "retag"] as const;

export const homeDebugFlags = defineDebugFlags("home", {
  setup: {
    label: "Setup step",
    description: "Show the setup screen at this step, as if X, the Jev key or the focus were not saved yet. Its forms still save for real: Connect X here replaces your saved X cookies.",
    control: { type: "enum", options: SETUP_STEPS },
  },
  posts: {
    label: "Saved posts",
    description: "Empty the corpus. none keeps the store with no posts in it; no-store is a computer that has never synced.",
    control: { type: "enum", options: POSTS_STATES },
  },
  sync: {
    label: "Sync state",
    description: "Force the sidebar sync panel, and everything that reads it, into this state. never-synced is a fresh clone; first-sync is a running sync that has never finished before. Sync now still asks for a real sync.",
    control: { type: "enum", options: SYNC_KINDS },
  },
  syncStage: {
    label: "Sync stage reached",
    description: "Make the sync run with every stage before this one done. Without a sync state, it implies running.",
    control: { type: "enum", options: STAGES },
  },
  keyFile: {
    label: "Cookies in a file",
    description: "Show the warning for X cookies kept in an owner-only file instead of the keychain.",
  },
});

export type SetupStep = (typeof SETUP_STEPS)[number] | "default";
export type PostsState = (typeof POSTS_STATES)[number] | "default";
export type SyncKind = (typeof SYNC_KINDS)[number] | "default";
export type SyncStage = (typeof STAGES)[number] | "default";

const ago = (state: SyncState, minutes: number) => new Date(state.readAt - minutes * 60_000).toISOString();

const FIRST_SYNC_COUNTS: Record<string, Record<string, number>> = {
  links: { attempted: 3057, resolved: 834, notResource: 2168, failed: 55, resources: 753 },
  tag: { posts: 0, scored: 0 },
  discovery: { areas: 9, topics: 50, posts: 2283 },
  retag: { posts: 2283, scored: 2129, withoutContent: 154 },
};

const stage = (name: string, outcome = "ok", message: string | null = null): RunStage => ({ stage: name, outcome, message, reason: null, counts: FIRST_SYNC_COUNTS[name] ?? {} });

function run(state: SyncState, overrides: Partial<Run>): Run {
  return { id: 1_000_000, startedAt: ago(state, 4), finishedAt: ago(state, 1), status: "complete", upstreamSync: "ok", upstreamSyncDetail: null, message: null, stages: STAGES.map((name) => stage(name)), ...overrides };
}

const stagesBefore = (reached: SyncStage): RunStage[] => STAGES.slice(0, reached === "default" ? 2 : STAGES.indexOf(reached)).map((name) => stage(name));

function running(state: SyncState, reached: SyncStage, firstSync: boolean): SyncState {
  return {
    ...state,
    running: true,
    lastRun: run(state, { status: "running", finishedAt: null, stages: stagesBefore(reached) }),
    lastCompleteRunAt: firstSync ? null : state.lastCompleteRunAt,
  };
}

const SYNC_STATES: Record<Exclude<SyncKind, "default" | "first-sync" | "running">, (state: SyncState) => SyncState> = {
  "never-synced": (state) => ({ ...state, storeExists: false, lastRun: null, lastCompleteRunAt: null }),
  requested: (state) => ({ ...state, requested: true }),
  synced: (state) => ({ ...state, lastRun: run(state, {}), lastCompleteRunAt: ago(state, 1) }),
  "no-worker": (state) => ({ ...state, workerAlive: false, nextRunAt: null }),
  "needs-reconnect": (state) => ({ ...state, connection: "needs_reconnect" }),
  "keychain-locked": (state) => ({ ...state, secretStoreLocked: true }),
  "stage-failed": (state) => ({ ...state, lastRun: run(state, { status: "failed", stages: [stage("x_auth"), stage("x_bookmarks", "failed", "X answered 429: too many requests. Try again in a few minutes.")] }) }),
  "run-failed": (state) => ({ ...state, lastRun: run(state, { status: "failed", stages: [], message: "The sync stopped: the store is locked by another process." }) }),
  "export-stale": (state) => ({ ...state, lastRun: run(state, { upstreamSync: "failed", upstreamSyncDetail: null }) }),
  "stage-warning": (state) => ({ ...state, lastRun: run(state, { stages: STAGES.map((name) => (name === "links" ? stage(name, "warning", "12 links could not be read.") : stage(name))) }) }),
};

export function debugSyncState(state: SyncState, kind: SyncKind, reached: SyncStage, keyFile: boolean): SyncState {
  const real: SyncState = keyFile ? { ...state, secretBackend: "file" } : state;
  const forced = kind === "default" && reached !== "default" ? "running" : kind;
  if (forced === "default") return real;
  const settled: SyncState = { ...real, connection: "connected", secretStoreLocked: false, running: false, requested: false, workerAlive: true, storeExists: true };
  if (forced === "first-sync" || forced === "running") return running(settled, reached, forced === "first-sync");
  return SYNC_STATES[forced](settled);
}

export function debugSnapshot(snapshot: Snapshot, posts: PostsState): Snapshot {
  if (posts === "default") return snapshot;
  return { ...snapshot, storeExists: posts !== "no-store", posts: [], removed: [], areas: [], topics: [], resources: [], ...(posts === "no-store" ? { lastRun: null, lastCompleteRunAt: null } : {}) };
}

export type SetupInputs = { sync: SyncState; jevStored: boolean; focusChosen: boolean };

export function debugSetup(inputs: SetupInputs, step: SetupStep): SetupInputs {
  if (step === "x") return { sync: { ...inputs.sync, connection: "not_connected", handle: null }, jevStored: false, focusChosen: false };
  if (step === "jev") return { sync: { ...inputs.sync, connection: "connected" }, jevStored: false, focusChosen: false };
  if (step === "focus") return { sync: { ...inputs.sync, connection: "connected" }, jevStored: true, focusChosen: false };
  return inputs;
}
