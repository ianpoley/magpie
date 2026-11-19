"use client";

import { Button } from "@ui-sdk/react/button";
import { createDialogController, Dialog, DialogBackdrop, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@ui-sdk/react/dialog";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { Toast, ToastRegion, ToastTitle, toast } from "@ui-sdk/react/toast";
import { CircleAlert, CircleCheck, CloudOff, Inbox, Layers, Link2Off, Menu as MenuIcon, SearchX, Shuffle, Tag, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useState } from "react";

import {
  applyFilter,
  DEFAULT_FILTER,
  mostSavedAuthors,
  postChips,
  selectTopicOnly,
  stats,
  toggleArea,
  toggleAuthor,
  toggleTopic,
  toggleUnfiled,
} from "@/lib/filter";
import { resourcesFor } from "@/lib/resources";
import type { FilterResult, FilterState, Post, Snapshot } from "@/lib/types";

import { ActiveFilters } from "./active-filters";
import { CategoryDialogs, createCategoryEdits } from "./category-menu";
import { areaNode } from "./category-tree";
import { EmptyState } from "./empty-state";
import { formatCount, plural } from "./format";
import { PostDialog } from "./post-dialog";
import { PostList } from "./post-list";
import { createPostTopicsController, PostTopicsEditor } from "./post-topics-editor";
import { ResourceList } from "./resource-list";
import { Sidebar, type SidebarProps } from "./sidebar";
import { StatTiles } from "./stat-tiles";
import { iconButton } from "./styles";
import { TipProvider } from "./tip";
import { Toolbar } from "./toolbar";
import { createWhatChangedController, WhatChanged } from "./what-changed";

type View = "posts" | "resources";

const COLLECTION_TITLES = { everything: "Everything", bookmarks: "Bookmarks", likes: "Likes" } as const;
const RESOURCE_ROWS = 100;
const REFRESH_GAP_MS = 2000;

const randomItem = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

const narrowing = (filter: FilterState): boolean =>
  filter.collection !== "everything" ||
  filter.author !== null ||
  filter.keyword.trim() !== "" ||
  filter.timeRange !== "all" ||
  filter.mediaOnly;

function heading(snapshot: Snapshot, filter: FilterState): { eyebrow: string; title: string; detail: string | null } {
  const collection = COLLECTION_TITLES[filter.collection];
  const selected = filter.topicIds.length + filter.areaIds.length;
  if (filter.unfiled) return { eyebrow: collection, title: "Unfiled", detail: "Posts no topic has claimed with confidence yet." };
  if (selected === 1 && filter.topicIds.length === 1) {
    const topic = snapshot.topics.find((candidate) => candidate.id === filter.topicIds[0]);
    const area = snapshot.areas.find((candidate) => candidate.id === topic?.areaId);
    if (topic) return { eyebrow: area ? `${collection} · ${area.name}` : collection, title: topic.name, detail: topic.definition || null };
  }
  if (selected === 1) {
    const area = snapshot.areas.find((candidate) => candidate.id === filter.areaIds[0]);
    if (area) return { eyebrow: collection, title: area.name, detail: "Posts in any topic of this area." };
  }
  if (selected > 1) return { eyebrow: collection, title: `${selected} categories`, detail: "Posts that are in every one of them." };
  return { eyebrow: "Your saved posts", title: collection, detail: null };
}

/** Why the list is empty, in the user's terms, and the way out. */
function emptyPosts(snapshot: Snapshot, result: FilterResult, clear: () => void, clearCategories: () => void) {
  const filter = result.state;
  const clearButton = (label: string, action: () => void) => (
    <Button data-variant="solid" onClick={action} className="pressable focus-ring h-9 px-4">
      {label}
    </Button>
  );
  if (!snapshot.storeExists) {
    return (
      <EmptyState icon={CloudOff} title="Nothing has synced yet">
        The sync job has not run on this Mac. After its first run, every bookmark and like shows up here.
      </EmptyState>
    );
  }
  if (snapshot.posts.length === 0) {
    return (
      <EmptyState icon={Layers} title="No saved posts yet">
        Bookmark or like a post on X and it appears here after the next sync.
      </EmptyState>
    );
  }
  const selected = filter.topicIds.length + filter.areaIds.length;
  if (narrowing(filter)) {
    return (
      <EmptyState icon={SearchX} title="No posts match" action={clearButton("Clear filters", clear)}>
        {filter.keyword.trim() !== ""
          ? `Nothing you saved mentions “${filter.keyword.trim()}” under these filters. Try a shorter word, or widen the filters.`
          : "No saved post fits every filter that is on. Widen the time range or remove a filter."}
      </EmptyState>
    );
  }
  if (filter.unfiled) {
    return (
      <EmptyState icon={Inbox} title="Nothing is unfiled">
        Every saved post has at least one topic it clearly belongs to.
      </EmptyState>
    );
  }
  if (selected > 1) {
    return (
      <EmptyState icon={Tag} title="No post is in all of these" action={clearButton("Clear categories", clearCategories)}>
        Selecting several categories shows only posts that are in every one. Remove one to see more.
      </EmptyState>
    );
  }
  if (selected === 1) {
    return (
      <EmptyState icon={Tag} title="No posts here yet">
        Nothing you saved matches this category so far. New saves are sorted into it on every sync.
      </EmptyState>
    );
  }
  return (
    <EmptyState icon={SearchX} title="No posts to show">
      Every saved post is in a hidden category. Use Show hidden in the sidebar to see them.
    </EmptyState>
  );
}

export function CorpusScreen({ snapshot, now }: { snapshot: Snapshot; now: number }) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER);
  const [view, setView] = useState<View>("posts");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [postDialog] = useState(() => createDialogController<string>());
  const [whatChanged] = useState(createWhatChangedController);
  const [sidebarPanel] = useState(() => createDialogController());
  const [categoryEdits] = useState(createCategoryEdits);
  const [topicsEditor] = useState(createPostTopicsController);

  // The store changes underneath the page every few hours, and on every edit.
  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < REFRESH_GAP_MS) return;
      last = Date.now();
      router.refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  const keyword = useDeferredValue(filter.keyword);
  const result = applyFilter(snapshot, { ...filter, keyword }, now);
  const applied = result.state;
  const topicsById = new Map(snapshot.topics.map((topic) => [topic.id, topic]));
  const areasById = new Map(snapshot.areas.map((area) => [area.id, area]));
  const postsById = new Map(snapshot.posts.map((post) => [post.id, post]));

  const shownPosts = snapshot.posts.filter((post) => applied.revealHidden || !post.hidden);
  const totals = {
    everything: shownPosts.length,
    bookmarks: shownPosts.filter((post) => post.bookmarked).length,
    likes: shownPosts.filter((post) => post.liked).length,
    unfiled: shownPosts.filter((post) => post.unfiled).length,
  };
  const authors = mostSavedAuthors(snapshot.posts, applied.revealHidden);
  const authorName =
    applied.author === null
      ? null
      : (snapshot.posts.find((post) => post.authorHandle.toLowerCase() === applied.author?.toLowerCase())?.authorName ?? null);

  // Toggles start from the selection on screen: an area chosen with one of its
  // own topics shows as the topic alone, and must not come back when the topic goes.
  const shownSelection = (current: FilterState): FilterState => ({ ...current, topicIds: applied.topicIds, areaIds: applied.areaIds });

  const selectTopic = (topicId: number) => {
    const areaId = topicsById.get(topicId)?.areaId;
    if (areaId != null) setExpanded((open) => (open.includes(areaNode(areaId)) ? open : [...open, areaNode(areaId)]));
    setFilter((current) => selectTopicOnly(current, topicId));
    setView("posts");
  };
  const clearCategories = () => setFilter((current) => ({ ...current, topicIds: [], areaIds: [], unfiled: false }));
  const clearPills = () => setFilter((current) => ({ ...current, topicIds: [], areaIds: [], unfiled: false, author: null, keyword: "" }));
  const clearAll = () => setFilter((current) => ({ ...DEFAULT_FILTER, sort: current.sort, revealHidden: current.revealHidden }));

  const copyLink = (post: Post) => {
    navigator.clipboard.writeText(post.url).then(
      () => toast.success("Link copied"),
      () => toast.error("The link could not be copied"),
    );
  };
  const surprise = () => {
    if (result.posts.length === 0) return;
    void postDialog.open({ payload: randomItem(result.posts).id });
  };

  const sidebar: SidebarProps = {
    snapshot,
    now,
    filter: applied,
    totals,
    authors,
    expanded,
    whatChanged,
    categoryEdits,
    onCollection: (collection) => setFilter((current) => ({ ...current, collection })),
    onExpandedChange: setExpanded,
    onToggleTopic: (topicId) => setFilter((current) => toggleTopic(shownSelection(current), topicId)),
    onToggleArea: (areaId) => setFilter((current) => toggleArea(shownSelection(current), areaId)),
    onToggleUnfiled: () => setFilter((current) => toggleUnfiled(current)),
    onToggleAuthor: (handle) => setFilter((current) => toggleAuthor(current, handle)),
    onRevealHidden: (revealHidden) => setFilter((current) => ({ ...current, revealHidden })),
  };

  const { eyebrow, title, detail } = heading(snapshot, applied);
  const groups = view === "resources" ? resourcesFor(snapshot, result.posts) : [];
  const listKey = JSON.stringify([applied.collection, applied.topicIds, applied.areaIds, applied.unfiled, applied.author, keyword, applied.timeRange, applied.sort, applied.mediaOnly, applied.revealHidden]);

  return (
    <TipProvider>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-[272px] shrink-0 lg:block">
          <Sidebar {...sidebar} />
        </aside>

        <main className="bg-wash min-w-0 flex-1">
          <div className="mx-auto flex max-w-[800px] flex-col gap-5 px-4 pt-4 pb-24 sm:px-8 lg:pt-10">
            <header className="flex items-end gap-3">
              <DialogTrigger controller={sidebarPanel} aria-label="Open filters" className={`${iconButton} mb-0.5 size-10 bg-surface text-ink shadow-card lg:hidden`}>
                <MenuIcon aria-hidden="true" />
              </DialogTrigger>
              <div className="min-w-0 flex-1">
                <p className="text-eyebrow text-ink-muted">{eyebrow}</p>
                <h1 className="text-display mt-1.5 text-[30px] text-ink sm:text-[40px]">{title}</h1>
              </div>
              <Button
                data-variant="solid"
                onClick={surprise}
                disabled={result.posts.length === 0}
                className="pressable focus-ring mb-0.5 h-10 shrink-0 gap-2 px-4 text-[14px] font-semibold"
              >
                <Shuffle className="size-4" aria-hidden="true" />
                Surprise me
              </Button>
            </header>
            {detail ? <p className="-mt-2.5 max-w-[60ch] text-[14px] leading-[1.5] text-pretty text-ink-muted">{detail}</p> : null}

            <StatTiles stats={stats(result.posts)} />

            <Toolbar
              keyword={filter.keyword}
              timeRange={applied.timeRange}
              sort={applied.sort}
              mediaOnly={applied.mediaOnly}
              onKeyword={(next) => setFilter((current) => ({ ...current, keyword: next }))}
              onTimeRange={(timeRange) => setFilter((current) => ({ ...current, timeRange }))}
              onSort={(sort) => setFilter((current) => ({ ...current, sort }))}
              onMediaOnly={(mediaOnly) => setFilter((current) => ({ ...current, mediaOnly }))}
            />

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <SegmentedControl aria-label="View" value={view} onValueChange={(next) => next && setView(next as View)} className="border-0 bg-sunken p-[3px]">
                <SegmentedControlIndicator />
                <SegmentedControlItem value="posts" className="focus-ring h-8 px-4 text-[13px] font-semibold">
                  Posts
                </SegmentedControlItem>
                <SegmentedControlItem value="resources" className="focus-ring h-8 px-4 text-[13px] font-semibold">
                  Resources
                </SegmentedControlItem>
              </SegmentedControl>
              <p className="text-[13px] font-medium text-ink-muted" aria-live="polite">
                <span className="font-bold text-ink tabular-nums">{formatCount(result.posts.length)}</span>{" "}
                {plural(result.posts.length, "post")}
                {view === "resources" ? (
                  <>
                    {" · "}
                    <span className="font-bold text-ink tabular-nums">{formatCount(groups.length)}</span> {plural(groups.length, "resource")}
                  </>
                ) : null}
              </p>
            </div>

            <ActiveFilters
              filter={applied}
              topicsById={topicsById}
              areasById={areasById}
              authorName={authorName}
              onRemoveTopic={sidebar.onToggleTopic}
              onRemoveArea={sidebar.onToggleArea}
              onRemoveUnfiled={sidebar.onToggleUnfiled}
              onRemoveAuthor={() => setFilter((current) => ({ ...current, author: null }))}
              onRemoveKeyword={() => setFilter((current) => ({ ...current, keyword: "" }))}
              onClear={clearPills}
            />

            {view === "posts" ? (
              result.posts.length === 0 ? (
                emptyPosts(snapshot, result, clearAll, clearCategories)
              ) : (
                <PostList
                  key={listKey}
                  posts={result.posts}
                  unsureStart={result.unsureStart}
                  filter={applied}
                  topicsById={topicsById}
                  dialog={postDialog}
                  topicsEditor={topicsEditor}
                  onSelectTopic={selectTopic}
                  onCopyLink={copyLink}
                />
              )
            ) : groups.length === 0 ? (
              result.posts.length === 0 ? (
                emptyPosts(snapshot, result, clearAll, clearCategories)
              ) : (
                <EmptyState icon={Link2Off} title="No resources here">
                  None of these posts link to a repo, package, video, or page that could be read. They are still listed under Posts.
                </EmptyState>
              )
            ) : (
              <>
                <ResourceList groups={groups.slice(0, RESOURCE_ROWS)} />
                {groups.length > RESOURCE_ROWS ? (
                  <p className="text-center text-[13px] text-ink-muted">
                    Showing the {RESOURCE_ROWS} most saved of <span className="tabular-nums">{formatCount(groups.length)}</span>.
                  </p>
                ) : null}
              </>
            )}
          </div>
        </main>
      </div>

      <Dialog controller={sidebarPanel}>
        <DialogBackdrop />
        <DialogContent
          initialFocus="content"
          className="inset-y-0 right-auto left-0 m-0 h-dvh max-h-none w-[min(19rem,calc(100%-3rem))] gap-0 overflow-hidden rounded-none border-0 p-0 data-ending-style:-translate-x-6 data-starting-style:-translate-x-6"
        >
          <DialogTitle className="sr-only">Filters</DialogTitle>
          <Sidebar
            {...sidebar}
            headerAction={
              <DialogClose aria-label="Close filters" className="focus-ring-side pressable flex size-8 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-side-ink hover:bg-side-hover">
                <X className="size-4" aria-hidden="true" />
              </DialogClose>
            }
          />
        </DialogContent>
      </Dialog>

      <PostDialog
        controller={postDialog}
        postsById={postsById}
        topics={snapshot.topics}
        areas={snapshot.areas}
        topicsById={topicsById}
        chipsFor={(post) => postChips(post, applied)}
        activeTopicIds={applied.topicIds}
        keyword={keyword}
        onSelectTopic={selectTopic}
        onCopyLink={copyLink}
      />
      <PostTopicsEditor
        controller={topicsEditor}
        postsById={postsById}
        topics={snapshot.topics}
        areas={snapshot.areas}
        topicsById={topicsById}
        listed={new Set(result.posts.map((post) => post.id))}
      />
      <WhatChanged controller={whatChanged} changes={snapshot.changes} />
      <CategoryDialogs edits={categoryEdits} topics={snapshot.topics} areas={snapshot.areas} topicsById={topicsById} areasById={areasById} />

      <ToastRegion side="bottom" align="center" className="mb-6 w-fit [&_[data-slot=toast-list]]:items-center">
        {(state) => (
          <Toast className="flex w-fit flex-nowrap items-center gap-2 rounded-full border-0 bg-surface py-1.5 pr-4 pl-1.5 text-ink shadow-(--ui-shadow) transition-[opacity,translate] duration-200 ease-out data-ending-style:opacity-0 data-starting-style:translate-y-2 data-starting-style:opacity-0 motion-reduce:transition-none">
            {state.type === "error" ? (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-like-soft text-like-text">
                <CircleAlert className="size-4" aria-hidden="true" />
              </span>
            ) : (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                <CircleCheck className="size-4" aria-hidden="true" />
              </span>
            )}
            <ToastTitle className="flex-none text-[13px] font-semibold whitespace-nowrap" />
          </Toast>
        )}
      </ToastRegion>
    </TipProvider>
  );
}
