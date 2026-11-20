"use client";
// Throwaway — Direction "City": golden hour over a voxel skyline of your areas. Axis: navigable overview.
// Each area is a tower banded by its topics; the skyline and the always-visible area list beside it are one
// direct-manipulation filter: click towers or names to sift, click again to leave. Pinned searches are gold beacons.

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { formatCount } from "@/components/format";

import { liveActions, useBrand, useLive, useMagpieEvents, type Brand } from "./brand";
import "./city.css";
import { birdCubes, VoxelScene, type Cube } from "./sprite";

const S = 6;
const BIRD_S = 1.6;
const FOOT = 3;
const MAX_H = 10;
// Area hues, kept clear of the gold (H 85) the pins use.
const AREA_HUES = [38, 205, 150, 12, 250, 175, 58, 300];

const BIRD = {
  K: "oklch(0.24 0.03 245)",
  W: "oklch(0.98 0.006 80)",
  B: "oklch(0.52 0.15 252)",
  G: "oklch(0.58 0.12 175)",
  V: "oklch(0.52 0.15 300)",
  E: "oklch(0.98 0.006 80)",
  Y: "oklch(0.85 0.15 85)",
  H: "oklch(0.96 0.07 95)",
  O: "oklch(0.66 0.13 68)",
};
const GOLD = "oklch(0.85 0.15 86)";
const LIT = "oklch(0.92 0.11 92)";
const GROUND = "oklch(0.83 0.04 72)";
const GROUND_2 = "oklch(0.8 0.045 66)";
const ROAD = "oklch(0.46 0.02 250)";
const DASH = "oklch(0.92 0.02 90)";
const STONE = "oklch(0.76 0.03 70)";

const areaColor = (i: number, band = 0) => `oklch(${band % 2 ? 0.62 : 0.7} 0.12 ${AREA_HUES[i % AREA_HUES.length] + band * 7})`;

/* The same projection and bounds VoxelScene uses, so overlays line up with the drawing. */
const C30 = Math.cos(Math.PI / 6);
const proj = (X: number, U: number, Z: number, s: number): [number, number] => [(X - Z) * C30 * s, ((X + Z) * 0.5 - U) * s];
function bounds(cubes: Cube[], s: number) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { x, u, z } of cubes) {
    for (const [X, U, Z] of [[x, u + 1, z], [x + 1, u, z], [x, u, z + 1], [x + 1, u + 1, z + 1], [x, u + 1, z + 1], [x + 1, u + 1, z], [x + 1, u, z + 1]]) {
      const [px, py] = proj(X, U, Z, s);
      minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
    }
  }
  const pad = s;
  return { x: Number((minX - pad).toFixed(1)), y: Number((minY - pad * 2).toFixed(1)), w: Number((maxX - minX + pad * 2).toFixed(1)), h: Number((maxY - minY + pad * 3).toFixed(1)) };
}
const hash = (x: number, u: number, z: number) => ((x * 73856093) ^ (u * 19349663) ^ (z * 83492791)) >>> 0;

type Tower = { id: number; name: string; count: number; i: number; x0: number; z0: number; h: number };

function useCity() {
  const { env } = useBrand();
  const { snapshot } = env;
  const { collection } = useLive();
  // Heights and bands follow the collection on screen, so the skyline answers "what have I got here?".
  const inCollection = (p: (typeof snapshot.posts)[number]) => !p.hidden && (collection === "bookmarks" ? p.bookmarked : collection === "likes" ? p.liked : true);
  const areaOfTopic = new Map(snapshot.topics.map((t) => [t.id, t.areaId]));
  const topicCount = new Map<number, number>();
  const areaPosts = new Map<number, Set<string>>();
  if (collection !== "everything") {
    for (const p of snapshot.posts) {
      if (!inCollection(p)) continue;
      for (const m of p.memberships) {
        topicCount.set(m.topicId, (topicCount.get(m.topicId) ?? 0) + 1);
        const areaId = areaOfTopic.get(m.topicId);
        if (areaId == null) continue;
        if (!areaPosts.has(areaId)) areaPosts.set(areaId, new Set());
        areaPosts.get(areaId)?.add(p.id);
      }
    }
  }
  const areaSize = (a: (typeof snapshot.areas)[number]) => (collection === "everything" ? a.postCount : (areaPosts.get(a.id)?.size ?? 0));
  const topicSize = (t: (typeof snapshot.topics)[number]) => (collection === "everything" ? t.postCount : (topicCount.get(t.id) ?? 0));
  const areas = snapshot.areas
    .filter((a) => !a.hidden && a.kind !== "system")
    .map((a) => ({ ...a, postCount: areaSize(a) }))
    .sort((a, b) => b.postCount - a.postCount)
    .slice(0, 7);
  const pins = snapshot.topics.filter((t) => t.kind === "pinned");
  const max = Math.max(1, ...areas.map((a) => a.postCount));
  // Back row first (tallest), front row after; the last front slot is the plaza.
  const slots = [0, 1, 2, 3].map((c) => ({ x0: 1 + c * 5, z0: 1 })).concat([0, 1, 2, 3].map((c) => ({ x0: 1 + c * 5, z0: 7 })));
  const towers: Tower[] = areas.map((a, i) => ({
    id: a.id,
    name: a.name,
    count: a.postCount,
    i,
    ...slots[i],
    h: Math.max(2, Math.round(MAX_H * Math.sqrt(a.postCount / max))),
  }));
  const plaza = slots[7];
  const bandsFor = (areaId: number) =>
    snapshot.topics
      .filter((t) => t.areaId === areaId && !t.hidden)
      .map((t) => ({ ...t, postCount: topicSize(t) }))
      .filter((t) => t.postCount > 0)
      .sort((a, b) => b.postCount - a.postCount)
      .slice(0, 4);
  return { towers, plaza, pins, bandsFor, collection, visible: snapshot.posts.filter(inCollection).length, areaCount: snapshot.areas.filter((a) => !a.hidden && a.kind !== "system").length };
}

function cityCubes(city: ReturnType<typeof useCity>, selected: number[], hot: number | null): Cube[] {
  const cubes: Cube[] = [];
  // Ground plate with a road between the rows.
  for (let x = 0; x < 20; x++) {
    for (let z = 0; z < 11; z++) {
      const road = z === 5;
      const color = road ? (x % 3 === 1 ? DASH : ROAD) : (x + z) % 2 ? GROUND : GROUND_2;
      cubes.push({ x, u: 0, z, color, delay: (x + z) * 6, key: `g${x},${z}`, cls: "vx" });
    }
  }
  const any = selected.length > 0;
  for (const t of city.towers) {
    const bands = city.bandsFor(t.id);
    const total = bands.reduce((s, b) => s + b.postCount, 0) || 1;
    const state = selected.includes(t.id) ? " ct-sel" : any ? " ct-dim" : "";
    const cls = `vx ct-tower${state}${hot === t.id ? " ct-hot" : ""}`;
    for (let l = 0; l < t.h; l++) {
      // Which topic band this storey belongs to, by the topics' share of the area.
      let acc = 0;
      let band = 0;
      for (let j = 0; j < bands.length; j++) {
        acc += bands[j].postCount / total;
        if ((l + 0.5) / t.h <= acc) {
          band = j;
          break;
        }
        band = j;
      }
      for (let dx = 0; dx < FOOT; dx++) {
        for (let dz = 0; dz < FOOT; dz++) {
          const x = t.x0 + dx;
          const z = t.z0 + dz;
          const u = 1 + l;
          const facade = dx === FOOT - 1 || dz === FOOT - 1;
          const lit = facade && l > 0 && l < t.h - 1 && hash(x, u, z) % 5 === 0;
          cubes.push({ x, u, z, color: lit ? LIT : areaColor(t.i, band), cls, delay: 120 + l * 32 + t.i * 18, key: `t${x},${u},${z}` });
        }
      }
    }
    if (selected.includes(t.id)) {
      cubes.push({ x: t.x0 + 1, u: 1 + t.h, z: t.z0 + 1, color: LIT, cls: "vx ct-tower ct-sel", key: `b${t.id}` });
    }
  }
  // Plaza: a low stone hall; every pinned search is a gold beacon on its roof.
  const { x0, z0 } = city.plaza;
  for (let dx = 0; dx < FOOT; dx++) for (let dz = 0; dz < FOOT; dz++) for (let l = 0; l < 2; l++) {
    cubes.push({ x: x0 + dx, u: 1 + l, z: z0 + dz, color: STONE, cls: "vx", delay: 160 + l * 40, key: `p${dx},${l},${dz}` });
  }
  city.pins.slice(0, 9).forEach((_, i) => {
    cubes.push({ x: x0 + (i % 3), u: 3, z: z0 + Math.floor(i / 3), color: GOLD, cls: "vx ct-gold", delay: 380 + i * 40, key: `pin${i}` });
  });
  return cubes;
}

function Skyline({ hot, setHot }: { hot: number | null; setHot: (id: number | null) => void }) {
  const { env } = useBrand();
  const live = useLive();
  const city = useCity();
  const cubes = cityCubes(city, live.areaIds, hot);
  // Bounds come from a full-height city, so the frame never shifts as the collection or selection changes.
  const vb = bounds(cityCubes({ ...city, towers: city.towers.map((t) => ({ ...t, h: MAX_H + 1 })) }, [], null), S);
  const pct = (px: number, py: number) => ({ left: ((px - vb.x) / vb.w) * 100, top: ((py - vb.y) / vb.h) * 100 });

  // The bird perches on the most recently selected tower, or the tallest.
  const towersById = new Map(city.towers.map((t) => [t.id, t]));
  const perchOn = [...live.areaIds].reverse().map((id) => towersById.get(id)).find(Boolean) ?? [...city.towers].sort((a, b) => b.h - a.h)[0];
  const perch = perchOn ? pct(...proj(perchOn.x0 + 1.5, 1 + perchOn.h + (live.areaIds.includes(perchOn.id) ? 1 : 0), perchOn.z0 + 1.5, S)) : { left: 50, top: 50 };

  const birdC = birdCubes(BIRD, { x: 0, u: 0, z: 0 }, 0);
  const bvb = bounds(birdC, BIRD_S);
  const [fx, fy] = proj(15.5, 1, 1.5, BIRD_S);
  const feet = { x: fx - bvb.x, y: fy - bvb.y };

  const boxRef = useRef<HTMLDivElement>(null);
  const birdRef = useRef<HTMLDivElement>(null);
  const prev = useRef(perch);
  useLayoutEffect(() => {
    const from = prev.current;
    prev.current = perch;
    const el = birdRef.current;
    const box = boxRef.current?.getBoundingClientRect();
    if (!el || !box || (from.left === perch.left && from.top === perch.top)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const dx = ((from.left - perch.left) / 100) * box.width;
    const dy = ((from.top - perch.top) / 100) * box.height;
    el.animate(
      [
        { translate: `${dx}px ${dy}px`, rotate: "0deg" },
        { translate: `${dx / 2}px ${dy / 2 - 34}px`, rotate: dx > 0 ? "6deg" : "-6deg", offset: 0.5 },
        { translate: "0px 0px", rotate: "0deg" },
      ],
      { duration: 560, easing: "cubic-bezier(0.45, 0, 0.25, 1)" },
    );
  }, [perch.left, perch.top]); // eslint-disable-line react-hooks/exhaustive-deps

  useMagpieEvents((e) => {
    if (e.type !== "surprise" || !birdRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    birdRef.current.animate(
      [{ translate: "0 0" }, { translate: "0 -14px", offset: 0.35 }, { translate: "0 0", offset: 0.7 }, { translate: "0 -4px", offset: 0.85 }, { translate: "0 0" }],
      { duration: 480, easing: "ease-out" },
    );
  });

  return (
    <div ref={boxRef} className="relative shrink-0" style={{ width: vb.w, maxWidth: "100%", aspectRatio: `${vb.w} / ${vb.h}` }}>
      <VoxelScene
        key={env.replay}
        cubes={cubes}
        s={S}
        className="ct-scene vx-build absolute inset-0 size-full"
        title={`Magpie City: ${city.towers.length} areas as towers, ${city.pins.length} pinned searches as gold beacons`}
      />
      {city.towers.map((t) => {
        const corners = [0, FOOT].flatMap((dx) => [0, FOOT].flatMap((dz) => [1, 1 + t.h].map((U) => proj(t.x0 + dx, U, t.z0 + dz, S))));
        const xs = corners.map((c) => c[0]);
        const ys = corners.map((c) => c[1]);
        const a = pct(Math.min(...xs), Math.min(...ys));
        const b = pct(Math.max(...xs), Math.max(...ys));
        const on = live.areaIds.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={on}
            aria-label={`Filter to ${t.name} (${formatCount(t.count)} posts)`}
            className="ct-hit"
            style={{ left: `${a.left}%`, top: `${a.top}%`, width: `${b.left - a.left}%`, height: `${b.top - a.top}%` }}
            onClick={() => liveActions.toggleArea(t.id)}
            onPointerEnter={() => setHot(t.id)}
            onPointerLeave={() => setHot(null)}
            onFocus={() => setHot(t.id)}
            onBlur={() => setHot(null)}
          />
        );
      })}
      <div
        key={`bird-${env.replay}`}
        ref={birdRef}
        className="ct-bird ct-bird-in"
        style={{ left: `calc(${perch.left}% - ${feet.x}px)`, top: `calc(${perch.top}% - ${feet.y}px)` } as CSSProperties}
      >
        <VoxelScene cubes={birdC} s={BIRD_S} />
      </div>
    </div>
  );
}

function Masthead() {
  const live = useLive();
  const city = useCity();
  const [hot, setHot] = useState<number | null>(null);
  const any = live.areaIds.length > 0;
  return (
    <section
      aria-label="Magpie City"
      className="relative -mb-1 grid items-center gap-x-5 gap-y-3 overflow-hidden rounded-card px-4 py-3 shadow-card sm:grid-cols-[auto_minmax(0,1fr)]"
      style={{ background: "linear-gradient(in oklch 170deg, oklch(0.9 0.06 62), oklch(0.95 0.035 80) 55%, oklch(0.97 0.02 85))" }}
    >
      <Skyline hot={hot} setHot={setHot} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <p className="text-[17px] leading-tight font-bold tracking-[-0.02em] text-ink">
            <span className="tabular-nums">{formatCount(city.visible)}</span> {city.collection === "bookmarks" ? "bookmarks" : city.collection === "likes" ? "likes" : "finds"} in{" "}
            <span className="tabular-nums">{city.areaCount}</span> districts
          </p>
          <p className="text-[12px] text-ink-muted">
            {any ? "Click more towers to add them, or again to leave." : "Click towers or names to sift."}{" "}
            {city.pins.length > 0 ? (
              <>
                <span className="tabular-nums">{city.pins.length}</span> gold {city.pins.length === 1 ? "beacon" : "beacons"} = pinned searches.
              </>
            ) : (
              "Pin an ask to light a gold beacon."
            )}
          </p>
        </div>
        <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {city.towers.map((t) => {
            const on = live.areaIds.includes(t.id);
            return (
              <li key={t.id} className="min-w-0">
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => liveActions.toggleArea(t.id)}
                  onPointerEnter={() => setHot(t.id)}
                  onPointerLeave={() => setHot(null)}
                  onFocus={() => setHot(t.id)}
                  onBlur={() => setHot(null)}
                  className={`ct-area flex h-7 w-full cursor-pointer items-center gap-2 rounded-[8px] border-0 px-2 text-left text-[13px] text-ink ${
                    on ? "bg-surface shadow-[0_0_0_1.5px_var(--color-ink)]" : hot === t.id ? "bg-surface/70" : any ? "bg-transparent opacity-70" : "bg-transparent"
                  }`}
                >
                  <span
                    className="size-3 shrink-0 rounded-[2px]"
                    style={{ background: areaColor(t.i), boxShadow: `inset -2px -2px 0 color-mix(in oklch, ${areaColor(t.i)}, black 22%)` }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                  <span className="shrink-0 text-[12px] text-ink-muted tabular-nums">{formatCount(t.count)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function MiniSkyline({ s }: { s: number }) {
  const cubes: Cube[] = [];
  const towers = [
    { x0: 0, h: 3, c: areaColor(1) },
    { x0: 2, h: 5, c: areaColor(0) },
    { x0: 4, h: 4, c: areaColor(2, 1) },
  ];
  for (const t of towers) for (let l = 0; l < t.h; l++) for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) {
    cubes.push({ x: t.x0 + dx, u: l, z: dz, color: l === t.h - 2 && dx === 1 ? LIT : t.c });
  }
  cubes.push({ x: 2, u: 5, z: 0, color: GOLD });
  return <VoxelScene cubes={cubes} s={s} className="block shrink-0" />;
}

function Mark() {
  // The skyline lives in the sidebar header, towers still clickable; the per-area list is gone (the tree has it).
  const [hot, setHot] = useState<number | null>(null);
  return (
    <span className="flex w-full items-end gap-3">
      <span className="block w-[120px] shrink-0">
        <Skyline hot={hot} setHot={setHot} />
      </span>
      <span className="pb-3 font-[family-name:var(--f-brico)] text-[24px] leading-none font-extrabold tracking-[-0.04em] text-side-ink">magpie</span>
    </span>
  );
}
void MiniSkyline;

function EmptyArt() {
  const { env } = useBrand();
  const cubes: Cube[] = [];
  for (let x = 9; x < 21; x++) for (let z = 0; z < 4; z++) cubes.push({ x, u: 0, z, color: (x + z) % 2 ? GROUND : GROUND_2, delay: (x + z) * 10 });
  cubes.push({ x: 19, u: 1, z: 1, color: STONE, delay: 200 });
  const bird = birdCubes(BIRD, { x: 0, u: 0, z: 0 }, 18).map((c) => ({ ...c, delay: (c.delay ?? 0) + 250 }));
  return <VoxelScene key={env.replay} cubes={[...cubes, ...bird]} s={3.2} className="vx-build" />;
}

export const city: Brand = { slug: "city", name: "City", Mark, EmptyArt };
void Masthead;
