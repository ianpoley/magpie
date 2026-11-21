import type { Run, SyncState } from "../lib/types.ts";
import { relativeTime, timeUntil } from "./format.ts";

const STAGE_NAMES: Record<string, string> = {
  x_auth: "X sign-in check",
  x_bookmarks: "Bookmarks from X",
  x_likes: "Likes from X",
  export: "Export from Birdclaw",
  markdown: "Markdown build",
  ingest: "Import",
  links: "Link lookup",
  tag: "Tagging",
  discovery: "Category discovery",
  evolve: "Category update",
  retag: "Re-tagging",
};

const DOING_AFTER: Record<string, string> = {
  x_auth: "Syncing bookmarks from X",
  x_bookmarks: "Syncing likes from X",
  x_likes: "Exporting from Birdclaw",
  export: "Building markdown",
  markdown: "Importing posts",
  ingest: "Looking up links",
  links: "Tagging posts",
  tag: "Updating categories",
  discovery: "Finishing up",
  evolve: "Finishing up",
  retag: "Finishing up",
};

export type PanelKind = "needs_reconnect" | "secret_store_locked" | "not_connected" | "running" | "requested" | "no_worker" | "idle";
export type PanelIcon = "ok" | "warning" | "syncing" | "offline";

export type SyncPanel = {
  kind: PanelKind;
  icon: PanelIcon;
  warning: boolean;
  title: string;
  detail: string | null;
  clamp: boolean;
  synced: string | null;
  nextRun: string | null;
  connection: string | null;
  fallbackWarning: string | null;
  action: { label: "Sync now" | "Connect X" | "Reconnect X"; disabled: boolean };
};

function currentStage(run: Run | null): string {
  if (run === null || run.status !== "running") return "Starting";
  const last = run.stages.at(-1);
  if (last === undefined) return "Checking X";
  if (last.stage === "x_auth" && last.outcome === "skipped") return "Building markdown";
  return DOING_AFTER[last.stage] ?? "Syncing";
}

type LastRunView = Pick<SyncPanel, "icon" | "warning" | "title" | "detail" | "synced">;

function lastRunView(state: SyncState, now: number, synced: string | null): LastRunView {
  const { lastRun, lastCompleteRunAt } = state;
  if (!state.storeExists || !lastRun) {
    return { icon: "offline", title: "Nothing synced yet", detail: "The first sync pulls in your whole history", warning: false, synced: null };
  }
  const failed = lastRun.stages.find((stage) => stage.outcome === "failed");
  if (failed) {
    const name = STAGE_NAMES[failed.stage] ?? failed.stage;
    return { icon: "warning", title: `${name} failed`, detail: failed.message, synced, warning: true };
  }
  if (lastRun.status === "failed") {
    return { icon: "warning", title: "Last sync failed", detail: lastRun.message, synced, warning: true };
  }
  if (lastRun.upstreamSync === "failed") {
    return {
      icon: "warning",
      title: "X export is stale",
      detail: lastRun.upstreamSyncDetail ?? "The last export from X failed, so new saves are missing",
      synced,
      warning: true,
    };
  }
  const warned = lastRun.stages.find((stage) => stage.outcome === "warning");
  if (warned) {
    const name = STAGE_NAMES[warned.stage] ?? warned.stage;
    return { icon: "warning", title: `${name} had problems`, detail: warned.message, synced, warning: true };
  }
  return {
    icon: "ok",
    title: lastCompleteRunAt ? `Synced ${relativeTime(lastCompleteRunAt, now)}` : "Synced",
    detail: null,
    synced: null,
    warning: false,
  };
}

export function describeSync(state: SyncState, now: number): SyncPanel {
  const synced = state.lastCompleteRunAt ? `Last full sync ${relativeTime(state.lastCompleteRunAt, now)}` : "Nothing synced yet";
  const syncNow = { label: "Sync now", disabled: false } as const;
  const base = {
    clamp: true,
    synced,
    nextRun: state.nextRunAt ? `Next sync ${timeUntil(state.nextRunAt, now)}` : null,
    connection: state.connection === "connected" ? (state.handle ? `Connected as @${state.handle}` : "Connected") : null,
    fallbackWarning: state.secretBackend === "file" ? "The keychain isn't in use: your X cookies are kept in an owner-only file." : null,
  };

  if (state.connection === "needs_reconnect") {
    return {
      ...base,
      kind: "needs_reconnect",
      icon: "warning",
      warning: true,
      title: "X needs reconnecting",
      detail: "X stopped accepting the saved cookies, so scheduled syncs are paused. Paste fresh ones to start again.",
      clamp: false,
      nextRun: null,
      action: { label: "Reconnect X", disabled: false },
    };
  }
  if (state.secretStoreLocked) {
    return {
      ...base,
      kind: "secret_store_locked",
      icon: "warning",
      warning: true,
      title: "Can't read the keychain",
      detail: "The last sync couldn't read your X cookies. Unlock the keychain, then sync again.",
      action: syncNow,
    };
  }
  if (state.connection === "not_connected") {
    return {
      ...base,
      kind: "not_connected",
      icon: "offline",
      warning: false,
      title: "Connect X to start syncing",
      detail: "Paste your X session cookies once, and syncs run on their own after that.",
      nextRun: null,
      action: { label: "Connect X", disabled: false },
    };
  }
  if (state.running) {
    return {
      ...base,
      kind: "running",
      icon: "syncing",
      warning: false,
      title: "Syncing now",
      detail: currentStage(state.lastRun),
      nextRun: null,
      action: { ...syncNow, disabled: true },
    };
  }
  if (state.requested && state.workerAlive) {
    return {
      ...base,
      kind: "requested",
      icon: "syncing",
      warning: false,
      title: "Sync requested",
      detail: "It starts within half a minute.",
      nextRun: null,
      action: { ...syncNow, disabled: true },
    };
  }
  if (!state.workerAlive) {
    return {
      ...base,
      kind: "no_worker",
      icon: "warning",
      warning: true,
      title: "Background sync isn't running",
      detail: "Start it with bun run service:install.",
      nextRun: null,
      action: syncNow,
    };
  }
  return { ...base, ...lastRunView(state, now, synced), kind: "idle", action: syncNow };
}
