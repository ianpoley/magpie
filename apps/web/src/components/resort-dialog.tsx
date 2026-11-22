"use client";

import { Dialog, DialogBackdrop, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@ui-sdk/react/dialog";
import { Eye, EyeOff, LoaderCircle, type LucideIcon } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { applyFocusChange, previewFocusChange } from "@/app/actions";
import type { ResortArea, ResortPreview } from "@/lib/types";

import { formatCount, plural } from "./format";
import { alertBackdrop, dialogContent, primaryAnswer, quietAnswer } from "./styles";

export type ResortOutcome = { changed: number; skipped: number };

type Preview = { status: "loading" } | { status: "ready"; preview: ResortPreview } | { status: "failed"; message: string };

const FAILED_PREVIEW = "The re-sort didn't run, so no category changed. Your new setting is saved.";

function AreaList({ title, icon: Icon, areas }: { title: string; icon: LucideIcon; areas: ResortArea[] }) {
  if (areas.length === 0) return null;
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="flex items-center gap-1.5 text-eyebrow text-ink-muted">
        <Icon className="size-3.5" aria-hidden="true" />
        {title} · <span className="tabular-nums">{formatCount(areas.length)}</span>
      </h3>
      <ul className="m-0 flex list-none flex-col divide-y divide-line rounded-inner bg-canvas p-0 px-3.5">
        {areas.map((area) => (
          <li key={area.id} className="py-2 text-[14px] leading-snug text-ink">
            {area.name}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ResortBody({ onApplied }: { onApplied: (outcome: ResortOutcome) => void }) {
  const [preview, setPreview] = useState<Preview>({ status: "loading" });
  const [applyFailure, setApplyFailure] = useState<string | null>(null);
  const [applying, startApplying] = useTransition();

  useEffect(() => {
    let live = true;
    previewFocusChange().then(
      (result) => {
        if (!live) return;
        setPreview(result.ok ? { status: "ready", preview: { toHide: result.toHide, toShow: result.toShow } } : { status: "failed", message: result.message });
      },
      () => {
        if (live) setPreview({ status: "failed", message: FAILED_PREVIEW });
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const apply = (ready: ResortPreview) => {
    setApplyFailure(null);
    startApplying(async () => {
      try {
        const result = await applyFocusChange({ toHide: ready.toHide.map(({ id }) => ({ id })), toShow: ready.toShow.map(({ id }) => ({ id })) });
        if (!result.ok) return setApplyFailure(result.message);
        onApplied({ changed: result.changed, skipped: result.skipped });
      } catch {
        setApplyFailure("The re-sort could not be applied. Try again.");
      }
    });
  };

  const header = (description: string) => (
    <header className="px-5 pt-5 pb-4">
      <DialogTitle className="text-display text-[20px]">Re-sort your categories?</DialogTitle>
      <DialogDescription className="mt-1.5 text-[13px] leading-[1.5] text-pretty text-ink-muted">{description}</DialogDescription>
    </header>
  );

  if (preview.status === "loading") {
    return (
      <>
        {header("Your new setting is saved. Checking which existing categories it would change.")}
        <p role="status" className="flex items-center gap-2 px-5 pb-2 text-[14px] text-ink-muted">
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Checking your categories…
        </p>
        <footer className="flex justify-end gap-2 px-5 pt-3 pb-5">
          <DialogClose className={quietAnswer}>Skip</DialogClose>
        </footer>
      </>
    );
  }

  if (preview.status === "failed") {
    return (
      <>
        {header("Existing categories stay as they are. New ones follow your new setting.")}
        <p role="alert" className="mx-5 rounded-inner bg-like-soft px-3 py-2.5 text-[13px] leading-snug text-like-text">
          {preview.message}
        </p>
        <footer className="flex justify-end gap-2 px-5 pt-4 pb-5">
          <DialogClose className={quietAnswer}>Close</DialogClose>
        </footer>
      </>
    );
  }

  const ready = preview.preview;
  const total = ready.toHide.length + ready.toShow.length;
  if (total === 0) {
    return (
      <>
        <header className="px-5 pt-5 pb-4">
          <DialogTitle className="text-display text-[20px]">Nothing to change</DialogTitle>
          <DialogDescription className="mt-1.5 text-[13px] leading-[1.5] text-pretty text-ink-muted">
            Your new setting is saved, and every existing category already matches it.
          </DialogDescription>
        </header>
        <footer className="flex justify-end gap-2 px-5 pb-5">
          <DialogClose className={primaryAnswer}>Close</DialogClose>
        </footer>
      </>
    );
  }

  return (
    <>
      {header("Your new setting is saved. Apply it to existing categories too? Categories you showed or hid yourself stay as they are.")}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 pb-1">
        <AreaList title="Will be hidden" icon={EyeOff} areas={ready.toHide} />
        <AreaList title="Will be shown" icon={Eye} areas={ready.toShow} />
      </div>
      {applyFailure ? (
        <p role="alert" className="mx-5 mt-3 text-[13px] leading-snug text-like-text">
          {applyFailure}
        </p>
      ) : null}
      <footer className="flex justify-end gap-2 border-t border-line px-5 pt-4 pb-5 mt-3">
        <DialogClose disabled={applying} className={quietAnswer}>
          Skip
        </DialogClose>
        <button type="button" disabled={applying} onClick={() => apply(ready)} className={primaryAnswer}>
          {applying ? "Applying…" : `Apply to ${formatCount(total)} ${plural(total, "category", "categories")}`}
        </button>
      </footer>
    </>
  );
}

export function ResortDialog({ open, onOpenChange, onApplied }: { open: boolean; onOpenChange: (open: boolean) => void; onApplied: (outcome: ResortOutcome) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogBackdrop className={alertBackdrop} />
      <DialogContent initialFocus="content" className={`flex max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100%-1.5rem))] flex-col ${dialogContent}`}>
        <ResortBody
          onApplied={(outcome) => {
            onApplied(outcome);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
