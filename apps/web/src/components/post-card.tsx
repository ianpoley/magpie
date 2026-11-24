"use client";

import { DialogTrigger, type createDialogController } from "@ui-sdk/react/dialog";
import { PopoverTrigger } from "@ui-sdk/react/popover";
import { Bookmark, ExternalLink, Globe, Heart, Link2, Quote, Tags, Trash2 } from "lucide-react";
import { useEffect, useRef, useTransition } from "react";

import { authorHue } from "@/lib/author-hues";
import { leadMedia, mediaKind, mediaNoun } from "@/lib/media";
import { withoutTrailingUrl } from "@/lib/post-links";
import { aroundHit, highlightRanges } from "@/lib/search";
import type { Chip, Collection, Media, Post, Topic } from "@/lib/types";

import { AuthorAvatar } from "./author-avatar";
import { formatLikes, formatPostDate } from "./format";
import { requestMediaFocus } from "./media-focus";
import { MediaPreview } from "./media-preview";
import { Marked, PostText, Thumb } from "./post-body";
import type { PostTopicsController } from "./post-topics-editor";
import { dangerIconButton, iconButton } from "./styles";
import { Tip } from "./tip";
import { TopicChip } from "./topic-chip";

export type PostDialogController = ReturnType<typeof createDialogController<string>>;

export const postCardOpen = (postId?: string): string =>
  postId === undefined ? "[data-post-card-open]" : `[data-post-card-open="${CSS.escape(postId)}"]`;

const REVEAL_POST = "magpie-reveal-post";

export const revealPostCard = (postId: string) => window.dispatchEvent(new CustomEvent<string>(REVEAL_POST, { detail: postId }));

export function useRevealedPostCards(onReveal: (postId: string) => void) {
  const handler = useRef(onReveal);
  useEffect(() => {
    handler.current = onReveal;
  });
  useEffect(() => {
    const on = (event: Event) => handler.current((event as CustomEvent<string>).detail);
    window.addEventListener(REVEAL_POST, on);
    return () => window.removeEventListener(REVEAL_POST, on);
  }, []);
}

export const hasMarks = (post: Post, collection: Collection): boolean =>
  (post.bookmarked && collection !== "bookmarks") || (post.liked && collection !== "likes");

const DISC =
  "rounded-full bg-surface shadow-[0_0_0_1px_color-mix(in_oklch,var(--color-ink)_10%,transparent),0_1px_2px_color-mix(in_oklch,var(--color-ink)_12%,transparent)]";

export function CollectionMarks({
  post,
  collection = "everything",
  large = false,
  discs = false,
  className = "",
}: {
  post: Post;
  collection?: Collection;
  large?: boolean;
  discs?: boolean;
  className?: string;
}) {
  if (!hasMarks(post, collection)) return null;
  const glyph = `${large ? "size-3.5" : "size-3"} fill-current`;
  const slot = (filled: boolean) => `flex items-center justify-center ${discs ? "size-4 sm:size-5" : "size-5"} ${filled && discs ? DISC : ""}`;
  return (
    <span className={`flex shrink-0 items-center ${discs ? "gap-1" : ""} ${className}`}>
      {collection !== "bookmarks" ? (
        <span className={`${slot(post.bookmarked)} text-bm`}>
          {post.bookmarked ? (
            <>
              <Bookmark className={glyph} aria-hidden="true" />
              <span className="sr-only">Bookmarked</span>
            </>
          ) : null}
        </span>
      ) : null}
      {collection !== "likes" ? (
        <span className={`${slot(post.liked)} text-like`}>
          {post.liked ? (
            <>
              <Heart className={glyph} aria-hidden="true" />
              <span className="sr-only">Liked</span>
            </>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

const ACTION_HIT = "relative before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[''] pointer-coarse:before:-inset-x-[5px]";

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
        <PopoverTrigger controller={topicsEditor} payload={post.id} aria-label="Edit topics" className={`${iconButton} ${ACTION_HIT} data-open:bg-sunken data-open:text-ink`}>
          <Tags aria-hidden="true" />
        </PopoverTrigger>
      </Tip>
      <Tip label="Copy link">
        <button type="button" aria-label="Copy link" onClick={() => onCopyLink(post)} className={`${iconButton} ${ACTION_HIT}`}>
          <Link2 aria-hidden="true" />
        </button>
      </Tip>
      <Tip label="Open on X">
        <a href={post.url} target="_blank" rel="noreferrer" aria-label="Open on X" className={`${iconButton} ${ACTION_HIT}`}>
          <ExternalLink aria-hidden="true" />
        </a>
      </Tip>
      <Tip label="Remove post">
        <button type="button" aria-label="Remove post" disabled={removing} onClick={() => startRemoving(() => onRemove(post))} className={`${dangerIconButton} ${ACTION_HIT} ml-1.5`}>
          <Trash2 aria-hidden="true" />
        </button>
      </Tip>
    </>
  );
}

export type PostCardProps = {
  post: Post;
  cited: boolean;
  collection: Collection;
  chips: Chip[];
  topicsById: Map<number, Topic>;
  activeTopicIds: number[];
  keyword: string;
  showLikes: boolean;
  bandYear: number | null;
  dialog: PostDialogController;
  topicsEditor: PostTopicsController;
  onSelectTopic: (topicId: number) => void;
  onSelectAuthor: (handle: string) => void;
  onCopyLink: (post: Post) => void;
  onRemove: (post: Post) => Promise<void>;
};

export function TopicChips({
  chips,
  topicsById,
  activeTopicIds,
  onSelectTopic,
  max,
  phone = false,
  oneLine = false,
}: Pick<PostCardProps, "chips" | "topicsById" | "activeTopicIds" | "onSelectTopic"> & { max?: number; phone?: boolean; oneLine?: boolean }) {
  const sliced = max === undefined ? chips : chips.slice(0, max);
  const shown = sliced.filter((chip) => topicsById.has(chip.topicId));
  const more = chips.length - sliced.length;
  const mouseShown = phone ? Math.min(2, shown.length) : shown.length;
  const touchShown = phone ? Math.min(1, shown.length) : shown.length;
  const counts = [
    { value: more, className: phone ? "flex max-sm:hidden" : "flex" },
    { value: more + shown.length - mouseShown, className: "hidden max-sm:flex max-sm:pointer-coarse:hidden" },
    { value: more + shown.length - touchShown, className: "hidden max-sm:pointer-coarse:flex" },
  ].slice(0, phone ? 3 : 1);
  return (
    <ul
      className={`pointer-events-auto flex min-w-0 gap-1.5 empty:hidden ${oneLine ? "shrink flex-nowrap overflow-hidden" : "flex-wrap"} ${oneLine && phone ? "max-sm:pointer-coarse:max-w-full max-sm:pointer-coarse:shrink-0" : ""}`}
    >
      {shown.map((chip, index) => {
        const topic = topicsById.get(chip.topicId)!;
        const hidden = index >= mouseShown ? "max-sm:hidden" : index >= touchShown ? "max-sm:pointer-coarse:hidden" : "";
        return (
          <li key={chip.topicId} className={`flex min-w-0 ${hidden}`}>
            <TopicChip name={topic.name} possible={chip.possible} active={activeTopicIds.includes(chip.topicId)} onSelect={() => onSelectTopic(chip.topicId)} />
          </li>
        );
      })}
      {counts.map((count, index) =>
        count.value > 0 ? (
          <li key={index} className={`${count.className} h-6 shrink-0 items-center px-1 text-[12px] font-semibold text-ink-muted tabular-nums`}>
            +{count.value}
          </li>
        ) : null,
      )}
    </ul>
  );
}

export function AuthorButton({ post, keyword, onSelectAuthor, className = "" }: { post: Post; keyword: string; onSelectAuthor: (handle: string) => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label={`Show posts by ${post.authorName}`}
      onClick={() => onSelectAuthor(post.authorHandle)}
      className={`focus-ring pointer-events-auto relative min-w-0 cursor-pointer truncate rounded-[4px] border-0 bg-transparent p-0 text-left font-bold decoration-current/40 underline-offset-2 after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] hover:underline ${className}`}
      style={{ color: authorHue(post.authorHandle).fg }}
    >
      <Marked text={post.authorName} keyword={keyword} />
    </button>
  );
}

const STRIP = "flex min-w-0 items-center gap-2 rounded-inner bg-sunken px-2.5 py-1.5 text-[13px] leading-snug";

export function MediaTrigger({ post, dialog, item, index, className, children }: { post: Post; dialog: PostDialogController; item: Media; index: number; className: string; children: React.ReactNode }) {
  const kind = mediaKind(item);
  const verb = kind === "photo" ? "Show photo" : `Play ${kind === "gif" ? "GIF" : "video"}`;
  return (
    <DialogTrigger
      controller={dialog}
      payload={post.id}
      aria-label={`${verb} in post by ${post.authorName}`}
      onClick={() => requestMediaFocus(post.id, index)}
      className={`focus-ring pointer-events-auto h-auto cursor-pointer border-0 bg-transparent p-0 hover:bg-transparent ${className}`}
    >
      <MediaPreview post={post} item={item}>
        {children}
      </MediaPreview>
    </DialogTrigger>
  );
}

export function PostCard(props: PostCardProps) {
  const { post, keyword, dialog } = props;
  const date = formatPostDate(post.createdAt, props.bandYear);
  const page = post.linkedPages[0] ?? null;
  const text = withoutTrailingUrl(post.text, page?.url ?? null).replace(/\n\s*\n+/g, "\n");
  const textId = `post-text-${post.id}`;
  const lead = leadMedia(post);
  const minis = lead ? lead.media.slice(1, 4) : [];
  const more = lead ? lead.media.length - 1 - minis.length : 0;
  return (
    <article data-cited={props.cited ? "" : undefined} className="relative rounded-card bg-surface shadow-card transition-shadow duration-150 ease-out hover:shadow-card-hover data-cited:shadow-cited">
      <DialogTrigger
        controller={dialog}
        payload={post.id}
        aria-label={`Open post by ${post.authorName}`}
        aria-describedby={text ? textId : undefined}
        data-post-card-open={post.id}
        className="focus-ring absolute inset-0 size-full cursor-pointer rounded-card border-0 bg-transparent p-0 -outline-offset-2 hover:bg-transparent"
      />
      <CollectionMarks
        post={post}
        collection={props.collection}
        discs
        className={`pointer-events-none absolute right-5 z-[1] ${lead ? "top-5" : "top-[24px] sm:top-[26px]"}`}
      />
      <div className="pointer-events-none relative flex gap-4 p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <header className={`relative flex items-center gap-3 ${!lead && hasMarks(post, props.collection) ? "pr-16" : ""}`}>
            <AuthorAvatar handle={post.authorHandle} name={post.authorName} url={post.authorAvatarUrl} size="list" />
            <div className="min-w-0 flex-1">
              <p className="flex text-[15px] leading-tight">
                <AuthorButton post={post} keyword={keyword} onSelectAuthor={props.onSelectAuthor} className="max-w-full" />
              </p>
              <p className="mt-0.5 flex min-w-0 gap-x-1 text-[13px] leading-tight whitespace-nowrap text-ink-muted max-sm:flex-col">
                <span className={`min-w-0 truncate ${highlightRanges(post.authorHandle, keyword).length > 0 ? "" : "max-sm:hidden"}`}>
                  @<Marked text={post.authorHandle} keyword={keyword} />
                </span>
                {date || props.showLikes ? (
                  <span className="flex shrink-0 gap-1 max-sm:mt-0.5">
                    {date ? (
                      <span>
                        <span className="max-sm:hidden">· </span>
                        {date}
                      </span>
                    ) : null}
                    {props.showLikes ? <span className="tabular-nums">· <span className="font-semibold text-ink">{formatLikes(post.likeCount)}</span></span> : null}
                  </span>
                ) : null}
              </p>
            </div>
            <div className={`post-actions card-head-actions pointer-events-auto absolute inset-y-0 -mr-1.5 hidden items-center gap-0.5 ${!lead && hasMarks(post, props.collection) ? "right-16" : "right-0"}`}>
              <PostActions post={post} topicsEditor={props.topicsEditor} onCopyLink={props.onCopyLink} onRemove={props.onRemove} />
            </div>
          </header>

          {text ? <PostText id={textId} text={aroundHit(text, keyword, 200)} keyword={keyword} className="line-clamp-4 text-pretty" /> : null}

          {post.quoted || page ? (
            <div className="flex flex-col gap-1">
              {post.quoted ? (
                <p className={STRIP}>
                  <Quote className="size-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
                  <span className="sr-only">Quotes</span>
                  <AuthorAvatar handle={post.quoted.authorHandle ?? "quoted"} name={post.quoted.authorName ?? "Quoted post"} url={post.quoted.authorAvatarUrl} size="sm" ring={false} />
                  <span className="shrink-0 font-semibold text-ink">{post.quoted.authorName ?? `@${post.quoted.authorHandle ?? "post"}`}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-muted">
                    <Marked text={aroundHit(post.quoted.text.replace(/\s+/g, " "), keyword, 60)} keyword={keyword} />
                  </span>
                  {post.quoted.media.length > 0 && !lead?.fromQuote ? <span className="shrink-0 text-[12px] text-ink-muted">{mediaNoun(post.quoted.media)}</span> : null}
                </p>
              ) : null}
              {page ? (
                <p className={STRIP}>
                  <Globe className="size-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
                  <span className="min-w-0 truncate font-semibold text-ink">
                    <Marked text={page.title} keyword={keyword} />
                  </span>
                  {page.host ? <span className="shrink-0 text-ink-muted">{page.host}</span> : null}
                  {post.linkedPages.length > 1 ? <span className="shrink-0 text-[12px] text-ink-muted tabular-nums">+{post.linkedPages.length - 1}</span> : null}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {lead ? (
          <div className="flex w-16 shrink-0 flex-col gap-1.5 sm:w-24">
            <MediaTrigger post={post} dialog={dialog} item={lead.media[0]} index={0} className="block rounded-inner">
              <Thumb item={lead.media[0]} className="size-16 sm:size-24" play="size-5 sm:size-7" />
            </MediaTrigger>
            {minis.length > 0 ? (
              <div className="grid grid-cols-3 gap-1.5 max-sm:hidden">
                {minis.map((item, i) => (
                  <MediaTrigger key={item.url} post={post} dialog={dialog} item={item} index={i + 1} className="relative block rounded-inner">
                    <Thumb item={item} className="size-7" small />
                    {i === minis.length - 1 && more > 0 ? (
                      <span className="absolute inset-0 flex items-center justify-center rounded-inner bg-[color-mix(in_oklch,var(--color-ink)_68%,transparent)] text-[11px] font-semibold text-surface tabular-nums">
                        +{more}
                      </span>
                    ) : null}
                  </MediaTrigger>
                ))}
              </div>
            ) : null}
            {lead.media.length > 1 ? <span className="text-[11px] leading-tight text-ink-muted sm:hidden">{mediaNoun(lead.media)}</span> : null}
            {lead.fromQuote ? <span className="text-[11px] leading-tight text-ink-muted">In the quote</span> : null}
          </div>
        ) : null}
      </div>
      <footer className="card-foot pointer-events-none relative -mt-1.5 flex flex-wrap items-end justify-between gap-x-3 gap-y-2 px-4 pb-4">
        <TopicChips {...props} max={3} phone />
        <div className="post-actions card-foot-actions pointer-events-auto -my-1 -mr-1.5 ml-auto flex shrink-0 items-center gap-0.5 pointer-coarse:gap-2.5">
          <PostActions post={post} topicsEditor={props.topicsEditor} onCopyLink={props.onCopyLink} onRemove={props.onRemove} />
        </div>
      </footer>
    </article>
  );
}
