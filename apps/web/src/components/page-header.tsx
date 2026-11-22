"use client";

import { Input, InputClear, InputGroup } from "@ui-sdk/react/input";
import { Menu, MenuContent, MenuItemIndicator, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@ui-sdk/react/menu";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { Toggle } from "@ui-sdk/react/toggle";
import { ArrowDownUp, CalendarDays, Check, ChevronDown, Image as ImageIcon, LayoutList, Rows3, Search, Shuffle, Sparkles, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { MAX_QUERY_CHARS } from "@/lib/ask";
import type { Sort, TimeRange } from "@/lib/types";

import { formatCount, plural } from "./format";
import type { PostLayout } from "./post-layout";
import { menuContent, menuItem, pillControl } from "./styles";
import { Tip } from "./tip";

export type SearchMode = "search" | "ask";
export type View = "posts" | "resources";

const LAYOUT_ITEM = "focus-ring flex h-8 w-9 items-center justify-center px-0 text-ink-muted data-checked:text-on-primary [&>svg]:size-4";

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

const CHANGED = "bg-primary-soft text-primary-text shadow-none [&>svg]:text-primary-text hover:bg-primary-soft hover:shadow-none";

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
  askActive: boolean;
  askedQuery: string | null;
  timeRange: TimeRange;
  sort: Sort;
  mediaOnly: boolean;
  sortable: boolean;
  onKeyword: (keyword: string) => void;
  onAskDraft: (draft: string) => void;
  onAsk: (query: string) => void;
  onLeaveAsk: () => void;
  onTimeRange: (timeRange: TimeRange) => void;
  onSort: (sort: Sort) => void;
  onMediaOnly: (mediaOnly: boolean) => void;
  layout: PostLayout;
  onLayout: (layout: PostLayout) => void;
  view: View;
  onView: (view: View) => void;
  count: number;
  bookmarked: number;
  liked: number;
  resourceCount: number | null;
};

const noSubscribe = () => () => {};
const useIsMac = () =>
  useSyncExternalStore(
    noSubscribe,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => true,
  );

function SearchField({ h }: { h: PageHeaderProps }) {
  const asking = h.mode === "ask";
  const value = asking ? h.askDraft : h.keyword;
  const mac = useIsMac();
  const query = value.trim().slice(0, MAX_QUERY_CHARS);
  const ask = () => {
    if (query) h.onAsk(query);
  };
  const Lead = asking ? Sparkles : Search;
  return (
    <form
      role="search"
      className="min-w-[min(20rem,100%)] flex-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (asking && query !== h.askedQuery) ask();
      }}
    >
      <InputGroup className="group h-10 items-center gap-2 rounded-full bg-surface pr-1.5 pl-3.5 shadow-card transition-shadow duration-150 ease-out has-[input:focus-visible]:shadow-[0_0_0_2px_var(--color-primary)]">
        <Lead className={`size-4 shrink-0 ${asking ? "text-primary-text" : "text-ink-muted"}`} aria-hidden="true" />
        <Input
          id={SEARCH_INPUT_ID}
          aria-keyshortcuts="/"
          type="search"
          enterKeyHint={asking ? "send" : "search"}
          aria-label={asking ? "Question about your saved posts" : "Search saved posts, or ask a question"}
          placeholder={asking ? "Edit the question, then press Enter" : "Search, or ask a question…"}
          autoComplete="off"
          spellCheck={false}
          maxLength={asking ? MAX_QUERY_CHARS : undefined}
          value={value}
          onValueChange={asking ? h.onAskDraft : h.onKeyword}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              ask();
            }
          }}
          className="min-w-0 text-[16px] placeholder:text-ink-muted sm:text-[14px] [&::-webkit-search-cancel-button]:hidden"
        />
        {value === "" ? (
          <kbd
            aria-hidden="true"
            className="pointer-events-none hidden h-5 min-w-5 shrink-0 items-center justify-center rounded-[6px] bg-sunken px-1 font-sans text-[11px] font-semibold text-ink-muted group-has-[input:focus]:invisible pointer-fine:flex"
          >
            /
          </kbd>
        ) : (
          <InputClear
            aria-label={asking ? "Clear the question and go back to search" : "Clear search"}
            onClick={asking ? h.onLeaveAsk : undefined}
            className="focus-ring pressable relative flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-ink-muted before:absolute before:-inset-1.5 hover:bg-sunken hover:text-ink"
          >
            <X className="size-4" aria-hidden="true" />
          </InputClear>
        )}
        {!asking && value.trim() !== "" ? (
          <button
            type="button"
            onClick={ask}
            aria-keyshortcuts={mac ? "Meta+Enter" : "Control+Enter"}
            className="focus-ring pressable inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-primary-soft pr-2 pl-3 text-[13px] font-semibold text-primary-text hover:bg-[color-mix(in_oklch,var(--color-primary-soft)_85%,var(--color-primary))]"
          >
            <Sparkles className="size-3.5" aria-hidden="true" />
            Ask
            <kbd aria-hidden="true" className="hidden h-5 items-center rounded-[6px] bg-surface/70 px-1 font-sans text-[11px] font-semibold pointer-fine:inline-flex">
              {mac ? "⌘↵" : "Ctrl ↵"}
            </kbd>
          </button>
        ) : null}
      </InputGroup>
    </form>
  );
}

function Choice<T extends string>({
  label,
  icon: Icon,
  options,
  value,
  fallback,
  onChange,
}: {
  label: string;
  icon: LucideIcon;
  options: { value: T; label: string }[];
  value: T;
  fallback: T;
  onChange: (value: T) => void;
}) {
  const current = options.find((option) => option.value === value) ?? options[0];
  return (
    <Menu>
      <MenuTrigger aria-label={`${label}: ${current.label}`} className={`${pillControl} ${value === fallback ? "" : CHANGED}`}>
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
  const sep = <span aria-hidden="true">·</span>;
  return (
    <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[13px] text-ink-muted" aria-live="polite">
      <span>
        <span className="font-semibold text-ink tabular-nums">{formatCount(h.count)}</span>{" "}
        {plural(h.count, h.askActive ? "match" : "post", h.askActive ? "matches" : "posts")}
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
          {sep}
          <span>
            <span className="tabular-nums">{formatCount(h.bookmarked)}</span> bookmarked
          </span>
          {sep}
          <span>
            <span className="tabular-nums">{formatCount(h.liked)}</span> liked
          </span>
        </>
      )}
    </p>
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
  const query = JSON.stringify([h.keyword, h.timeRange, h.sort, h.mediaOnly, h.view, h.askActive]);
  const lastQuery = useRef(query);
  useEffect(() => {
    if (query === lastQuery.current) return;
    lastQuery.current = query;
    if (stuckRef.current) window.scrollTo({ top: 0, behavior: "instant" });
  }, [query]);

  return (
    <>
      <header className="@container flex flex-col gap-3 px-4 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3 @max-2xl:basis-full">
            {h.menuButton}
            <div className="min-w-0 flex-1">
              {h.eyebrow ? <p className="text-eyebrow mb-1 text-ink-muted">{h.eyebrow}</p> : null}
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 className="text-display text-[26px] leading-[1.1] text-ink sm:text-[30px]">{h.title}</h1>
                <CountLine h={h} />
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 @max-2xl:w-full">
            {h.view === "posts" ? (
              <SegmentedControl aria-label="Layout" value={h.layout} onValueChange={(next) => next && h.onLayout(next as PostLayout)} className="shrink-0 border-0 bg-sunken p-[3px]">
                <SegmentedControlIndicator />
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
            ) : null}
            <SegmentedControl aria-label="View" value={h.view} onValueChange={(next) => next && h.onView(next as View)} className="ml-auto shrink-0 border-0 bg-sunken p-[3px]">
              <SegmentedControlIndicator />
              <SegmentedControlItem value="posts" className="focus-ring h-8 px-3.5 text-[13px] font-semibold">
                Posts
              </SegmentedControlItem>
              <SegmentedControlItem value="resources" className="focus-ring h-8 px-3.5 text-[13px] font-semibold">
                Resources
              </SegmentedControlItem>
            </SegmentedControl>
          </div>
        </div>
        {h.detail ? <p className="max-w-[60ch] text-[14px] leading-[1.5] text-pretty text-ink-muted">{h.detail}</p> : null}
      </header>
      <div ref={ref} aria-hidden="true" className="h-0" />
      <div ref={pinnedRef} data-stuck={stuck ? "" : undefined} className="pinned-row sticky top-0 z-20 px-4 py-2 sm:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <SearchField h={h} />
          <div className="flex flex-wrap items-center gap-2">
            <Choice label="Time range" icon={CalendarDays} options={TIME_RANGES} value={h.timeRange} fallback="all" onChange={h.onTimeRange} />
            {h.sortable ? <Choice label="Sort" icon={ArrowDownUp} options={SORTS} value={h.sort} fallback="newest" onChange={h.onSort} /> : null}
            <Toggle
              pressed={h.mediaOnly}
              onPressedChange={h.onMediaOnly}
              aria-label="Only posts with media"
              className={`${pillControl} w-auto data-pressed:bg-primary-soft data-pressed:text-primary-text data-pressed:shadow-none data-pressed:[&>svg]:text-primary-text`}
            >
              {h.mediaOnly ? <Check aria-hidden="true" /> : <ImageIcon aria-hidden="true" />}
              Media
            </Toggle>
            <button
              type="button"
              onClick={h.onSurprise}
              disabled={!h.canSurprise}
              aria-label="Surprise me: open a random post"
              title="Surprise me"
              className={`${pillControl} w-9 justify-center px-0! disabled:cursor-default disabled:opacity-50 [&>svg]:size-4! [&>svg]:text-ink!`}
            >
              <Shuffle aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
