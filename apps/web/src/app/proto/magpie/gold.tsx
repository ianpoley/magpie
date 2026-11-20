"use client";
// Throwaway — Direction 2 "Gold": black, white and the coin the magpie carries. Axis: layout.
// The feed widens into a two-column wall of finds; the mark is the bird struck on a gold coin, which flips when you find something.

import { useState, type CSSProperties } from "react";

import { useBrand, useMagpieEvents, type Brand } from "./brand";
import { PixelBird } from "./sprite";

const PAINT = {
  K: "oklch(0.15 0.006 90)",
  W: "oklch(0.99 0.004 90)",
  B: "oklch(0.45 0.17 258)",
  G: "oklch(0.48 0.12 175)",
  V: "oklch(0.45 0.17 300)",
  E: "oklch(0.99 0 0)",
  Y: "oklch(0.97 0.07 95)",
  H: "oklch(1 0 0)",
  O: "oklch(0.55 0.12 70)",
};

const COIN: CSSProperties = {
  background:
    "radial-gradient(circle at 34% 28%, oklch(0.96 0.08 95), oklch(0.84 0.15 86) 45%, oklch(0.66 0.13 72) 100%)",
  boxShadow:
    "inset 0 0 0 2px oklch(0.92 0.1 92 / 0.9), inset 0 0 0 4px oklch(0.62 0.12 72 / 0.55), 0 1px 2px oklch(0 0 0 / 0.35), 0 6px 16px -6px oklch(0.6 0.13 75 / 0.6)",
};

function Coin({ size, cell }: { size: number; cell: number }) {
  const { env } = useBrand();
  const [n, setN] = useState(0);
  useMagpieEvents((e) => {
    if (e.type === "surprise" || e.type === "pin" || (e.type === "ask-done" && e.matches > 0)) setN((v) => v + 1);
  });
  return (
    <span
      key={`${env.replay}-${n}`}
      data-play=""
      className="gd-coin relative grid shrink-0 place-items-center overflow-hidden rounded-full"
      style={{ ...COIN, width: size, height: size }}
    >
      <PixelBird cell={cell} paint={PAINT} className="relative top-[1px] -left-[1px]" />
    </span>
  );
}

function Mark() {
  return (
    <span className="flex items-center gap-3">
      <Coin size={46} cell={1} />
      <span className="font-[family-name:var(--f-brico)] text-[30px] leading-none font-extrabold tracking-[0.01em] text-side-ink uppercase [font-stretch:75%]">Magpie</span>
    </span>
  );
}

function EmptyArt() {
  return <Coin size={120} cell={3} />;
}

export const gold: Brand = { slug: "gold", name: "Gold", Mark, EmptyArt, mainClass: "max-w-[1180px]" };
