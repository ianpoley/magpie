"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import { postChips } from "@/lib/filter";
import { type Entrance, type Ghost, listChanges, withGhosts } from "@/lib/list-motion";
import { monthRuns } from "@/lib/month-runs";
import type { FilterState, Post, Topic } from "@/lib/types";

import { formatCount } from "./format";
import { createTopStore, type TopStore, useListScroll } from "./list-scroll";
import { PostCard, type PostCardProps, type PostDialogController, postCardOpen, useRevealedPostCards } from "./post-card";
import type { PostLayout } from "./post-layout";
import { PostListRow } from "./post-list-row";
import type { PostTopicsController } from "./post-topics-editor";

const PAGE = 60;
const WINDOW = 6 * PAGE;

function around(index: number, total: number) {
  const start = Math.max(0, Math.floor(index / PAGE) * PAGE - PAGE);
  return { first: start, last: Math.min(total, start + 3 * PAGE) };
}

function Divider({ count, total }: { count: number; total: number }) {
  return (
    <li role="separator" aria-label="Possible matches" className="flex items-center gap-3 py-3">
      <span className="h-px flex-1 bg-[color-mix(in_oklch,var(--color-ink)_16%,transparent)]" />
      <span className="text-eyebrow text-ink-muted">
        {count === total ? "Only possible matches" : "Possible matches"} · <span className="tabular-nums">{formatCount(count)}</span>
      </span>
      <span className="h-px flex-1 bg-[color-mix(in_oklch,var(--color-ink)_16%,transparent)]" />
    </li>
  );
}

const POSITION_KEY = "magpie-list-top";
let restoredOnLoad = false;

function settleOn(card: HTMLElement) {
  const item = card.closest("li");
  if (!item) return;
  item.scrollIntoView({ block: "start" });
  requestAnimationFrame(() => requestAnimationFrame(() => item.scrollIntoView({ block: "start" })));
}

function returningToPage(): boolean {
  const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return entry?.type === "reload" || entry?.type === "back_forward";
}

function savedTop(): string | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(POSITION_KEY) ?? "null") as { search: string; id: string } | null;
    return saved?.search === location.search ? saved.id : null;
  } catch {
    return null;
  }
}

function BandCount({ store, runIds, offset, count, posts }: { store: TopStore; runIds: string[]; offset: number; count: number; posts: Post[] }) {
  const top = useSyncExternalStore(store.subscribe, store.get, () => null);
  const at = top === null ? -1 : runIds.indexOf(top);
  const here = at === -1 ? -1 : at + offset;
  const overall = here === -1 ? -1 : posts.findIndex((post) => post.id === top);
  return (
    <>
      <span className="sr-only">, {formatCount(count)} {count === 1 ? "post" : "posts"}</span>
      <span aria-hidden="true" className="text-[12px] font-medium text-ink-muted tabular-nums">{here === -1 ? formatCount(count) : `${formatCount(here + 1)} of ${formatCount(count)}`}</span>
      {here === -1 || overall === here ? null : (
        <span aria-hidden="true" className="ml-auto text-[12px] font-medium text-ink-muted tabular-nums max-sm:hidden">
          {formatCount(overall + 1)} of {formatCount(posts.length)}
        </span>
      )}
    </>
  );
}

export function PostList({
  posts,
  unsureStart,
  filter,
  layout,
  cited,
  ranked,
  arriving,
  topicsById,
  dialog,
  topicsEditor,
  onSelectTopic,
  onSelectAuthor,
  onCopyLink,
  onRemove,
}: {
  posts: Post[];
  unsureStart: number | null;
  filter: FilterState;
  layout: PostLayout;
  cited: string[];
  ranked: boolean;
  arriving: boolean;
  topicsById: Map<number, Topic>;
  dialog: PostDialogController;
  topicsEditor: PostTopicsController;
  onSelectTopic: (topicId: number) => void;
  onSelectAuthor: (handle: string) => void;
  onCopyLink: (post: Post) => void;
  onRemove: (post: Post) => Promise<void>;
}) {
  const [range, setRange] = useState({ first: 0, last: PAGE });
  const shown = Math.min(range.last, posts.length);
  const first = Math.min(range.first, shown);
  const topSentinel = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const above = useRef<HTMLDivElement>(null);
  const below = useRef<HTMLDivElement>(null);
  const [store] = useState(createTopStore);
  const pitch = useRef(layout === "rows" ? 118 : 221);
  const restoring = useRef<string | null>(null);
  const toEnd = useRef(false);
  const hasMore = shown < posts.length;
  const remeasure = useListScroll({
    list: listRef,
    above,
    store,
    pitch: () => pitch.current,
    onLand: (index) => {
      toEnd.current = index >= posts.length - PAGE;
      setRange((current) => {
        const next = around(index, posts.length);
        return next.first === current.first && next.last === current.last ? current : next;
      });
    },
  });

  useLayoutEffect(() => {
    const node = listRef.current;
    if (node && shown > first) pitch.current = node.offsetHeight / (shown - first);
    if (above.current) above.current.style.height = `${first * pitch.current}px`;
    if (below.current) below.current.style.height = `${Math.max(0, (posts.length - shown) * pitch.current - 72)}px`;
    remeasure.current();
  }, [first, shown, posts.length, layout, remeasure]);

  useEffect(() => {
    if (restoredOnLoad) return;
    const id = returningToPage() ? savedTop() : null;
    const at = id === null ? -1 : posts.findIndex((post) => post.id === id);
    if (at <= 0) {
      restoredOnLoad = true;
      return;
    }
    const frame = requestAnimationFrame(() => {
      restoredOnLoad = true;
      const card = document.querySelector<HTMLElement>(postCardOpen(id!));
      if (card) return settleOn(card);
      restoring.current = id;
      setRange(around(at, posts.length));
    });
    return () => cancelAnimationFrame(frame);
  }, [posts]);

  useLayoutEffect(() => {
    if (toEnd.current && shown === posts.length) {
      toEnd.current = false;
      const bottom = () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
      bottom();
      requestAnimationFrame(() => requestAnimationFrame(bottom));
    }
    const id = restoring.current;
    const card = id === null ? null : document.querySelector<HTMLElement>(postCardOpen(id));
    if (!card) return;
    restoring.current = null;
    settleOn(card);
  }, [first, shown, posts.length]);

  useEffect(
    () =>
      store.subscribe(() => {
        const id = store.get();
        try {
          if (id === null) sessionStorage.removeItem(POSITION_KEY);
          else sessionStorage.setItem(POSITION_KEY, JSON.stringify({ search: location.search, id }));
        } catch {}
      }),
    [store],
  );
  useRevealedPostCards((postId) => {
    const at = posts.findIndex((post) => post.id === postId);
    if (at >= shown && at < shown + 2 * PAGE) setRange((current) => ({ ...current, last: Math.ceil((at + 1) / PAGE) * PAGE }));
    else if (at >= 0 && at < first && at >= first - 2 * PAGE) setRange((current) => ({ ...current, first: Math.floor(at / PAGE) * PAGE }));
  });

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setRange((current) => {
          const last = current.last + PAGE;
          return { first: last - current.first > WINDOW ? current.first + PAGE : current.first, last };
        });
      },
      { rootMargin: "1200px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, shown]);

  useEffect(() => {
    const node = topSentinel.current;
    if (!node || first === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setRange((current) => {
          const start = Math.max(0, current.first - PAGE);
          return { first: start, last: current.last - start > WINDOW ? current.last - PAGE : current.last };
        });
      },
      { rootMargin: "1200px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [first]);

  const [motion, setMotion] = useState({
    posts,
    ghosts: [] as Ghost[],
    entrances: new Map<string, Entrance>(),
    removed: new Set<string>(),
    batch: null as { leaving: string[]; entering: string[] } | null,
  });
  if (motion.posts !== posts) {
    const { ghosts, entrances } = listChanges(motion.posts, posts, shown, motion.removed, arriving);
    if (ghosts.length === 0 && entrances.size === 0) setMotion({ ...motion, posts });
    else {
      const listed = new Set(posts.map((post) => post.id));
      setMotion({
        posts,
        ghosts: [...motion.ghosts.filter((ghost) => !listed.has(ghost.post.id)), ...ghosts],
        entrances: new Map([...motion.entrances, ...entrances]),
        removed: new Set([...motion.removed, ...ghosts.map((ghost) => ghost.post.id)]),
        batch: { leaving: ghosts.map((ghost) => ghost.post.id), entering: [...entrances.keys()] },
      });
    }
  }
  useEffect(() => {
    const batch = motion.batch;
    if (!batch) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => {
      setMotion((current) => ({
        ...current,
        ghosts: current.ghosts.filter((ghost) => !batch.leaving.includes(ghost.post.id)),
        entrances: new Map([...current.entrances].filter(([id]) => !batch.entering.includes(id))),
      }));
    }, reduced ? 160 : 380);
  }, [motion.batch]);
  const leaving = new Set(motion.ghosts.map((ghost) => ghost.post.id));
  const listed = withGhosts(posts, motion.ghosts);
  const listedShown = shown + motion.ghosts.length;
  const listedFirst = first + motion.ghosts.filter((ghost) => ghost.index < first).length;
  const listedUnsure = unsureStart === null ? null : unsureStart + motion.ghosts.filter((ghost) => ghost.index < unsureStart).length;
  const itemProps = (post: Post) => {
    const leave = leaving.has(post.id);
    return { className: "post-li", "data-motion": leave ? "leave" : motion.entrances.get(post.id), inert: leave || undefined, "aria-hidden": leave || undefined };
  };

  const unsureCount = unsureStart === null ? 0 : posts.length - unsureStart;
  const propsFor = (post: Post, bandYear: number | null): PostCardProps => ({
    post,
    cited: cited.includes(post.id),
    collection: filter.collection,
    chips: postChips(post, filter),
    topicsById,
    activeTopicIds: filter.topicIds,
    keyword: filter.keyword,
    showLikes: filter.sort === "most_liked",
    bandYear,
    dialog,
    topicsEditor,
    onSelectTopic,
    onSelectAuthor,
    onCopyLink,
    onRemove,
  });
  const rows = layout === "rows";

  return (
    <>
      <div ref={above} aria-hidden="true" className="[overflow-anchor:none]" />
      <div ref={topSentinel} aria-hidden="true" className="[overflow-anchor:none]" />
      <div ref={listRef} className="flex flex-col gap-8">
        {monthRuns(listed, listedShown, listedUnsure, filter, ranked, listedFirst).map((run, index, runs) => {
          return (
          <section key={`${run.key}-${index}`} aria-label={run.label ?? "Posts"} className="flex flex-col gap-2">
            {run.possible && unsureCount > 0 && (index > 0 ? !runs[index - 1].possible : listedFirst <= (listedUnsure ?? 0)) ? (
              <ul>
                <Divider count={unsureCount} total={posts.length} />
              </ul>
            ) : null}
            {run.label ? (
              <h2 className={`sticky top-[var(--pinned-h,56px)] z-10 -mx-4 flex ${index === 0 ? "-mt-2" : ""} items-baseline gap-2 bg-[color-mix(in_oklch,var(--color-canvas)_90%,transparent)] px-4 py-1.5 backdrop-blur-[12px] backdrop-saturate-[1.2] sm:-mx-8 sm:px-8`}>
                <span className="text-eyebrow text-ink">{run.label}</span>
                <BandCount store={store} runIds={run.posts.map((post) => post.id)} offset={run.offset} count={run.count} posts={posts} />
              </h2>
            ) : null}
            {rows ? (
              <ul className="divide-y divide-line overflow-hidden rounded-card bg-surface shadow-card">
                {run.posts.map((post) => (
                  <li key={post.id} {...itemProps(post)}>
                    <PostListRow {...propsFor(post, run.year)} />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="flex flex-col gap-3 [--list-gap:0.75rem]">
                {run.posts.map((post) => (
                  <li key={post.id} {...itemProps(post)}>
                    <PostCard {...propsFor(post, run.year)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          );
        })}
      </div>
      {hasMore ? (
        <>
          <div ref={sentinel} className="py-6 text-center [overflow-anchor:none] text-[13px] text-ink-muted" aria-hidden="true">
            Loading more…
          </div>
          <div ref={below} aria-hidden="true" className="[overflow-anchor:none]" />
        </>
      ) : posts.length > PAGE ? (
        <p className="text-eyebrow py-10 text-center text-ink-muted">
          That’s all <span className="tabular-nums">{formatCount(posts.length)}</span> posts
        </p>
      ) : null}
    </>
  );
}
