"use client";
// Throwaway — header round: the shared parts the header variants are built from, on top of Murmur.
// Every variant keeps the same functions as the original: Surprise, search, Ask, time, sort, media, Posts/Resources, the count.
// The one behaviour change they share: Ask is an action on the search field (button or ⌘↵), not a mode you switch into first.

import { Input, InputClear, InputGroup } from "@ui-sdk/react/input";
import { Menu, MenuContent, MenuItemIndicator, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@ui-sdk/react/menu";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { Toggle } from "@ui-sdk/react/toggle";
import { ArrowDownUp, CalendarDays, Check, ChevronDown, Image as ImageIcon, Search, Shuffle, Sparkles, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { formatCount, plural } from "@/components/format";
import { menuContent, menuItem, pillControl } from "@/components/styles";
import { SEARCH_INPUT_ID, type SearchMode } from "@/components/toolbar";
import { MAX_QUERY_CHARS } from "@/lib/ask";
import type { Sort, TimeRange } from "@/lib/types";

export type HeaderProps = {
  /** The small-screen button that opens the filters panel. */
  menuButton: ReactNode;
  eyebrow: string;
  title: string;
  detail: string | null;
  onSurprise: () => void;
  canSurprise: boolean;
  mode: SearchMode;
  keyword: string;
  askDraft: string;
  /** An ask is on screen (running or done). */
  askActive: boolean;
  timeRange: TimeRange;
  sort: Sort;
  mediaOnly: boolean;
  sortable: boolean;
  onKeyword: (keyword: string) => void;
  onAskDraft: (draft: string) => void;
  onAskQuery: (query: string) => void;
  onLeaveAsk: () => void;
  onTimeRange: (timeRange: TimeRange) => void;
  onSort: (sort: Sort) => void;
  onMediaOnly: (mediaOnly: boolean) => void;
  view: "posts" | "resources";
  onView: (view: "posts" | "resources") => void;
  count: number;
  bookmarked: number;
  liked: number;
  resourceCount: number | null;
};

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
/** A control that sits inside another surface: no shadow of its own. */
const BARE =
  "focus-ring pressable inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-transparent px-3 text-[13px] font-medium text-ink " +
  "[&>svg]:size-3.5 [&>svg]:text-ink-muted hover:bg-sunken";

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/* ---------------- search + ask ---------------- */

/** One field. Typing filters live; Ask (button or ⌘↵) sends what you typed as a question. */
export function UnifiedSearch({ h, className = "", bare = false, trailing }: { h: HeaderProps; className?: string; bare?: boolean; trailing?: ReactNode }) {
  const asking = h.mode === "ask";
  const value = asking ? h.askDraft : h.keyword;
  // The harness renders nothing on the server, so reading the platform during render cannot mismatch.
  const mac = isMac();
  const canAsk = value.trim().length > 0;
  const ask = () => {
    const q = value.trim().slice(0, MAX_QUERY_CHARS);
    if (q) h.onAskQuery(q);
  };
  const Lead = asking ? Sparkles : Search;
  return (
    <form
      role="search"
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        // Plain Enter re-runs an open ask; in search, results are already live.
        if (asking) ask();
      }}
    >
      <InputGroup
        className={`group items-center gap-2 pr-1.5 pl-3.5 ${bare ? "h-11 rounded-full border-0 bg-transparent shadow-none" : "h-10 rounded-full bg-surface shadow-card transition-shadow duration-150 ease-out has-[input:focus-visible]:shadow-[0_0_0_2px_var(--color-primary)]"}`}
      >
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
        {!asking && canAsk ? (
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
        {trailing}
      </InputGroup>
    </form>
  );
}

/* ---------------- filters ---------------- */

function Choice<T extends string>({
  label,
  icon: Icon,
  options,
  value,
  fallback,
  onChange,
  bare,
}: {
  label: string;
  icon: LucideIcon;
  options: { value: T; label: string }[];
  value: T;
  fallback: T;
  onChange: (value: T) => void;
  bare?: boolean;
}) {
  const current = options.find((option) => option.value === value) ?? options[0];
  return (
    <Menu>
      <MenuTrigger aria-label={`${label}: ${current.label}`} className={`${bare ? BARE : pillControl} ${value === fallback ? "" : CHANGED}`}>
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

/** Media is an on/off filter, so it reads as one: a check appears and it fills when on. */
function MediaChip({ h, bare }: { h: HeaderProps; bare?: boolean }) {
  return (
    <Toggle
      pressed={h.mediaOnly}
      onPressedChange={h.onMediaOnly}
      aria-label="Only posts with media"
      className={`${bare ? BARE : pillControl} w-auto data-pressed:bg-primary-soft data-pressed:text-primary-text data-pressed:shadow-none data-pressed:[&>svg]:text-primary-text`}
    >
      {h.mediaOnly ? <Check aria-hidden="true" /> : <ImageIcon aria-hidden="true" />}
      Media
    </Toggle>
  );
}

export function Filters({ h, bare }: { h: HeaderProps; bare?: boolean }) {
  return (
    <>
      <Choice label="Time range" icon={CalendarDays} options={TIME_RANGES} value={h.timeRange} fallback="all" onChange={h.onTimeRange} bare={bare} />
      {h.sortable ? <Choice label="Sort" icon={ArrowDownUp} options={SORTS} value={h.sort} fallback="newest" onChange={h.onSort} bare={bare} /> : null}
      <MediaChip h={h} bare={bare} />
    </>
  );
}

/* ---------------- view, surprise, count ---------------- */

export function ViewSwitch({ h }: { h: HeaderProps }) {
  return (
    <SegmentedControl aria-label="View" value={h.view} onValueChange={(next) => next && h.onView(next as HeaderProps["view"])} className="shrink-0 border-0 bg-sunken p-[3px]">
      <SegmentedControlIndicator />
      <SegmentedControlItem value="posts" className="focus-ring h-8 px-3.5 text-[13px] font-semibold">
        Posts
      </SegmentedControlItem>
      <SegmentedControlItem value="resources" className="focus-ring h-8 px-3.5 text-[13px] font-semibold">
        Resources
      </SegmentedControlItem>
    </SegmentedControl>
  );
}

/** Underlined text tabs: the lightest way to say "two views of the same posts". */
export function ViewTabs({ h }: { h: HeaderProps }) {
  const tab = (value: HeaderProps["view"], label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={h.view === value}
      onClick={() => h.onView(value)}
      className={`focus-ring relative h-8 cursor-pointer rounded-[6px] border-0 bg-transparent px-1 text-[13px] font-semibold transition-colors duration-150 ease-out after:absolute after:inset-x-1 after:-bottom-px after:h-[2px] after:rounded-full after:transition-colors after:duration-150 ${
        h.view === value ? "text-ink after:bg-primary" : "text-ink-muted after:bg-transparent hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div role="tablist" aria-label="View" className="flex shrink-0 items-center gap-3">
      {tab("posts", "Posts")}
      {tab("resources", "Resources")}
    </div>
  );
}

export function SurpriseButton({ h, iconOnly }: { h: HeaderProps; iconOnly?: boolean }) {
  return (
    <button
      type="button"
      onClick={h.onSurprise}
      disabled={!h.canSurprise}
      aria-label={iconOnly ? "Surprise me: open a random post" : undefined}
      title={iconOnly ? "Surprise me" : undefined}
      className={`${pillControl} disabled:cursor-default disabled:opacity-50 ${iconOnly ? "w-9 justify-center px-0! [&>svg]:size-4! [&>svg]:text-ink!" : ""}`}
    >
      <Shuffle aria-hidden="true" />
      {iconOnly ? null : "Surprise"}
    </button>
  );
}

/** One line of orientation: the count, and how much of it you bookmarked and liked. */
export function CountLine({ h, className = "" }: { h: HeaderProps; className?: string }) {
  const sep = <span aria-hidden="true">·</span>;
  return (
    <p className={`flex min-w-0 flex-wrap items-baseline gap-x-2 text-[13px] text-ink-muted ${className}`} aria-live="polite">
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

/** The eyebrow only earns its line when it says something the title does not (the collection or area). */
export const contextLine = (h: HeaderProps) => (h.eyebrow === "Your saved posts" ? null : h.eyebrow);

/** True once the element has scrolled under the top of the viewport. */
export function useStuck() {
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
