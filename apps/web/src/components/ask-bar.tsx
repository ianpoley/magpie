"use client";

import { Button } from "@ui-sdk/react/button";
import { Progress, ProgressIndicator, ProgressTrack } from "@ui-sdk/react/progress";
import { Pin, RotateCw, Sparkles, X } from "lucide-react";

import type { AskState } from "@/lib/ask";

import { formatCount, plural } from "./format";
import { iconButton, primaryAnswer, quietAnswer } from "./styles";
import { Tip } from "./tip";

function progressText(ask: AskState): string {
  if (ask.total === null) return ask.status === "failed" ? "The search could not be run." : "Reading your saved posts…";
  const total = `${formatCount(ask.total)} ${plural(ask.total, "post")}`;
  if (ask.status === "running") return `Judged ${formatCount(ask.judged + ask.failed)} of ${total}`;
  if (ask.status === "failed") return `Stopped after ${formatCount(ask.judged)} of ${total}.`;
  if (ask.failed > 0) return `Judged ${formatCount(ask.judged)} of ${total}. ${formatCount(ask.failed)} could not be judged.`;
  return `Judged all ${total}`;
}

/**
 * The header over ask results: the search as typed, how far judging has come,
 * and the ways on from here: keep it as a topic, try again, or leave.
 */
export function AskBar({
  ask,
  onPin,
  onRetry,
  onClear,
}: {
  ask: AskState;
  /** Resolves when the pin has been saved or refused. */
  onPin: () => Promise<void>;
  onRetry: () => void;
  onClear: () => void;
}) {
  const running = ask.status === "running";
  const incomplete = !running && (ask.status === "failed" || ask.failed > 0);
  return (
    <section aria-label="Ask results" className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-card">
      <div className="flex items-center gap-3">
        <span className="bg-primary-fill flex size-9 shrink-0 items-center justify-center rounded-[12px] text-on-primary">
          <Sparkles className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-eyebrow text-ink-muted">Asked</p>
          <h2 className="mt-0.5 truncate text-[16px] leading-tight font-bold text-ink">{ask.query}</h2>
        </div>
        {incomplete ? (
          <Button onClick={onRetry} className={`${quietAnswer} shrink-0 gap-1.5`}>
            <RotateCw className="size-3.5 text-ink-muted" aria-hidden="true" />
            Try again
          </Button>
        ) : null}
        <Button
          onClick={onPin}
          disabled={running || ask.scores.length === 0}
          pendingAnnouncement="Pinning"
          className={`${primaryAnswer} shrink-0 gap-1.5`}
        >
          <Pin className="size-3.5" aria-hidden="true" />
          Pin as topic
        </Button>
        <Tip label="Clear ask">
          <button type="button" aria-label="Clear ask" onClick={onClear} className={iconButton}>
            <X aria-hidden="true" />
          </button>
        </Tip>
      </div>
      <div className="flex flex-col gap-2">
        {running || ask.total !== null ? (
          <Progress
            aria-label="Judging posts"
            value={ask.total === null ? null : ask.judged + ask.failed}
            max={ask.total ?? 100}
            className="min-w-0"
          >
            <ProgressTrack className="h-1.5 rounded-full bg-sunken">
              <ProgressIndicator className="bg-primary-fill rounded-full" />
            </ProgressTrack>
          </Progress>
        ) : null}
        <p aria-live="polite" className={`text-[13px] font-medium tabular-nums ${incomplete ? "text-like-text" : "text-ink-muted"}`}>
          {progressText(ask)}
        </p>
      </div>
    </section>
  );
}
