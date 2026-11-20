"use client";
// Throwaway — Direction "Gouache": an illustration art direction. Axis: illustration.
// A painted, flat-shape magpie (no ink outlines) on a branch beside its cache of found things.
// Each found thing is one of your areas: hover to read it, click to browse it. Pinned searches are gold coins.

import { useId, useState, type CSSProperties, type ReactNode } from "react";

import { formatCount } from "@/components/format";

import { liveActions, useBrand, useLive, useMagpieEvents, type Brand } from "./brand";

import "./gouache.css";

/* ---------------- palette (the illustration's own paints) ---------------- */

const P = {
  ink: "oklch(0.21 0.014 262)",
  ink2: "oklch(0.29 0.022 250)",
  white: "oklch(0.97 0.012 90)",
  white2: "oklch(0.92 0.016 85)",
  wingA: "oklch(0.46 0.13 252)",
  wingB: "oklch(0.52 0.1 205)",
  tailA: "oklch(0.33 0.07 170)",
  tailB: "oklch(0.38 0.11 305)",
  bill: "oklch(0.25 0.012 262)",
  eye: "oklch(0.24 0.03 45)",
  leg: "oklch(0.34 0.012 262)",
  branch: "oklch(0.52 0.05 62)",
  branch2: "oklch(0.43 0.05 55)",
  leaf: "oklch(0.62 0.07 135)",
  leaf2: "oklch(0.54 0.07 140)",
  gold: "oklch(0.8 0.12 84)",
};

// One muted paint per area; gold (H ~84) is kept for pinned searches.
const THING_PAINTS = [
  "oklch(0.62 0.1 40)", // clay
  "oklch(0.62 0.07 145)", // sage
  "oklch(0.56 0.08 248)", // slate blue
  "oklch(0.66 0.08 12)", // dusty rose
  "oklch(0.6 0.07 195)", // teal
  "oklch(0.58 0.05 330)", // heather
  "oklch(0.64 0.08 112)", // olive
];

/* ---------------- shared defs: paper grain and painted edges ---------------- */

function PaintDefs({ id }: { id: string }) {
  return (
    <defs>
      <filter id={`${id}-paint`} x="-6%" y="-6%" width="112%" height="112%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3" result="warp" />
        <feDisplacementMap in="SourceGraphic" in2="warp" scale="2.4" xChannelSelector="R" yChannelSelector="G" result="edge" />
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" result="grain" />
        <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.7 0 0 0 -0.28" result="speck" />
        <feComposite in="speck" in2="edge" operator="in" result="speckIn" />
        <feBlend in="speckIn" in2="edge" mode="multiply" />
      </filter>
      <linearGradient id={`${id}-wing`} x1="0" y1="0" x2="1" y2="0.6">
        <stop offset="0" stopColor={P.wingA} />
        <stop offset="0.7" stopColor={P.wingB} />
        <stop offset="1" stopColor={P.wingA} />
      </linearGradient>
      <linearGradient id={`${id}-tail`} x1="1" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={P.ink} />
        <stop offset="0.35" stopColor={P.tailA} />
        <stop offset="1" stopColor={P.tailB} />
      </linearGradient>
      <radialGradient id={`${id}-body`} cx="0.45" cy="0.3" r="0.8">
        <stop offset="0" stopColor={P.ink2} />
        <stop offset="1" stopColor={P.ink} />
      </radialGradient>
      <radialGradient id={`${id}-marble`} cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stopColor="oklch(0.95 0.03 200)" />
        <stop offset="1" stopColor="currentColor" />
      </radialGradient>
    </defs>
  );
}

/* ---------------- the magpie ---------------- */

/** The painted magpie on its branch, in a 200×112 box (y 8–120). `look` rotates the head (deg, + = down toward the cache). */
function MagpieArt({ id, look = 0, thinking = false, hop = 0, branch = true }: { id: string; look?: number; thinking?: boolean; hop?: number; branch?: boolean }) {
  const head: CSSProperties = { transform: `rotate(${look}deg)`, transformOrigin: "134px 44px", transformBox: "view-box" };
  return (
    <g filter={`url(#${id}-paint)`}>
      {branch ? (
        <g>
          <path d="M0 97 C40 91 80 93 120 96 C150 98 175 94 200 89 L200 96 C175 101 150 105 120 103 C80 100 40 99 0 104 Z" fill={P.branch} />
          <path d="M0 101 C40 97 80 98 120 100 C150 102 175 99 200 94 L200 96 C175 101 150 105 120 103 C80 100 40 99 0 104 Z" fill={P.branch2} />
          <path d="M168 93 C176 84 184 80 194 78 C190 84 182 89 172 94 Z" fill={P.branch2} />
          <ellipse cx="186" cy="76" rx="9" ry="4" transform="rotate(-24 186 76)" fill={P.leaf} />
          <ellipse cx="176" cy="84" rx="7" ry="3.2" transform="rotate(18 176 84)" fill={P.leaf2} />
          <ellipse cx="114" cy="96.5" rx="24" ry="2.6" fill="oklch(0 0 0 / 0.12)" />
        </g>
      ) : null}
      <g key={hop} className={hop ? "gc-hop" : undefined}>
        {/* tail: two graduated feathers */}
        <path d="M80 66 C62 78 38 96 22 112 C20 114 24 116 27 113 C44 100 66 86 89 72 Z" fill={P.tailB} opacity="0.75" />
        <path d="M78 61 C60 72 30 92 9 109 C6 112 10 115 14 112 C36 98 62 82 86 69 Z" fill={`url(#${id}-tail)`} />
        {/* legs */}
        <path d="M107 78 L104.5 95 L107.5 95 L110 78 Z" fill={P.leg} />
        <path d="M116 78 L115.5 95 L118.5 95 L119.5 78 Z" fill={P.leg} />
        <path d="M100 95 L111 95 L110 96.6 L101 96.6 Z" fill={P.leg} />
        <path d="M112 95 L123 95 L122 96.6 L113 96.6 Z" fill={P.leg} />
        {/* body */}
        <path d="M76 58 C80 42 102 34 124 38 C140 41 146 54 140 66 C134 78 112 84 94 80 C82 77 74 68 76 58 Z" fill={`url(#${id}-body)`} />
        {/* belly */}
        <path d="M110 61 C123 54 140 56 141 65 C140 75 127 83 111 82 C102 81 101 70 110 61 Z" fill={P.white} />
        <path d="M112 74 C122 76 132 74 139 69 C135 78 124 83 112 82 Z" fill={P.white2} />
        {/* scapular patch */}
        <path d="M86 49 C96 43 112 43 121 47 C112 51 96 55 86 53 Z" fill={P.white} />
        {/* wing with white primaries and a dark tip */}
        <path d="M80 56 C92 52 113 54 127 62 C117 70 98 74 84 70 C78 66 77 60 80 56 Z" fill={`url(#${id}-wing)`} />
        <path d="M86 65.5 C96 65.5 106 67.5 114 69.5 C104 72.5 93 73.5 85 70 Z" fill={P.white} opacity="0.95" />
        <path d="M80 61 C75 65 71 69 66 72 C74 72.5 82 70.5 87 68 Z" fill={P.ink} />
        {/* neck */}
        <path d="M119 42 C124 31 134 26 143 28 C148 36 146 48 138 54 C131 57 123 52 119 42 Z" fill={P.ink} />
        {/* head */}
        <g className={thinking ? "gc-think" : "gc-head"} style={head}>
          <circle cx="139" cy="30" r="13.5" fill={`url(#${id}-body)`} />
          <ellipse cx="135" cy="21.5" rx="6.5" ry="2.4" fill={P.wingA} opacity="0.35" />
          <path d="M150.5 25.5 C160 26.5 168 29.5 173 33 C166 35.5 158 36.5 150.5 36 Z" fill={P.bill} />
          <path d="M151 31.5 C159 32.5 166 33 172.5 33.2 C166 35.5 158 36.5 151 36 Z" fill={P.ink2} />
          <circle cx="144" cy="27" r="2.5" fill={P.eye} />
          <circle cx="144.8" cy="26.2" r="0.85" fill={P.white} />
        </g>
      </g>
    </g>
  );
}

/* ---------------- found things ---------------- */

function Thing({ kind, color, hole, gid }: { kind: number; color: string; hole: string; gid: string }): ReactNode {
  const dark = `color-mix(in oklch, ${color}, black 28%)`;
  const light = `color-mix(in oklch, ${color}, white 28%)`;
  switch (kind % 7) {
    case 0: // coin-like token
      return (
        <>
          <circle cx="20" cy="22" r="13" fill={dark} />
          <circle cx="20" cy="21" r="13" fill={color} />
          <circle cx="20" cy="21" r="8.5" fill={light} />
          <path d="M20 15 L21.8 19.4 L26.4 19.6 L22.8 22.4 L24 27 L20 24.4 L16 27 L17.2 22.4 L13.6 19.6 L18.2 19.4 Z" fill={color} />
        </>
      );
    case 1: // key
      return (
        <>
          <circle cx="11" cy="21" r="8.5" fill={color} />
          <circle cx="11" cy="21" r="3.6" fill={hole} />
          <path d="M18 19 L37 19 L37 23.5 L18 23.5 Z" fill={color} />
          <path d="M29 23 L29 28 L32 28 L32 23 Z M34 23 L34 26.5 L37 26.5 L37 23 Z" fill={dark} />
        </>
      );
    case 2: // ring with a stone
      return (
        <>
          <circle cx="20" cy="25" r="11.5" fill={color} />
          <circle cx="20" cy="25" r="7.5" fill={hole} />
          <path d="M14.5 12 L25.5 12 L28 15.5 L20 22 L12 15.5 Z" fill="oklch(0.82 0.06 210)" />
          <path d="M14.5 12 L20 12 L20 22 L12 15.5 Z" fill="oklch(0.9 0.04 210)" />
        </>
      );
    case 3: // sewing button
      return (
        <>
          <circle cx="20" cy="22" r="13" fill={dark} />
          <circle cx="20" cy="21" r="13" fill={color} />
          <circle cx="20" cy="21" r="9.5" fill={light} opacity="0.5" />
          <circle cx="16.5" cy="17.5" r="1.9" fill={dark} />
          <circle cx="23.5" cy="17.5" r="1.9" fill={dark} />
          <circle cx="16.5" cy="24.5" r="1.9" fill={dark} />
          <circle cx="23.5" cy="24.5" r="1.9" fill={dark} />
        </>
      );
    case 4: // bottle cap
      return (
        <>
          <path
            d="M20 7 L23 10 L27 9 L28 13 L32 14 L31 18 L34 21 L31 24 L32 28 L28 29 L27 33 L23 32 L20 35 L17 32 L13 33 L12 29 L8 28 L9 24 L6 21 L9 18 L8 14 L12 13 L13 9 L17 10 Z"
            fill={color}
          />
          <circle cx="20" cy="21" r="9" fill={light} />
          <circle cx="20" cy="21" r="5" fill={color} opacity="0.55" />
        </>
      );
    case 5: // marble
      return (
        <g style={{ color }}>
          <circle cx="20" cy="22" r="12" fill={`url(#${gid}-marble)`} />
          <circle cx="20" cy="22" r="12" fill={color} opacity="0.45" />
          <path d="M11 22 C15 15 23 14 28 19 C23 17 17 18 13 24 Z" fill="oklch(0.97 0.01 90)" opacity="0.6" />
        </g>
      );
    default: // thimble
      return (
        <>
          <path d="M10 33 L12 16 C12 8 28 8 28 16 L30 33 Z" fill={color} />
          <path d="M9 31 L31 31 L31 35 L9 35 Z" fill={dark} />
          {[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => <circle key={`${r}-${c}`} cx={14 + c * 4 + (r % 2) * 2} cy={16 + r * 4.5} r="0.9" fill={dark} />))}
        </>
      );
  }
}

/* ---------------- data ---------------- */

function useCache() {
  const { env } = useBrand();
  const { snapshot } = env;
  const areas = snapshot.areas
    .filter((a) => !a.hidden && a.kind !== "system" && a.postCount > 0)
    .sort((a, b) => b.postCount - a.postCount)
    .slice(0, 7);
  const pins = snapshot.topics.filter((t) => t.kind === "pinned" && !t.hidden);
  const total = snapshot.posts.filter((p) => !p.hidden).length;
  const max = areas[0]?.postCount ?? 1;
  return { areas, pins, total, max, areaCount: snapshot.areas.filter((a) => !a.hidden && a.kind !== "system").length };
}

/* ---------------- slots ---------------- */

/** Object size by share of posts: area ∝ share (so size reads truthfully), anchored to the largest area. */
const thingSize = (count: number, max: number) => Math.max(16, Math.round(44 * Math.sqrt(count / max)));

function Masthead() {
  const id = useId().replace(/:/g, "");
  const { env } = useBrand();
  const live = useLive();
  const { areas, pins, total, max, areaCount } = useCache();
  const [hot, setHot] = useState<number | null>(null);
  const [hop, setHop] = useState(0);
  const [wobble, setWobble] = useState<{ n: number; i: number }>({ n: 0, i: -1 });
  useMagpieEvents((e) => {
    if (e.type === "surprise") {
      setHop((h) => h + 1);
      setWobble((w) => ({ n: w.n + 1, i: Math.floor(Math.random() * Math.max(1, areas.length)) }));
    }
    if (e.type === "pin") setHop((h) => h + 1);
  });
  const selected = areas.filter((a) => live.areaIds.includes(a.id)).length;
  const look = hot === null ? 0 : 6 + Math.min(hot, 8) * 1.6;
  const more = areaCount - areas.length;

  return (
    <section key={env.replay} aria-label="The cache: your areas" className="gc-cache gc-paint-in relative -mb-1 flex min-h-[128px] items-center overflow-hidden rounded-card shadow-card">
      <svg viewBox="0 8 200 112" className="h-[128px] w-auto shrink-0 self-end" aria-hidden="true">
        <PaintDefs id={id} />
        <MagpieArt id={id} look={live.asking ? 0 : look} thinking={live.asking} hop={hop} />
        {live.asking ? (
          <g className="gc-dots">
            <circle cx="160" cy="14" r="2.2" fill={P.ink} />
            <circle cx="168" cy="11" r="2.8" fill={P.ink} />
            <circle cx="177" cy="9" r="3.4" fill={P.ink} />
          </g>
        ) : null}
      </svg>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-2.5 pr-4">
        <p className="flex items-baseline justify-between gap-3 text-[13px] text-ink-muted">
          <span className="min-w-0 truncate">
            <span className="font-semibold text-ink">The cache</span> · <span className="tabular-nums">{formatCount(total)}</span> finds in{" "}
            <span className="tabular-nums">{areaCount}</span> areas
          </span>
          <span className="shrink-0 text-[12px]">{selected > 0 ? `${selected} selected · click again to drop` : "Click things to combine areas"}</span>
        </p>

        <ul className="grid min-h-0 flex-1 grid-cols-4 content-center gap-x-1.5 gap-y-1">
          {areas.map((area, i) => {
            const on = live.areaIds.includes(area.id);
            const size = thingSize(area.postCount, max);
            return (
              <li key={area.id} className="flex min-w-0">
                <button
                  type="button"
                  aria-label={`${area.name}: ${formatCount(area.postCount)} posts`}
                  aria-pressed={on}
                  title={area.name}
                  data-dim={selected > 0 && !on ? "" : undefined}
                  onPointerEnter={() => setHot(i)}
                  onPointerLeave={() => setHot(null)}
                  onFocus={() => setHot(i)}
                  onBlur={() => setHot(null)}
                  onClick={() => liveActions.toggleArea(area.id)}
                  className="gc-thing"
                >
                  <span className="gc-thing-art" style={{ height: 36 }}>
                    <svg
                      key={wobble.i === i ? `w${wobble.n}` : "still"}
                      viewBox="0 0 40 40"
                      width={Math.min(size, 34)}
                      height={Math.min(size, 34)}
                      className={wobble.i === i ? "gc-wobble" : undefined}
                      aria-hidden="true"
                    >
                      <PaintDefs id={`${id}t${i}`} />
                      <g filter={`url(#${id}t${i}-paint)`}>
                        <Thing kind={i} color={THING_PAINTS[i % THING_PAINTS.length]} hole="var(--gc-cache)" gid={`${id}t${i}`} />
                      </g>
                    </svg>
                  </span>
                  <span className="gc-label">
                    <span className="line-clamp-3 leading-[1.15]">{area.name}</span>
                    <span className="block tabular-nums">{formatCount(area.postCount)}</span>
                  </span>
                </button>
              </li>
            );
          })}
          {pins.length > 0 ? (
            <li className="flex min-w-0 items-center gap-1.5 px-1">
              <span className="flex h-[36px] w-[36px] flex-wrap content-center items-center justify-center gap-0.5">
                {pins.slice(0, 4).map((pin, j) => (
                  <button
                    key={pin.id}
                    type="button"
                    aria-label={`Pinned search: ${pin.name}`}
                    aria-pressed={live.topicIds.includes(pin.id)}
                    title={pin.name}
                    onClick={() => liveActions.selectTopic(pin.id)}
                    className="gc-pin"
                  >
                    <svg viewBox="0 0 40 40" width={20} height={20} aria-hidden="true">
                      <PaintDefs id={`${id}p${j}`} />
                      <g filter={`url(#${id}p${j}-paint)`}>
                        <circle cx="20" cy="22" r="14" fill="oklch(0.66 0.12 74)" />
                        <circle cx="20" cy="21" r="14" fill={P.gold} />
                        <circle cx="20" cy="21" r="9" fill="oklch(0.88 0.1 92)" />
                        <circle cx="16" cy="16" r="2.5" fill="oklch(0.97 0.04 95)" />
                      </g>
                    </svg>
                  </button>
                ))}
              </span>
              <span className="gc-label">
                <span className="block">Pinned</span>
                <span className="block tabular-nums">{pins.length}</span>
              </span>
            </li>
          ) : null}
          {more > 0 ? (
            <li className="flex shrink-0 items-end pb-[3px] text-[11px] text-ink-muted">
              +{more} more
              <br />
              in sidebar
            </li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}

function Mark() {
  const id = useId().replace(/:/g, "");
  const live = useLive();
  const [hop, setHop] = useState(0);
  useMagpieEvents((e) => {
    if (e.type === "surprise" || e.type === "pin") setHop((h) => h + 1);
  });
  // The painted bird lives in the sidebar header; no per-area cache in main (the tree has the numbers).
  return (
    <span className="flex w-full flex-col items-start gap-1">
      <svg viewBox="0 8 200 112" className="-ml-2 block h-auto w-full max-w-[200px]" role="img" aria-label="Magpie">
        <PaintDefs id={id} />
        <MagpieArt id={id} thinking={live.asking} hop={hop} />
      </svg>
      <span className="font-[family-name:var(--f-brico)] text-[25px] leading-none font-bold tracking-[-0.03em] text-side-ink">Magpie</span>
    </span>
  );
}

function Bust() {
  const id = useId().replace(/:/g, "");
  return (
    <span className="flex items-center gap-3">
      <svg viewBox="0 0 48 48" width={46} height={46} className="shrink-0" role="img" aria-label="Magpie">
        <PaintDefs id={id} />
        <circle cx="24" cy="24" r="23" fill="oklch(0.9 0.03 85)" />
        <g filter={`url(#${id}-paint)`}>
          {/* bust: dark shoulder, white scapular, glossy wing edge, head and heavy bill */}
          <path d="M6 44 C8 33 16 27 26 27 C35 27 41 33 42 44 Z" fill={`url(#${id}-body)`} />
          <path d="M12 38 C17 33 25 32 31 34 C26 37 18 40 12 41 Z" fill={P.white} />
          <path d="M8 44 C11 40 18 38 24 39 C20 42 15 44 10 45 Z" fill={`url(#${id}-wing)`} />
          <path d="M28 33 C34 31 40 34 42 40 C39 41 33 39 28 36 Z" fill={P.white} />
          <circle cx="25" cy="19" r="9.5" fill={`url(#${id}-body)`} />
          <ellipse cx="22" cy="13" rx="4.5" ry="1.7" fill={P.wingA} opacity="0.4" />
          <path d="M33 16 C38 16.5 42 18.5 45 21 C40 22.5 36 23 33 22.5 Z" fill={P.bill} />
          <circle cx="28.5" cy="17.5" r="1.8" fill={P.eye} />
          <circle cx="29.1" cy="16.9" r="0.6" fill={P.white} />
        </g>
      </svg>
      <span className="font-[family-name:var(--f-brico)] text-[25px] leading-none font-bold tracking-[-0.03em] text-side-ink">Magpie</span>
    </span>
  );
}

function EmptyArt() {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 8 260 112" width={260} height={112} aria-hidden="true">
      <PaintDefs id={id} />
      <MagpieArt id={id} look={16} />
      <g filter={`url(#${id}-paint)`}>
        {/* the empty dish it's peering into */}
        <ellipse cx="228" cy="104" rx="28" ry="3" fill="oklch(0 0 0 / 0.1)" />
        <path d="M202 92 C204 104 216 106 228 106 C240 106 252 104 254 92 Z" fill="oklch(0.62 0.1 40)" />
        <ellipse cx="228" cy="92" rx="26" ry="5" fill="oklch(0.7 0.09 42)" />
        <ellipse cx="228" cy="92.5" rx="21" ry="3.4" fill="oklch(0.55 0.08 40)" />
      </g>
    </svg>
  );
}

export const gouache: Brand = { slug: "gouache", name: "Gouache", Mark, EmptyArt };
void Masthead;
void Bust;
