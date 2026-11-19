"use client";

import { AtSign, Folder, Inbox, Search, Tag, X, type LucideIcon } from "lucide-react";

import type { Area, FilterState, Topic } from "@/lib/types";

function Pill({ icon: Icon, label, kind, onRemove }: { icon: LucideIcon; label: string; kind: string; onRemove: () => void }) {
  return (
    <li className="flex min-w-0">
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${kind} ${label}`}
        className="focus-ring pressable group inline-flex h-7 max-w-full cursor-pointer items-center gap-1.5 rounded-full bg-primary-soft pr-1.5 pl-2.5 text-[13px] font-semibold text-primary-text hover:bg-[color-mix(in_oklch,var(--color-primary-soft)_90%,var(--color-primary))]"
      >
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
        <X className="size-3.5 shrink-0 opacity-70 group-hover:opacity-100" aria-hidden="true" />
      </button>
    </li>
  );
}

/** Each active topic, area, author and keyword as a pill that removes it, with one action to clear them all. */
export function ActiveFilters({
  filter,
  topicsById,
  areasById,
  authorName,
  onRemoveTopic,
  onRemoveArea,
  onRemoveUnfiled,
  onRemoveAuthor,
  onRemoveKeyword,
  onClear,
}: {
  filter: FilterState;
  topicsById: Map<number, Topic>;
  areasById: Map<number, Area>;
  authorName: string | null;
  onRemoveTopic: (topicId: number) => void;
  onRemoveArea: (areaId: number) => void;
  onRemoveUnfiled: () => void;
  onRemoveAuthor: () => void;
  onRemoveKeyword: () => void;
  onClear: () => void;
}) {
  const keyword = filter.keyword.trim();
  const count =
    filter.topicIds.length + filter.areaIds.length + Number(filter.unfiled) + Number(filter.author !== null) + Number(keyword !== "");
  if (count === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <ul aria-label="Active filters" className="flex min-w-0 flex-wrap items-center gap-1.5">
        {filter.areaIds.map((id) => (
          <Pill key={`a${id}`} icon={Folder} kind="area" label={areasById.get(id)?.name ?? "Area"} onRemove={() => onRemoveArea(id)} />
        ))}
        {filter.topicIds.map((id) => (
          <Pill key={`t${id}`} icon={Tag} kind="topic" label={topicsById.get(id)?.name ?? "Topic"} onRemove={() => onRemoveTopic(id)} />
        ))}
        {filter.unfiled ? <Pill icon={Inbox} kind="filter" label="Unfiled" onRemove={onRemoveUnfiled} /> : null}
        {filter.author !== null ? (
          <Pill icon={AtSign} kind="author" label={authorName ?? filter.author} onRemove={onRemoveAuthor} />
        ) : null}
        {keyword !== "" ? <Pill icon={Search} kind="search" label={`“${keyword}”`} onRemove={onRemoveKeyword} /> : null}
      </ul>
      {count > 1 ? (
        <button
          type="button"
          onClick={onClear}
          className="focus-ring pressable h-7 cursor-pointer rounded-full px-2 text-[13px] font-semibold text-ink-muted hover:text-ink"
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
}
