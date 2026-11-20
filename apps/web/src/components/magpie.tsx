"use client";
// The pixel magpie: the sidebar mark (with a wing beat when you act), and the birds that circle empty states.
// Colors are the bird inks in globals.css.

import { useState, type CSSProperties } from "react";

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

const FLY_SVG_INK = Object.fromEntries(Object.entries(FLY_INK).map(([k, v]) => [k, `var(${v})`]));
const flyCells = (rows: string[]) =>
  rows.flatMap((row, y) => [...row].flatMap((c, x) => (c === "." ? [] : [cell({ x, y, c }, `${x}-${y}`, FLY_SVG_INK)])));

function FlyingBird() {
  const size = 3;
  return (
    <svg viewBox="0 0 6 3" width={6 * size} height={3 * size} shapeRendering="crispEdges" className="orbit-bird block">
      <g>{flyCells(FLY_DOWN)}</g>
      <g className="wing-up">
        <rect x={0} y={0} width={6} height={3} className="fill-surface" />
        {flyCells(FLY_UP)}
      </g>
    </svg>
  );
}

/** Empty states: a few birds circling a patch with nothing in it. */
export function EmptyFlock() {
  return (
    <div className="relative h-[96px] w-[180px]" aria-hidden="true">
      <span className="absolute bottom-3 left-1/2 h-[12px] w-[92px] -translate-x-1/2 rounded-[50%] bg-ink/7" />
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="orbit absolute top-[38px] left-[81px]"
          style={{ "--r": `${40 + i * 9}px`, "--dur": `${5 + i * 0.8}s`, "--delay": `-${i * 1.4}s`, "--rest-x": i % 2 ? -1 : 1 } as CSSProperties}
        >
          <FlyingBird />
        </span>
      ))}
    </div>
  );
}
