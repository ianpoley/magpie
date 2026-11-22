"use client";

import { Button } from "@ui-sdk/react/button";
import { createDialogController, Dialog, DialogBackdrop, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@ui-sdk/react/dialog";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { Toast, ToastAction, ToastRegion, ToastTitle, toast } from "@ui-sdk/react/toast";
import { CircleAlert, CircleCheck, Menu as MenuIcon, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { pinQuery, purgeRemoved, removePost, restorePost } from "@/app/actions";
import { createChatRunner, type AnswerRequest } from "@/lib/answer";
import { cleanQuery, createAskRunner, rankAsk, type AskState } from "@/lib/ask";
import {
  applyFilter,
  DEFAULT_FILTER,
  inView,
  MOST_SAVED_AUTHORS,
  mostSavedAuthors,
  postChips,
  selectTopicOnly,
  toggleArea,
  toggleAuthor,
  toggleTopic,
  toggleUnfiled,
} from "@/lib/filter";
import { linkedQuery, parseLinked, type LinkedFilter } from "@/lib/filter-url";
import { emitMagpie } from "@/lib/magpie-events";
import { resourcesFor } from "@/lib/resources";
import { similarPosts } from "@/lib/similar";
import type { FilterResult, FilterState, Post, Snapshot, SyncState } from "@/lib/types";

import { ActiveFilters } from "./active-filters";
import { AnswerCard } from "./answer-card";
import { AskBar } from "./ask-bar";
import { CategoryDialogs, createCategoryEdits } from "./category-menu";
import { ConnectXDialog, createConnectXController } from "./connect-x-dialog";
import { areaNode } from "./category-tree";
import { EmptyState } from "./empty-state";
import { Flock } from "./flock";
import { formatCount, plural } from "./format";
import { PageHeader, SEARCH_INPUT_ID, type SearchMode, type View } from "./page-header";
import { postCardOpen } from "./post-card";
import { PostDialog } from "./post-dialog";
import { saveLayout, type PostLayout } from "./post-layout";
import { PostList } from "./post-list";
import { createPostTopicsController, PostTopicsEditor } from "./post-topics-editor";
import { ConfirmRemove, createConfirmRemoveController, createRemovedPostsController, RemovedPosts } from "./removed-posts";
import { ResourcesView } from "./resources-view";
import { runAction } from "./run-action";
import { Sidebar, type SidebarProps } from "./sidebar";
import { SidebarDeck, type DeckFront, type DeckState } from "./sidebar-deck";
import { SidebarResizer } from "./sidebar-resizer";
import { useSyncStatus } from "./sync-status";
import { iconButton } from "./styles";
import { TipProvider } from "./tip";

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

const postAnswer = (request: AnswerRequest, signal: AbortSignal): Promise<Response> =>
  fetch("/api/answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal });

const SIDE_BUTTON =
  "focus-ring-side pressable flex h-8 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-side-hover px-3 text-[13px] font-semibold text-side-ink hover:bg-side-wash";
const SIDE_CLOSE = "focus-ring-side pressable flex size-8 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-side-ink hover:bg-side-hover";

const randomItem = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

const narrowing = (filter: FilterState): boolean =>
  filter.collection !== "everything" ||
  filter.author !== null ||
  filter.keyword.trim() !== "" ||
  filter.timeRange !== "all" ||
  filter.mediaOnly;

function heading(snapshot: Snapshot, filter: FilterState, authorName: string | null): { eyebrow: string | null; title: string; detail: string | null } {
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
  return { eyebrow: null, title: collection, detail: null };
}

const solidButton = (label: string, action: () => void) => (
  <Button data-variant="solid" onClick={action} className="pressable focus-ring h-9 px-4">
    {label}
  </Button>
);

function emptyPosts(snapshot: Snapshot, result: FilterResult, clear: () => void, clearCategories: () => void) {
  const filter = result.state;
  if (!snapshot.storeExists) {
    return (
      <EmptyState title="Nothing has synced yet">
        The sync job has not run on this Mac. After its first run, every bookmark and like shows up here.
      </EmptyState>
    );
  }
  if (snapshot.posts.length === 0) {
    return (
      <EmptyState title="No saved posts yet">
        Bookmark or like a post on X and it appears here after the next sync.
      </EmptyState>
    );
  }
  const selected = filter.topicIds.length + filter.areaIds.length;
  if (narrowing(filter)) {
    return (
      <EmptyState title="No posts match" action={solidButton("Clear filters", clear)}>
        {filter.keyword.trim() !== ""
          ? `Nothing you saved mentions “${filter.keyword.trim()}” under these filters. Try fewer or shorter words, or widen the filters.`
          : "No saved post fits every filter that is on. Widen the time range or remove a filter."}
      </EmptyState>
    );
  }
  if (filter.unfiled) {
    return (
      <EmptyState title="Nothing is unfiled">
        Every saved post has at least one topic it clearly belongs to.
      </EmptyState>
    );
  }
  if (selected > 1) {
    return (
      <EmptyState title="No post is in all of these" action={solidButton("Clear categories", clearCategories)}>
        Selecting several categories shows only posts that are in every one. Remove one to see more.
      </EmptyState>
    );
  }
  if (selected === 1) {
    return (
      <EmptyState title="No posts here yet">
        Nothing you saved matches this category so far. New saves are sorted into it on every sync.
      </EmptyState>
    );
  }
  return (
    <EmptyState title="No posts to show">
      Every saved post is in a hidden category. Use Show hidden in the sidebar to see them.
    </EmptyState>
  );
}

function emptyAsk(ask: AskState, anyMatch: boolean, retry: () => void, clearFilters: () => void) {
  if (ask.status === "running") {
    return (
      <EmptyState title="Judging your saved posts">
        Matches appear here as they are found, strongest first.
      </EmptyState>
    );
  }
  if (ask.scores.length === 0) {
    return (
      <EmptyState title="The search could not be run" action={solidButton("Try again", retry)}>
        No post could be judged. Check that this Mac is online, then try again.
      </EmptyState>
    );
  }
  if (anyMatch) {
    return (
      <EmptyState title="No matches under these filters" action={solidButton("Clear filters", clearFilters)}>
        Posts match “{ask.query}”, but none of them fit the filters that are on.
      </EmptyState>
    );
  }
  return (
    <EmptyState title="Nothing matches">
      No saved post is about “{ask.query}”. Try describing the topic in other words.
    </EmptyState>
  );
}

const selectionInAddress = (): LinkedFilter => {
  const params = new URLSearchParams(window.location.search);
  return parseLinked({
    collection: params.get("collection") ?? undefined,
    topics: params.get("topics") ?? undefined,
    areas: params.get("areas") ?? undefined,
    unfiled: params.get("unfiled") ?? undefined,
    author: params.get("author") ?? undefined,
    q: params.get("q") ?? undefined,
  });
};

export function CorpusScreen({
  snapshot,
  sync: initialSync,
  now,
  linked,
  layout: initialLayout,
}: {
  snapshot: Snapshot;
  sync: SyncState;
  now: number;
  linked: LinkedFilter;
  layout: PostLayout;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterState>(() => ({ ...DEFAULT_FILTER, ...linked }));
  const [view, setView] = useState<View>("posts");
  const [layout, setLayout] = useState(initialLayout);
  const [resourceKind, setResourceKind] = useState("all");
  const [expanded, setExpanded] = useState<string[]>(() => [
    ...new Set(snapshot.topics.flatMap((topic) => (topic.areaId !== null && linked.topicIds.includes(topic.id) ? [areaNode(topic.areaId)] : []))),
  ]);
  const [postDialog] = useState(() => createDialogController<string>());
  const [connectX] = useState(createConnectXController);
  const sync = useSyncStatus(initialSync);
  const [removedPosts] = useState(createRemovedPostsController);
  const [confirmRemove] = useState(createConfirmRemoveController);
  const [sidebarPanel] = useState(() => createDialogController());
  const [categoryEdits] = useState(createCategoryEdits);
  const [topicsEditor] = useState(createPostTopicsController);
  const [mode, setMode] = useState<SearchMode>("search");
  const [askDraft, setAskDraft] = useState("");
  const [edited, setEdited] = useState<{ view: string; ids: string[] }>({ view: "", ids: [] });
  const [askRunner] = useState(() => createAskRunner(postAsk));
  const ask = useSyncExternalStore(askRunner.subscribe, askRunner.getState, () => null);
  const [chatRunner] = useState(() => createChatRunner(postAnswer));
  const chat = useSyncExternalStore(chatRunner.subscribe, chatRunner.getState, () => null);
  const [deck, setDeck] = useState<DeckState>({ front: "filters" });
  const [cited, setCited] = useState<string[]>([]);
  const swapDeck = (front: DeckFront) => setDeck({ front });
  const endAsk = (front: DeckFront) => {
    askRunner.clear();
    chatRunner.clear();
    setAskDraft("");
    setMode("search");
    setCited([]);
    setDeck((current) => (current.front === front ? current : { front }));
  };

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
  const listView = JSON.stringify({ ...filter, keyword });
  const held = new Set(edited.view === listView ? edited.ids : []);
  const holdPost = (postId: string) =>
    setEdited((current) => {
      if (current.view !== listView) return { view: listView, ids: [postId] };
      return current.ids.includes(postId) ? current : { view: listView, ids: [...current.ids, postId] };
    });
  const browsed = applyFilter(snapshot, { ...filter, keyword }, now, held);
  const result = ask ? rankAsk(snapshot, browsed.state, ask.scores, ask.bands ?? { confident: 1, unsure: 1 }, now) : browsed;
  const applied = result.state;

  const shownQuery = linkedQuery(browsed.state);
  const heldSelection = linkedQuery({ ...filter, keyword: "" });
  const appliedSelection = linkedQuery({ ...browsed.state, keyword: "" });
  useEffect(() => {
    const search = shownQuery === "" ? "" : `?${shownQuery}`;
    if (window.location.search === search) return;
    const addressed = linkedQuery({ ...selectionInAddress(), keyword: "" });
    const step = addressed === heldSelection || addressed === appliedSelection ? "replaceState" : "pushState";
    window.history[step](null, "", `${window.location.pathname}${search}${window.location.hash}`);
  }, [shownQuery, heldSelection, appliedSelection]);
  useEffect(() => {
    const follow = () => {
      if (askRunner.getState() !== null) {
        askRunner.clear();
        chatRunner.clear();
        setAskDraft("");
        setMode("search");
        setCited([]);
        setDeck((current) => (current.front === "filters" ? current : { front: "filters" }));
      }
      setFilter((current) => ({ ...current, ...selectionInAddress() }));
    };
    window.addEventListener("popstate", follow);
    return () => window.removeEventListener("popstate", follow);
  }, [askRunner, chatRunner]);

  const disconnected = sync.state.connection === "not_connected";
  useEffect(() => {
    if (disconnected) router.refresh();
  }, [disconnected, router]);

  const topicsById = new Map(snapshot.topics.map((topic) => [topic.id, topic]));
  const areasById = new Map(snapshot.areas.map((area) => [area.id, area]));
  const postsById = new Map(snapshot.posts.map((post) => [post.id, post]));

  const shownPosts = snapshot.posts.filter((post) => applied.revealHidden || !post.hidden);
  const totals = {
    everything: shownPosts.length,
    bookmarks: shownPosts.filter((post) => post.bookmarked).length,
    likes: shownPosts.filter((post) => post.liked).length,
  };
  const authors = mostSavedAuthors(
    snapshot.posts.filter(inView({ ...applied, author: null }, now)),
    applied.revealHidden,
    MOST_SAVED_AUTHORS,
    applied.author,
  );
  const authorHandles = new Set(shownPosts.map((post) => post.authorHandle.toLowerCase()));
  const authorName =
    applied.author === null
      ? null
      : (snapshot.posts.find((post) => post.authorHandle.toLowerCase() === applied.author?.toLowerCase())?.authorName ?? null);

  const shownSelection = (current: FilterState): FilterState => ({ ...current, topicIds: applied.topicIds, areaIds: applied.areaIds });

  const leaveAsk = () => endAsk("filters");
  const newChat = () => {
    endAsk("answer");
    window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>("[data-card=answer]:not([inert]) [data-answer-field]")?.focus());
  };
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
  const startAsk = (query: string) => {
    emitMagpie("ask");
    if (chatRunner.getState()?.root !== cleanQuery(query)) chatRunner.clear();
    setCited([]);
    swapDeck("answer");
    setFilter((current) => ({ ...current, keyword: "" }));
    setAskDraft(query);
    setMode("ask");
    askRunner.ask(query);
  };
  const pin = async () => {
    if (!ask) return;
    const pinned = await runAction(pinQuery(ask.query, ask.scores));
    if (!pinned) return;
    selectTopic(pinned.topicId, pinned.areaId);
    toast.success("Pinned as a topic");
    emitMagpie("pin");
  };

  const copyLink = (post: Post) => {
    navigator.clipboard.writeText(post.url).then(
      () => {
        toast.success("Link copied");
        emitMagpie("copy");
      },
      () => toast.error("The link could not be copied"),
    );
  };
  const restore = async (postId: string) => {
    await runAction(restorePost(postId));
  };
  const emptyRemoved = async () => {
    const emptied = await runAction(purgeRemoved());
    if (!emptied) return;
    removedPosts.close();
    toast.success(`Emptied ${formatCount(emptied.purged)} removed ${plural(emptied.purged, "post")}`);
  };
  const remove = async (post: Post) => {
    void confirmRemove.open({ payload: post });
  };
  const removeConfirmed = async (post: Post) => {
    if (!(await runAction(removePost(post.id)))) return;
    postDialog.close();
    emitMagpie("remove");
    toast.success("Removed from corpus", { action: { label: "Undo", onAction: () => restore(post.id) } });
  };
  const surprise = () => {
    if (result.posts.length === 0) return;
    emitMagpie("surprise");
    void postDialog.open({ payload: randomItem(result.posts).id });
  };

  const sidebar: SidebarProps = {
    snapshot,
    sync,
    connectX,
    filter: applied,
    viewed: inView(applied, now),
    totals,
    authors,
    expanded,
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

  const contentColumn = useRef<HTMLDivElement>(null);

  const confidentKey = ask ? result.posts.slice(0, result.unsureStart ?? result.posts.length).map((post) => post.id).join(",") : "";
  const judged = ask?.status === "done" ? ask.query : null;
  useEffect(() => {
    if (judged !== null) chatRunner.start(judged, confidentKey === "" ? [] : confidentKey.split(","));
  }, [judged, confidentKey, chatRunner]);

  const pendingCite = useRef<string | null>(null);
  const showCited = (postId: string) => {
    const card = document.querySelector<HTMLElement>(postCardOpen(postId));
    if (!card) {
      if (postsById.has(postId)) void postDialog.open({ payload: postId });
      return;
    }
    card.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    card.focus({ preventScroll: true });
  };
  const cite = (postId: string) => {
    setCited([postId]);
    if (!sidebarPanel.isOpen()) {
      showCited(postId);
      return;
    }
    pendingCite.current = postId;
    sidebarPanel.close();
  };
  const deckButton = (
    <button type="button" onClick={() => swapDeck("answer")} className={SIDE_BUTTON}>
      <Sparkles className="size-3.5" aria-hidden="true" />
      {ask ? "Answer" : "Ask"}
    </button>
  );
  const answerCard = {
    ask,
    chat,
    snapshot,
    postsById,
    listed: new Set(result.posts.map((post) => post.id)),
    cited,
    onAsk: startAsk,
    onFollowUp: chatRunner.followUp,
    onRetryAnswer: chatRunner.retry,
    onRetryAsk: () => ask && askRunner.ask(ask.query),
    onCite: cite,
    onNew: newChat,
    onFilters: () => swapDeck("filters"),
  };
  const { eyebrow, title, detail } = heading(snapshot, applied, authorName);
  const allGroups = view === "resources" ? resourcesFor(snapshot, result.posts) : [];
  const groups = resourceKind === "all" ? allGroups : allGroups.filter((group) => group.resource.kind === resourceKind);
  const kinds = RESOURCE_KINDS.filter((kind) => kind.value === resourceKind || allGroups.some((group) => group.resource.kind === kind.value));
  const shownKind = RESOURCE_KINDS.find((kind) => kind.value === resourceKind);
  const listKey = JSON.stringify([ask?.query, applied.collection, applied.topicIds, applied.areaIds, applied.unfiled, applied.author, keyword, applied.timeRange, applied.sort, applied.mediaOnly, applied.revealHidden]);

  return (
    <TipProvider>
      <div className="flex min-h-dvh">
        <aside id="sidebar" className="w-sidebar sticky top-0 z-10 hidden h-dvh shrink-0 lg:block">
          <SidebarDeck deck={deck} onSwap={swapDeck} filters={<Sidebar {...sidebar} headerAction={deckButton} />} answer={<AnswerCard {...answerCard} />} />
          <SidebarResizer controls="sidebar" />
        </aside>

        <main className="bg-wash relative min-w-0 flex-1">
          <Flock count={result.posts.length} collection={totals.everything} asking={ask?.status === "running"} column={contentColumn} />
          <div className="relative z-[1] mx-auto flex max-w-[800px] flex-col pt-4 pb-24 lg:pt-10">
            <PageHeader
              menuButton={
                <DialogTrigger controller={sidebarPanel} aria-label="Open filters" className={`${iconButton} size-10 bg-surface text-ink shadow-card lg:hidden`}>
                  <MenuIcon aria-hidden="true" />
                </DialogTrigger>
              }
              eyebrow={eyebrow}
              title={title}
              detail={detail}
              onSurprise={surprise}
              canSurprise={result.posts.length > 0}
              mode={mode}
              keyword={filter.keyword}
              askDraft={askDraft}
              askActive={ask !== null}
              askedQuery={ask?.query ?? null}
              timeRange={applied.timeRange}
              sort={applied.sort}
              mediaOnly={applied.mediaOnly}
              sortable={!ask}
              onKeyword={(next) => setFilter((current) => ({ ...current, keyword: next }))}
              onAskDraft={setAskDraft}
              onAsk={startAsk}
              onLeaveAsk={leaveAsk}
              onTimeRange={(timeRange) => setFilter((current) => ({ ...current, timeRange }))}
              onSort={(sort) => setFilter((current) => ({ ...current, sort }))}
              onMediaOnly={(mediaOnly) => setFilter((current) => ({ ...current, mediaOnly }))}
              layout={layout}
              onLayout={(next) => {
                saveLayout(next);
                setLayout(next);
              }}
              view={view}
              onView={setView}
              count={result.posts.length}
              bookmarked={result.posts.filter((post) => post.bookmarked).length}
              liked={result.posts.filter((post) => post.liked).length}
              resourceCount={view === "resources" ? groups.length : null}
            />
            <div ref={contentColumn} className="flex flex-col gap-5 px-4 pt-3 sm:px-8">

              {ask ? (
                <AskBar
                  ask={ask}
                  onPin={pin}
                  onRetry={() => askRunner.ask(ask.query)}
                  onClear={leaveAsk}
                  onShowAnswer={() => {
                    swapDeck("answer");
                    void sidebarPanel.open();
                  }}
                />
              ) : null}

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
                  <PostList
                    key={listKey}
                    posts={result.posts}
                    unsureStart={result.unsureStart}
                    filter={applied}
                    layout={layout}
                    cited={cited}
                    ranked={ask !== null}
                    arriving={ask?.status === "running"}
                    topicsById={topicsById}
                    dialog={postDialog}
                    topicsEditor={topicsEditor}
                    onSelectTopic={selectTopic}
                    onSelectAuthor={selectAuthor}
                    onCopyLink={copyLink}
                    onRemove={remove}
                  />
                )
              ) : groups.length === 0 ? (
                result.posts.length === 0 ? (
                  emptyPosts(snapshot, result, clearAll, clearCategories)
                ) : shownKind && allGroups.length > 0 ? (
                  <EmptyState title={shownKind.none} action={solidButton("Show all kinds", () => setResourceKind("all"))}>
                    These posts link to other kinds of resources.
                  </EmptyState>
                ) : (
                  <EmptyState title="No resources here">
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
          </div>
        </main>
      </div>

      <Dialog
        controller={sidebarPanel}
        onOpenChangeComplete={(open) => {
          const postId = pendingCite.current;
          pendingCite.current = null;
          if (!open && postId !== null) window.requestAnimationFrame(() => showCited(postId));
        }}
      >
        <DialogBackdrop />
        <DialogContent
          initialFocus="content"
          className="inset-y-0 right-auto left-0 m-0 h-dvh max-h-none w-[min(19rem,calc(100%-3rem))] gap-0 overflow-visible rounded-none border-0 bg-transparent p-0 shadow-none data-ending-style:-translate-x-6 data-starting-style:-translate-x-6"
        >
          <DialogTitle className="sr-only">Filters and answer</DialogTitle>
          <SidebarDeck
            deck={deck}
            onSwap={swapDeck}
            filters={
              <Sidebar
                {...sidebar}
                headerAction={
                  <div className="flex items-center gap-1">
                    {deckButton}
                    <DialogClose aria-label="Close filters" className={SIDE_CLOSE}>
                      <X className="size-4" aria-hidden="true" />
                    </DialogClose>
                  </div>
                }
              />
            }
            answer={
              <AnswerCard
                {...answerCard}
                headerAction={
                  <DialogClose aria-label="Close answer" className={SIDE_CLOSE}>
                    <X className="size-4" aria-hidden="true" />
                  </DialogClose>
                }
              />
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
        quotedByFor={(post) => shownPosts.filter((other) => other.quoted?.id === post.id)}
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
        onEditTopics={holdPost}
      />
      <PostTopicsEditor
        controller={topicsEditor}
        postsById={postsById}
        topics={snapshot.topics}
        areas={snapshot.areas}
        topicsById={topicsById}
        listed={new Set(result.posts.map((post) => post.id))}
        onSelectTopic={selectTopic}
        onEdit={holdPost}
      />
      <ConnectXDialog controller={connectX} sync={sync} />
      <RemovedPosts controller={removedPosts} posts={snapshot.removed} onRestore={restore} onEmpty={emptyRemoved} />
      <ConfirmRemove controller={confirmRemove} onConfirm={removeConfirmed} />
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
