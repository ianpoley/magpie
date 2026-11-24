"use client";

import { Input, InputClear, InputGroup } from "@ui-sdk/react/input";
import { Menu, MenuContent, MenuItemIndicator, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@ui-sdk/react/menu";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { Toggle } from "@ui-sdk/react/toggle";
import { ArrowDownUp, AtSign, CalendarDays, Check, ChevronDown, Folder, Image as ImageIcon, Inbox, LayoutList, Rows3, ScanSearch, Search, Shuffle, Sparkles, Tag, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { MAX_QUERY_CHARS, type AskState } from "@/lib/ask";
import type { Area, FilterState, Post, Sort, TimeRange, Topic } from "@/lib/types";

import { formatCount, plural } from "./format";
import type { PostLayout } from "./post-layout";
import { Announce, FindLine, KBD, RunAgain, RunLine, SearchProgress } from "./search-status";
import { menuContent, menuItem } from "./styles";
import { Tip } from "./tip";

export type SearchMode = "search" | "find" | "ask";
export type View = "posts" | "resources";

export const SEARCH_INPUT_ID = "post-search";

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "week", label: "Past week" },
  { value: "month", label: "Past month" },
  { value: "year", label: "Past year" },
];

const SORTS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "added", label: "Recently added" },
  { value: "oldest", label: "Oldest" },
  { value: "most_liked", label: "Most liked" },
];

const TOOL =
  "focus-ring pressable relative inline-flex h-9 shrink-0 cursor-pointer touch-manipulation items-center gap-1.5 rounded-full border-0 bg-transparent px-2.5 text-[13px] font-medium text-ink before:absolute before:inset-x-0 before:-inset-y-1 hover:bg-[color-mix(in_oklch,var(--color-ink)_6%,transparent)] " +
  "[&>svg]:size-3.5 [&>svg]:text-ink-muted data-changed:bg-primary-soft data-changed:text-primary-text data-changed:[&>svg]:text-primary-text " +
  "data-pressed:bg-primary-soft data-pressed:text-primary-text data-pressed:[&>svg]:text-primary-text";

const CHIP =
  "group focus-ring pressable relative inline-flex h-7 max-w-full cursor-pointer items-center gap-1.5 rounded-full border border-[color-mix(in_oklch,var(--color-ink)_16%,transparent)] bg-transparent pr-1.5 pl-2.5 text-[13px] font-semibold text-ink before:absolute before:inset-x-0 before:-inset-y-2 hover:bg-[color-mix(in_oklch,var(--color-ink)_6%,transparent)]";

const FIELD =
  "group flex h-10 w-full min-w-0 items-center gap-2 rounded-full border border-[color-mix(in_oklch,var(--color-ink)_14%,transparent)] bg-[color-mix(in_oklab,var(--color-surface)_72%,transparent)] pr-1 pl-3.5 pointer-coarse:h-11 " +
  "transition-[border-color,box-shadow] duration-150 ease-out has-[input:focus-visible]:border-primary has-[input:focus-visible]:shadow-[0_0_0_1px_var(--color-primary)]";

const CLEAR =
  "focus-ring pressable relative flex size-7 shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-full border-0 bg-transparent p-0 text-ink-muted before:absolute before:-inset-1.5 hover:bg-sunken hover:text-ink pointer-coarse:before:-inset-2";

const TAB = "focus-ring relative h-8 rounded-none px-1 text-[13px] font-semibold text-ink-muted before:absolute before:inset-x-0 before:-inset-y-1.5 data-checked:text-ink";
const LAYOUT_ITEM = "focus-ring relative flex size-8 items-center justify-center px-0 text-ink-muted before:absolute before:inset-x-0 before:-inset-y-1.5 data-checked:text-ink [&>svg]:size-4";

export type PageHeaderProps = {
  menuButton: ReactNode;
  eyebrow: string | null;
  title: string;
  detail: string | null;
  onSurprise: () => void;
  canSurprise: boolean;
  mode: SearchMode;
  keyword: string;
  askDraft: string;
  ask: AskState | null;
  intent: "find" | "ask";
  timeRange: TimeRange;
  sort: Sort;
  mediaOnly: boolean;
  onKeyword: (keyword: string) => void;
  onAskDraft: (draft: string) => void;
  onRun: (query: string) => void;
  onLeaveAsk: () => void;
  onPin: () => Promise<void>;
  onRetry: () => void;
  onShowAnswer: () => void;
  onTimeRange: (timeRange: TimeRange) => void;
  onSort: (sort: Sort) => void;
  onMediaOnly: (mediaOnly: boolean) => void;
  layout: PostLayout;
  onLayout: (layout: PostLayout) => void;
  view: View;
  onView: (view: View) => void;
  posts: Post[];
  bookmarked: number;
  liked: number;
  resourceCount: number | null;
  kinds: { value: string; label: string }[];
  resourceKind: string;
  onResourceKind: (kind: string) => void;
  filter: FilterState;
  topicsById: Map<number, Topic>;
  areasById: Map<number, Area>;
  authorName: string | null;
  onRemoveTopic: (topicId: number) => void;
  onRemoveArea: (areaId: number) => void;
  onRemoveUnfiled: () => void;
  onRemoveAuthor: () => void;
  onClearPills: () => void;
  onSelectTopic: (topicId: number) => void;
};

const focusSearch = () => window.requestAnimationFrame(() => document.getElementById(SEARCH_INPUT_ID)?.focus({ preventScroll: true }));

function Choice<T extends string>({ label, icon: Icon, options, value, fallback, onChange }: { label: string; icon: LucideIcon; options: { value: T; label: string }[]; value: T; fallback: T; onChange: (value: T) => void }) {
  const current = options.find((option) => option.value === value) ?? options[0];
  return (
    <Menu>
      <MenuTrigger aria-label={`${label}: ${current.label}`} data-changed={value === fallback ? undefined : ""} className={TOOL}>
        <Icon aria-hidden="true" />
        {current.label}
        <ChevronDown aria-hidden="true" />
      </MenuTrigger>
      <MenuContent align="end" sideOffset={6} className={menuContent}>
        <MenuRadioGroup value={value} onValueChange={(next) => onChange(next as T)}>
          {options.map((option) => (
            <MenuRadioItem key={option.value} value={option.value} closeOnSelect className={menuItem}>
              <MenuItemIndicator />
              {option.label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

function CountLine({ h }: { h: PageHeaderProps }) {
  if (h.ask) return null;
  const sep = <span aria-hidden="true">·</span>;
  const count = h.posts.length;
  return (
    <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[13px] text-ink-muted">
      <span>
        <span className="font-semibold text-ink tabular-nums">{formatCount(count)}</span> {plural(count, "post")}
      </span>
      {h.resourceCount !== null ? (
        <>
          {sep}
          <span>
            <span className="font-semibold text-ink tabular-nums">{formatCount(h.resourceCount)}</span> {plural(h.resourceCount, "resource")}
          </span>
        </>
      ) : (
        <>
          {h.filter.collection === "bookmarks" ? null : (
            <>
              {sep}
              <span>
                <span className="tabular-nums">{formatCount(h.bookmarked)}</span> bookmarked
              </span>
            </>
          )}
          {h.filter.collection === "likes" ? null : (
            <>
              {sep}
              <span>
                <span className="tabular-nums">{formatCount(h.liked)}</span> liked
              </span>
            </>
          )}
        </>
      )}
    </p>
  );
}

function announcement(h: PageHeaderProps): string {
  const count = h.posts.length;
  if (h.ask) {
    if (h.ask.status === "running") return h.intent === "find" ? "Reading your saved posts for what they mean." : "Finding posts that may answer your question.";
    if (h.ask.total === null || h.ask.status === "failed") return "The search stopped before it finished. Try again is available.";
    const unread = h.ask.failed > 0 ? ` ${formatCount(h.ask.failed)} posts could not be read.` : "";
    return `${formatCount(count)} ${plural(count, "post")} ${h.intent === "find" ? "match by meaning" : "may answer your question"}.${unread}`;
  }
  if (h.resourceCount !== null) return `${formatCount(h.resourceCount)} ${plural(h.resourceCount, "resource")}`;
  return `${formatCount(count)} ${plural(count, "post")}`;
}

function Switches({ h }: { h: PageHeaderProps }) {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-3">
      <SegmentedControl aria-label="View" value={h.view} onValueChange={(next) => next && h.onView(next as View)} className="shrink-0 gap-2 border-0 bg-transparent p-0">
        <SegmentedControlIndicator className="rounded-none bg-transparent bg-none shadow-[inset_0_-2px_0_var(--color-ink)]" />
        <SegmentedControlItem value="posts" className={TAB}>
          Posts
        </SegmentedControlItem>
        <SegmentedControlItem value="resources" className={TAB}>
          Resources
        </SegmentedControlItem>
      </SegmentedControl>
      {h.view === "posts" ? (
        <>
          <span aria-hidden="true" className="h-4 w-px bg-[color-mix(in_oklch,var(--color-ink)_14%,transparent)]" />
          <SegmentedControl aria-label="Layout" value={h.layout} onValueChange={(next) => next && h.onLayout(next as PostLayout)} className="shrink-0 border-0 bg-transparent p-0">
            <SegmentedControlIndicator className="bg-[color-mix(in_oklch,var(--color-ink)_8%,transparent)] bg-none shadow-none" />
            <Tip label="Cards">
              <SegmentedControlItem value="cards" aria-label="Cards" className={LAYOUT_ITEM}>
                <LayoutList aria-hidden="true" />
              </SegmentedControlItem>
            </Tip>
            <Tip label="Rows">
              <SegmentedControlItem value="rows" aria-label="Rows" className={LAYOUT_ITEM}>
                <Rows3 aria-hidden="true" />
              </SegmentedControlItem>
            </Tip>
          </SegmentedControl>
        </>
      ) : null}
    </div>
  );
}

type Pill = { key: string; icon: LucideIcon; kind: string; label: string; onRemove: () => void };

function pills(h: PageHeaderProps): Pill[] {
  return [
    ...h.filter.areaIds.map((id) => ({ key: `a${id}`, icon: Folder, kind: "area", label: h.areasById.get(id)?.name ?? "Area", onRemove: () => h.onRemoveArea(id) })),
    ...h.filter.topicIds.map((id) => ({ key: `t${id}`, icon: Tag, kind: "topic", label: h.topicsById.get(id)?.name ?? "Topic", onRemove: () => h.onRemoveTopic(id) })),
    ...(h.filter.unfiled ? [{ key: "unfiled", icon: Inbox, kind: "filter", label: "Unfiled", onRemove: h.onRemoveUnfiled }] : []),
    ...(h.filter.author !== null ? [{ key: "author", icon: AtSign, kind: "author", label: h.authorName ?? h.filter.author, onRemove: h.onRemoveAuthor }] : []),
  ];
}

function KindSwitch({ h }: { h: PageHeaderProps }) {
  if (h.kinds.length === 0) return null;
  const item = "focus-ring h-6 px-2.5 text-[12px] font-semibold text-ink-muted data-checked:text-ink";
  return (
    <SegmentedControl aria-label="Resource kind" value={h.resourceKind} onValueChange={(next) => next && h.onResourceKind(next)} className="shrink-0 border-0 bg-sunken p-[2px]">
      <SegmentedControlIndicator className="bg-surface bg-none shadow-[0_0_0_1px_color-mix(in_oklch,var(--color-ink)_7%,transparent),0_1px_2px_color-mix(in_oklch,var(--color-ink)_10%,transparent)]" />
      <SegmentedControlItem value="all" className={item}>
        All kinds
      </SegmentedControlItem>
      {h.kinds.map((kind) => (
        <SegmentedControlItem key={kind.value} value={kind.value} className={item}>
          {kind.label}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  );
}

function useStuck() {
  const ref = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, stuck };
}

function usePinnedPadding() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => {
      root.style.scrollPaddingTop = `${el.offsetHeight + 8}px`;
      root.style.setProperty("--pinned-h", `${el.offsetHeight}px`);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.scrollPaddingTop = "";
      root.style.removeProperty("--pinned-h");
    };
  }, []);
  return ref;
}

export function PageHeader(h: PageHeaderProps) {
  const { ref, stuck } = useStuck();
  const pinnedRef = usePinnedPadding();
  const stuckRef = useRef(stuck);
  useEffect(() => {
    stuckRef.current = stuck;
  });
  const askActive = h.ask !== null;
  const query = JSON.stringify([h.keyword, h.timeRange, h.sort, h.mediaOnly, h.view, askActive]);
  const lastQuery = useRef(query);
  useEffect(() => {
    if (query === lastQuery.current) return;
    lastQuery.current = query;
    if (stuckRef.current) window.scrollTo({ top: 0, behavior: "instant" });
  }, [query]);

  const asking = h.mode !== "search";
  const value = asking ? h.askDraft : h.keyword;
  const typed = value.trim().slice(0, MAX_QUERY_CHARS);
  const askedQuery = h.ask?.query ?? null;
  const run = () => {
    if (typed) h.onRun(typed);
  };
  const edited = asking && typed !== "" && typed !== askedQuery;
  const Lead = h.mode === "find" ? ScanSearch : h.mode === "ask" ? Sparkles : Search;
  const filterPills = pills(h);
  const leave = () => {
    h.onLeaveAsk();
    focusSearch();
  };
  const lines = h.ask !== null || (!asking && typed !== "") || filterPills.length > 0 || h.kinds.length > 0;

  return (
    <>
      <header className="@container flex flex-col gap-3 px-4 sm:px-8">
        <Announce message={announcement(h)} />
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3 @max-xl:basis-full">
            {h.menuButton}
            <div className="min-w-0 flex-1">
              {h.eyebrow ? <p className="text-eyebrow mb-1 text-ink-muted">{h.eyebrow}</p> : null}
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 className="text-display text-[26px] leading-[1.1] text-ink sm:text-[30px]">{h.title}</h1>
                <CountLine h={h} />
              </div>
            </div>
          </div>
          <Switches h={h} />
        </div>
        {h.detail ? <p className="max-w-[60ch] text-[14px] leading-[1.5] text-pretty text-ink-muted">{h.detail}</p> : null}
      </header>
      <div ref={ref} aria-hidden="true" className="h-0" />
      <div ref={pinnedRef} data-stuck={stuck ? "" : undefined} className="pinned-row sticky top-0 z-20 flex flex-col gap-1.5 px-4 py-2 sm:px-8">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
          <div className="flex min-w-[min(18rem,100%)] flex-1 items-center gap-2">
            {stuck ? h.menuButton : null}
            <form
              role="search"
              className="relative min-w-0 flex-1"
              onSubmit={(event) => {
                event.preventDefault();
                if (edited) run();
              }}
            >
              <InputGroup className={FIELD}>
                <Lead className={`size-4 shrink-0 ${asking ? "text-primary-text" : "text-ink-muted"}`} aria-hidden="true" />
                <Input
                  id={SEARCH_INPUT_ID}
                  aria-keyshortcuts="/"
                  type="search"
                  enterKeyHint={asking ? "send" : "search"}
                  aria-label={h.mode === "find" ? "Topic to find by meaning" : h.mode === "ask" ? "Question about your saved posts" : "Search saved posts, or find a topic"}
                  placeholder="Search by keyword, or find a topic…"
                  autoComplete="off"
                  spellCheck={false}
                  data-1p-ignore=""
                  maxLength={asking ? MAX_QUERY_CHARS : undefined}
                  value={value}
                  onValueChange={asking ? h.onAskDraft : h.onKeyword}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && asking && askedQuery !== null) {
                      event.preventDefault();
                      h.onAskDraft(askedQuery);
                      return;
                    }
                    if (event.key === "Escape" && value === "") {
                      event.currentTarget.blur();
                      return;
                    }
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      run();
                    }
                  }}
                  className="min-w-0 flex-1 text-[16px] placeholder:text-ink-muted pointer-fine:text-[14px] [&::-webkit-search-cancel-button]:hidden"
                />
                {value === "" ? (
                  <kbd aria-hidden="true" className={`${KBD} mr-2 group-has-[input:focus]:invisible`}>
                    /
                  </kbd>
                ) : (
                  <InputClear aria-label={asking ? "Clear and go back to keyword search" : "Clear search"} onClick={asking ? h.onLeaveAsk : undefined} className={CLEAR}>
                    <X className="size-4" aria-hidden="true" />
                  </InputClear>
                )}
                {edited ? <RunAgain /> : null}
              </InputGroup>
              <SearchProgress ask={h.ask} className="pointer-events-none absolute inset-x-5 bottom-0 h-[2px]" />
            </form>
          </div>
          <div className="flex flex-wrap items-center">
            <Choice label="Time range" icon={CalendarDays} options={TIME_RANGES} value={h.timeRange} fallback="all" onChange={h.onTimeRange} />
            {askActive ? null : <Choice label="Sort" icon={ArrowDownUp} options={SORTS} value={h.sort} fallback="newest" onChange={h.onSort} />}
            <Toggle pressed={h.mediaOnly} onPressedChange={h.onMediaOnly} aria-label="Only posts with media" className={`${TOOL} w-auto`}>
              {h.mediaOnly ? <Check aria-hidden="true" /> : <ImageIcon aria-hidden="true" />}
              Media
            </Toggle>
            <Tip label="Surprise me">
              <button type="button" onClick={h.onSurprise} disabled={!h.canSurprise} aria-label="Surprise me: open a random post" className={`${TOOL} w-9 justify-center px-0 pointer-coarse:w-11 disabled:cursor-default disabled:opacity-50 [&>svg]:size-4 [&>svg]:text-ink`}>
                <Shuffle aria-hidden="true" />
              </button>
            </Tip>
          </div>
        </div>
        {lines ? (
          <div className="flex flex-col gap-1.5 pl-1">
            {h.ask ? (
              <RunLine
                ask={h.ask}
                intent={h.intent}
                count={h.posts.length}
                posts={h.posts}
                topicsById={h.topicsById}
                onPin={async () => {
                  await h.onPin();
                  focusSearch();
                }}
                onRetry={h.onRetry}
                onShowAnswer={h.onShowAnswer}
                onOpenTopic={h.onSelectTopic}
                onClear={leave}
              />
            ) : typed !== "" ? (
              <FindLine keyword={typed} posts={h.posts} topicsById={h.topicsById} shownTopicIds={h.filter.topicIds} onFind={run} onOpenTopic={h.onSelectTopic} />
            ) : null}
            {filterPills.length > 0 || h.kinds.length > 0 ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <KindSwitch h={h} />
                {filterPills.length > 0 ? (
                  <ul aria-label="Active filters" className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {filterPills.map(({ key, icon: Icon, kind, label, onRemove }) => (
                      <li key={key} className="flex min-w-0">
                        <button type="button" onClick={onRemove} aria-label={`Remove ${kind} ${label}`} className={CHIP}>
                          <Icon className="size-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
                          <span className="truncate">{label}</span>
                          <X className="size-3.5 shrink-0 opacity-60 group-hover:opacity-100" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {filterPills.length > 1 ? (
                  <button type="button" onClick={h.onClearPills} className="focus-ring pressable relative h-7 shrink-0 cursor-pointer rounded-full border-0 bg-transparent px-2 text-[13px] font-semibold text-ink-muted before:absolute before:inset-x-0 before:-inset-y-2 hover:text-ink">
                    Clear all
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
