"use client";
// Throwaway — Direction 1 "Night": a designed dark mode. Axis: theme.
// Black plumage with an oil-slick sheen; the sheen moves when the app does something (ask, surprise, pin).

import { useEffect, useState } from "react";

import { useBrand, useMagpieEvents, type Brand } from "./brand";
import { PixelBird } from "./sprite";

const PAINT = {
  K: "oklch(0.075 0.01 262)",
  W: "oklch(0.97 0.005 262)",
  B: "oklch(0.55 0.17 258)",
  G: "oklch(0.6 0.13 180)",
  V: "oklch(0.55 0.17 300)",
  E: "oklch(0.97 0 0)",
  Y: "oklch(0.84 0.15 85)",
  H: "oklch(0.97 0.06 95)",
  O: "oklch(0.64 0.13 68)",
};

/** Replays the sheen on every brand replay and on app events. */
function useSheen() {
  const { env } = useBrand();
  const [n, setN] = useState(0);
  useMagpieEvents((e) => {
    if (e.type === "ask") document.documentElement.classList.add("proto-asking");
    if (e.type === "ask-done") document.documentElement.classList.remove("proto-asking");
    if (e.type !== "ask" && e.type !== "remove") setN((v) => v + 1);
  });
  useEffect(() => () => document.documentElement.classList.remove("proto-asking"), []);
  return `${env.replay}-${n}`;
}

function Mark() {
  const key = useSheen();
  const [hover, setHover] = useState(0);
  return (
    <span className="flex items-end gap-3" onPointerEnter={() => setHover((h) => h + 1)}>
      <PixelBird key={`${key}-${hover}`} cell={2} paint={PAINT} className="nt-bird shrink-0" play title="Magpie" />
      <span className="pb-0.5 font-[family-name:var(--f-instrument-serif)] text-[28px] leading-none text-side-ink italic">Magpie</span>
    </span>
  );
}

function EmptyArt() {
  const key = useSheen();
  return <PixelBird key={key} cell={5} paint={PAINT} className="nt-bird" play />;
}

export const night: Brand = { slug: "night", name: "Night", Mark, EmptyArt };
