"use client";

import { Dialog, DialogBackdrop, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@ui-sdk/react/dialog";
import { Input } from "@ui-sdk/react/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui-sdk/react/select";
import { Switch, SwitchThumb } from "@ui-sdk/react/switch";
import { Bug, Check, ChevronDown, Link, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { DebugFlagDefinition } from "@/lib/debug-flags/types";

import { dialogContent, iconButton, menuItem, popupList, textField } from "../styles";
import { useSetDebugFlag } from "./client";
import { useRegisteredDebugFlags } from "./registry";

const OFF = "";
const COPIED_MS = 1_500;
const LAUNCHER =
  "focus-ring pressable fixed right-4 bottom-4 z-40 flex size-10 cursor-pointer items-center justify-center rounded-full border-0 bg-surface p-0 text-ink-muted shadow-(--ui-shadow) hover:text-ink pointer-coarse:size-11";
const FIELD = "h-8 w-36 px-3";

const useHydrated = () => useSyncExternalStore(() => () => {}, () => true, () => false);

function FlagControl({ flag, raw, present, onSet }: { flag: DebugFlagDefinition; raw: string; present: boolean; onSet: (value: string | null) => void }) {
  const control = flag.control;
  if (!control || control.type === "boolean") {
    return (
      <Switch aria-label={flag.label} checked={present} onCheckedChange={(checked) => onSet(checked ? "" : null)}>
        <SwitchThumb />
      </Switch>
    );
  }
  if (control.type === "enum") {
    return (
      <Select<string> value={present && control.options.includes(raw) ? raw : OFF} onValueChange={(next) => onSet(next === null || next === OFF ? null : next)}>
        <SelectTrigger aria-label={flag.label} className={`${textField} ${FIELD} flex items-center justify-between gap-1 bg-surface text-[13px]`}>
          <SelectValue placeholder="Off" />
          <ChevronDown className="size-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
        </SelectTrigger>
        <SelectContent sideOffset={6} className={`${popupList} w-44`}>
          <SelectItem value={OFF} label="Off" className={menuItem}>
            Off
          </SelectItem>
          {control.options.map((option) => (
            <SelectItem key={option} value={option} label={option} className={menuItem}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return (
    <Input
      aria-label={flag.label}
      type={control.type === "number" ? "number" : "text"}
      inputMode={control.type === "number" ? "numeric" : undefined}
      min={control.type === "number" ? control.min : undefined}
      max={control.type === "number" ? control.max : undefined}
      step={control.type === "number" ? control.step : undefined}
      autoComplete="off"
      value={raw}
      onValueChange={(next) => onSet(next === "" ? null : next)}
      className={`${textField} ${FIELD}`}
    />
  );
}

function FlagRow({ flag }: { flag: DebugFlagDefinition }) {
  const params = useSearchParams();
  const { setFlag, linkTo } = useSetDebugFlag();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const present = params.has(flag.key);
  const raw = params.get(flag.key) ?? "";
  const copy = () =>
    navigator.clipboard.writeText(linkTo(flag.key, raw)).then(
      () => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPIED_MS);
      },
      () => {},
    );

  return (
    <li className="flex items-start gap-3 px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-ink">{flag.label}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-pretty text-ink-muted">{flag.description}</p>
        <code className="mt-1.5 inline-block rounded-[6px] bg-sunken px-1.5 py-0.5 font-mono text-[12px] text-ink-muted">?{flag.key}</code>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <FlagControl flag={flag} raw={raw} present={present} onSet={(value) => setFlag(flag.key, value)} />
        <button type="button" disabled={!present} onClick={copy} aria-label={`Copy a link to ${flag.label}`} className={`${iconButton} disabled:cursor-default disabled:opacity-40`}>
          {copied ? <Check aria-hidden="true" /> : <Link aria-hidden="true" />}
        </button>
      </div>
    </li>
  );
}

export function DebugFlagsLauncher() {
  const sets = useRegisteredDebugFlags();
  const hydrated = useHydrated();
  const params = useSearchParams();
  const flags = sets.flatMap((set) => Object.values(set));
  if (!hydrated || flags.length === 0) return null;
  const on = flags.filter((flag) => params.has(flag.key)).length;

  return (
    <Dialog>
      <DialogTrigger aria-label={on > 0 ? `Debug flags, ${on} on` : "Debug flags"} className={LAUNCHER}>
        <Bug className="size-4.5" aria-hidden="true" />
        {on > 0 ? (
          <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 flex size-4.5 items-center justify-center rounded-full bg-primary-fill text-[11px] font-bold text-on-primary tabular-nums">
            {on}
          </span>
        ) : null}
      </DialogTrigger>
      <DialogBackdrop />
      <DialogContent className={`w-[min(36rem,calc(100%-1.5rem))] ${dialogContent}`}>
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-display text-[20px]">Debug flags</DialogTitle>
            <DialogDescription className="mt-1 text-[13px] text-ink-muted">
              Fake a hard-to-reach state on this page. Flags live in the address, so a link brings the state back. Local development only.
            </DialogDescription>
          </div>
          <DialogClose aria-label="Close" className={iconButton}>
            <X aria-hidden="true" />
          </DialogClose>
        </header>
        <ul className="min-h-0 divide-y divide-line overflow-y-auto overscroll-contain">
          {flags.map((flag) => (
            <FlagRow key={`${flag.routeId}:${flag.key}`} flag={flag} />
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
