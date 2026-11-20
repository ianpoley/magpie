"use client";
// Throwaway — Direction 3 "Nest": bright sky, a wing-blue branch for a sidebar. Axis: overview.
// A compact voxel nest above the page shows the shape of the corpus: one colour per area, sized by its posts,
// with a gold cube on top for every pinned search.

import { useState } from "react";

import { formatCount, relativeTime } from "@/components/format";

import { useBrand, useMagpieEvents, type Brand } from "./brand";
import { birdCubes, VoxelScene, type Cube } from "./sprite";

const BIRD = {
  K: "oklch(0.27 0.03 262)",
  W: "oklch(0.98 0.005 90)",
  B: "oklch(0.55 0.18 255)",
  G: "oklch(0.62 0.14 170)",
  V: "oklch(0.55 0.17 305)",
  E: "oklch(0.98 0.005 90)",
  Y: "oklch(0.84 0.15 85)",
  H: "oklch(0.95 0.08 95)",
  O: "oklch(0.68 0.14 70)",
};
// Gold (H 85) is reserved for pins, so no area sits near it.
const AREA_HUES = [25, 145, 300, 200, 345, 260, 50];
const areaColor = (i: number) => `oklch(0.74 0.15 ${AREA_HUES[i % AREA_HUES.length]})`;
const GOLD = "oklch(0.84 0.15 85)";
const WEEK = 7 * 24 * 60 * 60 * 1000;

function bowl() {
  const C = 11;
  const radii = [5.6, 7.6, 8.8, 9.4];
  const twigs: Cube[] = [];
  for (let u = 0; u < radii.length; u++) {
    for (let x = 0; x <= C * 2; x++) {
      for (let z = 0; z <= C * 2; z++) {
        const d = Math.hypot(x - C, z - C);
        if (!(u === 0 ? d <= radii[u] : d <= radii[u] && d >= radii[u] - 1.5)) continue;
        const color = (x * 7 + z * 13 + u * 5) % 3 === 0 ? "oklch(0.47 0.07 55)" : "oklch(0.56 0.075 62)";
        twigs.push({ x, u, z, color, delay: u * 80 + (x + z) * 5, key: `n${x},${u},${z}` });
      }
    }
  }
  const inside = (u: number, shrink: number) => {
    const cells: { x: number; u: number; z: number; d: number }[] = [];
    for (let x = 0; x <= C * 2; x++) for (let z = 0; z <= C * 2; z++) {
      const d = Math.hypot(x - C, z - C);
      if (d < radii[u] - 1.6 - shrink) cells.push({ x, u, z, d });
    }
    return cells.sort((a, b) => a.d - b.d || a.x - b.x || a.z - b.z);
  };
  return { twigs, lower: inside(1, 0), upper: inside(2, 2.2), C };
}
const BOWL = bowl();

export function useNestData() {
  const { env } = useBrand();
  const { snapshot, now } = env;
  const areas = snapshot.areas.filter((a) => !a.hidden && a.kind !== "system" && a.postCount > 0).sort((a, b) => b.postCount - a.postCount).slice(0, 7);
  const pins = snapshot.topics.filter((t) => t.kind === "pinned").length;
  const visible = snapshot.posts.filter((p) => !p.hidden);
  const fresh = visible.filter((p) => p.createdAtMs !== null && now - p.createdAtMs < WEEK).length;
  return { areas, pins, total: visible.length, fresh, synced: snapshot.lastCompleteRunAt ? relativeTime(snapshot.lastCompleteRunAt, now) : null, areaCount: snapshot.areas.filter((a) => !a.hidden && a.kind !== "system").length };
}

function Scene({ hot, s }: { hot: number | null; s: number }) {
  const { env } = useBrand();
  const { areas, pins } = useNestData();
  // A pin added while you watch drops in on its own; the rest arrive with the nest.
  const [prevPins, setPrevPins] = useState(pins);
  const [newPin, setNewPin] = useState<number | null>(null);
  if (pins !== prevPins) {
    setPrevPins(pins);
    setNewPin(pins > prevPins ? pins - 1 : null);
  }
  const total = areas.reduce((sum, a) => sum + a.postCount, 0) || 1;
  const n = Math.min(BOWL.lower.length, 46);
  const owners: number[] = [];
  areas.forEach((a, i) => {
    for (let j = 0; j < Math.max(1, Math.round((a.postCount / total) * n)); j++) owners.push(i);
  });
  owners.sort((a, b) => ((a * 7919) % 13) - ((b * 7919) % 13) || a - b);
  const trinkets: Cube[] = owners.slice(0, n).map((owner, i) => {
    const slot = BOWL.lower[(i * 17) % BOWL.lower.length];
    return { x: slot.x, u: slot.u, z: slot.z, color: areaColor(owner), cls: `vx tk${areas[owner].id === hot ? " tk-hot" : ""}`, delay: 600 + i * 16, key: `t${slot.x},${slot.z}` };
  });
  // Each pinned search stands as a two-cube gold stack above the trinkets.
  const gold: Cube[] = BOWL.upper.slice(0, pins).flatMap((slot, i) =>
    [0, 1].map((h) => ({ x: slot.x, u: slot.u + h, z: slot.z, color: GOLD, cls: "vx", delay: (i === newPin ? 0 : 1000 + i * 60) + h * 90, key: `g${i}-${h}` })),
  );
  const bird = birdCubes(BIRD, { x: BOWL.C - 16, u: 3, z: 1 }, 26).map((c) => ({ ...c, delay: (c.delay ?? 0) + 800 }));
  return (
    <VoxelScene
      key={env.replay}
      cubes={[...BOWL.twigs, ...trinkets, ...gold, ...bird]}
      s={s}
      hot={hot !== null}
      className="ns-scene vx-build block h-auto"
      title={`Your nest: ${areas.length} areas, ${pins} pinned searches in gold`}
    />
  );
}

function Masthead() {
  const { areas, pins, total, fresh, synced, areaCount } = useNestData();
  const [hot, setHot] = useState<number | null>(null);
  return (
    <section aria-label="Your nest" className="relative -mb-1 flex items-center gap-6 overflow-hidden rounded-card bg-[linear-gradient(in_oklch_160deg,oklch(0.93_0.05_225),oklch(0.97_0.03_200))] py-3 pr-6 pl-4 shadow-card">
      <div className="hidden shrink-0 sm:block">
        <Scene hot={hot} s={4.4} />
      </div>
      <div className="min-w-0 py-2">
        <p className="text-eyebrow text-ink-muted">Your nest</p>
        <p className="mt-1 text-[22px] leading-tight font-bold tracking-[-0.02em] text-ink">
          <span className="tabular-nums">{formatCount(total)}</span> finds in <span className="tabular-nums">{areaCount}</span> areas
        </p>
        <p className="mt-1 text-[13px] text-ink-muted">
          {synced ? <>Last flight {synced} · </> : null}
          <span className="tabular-nums">{formatCount(fresh)}</span> posted this week · {pins > 0 ? <><span className="tabular-nums">{pins}</span> pinned {pins === 1 ? "search" : "searches"} in gold</> : "pin an ask and it lands here in gold"}
        </p>
        <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
          {areas.map((area, i) => (
            <li key={area.id}>
              <span
                onPointerEnter={() => setHot(area.id)}
                onPointerLeave={() => setHot(null)}
                className="inline-flex cursor-default items-center gap-1.5 text-[12px] font-medium text-ink"
              >
                <span className="size-2.5 shrink-0" style={{ background: areaColor(i), boxShadow: `inset -2px -2px 0 color-mix(in oklch, ${areaColor(i)}, black 25%)` }} aria-hidden="true" />
                {area.name}
                <span className="text-ink-muted tabular-nums">{formatCount(area.postCount)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Mark() {
  const [hop, setHop] = useState(0);
  useMagpieEvents((e) => {
    if (e.type === "surprise" || e.type === "pin") setHop((h) => h + 1);
  });
  // The nest lives in the sidebar header: art only, no stats — the tree below already carries the numbers.
  return (
    <span className="flex w-full flex-col items-start gap-1">
      <span key={hop} data-play={hop ? "" : undefined} className="ns-hop -mb-2 inline-block">
        <Scene hot={null} s={3.3} />
      </span>
      <span className="text-[24px] leading-none font-extrabold tracking-[-0.04em] text-side-ink">magpie</span>
    </span>
  );
}

function EmptyArt() {
  const { env } = useBrand();
  return <VoxelScene key={env.replay} cubes={birdCubes(BIRD, { x: 0, u: 0, z: 0 }, 30)} s={4} className="vx-build" />;
}

export const nest: Brand = { slug: "nest", name: "Nest", Mark, EmptyArt };
void Masthead;
