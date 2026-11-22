"use client";

import { Button } from "@ui-sdk/react/button";
import { DialogTrigger } from "@ui-sdk/react/dialog";
import { AtSign, CircleCheck, CloudOff, KeyRound, RefreshCw, TriangleAlert, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { requestSync } from "@/app/actions";
import type { SyncState } from "@/lib/types";

import type { ConnectXController } from "./connect-x-dialog";
import { describeSync, type PanelIcon } from "./sync-panel";
import { Tip } from "./tip";

const ICONS: Record<PanelIcon, LucideIcon> = { ok: CircleCheck, warning: TriangleAlert, syncing: RefreshCw, offline: CloudOff };

const POLL_MS = 5_000;
const CLOCK_MS = 60_000;
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

const finished = (before: SyncState, after: SyncState): boolean =>
  !after.running &&
  (before.running || before.lastRun?.id !== after.lastRun?.id || before.lastRun?.status !== after.lastRun?.status);

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

export const SIDE_FOOTER_ROW =
  "focus-ring-side pressable flex h-8 w-full cursor-pointer items-center justify-start gap-2.5 rounded-[10px] border-0 bg-transparent px-2.5 text-left text-[13px] font-medium text-side-ink hover:bg-side-hover pointer-coarse:h-10";

function useMinuteClock(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, CLOCK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  return now;
}

export function SyncStatus({ sync, connectX }: { sync: SyncController; connectX: ConnectXController }) {
  const clock = useMinuteClock();
  const { readAt } = sync.state;
  const panel = describeSync(sync.state, clock === null ? readAt : Math.max(clock, readAt));
  const [refused, setRefused] = useState<{ message: string; readAt: number } | null>(null);
  const refusal = refused !== null && refused.readAt === readAt ? refused.message : null;
  const Icon = ICONS[panel.icon];
  const compact = !panel.warning && panel.action.label === "Sync now";

  const syncNow = async () => {
    setRefused(null);
    try {
      const result = await requestSync();
      if (result.ok) sync.update(result.sync);
      else setRefused({ message: result.message, readAt });
    } catch {
      setRefused({ message: "Sync now did not go through. Try again.", readAt });
    }
  };

  return (
    <>
      <div className={compact ? "flex items-center gap-1 py-0.5 pl-2.5" : `flex flex-col gap-2 rounded-[12px] px-2.5 py-2 ${panel.warning ? "bg-side-wash" : ""}`}>
        <div role="status" className="flex min-w-0 flex-1 items-start gap-2.5">
          <Icon
            className={`mt-0.5 size-4 shrink-0 ${panel.warning ? "text-side-ink" : "text-side-muted"} ${panel.icon === "syncing" ? "animate-spin [animation-duration:2.4s] motion-reduce:animate-none" : ""}`}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className={`text-[13px] leading-tight font-semibold text-side-ink ${compact ? "truncate" : ""}`}>{panel.title}</p>
            {compact ? (
              <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-side-muted">{panel.detail ?? panel.nextRun ?? panel.synced}</p>
            ) : (
              <>
                {panel.detail ? (
                  <p className={`mt-1 text-[12px] leading-snug ${panel.clamp ? "line-clamp-2" : ""} ${panel.warning ? "text-side-ink" : "text-side-muted"}`}>
                    {panel.detail}
                  </p>
                ) : null}
                {panel.synced ? <p className="mt-1 text-[12px] leading-snug text-side-ink">{panel.synced}</p> : null}
                {panel.nextRun ? <p className="mt-1 text-[12px] leading-snug text-side-muted">{panel.nextRun}</p> : null}
              </>
            )}
          </div>
        </div>

        {compact ? (
          <Tip label={panel.action.disabled ? "Syncing" : "Sync now"}>
            <Button
              data-sync-action=""
              aria-label="Sync now"
              disabled={panel.action.disabled}
              focusableWhenDisabled
              pendingAnnouncement="Asking for a sync"
              onClick={syncNow}
              className="focus-ring-side pressable flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-side-muted hover:bg-side-hover hover:text-side-ink data-disabled:cursor-default data-disabled:opacity-60 data-disabled:hover:bg-transparent data-pending:cursor-progress pointer-coarse:size-11"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
            </Button>
          </Tip>
        ) : (
          <div className="pl-6">
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
          </div>
        )}
      </div>

      {panel.fallbackWarning ? (
        <p className="flex items-start gap-2.5 px-2.5 py-1 text-[12px] leading-snug text-side-ink">
          <KeyRound className="mt-px size-4 shrink-0" aria-hidden="true" />
          {panel.fallbackWarning}
        </p>
      ) : null}
      {refusal ? (
        <p role="alert" className="py-1 pr-2.5 pl-9 text-[12px] leading-snug text-side-ink">
          {refusal}
        </p>
      ) : null}

      {panel.connection ? (
        <DialogTrigger controller={connectX} aria-label={`${panel.connection}. Manage the X connection`} className={SIDE_FOOTER_ROW}>
          <AtSign className="size-4 shrink-0 text-side-muted" aria-hidden="true" />
          <span className="min-w-0 truncate text-side-muted">{panel.connection}</span>
        </DialogTrigger>
      ) : null}
    </>
  );
}
