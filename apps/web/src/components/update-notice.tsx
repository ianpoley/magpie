"use client";

import { Button } from "@ui-sdk/react/button";
import { Popover, PopoverClose, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@ui-sdk/react/popover";
import { Check, CircleArrowUp, Copy, ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { UpdateState } from "@/lib/update-status";

import { SIDE_FOOTER_ROW } from "./sync-status";

const DISMISSED_KEY = "magpie:update-dismissed";
const COPIED_MS = 1_500;

async function fetchUpdateState(): Promise<UpdateState | null> {
  try {
    const response = await fetch("/api/update-status", { headers: { "Content-Type": "application/json" }, cache: "no-store" });
    return response.ok ? ((await response.json()) as UpdateState | null) : null;
  } catch {
    return null;
  }
}

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

function useUpdateState(): [UpdateState | null, () => void] {
  const [update, setUpdate] = useState<UpdateState | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const check = () =>
      fetchUpdateState().then((next) => {
        if (!live) return;
        setDismissed(readDismissed());
        setUpdate(next);
      });
    check();
    window.addEventListener("focus", check);
    return () => {
      live = false;
      window.removeEventListener("focus", check);
    };
  }, []);

  const dismiss = () => {
    if (!update) return;
    try {
      window.localStorage.setItem(DISMISSED_KEY, update.latest);
    } catch {}
    setDismissed(update.latest);
  };

  return [update && update.latest !== dismissed ? update : null, dismiss];
}

function useCopied(text: string): [boolean, () => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = () =>
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPIED_MS);
      },
      () => setCopied(false),
    );
  return [copied, copy];
}

const POPOVER_ACTION = "pressable inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full text-[13px] font-semibold pointer-coarse:h-11";

function UpdatePopover({ update, onDismiss }: { update: UpdateState; onDismiss: () => void }) {
  const [copied, copy] = useCopied(update.command);

  return (
    <Popover>
      <PopoverTrigger className={SIDE_FOOTER_ROW}>
        <CircleArrowUp className="size-4 shrink-0 text-side-ink" aria-hidden="true" />
        <span className="min-w-0 truncate font-semibold">Update to {update.latest}</span>
        <span className="ml-auto size-2 shrink-0 rounded-full bg-primary-fill shadow-[0_0_0_3px_color-mix(in_oklch,var(--color-primary)_28%,transparent)]" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="end"
        sideOffset={12}
        collisionPadding={12}
        className="w-[min(24rem,calc(100vw-1.5rem))] max-w-none origin-(--transform-origin) gap-3 rounded-card border-0 bg-surface p-4 shadow-(--ui-shadow) transition-[opacity,scale] duration-150 ease-out data-starting-style:scale-96 data-starting-style:opacity-0 data-ending-style:scale-96 data-ending-style:opacity-0 motion-reduce:transition-none"
      >
        <div>
          <PopoverTitle className="font-display text-[15px] font-semibold text-ink">Magpie {update.latest} is out</PopoverTitle>
          <PopoverDescription className="mt-1 text-[13px] leading-snug text-ink-muted">
            {update.installed ? `You have ${update.installed}. ` : ""}Run this in a terminal. Setup rebuilds the app when it finishes.
          </PopoverDescription>
        </div>
        <code className="block rounded-[10px] bg-wash px-3 py-2.5 font-mono text-[12px] leading-relaxed [overflow-wrap:anywhere] text-ink">{update.command}</code>
        <div className="flex items-center gap-2">
          <Button onClick={copy} data-variant="solid" className={`${POPOVER_ACTION} border-0 px-4`}>
            {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            {copied ? "Copied" : "Copy command"}
          </Button>
          <a href={update.url} target="_blank" rel="noreferrer" className={`${POPOVER_ACTION} px-3 whitespace-nowrap text-primary-text no-underline hover:bg-wash`}>
            What&apos;s new
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
          <PopoverClose onClick={onDismiss} className={`${POPOVER_ACTION} ml-auto border-0 bg-transparent px-3 font-medium text-ink-muted hover:bg-wash hover:text-ink`}>
            Later
          </PopoverClose>
        </div>
        <span className="sr-only" role="status">
          {copied ? "Update command copied" : ""}
        </span>
      </PopoverContent>
    </Popover>
  );
}

export function UpdateNotice() {
  const [update, dismiss] = useUpdateState();
  return update ? <UpdatePopover update={update} onDismiss={dismiss} /> : null;
}
