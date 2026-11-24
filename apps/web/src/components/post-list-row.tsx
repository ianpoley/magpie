"use client";

import { DialogTrigger } from "@ui-sdk/react/dialog";
import { Globe, Images, Play, Quote } from "lucide-react";

import { leadMedia, mediaKind, mediaNoun } from "@/lib/media";
import { withoutTrailingUrl } from "@/lib/post-links";
import { aroundHit, highlightRanges } from "@/lib/search";
import type { Post } from "@/lib/types";

import { AuthorAvatar } from "./author-avatar";
import { formatDate, formatLikes } from "./format";
import { Marked, PostText, Thumb } from "./post-body";
import { AuthorButton, CollectionMarks, MediaTrigger, PostActions, type PostCardProps, TopicChips } from "./post-card";

const hit = (text: string | null | undefined, keyword: string): boolean => !!text && highlightRanges(text, keyword).length > 0;

function Carries({ post, keyword }: { post: Post; keyword: string }) {
  const page = post.linkedPages[0];
  const quoteHit = !!post.quoted && (hit(post.quoted.text, keyword) || hit(post.quoted.authorName, keyword) || hit(post.quoted.authorHandle, keyword));
  const linkHit = post.linkedPages.some((linked) => hit(linked.title, keyword));
  const marked = "rounded-[4px] bg-mark px-1 text-ink";
  if (post.media.length === 0 && !post.quoted && !page) return null;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden pl-1 text-[12px] font-medium text-ink-muted max-sm:gap-2">
      {post.media.length > 0 ? (
        <span className="flex shrink-0 items-center gap-1">
          {mediaKind(post.media[0]) === "photo" ? <Images className="size-3.5" aria-hidden="true" /> : <Play className="size-3.5" aria-hidden="true" />}
          <span className="max-sm:sr-only">{mediaNoun(post.media)}</span>
        </span>
      ) : null}
      {post.quoted ? (
        <span className={`flex min-w-0 items-center gap-1 ${quoteHit ? marked : ""}`}>
          <Quote className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate max-sm:sr-only">
            <span className="sr-only">Quotes </span>@{post.quoted.authorHandle ?? "post"}
          </span>
        </span>
      ) : null}
      {page ? (
        <span className={`flex min-w-0 items-center gap-1 ${linkHit ? marked : ""}`}>
          <Globe className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate max-sm:sr-only">{linkHit ? <Marked text={page.title} keyword={keyword} /> : (page.host ?? page.title)}</span>
        </span>
      ) : null}
    </span>
  );
}

export function PostListRow(props: PostCardProps) {
  const { post, keyword, dialog } = props;
  const date = formatDate(post.createdAt);
  const page = post.linkedPages[0] ?? null;
  const text = aroundHit(withoutTrailingUrl(post.text, page?.url ?? null).replace(/\s+/g, " ").trim(), keyword, 120);
  const textId = `post-text-${post.id}`;
  const lead = leadMedia(post);
  return (
    <article data-cited={props.cited ? "" : undefined} className="relative transition-colors duration-150 ease-out hover:bg-[color-mix(in_oklch,var(--color-sunken)_55%,var(--color-surface))] data-cited:bg-primary-soft data-cited:shadow-[inset_3px_0_0_var(--color-primary)]">
      <DialogTrigger
        controller={dialog}
        payload={post.id}
        aria-label={`Open post by ${post.authorName}`}
        aria-describedby={text ? textId : undefined}
        data-post-card-open={post.id}
        className="focus-ring absolute inset-0 size-full cursor-pointer rounded-none border-0 bg-transparent p-0 -outline-offset-2 hover:bg-transparent"
      />
      <div className="pointer-events-none relative flex gap-3 py-2.5 pr-3 pl-4">
        <div className="pt-0.5">
          <AuthorAvatar handle={post.authorHandle} name={post.authorName} url={post.authorAvatarUrl} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="flex min-w-0 items-baseline gap-1.5 text-[13px] leading-tight">
              <AuthorButton post={post} keyword={keyword} onSelectAuthor={props.onSelectAuthor} className="shrink text-[14px]" />
              <span className="min-w-0 shrink-[2] truncate text-ink-muted">
                @<Marked text={post.authorHandle} keyword={keyword} />
              </span>
              {date ? <span className="shrink-0 text-ink-muted tabular-nums">· {date}</span> : null}
              {props.showLikes ? <span className="shrink-0 text-ink-muted tabular-nums">· {formatLikes(post.likeCount)}</span> : null}
            </p>
            <Carries post={post} keyword={keyword} />
            <span className="ml-auto">
              <CollectionMarks post={post} />
            </span>
          </div>
          {text ? <PostText id={textId} text={text} keyword={keyword} className="line-clamp-2 max-w-none text-[14px] leading-[1.45] whitespace-normal" /> : null}
          <div className="flex min-h-7 min-w-0 items-center gap-3">
            <TopicChips {...props} max={3} oneLine />
            <div className="pointer-events-auto -my-1 ml-auto flex shrink-0 items-center gap-0.5">
              <PostActions post={post} topicsEditor={props.topicsEditor} onCopyLink={props.onCopyLink} onRemove={props.onRemove} />
            </div>
          </div>
        </div>
        {lead ? (
          <div className="pt-0.5 max-sm:hidden">
            <MediaTrigger post={post} dialog={dialog} item={lead.media[0]} index={0} className="relative block rounded-inner">
              <Thumb item={lead.media[0]} className="size-[72px]" />
              {lead.media.length > 1 ? (
                <span className="absolute right-1 bottom-1 rounded-full bg-ink px-1.5 py-px text-[10px] font-semibold text-surface tabular-nums">{lead.media.length}</span>
              ) : null}
            </MediaTrigger>
          </div>
        ) : null}
      </div>
    </article>
  );
}
