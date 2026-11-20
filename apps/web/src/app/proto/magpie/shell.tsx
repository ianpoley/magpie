"use client";
// Throwaway fork of components/corpus-screen.tsx for /proto/magpie. Changes are marked `proto:`.

import { Button } from "@ui-sdk/react/button";
import { createDialogController, Dialog, DialogBackdrop, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@ui-sdk/react/dialog";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { Toast, ToastAction, ToastRegion, ToastTitle, toast } from "@ui-sdk/react/toast";
import { CircleAlert, CircleCheck, CloudOff, Inbox, Layers, Link2Off, Menu as MenuIcon, SearchX, Shuffle, Sparkles, Tag, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useState, useSyncExternalStore } from "react";

import { pinQuery, removePost, restorePost } from "@/app/actions";
import { createAskRunner, rankAsk, type AskState } from "@/lib/ask";
import {
  applyFilter,
  DEFAULT_FILTER,
  mostSavedAuthors,
  postChips,
  selectTopicOnly,
  toggleArea,
  toggleAuthor,
  toggleTopic,
  toggleUnfiled,
} from "@/lib/filter";
import { linkedQuery, parseLinked, type LinkedFilter } from "@/lib/filter-url";
import { resourcesFor } from "@/lib/resources";
import { similarPosts } from "@/lib/similar";
import type { FilterResult, FilterState, Post, Snapshot, Sort, TimeRange } from "@/lib/types";

import { ActiveFilters } from "@/components/active-filters";
import { AskBar } from "@/components/ask-bar";
import { CategoryDialogs, createCategoryEdits } from "@/components/category-menu";
import { areaNode } from "@/components/category-tree";
import { EmptyState } from "./brand-empty";
import { formatCount, plural } from "@/components/format";
import { postCardOpen } from "@/components/post-card";
import { PostDialog } from "@/components/post-dialog";
import { PostList } from "@/components/post-list";
import { createPostTopicsController, PostTopicsEditor } from "@/components/post-topics-editor";
import { createRemovedPostsController, RemovedPosts } from "@/components/removed-posts";
import { ResourcesView } from "@/components/resources-view";
import { runAction } from "@/components/run-action";
import { Sidebar, type SidebarProps } from "./shell-sidebar";
import { SidebarResizer } from "@/components/sidebar-resizer";
import { iconButton } from "@/components/styles";
import { TipProvider } from "@/components/tip";
import { SEARCH_INPUT_ID, Toolbar, type SearchMode } from "@/components/toolbar";
import { createWhatChangedController, WhatChanged } from "@/components/what-changed";

import { emitMagpie, publishLive, setLiveActions, useBrand } from "./brand";

type View = "posts" | "resources";

const RESOURCE_KINDS = [
  { value: "repo", label: "Repos", none: "No repos here" },
  { value: "package", label: "Packages", none: "No packages here" },
  { value: "video", label: "Videos", none: "No videos here" },
  { value: "page", label: "Pages", none: "No pages here" },
];

const COLLECTION_TITLES = { everything: "Everything", bookmarks: "Bookmarks", likes: "Likes" } as const;
const RESOURCE_ROWS = 100;
const SIMILAR_POSTS = 4;
const REFRESH_GAP_MS = 2000;

const postAsk = (query: string, signal: AbortSignal): Promise<Response> =>
  fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }), signal });

const randomItem = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

const narrowing = (filter: FilterState): boolean =>
  filter.collection !== "everything" ||
  filter.author !== null ||
  filter.keyword.trim() !== "" ||
  filter.timeRange !== "all" ||
  filter.mediaOnly;

function heading(snapshot: Snapshot, filter: FilterState, authorName: string | null): { eyebrow: string; title: string; detail: string | null } {
  const collection = COLLECTION_TITLES[filter.collection];
  const selected = filter.topicIds.length + filter.areaIds.length;
  if (filter.unfiled) return { eyebrow: collection, title: "Unfiled", detail: "Posts no topic has claimed with confidence yet." };
  if (selected === 1 && filter.topicIds.length === 1) {
    const topic = snapshot.topics.find((candidate) => candidate.id === filter.topicIds[0]);
    const area = snapshot.areas.find((candidate) => candidate.id === topic?.areaId);
    if (topic) return { eyebrow: area ? `${collection} · ${area.name}` : collection, title: topic.name, detail: topic.definition && topic.definition !== topic.name ? topic.definition : null };
  }
  if (selected === 1) {
    const area = snapshot.areas.find((candidate) => candidate.id === filter.areaIds[0]);
    if (area) return { eyebrow: collection, title: area.name, detail: "Posts in any topic of this area." };
  }
  if (selected > 1) return { eyebrow: collection, title: `${selected} categories`, detail: "Posts that are in every one of them." };
  if (filter.author !== null) return { eyebrow: `${collection} · @${filter.author}`, title: authorName ?? `@${filter.author}`, detail: null };
  return { eyebrow: "Your saved posts", title: collection, detail: null };
}

const solidButton = (label: string, action: () => void) => (
  <Button data-variant="solid" onClick={action} className="pressable focus-ring h-9 px-4">
    {label}
  </Button>
);

/** Why the list is empty, in the user's terms, and the way out. */
function emptyPosts(snapshot: Snapshot, result: FilterResult, clear: () => void, clearCategories: () => void) {
  const filter = result.state;
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
      <EmptyState icon={SearchX} title="No posts match" action={solidButton("Clear filters", clear)}>
        {filter.keyword.trim() !== ""
          ? `Nothing you saved mentions “${filter.keyword.trim()}” under these filters. Try fewer or shorter words, or widen the filters.`
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
      <EmptyState icon={Tag} title="No post is in all of these" action={solidButton("Clear categories", clearCategories)}>
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

/** What ask results show in place of an empty list: still judging, nothing judged, or nothing matched. */
function emptyAsk(ask: AskState, anyMatch: boolean, retry: () => void, clearFilters: () => void) {
  if (ask.status === "running") {
    return (
      <EmptyState icon={Sparkles} title="Judging your saved posts">
        Matches appear here as they are found, strongest first.
      </EmptyState>
    );
  }
  if (ask.scores.length === 0) {
    return (
      <EmptyState icon={CloudOff} title="The search could not be run" action={solidButton("Try again", retry)}>
        No post could be judged. Check that this Mac is online, then try again.
      </EmptyState>
    );
  }
  if (anyMatch) {
    return (
      <EmptyState icon={SearchX} title="No matches under these filters" action={solidButton("Clear filters", clearFilters)}>
        Posts match “{ask.query}”, but none of them fit the filters that are on.
      </EmptyState>
    );
  }
  return (
    <EmptyState icon={SearchX} title="Nothing matches">
      No saved post is about “{ask.query}”. Try describing the topic in other words.
    </EmptyState>
  );
}

// Reads each key the way the server does (first value wins), so a URL with a
// repeated key seeds and re-reads to the same selection.
const selectionInAddress = (): LinkedFilter => {
  const params = new URLSearchParams(window.location.search);
  return parseLinked({
    topics: params.get("topics") ?? undefined,
    areas: params.get("areas") ?? undefined,
    unfiled: params.get("unfiled") ?? undefined,
    author: params.get("author") ?? undefined,
    q: params.get("q") ?? undefined,
  });
};

/** `linked` is the selection the page was opened with; later changes are read from the address bar. */
export function Shell({ snapshot, now, linked }: { snapshot: Snapshot; now: number; linked: LinkedFilter }) {
  const { brand } = useBrand(); // proto: the direction's slots
  const router = useRouter();
  const [filter, setFilter] = useState<FilterState>(() => ({ ...DEFAULT_FILTER, ...linked }));
  const [view, setView] = useState<View>("posts");
  const [resourceKind, setResourceKind] = useState("all");
  const [expanded, setExpanded] = useState<string[]>(() => [
    ...new Set(snapshot.topics.flatMap((topic) => (topic.areaId !== null && linked.topicIds.includes(topic.id) ? [areaNode(topic.areaId)] : []))),
  ]);
  const [postDialog] = useState(() => createDialogController<string>());
  const [whatChanged] = useState(createWhatChangedController);
  const [removedPosts] = useState(createRemovedPostsController);
  const [sidebarPanel] = useState(() => createDialogController());
  const [categoryEdits] = useState(createCategoryEdits);
  const [topicsEditor] = useState(createPostTopicsController);
  const [mode, setMode] = useState<SearchMode>("search");
  const [askDraft, setAskDraft] = useState("");
  const [askRunner] = useState(() => createAskRunner(postAsk));
  const ask = useSyncExternalStore(askRunner.subscribe, askRunner.getState, () => null);

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

  useEffect(() => {
    // "/" jumps to search; j and k move between post cards, and Enter opens the focused one.
    const shortcuts = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]:not([contenteditable=false]), [role=dialog]")) return;
      if (event.key === "/") {
        const input = document.getElementById(SEARCH_INPUT_ID);
        if (!input) return;
        event.preventDefault();
        input.focus();
        return;
      }
      if (event.key !== "j" && event.key !== "k") return;
      // Only from the page itself or a card, so a focused menu, tree row, or control keeps its own keys.
      const onCard = target?.closest("article") ?? null;
      if (target !== document.body && onCard === null) return;
      const cards = [...document.querySelectorAll<HTMLElement>(postCardOpen())];
      if (cards.length === 0) return;
      const at = cards.findIndex((card) => card.closest("article") === onCard);
      const firstInView = Math.max(0, cards.findIndex((card) => card.getBoundingClientRect().top >= 0));
      const next = cards[at === -1 ? firstInView : Math.min(Math.max(at + (event.key === "j" ? 1 : -1), 0), cards.length - 1)];
      event.preventDefault();
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, []);

  const keyword = useDeferredValue(filter.keyword);
  const browsed = applyFilter(snapshot, { ...filter, keyword }, now);
  // While an ask is on screen its ranked matches stand in for the browsed list everywhere below.
  const result = ask ? rankAsk(snapshot, browsed.state, ask.scores, ask.bands ?? { confident: 1, unsure: 1 }, now) : browsed;
  const applied = result.state;

  // proto: tell the direction when an ask settles.
  const askStatus = ask?.status ?? null;
  const askMatches = result.posts.length;
  useEffect(() => {
    if (askStatus === "done" || askStatus === "failed") emitMagpie({ type: "ask-done", matches: askMatches, failed: askStatus === "failed" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askStatus]);

  const shownQuery = linkedQuery(browsed.state);
  const heldSelection = linkedQuery({ ...filter, keyword: "" });
  useEffect(() => {
    const search = shownQuery === "" ? "" : `?${shownQuery}`;
    if (window.location.search === search) return;
    // A selection the address already names is tidied in place, so Back still leaves it.
    // A search alone rewrites the current entry, so Back does not step through every letter typed.
    const step = linkedQuery({ ...selectionInAddress(), keyword: "" }) === heldSelection ? "replaceState" : "pushState";
    window.history[step](null, "", `${window.location.pathname}${search}${window.location.hash}`);
  }, [shownQuery, heldSelection]);
  useEffect(() => {
    const follow = () => setFilter((current) => ({ ...current, ...selectionInAddress() }));
    window.addEventListener("popstate", follow);
    return () => window.removeEventListener("popstate", follow);
  }, []);

  const topicsById = new Map(snapshot.topics.map((topic) => [topic.id, topic]));
  const areasById = new Map(snapshot.areas.map((area) => [area.id, area]));
  const postsById = new Map(snapshot.posts.map((post) => [post.id, post]));

  const shownPosts = snapshot.posts.filter((post) => applied.revealHidden || !post.hidden);
  const totals = {
    everything: shownPosts.length,
    bookmarks: shownPosts.filter((post) => post.bookmarked).length,
    likes: shownPosts.filter((post) => post.liked).length,
  };
  const authors = mostSavedAuthors(snapshot.posts, applied.revealHidden);
  const authorHandles = new Set(shownPosts.map((post) => post.authorHandle.toLowerCase()));
  const authorName =
    applied.author === null
      ? null
      : (snapshot.posts.find((post) => post.authorHandle.toLowerCase() === applied.author?.toLowerCase())?.authorName ?? null);

  // Toggles start from the selection on screen: an area chosen with one of its
  // own topics shows as the topic alone, and must not come back when the topic goes.
  const shownSelection = (current: FilterState): FilterState => ({ ...current, topicIds: applied.topicIds, areaIds: applied.areaIds });

  const leaveAsk = () => {
    askRunner.clear();
    setAskDraft("");
    setMode("search");
  };
  // Picking a category is browsing again, so it ends an ask.
  const selectTopic = (topicId: number, areaId: number | null | undefined = topicsById.get(topicId)?.areaId) => {
    if (ask) leaveAsk();
    if (areaId != null) setExpanded((open) => (open.includes(areaNode(areaId)) ? open : [...open, areaNode(areaId)]));
    setFilter((current) => selectTopicOnly(current, topicId));
    setView("posts");
  };
  const selectAuthor = (author: string) => {
    setFilter((current) => ({ ...current, author }));
    setView("posts");
  };
  const showAuthor = (author: string) => {
    if (ask) leaveAsk();
    setFilter((current) => ({ ...current, author, keyword: "", topicIds: [], areaIds: [], unfiled: false }));
    setView("posts");
  };
  const clearCategories = () => setFilter((current) => ({ ...current, topicIds: [], areaIds: [], unfiled: false }));
  const clearPills = () => setFilter((current) => ({ ...current, topicIds: [], areaIds: [], unfiled: false, author: null, keyword: "" }));
  const clearAll = () => setFilter((current) => ({ ...DEFAULT_FILTER, sort: current.sort, revealHidden: current.revealHidden }));
  const changeMode = (next: SearchMode) => {
    if (next === "search") askRunner.clear();
    setMode(next);
  };
  const pin = async () => {
    if (!ask) return;
    const pinned = await runAction(pinQuery(ask.query, ask.scores));
    if (!pinned) return;
    selectTopic(pinned.topicId, pinned.areaId);
    toast.success("Pinned as a topic");
    emitMagpie({ type: "pin" }); // proto
  };

  const copyLink = (post: Post) => {
    navigator.clipboard.writeText(post.url).then(
      () => {
        toast.success("Link copied");
        emitMagpie({ type: "copy" }); // proto
      },
      () => toast.error("The link could not be copied"),
    );
  };
  const restore = async (postId: string) => {
    await runAction(restorePost(postId));
  };
  const remove = async (post: Post) => {
    if (!(await runAction(removePost(post.id)))) return;
    postDialog.close();
    emitMagpie({ type: "remove" }); // proto
    toast.success("Removed from corpus", { action: { label: "Undo", onAction: () => restore(post.id) } });
  };
  const surprise = () => {
    if (result.posts.length === 0) return;
    emitMagpie({ type: "surprise" }); // proto
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
    removedPosts,
    categoryEdits,
    onCollection: (collection) => setFilter((current) => ({ ...current, collection })),
    onExpandedChange: setExpanded,
    onToggleTopic: (topicId) => {
      if (ask) leaveAsk();
      setFilter((current) => toggleTopic(shownSelection(current), topicId));
    },
    onToggleArea: (areaId) => {
      if (ask) leaveAsk();
      setFilter((current) => toggleArea(shownSelection(current), areaId));
    },
    onToggleUnfiled: () => {
      if (ask) leaveAsk();
      setFilter((current) => toggleUnfiled(current));
    },
    onToggleAuthor: (handle) => setFilter((current) => toggleAuthor(current, handle)),
    onRevealHidden: (revealHidden) => setFilter((current) => ({ ...current, revealHidden })),
  };

  const { eyebrow, title, detail } = heading(snapshot, applied, authorName);
  const allGroups = view === "resources" ? resourcesFor(snapshot, result.posts) : [];
  const groups = resourceKind === "all" ? allGroups : allGroups.filter((group) => group.resource.kind === resourceKind);
  const kinds = RESOURCE_KINDS.filter((kind) => kind.value === resourceKind || allGroups.some((group) => group.resource.kind === kind.value));
  const shownKind = RESOURCE_KINDS.find((kind) => kind.value === resourceKind);
  // proto: publish what is on screen, and the actions a direction may call.
  const liveNow = {
    count: result.posts.length,
    bookmarked: result.posts.filter((post) => post.bookmarked).length,
    liked: result.posts.filter((post) => post.liked).length,
    total: shownPosts.length,
    asking: ask?.status === "running",
    askQuery: ask?.query ?? null,
    keyword,
    collection: applied.collection,
    areaIds: applied.areaIds,
    topicIds: applied.topicIds,
    view,
    ids: result.posts.map((post) => post.id),
  };
  useEffect(() => {
    publishLive(liveNow);
    setLiveActions({ toggleArea: sidebar.onToggleArea, selectTopic: (id: number) => selectTopic(id), surprise });
  });

  const listKey = JSON.stringify([ask?.query, applied.collection, applied.topicIds, applied.areaIds, applied.unfiled, applied.author, keyword, applied.timeRange, applied.sort, applied.mediaOnly, applied.revealHidden]);

  return (
    <TipProvider>
      <div className="flex min-h-dvh">
        <aside id="sidebar" className="w-sidebar sticky top-0 hidden h-dvh shrink-0 lg:block">
          <Sidebar {...sidebar} />
          <SidebarResizer controls="sidebar" />
        </aside>

        <main className="bg-wash relative min-w-0 flex-1">
          {brand.Backdrop ? <brand.Backdrop /> : null /* proto */}
          <div className={`relative z-[1] mx-auto flex ${brand.mainClass ?? "max-w-[800px]"} flex-col gap-5 px-4 pt-4 pb-24 sm:px-8 lg:pt-10`}>
            {brand.Masthead ? <brand.Masthead /> : null /* proto */}
            {brand.Header ? (
              <brand.Header
                {...{
                  menuButton: (
                    <DialogTrigger controller={sidebarPanel} aria-label="Open filters" className={`${iconButton} mb-0.5 size-10 bg-surface text-ink shadow-card lg:hidden`}>
                <MenuIcon aria-hidden="true" />
              </DialogTrigger>
                  ),
                  eyebrow,
                  title,
                  detail,
                  onSurprise: surprise,
                  canSurprise: result.posts.length > 0,
                  mode,
                  keyword: filter.keyword,
                  askDraft,
                  askActive: ask !== null,
                  timeRange: applied.timeRange,
                  sort: applied.sort,
                  mediaOnly: applied.mediaOnly,
                  sortable: !ask,
                  onKeyword: (next: string) => setFilter((current) => ({ ...current, keyword: next })),
                  onAskDraft: setAskDraft,
                  onAskQuery: (query: string) => {
                    emitMagpie({ type: "ask" });
                    setFilter((current) => ({ ...current, keyword: "" }));
                    setAskDraft(query);
                    setMode("ask");
                    askRunner.ask(query);
                  },
                  onLeaveAsk: leaveAsk,
                  onTimeRange: (timeRange: TimeRange) => setFilter((current) => ({ ...current, timeRange })),
                  onSort: (sort: Sort) => setFilter((current) => ({ ...current, sort })),
                  onMediaOnly: (mediaOnly: boolean) => setFilter((current) => ({ ...current, mediaOnly })),
                  view,
                  onView: setView,
                  count: result.posts.length,
                  bookmarked: liveNow.bookmarked,
                  liked: liveNow.liked,
                  resourceCount: view === "resources" ? groups.length : null,
                }}
              />
            ) : (
              /* proto: the original header, the baseline */
              <>
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

            <Toolbar
              mode={mode}
              keyword={filter.keyword}
              askDraft={askDraft}
              timeRange={applied.timeRange}
              sort={applied.sort}
              mediaOnly={applied.mediaOnly}
              sortable={!ask}
              onMode={changeMode}
              onAskDraft={setAskDraft}
              onAsk={() => {
                emitMagpie({ type: "ask" }); // proto
                askRunner.ask(askDraft);
              }}
              onKeyword={(next) => setFilter((current) => ({ ...current, keyword: next }))}
              onTimeRange={(timeRange) => setFilter((current) => ({ ...current, timeRange }))}
              onSort={(sort) => setFilter((current) => ({ ...current, sort }))}
              onMediaOnly={(mediaOnly) => setFilter((current) => ({ ...current, mediaOnly }))}
            />
              </>
            )}

            {ask ? <AskBar ask={ask} onPin={pin} onRetry={() => askRunner.ask(ask.query)} onClear={leaveAsk} /> : null}

            {brand.Header ? null : (
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
                {plural(result.posts.length, ask ? "match" : "post", ask ? "matches" : "posts")}
                {view === "resources" ? (
                  <>
                    {" · "}
                    <span className="font-bold text-ink tabular-nums">{formatCount(groups.length)}</span> {plural(groups.length, "resource")}
                  </>
                ) : null}
              </p>
            </div>
            )}

            {view === "resources" && kinds.length > 1 ? (
              <SegmentedControl
                aria-label="Resource kind"
                value={resourceKind}
                onValueChange={(next) => next && setResourceKind(next)}
                className="-mt-2 self-start border-0 bg-sunken p-[3px]"
              >
                <SegmentedControlIndicator />
                <SegmentedControlItem value="all" className="focus-ring h-7 px-3 text-[12px] font-semibold">
                  All kinds
                </SegmentedControlItem>
                {kinds.map((kind) => (
                  <SegmentedControlItem key={kind.value} value={kind.value} className="focus-ring h-7 px-3 text-[12px] font-semibold">
                    {kind.label}
                  </SegmentedControlItem>
                ))}
              </SegmentedControl>
            ) : null}

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

            {ask && result.posts.length === 0 ? (
              emptyAsk(ask, ask.scores.some((score) => score.probability >= (ask.bands?.unsure ?? 1)), () => askRunner.ask(ask.query), clearAll)
            ) : view === "posts" ? (
              result.posts.length === 0 ? (
                emptyPosts(snapshot, result, clearAll, clearCategories)
              ) : (
                <div className="proto-list">
                <PostList
                  key={listKey}
                  posts={result.posts}
                  unsureStart={result.unsureStart}
                  filter={applied}
                  topicsById={topicsById}
                  dialog={postDialog}
                  topicsEditor={topicsEditor}
                  onSelectTopic={selectTopic}
                  onSelectAuthor={selectAuthor}
                  onCopyLink={copyLink}
                  onRemove={remove}
                />
                </div>
              )
            ) : groups.length === 0 ? (
              result.posts.length === 0 ? (
                emptyPosts(snapshot, result, clearAll, clearCategories)
              ) : shownKind && allGroups.length > 0 ? (
                <EmptyState icon={Link2Off} title={shownKind.none} action={solidButton("Show all kinds", () => setResourceKind("all"))}>
                  These posts link to other kinds of resources.
                </EmptyState>
              ) : (
                <EmptyState icon={Link2Off} title="No resources here">
                  None of these posts link to a repo, package, video, or page that could be read. They are still listed under Posts.
                </EmptyState>
              )
            ) : (
              <>
                <ResourcesView key={listKey} groups={groups.slice(0, RESOURCE_ROWS)} dialog={postDialog} />
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
        similarFor={(post) => similarPosts(snapshot, post, shownPosts, SIMILAR_POSTS)}
        isAuthor={(handle) => authorHandles.has(handle.toLowerCase())}
        onShowAuthor={showAuthor}
        neighborsOf={(postId) => {
          const at = result.posts.findIndex((post) => post.id === postId);
          if (at === -1) return { previous: null, next: null };
          return { previous: result.posts[at - 1]?.id ?? null, next: result.posts[at + 1]?.id ?? null };
        }}
        activeTopicIds={applied.topicIds}
        keyword={applied.keyword === "" ? "" : keyword}
        onSelectTopic={selectTopic}
        onSelectAuthor={selectAuthor}
        onCopyLink={copyLink}
        onRemove={remove}
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
      <RemovedPosts controller={removedPosts} posts={snapshot.removed} onRestore={restore} />
      <CategoryDialogs edits={categoryEdits} topics={snapshot.topics} areas={snapshot.areas} topicsById={topicsById} areasById={areasById} />

      <ToastRegion side="top" align="center" className="mt-6 w-fit [&_[data-slot=toast-list]]:items-center">
        {(state) => (
          <Toast className="flex w-fit flex-nowrap items-center gap-2 rounded-full border-0 bg-surface py-1.5 pr-4 pl-1.5 text-ink has-data-[slot=toast-action]:pr-1.5 shadow-(--ui-shadow) transition-[opacity,translate] duration-200 ease-out data-ending-style:opacity-0 data-starting-style:-translate-y-2 data-starting-style:opacity-0 motion-reduce:transition-none">
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
            {state.action ? (
              <ToastAction className="focus-ring pressable ml-1 h-7 flex-none cursor-pointer rounded-full border-0 bg-sunken px-3 text-[13px] font-semibold text-ink hover:bg-primary-soft hover:text-primary-text data-pending:cursor-progress data-pending:opacity-60" />
            ) : null}
          </Toast>
        )}
      </ToastRegion>
    </TipProvider>
  );
}
