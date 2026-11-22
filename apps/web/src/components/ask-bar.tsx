"use client";

import { Button } from "@ui-sdk/react/button";
import { Progress, ProgressIndicator, ProgressTrack } from "@ui-sdk/react/progress";
import { MessageSquareText, Pin, RotateCw, ScanSearch, Sparkles, X } from "lucide-react";

import type { AskState } from "@/lib/ask";

import { formatCount, plural } from "./format";
import { iconButton, primaryAnswer, quietAnswer } from "./styles";
import { Tip } from "./tip";

function progressText(ask: AskState): string {
  if (ask.total === null) return ask.status === "failed" ? "The search could not be run." : "Reading your saved posts…";
  const total = `${formatCount(ask.total)} ${plural(ask.total, "post")}`;
  if (ask.status === "running") return `Read ${formatCount(ask.judged + ask.failed)} of ${total} by meaning`;
  if (ask.status === "failed") return `Stopped after ${formatCount(ask.judged)} of ${total}.`;
  if (ask.failed > 0) return `Read ${formatCount(ask.judged)} of ${total}. ${formatCount(ask.failed)} could not be read.`;
  return `Read all ${total} by meaning`;
}

export function AskBar({
  ask,
  intent,
  onPin,
  onRetry,
  onClear,
  onShowAnswer,
}: {
  ask: AskState;
  intent: "find" | "ask";
  onPin: () => Promise<void>;
  onRetry: () => void;
  onClear: () => void;
  onShowAnswer: () => void;
}) {
  const running = ask.status === "running";
  const incomplete = !running && (ask.status === "failed" || ask.failed > 0);
  const finding = intent === "find";
  const label = finding ? "Topic search" : "Sources for your question";
  const Icon = finding ? ScanSearch : Sparkles;
  return (
    <section aria-label={label} className="@container flex flex-col gap-3 rounded-card bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-[12px] ${finding ? "bg-primary-fill text-on-primary" : "bg-answer text-side-ink"}`}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 @max-2xl:basis-[calc(100%-3rem)]">
          <p className="text-eyebrow text-ink-muted">{label}</p>
          <h2 className="mt-0.5 line-clamp-2 text-[16px] leading-tight font-bold break-words text-ink @2xl:line-clamp-1">{ask.query}</h2>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 @max-2xl:flex-1 @max-2xl:pl-12">
          {incomplete ? (
            <Button onClick={onRetry} className={`${quietAnswer} shrink-0 gap-1.5`}>
              <RotateCw className="size-3.5 text-ink-muted" aria-hidden="true" />
              Try again
            </Button>
          ) : null}
          {finding ? (
            <Button
              onClick={onPin}
              disabled={running || ask.scores.length === 0}
              pendingAnnouncement="Pinning"
              className={`${primaryAnswer} shrink-0 gap-1.5`}
            >
              <Pin className="size-3.5" aria-hidden="true" />
              Pin as topic
            </Button>
          ) : (
            <Button onClick={onShowAnswer} className={`${quietAnswer} shrink-0 gap-1.5 lg:hidden`}>
              <MessageSquareText className="size-3.5 text-ink-muted" aria-hidden="true" />
              Answer
            </Button>
          )}
        </div>
        <Tip label={finding ? "Clear topic search" : "Clear question"}>
          <button type="button" aria-label={finding ? "Clear topic search" : "Clear question"} onClick={onClear} className={`${iconButton} @max-2xl:self-start`}>
            <X aria-hidden="true" />
          </button>
        </Tip>
      </div>
      <div className="flex flex-col gap-2">
        {running || ask.total !== null ? (
          <Progress
            aria-label="Reading posts"
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
