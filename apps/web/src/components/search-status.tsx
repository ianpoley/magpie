"use client";

import { Button } from "@ui-sdk/react/button";
import { CornerDownLeft, MessageSquareText, Pin, RotateCw, ScanSearch } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import type { AskState } from "@/lib/ask";
import { topicOverlap } from "@/lib/topic-overlap";
import type { Post, Topic } from "@/lib/types";

import { formatCount, plural } from "./format";

const TEXT_BUTTON =
  "focus-ring pressable relative inline-flex h-7 shrink-0 cursor-pointer touch-manipulation items-center gap-1 rounded-full border-0 bg-transparent px-2 text-[13px] font-semibold text-ink before:absolute before:inset-x-0 before:-inset-y-2 hover:bg-[color-mix(in_oklch,var(--color-ink)_6%,transparent)] [&>svg]:size-3.5 [&>svg]:text-ink-muted";

const PIN_BUTTON =
  "focus-ring pressable relative inline-flex h-7 shrink-0 cursor-pointer touch-manipulation items-center gap-1 rounded-full border-0 bg-transparent px-2 text-[13px] font-semibold text-primary-text transition-[opacity,background-color] duration-150 ease-out before:absolute before:inset-x-0 before:-inset-y-2 hover:bg-primary-soft disabled:cursor-default disabled:opacity-50 data-pending:cursor-progress data-pending:opacity-70 [&>svg]:size-3.5";

export const SOFT_BUTTON =
  "focus-ring pressable relative inline-flex h-8 shrink-0 cursor-pointer touch-manipulation items-center gap-1.5 rounded-full border-0 bg-sunken px-3 text-[13px] font-semibold text-ink before:absolute before:inset-x-0 before:-inset-y-1.5 hover:bg-[color-mix(in_oklch,var(--color-sunken)_86%,var(--color-ink))] [&>svg]:size-3.5 [&>svg]:shrink-0";

export const KBD =
  "pointer-events-none hidden h-5 min-w-5 shrink-0 items-center justify-center rounded-[6px] bg-[color-mix(in_oklch,var(--color-ink)_7%,transparent)] px-1 font-sans text-[11px] font-semibold text-ink-muted pointer-fine:inline-flex";

const noSubscribe = () => () => {};
export const useIsMac = () =>
  useSyncExternalStore(
    noSubscribe,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => true,
  );

const Num = ({ n }: { n: number }) => <span className="font-semibold text-ink tabular-nums">{formatCount(n)}</span>;

const Dot = () => (
  <span aria-hidden="true" className="text-ink-muted">
    ·
  </span>
);

export function Announce({ message }: { message: string }) {
  const [said, setSaid] = useState(message);
  useEffect(() => {
    const id = window.setTimeout(() => setSaid(message), 700);
    return () => window.clearTimeout(id);
  }, [message]);
  return (
    <p className="sr-only" aria-live="polite">
      {said}
    </p>
  );
}

export function SearchProgress({ ask, className }: { ask: AskState | null; className: string }) {
  if (!ask || ask.total === null) return null;
  const read = ask.total === 0 ? 1 : (ask.judged + ask.failed) / ask.total;
  const warn = ask.status === "failed" || ask.failed > 0;
  return (
    <span aria-hidden="true" data-running={ask.status === "running" ? "" : undefined} className={`run-progress ${className}`}>
      <span className={`run-progress-fill ${warn ? "bg-like" : "bg-primary"}`} style={{ transform: `scaleX(${ask.status === "running" ? read : 1})` }} />
    </span>
  );
}

export function RunAgain({ className = "" }: { className?: string }) {
  return (
    <button type="submit" className={`${SOFT_BUTTON} ${className}`}>
      <CornerDownLeft aria-hidden="true" />
      Run again
    </button>
  );
}

export function FindLine({
  keyword,
  posts,
  topicsById,
  shownTopicIds,
  onFind,
  onOpenTopic,
}: {
  keyword: string;
  posts: Post[];
  topicsById: Map<number, Topic>;
  shownTopicIds: number[];
  onFind: () => void;
  onOpenTopic: (topicId: number) => void;
}) {
  const mac = useIsMac();
  const overlap = topicOverlap(posts, topicsById, shownTopicIds);
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1">
      <button type="button" onClick={onFind} aria-keyshortcuts={mac ? "Meta+Enter" : "Control+Enter"} className={`${SOFT_BUTTON} pr-2`}>
        <ScanSearch aria-hidden="true" />
        Find topic
        <kbd aria-hidden="true" className={KBD}>
          {mac ? "⌘↵" : "Ctrl ↵"}
        </kbd>
        <span className="sr-only">: {keyword.trim()}</span>
      </button>
      {overlap ? (
        <span className="flex min-w-0 flex-wrap items-center gap-x-1 text-[13px] text-ink-muted">
          <span>
            <Num n={overlap.count} /> of {formatCount(overlap.of)} are already in <span className="font-semibold text-ink">{overlap.topic.name}</span>
          </span>
          <span className="flex items-center gap-1">
            <span aria-hidden="true" className="text-ink-muted max-sm:hidden">
              ·
            </span>
            <button type="button" onClick={() => onOpenTopic(overlap.topic.id)} className={TEXT_BUTTON}>
              Open topic
            </button>
          </span>
        </span>
      ) : (
        <span className="text-[13px] text-ink-muted">Reads every saved post for what the words mean</span>
      )}
    </div>
  );
}

function runText(ask: AskState, intent: "find" | "ask", count: number, overlapText: ReactNode) {
  if (ask.total === null) return ask.status === "failed" ? <span className="text-like-text">The search could not be run</span> : <span>Starting…</span>;
  if (ask.status === "running") {
    return (
      <span className="tabular-nums">
        Reading {formatCount(ask.judged + ask.failed)} of {formatCount(ask.total)} posts for what they mean…
      </span>
    );
  }
  const unread = ask.status === "failed" ? ask.total - ask.judged : ask.failed;
  const posts = plural(count, "post");
  return (
    <span>
      <Num n={count} /> {intent === "find" ? `${posts} match by meaning` : `${posts} that may answer your question`}
      {intent === "find" ? overlapText ?? ", not exact words" : null}
      {unread > 0 ? <span className="text-like-text tabular-nums"> · {formatCount(unread)} posts could not be read</span> : null}
    </span>
  );
}

export function RunLine({
  ask,
  intent,
  count,
  posts,
  topicsById,
  onPin,
  onRetry,
  onShowAnswer,
  onOpenTopic,
  onClear,
}: {
  ask: AskState;
  intent: "find" | "ask";
  count: number;
  posts: Post[];
  topicsById: Map<number, Topic>;
  onPin: () => Promise<void>;
  onRetry: () => void;
  onShowAnswer: () => void;
  onOpenTopic: (topicId: number) => void;
  onClear: () => void;
}) {
  const running = ask.status === "running";
  const overlap = running || intent !== "find" ? null : topicOverlap(posts, topicsById, []);
  const retry = !running && (ask.status === "failed" || ask.failed > 0);
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-x-1 gap-y-0.5 pl-[35px] text-[13px] leading-5 text-ink-muted">
      <p className="mr-1 min-w-0 text-pretty">
        {runText(
          ask,
          intent,
          count,
          overlap ? (
            <>
              {" · "}
              <Num n={overlap.count} /> already in <span className="font-semibold text-ink">{overlap.topic.name}</span>
            </>
          ) : null,
        )}
      </p>
      <span className="flex items-center gap-1">
        {retry ? (
          <>
            <button type="button" onClick={onRetry} className={TEXT_BUTTON}>
              <RotateCw aria-hidden="true" />
              Try again
            </button>
            <Dot />
          </>
        ) : null}
        {intent === "find" ? (
          <Button onClick={onPin} disabled={running || ask.scores.length === 0} pendingAnnouncement="Pinning" className={PIN_BUTTON}>
            <Pin aria-hidden="true" />
            Pin as topic
          </Button>
        ) : (
          <span className="flex items-center gap-1 lg:hidden">
            <button type="button" onClick={onShowAnswer} className={TEXT_BUTTON}>
              <MessageSquareText aria-hidden="true" />
              Answer
            </button>
          </span>
        )}
        {overlap ? (
          <>
            <Dot />
            <button type="button" onClick={() => onOpenTopic(overlap.topic.id)} className={TEXT_BUTTON}>
              Open topic
            </button>
          </>
        ) : null}
        {intent === "find" ? <Dot /> : <span className="lg:hidden"><Dot /></span>}
        <button type="button" onClick={onClear} className={`${TEXT_BUTTON} font-medium text-ink-muted hover:text-ink`}>
          Clear
        </button>
      </span>
    </div>
  );
}
