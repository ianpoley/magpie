"use client";
// Throwaway — header round on Murmur. Same brand (palette, flock, mark); only the main column's header changes.
//  1 Current   — the original, unchanged (baseline).
//  2 Compact   — layout: title + count + view on one row, every tool on the next. Static.
//  3 Sticky    — scroll: keeps the big title, but the tool row follows you down the list.
//  4 Command   — component: no title; one bar holds search, Ask and every filter, with a caption line under it.
//  5 Compact + sticky — the pick: Compact's layout, with its tool row pinned to the top as the list scrolls.

import { useEffect, useRef } from "react";

import type { Brand } from "./brand";
import { contextLine, CountLine, Filters, SurpriseButton, UnifiedSearch, useStuck, ViewSwitch, ViewTabs, type HeaderProps } from "./header-kit";
import { murmur } from "./murmur";

import "./headers.css";

function Detail({ h }: { h: HeaderProps }) {
  return h.detail ? <p className="max-w-[60ch] text-[14px] leading-[1.5] text-pretty text-ink-muted">{h.detail}</p> : null;
}

function Compact(h: HeaderProps) {
  const ctx = contextLine(h);
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {h.menuButton}
        <div className="min-w-0 flex-1">
          {ctx ? <p className="text-eyebrow mb-1 text-ink-muted">{ctx}</p> : null}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-display text-[26px] leading-[1.1] text-ink sm:text-[30px]">{h.title}</h1>
            <CountLine h={h} />
          </div>
        </div>
        <ViewSwitch h={h} />
      </div>
      <Detail h={h} />
      <div className="flex flex-wrap items-center gap-2">
        <UnifiedSearch h={h} className="min-w-[min(20rem,100%)] flex-1" />
        <div className="flex flex-wrap items-center gap-2">
          <Filters h={h} />
          <SurpriseButton h={h} iconOnly />
        </div>
      </div>
    </header>
  );
}

function CompactSticky(h: HeaderProps) {
  const ctx = contextLine(h);
  const { ref, stuck } = useStuck();
  // Changing the search or a filter from the pinned bar deep in the list jumps back to the top of the new results,
  // so the count and the first match are on screen instead of wherever the old scroll position lands.
  const stuckRef = useRef(stuck);
  useEffect(() => {
    stuckRef.current = stuck;
  });
  const query = JSON.stringify([h.keyword, h.timeRange, h.sort, h.mediaOnly, h.view, h.askActive]);
  const lastQuery = useRef(query);
  useEffect(() => {
    if (query === lastQuery.current) return;
    lastQuery.current = query;
    if (stuckRef.current) window.scrollTo({ top: 0, behavior: "instant" });
  }, [query]);
  return (
    <>
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {h.menuButton}
          <div className="min-w-0 flex-1">
            {ctx ? <p className="text-eyebrow mb-1 text-ink-muted">{ctx}</p> : null}
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-display text-[26px] leading-[1.1] text-ink sm:text-[30px]">{h.title}</h1>
              <CountLine h={h} />
            </div>
          </div>
          <ViewSwitch h={h} />
        </div>
        <Detail h={h} />
      </header>
      {/* Sits where the tool row starts, so it reports "stuck" the moment the row pins. The negative margins keep Compact's spacing. */}
      <div ref={ref} aria-hidden="true" className="-mt-5 h-px" />
      <div data-stuck={stuck ? "" : undefined} className="hd-sticky sticky top-0 z-20 -mx-4 -mt-[22px] -mb-2 px-4 py-2 sm:-mx-8 sm:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <UnifiedSearch h={h} className="min-w-[min(20rem,100%)] flex-1" />
          <div className="flex flex-wrap items-center gap-2">
            <Filters h={h} />
            <SurpriseButton h={h} iconOnly />
          </div>
        </div>
      </div>
    </>
  );
}

function Sticky(h: HeaderProps) {
  const ctx = contextLine(h) ?? h.eyebrow;
  const { ref, stuck } = useStuck();
  return (
    <>
      <header className="flex items-end gap-3">
        {h.menuButton}
        <div className="min-w-0 flex-1">
          <p className="text-eyebrow text-ink-muted">{ctx}</p>
          <h1 className="text-display mt-1.5 text-[30px] text-ink sm:text-[40px]">{h.title}</h1>
        </div>
        <SurpriseButton h={h} />
      </header>
      <Detail h={h} />
      <div ref={ref} aria-hidden="true" className="-mb-5 h-px" />
      <div
        data-stuck={stuck ? "" : undefined}
        className="hd-sticky sticky top-0 z-20 -mx-4 flex flex-col gap-2.5 px-4 py-2.5 sm:-mx-8 sm:px-8"
      >
        <div className="flex flex-wrap items-center gap-2">
          <UnifiedSearch h={h} className="min-w-[min(20rem,100%)] flex-1" />
          <div className="flex flex-wrap items-center gap-2">
            <Filters h={h} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <ViewTabs h={h} />
          <CountLine h={h} className="justify-end text-right" />
        </div>
      </div>
    </>
  );
}

function Command(h: HeaderProps) {
  const ctx = contextLine(h);
  return (
    <header className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        {h.menuButton}
        <div className="hd-bar flex min-w-0 flex-1 items-center rounded-full bg-surface shadow-card">
          <UnifiedSearch h={h} bare className="min-w-0 flex-1" />
          <span aria-hidden="true" className="hidden h-6 w-px shrink-0 bg-line sm:block" />
          <div className="hidden shrink-0 items-center gap-0.5 px-1.5 sm:flex">
            <Filters h={h} bare />
          </div>
        </div>
        <SurpriseButton h={h} iconOnly />
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:hidden">
        <Filters h={h} />
      </div>
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <h1 className="text-[14px] font-semibold text-ink">
            {ctx ? <span className="font-medium text-ink-muted">{ctx} / </span> : null}
            {h.title}
          </h1>
          <span aria-hidden="true" className="text-[13px] text-ink-muted">
            ·
          </span>
          <CountLine h={h} />
        </div>
        <ViewTabs h={h} />
      </div>
      <Detail h={h} />
    </header>
  );
}

const base = { ...murmur, Masthead: undefined };

export const headerCurrent: Brand = { ...murmur, name: "Current" };
export const headerCompact: Brand = { ...base, name: "Compact", Header: Compact };
export const headerSticky: Brand = { ...base, name: "Sticky", Header: Sticky };
export const headerCommand: Brand = { ...base, name: "Command", Header: Command };
export const headerCompactSticky: Brand = { ...base, name: "Compact + sticky", Header: CompactSticky };
