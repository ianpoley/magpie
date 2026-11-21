"use client";

import { useEffect, useRef, useState } from "react";

import { postChips } from "@/lib/filter";
import { type Entrance, type Ghost, listChanges, withGhosts } from "@/lib/list-motion";
import { monthRuns } from "@/lib/month-runs";
import type { FilterState, Post, Topic } from "@/lib/types";

import { formatCount } from "./format";
import { PostCard, type PostCardProps, type PostDialogController } from "./post-card";
import type { PostLayout } from "./post-layout";
import { PostListRow } from "./post-list-row";
import type { PostTopicsController } from "./post-topics-editor";

const PAGE = 60;

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

export function PostList({
  posts,
  unsureStart,
  filter,
  layout,
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
  const [shown, setShown] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = shown < posts.length;

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setShown((count) => count + PAGE);
      },
      { rootMargin: "1200px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, shown]);

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
  const listedUnsure = unsureStart === null ? null : unsureStart + motion.ghosts.filter((ghost) => ghost.index < unsureStart).length;
  const itemProps = (post: Post) => {
    const leave = leaving.has(post.id);
    return { className: "post-li", "data-motion": leave ? "leave" : motion.entrances.get(post.id), inert: leave || undefined, "aria-hidden": leave || undefined };
  };

  const unsureCount = unsureStart === null ? 0 : posts.length - unsureStart;
  const propsFor = (post: Post): PostCardProps => ({
    post,
    chips: postChips(post, filter),
    topicsById,
    activeTopicIds: filter.topicIds,
    keyword: filter.keyword,
    showLikes: filter.sort === "most_liked",
    dialog,
    topicsEditor,
    onSelectTopic,
    onSelectAuthor,
    onCopyLink,
    onRemove,
  });

  return (
    <>
      {layout === "rows" ? (
        <div className="flex flex-col gap-4">
          {monthRuns(listed, listedShown, listedUnsure, filter, ranked).map((run, index, runs) => (
            <section key={`${run.key}-${index}`} aria-label={run.label ?? "Posts"} className="flex flex-col gap-2">
              {run.possible && !runs[index - 1]?.possible && unsureCount > 0 ? (
                <ul>
                  <Divider count={unsureCount} total={posts.length} />
                </ul>
              ) : null}
              {run.label ? (
                <h2 className="sticky top-[var(--pinned-h,56px)] z-10 -mx-4 -mt-2 flex items-baseline gap-2 bg-[color-mix(in_oklch,var(--color-canvas)_82%,transparent)] px-5 py-1.5 backdrop-blur-[12px] sm:-mx-8 sm:px-9">
                  <span className="text-eyebrow text-ink">{run.label}</span>
                  <span className="text-[12px] font-medium text-ink-muted tabular-nums">{formatCount(run.count)}</span>
                </h2>
              ) : null}
              <ul className="divide-y divide-line overflow-hidden rounded-card bg-surface shadow-card">
                {run.posts.map((post) => (
                  <li key={post.id} {...itemProps(post)}>
                    <PostListRow {...propsFor(post)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="flex flex-col gap-3 [--list-gap:0.75rem]">
          {listed.slice(0, listedShown).map((post, index) => (
            <FragmentRow key={post.id} item={itemProps(post)} divider={unsureCount > 0 && index === listedUnsure ? <Divider count={unsureCount} total={posts.length} /> : null}>
              <PostCard {...propsFor(post)} />
            </FragmentRow>
          ))}
        </ul>
      )}
      {hasMore ? (
        <div ref={sentinel} className="py-6 text-center text-[13px] text-ink-muted" aria-hidden="true">
          Loading more…
        </div>
      ) : posts.length > PAGE ? (
        <p className="py-6 text-center text-[13px] text-ink-muted">
          That is all <span className="tabular-nums">{formatCount(posts.length)}</span>.
        </p>
      ) : null}
    </>
  );
}

function FragmentRow({ divider, item, children }: { divider: React.ReactNode; item: React.LiHTMLAttributes<HTMLLIElement> & { inert?: boolean }; children: React.ReactNode }) {
  return (
    <>
      {divider}
      <li {...item}>{children}</li>
    </>
  );
}
