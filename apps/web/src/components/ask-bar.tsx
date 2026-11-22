"use client";

import { Button } from "@ui-sdk/react/button";
import { Progress, ProgressIndicator, ProgressTrack } from "@ui-sdk/react/progress";
import { MessageSquareText, Pin, RotateCw, Sparkles, X } from "lucide-react";

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

export function AskBar({
  ask,
  onPin,
  onRetry,
  onClear,
  onShowAnswer,
}: {
  ask: AskState;
  onPin: () => Promise<void>;
  onRetry: () => void;
  onClear: () => void;
  onShowAnswer: () => void;
}) {
  const running = ask.status === "running";
  const incomplete = !running && (ask.status === "failed" || ask.failed > 0);
  return (
    <section aria-label="Ask results" className="@container flex flex-col gap-3 rounded-card bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-3">
        <span className="bg-primary-fill flex size-9 shrink-0 items-center justify-center rounded-[12px] text-on-primary">
          <Sparkles className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 @max-2xl:basis-[calc(100%-3rem)]">
          <p className="text-eyebrow text-ink-muted">Asked</p>
          <h2 className="mt-0.5 line-clamp-2 text-[16px] leading-tight font-bold break-words text-ink @2xl:line-clamp-1">{ask.query}</h2>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 @max-2xl:flex-1 @max-2xl:pl-12">
          {incomplete ? (
            <Button onClick={onRetry} className={`${quietAnswer} shrink-0 gap-1.5`}>
              <RotateCw className="size-3.5 text-ink-muted" aria-hidden="true" />
              Try again
            </Button>
          ) : null}
          <Button onClick={onShowAnswer} className={`${quietAnswer} shrink-0 gap-1.5 lg:hidden`}>
            <MessageSquareText className="size-3.5 text-ink-muted" aria-hidden="true" />
            Answer
          </Button>
          <Button
            onClick={onPin}
            disabled={running || ask.scores.length === 0}
            pendingAnnouncement="Pinning"
            className={`${primaryAnswer} shrink-0 gap-1.5`}
          >
            <Pin className="size-3.5" aria-hidden="true" />
            Pin as topic
          </Button>
        </div>
        <Tip label="Clear ask">
          <button type="button" aria-label="Clear ask" onClick={onClear} className={`${iconButton} @max-2xl:self-start`}>
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
