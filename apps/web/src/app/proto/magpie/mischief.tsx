"use client";
// Throwaway — Direction 4 "Mischief": a cream daylight app with the magpie living in it. Axis: character.
// The bird perches above the page and answers what the app just did: the last sync, an ask, Surprise me, a pin, a removal.
// It narrates; it never gates or delays the action.

import { useState } from "react";

import { formatCount, relativeTime } from "@/components/format";

import { useBrand, useMagpieEvents, type Brand } from "./brand";
import { PixelBird } from "./sprite";

const PAINT = {
  K: "oklch(0.2 0.015 260)",
  W: "oklch(0.995 0.003 85)",
  B: "oklch(0.5 0.14 240)",
  G: "oklch(0.55 0.12 175)",
  V: "oklch(0.5 0.15 300)",
  E: "oklch(0.97 0 0)",
  Y: "oklch(0.83 0.15 85)",
  H: "oklch(0.97 0.06 95)",
  O: "oklch(0.62 0.13 66)",
};

const WEEK = 7 * 24 * 60 * 60 * 1000;
type Act = "idle" | "hop" | "think" | "shake";
type Line = { id: number; text: string; act: Act };

const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

function greeting(env: ReturnType<typeof useBrand>["env"]): string {
  const { snapshot, now } = env;
  const visible = snapshot.posts.filter((p) => !p.hidden);
  if (!snapshot.lastCompleteRunAt) return "I haven’t flown out yet. Run a sync and I’ll bring your saves back.";
  const fresh = visible.filter((p) => p.createdAtMs !== null && now - p.createdAtMs < WEEK).length;
  const topics = snapshot.topics.filter((t) => !t.hidden && t.kind !== "pinned").length;
  return `Back from X ${relativeTime(snapshot.lastCompleteRunAt, now)}. ${formatCount(fresh)} new this week, all sorted into ${formatCount(topics)} topics.`;
}

function Masthead() {
  const { env } = useBrand();
  const [line, setLine] = useState<Line>(() => ({ id: 0, text: greeting(env), act: "idle" }));
  const [seenReplay, setSeenReplay] = useState(env.replay);
  if (env.replay !== seenReplay) {
    setSeenReplay(env.replay);
    setLine({ id: line.id + 1, text: greeting(env), act: "hop" });
  }
  const say = (text: string, act: Act) => setLine((l) => ({ id: l.id + 1, text, act }));
  const total = env.snapshot.posts.filter((p) => !p.hidden).length;
  useMagpieEvents((e) => {
    if (e.type === "surprise") say(pick(["Ooh, this one’s shiny.", "Found this under the pile.", "Remember this one?", "Dug this out for you."]), "hop");
    if (e.type === "ask") say(`Rummaging through all ${formatCount(total)} finds…`, "think");
    if (e.type === "ask-done") {
      if (e.failed) say("I couldn’t finish judging that one. Try again?", "shake");
      else if (e.matches === 0) say("Nothing fits that. Try other words?", "shake");
      else say(`Found ${formatCount(e.matches)} that fit. Pin it if you’ll want it again.`, "hop");
    }
    if (e.type === "pin") say("Pinned. It lives in your topics now.", "hop");
    if (e.type === "remove") say("Tossed it. Undo if you change your mind.", "shake");
    if (e.type === "copy") say("Link’s on your clipboard.", "hop");
  });
  return (
    <div className="-mb-1 flex items-end gap-3" aria-hidden="true">
      <div key={`bird-${line.id}`} data-act={line.act} className="relative shrink-0">
        <PixelBird cell={3} paint={PAINT} className="mc-bird relative z-[1] block" style={{ marginBottom: -2 }} />
        <span className="block h-[6px] w-[96px] rounded-[1px] bg-[oklch(0.5_0.06_60)] shadow-[inset_0_-2px_0_oklch(0.4_0.06_55)]" />
      </div>
      <p
        key={`say-${line.id}`}
        className="mc-say relative mb-6 max-w-[52ch] rounded-[14px] bg-surface px-3.5 py-2.5 text-[14px] leading-[1.45] text-pretty text-ink shadow-card before:absolute before:-left-[6px] before:bottom-3 before:size-3 before:rotate-45 before:rounded-[2px] before:bg-surface before:shadow-[-1px_1px_0_oklch(0.22_0.015_260/0.07)] before:content-['']"
      >
        {line.text}
      </p>
    </div>
  );
}

function Mark() {
  return (
    <span className="flex items-end gap-2.5">
      <PixelBird cell={2} paint={PAINT} className="mc-bird shrink-0" title="Magpie" />
      <span className="pb-0.5 font-[family-name:var(--f-pixelify)] text-[24px] leading-none font-semibold text-side-ink">magpie</span>
    </span>
  );
}

function EmptyArt() {
  return <PixelBird cell={4} paint={PAINT} className="mc-bird" />;
}

export const mischief: Brand = { slug: "mischief", name: "Mischief", Mark, Masthead, EmptyArt };
