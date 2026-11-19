"use client";

import { createDialogController, Dialog, DialogBackdrop, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@ui-sdk/react/dialog";
import { ExternalLink, Undo2, X } from "lucide-react";
import { useTransition } from "react";

import type { RemovedPost } from "@/lib/types";

import { AuthorAvatar } from "./author-avatar";
import { formatDate } from "./format";
import { dialogContent, iconButton, softButton } from "./styles";

export const createRemovedPostsController = () => createDialogController();
export type RemovedPostsController = ReturnType<typeof createRemovedPostsController>;

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
        {post.text ? <p className="mt-1 line-clamp-2 text-[14px] leading-snug break-words text-ink">{post.text}</p> : null}
      </div>
      <a href={post.url} target="_blank" rel="noreferrer" aria-label={`Open the post by ${post.authorName} on X`} className={iconButton}>
        <ExternalLink aria-hidden="true" />
      </a>
      <button
        type="button"
        disabled={restoring}
        onClick={() => startRestoring(() => onRestore(post.id))}
        aria-label={`Restore the post by ${post.authorName}`}
        className={softButton}
      >
        <Undo2 className="size-3.5" aria-hidden="true" />
        {restoring ? "Restoring…" : "Restore"}
      </button>
    </li>
  );
}

export function RemovedPosts({
  controller,
  posts,
  onRestore,
}: {
  controller: RemovedPostsController;
  posts: RemovedPost[];
  onRestore: (postId: string) => Promise<void>;
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
          <ul className="min-h-0 divide-y divide-line overflow-y-auto overscroll-contain">
            {posts.map((post) => (
              <Row key={post.id} post={post} onRestore={onRestore} />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
