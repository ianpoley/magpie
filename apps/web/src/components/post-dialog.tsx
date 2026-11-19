"use client";

import { Button } from "@ui-sdk/react/button";
import { Dialog, DialogBackdrop, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@ui-sdk/react/dialog";
import { PopoverTrigger } from "@ui-sdk/react/popover";
import { ExternalLink, Heart, Link2, Tags, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";

import { authorHue } from "@/lib/author-hues";
import type { Area, Chip, Post, Topic } from "@/lib/types";

import { AuthorAvatar } from "./author-avatar";
import { compactCount, formatDate } from "./format";
import { MediaGrid, PostText, Quoted } from "./post-body";
import { CollectionMarks, type PostDialogController } from "./post-card";
import { createPostTopicsController, PostTopicsEditor } from "./post-topics-editor";
import { dangerButton, iconButton } from "./styles";
import { TopicChip } from "./topic-chip";

const CONTENT =
  "w-[min(42rem,calc(100%-1.5rem))] gap-0 overflow-hidden rounded-[20px] border-0 p-0 data-starting-style:translate-y-3 data-starting-style:scale-[0.97] data-ending-style:scale-[0.97]";

/** The one post dialog on the screen. Cards and "Surprise me" open it with a post id. */
export function PostDialog({
  controller,
  postsById,
  topics,
  areas,
  topicsById,
  chipsFor,
  activeTopicIds,
  keyword,
  onSelectTopic,
  onCopyLink,
  onRemove,
}: {
  controller: PostDialogController;
  postsById: Map<string, Post>;
  topics: Topic[];
  areas: Area[];
  topicsById: Map<number, Topic>;
  chipsFor: (post: Post) => Chip[];
  activeTopicIds: number[];
  keyword: string;
  onSelectTopic: (topicId: number) => void;
  onCopyLink: (post: Post) => void;
  onRemove: (post: Post) => Promise<void>;
}) {
  const [topicsEditor] = useState(createPostTopicsController);
  const [removing, startRemoving] = useTransition();
  return (
    <Dialog controller={controller}>
      <DialogBackdrop />
      <DialogContent<string> initialFocus="content" className={CONTENT}>
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
          return (
            <>
              <header className="flex items-center gap-3 border-b border-line px-5 py-4">
                <AuthorAvatar handle={post.authorHandle} name={post.authorName} url={post.authorAvatarUrl} size="lg" />
                <div className="min-w-0 flex-1">
                  <DialogTitle className="truncate text-[17px] leading-tight font-bold" style={{ color: hue.fg }}>
                    {post.authorName}
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 truncate text-[13px] leading-tight text-ink-muted">
                    @{post.authorHandle}
                    {date ? ` · ${date}` : ""}
                  </DialogDescription>
                </div>
                <CollectionMarks post={post} />
                <DialogClose aria-label="Close" className={iconButton}>
                  <X aria-hidden="true" />
                </DialogClose>
              </header>

              <div className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain px-5 py-5">
                {post.text ? <PostText text={post.text} keyword={keyword} links className="text-[16px]" /> : null}
                {post.quoted ? <Quoted quoted={post.quoted} keyword={keyword} full /> : null}
                <MediaGrid media={post.media} full />
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
                  <Button aria-label="Remove from corpus" disabled={removing} onClick={() => startRemoving(() => onRemove(post))} className={`${dangerButton} max-sm:px-2.5`}>
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
