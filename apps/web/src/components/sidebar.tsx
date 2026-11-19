"use client";

import { DialogTrigger } from "@ui-sdk/react/dialog";
import { ScrollArea, ScrollAreaContent, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport } from "@ui-sdk/react/scroll-area";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { Toggle, ToggleIcon } from "@ui-sdk/react/toggle";
import { Bookmark, Eye, Heart, History, Layers, Sprout, Tags, Trash2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { AuthorCount, Collection, FilterState, Snapshot } from "@/lib/types";

import { AuthorAvatar } from "./author-avatar";
import type { CategoryEdits } from "./category-menu";
import { CategoryTree } from "./category-tree";
import { formatCount } from "./format";
import type { RemovedPostsController } from "./removed-posts";
import { SyncStatus } from "./sync-status";
import type { WhatChangedController } from "./what-changed";

const COLLECTIONS: { value: Collection; label: string; icon: LucideIcon }[] = [
  { value: "everything", label: "Everything", icon: Layers },
  { value: "bookmarks", label: "Bookmarks", icon: Bookmark },
  { value: "likes", label: "Likes", icon: Heart },
];

const SIDE_ROW =
  "focus-ring-side pressable flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-0 px-2.5 text-left text-[13px] text-side-ink";

function Eyebrow({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-1.5 flex h-7 items-center justify-between pr-1 pl-2.5">
      <h2 className="text-eyebrow text-side-muted">{children}</h2>
      {action}
    </div>
  );
}

export type SidebarProps = {
  snapshot: Snapshot;
  now: number;
  filter: FilterState;
  totals: { everything: number; bookmarks: number; likes: number; unfiled: number };
  authors: AuthorCount[];
  expanded: string[];
  whatChanged: WhatChangedController;
  removedPosts: RemovedPostsController;
  categoryEdits: CategoryEdits;
  /** A control shown beside the name, such as the close button of the narrow-screen panel. */
  headerAction?: ReactNode;
  onCollection: (collection: Collection) => void;
  onExpandedChange: (expanded: string[]) => void;
  onToggleTopic: (topicId: number) => void;
  onToggleArea: (areaId: number) => void;
  onToggleUnfiled: () => void;
  onToggleAuthor: (handle: string) => void;
  onRevealHidden: (reveal: boolean) => void;
};

/** Collections, categories and most-saved authors, with sync status pinned to the bottom. */
export function Sidebar({
  snapshot,
  now,
  filter,
  totals,
  authors,
  expanded,
  whatChanged,
  removedPosts,
  categoryEdits,
  headerAction,
  onCollection,
  onExpandedChange,
  onToggleTopic,
  onToggleArea,
  onToggleUnfiled,
  onToggleAuthor,
  onRevealHidden,
}: SidebarProps) {
  const hasCategories = snapshot.topics.length > 0;
  const hasHidden = snapshot.areas.some((area) => area.hidden) || snapshot.topics.some((topic) => topic.hiddenSelf);
  const changeCount = snapshot.changes.length;
  const removedCount = snapshot.removed.length;

  return (
    <div className="side-scope bg-side flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <span className="bg-primary-fill flex size-8 items-center justify-center rounded-[10px] text-on-primary shadow-primary">
          <Sprout className="size-[18px]" aria-hidden="true" />
        </span>
        <p className="text-[17px] font-extrabold tracking-[-0.03em] text-side-ink">x-corpus</p>
        {headerAction ? <div className="ml-auto">{headerAction}</div> : null}
      </div>

      <nav aria-label="Collections" className="px-3 pb-3">
        <SegmentedControl
          aria-label="Collection"
          orientation="vertical"
          value={filter.collection}
          onValueChange={(value) => {
            if (value) onCollection(value as Collection);
          }}
          className="flex w-full gap-0.5 border-0 bg-transparent p-0"
        >
          <SegmentedControlIndicator className="rounded-[10px] bg-side-wash bg-none shadow-none" />
          {COLLECTIONS.map(({ value, label, icon: Icon }) => (
            <SegmentedControlItem
              key={value}
              value={value}
              className="focus-ring-side h-9 flex-none justify-start gap-2.5 rounded-[10px] px-2.5 text-[13px] text-side-ink hover:bg-side-hover data-checked:font-semibold data-checked:hover:bg-transparent"
            >
              <Icon className="size-4 shrink-0 text-side-muted" aria-hidden="true" />
              {label}
              <span className="ml-auto text-[12px] font-medium text-side-muted tabular-nums in-data-checked:text-side-ink">{formatCount(totals[value])}</span>
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      </nav>

      <ScrollArea type="hover" className="min-h-0 flex-1 rounded-none border-0">
        <ScrollAreaViewport>
          <ScrollAreaContent className="flex flex-col gap-5 px-3 pt-2 pb-5">
            <section aria-label="Categories">
              <Eyebrow
                action={
                  hasHidden ? (
                    <Toggle
                      pressed={filter.revealHidden}
                      onPressedChange={onRevealHidden}
                      className="focus-ring-side pressable h-6 gap-1 rounded-full border-0 bg-transparent px-2 text-[11px] font-semibold text-side-muted hover:bg-side-hover data-pressed:bg-side-wash data-pressed:text-side-ink"
                    >
                      <ToggleIcon>
                        <Eye className="size-3.5" />
                      </ToggleIcon>
                      Show hidden
                    </Toggle>
                  ) : null
                }
              >
                Categories
              </Eyebrow>
              {hasCategories ? (
                <CategoryTree
                  snapshot={snapshot}
                  filter={filter}
                  expanded={expanded}
                  unfiledCount={totals.unfiled}
                  edits={categoryEdits}
                  onExpandedChange={onExpandedChange}
                  onToggleTopic={onToggleTopic}
                  onToggleArea={onToggleArea}
                  onToggleUnfiled={onToggleUnfiled}
                />
              ) : (
                <div className="mx-0.5 flex items-start gap-2.5 rounded-[12px] bg-side-hover px-3 py-3">
                  <Tags className="mt-0.5 size-4 shrink-0 text-side-muted" aria-hidden="true" />
                  <p className="text-[12px] leading-snug text-side-muted">
                    <span className="mb-0.5 block text-[13px] font-semibold text-side-ink">No categories yet</span>
                    Areas and topics appear here once the first sync has sorted your posts.
                  </p>
                </div>
              )}
              {removedCount > 0 ? (
                <DialogTrigger
                  controller={removedPosts}
                  className={`${SIDE_ROW} mt-2 h-8 justify-start bg-transparent pr-2 font-semibold text-side-muted hover:bg-side-hover`}
                >
                  <Trash2 className="size-3.5 shrink-0" aria-hidden="true" />
                  Removed
                  <span className="ml-auto text-[12px] font-medium tabular-nums">{formatCount(removedCount)}</span>
                </DialogTrigger>
              ) : null}
            </section>

            {authors.length > 0 ? (
              <section aria-label="Most saved authors">
                <Eyebrow>Most saved</Eyebrow>
                <ul className="flex flex-col gap-0.5">
                  {authors.map((author) => {
                    const active = filter.author?.toLowerCase() === author.handle.toLowerCase();
                    return (
                      <li key={author.handle}>
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => onToggleAuthor(author.handle)}
                          className={`${SIDE_ROW} ${active ? "bg-side-wash font-semibold" : "bg-transparent font-medium hover:bg-side-hover"}`}
                        >
                          <AuthorAvatar handle={author.handle} name={author.name} url={author.avatarUrl} size="sm" ring={false} />
                          <span className="min-w-0 truncate">{author.name}</span>
                          <span className={`ml-auto shrink-0 text-[12px] font-medium tabular-nums ${active ? "text-side-ink" : "text-side-muted"}`}>{formatCount(author.count)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </ScrollAreaContent>
        </ScrollAreaViewport>
        <ScrollAreaScrollbar orientation="vertical">
          <ScrollAreaThumb />
        </ScrollAreaScrollbar>
      </ScrollArea>

      <div className="flex flex-col gap-1 border-t border-[color-mix(in_oklch,var(--color-side-ink)_12%,transparent)] px-3 pt-3 pb-4">
        <SyncStatus snapshot={snapshot} now={now} />
        <DialogTrigger controller={whatChanged} className={`${SIDE_ROW} justify-start bg-transparent font-medium hover:bg-side-hover`}>
          <History className="size-4 shrink-0 text-side-muted" aria-hidden="true" />
          What changed
          {changeCount > 0 ? (
            <span className="ml-auto text-[12px] font-medium text-side-muted tabular-nums">{formatCount(changeCount)}</span>
          ) : null}
        </DialogTrigger>
      </div>
    </div>
  );
}
