"use client";
// Throwaway: the picker harness (markup, styles and behavior per emil-prototype PICKER.md).
// Deviation: the variant lives in the hash (#v=2), because the screen rewrites the query string as you filter.
// The shell mounts once; switching only swaps the theme on <html> and the brand slots, so filters, asks and dialogs survive a flip.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import type { LinkedFilter } from "@/lib/filter-url";
import type { Snapshot } from "@/lib/types";

import { BrandProvider, type Brand } from "./brand";
import { headerCommand, headerCompact, headerCompactSticky, headerCurrent, headerSticky } from "./headers";
import { Shell } from "./shell";

// Round 5: the main-column header, on Murmur. Murmur riffs (plumage, roost, migration, daylight) and earlier rounds are parked in this folder.
const BRANDS: Brand[] = [headerCurrent, headerCompact, headerSticky, headerCommand, headerCompactSticky];

const fromHash = () => {
  const v = Number.parseInt(new URLSearchParams(window.location.hash.slice(1)).get("v") ?? "1", 10);
  return Number.isFinite(v) && v >= 1 && v <= BRANDS.length ? v - 1 : 0;
};

/** The chosen variant, kept in the hash. Null on the server, so nothing renders until the theme is known. */
const listeners = new Set<() => void>();
const variantStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    window.addEventListener("hashchange", cb);
    return () => {
      listeners.delete(cb);
      window.removeEventListener("hashchange", cb);
    };
  },
  get: fromHash,
  set(i: number) {
    const url = new URL(window.location.href);
    url.hash = `v=${i + 1}`;
    history.replaceState(history.state, "", url);
    listeners.forEach((cb) => cb());
  },
};

export function Harness({ snapshot, now, linked, fontVars }: { snapshot: Snapshot; now: number; linked: LinkedFilter; fontVars: string }) {
  const current = useSyncExternalStore(variantStore.subscribe, variantStore.get, () => null);
  const [replay, setReplay] = useState(0);
  const pickerRef = useRef<HTMLElement>(null);
  const highlightRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Theme and fonts go on <html>: globals.css derives the UI SDK tokens at :root, so only a root-level remap reaches menus and toasts.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const classes = fontVars.split(" ");
    root.classList.add(...classes);
    return () => {
      root.classList.remove(...classes);
      delete root.dataset.proto;
    };
  }, [fontVars]);

  useLayoutEffect(() => {
    if (current === null) return;
    document.documentElement.dataset.proto = BRANDS[current].slug;
  }, [current]);

  // Next's router can rewrite the URL after hydration and drop the hash; put it back so a reload keeps the variant.
  useEffect(() => {
    if (current === null) return;
    const keep = () => {
      if (!window.location.hash.includes(`v=${current + 1}`)) {
        const url = new URL(window.location.href);
        url.hash = `v=${current + 1}`;
        history.replaceState(history.state, "", url);
      }
    };
    keep();
    const id = window.setInterval(keep, 1000);
    return () => window.clearInterval(id);
  }, [current]);

  const moveHighlight = useCallback(() => {
    if (current === null) return;
    const el = itemRefs.current[current];
    const hl = highlightRef.current;
    if (!el || !hl) return;
    hl.style.width = `${el.offsetWidth}px`;
    hl.style.transform = `translateX(${el.offsetLeft}px)`;
  }, [current]);
  useLayoutEffect(moveHighlight, [moveHighlight]);
  useEffect(() => {
    window.addEventListener("resize", moveHighlight);
    return () => window.removeEventListener("resize", moveHighlight);
  }, [moveHighlight]);
  useEffect(() => {
    if (current === null) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => pickerRef.current?.setAttribute("data-ready", "")));
    return () => cancelAnimationFrame(id);
  }, [current]);

  const setActive = useCallback((i: number) => {
    if (i < 0 || i >= BRANDS.length) return;
    variantStore.set(i);
    setReplay((r) => r + 1);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (current === null || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target instanceof HTMLElement ? e.target : document.body;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
      // Composite widgets own their arrow keys.
      const inWidget = t.closest('[role="tree"], [role="menu"], [role="listbox"], [role="radiogroup"], [role="tablist"], [role="dialog"], [data-slot="segmented-control"]');
      // 1–9 pick a variant directly; 0 picks the tenth.
      const num = e.key === "0" ? 10 : Number.parseInt(e.key, 10);
      if (num >= 1 && num <= BRANDS.length) setActive(num - 1);
      else if (e.key === "ArrowRight" && !inWidget) setActive((current + 1) % BRANDS.length);
      else if (e.key === "ArrowLeft" && !inWidget) setActive((current - 1 + BRANDS.length) % BRANDS.length);
      else if ((e.key === "r" || e.key === "R") && !inWidget) setReplay((r) => r + 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [current, setActive]);

  if (current === null) return null;
  return (
    <>
      <BrandProvider brand={BRANDS[current]} env={{ snapshot, now, replay }}>
        <Shell snapshot={snapshot} now={now} linked={linked} />
      </BrandProvider>
      <nav ref={pickerRef} className="proto-picker" aria-label="Prototype variants">
        <span ref={highlightRef} className="proto-picker-highlight" aria-hidden="true" />
        {BRANDS.map((brand, i) => (
          <button
            key={brand.name}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            type="button"
            className="proto-picker-item"
            data-active={i === current ? "" : undefined}
            aria-current={i === current ? "true" : undefined}
            onClick={() => setActive(i)}
          >
            {brand.name}
          </button>
        ))}
        <span className="proto-picker-divider" aria-hidden="true" />
        <button type="button" className="proto-picker-item proto-picker-replay" aria-label="Replay animation (R)" onClick={() => setReplay((r) => r + 1)}>
          ↻
        </button>
      </nav>
    </>
  );
}
