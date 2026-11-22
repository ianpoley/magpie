"use client";

import { Input } from "@ui-sdk/react/input";
import { toast } from "@ui-sdk/react/toast";
import { ArrowUp, Check, Copy, FileText, GitBranch, Package, Play, RotateCw, SlidersHorizontal, Sparkles, SquarePen, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { answerMarkdown, canFollowUp, MIN_CONFIDENT, READ_LIMIT, type Answer, type AnswerPoint, type ChatState, type Turn } from "@/lib/answer";
import type { AskState } from "@/lib/ask";
import { resourceName, resourcesFor } from "@/lib/resources";
import type { Post, Snapshot } from "@/lib/types";

import { AuthorAvatar } from "./author-avatar";
import { formatCount, formatDay, plural } from "./format";
import { Tip } from "./tip";

const TOOLS = 4;
const KIND_ICONS: Record<string, LucideIcon> = { repo: GitBranch, package: Package, video: Play, page: FileText };

const CHIP = "focus-ring-side pressable inline-flex h-7 items-center rounded-full border-0 px-2.5 text-[12px] no-underline";
const QUIET_CHIP = "bg-side-hover text-side-ink hover:bg-side-wash";
const SOFT_BUTTON =
  "focus-ring-side pressable flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-side-hover px-3 text-[13px] font-semibold text-side-ink hover:bg-side-wash";
const ICON_BUTTON =
  "focus-ring-side pressable relative flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-side-muted before:absolute before:-inset-1 hover:bg-side-hover hover:text-side-ink";

export type AnswerCardProps = {
  ask: AskState | null;
  chat: ChatState | null;
  snapshot: Snapshot;
  postsById: Map<string, Post>;
  listed: Set<string>;
  cited: string[];
  headerAction?: ReactNode;
  onAsk: (question: string) => void;
  onFollowUp: (question: string) => void;
  onRetryAnswer: () => void;
  onRetryAsk: () => void;
  onCite: (postId: string) => void;
  onNew: () => void;
  onFilters: () => void;
};

type Note = { text: string; retry: (() => void) | null };

const reading = (confident: number): string => {
  const read = Math.min(confident, READ_LIMIT);
  return read === confident ? `all ${formatCount(confident)} confident matches` : `the ${read} strongest of ${formatCount(confident)} confident matches`;
};

function turnNote(turn: Turn, last: boolean, confident: number, onRetry: () => void): Note | null {
  if (turn.status === "writing") return turn.answer ? null : { text: `Claude is reading ${reading(confident)}…`, retry: null };
  if (turn.status === "few") {
    const found = confident === 0 ? "No post matches" : `Only ${confident} ${plural(confident, "post matches", "posts match")}`;
    return { text: `${found} with confidence, and an answer needs at least ${MIN_CONFIDENT}. Ask it another way, or read the possible matches in the list.`, retry: null };
  }
  if (turn.status === "unavailable") return { text: "Claude Code is not set up on this Mac, so there is no written answer. The matches are in the list.", retry: null };
  if (turn.status === "failed") return { text: "Claude did not return an answer. The matches are still in the list.", retry: last ? onRetry : null };
  return null;
}

function NoteLine({ note }: { note: Note }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <p aria-live="polite" className="min-w-0 flex-1 text-[13px] leading-[1.5] text-pretty text-side-muted">
        {note.text}
      </p>
      {note.retry ? (
        <button type="button" onClick={note.retry} className={SOFT_BUTTON}>
          <RotateCw className="size-3.5" aria-hidden="true" />
          Try again
        </button>
      ) : null}
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-hidden="true" className="flex animate-pulse flex-col gap-5 motion-reduce:animate-none">
      <div className="h-4 w-4/5 rounded-full bg-side-hover" />
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex flex-col gap-2">
          <div className="h-3.5 w-2/5 rounded-full bg-side-hover" />
          <div className="h-3 w-full rounded-full bg-side-hover" />
          <div className="h-3 w-3/4 rounded-full bg-side-hover" />
        </div>
      ))}
    </div>
  );
}

function Question({ children }: { children: string }) {
  return (
    <div className="flex justify-end">
      <span className="sr-only">You asked</span>
      <p className="max-w-[88%] rounded-[16px] rounded-br-[6px] bg-side-wash px-3.5 py-2 text-[14px] leading-[1.45] font-medium text-pretty text-side-ink">{children}</p>
    </div>
  );
}

function Sources({ point, card }: { point: AnswerPoint; card: AnswerCardProps }) {
  const posts = point.postIds.flatMap((id) => card.postsById.get(id) ?? []);
  if (posts.length === 0) return null;
  const handles = posts.map((post) => post.authorHandle.toLowerCase());
  return (
    <ul aria-label="Sources" className="flex flex-wrap gap-x-1.5 gap-y-3">
      {posts.map((post) => {
        const marked = card.cited.includes(post.id);
        const day = handles.indexOf(post.authorHandle.toLowerCase()) !== handles.lastIndexOf(post.authorHandle.toLowerCase()) ? formatDay(post.createdAt) : null;
        return (
          <li key={post.id} className="flex">
            <button
              type="button"
              onClick={() => card.onCite(post.id)}
              aria-label={`${card.listed.has(post.id) ? "Show" : "Open"} the post by ${post.authorName}${day ? ` from ${day}` : ""}`}
              aria-pressed={marked}
              className={`${CHIP} relative max-w-[11rem] cursor-pointer gap-1.5 pl-1 font-semibold before:absolute before:inset-x-0 before:-inset-y-1.5 ${marked ? "bg-side-ink text-ink" : QUIET_CHIP}`}
            >
              <AuthorAvatar handle={post.authorHandle} name={post.authorName} url={post.authorAvatarUrl} size="xs" ring={false} />
              <span className="truncate">@{post.authorHandle}</span>
              {day ? <span className="shrink-0 font-medium tabular-nums opacity-75">{day}</span> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function CopyAnswer({ question, answer, confident, postsById }: { question: string; answer: Answer; confident: number; postsById: Map<string, Post> }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const text = answerMarkdown(question, answer, confident, (id) => {
      const post = postsById.get(id);
      return post ? { handle: post.authorHandle, url: post.url } : null;
    });
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => toast.error("The answer could not be copied"),
    );
  };
  return (
    <button type="button" onClick={copy} className={SOFT_BUTTON}>
      {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
      <span aria-live="polite">{copied ? "Copied" : "Copy as markdown"}</span>
    </button>
  );
}

function Footer({ turn, first, card, confident }: { turn: Turn & { answer: Answer }; first: boolean; card: AnswerCardProps; confident: number }) {
  const { answer } = turn;
  const citedIds = [...new Set(answer.points.flatMap((point) => point.postIds))];
  const tools = resourcesFor(card.snapshot, citedIds.flatMap((id) => card.postsById.get(id) ?? [])).slice(0, TOOLS);
  const outside = citedIds.filter((id) => !card.listed.has(id)).length;
  const skipped = first ? (card.ask?.failed ?? 0) : 0;
  return (
    <div className="answer-rise flex flex-col gap-3">
      {tools.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-eyebrow text-side-muted">Linked from these posts</p>
          <ul className="flex flex-wrap gap-1.5">
            {tools.map(({ resource, posts }) => {
              const Icon = KIND_ICONS[resource.kind] ?? FileText;
              const name = resourceName(resource, posts);
              const label = name.fromPost ? (resource.host ?? resource.url) : name.text;
              return (
                <li key={resource.id} className="flex min-w-0">
                  <a href={resource.url} target="_blank" rel="noreferrer" title={label} className={`${CHIP} ${QUIET_CHIP} max-w-[16rem] gap-1.5 font-medium`}>
                    <Icon className="size-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{label}</span>
                    {posts.length > 1 ? <span className="shrink-0 tabular-nums">{posts.length}</span> : null}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <p className="text-[12px] leading-[1.5] text-pretty text-side-muted tabular-nums">
        Written by Claude from {answer.read === confident ? `all ${formatCount(confident)}` : `the ${answer.read} strongest of ${formatCount(confident)}`} confident {plural(confident, "match", "matches")}.
        {skipped > 0 ? ` ${formatCount(skipped)} ${plural(skipped, "post", "posts")} could not be judged, so the answer may miss some.` : ""}
        {outside > 0 ? ` ${outside} cited ${plural(outside, "post is", "posts are")} outside the filters that are on; ${plural(outside, "its chip opens", "their chips open")} the post.` : ""}
      </p>
      <div className="flex">
        <CopyAnswer question={turn.question} answer={answer} confident={confident} postsById={card.postsById} />
      </div>
    </div>
  );
}

function AnswerBody({ turn, first, last, card, confident }: { turn: Turn; first: boolean; last: boolean; card: AnswerCardProps; confident: number }) {
  const note = turnNote(turn, last, confident, card.onRetryAnswer);
  const { answer } = turn;
  if (!answer) {
    return (
      <div className="flex flex-col gap-4">
        {note ? <NoteLine note={note} /> : null}
        {turn.status === "writing" ? <Skeleton /> : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5" aria-busy={turn.status === "writing"}>
      <p className="max-w-[65ch] text-[15px] leading-[1.45] font-medium text-pretty text-side-ink">{answer.lead}</p>
      <ol className="flex flex-col gap-5">
        {answer.points.map((point, index) => (
          <li key={index} className="answer-rise flex gap-3">
            <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-side-wash text-[12px] font-bold text-side-ink tabular-nums">
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-col gap-1">
                <h3 className="text-[14px] leading-[1.35] font-bold text-balance text-side-ink">{point.title}</h3>
                <p className="max-w-[65ch] text-[13px] leading-[1.5] text-pretty text-side-ink">{point.body}</p>
              </div>
              <Sources point={point} card={card} />
            </div>
          </li>
        ))}
      </ol>
      {turn.status === "done" ? <Footer turn={{ ...turn, answer }} first={first} card={card} confident={confident} /> : null}
    </div>
  );
}

function askNote(ask: AskState, onRetry: () => void): Note {
  if (ask.status === "running") return { text: "The answer is written once every post is judged.", retry: null };
  if (ask.status === "failed") {
    return { text: ask.scores.length === 0 ? "The search could not be run, so there is no answer. Check that this Mac is online." : "The search stopped early, so no answer was written.", retry: onRetry };
  }
  return { text: "The answer is on its way.", retry: null };
}

function Transcript({ card }: { card: AnswerCardProps }) {
  const { ask, chat } = card;
  const scroller = useRef<HTMLDivElement>(null);
  const latest = useRef<HTMLLIElement>(null);
  const turns = chat && ask && chat.root === ask.query && ask.status !== "failed" ? chat.turns : [];
  const count = turns.length;
  useEffect(() => {
    const box = scroller.current;
    const turn = latest.current;
    if (count < 2 || !box || !turn) return;
    const top = turn.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 8;
    box.scrollTo({ top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [count]);

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-5 [container-type:size]">
      {ask === null ? (
        <div className="flex h-full flex-col justify-end gap-2 pb-2">
          <p className="text-display text-[20px] text-side-ink">Ask your saved posts</p>
          <p className="max-w-[34ch] text-[13px] leading-[1.5] text-pretty text-side-muted">Claude writes the answer here from the posts that match your question. Magpie lists those posts in the middle column.</p>
        </div>
      ) : count === 0 ? (
        <div className="flex flex-col gap-4">
          <Question>{ask.query}</Question>
          <NoteLine note={askNote(ask, card.onRetryAsk)} />
        </div>
      ) : (
        <ol className="flex flex-col gap-7">
          {turns.map((turn, index) => (
            <li
              key={index}
              ref={index === count - 1 ? latest : undefined}
              className={`flex flex-col gap-4 ${index > 0 && index === count - 1 ? "min-h-[100cqh]" : ""}`}
            >
              <Question>{turn.question}</Question>
              <AnswerBody turn={turn} first={index === 0} last={index === count - 1} card={card} confident={chat?.confident ?? 0} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Composer({ card }: { card: AnswerCardProps }) {
  const { ask, chat } = card;
  const id = useId();
  const [draft, setDraft] = useState("");
  const first = ask === null;
  const talking = chat !== null && ask !== null && chat.root === ask.query;
  const ready = first || (talking && canFollowUp(chat));
  const busy = talking && chat.turns.some((turn) => turn.status === "writing");
  const closed = talking && chat.turns.some((turn) => turn.status === "unavailable" || turn.status === "few");
  const blocked = !ready || draft.trim() === "";
  const hint = first
    ? "Jev checks every saved post against your question. Then Claude writes the answer. Each question costs a small amount."
    : busy
      ? "Claude is answering…"
      : closed || !talking
        ? "A follow-up needs a written answer to build on."
        : !ready
          ? "Try the answer again before asking a follow-up."
          : `Follow-ups are answered from the same ${Math.min(chat?.turns[0]?.answer?.read ?? READ_LIMIT, READ_LIMIT)} posts, with no new search.`;
  return (
    <form
      className="flex flex-col gap-2 px-4 pt-2 pb-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (blocked) return;
        if (first) card.onAsk(draft);
        else card.onFollowUp(draft);
        setDraft("");
      }}
    >
      <label htmlFor={id} className="sr-only">
        {first ? "Ask your saved posts" : "Ask a follow-up"}
      </label>
      <div className="bg-answer-field flex h-11 items-center gap-2 rounded-full pr-1.5 pl-4 transition-shadow duration-150 ease-out has-[input:focus-visible]:shadow-[0_0_0_2px_var(--color-side-ink)]">
        <Input
          id={id}
          data-answer-field=""
          value={draft}
          onValueChange={setDraft}
          maxLength={500}
          autoComplete="off"
          placeholder={first ? "Type a question…" : ready || busy ? "Ask a follow-up…" : "A follow-up needs an answer first"}
          disabled={!first && !ready && !busy}
          className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[16px] text-side-ink shadow-none outline-none placeholder:text-side-muted sm:text-[14px]"
        />
        <button
          type="submit"
          aria-label={first ? "Ask" : "Ask follow-up"}
          aria-disabled={blocked}
          className="focus-ring-side pressable relative flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-side-ink p-0 text-ink before:absolute before:-inset-1.5 aria-disabled:cursor-default aria-disabled:opacity-45"
        >
          <ArrowUp className="size-4" aria-hidden="true" />
        </button>
      </div>
      <p className="px-1 text-[12px] leading-[1.5] text-pretty text-side-muted">{hint}</p>
    </form>
  );
}

export function AnswerCard(card: AnswerCardProps) {
  return (
    <div className="side-scope bg-answer flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-5 pt-5 pb-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-[9px] bg-side-wash text-side-ink">
          <Sparkles className="size-3.5" aria-hidden="true" />
        </span>
        <h2 className="mr-auto pl-0.5 text-eyebrow text-side-muted">Answer</h2>
        {card.ask !== null ? (
          <Tip label="New chat">
            <button type="button" aria-label="New chat" onClick={card.onNew} className={ICON_BUTTON}>
              <SquarePen className="size-4" aria-hidden="true" />
            </button>
          </Tip>
        ) : null}
        <button type="button" onClick={card.onFilters} className={SOFT_BUTTON}>
          <SlidersHorizontal className="size-3.5" aria-hidden="true" />
          Filters
        </button>
        {card.headerAction}
      </div>
      <Transcript card={card} />
      <Composer card={card} />
    </div>
  );
}
