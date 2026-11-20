"use client";
// Throwaway — Direction "Quiet": the magpie reduced to black, white and one flash of wing-blue. Axis: restraint.
// The chrome steps back so the posts carry the page; the mark is the only illustration, and its wing glint the only motion.
// Usability holds: chips, counts, authors and actions stay visible at rest, and the list keeps today's density.

import { useState, type CSSProperties } from "react";

import { formatCount, relativeTime } from "@/components/format";

import { useBrand, useMagpieEvents, type Brand } from "./brand";

import "./quiet.css";

const WEEK = 7 * 24 * 60 * 60 * 1000;
const BODY = "M18 18 L31 12 Q38 13 38 20 L35 27 Q30 32 22 30 Z";

/**
 * The symbol on a 46×38 grid: tail wedge, body, white belly (clipped to the body), wing-blue gloss, head, bill, eye.
 * `reveal` draws it shape by shape; `glint` flashes the wing once.
 */
function QuietSymbol({ height, reveal, glint, title }: { height: number; reveal: boolean; glint: number; title?: string }) {
  const clip = `qm-body-${height}`;
  const shape = (i: number) => (reveal ? { className: "qm-s", style: { "--i": i } as CSSProperties } : {});
  return (
    <svg
      viewBox="2 2 46 38"
      height={height}
      width={(height * 46) / 38}
      className="qm-mark block shrink-0"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <clipPath id={clip}>
          <path d={BODY} />
        </clipPath>
      </defs>
      <path {...shape(0)} d="M21 25 L25 29 L5 39 L3 37 Z" fill="var(--q-ink)" />
      <path {...shape(1)} d={BODY} fill="var(--q-ink)" />
      <circle {...shape(2)} cx="33" cy="25" r="7" fill="var(--q-paper)" clipPath={`url(#${clip})`} />
      <path key={glint} className={glint ? "qm-glint" : reveal ? "qm-s" : undefined} style={reveal && !glint ? ({ "--i": 3 } as CSSProperties) : undefined} d="M20 19 L30 15 L24 24 Z" fill="var(--q-wing)" />
      <circle {...shape(4)} cx="35" cy="9" r="6" fill="var(--q-ink)" />
      <path {...shape(4)} d="M40 7 L47 9.5 L40 12 Z" fill="var(--q-ink)" />
      <circle {...shape(5)} cx="37" cy="8" r="1" fill="var(--q-paper)" />
    </svg>
  );
}

function useGlint() {
  const [glint, setGlint] = useState(0);
  useMagpieEvents((e) => {
    if (e.type === "surprise" || e.type === "pin") setGlint((g) => g + 1);
  });
  return glint;
}

function Mark() {
  const { env } = useBrand();
  const glint = useGlint();
  return (
    <span className="flex items-center gap-2.5">
      <QuietSymbol key={env.replay} height={32} reveal glint={glint} title="Magpie" />
      <span className="font-[family-name:var(--f-brico)] text-[23px] leading-none font-semibold tracking-[-0.035em] text-side-ink">magpie</span>
    </span>
  );
}

/** One ink at stepped lightness: the largest area darkest. Unfiled sits last in the line colour. */
const tone = (i: number, n: number) => `oklch(${(0.22 + (0.4 * i) / Math.max(1, n - 1)).toFixed(3)} 0.014 262)`;

/**
 * A colophon: what the collection is and how it is spread, at rest, in two quiet lines.
 * Line one is the totals; under it a hairline bar of area shares with every area named beside its count.
 */
function Masthead() {
  const { env } = useBrand();
  const { snapshot, now } = env;
  const visible = snapshot.posts.filter((post) => !post.hidden);
  const bookmarked = visible.filter((post) => post.bookmarked).length;
  const liked = visible.filter((post) => post.liked).length;
  const unfiled = visible.filter((post) => post.unfiled).length;
  const fresh = visible.filter((post) => post.createdAtMs !== null && now - post.createdAtMs < WEEK).length;
  const pins = snapshot.topics.filter((topic) => topic.kind === "pinned").length;
  const topics = snapshot.topics.filter((topic) => !topic.hidden && topic.kind !== "pinned").length;
  const areas = snapshot.areas.filter((area) => !area.hidden && area.kind !== "system" && area.postCount > 0).sort((a, b) => b.postCount - a.postCount);
  // Posts can sit in more than one area, so shares are of all filings, not of posts.
  const filings = areas.reduce((sum, area) => sum + area.postCount, 0) + unfiled || 1;
  const flight = snapshot.lastCompleteRunAt ? `Last flight ${relativeTime(snapshot.lastCompleteRunAt, now)}` : "No flights yet";
  const n = (value: number) => <span className="text-ink">{formatCount(value)}</span>;
  const dot = <span aria-hidden="true"> · </span>;
  return (
    <section aria-label="Your collection at a glance" className="qm-colophon flex flex-col gap-2 pb-3 tabular-nums">
      <p className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">
        <span>
          {n(visible.length)} saved{dot}
          {n(bookmarked)} bookmarked{dot}
          {n(liked)} liked{dot}
          {n(topics)} topics in {n(areas.length)} areas{dot}
          {n(fresh)} this week
          {pins > 0 ? (
            <>
              {dot}
              {n(pins)} pinned
            </>
          ) : null}
        </span>
        <span>{flight}</span>
      </p>
      <div className="flex h-[3px] w-full gap-[2px]" role="img" aria-label={`Areas by share: ${areas.map((a) => `${a.name} ${formatCount(a.postCount)}`).join(", ")}, unfiled ${formatCount(unfiled)}`}>
        {areas.map((area, i) => (
          <span key={area.id} className="h-full min-w-[2px]" style={{ flexGrow: area.postCount, flexBasis: 0, background: tone(i, areas.length) }} />
        ))}
        {unfiled > 0 ? <span className="h-full min-w-[2px]" style={{ flexGrow: unfiled, flexBasis: 0, background: "var(--q-rule-strong)" }} /> : null}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] leading-[1.5] text-ink-muted" aria-hidden="true">
        {areas.map((area, i) => (
          <li key={area.id} className="inline-flex items-center gap-1.5">
            <span className="size-[7px] shrink-0" style={{ background: tone(i, areas.length) }} />
            <span className="text-ink">{area.name}</span> {Math.round((area.postCount / filings) * 100)}%
          </li>
        ))}
        {unfiled > 0 ? (
          <li className="inline-flex items-center gap-1.5">
            <span className="size-[7px] shrink-0" style={{ background: "var(--q-rule-strong)" }} />
            <span className="text-ink">Unfiled</span> {Math.round((unfiled / filings) * 100)}%
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function EmptyArt() {
  const { env } = useBrand();
  const glint = useGlint();
  return (
    <span className="flex flex-col items-center gap-5">
      <QuietSymbol key={env.replay} height={80} reveal glint={glint} />
      <span className="qm-hair block h-px w-16" aria-hidden="true" />
    </span>
  );
}

export const quiet: Brand = { slug: "quiet", name: "Quiet", Mark, EmptyArt };
void Masthead;
