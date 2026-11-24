import { Check, RefreshCw } from "lucide-react";

import { relativeTime } from "./format";
import type { SyncProgress } from "./sync-progress";

const SPIN = "animate-spin [animation-duration:2.4s] motion-reduce:animate-none";

const TONES = {
  side: {
    ink: "text-side-ink",
    muted: "text-side-muted",
    doneMark: "bg-side-ink text-side-0",
    todoMark: "shadow-[inset_0_0_0_1.5px_var(--color-side-muted)]",
    list: "gap-2",
    mark: "size-4 text-[10px]",
    check: "size-2.5",
    spin: "size-4",
    label: "text-[13px]",
    detail: "text-[12px]",
  },
  page: {
    ink: "text-ink",
    muted: "text-ink-muted",
    doneMark: "bg-ink text-surface",
    todoMark: "shadow-[inset_0_0_0_1.5px_var(--color-ink-muted)]",
    list: "gap-3",
    mark: "size-5 text-[11px]",
    check: "size-3",
    spin: "size-5",
    label: "text-[15px]",
    detail: "text-[13px]",
  },
};

const STATUS_TEXT = { done: ", done", current: ", in progress", upcoming: ", to do" };

export function SyncStepsList({ progress, tone }: { progress: SyncProgress; tone: keyof typeof TONES }) {
  const t = TONES[tone];
  return (
    <ol aria-label="Sync steps" className={`m-0 flex list-none flex-col p-0 ${t.list}`}>
      {progress.phases.map((phase, index) => (
        <li key={phase.key} aria-current={phase.status === "current" ? "step" : undefined} className="flex min-w-0 items-start gap-2.5">
          <span
            aria-hidden="true"
            className={`mt-px flex shrink-0 items-center justify-center rounded-full font-bold tabular-nums ${t.mark} ${
              phase.status === "done" ? t.doneMark : phase.status === "current" ? t.ink : `${t.muted} ${t.todoMark}`
            }`}
          >
            {phase.status === "done" ? <Check className={t.check} strokeWidth={3} /> : phase.status === "current" ? <RefreshCw className={`${t.spin} ${SPIN}`} /> : index + 1}
          </span>
          <div className="min-w-0">
            <p className={`${t.label} leading-tight ${phase.status === "upcoming" ? `font-medium ${t.muted}` : `font-semibold ${t.ink}`}`}>
              {phase.label}
              <span className="sr-only">{STATUS_TEXT[phase.status]}</span>
            </p>
            {phase.detail ? <p className={`mt-0.5 ${t.detail} leading-snug text-balance ${t.muted}`}>{phase.detail}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function SidebarSyncSteps({ progress, now }: { progress: SyncProgress; now: number }) {
  return (
    <div role="status" className="flex flex-col gap-2.5 rounded-[12px] bg-side-wash px-2.5 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] leading-tight font-semibold text-side-ink">First sync</p>
        {progress.startedAt ? <p className="shrink-0 text-[12px] text-side-muted tabular-nums">Started {relativeTime(progress.startedAt, now)}</p> : null}
      </div>
      <SyncStepsList progress={progress} tone="side" />
    </div>
  );
}
