"use client";

import { Input, InputClear, InputGroup } from "@ui-sdk/react/input";
import { Menu, MenuContent, MenuItemIndicator, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@ui-sdk/react/menu";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { Toggle, ToggleIcon } from "@ui-sdk/react/toggle";
import { ArrowDownUp, CalendarDays, ChevronDown, Image as ImageIcon, Search, Sparkles, X, type LucideIcon } from "lucide-react";

import { MAX_QUERY_CHARS } from "@/lib/ask";
import type { Sort, TimeRange } from "@/lib/types";

import { menuContent, menuItem, pillControl } from "./styles";

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

export type SearchMode = "search" | "ask";

export const SEARCH_INPUT_ID = "post-search";

const MODE_ITEM = "focus-ring h-7 gap-1.5 px-3 text-[13px] font-semibold [&>svg]:size-3.5";

const CHANGED = "bg-primary-soft text-primary-text shadow-none [&>svg]:text-primary-text hover:bg-primary-soft hover:shadow-none";

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
  /** The value that means "no narrowing", shown without emphasis. */
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

export function Toolbar({
  mode,
  keyword,
  askDraft,
  timeRange,
  sort,
  mediaOnly,
  sortable,
  onMode,
  onKeyword,
  onAskDraft,
  onAsk,
  onTimeRange,
  onSort,
  onMediaOnly,
}: {
  mode: SearchMode;
  keyword: string;
  askDraft: string;
  timeRange: TimeRange;
  sort: Sort;
  mediaOnly: boolean;
  /** False while the list is ranked by something other than the sort, as ask results are. */
  sortable: boolean;
  onMode: (mode: SearchMode) => void;
  onKeyword: (keyword: string) => void;
  onAskDraft: (draft: string) => void;
  onAsk: () => void;
  onTimeRange: (timeRange: TimeRange) => void;
  onSort: (sort: Sort) => void;
  onMediaOnly: (mediaOnly: boolean) => void;
}) {
  const asking = mode === "ask";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        role="search"
        className="min-w-[min(20rem,100%)] flex-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (asking) onAsk();
        }}
      >
        <InputGroup className="group h-10 items-center gap-2 rounded-full bg-surface pr-1.5 pl-1.5 shadow-card transition-shadow duration-150 ease-out has-[input:focus-visible]:shadow-[0_0_0_2px_var(--color-primary)]">
          <SegmentedControl
            aria-label="Search mode"
            value={mode}
            onValueChange={(next) => next && onMode(next as SearchMode)}
            className="shrink-0 border-0 bg-sunken p-[2px]"
          >
            <SegmentedControlIndicator />
            <SegmentedControlItem value="search" className={MODE_ITEM}>
              <Search aria-hidden="true" />
              Search
            </SegmentedControlItem>
            <SegmentedControlItem value="ask" className={MODE_ITEM}>
              <Sparkles aria-hidden="true" />
              Ask
            </SegmentedControlItem>
          </SegmentedControl>
          <Input
            id={SEARCH_INPUT_ID}
            aria-keyshortcuts="/"
            type="search"
            enterKeyHint="search"
            aria-label={asking ? "Ask about your saved posts" : "Search saved posts"}
            placeholder={asking ? "Describe a topic, then press Enter" : "Search posts, authors, and linked pages"}
            autoComplete="off"
            spellCheck={false}
            maxLength={asking ? MAX_QUERY_CHARS : undefined}
            value={asking ? askDraft : keyword}
            onValueChange={asking ? onAskDraft : onKeyword}
            className="min-w-0 text-[16px] placeholder:text-ink-muted sm:text-[14px] [&::-webkit-search-cancel-button]:hidden"
          />
          {(asking ? askDraft : keyword) === "" ? (
            <kbd
              aria-hidden="true"
              className="pointer-events-none hidden h-5 min-w-5 shrink-0 items-center justify-center rounded-[6px] bg-sunken px-1 font-sans text-[11px] font-semibold text-ink-muted group-has-[input:focus]:invisible pointer-fine:flex"
            >
              /
            </kbd>
          ) : null}
          <InputClear
            aria-label={asking ? "Clear question" : "Clear search"}
            className="focus-ring pressable flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-ink-muted hover:bg-sunken hover:text-ink"
          >
            <X className="size-4" aria-hidden="true" />
          </InputClear>
        </InputGroup>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <Choice label="Time range" icon={CalendarDays} options={TIME_RANGES} value={timeRange} fallback="all" onChange={onTimeRange} />
        {sortable ? <Choice label="Sort" icon={ArrowDownUp} options={SORTS} value={sort} fallback="newest" onChange={onSort} /> : null}
        <Toggle pressed={mediaOnly} onPressedChange={onMediaOnly} className={`${pillControl} data-pressed:bg-primary-soft data-pressed:text-primary-text data-pressed:shadow-none data-pressed:[&_svg]:text-primary-text`}>
          <ToggleIcon>
            <ImageIcon className="size-3.5 text-ink-muted" />
          </ToggleIcon>
          Media
        </Toggle>
      </div>
    </div>
  );
}
