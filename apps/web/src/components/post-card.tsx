"use client";

import { DialogTrigger, type createDialogController } from "@ui-sdk/react/dialog";
import { PopoverTrigger } from "@ui-sdk/react/popover";
import { Bookmark, ExternalLink, Heart, Link2, Tags, Trash2 } from "lucide-react";
import { useTransition } from "react";

import { authorHue } from "@/lib/author-hues";
import type { Chip, Post, Topic } from "@/lib/types";

import { AuthorAvatar } from "./author-avatar";
import { compactCount, formatDate } from "./format";
import { LinkedPages, Marked, MediaGrid, PostText, Quoted } from "./post-body";
import type { PostTopicsController } from "./post-topics-editor";
import { dangerIconButton, iconButton } from "./styles";
import { Tip } from "./tip";
import { TopicChip } from "./topic-chip";

export type PostDialogController = ReturnType<typeof createDialogController<string>>;

export function CollectionMarks({ post }: { post: Post }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {post.bookmarked ? (
        <span className="flex size-6 items-center justify-center rounded-full bg-bm-soft text-bm-text">
          <Bookmark className="size-3.5 fill-current" aria-hidden="true" />
          <span className="sr-only">Bookmarked</span>
        </span>
      ) : null}
      {post.liked ? (
        <span className="flex size-6 items-center justify-center rounded-full bg-like-soft text-like-text">
          <Heart className="size-3.5 fill-current" aria-hidden="true" />
          <span className="sr-only">Liked</span>
        </span>
      ) : null}
    </span>
  );
}

export function PostActions({
  post,
  topicsEditor,
  onCopyLink,
  onRemove,
}: {
  post: Post;
  topicsEditor: PostTopicsController;
  onCopyLink: (post: Post) => void;
  onRemove: (post: Post) => Promise<void>;
}) {
  const [removing, startRemoving] = useTransition();
  return (
    <>
      <Tip label="Edit topics">
        <PopoverTrigger controller={topicsEditor} payload={post.id} aria-label="Edit topics" className={`${iconButton} data-open:bg-sunken data-open:text-ink`}>
          <Tags aria-hidden="true" />
        </PopoverTrigger>
      </Tip>
      <Tip label="Remove from corpus">
        <button type="button" aria-label="Remove from corpus" disabled={removing} onClick={() => startRemoving(() => onRemove(post))} className={dangerIconButton}>
          <Trash2 aria-hidden="true" />
        </button>
      </Tip>
      <Tip label="Copy link">
        <button type="button" aria-label="Copy link" onClick={() => onCopyLink(post)} className={iconButton}>
          <Link2 aria-hidden="true" />
        </button>
      </Tip>
      <Tip label="Open on X">
        <a href={post.url} target="_blank" rel="noreferrer" aria-label="Open on X" className={iconButton}>
          <ExternalLink aria-hidden="true" />
        </a>
      </Tip>
    </>
  );
}

export function PostCard({
  post,
  chips,
  topicsById,
  activeTopicIds,
  keyword,
  dialog,
  topicsEditor,
  onSelectTopic,
  onSelectAuthor,
  onCopyLink,
  onRemove,
}: {
  post: Post;
  chips: Chip[];
  topicsById: Map<number, Topic>;
  activeTopicIds: number[];
  keyword: string;
  dialog: PostDialogController;
  topicsEditor: PostTopicsController;
  onSelectTopic: (topicId: number) => void;
  onSelectAuthor: (handle: string) => void;
  onCopyLink: (post: Post) => void;
  onRemove: (post: Post) => Promise<void>;
}) {
  const hue = authorHue(post.authorHandle);
  const date = formatDate(post.createdAt);
  return (
    <article className="relative rounded-card bg-surface shadow-card transition-shadow duration-150 ease-out hover:shadow-card-hover">
      <DialogTrigger
        controller={dialog}
        payload={post.id}
        aria-label={`Open post by ${post.authorName}`}
        className="focus-ring absolute inset-0 size-full cursor-pointer rounded-card border-0 bg-transparent p-0 hover:bg-transparent"
      />
      <div className="pointer-events-none relative flex flex-col gap-3 p-4 sm:p-5">
        <header className="flex items-center gap-3">
          <AuthorAvatar handle={post.authorHandle} name={post.authorName} url={post.authorAvatarUrl} />
          <div className="min-w-0 flex-1">
            <p className="flex text-[15px] leading-tight font-bold" style={{ color: hue.fg }}>
              <button type="button" aria-label={`Show posts by ${post.authorName}`} onClick={() => onSelectAuthor(post.authorHandle)} className="focus-ring pointer-events-auto max-w-full cursor-pointer truncate rounded-[4px] border-0 bg-transparent p-0 text-left decoration-current/40 underline-offset-2 hover:underline">
                <Marked text={post.authorName} keyword={keyword} />
              </button>
            </p>
            <p className="mt-0.5 truncate text-[13px] leading-tight text-ink-muted">
              @<Marked text={post.authorHandle} keyword={keyword} />
              {date ? <span> · {date}</span> : null}
            </p>
          </div>
          <CollectionMarks post={post} />
        </header>

        {post.text ? <PostText text={post.text} keyword={keyword} className="line-clamp-[9]" /> : null}
        <LinkedPages pages={post.linkedPages.slice(0, 1)} keyword={keyword} />
        {post.quoted ? <Quoted quoted={post.quoted} keyword={keyword} /> : null}
        <MediaGrid media={post.media} />

        <footer className="flex items-end justify-between gap-3">
          <ul className="pointer-events-auto flex min-w-0 flex-wrap gap-1.5 empty:hidden">
            {chips.map((chip) => {
              const topic = topicsById.get(chip.topicId);
              if (!topic) return null;
              return (
                <li key={chip.topicId} className="flex min-w-0">
                  <TopicChip
                    name={topic.name}
                    possible={chip.possible}
                    active={activeTopicIds.includes(chip.topicId)}
                    onSelect={() => onSelectTopic(chip.topicId)}
                  />
                </li>
              );
            })}
          </ul>
          <div className="pointer-events-auto -my-1 -mr-1.5 ml-auto flex shrink-0 items-center gap-0.5">
            {post.likeCount > 0 ? (
              <span className="mr-1.5 flex items-center gap-1 text-[12px] font-medium text-ink-muted tabular-nums">
                <Heart className="size-3.5" aria-hidden="true" />
                {compactCount(post.likeCount)}
                <span className="sr-only"> likes on X</span>
              </span>
            ) : null}
            <PostActions post={post} topicsEditor={topicsEditor} onCopyLink={onCopyLink} onRemove={onRemove} />
          </div>
        </footer>
      </div>
    </article>
  );
}
