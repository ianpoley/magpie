"use client";

import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
  createAlertDialogController,
} from "@ui-sdk/react/alert-dialog";
import { Button } from "@ui-sdk/react/button";
import { createDialogController, Dialog, DialogBackdrop, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@ui-sdk/react/dialog";
import { ExternalLink, Trash2, Undo2, X } from "lucide-react";
import { useTransition } from "react";

import { shortenUrls } from "@/lib/post-links";
import type { Post, RemovedPost } from "@/lib/types";

import { AuthorAvatar } from "./author-avatar";
import { formatCount, formatDate, plural } from "./format";
import { alertBackdrop, alertContent, dangerAnswer, dangerButton, dialogContent, iconButton, quietAnswer, softButton } from "./styles";

export const createRemovedPostsController = () => createDialogController();
export type RemovedPostsController = ReturnType<typeof createRemovedPostsController>;

export const createConfirmRemoveController = () => createAlertDialogController<Post>();
export type ConfirmRemoveController = ReturnType<typeof createConfirmRemoveController>;

export function ConfirmRemove({
  controller,
  onConfirm,
  focusAfter,
}: {
  controller: ConfirmRemoveController;
  onConfirm: (post: Post) => Promise<void>;
  focusAfter: () => HTMLElement | undefined;
}) {
  return (
    <AlertDialog controller={controller}>
      <AlertDialogBackdrop className={alertBackdrop} />
      <AlertDialogContent<Post> className={alertContent} finalFocus={focusAfter}>
        {(state) => {
          const post = state.payload;
          if (!post) return <AlertDialogTitle className="sr-only">Remove post</AlertDialogTitle>;
          return (
            <>
              <AlertDialogTitle className="text-display text-[20px]">Remove this post?</AlertDialogTitle>
              <AlertDialogDescription className="mt-2 text-[14px] leading-[1.55] text-pretty text-ink-muted">
                {post.authorName}’s post leaves Magpie and won’t come back on sync. It stays bookmarked or liked on X, and you can restore it from Removed.
              </AlertDialogDescription>
              <div className="mt-5 flex justify-end gap-2">
                <AlertDialogClose className={quietAnswer}>Keep</AlertDialogClose>
                <AlertDialogClose value="confirm" className={dangerAnswer} action={() => onConfirm(post)}>
                  Remove
                </AlertDialogClose>
              </div>
            </>
          );
        }}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Row({ post, onRestore }: { post: RemovedPost; onRestore: (postId: string) => Promise<void> }) {
  const [restoring, startRestoring] = useTransition();
  const date = formatDate(post.createdAt);
  return (
    <li className="flex items-start gap-3 px-5 py-3.5">
      <AuthorAvatar handle={post.authorHandle} name={post.authorName} url={post.authorAvatarUrl} size="sm" ring={false} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] leading-tight text-ink-muted">
          <span className="font-semibold text-ink">{post.authorName}</span> · @{post.authorHandle}
          {date ? ` · ${date}` : ""}
        </p>
        {post.text ? <p className="mt-1 line-clamp-2 text-[14px] leading-snug break-words text-ink">{shortenUrls(post.text)}</p> : null}
      </div>
      <a href={post.url} target="_blank" rel="noreferrer" aria-label={`Open the post by ${post.authorName} on X`} className={iconButton}>
        <ExternalLink aria-hidden="true" />
      </a>
      <button
        type="button"
        disabled={restoring}
        data-restore=""
        onClick={(event) => {
          const row = event.currentTarget.closest("li");
          const neighbor = (row?.nextElementSibling ?? row?.previousElementSibling)?.querySelector<HTMLElement>("[data-restore]");
          const after = neighbor ?? row?.closest("[role=dialog]")?.querySelector<HTMLElement>("[data-removed-close]");
          const focusOnceGone = (framesLeft: number) => {
            if (!row?.isConnected) after?.focus();
            else if (framesLeft > 0) requestAnimationFrame(() => focusOnceGone(framesLeft - 1));
          };
          startRestoring(async () => {
            await onRestore(post.id);
            focusOnceGone(60);
          });
        }}
        aria-label={`Restore the post by ${post.authorName}`}
        className={softButton}
      >
        <Undo2 className="size-3.5" aria-hidden="true" />
        {restoring ? "Restoring…" : "Restore"}
      </button>
    </li>
  );
}

function EmptyRemoved({ count, onEmpty }: { count: number; onEmpty: () => Promise<void> }) {
  const posts = `${formatCount(count)} ${plural(count, "post")}`;
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button />} className={dangerButton}>
        <Trash2 className="size-4" aria-hidden="true" />
        Empty Removed
      </AlertDialogTrigger>
      <AlertDialogBackdrop className={alertBackdrop} />
      <AlertDialogContent className={alertContent}>
        <AlertDialogTitle className="text-display text-[20px]">Empty Removed?</AlertDialogTitle>
        <AlertDialogDescription className="mt-2 text-[14px] leading-[1.55] text-pretty text-ink-muted">
          {posts} leave this list for good. You can’t restore them afterwards, and syncing won’t bring them back, even though they stay bookmarked or liked on X.
        </AlertDialogDescription>
        <div className="mt-5 flex justify-end gap-2">
          <AlertDialogClose className={quietAnswer}>Keep them</AlertDialogClose>
          <AlertDialogClose
            value="confirm"
            className={dangerAnswer}
            action={onEmpty}
          >
            Empty {posts}
          </AlertDialogClose>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function RemovedPosts({
  controller,
  posts,
  onRestore,
  onEmpty,
}: {
  controller: RemovedPostsController;
  posts: RemovedPost[];
  onRestore: (postId: string) => Promise<void>;
  onEmpty: () => Promise<void>;
}) {
  return (
    <Dialog controller={controller}>
      <DialogBackdrop />
      <DialogContent initialFocus="[data-removed-close]" className={`w-[min(34rem,calc(100%-1.5rem))] ${dialogContent}`}>
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-display text-[20px]">Removed</DialogTitle>
            <DialogDescription className="mt-1 text-[13px] text-ink-muted">
              Posts you took out of this corpus. They are still bookmarked or liked on X.
            </DialogDescription>
          </div>
          <DialogClose data-removed-close aria-label="Close" className={iconButton}>
            <X aria-hidden="true" />
          </DialogClose>
        </header>
        {posts.length === 0 ? (
          <p className="px-5 py-10 text-center text-[14px] text-ink-muted">Nothing is removed.</p>
        ) : (
          <>
            <ul className="min-h-0 divide-y divide-line overflow-y-auto overscroll-contain">
              {posts.map((post) => (
                <Row key={post.id} post={post} onRestore={onRestore} />
              ))}
            </ul>
            <footer className="flex items-center gap-3 border-t border-line bg-canvas px-5 py-3.5">
              <p className="text-[13px] text-ink-muted tabular-nums">
                {formatCount(posts.length)} {plural(posts.length, "post")}
              </p>
              <span className="ml-auto">
                <EmptyRemoved count={posts.length} onEmpty={onEmpty} />
              </span>
            </footer>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
