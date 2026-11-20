"use client";

import { Button } from "@ui-sdk/react/button";
import { DialogTrigger } from "@ui-sdk/react/dialog";
import { CircleCheck, CloudOff, KeyRound, RefreshCw, TriangleAlert, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { requestSync } from "@/app/actions";
import type { SyncState } from "@/lib/types";

import type { ConnectXController } from "./connect-x-dialog";
import { describeSync, type PanelIcon } from "./sync-panel";

const ICONS: Record<PanelIcon, LucideIcon> = { ok: CircleCheck, warning: TriangleAlert, syncing: RefreshCw, offline: CloudOff };

const POLL_MS = 5_000;
// The worker starts a due run at its next tick, up to half a minute later.
const AFTER_NEXT_RUN_MS = 32_000;

export type SyncController = { state: SyncState; update: (next: SyncState) => void };

async function fetchSyncState(): Promise<SyncState | null> {
  try {
    const response = await fetch("/api/sync-status", { headers: { "Content-Type": "application/json" }, cache: "no-store" });
    return response.ok ? ((await response.json()) as SyncState) : null;
  } catch {
    return null;
  }
}

/** A run that has just finished: the posts and the run record on the page are out of date. */
const finished = (before: SyncState, after: SyncState): boolean =>
  !after.running &&
  (before.running || before.lastRun?.id !== after.lastRun?.id || before.lastRun?.status !== after.lastRun?.status);

/**
 * The sync state the panel shows: what the page was rendered with, or a
 * newer read. It polls only while a run is in progress or requested, and
 * reads once more on window focus and when the next scheduled run is due.
 * When a run finishes it refreshes the page, so the new posts show.
 */
export function useSyncStatus(initial: SyncState): SyncController {
  const router = useRouter();
  const [latest, setLatest] = useState<SyncState | null>(null);
  const state = latest !== null && latest.readAt > initial.readAt ? latest : initial;
  const shown = useRef(state);
  useEffect(() => {
    shown.current = state;
  });

  const update = useCallback(
    (next: SyncState) => {
      if (finished(shown.current, next)) router.refresh();
      shown.current = next;
      setLatest(next);
    },
    [router],
  );
  const poll = useCallback(async () => {
    const next = await fetchSyncState();
    if (next) update(next);
  }, [update]);

  const active = state.running || (state.requested && state.workerAlive);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, [active, poll]);

  useEffect(() => {
    window.addEventListener("focus", poll);
    return () => window.removeEventListener("focus", poll);
  }, [poll]);

  const { nextRunAt } = state;
  useEffect(() => {
    const due = nextRunAt === null ? Number.NaN : Date.parse(nextRunAt);
    if (Number.isNaN(due)) return;
    const timer = setTimeout(poll, Math.max(0, due - Date.now()) + AFTER_NEXT_RUN_MS);
    return () => clearTimeout(timer);
  }, [nextRunAt, poll]);

  return { state, update };
}

const SIDE_TEXT_BUTTON =
  "focus-ring-side pressable inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border-0 px-3 text-[12px] font-semibold text-side-ink";

/** The sidebar's sync panel: status, X connection, the fallback warning and one action. */
export function SyncStatus({ sync, connectX }: { sync: SyncController; connectX: ConnectXController }) {
  const panel = describeSync(sync.state, sync.state.readAt);
  const [refusal, setRefusal] = useState<string | null>(null);
  const Icon = ICONS[panel.icon];

  const syncNow = async () => {
    setRefusal(null);
    try {
      const result = await requestSync();
      if (result.ok) sync.update(result.sync);
      else setRefusal(result.message);
    } catch {
      setRefusal("Sync now did not go through. Try again.");
    }
  };

  return (
    <div className={`flex flex-col gap-2 rounded-[12px] px-2.5 py-2 ${panel.warning ? "bg-side-wash" : ""}`}>
      <div role="status" className="flex items-start gap-2.5">
        <Icon
          className={`mt-0.5 size-4 shrink-0 ${panel.warning ? "text-side-ink" : "text-side-muted"} ${panel.icon === "syncing" ? "animate-spin [animation-duration:2.4s] motion-reduce:animate-none" : ""}`}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-[13px] leading-tight font-semibold text-side-ink">{panel.title}</p>
          {panel.detail ? (
            <p className={`mt-1 text-[12px] leading-snug ${panel.clamp ? "line-clamp-2" : ""} ${panel.warning ? "text-side-ink" : "text-side-muted"}`}>
              {panel.detail}
            </p>
          ) : null}
          {panel.synced ? <p className="mt-1 text-[12px] leading-snug text-side-ink">{panel.synced}</p> : null}
          {panel.nextRun ? <p className="mt-1 text-[12px] leading-snug text-side-muted">{panel.nextRun}</p> : null}
        </div>
      </div>

      {panel.fallbackWarning ? (
        <p className="flex items-start gap-2.5 text-[12px] leading-snug text-side-ink">
          <KeyRound className="mt-px size-4 shrink-0" aria-hidden="true" />
          {panel.fallbackWarning}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5 pl-6">
        {panel.action.label === "Sync now" ? (
          <Button
            data-sync-action=""
            disabled={panel.action.disabled}
            focusableWhenDisabled
            pendingAnnouncement="Asking for a sync"
            onClick={syncNow}
            className={`${SIDE_TEXT_BUTTON} bg-side-wash hover:bg-side-hover data-disabled:cursor-default data-disabled:opacity-60 data-pending:cursor-progress`}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Sync now
          </Button>
        ) : (
          <DialogTrigger data-sync-action="" controller={connectX} className={`${SIDE_TEXT_BUTTON} bg-side-wash hover:bg-side-hover`}>
            {panel.action.label}
          </DialogTrigger>
        )}
        {panel.connection ? (
          <DialogTrigger
            controller={connectX}
            aria-label={`${panel.connection}. Manage the X connection`}
            className={`${SIDE_TEXT_BUTTON} min-w-0 bg-transparent font-medium text-side-muted hover:bg-side-hover hover:text-side-ink`}
          >
            <span className="truncate">{panel.connection}</span>
          </DialogTrigger>
        ) : null}
      </div>
      {refusal ? (
        <p role="alert" className="pl-6 text-[12px] leading-snug text-side-ink">
          {refusal}
        </p>
      ) : null}
    </div>
  );
}
