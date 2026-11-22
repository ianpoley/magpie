"use client";

import { DialogTrigger } from "@ui-sdk/react/dialog";
import { Input, InputClear, InputGroup } from "@ui-sdk/react/input";
import { ScrollArea, ScrollAreaContent, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport } from "@ui-sdk/react/scroll-area";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { Toggle, ToggleIcon } from "@ui-sdk/react/toggle";
import { Bookmark, Eye, Heart, Layers, Search, Settings, Tags, Trash2, X, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { AuthorCount, Collection, FilterState, Post, Snapshot } from "@/lib/types";

import { AuthorAvatar } from "./author-avatar";
import type { CategoryEdits } from "./category-menu";
import { CategoryTree } from "./category-tree";
import { formatCount } from "./format";
import { MagpieMark } from "./magpie";
import { SidebarSection } from "./sidebar-section";
import type { RemovedPostsController } from "./removed-posts";
import type { ConnectXController } from "./connect-x-dialog";
import type { SettingsController } from "./settings-dialog";
import { SIDE_FOOTER_ROW, SyncStatus, type SyncController } from "./sync-status";
import { UpdateNotice } from "./update-notice";

const COLLECTIONS: { value: Collection; label: string; icon: LucideIcon }[] = [
  { value: "everything", label: "Everything", icon: Layers },
  { value: "bookmarks", label: "Bookmarks", icon: Bookmark },
  { value: "likes", label: "Likes", icon: Heart },
];

const SIDE_ROW =
  "focus-ring-side pressable flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-0 px-2.5 text-left text-[13px] text-side-ink";

export type SidebarProps = {
  snapshot: Snapshot;
  sync: SyncController;
  connectX: ConnectXController;
  settings: SettingsController;
  settingsAttention: boolean;
  filter: FilterState;
  viewed: (post: Post) => boolean;
  totals: { everything: number; bookmarks: number; likes: number };
  authors: AuthorCount[];
  expanded: string[];
  removedPosts: RemovedPostsController;
  categoryEdits: CategoryEdits;
  closedSections: string[];
  headerAction?: ReactNode;
  onCollection: (collection: Collection) => void;
  onExpandedChange: (expanded: string[]) => void;
  onToggleTopic: (topicId: number) => void;
  onToggleArea: (areaId: number) => void;
  onToggleUnfiled: () => void;
  onToggleAuthor: (handle: string) => void;
  onRevealHidden: (reveal: boolean) => void;
};

export function Sidebar({
  snapshot,
  sync,
  connectX,
  settings,
  settingsAttention,
  filter,
  viewed,
  totals,
  authors,
  expanded,
  removedPosts,
  categoryEdits,
  closedSections,
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
  const removedCount = snapshot.removed.length;
  const [categoryQuery, setCategoryQuery] = useState("");

  return (
    <div className="side-scope bg-side @container flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <MagpieMark />
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
            <SidebarSection
              id="categories"
              title="Categories"
              label="Categories"
              closedOnServer={closedSections.includes("categories")}
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
              {hasCategories ? (
                <InputGroup className="mx-0.5 mb-2 h-9 w-auto items-center gap-2 rounded-full border-0 bg-side-hover pr-1 pl-3 transition-shadow duration-150 ease-out has-[input:focus-visible]:shadow-[0_0_0_2px_var(--color-side-ink)]">
                  <Search className="size-3.5 shrink-0 text-side-muted" aria-hidden="true" />
                  <Input
                    type="search"
                    enterKeyHint="search"
                    aria-label="Search categories"
                    placeholder="Search categories"
                    autoComplete="off"
                    spellCheck={false}
                    value={categoryQuery}
                    onValueChange={setCategoryQuery}
                    onKeyDown={(event) => {
                      if (event.key !== "Escape" || categoryQuery === "") return;
                      event.preventDefault();
                      event.stopPropagation();
                      setCategoryQuery("");
                    }}
                    className="min-w-0 text-[16px] text-side-ink placeholder:text-side-muted sm:text-[13px] [&::-webkit-search-cancel-button]:hidden"
                  />
                  <InputClear
                    aria-label="Clear category search"
                    className="focus-ring-side pressable flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-side-muted hover:bg-side-wash hover:text-side-ink"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </InputClear>
                </InputGroup>
              ) : null}
              {hasCategories ? (
                <CategoryTree
                  snapshot={snapshot}
                  filter={filter}
                  viewed={viewed}
                  query={categoryQuery}
                  expanded={expanded}
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
                  className={`${SIDE_ROW} mt-2 h-8 justify-start bg-transparent pr-1.5 font-semibold text-side-muted hover:bg-side-hover`}
                >
                  <Trash2 className="size-3.5 shrink-0" aria-hidden="true" />
                  Removed
                  <span className="ml-auto text-[12px] font-medium tabular-nums">{formatCount(removedCount)}</span>
                  <span aria-hidden="true" className="-mr-1 ml-1 size-6 shrink-0" />
                </DialogTrigger>
              ) : null}
            </SidebarSection>

            {authors.length > 0 ? (
              <SidebarSection id="most-saved" title="Most saved" label="Most saved authors" closedOnServer={closedSections.includes("most-saved")}>
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
              </SidebarSection>
            ) : null}
          </ScrollAreaContent>
        </ScrollAreaViewport>
        <ScrollAreaScrollbar orientation="vertical">
          <ScrollAreaThumb />
        </ScrollAreaScrollbar>
      </ScrollArea>

      <div className="flex flex-col gap-0.5 border-t border-[color-mix(in_oklch,var(--color-side-ink)_12%,transparent)] px-3 pt-2 pb-3">
        <UpdateNotice />
        <SyncStatus sync={sync} connectX={connectX} />
        <DialogTrigger controller={settings} aria-keyshortcuts="Meta+, Control+," className={SIDE_FOOTER_ROW}>
          <Settings className="size-4 shrink-0 text-side-muted" aria-hidden="true" />
          Settings
          {settingsAttention ? (
            <>
              <span aria-hidden="true" className="ml-auto size-2 shrink-0 rounded-full bg-like" />
              <span className="sr-only">, something needs attention</span>
            </>
          ) : null}
        </DialogTrigger>
      </div>
    </div>
  );
}
