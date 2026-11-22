"use client";

import { Button } from "@ui-sdk/react/button";
import { Popover, PopoverClose, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@ui-sdk/react/popover";
import { Check, CircleAlert, CircleArrowUp, Copy, ExternalLink, LoaderCircle, RotateCw } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import type { UpdateState } from "@/lib/update-status";

import { SIDE_FOOTER_ROW } from "./sync-status";

const DISMISSED_KEY = "magpie:update-dismissed";
const COPIED_MS = 1_500;
const APPLYING_POLL_MS = 5_000;

type Fetched = UpdateState | null | "unreachable";
type ReleaseUpdate = Extract<UpdateState, { kind: "release" }>;
type CommandUpdate = Extract<UpdateState, { kind: "failed" | "pending" }>;

async function fetchUpdateState(): Promise<Fetched> {
  try {
    const response = await fetch("/api/update-status", { headers: { "Content-Type": "application/json" }, cache: "no-store" });
    return response.ok ? ((await response.json()) as UpdateState | null) : "unreachable";
  } catch {
    return "unreachable";
  }
}

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

function useUpdateState(): { update: UpdateState | null; updated: boolean; dismiss: () => void } {
  const [update, setUpdate] = useState<UpdateState | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);
  const sawApplying = useRef(false);

  useEffect(() => {
    let live = true;
    const check = () =>
      fetchUpdateState().then((next) => {
        if (!live || next === "unreachable") return;
        setDismissed(readDismissed());
        setUpdate(next);
        if (next?.kind === "applying") sawApplying.current = true;
        else if (sawApplying.current && next?.kind !== "failed") setUpdated(true);
      });
    check();
    window.addEventListener("focus", check);
    return () => {
      live = false;
      window.removeEventListener("focus", check);
    };
  }, []);

  const applying = update?.kind === "applying";
  useEffect(() => {
    if (!applying) return;
    let live = true;
    const timer = setInterval(
      () =>
        fetchUpdateState().then((next) => {
          if (!live || next === "unreachable") return;
          setUpdate(next);
          if (next?.kind !== "applying" && next?.kind !== "failed") setUpdated(true);
        }),
      APPLYING_POLL_MS,
    );
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [applying]);

  const dismiss = () => {
    if (update?.kind !== "release") return;
    try {
      window.localStorage.setItem(DISMISSED_KEY, update.latest);
    } catch {}
    setDismissed(update.latest);
  };

  const hidden = update?.kind === "release" && update.latest === dismissed;
  return { update: hidden ? null : update, updated, dismiss };
}

export function useCopied(text: string): [boolean, () => void] {
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

const POPOVER_CONTENT =
  "w-[min(24rem,calc(100vw-1.5rem))] max-w-none origin-(--transform-origin) gap-3 rounded-card border-0 bg-surface p-4 shadow-(--ui-shadow) transition-[opacity,scale] duration-150 ease-out data-starting-style:scale-96 data-starting-style:opacity-0 data-ending-style:scale-96 data-ending-style:opacity-0 motion-reduce:transition-none";

function CommandBlock({ command, children }: { command: string; children?: ReactNode }) {
  const [copied, copy] = useCopied(command);
  return (
    <>
      <code className="block rounded-[10px] bg-wash px-3 py-2.5 font-mono text-[12px] leading-relaxed [overflow-wrap:anywhere] text-ink">{command}</code>
      <div className="flex items-center gap-2">
        <Button onClick={copy} data-variant="solid" className={`${POPOVER_ACTION} border-0 px-4`}>
          {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          {copied ? "Copied" : "Copy command"}
        </Button>
        {children}
      </div>
      <span className="sr-only" role="status">
        {copied ? "Command copied" : ""}
      </span>
    </>
  );
}

function ReleasePopover({ update, onDismiss }: { update: ReleaseUpdate; onDismiss: () => void }) {
  const after = update.autoApplies
    ? "Magpie then rebuilds and restarts itself in the background. The app keeps running until the new version is ready."
    : "Setup rebuilds the app and restarts it when it finishes.";
  return (
    <Popover>
      <PopoverTrigger className={SIDE_FOOTER_ROW}>
        <CircleArrowUp className="size-4 shrink-0 text-side-ink" aria-hidden="true" />
        <span className="min-w-0 truncate font-semibold">Update to {update.latest}</span>
        <span className="ml-auto size-2 shrink-0 rounded-full bg-primary-fill shadow-[0_0_0_3px_color-mix(in_oklch,var(--color-primary)_28%,transparent)]" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent side="right" align="end" sideOffset={12} collisionPadding={12} className={POPOVER_CONTENT}>
        <div>
          <PopoverTitle className="font-display text-[15px] font-semibold text-ink">Magpie {update.latest} is out</PopoverTitle>
          <PopoverDescription className="mt-1 text-[13px] leading-snug text-ink-muted">
            {update.installed ? `You have ${update.installed}. ` : ""}Run this in a terminal. {after}
          </PopoverDescription>
        </div>
        <CommandBlock command={update.command}>
          <a href={update.url} target="_blank" rel="noreferrer" className={`${POPOVER_ACTION} px-3 whitespace-nowrap text-primary-text no-underline hover:bg-wash`}>
            What&apos;s new
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
          <PopoverClose onClick={onDismiss} className={`${POPOVER_ACTION} ml-auto border-0 bg-transparent px-3 font-medium text-ink-muted hover:bg-wash hover:text-ink`}>
            Later
          </PopoverClose>
        </CommandBlock>
      </PopoverContent>
    </Popover>
  );
}

const COMMAND_COPY = {
  pending: {
    row: "Finish updating",
    title: "Your update isn't running yet",
    body: "This checkout has new code, but the app still runs the previous version. Run this in a terminal to rebuild and restart it:",
  },
  failed: {
    row: "Update didn't finish",
    title: "The update after git pull didn't finish",
    body: "The app still runs the previous version. Run this in a terminal to try again and see what went wrong:",
  },
} as const;

function CommandPopover({ update }: { update: CommandUpdate }) {
  const copy = COMMAND_COPY[update.kind];
  const Icon = update.kind === "failed" ? CircleAlert : CircleArrowUp;
  return (
    <Popover>
      <PopoverTrigger className={SIDE_FOOTER_ROW}>
        <Icon className="size-4 shrink-0 text-side-ink" aria-hidden="true" />
        <span className="min-w-0 truncate font-semibold">{copy.row}</span>
        <span className="ml-auto size-2 shrink-0 rounded-full bg-primary-fill shadow-[0_0_0_3px_color-mix(in_oklch,var(--color-primary)_28%,transparent)]" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent side="right" align="end" sideOffset={12} collisionPadding={12} className={POPOVER_CONTENT}>
        <div>
          <PopoverTitle className="font-display text-[15px] font-semibold text-ink">{copy.title}</PopoverTitle>
          <PopoverDescription className="mt-1 text-[13px] leading-snug text-ink-muted">{copy.body}</PopoverDescription>
        </div>
        <CommandBlock command={update.command} />
        {update.kind === "failed" ? (
          <p className="text-[12px] leading-snug text-ink-muted">
            The last attempt is logged in <span className="font-mono [overflow-wrap:anywhere]">{update.log}</span>.
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function ApplyingRow() {
  return (
    <div className={`${SIDE_FOOTER_ROW} cursor-default hover:bg-transparent`} role="status">
      <LoaderCircle className="size-4 shrink-0 animate-spin text-side-ink motion-reduce:animate-none" aria-hidden="true" />
      <span className="min-w-0 truncate font-semibold">Updating Magpie…</span>
    </div>
  );
}

function UpdatedRow() {
  return (
    <Button onClick={() => window.location.reload()} className={SIDE_FOOTER_ROW}>
      <RotateCw className="size-4 shrink-0 text-side-ink" aria-hidden="true" />
      <span className="min-w-0 truncate font-semibold">Magpie updated · Reload</span>
    </Button>
  );
}

export function UpdateNotice() {
  const { update, updated, dismiss } = useUpdateState();
  if (update?.kind === "applying") return <ApplyingRow />;
  if (update?.kind === "failed" || update?.kind === "pending") return <CommandPopover update={update} />;
  if (updated) return <UpdatedRow />;
  if (update?.kind === "release") return <ReleasePopover update={update} onDismiss={dismiss} />;
  return null;
}
