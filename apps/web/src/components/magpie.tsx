"use client";
// The pixel magpie: the sidebar mark (with a wing beat when you act), and the birds that circle empty states.
// Colors are the bird inks in globals.css.

import { useId, useState, type CSSProperties } from "react";

import { useMagpieEvents } from "@/lib/magpie-events";

/**
 * A magpie perched facing right, holding a coin in its bill.
 * K black · W white · B wing gloss (blue) · G tail gloss (green) · V tail tip (violet)
 * E eye glint · Y coin · H coin highlight · O coin shadow
 */
const MAGPIE = [
  ".................KKKK......",
  "................KKKKKK.....",
  "...............KKKEKKKK....",
  "...............KKKKKKKKKYY.",
  "..............KKKKKK...YHYY",
  "..............KKKKKK...YYYO",
  "..........KKKKKKKKK.....OO.",
  "........KKWWWWWKKKK........",
  ".......KKKKWWWWKKKKW.......",
  "......KBBBBBBKKKWWWW.......",
  ".....KBBBBBWWKWWWWWW.......",
  "....KGBBBBWWWKWWWWW........",
  "...KGGKBBBKKKKWWWW.........",
  "..KGGV....KK..K.K..........",
  ".KGGV.........K.K..........",
  "KGVV.........KK.KK.........",
  "VV.........................",
];

const MARK_INK: Record<string, string> = {
  K: "var(--color-bird-mark)",
  W: "var(--color-bird-white)",
  B: "var(--color-bird-wing-mark)",
  G: "var(--color-bird-tail)",
  V: "var(--color-bird-tip)",
  E: "var(--color-bird-eye)",
  Y: "var(--color-coin)",
  H: "var(--color-coin-shine)",
  O: "var(--color-coin-shade)",
};

/** 6×3 flying birds, facing right: a long tail, a white belly flash, one wing-gloss pixel. Shared with the flock. */
export const FLY_UP = ["...B..", "KKKKKK", "...WW."];
export const FLY_DOWN = ["......", "KKKBKK", "..BWW."];
export const FLY_INK = { K: "--color-bird", W: "--color-bird-white", B: "--color-bird-wing" } as const;
export const FLY_GOLD = { K: "--color-gold-bird", W: "--color-gold-white", B: "--color-coin" } as const;

type Px = { x: number; y: number; c: string };
const BASE: Px[] = MAGPIE.flatMap((row, y) => [...row].flatMap((c, x) => (c === "." ? [] : [{ x, y, c }])));
// Raised-wing frame: the gloss lifts above the back and the body closes underneath it.
const UP: Px[] = BASE.filter((p) => p.c === "B").flatMap((p) => [
  { x: p.x, y: p.y, c: "K" },
  { x: p.x + 1, y: p.y - 6, c: "B" },
]);

const cell = (p: Px, key: string, ink: Record<string, string>) => <rect key={key} x={p.x} y={p.y} width={1} height={1} style={{ fill: ink[p.c] ?? ink.K }} />;

function PerchedBird({ size }: { size: number }) {
  const w = MAGPIE[0].length;
  const h = MAGPIE.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w * size} height={h * size} shapeRendering="crispEdges" aria-hidden="true" style={{ overflow: "visible" }}>
      <g>{BASE.map((p) => cell(p, `b${p.x}-${p.y}`, MARK_INK))}</g>
      <g className="wing-up">{UP.map((p, i) => cell(p, `u${i}`, MARK_INK))}</g>
    </svg>
  );
}

/** The sidebar mark and wordmark. The bird beats its wings on load, when you act, and when the pointer reaches it. */
export function MagpieMark() {
  const [beat, setBeat] = useState(0);
  useMagpieEvents((event) => {
    if (event !== "remove") setBeat((n) => n + 1);
  });
  return (
    <span className="flex items-end gap-3" onPointerEnter={() => setBeat((n) => n + 1)}>
      <span key={beat} data-play="" className="mark-flap inline-block shrink-0" role="img" aria-label="Magpie">
        <PerchedBird size={2} />
      </span>
      <span className="pb-0.5 font-display text-[26px] leading-none font-bold tracking-[-0.035em] text-side-ink">magpie</span>
    </span>
  );
}

/**
 * The empty-state bird: a magpie flying side-on, in six frames of one wingbeat (up, through level, to down).
 * The far wing shows behind on the upstroke. The flock keeps its own 6×3 birds, which read as a murmuration at a distance.
 * K black · W white · B wing gloss · F far wing · w far wing's white · G tail gloss · V tail tip · E eye
 */
const WINGBEAT = [
  [
    "....FKK............",
    "...FKKKK...........",
    "...FKWWWK..........",
    "...FKWWWWK.........",
    "...FKWWWWK.........",
    "...FKWWWWWK........",
    "...FKKKKKKKK.......",
    "...FKKKKKKKK.......",
    "....FKKKKKKK.......",
    "....FKKKKKKKK......",
    ".....FKBBBBBB.KKK..",
    "......FBBBBBBKKKEKK",
    "VKGGGGGKKWWWWKKKK..",
    ".KKKKKKKWWWWWKKK...",
    "........KKKKK......",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
  ],
  [
    "...................",
    "...................",
    "...................",
    ".FFF..KKK..........",
    ".FwwFFKWWKK........",
    ".FwwwKWWWWK........",
    "..FwwKWWWWWK.......",
    "..FwwKWWWKKK.......",
    "..FFFKKKKKKKK......",
    "...FFFKKKKKKK......",
    "....FFKKKKKKK.KKK..",
    ".....FFBBBBBBKKKEKK",
    "VKGGGGGKKWWWWKKKK..",
    ".KKKKKKKWWWWWKKK...",
    "........KKKKK......",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
  ],
  [
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "FFFF...KKKK........",
    "FFwwFFKWWWWKK......",
    "..FFFFKKKKKKK.KKK..",
    "....FFKKBBBBBKKKEKK",
    "VKGGGGGKKWWWWKKKK..",
    ".KKKKKKKWWWWWKKK...",
    "........KKKKK......",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
  ],
  [
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "..........KKK.KKK..",
    ".......KKKKKKKKKEKK",
    "VKGGGGKKKKKKKKKKK..",
    "FKKKKKKKWWWWWKKK...",
    "........KKKKK......",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
  ],
  [
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "..........KKK.KKK..",
    ".......KKKKKKKKKEKK",
    "VKGGGGKBBBBBBKKKK..",
    ".KKKKKKKKKKKKKKK...",
    "...FFKKKKKKKK......",
    "..FFFKKKKKKKK......",
    ".FwwwwWWWWWWK......",
    ".FwwwFKWWWWK.......",
    ".FwFF.KWWKK........",
    ".FF....KK..........",
    "...................",
    "...................",
    "...................",
  ],
  [
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "...................",
    "..........KKK.KKK..",
    ".......KKKKKKKKKEKK",
    "VKGGGGGBBBBBBKKKK..",
    ".KKKKKKBBBBBBKKK...",
    "....FKKKKKKKK......",
    "...FFKKKKKKKK......",
    "...FFKKKKKKKK......",
    "..FFwWWWWKKK.......",
    "..FwwWWWWWWK.......",
    "..FwwWWWWWK........",
    "..FwwKWWWK.........",
    "..FwwKWWK..........",
    "..FFFKKK...........",
  ],
];
// Up, down and back up again, so the beat never jumps from wings-down to wings-up.
const BEAT = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1];
const BEAT_W = WINGBEAT[0][0].length;
const BEAT_H = WINGBEAT[0].length;
const BEAT_PX = 2;
const BEAT_INK = {
  K: "var(--color-bird-mark)",
  W: "var(--color-bird-white)",
  B: "var(--color-bird-gloss)",
  F: "var(--color-bird-far)",
  w: "var(--color-bird-far-white)",
  G: "var(--color-bird-tail-gloss)",
  V: "var(--color-bird-tail-end)",
  E: "var(--color-bird-eye)",
};
const beatCells = (rows: string[]) =>
  rows.flatMap((row, y) => [...row].flatMap((c, x) => (c === "." ? [] : [cell({ x, y, c }, `${x}-${y}`, BEAT_INK)])));

/** The six frames, drawn once for the whole flock. */
function WingbeatFrames({ id }: { id: string }) {
  return (
    <svg width={0} height={0} className="absolute" aria-hidden="true">
      <defs>
        {WINGBEAT.map((frame, i) => (
          <g key={i} id={`${id}-${i}`}>
            {beatCells(frame)}
          </g>
        ))}
      </defs>
    </svg>
  );
}

/** One bird: a window onto a strip of the beat's frames that steps along it. */
function FlyingBird({ id }: { id: string }) {
  return (
    <svg
      viewBox={`0 0 ${BEAT_W} ${BEAT_H}`}
      width={BEAT_W * BEAT_PX}
      height={BEAT_H * BEAT_PX}
      shapeRendering="crispEdges"
      className="block overflow-hidden"
      style={{ "--beat-w": `${BEAT_W}px`, "--beat-n": BEAT.length } as CSSProperties}
    >
      <g className="wingbeat">
        {BEAT.map((frame, slot) => (
          <use key={slot} href={`#${id}-${frame}`} x={slot * BEAT_W} />
        ))}
      </g>
    </svg>
  );
}

/** Empty states: a few birds circling a patch with nothing in it, each turning to face the way it flies. */
export function EmptyFlock() {
  const id = useId();
  return (
    <div className="relative h-[104px] w-[200px]" aria-hidden="true">
      <WingbeatFrames id={id} />
      <span className="absolute bottom-3 left-1/2 h-[12px] w-[92px] -translate-x-1/2 rounded-[50%] bg-ink/7" />
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="orbit absolute top-[6px] left-[81px]"
          style={{ "--r": `${46 + i * 14}px`, "--dur": `${6 + i * 1.3}s`, "--delay": `-${i * 2.3}s`, "--beat": `${560 + i * 70}ms`, "--rest-x": i % 2 ? -1 : 1 } as CSSProperties}
        >
          <span className="orbit-face block">
            <FlyingBird id={id} />
          </span>
        </span>
      ))}
    </div>
  );
}
