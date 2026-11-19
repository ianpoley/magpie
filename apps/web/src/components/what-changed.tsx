"use client";

import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  createAlertDialogController,
} from "@ui-sdk/react/alert-dialog";
import { createDialogController, Dialog, DialogBackdrop, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@ui-sdk/react/dialog";
import { Undo2, X } from "lucide-react";
import { useState, useTransition } from "react";

import { listUndo, undoChange } from "@/app/actions";
import type { Change, UndoStep } from "@/lib/types";

import { formatCount, formatDate, plural } from "./format";
import { runAction } from "./run-action";
import { alertBackdrop, alertContent, dialogContent, iconButton, primaryAnswer, quietAnswer, softButton } from "./styles";

export const createWhatChangedController = () => createDialogController();
export type WhatChangedController = ReturnType<typeof createWhatChangedController>;

type Reversal = { changeId: number; steps: UndoStep[] };

function Detail({ createdAt, postCount, undone = false }: { createdAt: string; postCount: number; undone?: boolean }) {
  return (
    <p className="mt-1 text-[12px] text-ink-muted tabular-nums">
      {formatDate(createdAt)} · {formatCount(postCount)} {plural(postCount, "post")}
      {undone ? " · undone" : ""}
    </p>
  );
}

function Changes({ changes }: { changes: Change[] }) {
  const [confirm] = useState(() => createAlertDialogController<Reversal>());
  const [asking, startAsking] = useTransition();

  const ask = (change: Change) =>
    startAsking(async () => {
      const found = await runAction(listUndo(change.id));
      if (found) void confirm.open({ payload: { changeId: change.id, steps: found.changes } });
    });

  return (
    <>
      <ol className="min-h-0 divide-y divide-line overflow-y-auto overscroll-contain">
        {changes.map((change) => (
          <li key={change.id} className="flex items-start gap-3 px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <p className={`text-[14px] leading-snug text-ink ${change.undoneAt ? "line-through decoration-ink-muted" : ""}`}>{change.summary}</p>
              <Detail createdAt={change.createdAt} postCount={change.postCount} undone={change.undoneAt !== null} />
            </div>
            {change.undoable ? (
              <button
                type="button"
                disabled={asking}
                onClick={() => ask(change)}
                aria-label={`Undo: ${change.summary}`}
                className={softButton}
              >
                <Undo2 className="size-3.5" aria-hidden="true" />
                Undo
              </button>
            ) : null}
          </li>
        ))}
      </ol>

      <AlertDialog controller={confirm}>
        <AlertDialogBackdrop className={alertBackdrop} />
        <AlertDialogContent<Reversal> className={alertContent}>
          {(state) => {
            const reversal = state.payload;
            if (!reversal) return <AlertDialogTitle className="sr-only">Undo</AlertDialogTitle>;
            const several = reversal.steps.length > 1;
            return (
              <>
                <AlertDialogTitle className="text-display text-[20px]">
                  {several ? `Undo these ${reversal.steps.length} changes?` : "Undo this change?"}
                </AlertDialogTitle>
                <AlertDialogDescription className="mt-2 text-[14px] leading-[1.55] text-pretty text-ink-muted">
                  {several ? "Later changes built on the same topics, so they are undone with it, newest first. " : ""}
                  Topics go back to how they were, with their posts, and this is not suggested again.
                </AlertDialogDescription>
                <ol className="mt-4 max-h-[40dvh] divide-y divide-line overflow-y-auto overscroll-contain rounded-inner bg-canvas px-3.5">
                  {reversal.steps.map((step) => (
                    <li key={step.id} className="py-2.5">
                      <p className="text-[13px] leading-snug font-medium text-ink">{step.summary}</p>
                      <Detail createdAt={step.createdAt} postCount={step.postCount} />
                      {step.restores.length > 0 ? <p className="mt-1 text-[12px] text-ink-muted">Brings back {step.restores.join(", ")}, which you merged in.</p> : null}
                    </li>
                  ))}
                </ol>
                <div className="mt-5 flex justify-end gap-2">
                  <AlertDialogClose className={quietAnswer}>Keep</AlertDialogClose>
                  <AlertDialogClose
                    value="confirm"
                    className={primaryAnswer}
                    action={async () => {
                      await runAction(undoChange(reversal.changeId));
                    }}
                  >
                    {several ? "Undo all" : "Undo"}
                  </AlertDialogClose>
                </div>
              </>
            );
          }}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function WhatChanged({ controller, changes }: { controller: WhatChangedController; changes: Change[] }) {
  return (
    <Dialog controller={controller}>
      <DialogBackdrop />
      <DialogContent initialFocus="content" className={`w-[min(32rem,calc(100%-1.5rem))] ${dialogContent}`}>
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-display text-[20px]">What changed</DialogTitle>
            <DialogDescription className="mt-1 text-[13px] text-ink-muted">Every change the categories made on their own.</DialogDescription>
          </div>
          <DialogClose aria-label="Close" className={iconButton}>
            <X aria-hidden="true" />
          </DialogClose>
        </header>
        {changes.length === 0 ? (
          <p className="px-5 py-10 text-center text-[14px] text-ink-muted">Nothing yet. New topics and splits are listed here as they happen.</p>
        ) : (
          <Changes changes={changes} />
        )}
      </DialogContent>
    </Dialog>
  );
}
