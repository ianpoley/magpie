"use client";

import { createDialogController, Dialog, DialogBackdrop, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@ui-sdk/react/dialog";
import { X } from "lucide-react";

import type { Change } from "@/lib/types";

import { formatCount, formatDate, plural } from "./format";
import { iconButton } from "./styles";

export const createWhatChangedController = () => createDialogController();
export type WhatChangedController = ReturnType<typeof createWhatChangedController>;

/** The log of category changes, newest first. */
export function WhatChanged({ controller, changes }: { controller: WhatChangedController; changes: Change[] }) {
  return (
    <Dialog controller={controller}>
      <DialogBackdrop />
      <DialogContent
        initialFocus="content"
        className="w-[min(32rem,calc(100%-1.5rem))] gap-0 overflow-hidden rounded-[20px] border-0 p-0 data-starting-style:translate-y-3 data-starting-style:scale-[0.97] data-ending-style:scale-[0.97]"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-display text-[20px]">What changed</DialogTitle>
            <DialogDescription className="mt-1 text-[13px] text-ink-muted">
              Every change the categories made on their own.
            </DialogDescription>
          </div>
          <DialogClose aria-label="Close" className={iconButton}>
            <X aria-hidden="true" />
          </DialogClose>
        </header>
        {changes.length === 0 ? (
          <p className="px-5 py-10 text-center text-[14px] text-ink-muted">
            Nothing yet. New topics and splits are listed here as they happen.
          </p>
        ) : (
          <ol className="min-h-0 divide-y divide-line overflow-y-auto overscroll-contain">
            {changes.map((change) => (
              <li key={change.id} className="px-5 py-3.5">
                <p className={`text-[14px] leading-snug text-ink ${change.undoneAt ? "line-through decoration-ink-muted" : ""}`}>
                  {change.summary}
                </p>
                <p className="mt-1 text-[12px] text-ink-muted tabular-nums">
                  {formatDate(change.createdAt)} · {formatCount(change.postCount)} {plural(change.postCount, "post")}
                  {change.undoneAt ? " · undone" : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
