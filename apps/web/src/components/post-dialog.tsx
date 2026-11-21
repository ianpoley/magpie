"use client";

import { Button } from "@ui-sdk/react/button";
import { Dialog, DialogBackdrop, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@ui-sdk/react/dialog";
import { PopoverTrigger } from "@ui-sdk/react/popover";
import { ChevronDown, ChevronUp, ExternalLink, Heart, Link2, Tags, Trash2, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { authorHue } from "@/lib/author-hues";
import type { Area, Chip, Post, Topic } from "@/lib/types";

import { AuthorAvatar } from "./author-avatar";
import { compactCount, formatDate } from "./format";
import { LinkedPages, MediaGrid, PostText, Quoted } from "./post-body";
import { CollectionMarks, postCardOpen, type PostDialogController } from "./post-card";
import { PostRow } from "./resources-view";
import { createPostTopicsController, PostTopicsEditor } from "./post-topics-editor";
import { dangerButton, dialogContent, iconButton } from "./styles";
import { TopicChip } from "./topic-chip";

const CONTENT = `w-[min(42rem,calc(100%-1.5rem))] ${dialogContent}`;

export function PostDialog({
  controller,
  postsById,
  topics,
  areas,
  topicsById,
  chipsFor,
  similarFor,
  neighborsOf,
  isAuthor,
  onShowAuthor,
  activeTopicIds,
  keyword,
  onSelectTopic,
  onSelectAuthor,
  onCopyLink,
  onRemove,
}: {
  controller: PostDialogController;
  postsById: Map<string, Post>;
  topics: Topic[];
  areas: Area[];
  topicsById: Map<number, Topic>;
  chipsFor: (post: Post) => Chip[];
  similarFor: (post: Post) => Post[];
  /** The posts listed before and after this one, for stepping through the list without closing. */
  neighborsOf: (postId: string) => { previous: string | null; next: string | null };
  /** Whether the corpus has posts by this handle, so a mention of it can filter to them. */
  isAuthor: (handle: string) => boolean;
  /** Shows everything by a mentioned author, setting aside the search and categories that may exclude them. */
  onShowAuthor: (handle: string) => void;
  activeTopicIds: number[];
  keyword: string;
  onSelectTopic: (topicId: number) => void;
  onSelectAuthor: (handle: string) => void;
  onCopyLink: (post: Post) => void;
  onRemove: (post: Post) => Promise<void>;
}) {
  const [topicsEditor] = useState(createPostTopicsController);
  const [removing, startRemoving] = useTransition();
  const open = useRef(false);
  const stepped = useRef(false);
  return (
    <Dialog
      controller={controller}
      onOpenChange={(next) => {
        open.current = next;
        if (next) stepped.current = false;
      }}
      onPayloadChange={() => {
        if (open.current) stepped.current = true;
      }}
    >
      <DialogBackdrop />
      <DialogContent<string>
        initialFocus="content"
        // After stepping to other posts, closing lands on the card of the post last shown, when it is listed.
        finalFocus={() => {
          if (!stepped.current) return undefined;
          const id = controller.getPayload();
          const card = id === undefined ? null : document.querySelector<HTMLElement>(postCardOpen(id));
          card?.scrollIntoView({ block: "nearest" });
          return card ?? undefined;
        }}
        className={CONTENT}
        onKeyDown={(event) => {
          if ((event.key !== "j" && event.key !== "k") || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
          // Keys from popups portaled out of the dialog, like the topics editor, still bubble here through React.
          const target = event.target as HTMLElement;
          if (!event.currentTarget.contains(target) || target.closest("input, textarea, select, [contenteditable]:not([contenteditable=false])")) return;
          const current = controller.getPayload();
          const step = current === undefined ? null : neighborsOf(current)[event.key === "j" ? "next" : "previous"];
          if (step === null) return;
          event.preventDefault();
          void controller.open({ payload: step });
        }}
      >
        {(state) => {
          const post = typeof state.payload === "string" ? postsById.get(state.payload) : undefined;
          if (!post) {
            return (
              <div className="flex flex-col items-start gap-2 p-6">
                <DialogTitle className="text-display text-[20px]">This post is no longer saved</DialogTitle>
                <DialogDescription className="text-[14px] text-ink-muted">
                  It left your bookmarks and likes since this page loaded.
                </DialogDescription>
                <DialogClose data-variant="solid" className="mt-3">
                  Close
                </DialogClose>
              </div>
            );
          }
          const hue = authorHue(post.authorHandle);
          const date = formatDate(post.createdAt);
          const chips = chipsFor(post);
          const similar = similarFor(post);
          const { previous, next } = neighborsOf(post.id);
          return (
            <>
              <header className="flex items-center gap-3 border-b border-line px-5 py-4">
                <AuthorAvatar handle={post.authorHandle} name={post.authorName} url={post.authorAvatarUrl} size="lg" />
                <div className="min-w-0 flex-1">
                  <DialogTitle className="flex text-[17px] leading-tight font-bold" style={{ color: hue.fg }}>
                    {/* The title names the dialog, so the button keeps the author's name and describes itself in `title`. */}
                    <button
                      type="button"
                      title={`Show posts by ${post.authorName}`}
                      onClick={() => {
                        onSelectAuthor(post.authorHandle);
                        controller.close();
                      }}
                      className="focus-ring pointer-events-auto relative max-w-full min-w-0 cursor-pointer rounded-[4px] border-0 bg-transparent p-0 text-left decoration-current/40 underline-offset-2 after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] hover:underline"
                    >
                      <span className="block truncate">{post.authorName}</span>
                    </button>
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 truncate text-[13px] leading-tight text-ink-muted">
                    @{post.authorHandle}
                    {date ? ` · ${date}` : ""}
                  </DialogDescription>
                </div>
                <CollectionMarks post={post} />
                {previous !== null || next !== null ? (
                  <span className="flex items-center max-sm:hidden">
                    <button
                      type="button"
                      aria-label="Previous post"
                      aria-keyshortcuts="k"
                      title="Previous post (k)"
                      disabled={previous === null}
                      onClick={() => previous !== null && void controller.open({ payload: previous })}
                      className={`${iconButton} disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent`}
                    >
                      <ChevronUp aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="Next post"
                      aria-keyshortcuts="j"
                      title="Next post (j)"
                      disabled={next === null}
                      onClick={() => next !== null && void controller.open({ payload: next })}
                      className={`${iconButton} disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent`}
                    >
                      <ChevronDown aria-hidden="true" />
                    </button>
                  </span>
                ) : null}
                <DialogClose aria-label="Close" className={iconButton}>
                  <X aria-hidden="true" />
                </DialogClose>
              </header>

              <div
                key={post.id}
                // Picking a suggestion replaces the row that had focus, so focus returns to the dialog instead of the page.
                ref={(node) => {
                  if (node && document.activeElement === document.body) node.closest<HTMLElement>("[data-slot=dialog-content]")?.focus();
                }}
                className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain px-5 py-5"
              >
                {post.text ? (
                  <PostText
                    text={post.text}
                    keyword={keyword}
                    links
                    mentions={{
                      known: isAuthor,
                      select: (handle) => {
                        onShowAuthor(handle);
                        controller.close();
                      },
                    }}
                    className="text-[16px]"
                  />
                ) : null}
                <LinkedPages pages={post.linkedPages} keyword={keyword} />
                {post.quoted ? <Quoted quoted={post.quoted} keyword={keyword} /> : null}
                <MediaGrid media={post.media} />
                <ul className="flex flex-wrap items-center gap-1.5">
                  {chips.map((chip) => {
                    const topic = topicsById.get(chip.topicId);
                    if (!topic) return null;
                    return (
                      <li key={chip.topicId} className="flex min-w-0">
                        <TopicChip
                          name={topic.name}
                          possible={chip.possible}
                          active={activeTopicIds.includes(chip.topicId)}
                          onSelect={() => {
                            onSelectTopic(chip.topicId);
                            controller.close();
                          }}
                        />
                      </li>
                    );
                  })}
                  <li className="flex">
                    <PopoverTrigger
                      controller={topicsEditor}
                      payload={post.id}
                      className="focus-ring pressable inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-transparent px-2.5 text-[12px] font-semibold text-ink-muted shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-sunken hover:text-ink data-open:bg-sunken data-open:text-ink"
                    >
                      <Tags className="size-3.5" aria-hidden="true" />
                      Edit topics
                    </PopoverTrigger>
                  </li>
                </ul>
                {similar.length > 0 ? (
                  <section aria-label="More like this" className="flex flex-col gap-1.5 border-t border-line pt-4">
                    <h3 className="text-eyebrow text-ink-muted">More like this</h3>
                    <ul className="-mx-2.5 flex flex-col">
                      {similar.map((other) => (
                        <PostRow key={other.id} post={other} dialog={controller} />
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>

              <footer className="flex flex-wrap items-center gap-2 border-t border-line bg-canvas px-5 py-3.5">
                {post.likeCount > 0 ? (
                  <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink-muted tabular-nums">
                    <Heart className="size-4" aria-hidden="true" />
                    {compactCount(post.likeCount)}
                    <span className="sr-only"> likes on X</span>
                  </span>
                ) : null}
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    aria-label="Remove from corpus"
                    disabled={removing}
                    onClick={() => {
                      // The removed post's card goes away, so focus returns to where the dialog was opened from.
                      stepped.current = false;
                      startRemoving(() => onRemove(post));
                    }}
                    className={`${dangerButton} max-sm:px-2.5`}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    <span className="max-sm:hidden">Remove from corpus</span>
                  </Button>
                  <Button onClick={() => onCopyLink(post)} className="pressable focus-ring h-9 gap-1.5 border-0 px-3.5 shadow-card">
                    <Link2 className="size-4 text-ink-muted" aria-hidden="true" />
                    Copy link
                  </Button>
                  <Button
                    data-variant="solid"
                    render={<a href={post.url} target="_blank" rel="noreferrer" />}
                    className="pressable focus-ring h-9 gap-1.5 px-3.5 no-underline"
                  >
                    Open on X
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </footer>
              <PostTopicsEditor align="start" controller={topicsEditor} postsById={postsById} topics={topics} areas={areas} topicsById={topicsById} />
            </>
          );
        }}
      </DialogContent>
    </Dialog>
  );
}
