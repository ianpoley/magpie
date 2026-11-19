"use client";

import { Input, InputClear, InputGroup } from "@ui-sdk/react/input";
import { Menu, MenuContent, MenuItemIndicator, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@ui-sdk/react/menu";
import { Toggle, ToggleIcon } from "@ui-sdk/react/toggle";
import { ArrowDownUp, CalendarDays, ChevronDown, Image as ImageIcon, Search, X, type LucideIcon } from "lucide-react";

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
  { value: "oldest", label: "Oldest" },
  { value: "most_liked", label: "Most liked" },
];

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

/** Keyword search, time range, sort, and the media-only switch. */
export function Toolbar({
  keyword,
  timeRange,
  sort,
  mediaOnly,
  onKeyword,
  onTimeRange,
  onSort,
  onMediaOnly,
}: {
  keyword: string;
  timeRange: TimeRange;
  sort: Sort;
  mediaOnly: boolean;
  onKeyword: (keyword: string) => void;
  onTimeRange: (timeRange: TimeRange) => void;
  onSort: (sort: Sort) => void;
  onMediaOnly: (mediaOnly: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <InputGroup className="h-10 min-w-56 flex-1 items-center gap-2 rounded-full bg-surface pr-1.5 pl-3.5 shadow-card transition-shadow duration-150 ease-out has-[input:focus-visible]:shadow-[0_0_0_2px_var(--color-primary)]">
        <Search className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
        <Input
          type="search"
          aria-label="Search saved posts"
          placeholder="Search posts, authors, and linked pages"
          autoComplete="off"
          spellCheck={false}
          value={keyword}
          onValueChange={onKeyword}
          className="min-w-0 text-[16px] placeholder:text-ink-muted sm:text-[14px] [&::-webkit-search-cancel-button]:hidden"
        />
        <InputClear
          aria-label="Clear search"
          className="focus-ring pressable flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-ink-muted hover:bg-sunken hover:text-ink"
        >
          <X className="size-4" aria-hidden="true" />
        </InputClear>
      </InputGroup>

      <div className="flex flex-wrap items-center gap-2">
        <Choice label="Time range" icon={CalendarDays} options={TIME_RANGES} value={timeRange} fallback="all" onChange={onTimeRange} />
        <Choice label="Sort" icon={ArrowDownUp} options={SORTS} value={sort} fallback="newest" onChange={onSort} />
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
