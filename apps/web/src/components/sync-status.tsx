import { CircleCheck, CloudOff, RefreshCw, TriangleAlert, type LucideIcon } from "lucide-react";

import type { Snapshot } from "@/lib/types";

import { relativeTime } from "./format";

const STAGE_NAMES: Record<string, string> = {
  ingest: "Import",
  links: "Link lookup",
  tag: "Tagging",
  discovery: "Category discovery",
  evolve: "Category update",
  retag: "Re-tagging",
};

type Status = { icon: LucideIcon; title: string; detail: string | null; synced?: string; warning: boolean; spinning?: boolean };

function describe(snapshot: Snapshot, now: number): Status {
  const { lastRun, lastCompleteRunAt } = snapshot;
  const synced = lastCompleteRunAt ? `Last full sync ${relativeTime(lastCompleteRunAt, now)}` : "No sync has finished yet";
  if (!snapshot.storeExists || !lastRun) {
    return { icon: CloudOff, title: "Never synced", detail: "The sync job has not run yet", warning: false };
  }

  const failed = lastRun.stages.find((stage) => stage.outcome === "failed");
  if (failed) {
    const name = STAGE_NAMES[failed.stage] ?? failed.stage;
    return { icon: TriangleAlert, title: `${name} failed`, detail: failed.message, synced, warning: true };
  }
  if (lastRun.status === "failed") {
    return { icon: TriangleAlert, title: "Last sync failed", detail: lastRun.message, synced, warning: true };
  }
  if (lastRun.upstreamSync === "failed") {
    return {
      icon: TriangleAlert,
      title: "X export is stale",
      detail: lastRun.upstreamSyncDetail ?? "The last export from X failed, so new saves are missing",
      synced,
      warning: true,
    };
  }
  const warned = lastRun.stages.find((stage) => stage.outcome === "warning");
  if (warned) {
    const name = STAGE_NAMES[warned.stage] ?? warned.stage;
    return { icon: TriangleAlert, title: `${name} had problems`, detail: warned.message, synced, warning: true };
  }
  if (lastRun.status === "running") {
    return { icon: RefreshCw, title: "Syncing now", detail: synced, warning: false, spinning: true };
  }
  return {
    icon: CircleCheck,
    title: lastCompleteRunAt ? `Synced ${relativeTime(lastCompleteRunAt, now)}` : "Synced",
    detail: null,
    warning: false,
  };
}

export function SyncStatus({ snapshot, now }: { snapshot: Snapshot; now: number }) {
  const status = describe(snapshot, now);
  const Icon = status.icon;
  return (
    <div
      role="status"
      className={`flex items-start gap-2.5 rounded-[12px] px-2.5 py-2 ${status.warning ? "bg-side-wash" : ""}`}
    >
      <Icon
        className={`mt-0.5 size-4 shrink-0 ${status.warning ? "text-side-ink" : "text-side-muted"} ${status.spinning ? "animate-spin [animation-duration:2.4s] motion-reduce:animate-none" : ""}`}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-[13px] leading-tight font-semibold text-side-ink">{status.title}</p>
        {status.detail ? (
          <p className={`mt-1 line-clamp-2 text-[12px] leading-snug ${status.warning ? "text-side-ink" : "text-side-muted"}`}>{status.detail}</p>
        ) : null}
        {status.synced ? <p className="mt-1 text-[12px] leading-snug text-side-ink">{status.synced}</p> : null}
      </div>
    </div>
  );
}
