"use client";

import { useEffect, useRef, useState } from "react";

import { postChips } from "@/lib/filter";
import type { FilterState, Post, Topic } from "@/lib/types";

import { formatCount } from "./format";
import { PostCard, type PostDialogController } from "./post-card";
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

/**
 * The matching posts as cards, 60 at a time, with more added as the end comes
 * into view. Give it a `key` that changes with the filter so the window starts
 * over. Under a category filter, a divider sets unsure matches apart.
 */
export function PostList({
  posts,
  unsureStart,
  filter,
  topicsById,
  dialog,
  topicsEditor,
  onSelectTopic,
  onCopyLink,
  onRemove,
}: {
  posts: Post[];
  unsureStart: number | null;
  filter: FilterState;
  topicsById: Map<number, Topic>;
  dialog: PostDialogController;
  topicsEditor: PostTopicsController;
  onSelectTopic: (topicId: number) => void;
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

  const visible = posts.slice(0, shown);
  const unsureCount = unsureStart === null ? 0 : posts.length - unsureStart;

  return (
    <>
      <ul className="flex flex-col gap-3">
        {visible.map((post, index) => (
          <FragmentRow key={post.id} divider={unsureCount > 0 && index === unsureStart ? <Divider count={unsureCount} total={posts.length} /> : null}>
            <PostCard
              post={post}
              chips={postChips(post, filter)}
              topicsById={topicsById}
              activeTopicIds={filter.topicIds}
              keyword={filter.keyword}
              dialog={dialog}
              topicsEditor={topicsEditor}
              onSelectTopic={onSelectTopic}
              onCopyLink={onCopyLink}
              onRemove={onRemove}
            />
          </FragmentRow>
        ))}
      </ul>
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

function FragmentRow({ divider, children }: { divider: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      {divider}
      <li>{children}</li>
    </>
  );
}
