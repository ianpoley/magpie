"use client";
// Throwaway — Riff "Plumage" on Murmur. Axis: what the flock MEANS.
// Same dawn sky, sidebar and mark as Murmur. Here every bird is one post in the current result, and its plumage
// says how you kept it: white belly = bookmarked, rose breast = liked, gold = both. Birds wheel in sub-flocks by
// area, so the gutters read as the shape of what's on screen. A sift flies out exactly the posts that left.
// Usability first: birds stay in the gutters, low contrast, nothing to hover or open; the one-line row is the legend.

import { useEffect, useMemo, useRef, useState } from "react";

import { formatCount } from "@/components/format";
import type { Snapshot } from "@/lib/types";

import { useBrand, useLive, useMagpieEvents, type Brand } from "./brand";
import { murmur } from "./murmur";

import "./plumage.css";

/* ---------------- what each bird is ---------------- */

type Kind = 0 | 1 | 2; // 0 bookmarked · 1 liked · 2 both
type Entry = { id: string; kind: Kind; group: number };

const MIX = -1;

function useIndex(snapshot: Snapshot) {
  return useMemo(() => {
    const topicArea = new Map(snapshot.topics.map((t) => [t.id, t.areaId ?? MIX]));
    const areaName = new Map(snapshot.areas.map((a) => [a.id, a.name]));
    const posts = new Map(
      snapshot.posts.map((p) => {
        const kind: Kind = p.bookmarked && p.liked ? 2 : p.liked ? 1 : 0;
        const first = p.memberships[0];
        const group = first ? (topicArea.get(first.topicId) ?? MIX) : MIX;
        return [p.id, { kind, group }] as const;
      }),
    );
    return { posts, areaName };
  }, [snapshot]);
}

/* ---------------- the flock ---------------- */

const P = 2; // CSS px per art pixel
const MAX = 320; // birds drawn at once; a stable sample keeps the same posts as birds across sifts
const CELL = 10; // neighbour grid, art px

// 6×3 sprites facing right: a long tail, the belly/breast patch, one wing-gloss pixel.
const FRAME_UP = ["...B..", "KKKKKK", "...WW."];
const FRAME_DOWN = ["......", "KKKBKK", "..BWW."];
type Pal = { K: string; W: string; B: string };
const SLATE = "oklch(0.4 0.035 255)";
const GLOSS = "oklch(0.58 0.12 245)";
const PALS: Pal[] = [
  { K: SLATE, W: "oklch(0.99 0.005 80)", B: GLOSS }, // bookmarked: the classic pied magpie
  { K: SLATE, W: "oklch(0.66 0.2 8)", B: GLOSS }, // liked: rose breast
  { K: "oklch(0.56 0.11 66)", W: "oklch(0.93 0.1 92)", B: "oklch(0.8 0.15 82)" }, // both: gold
  { K: "oklch(0.5 0.15 40)", W: "oklch(0.97 0.05 70)", B: "oklch(0.72 0.16 48)" }, // pin glint: sunrise
];
const KIND_LABEL = ["bookmarked only", "liked only", "both"] as const;

type Bird = {
  id: string;
  kind: Kind;
  group: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  /** 0 flying · 1 flying home · 2 arriving · 3 diving · 4 falling */
  state: 0 | 1 | 2 | 3 | 4;
  t: number;
  glint: number;
  alpha: number;
  ex: number;
  ey: number;
  wander: number;
  dead: boolean;
};

type Slot = { group: number; home: 0 | 1; y: number; amp: number; ph: number };
type Tag = { el: HTMLSpanElement; group: number; x: number; y: number; w: number; placed: boolean; gone: number };

type Sim = { setPosts: (entries: Entry[], names: Map<number, string>) => void; setAsking: (on: boolean) => void; surprise: () => void; pin: () => void; fall: () => void; destroy: () => void };
const NOOP: Sim = { setPosts: () => {}, setAsking: () => {}, surprise: () => {}, pin: () => {}, fall: () => {}, destroy: () => {} };

function sprite(rows: string[], pal: Pal, flip: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = rows[0].length;
  c.height = rows.length;
  const g = c.getContext("2d");
  if (!g) return c;
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      g.fillStyle = pal[ch as keyof Pal];
      g.fillRect(flip ? row.length - 1 - x : x, y, 1, 1);
    }),
  );
  return c;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** FNV-1a; orders posts so the sample of birds is stable as filters narrow and widen. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createSim(canvas: HTMLCanvasElement, layer: HTMLDivElement, reduced: boolean): Sim {
  const main = canvas.parentElement;
  const ctx = canvas.getContext("2d");
  if (!main || !ctx) return NOOP;

  // sprites[palette][frame][facing]
  const sprites = PALS.map((pal) => [FRAME_UP, FRAME_DOWN].map((f) => [sprite(f, pal, false), sprite(f, pal, true)]));

  let L = 0;
  let aw = 0;
  let ah = 0;
  let cL = 0;
  let cR = 0;
  let narrow = false;
  const birds: Bird[] = [];
  const alive = new Map<string, Bird>();
  let desired = new Map<string, Entry>();
  let arrive: Entry[] = [];
  const leave = new Set<string>();
  let releaseRate = 200;
  let asking = false;
  let disperseUntil = 0;
  let fallUntil = -1;
  let vortex = { x: 0, y: 0, rx: 0, ry: 0 };
  let pinPoint = { x: 0, y: 0 };
  let slots: Slot[] = [];
  let slotOf = new Map<number, number>();
  let mixSlot = 0;
  let names = new Map<number, string>();
  const tags = new Map<number, Tag>();
  let raf = 0;
  let last = 0;
  let t = 0;
  let frame = 0;

  function measure() {
    if (!main) return;
    const r = main.getBoundingClientRect();
    L = r.left;
    const w = r.width;
    const h = window.innerHeight;
    for (const el of [canvas, layer]) {
      el.style.left = `${L}px`;
      el.style.width = `${w}px`;
    }
    canvas.style.height = `${h}px`;
    const nw = Math.ceil(w / P);
    const nh = Math.ceil(h / P);
    if (nw !== aw || nh !== ah) {
      aw = nw;
      ah = nh;
      canvas.width = aw;
      canvas.height = ah;
      ctx!.imageSmoothingEnabled = false;
    }
    const col = main.lastElementChild as HTMLElement | null;
    if (col) {
      const cr = col.getBoundingClientRect();
      const cs = getComputedStyle(col);
      cL = (cr.left + parseFloat(cs.paddingLeft) - L) / P - 6;
      cR = (cr.right - parseFloat(cs.paddingRight) - L) / P + 6;
    } else {
      cL = aw * 0.2;
      cR = aw * 0.8;
    }
    const wasNarrow = narrow;
    narrow = cL < 28 || aw - cR < 28;
    if (wasNarrow !== narrow) layout();
    else sizeTags();
    if (reduced) drawStatic();
  }

  function measureVortex() {
    const f = document.querySelector('form[role="search"]');
    if (!f) {
      vortex = { x: aw / 2, y: 50, rx: aw * 0.3, ry: 34 };
      return;
    }
    const r = f.getBoundingClientRect();
    vortex = { x: (r.left + r.width / 2 - L) / P, y: (r.top + r.height / 2) / P, rx: r.width / 2 / P + 26, ry: r.height / 2 / P + 30 };
  }

  const gutter = (home: 0 | 1) => (home === 0 ? { gl: 0, gw: cL } : { gl: cR, gw: aw - cR });

  /** Where a sub-flock wheels: its own band of its gutter, drifting slowly. */
  function anchor(slot: number) {
    const s = slots[slot] ?? { home: 0, y: 0.46, amp: 0.2, ph: 0 };
    if (narrow) return { x: aw / 2 + Math.sin(t * 0.11 + s.ph) * aw * 0.3, y: ah * (0.5 + 0.3 * Math.sin(t * 0.07 + s.ph * 1.7)) };
    const { gl, gw } = gutter(s.home);
    return { x: gl + gw / 2 + Math.sin(t * 0.13 + s.ph) * gw * 0.18, y: ah * (s.y + s.amp * Math.sin(t * 0.08 + s.ph * 1.7)) };
  }

  /** Big areas get their own flight; the long tail flies together as one mixed flock. */
  function layout() {
    const counts = new Map<number, number>();
    for (const e of desired.values()) counts.set(e.group, (counts.get(e.group) ?? 0) + 1);
    const total = desired.size;
    const named = narrow
      ? []
      : [...counts.entries()]
          .filter(([g, c]) => g !== MIX && c >= Math.max(8, total * 0.08))
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([g]) => g);
    const inNamed = named.reduce((n, g) => n + (counts.get(g) ?? 0), 0);
    const groups = total - inNamed > 0 ? [...named, MIX] : named;
    const perGutter: number[][] = [[], []];
    groups.forEach((g, i) => perGutter[i % 2].push(g));
    slots = [];
    slotOf = new Map();
    perGutter.forEach((list, home) =>
      list.forEach((g, j) => {
        const n = list.length;
        slotOf.set(g, slots.length);
        slots.push({ group: g, home: home as 0 | 1, y: n === 1 ? 0.46 : 0.16 + (0.68 * (j + 0.5)) / n, amp: n === 1 ? 0.28 : 0.2 / n, ph: (g === MIX ? 7 : g) * 1.37 });
      }),
    );
    mixSlot = slotOf.get(MIX) ?? 0;
    syncTags(named);
  }

  const slotFor = (group: number) => slotOf.get(group) ?? mixSlot;

  function syncTags(named: number[]) {
    const want = new Set(named);
    for (const [g, tag] of tags) {
      if (!want.has(g) && !tag.gone) {
        tag.el.removeAttribute("data-on");
        tag.gone = performance.now();
      }
    }
    for (const g of named) {
      const name = names.get(g);
      if (!name) continue;
      let tag = tags.get(g);
      if (!tag) {
        const el = document.createElement("span");
        el.className = "pl-tag";
        el.textContent = name;
        layer.appendChild(el);
        tag = { el, group: g, x: 0, y: 0, w: 0, placed: false, gone: 0 };
        tags.set(g, tag);
      }
      tag.gone = 0;
      tag.el.textContent = name;
    }
    sizeTags();
  }

  function sizeTags() {
    for (const tag of tags.values()) {
      const s = slots[slotOf.get(tag.group) ?? -1];
      if (!s) continue;
      const room = gutter(s.home).gw * P - 12;
      tag.el.style.maxWidth = `${Math.max(0, room)}px`;
      tag.w = Math.min(tag.el.scrollWidth, room);
      // Too tight a gutter for a readable name: leave the flight unlabelled rather than crowd the column.
      if (!tag.gone && room >= 72 && !narrow) tag.el.setAttribute("data-on", "");
      else tag.el.removeAttribute("data-on");
    }
  }

  function placeTags(dt: number, centroids: Map<number, { x: number; y: number; n: number }>) {
    const now = performance.now();
    const targets: { tag: Tag; home: 0 | 1; tx: number; ty: number }[] = [];
    for (const [g, tag] of tags) {
      if (tag.gone && now - tag.gone > 500) {
        tag.el.remove();
        tags.delete(g);
        continue;
      }
      const slot = slotOf.get(g);
      const s = slot === undefined ? null : slots[slot];
      const c = slot === undefined ? undefined : centroids.get(slot);
      if (!s || !c || !c.n) continue;
      const { gl, gw } = gutter(s.home);
      const tx = Math.min(Math.max(c.x * P - tag.w / 2, gl * P + 6), (gl + gw) * P - tag.w - 6);
      targets.push({ tag, home: s.home, tx, ty: c.y * P + 26 });
    }
    // Names in the same gutter never stack on each other: keep a line of air between them.
    for (const home of [0, 1] as const) {
      const list = targets.filter((x) => x.home === home).sort((a, b) => a.ty - b.ty);
      for (let i = 1; i < list.length; i++) list[i].ty = Math.max(list[i].ty, list[i - 1].ty + 22);
    }
    for (const { tag, tx, ty: rawY } of targets) {
      const ty = Math.min(Math.max(rawY, 8), ah * P - 20);
      const k = !tag.placed || dt === 0 ? 1 : Math.min(1, dt * 2.5);
      tag.x += (tx - tag.x) * k;
      tag.y += (ty - tag.y) * k;
      tag.placed = true;
      tag.el.style.transform = `translate3d(${tag.x.toFixed(1)}px, ${tag.y.toFixed(1)}px, 0)`;
    }
  }

  function makeBird(e: Entry, x: number, y: number, state: Bird["state"]): Bird {
    const a = anchor(slotFor(e.group));
    const d = Math.hypot(a.x - x, a.y - y) || 1;
    return { id: e.id, kind: e.kind, group: e.group, x, y, vx: ((a.x - x) / d) * 30, vy: ((a.y - y) / d) * 30, phase: rand(0, 2), state, t: 0, glint: 0, alpha: 1, ex: 0, ey: 0, wander: rand(0, Math.PI * 2), dead: false };
  }

  function spawn(e: Entry) {
    const s = slots[slotFor(e.group)];
    const home = s?.home ?? 0;
    const side = Math.random();
    const x = side < 0.7 ? (home === 0 ? -4 : aw + 4) : home === 0 ? rand(0, Math.max(1, cL)) : rand(cR, aw);
    const y = side < 0.7 ? rand(ah * 0.1, ah * 0.9) : -4;
    const b = makeBird(e, x, y, 2);
    birds.push(b);
    alive.set(e.id, b);
  }

  function depart(b: Bird) {
    alive.delete(b.id);
    // A removal: the bird that was that post drops out of the sky instead of flying home.
    if (t < fallUntil) {
      b.state = 4;
      b.vy = -8;
      fallUntil = -1;
      return;
    }
    b.state = 1;
    b.t = 0;
    b.ex = b.x < aw / 2 ? -1 : 1;
    b.ey = -0.5;
  }

  let cols = 1;
  let rows = 1;
  let head = new Int32Array(1);
  let next = new Int32Array(1);

  function step(dt: number) {
    t += dt;
    frame++;

    // Release arrivals and departures over time, proportional to the change, so a sift reads as a continuous flow.
    const budget = Math.max(1, Math.round(releaseRate * dt));
    for (let k = 0; k < budget && arrive.length; k++) {
      const e = arrive.pop()!;
      if (desired.has(e.id) && !alive.has(e.id)) spawn(e);
    }
    if (leave.size) {
      let k = 0;
      for (const id of leave) {
        if (k++ >= budget) break;
        leave.delete(id);
        const b = alive.get(id);
        if (b && !desired.has(id)) depart(b);
      }
    }
    // Top up: anyone in the result whose bird dived or fell comes back.
    if (frame % 30 === 0) {
      const queued = new Set(arrive.map((e) => e.id));
      for (const e of desired.values()) if (!alive.has(e.id) && !queued.has(e.id)) arrive.unshift(e);
    }

    if (asking && frame % 6 === 0) measureVortex();

    cols = Math.max(1, Math.ceil((aw + 40) / CELL));
    rows = Math.max(1, Math.ceil((ah + 40) / CELL));
    if (head.length !== cols * rows) head = new Int32Array(cols * rows);
    if (next.length < birds.length) next = new Int32Array(birds.length * 2);
    head.fill(-1);
    birds.forEach((b, i) => {
      if (b.state !== 0 && b.state !== 2) return;
      const gx = Math.min(cols - 1, Math.max(0, Math.floor((b.x + 20) / CELL)));
      const gy = Math.min(rows - 1, Math.max(0, Math.floor((b.y + 20) / CELL)));
      const c = gx + gy * cols;
      next[i] = head[c];
      head[c] = i;
    });

    const dispersing = !asking && t < disperseUntil;
    const centroids = new Map<number, { x: number; y: number; n: number }>();

    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      b.t += dt;
      let ax = 0;
      let ay = 0;
      let maxV = 22;
      let minV = 7;

      if (b.state === 0 || b.state === 2) {
        const slot = slotFor(b.group);
        // Boids: separate from everyone, but align and gather only with your own area, so flights stay distinct.
        let sx = 0, sy = 0, avx = 0, avy = 0, cx = 0, cy = 0, n = 0;
        const gx = Math.floor((b.x + 20) / CELL);
        const gy = Math.floor((b.y + 20) / CELL);
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const X = gx + ox;
            const Y = gy + oy;
            if (X < 0 || Y < 0 || X >= cols || Y >= rows) continue;
            for (let j = head[X + Y * cols], seen = 0; j !== -1 && seen < 14; j = next[j], seen++) {
              if (j === i) continue;
              const o = birds[j];
              const dx = b.x - o.x;
              const dy = b.y - o.y;
              const d2 = dx * dx + dy * dy;
              if (d2 > CELL * CELL || d2 === 0) continue;
              if (d2 < 30) {
                sx += dx / d2;
                sy += dy / d2;
              }
              if (slotFor(o.group) !== slot || n >= 10) continue;
              avx += o.vx;
              avy += o.vy;
              cx += o.x;
              cy += o.y;
              n++;
            }
          }
        }
        ax += sx * 60;
        ay += sy * 60;
        if (n) {
          ax += (avx / n - b.vx) * 0.6 + (cx / n - b.x) * 0.5;
          ay += (avy / n - b.vy) * 0.6 + (cy / n - b.y) * 0.5;
        }

        if (asking) {
          // The swirl: every flight joins one ellipse round the search bar while the ask judges.
          const k = i * 2.39996 + t * 0.9;
          const j = (i % 9) - 4;
          const tx = vortex.x + Math.cos(k) * (vortex.rx + j * 1.5);
          const ty = vortex.y + Math.sin(k) * (vortex.ry + j);
          ax += (tx - b.x) * 2.2 - b.vx * 0.9;
          ay += (ty - b.y) * 2.2 - b.vy * 0.9;
          maxV = 70;
          minV = 0;
        } else {
          const a = b.glint > 0.6 ? pinPoint : anchor(slot);
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const spring = b.glint > 0.6 ? 2.4 : 0.24;
          ax += -dx * spring;
          ay += -dy * spring;
          // Wheeling: each flight turns slowly round its own centre, alternate areas in opposite directions.
          const turn = slot % 2 === 0 ? 0.14 : -0.14;
          ax += -dy * turn;
          ay += dx * turn * 0.6;
          b.wander += rand(-1, 1) * dt * 1.2;
          ax += Math.cos(b.wander) * 4;
          ay += Math.sin(b.wander) * 4;
          if (dispersing) {
            const vx = b.x - vortex.x;
            const vy = b.y - vortex.y;
            const d = Math.hypot(vx, vy) || 1;
            ax += (vx / d) * 40;
            ay += (vy / d) * 40;
            maxV = 50;
          }
          // Keep out of the content column, so nothing ever moves behind text.
          if (!narrow && b.x > cL - 6 && b.x < cR + 6) {
            const toLeft = b.x - (cL - 6);
            const toRight = cR + 6 - b.x;
            ax += toLeft < toRight ? -90 - toLeft * 4 : 90 + toRight * 4;
            maxV = Math.max(maxV, 34);
          }
          if (b.y < 6) ay += (6 - b.y) * 8;
          if (b.y > ah - 6) ay -= (b.y - (ah - 6)) * 8;
          if (b.state === 0) {
            if (b.x < 3) ax += (3 - b.x) * 8;
            if (b.x > aw - 3) ax -= (b.x - (aw - 3)) * 8;
          }
          const c = centroids.get(slot) ?? { x: 0, y: 0, n: 0 };
          c.x += b.x;
          c.y += b.y;
          c.n++;
          centroids.set(slot, c);
        }
        if (b.state === 2) {
          maxV = Math.max(maxV, 40);
          if (b.t > 2.5) b.state = 0;
        }
        if (b.glint > 0) b.glint = Math.max(0, b.glint - dt);
      } else if (b.state === 1) {
        ax += b.ex * 60;
        ay += b.ey * 40;
        maxV = 60;
        minV = 20;
        if (b.x < -10 || b.x > aw + 10 || b.y < -10) b.dead = true;
      } else if (b.state === 3) {
        const tx = (window.innerWidth / 2 - L) / P;
        const ty = window.innerHeight / 2 / P;
        ax += (tx - b.x) * 4;
        ay += (ty - b.y) * 4;
        maxV = 110;
        minV = 30;
        b.alpha -= dt * 1.3;
        if (b.alpha <= 0 || Math.hypot(tx - b.x, ty - b.y) < 4) b.dead = true;
      } else {
        ay += 90;
        b.vx *= 0.99;
        maxV = 120;
        minV = 0;
        b.alpha -= dt * 0.7;
        if (b.alpha <= 0 || b.y > ah + 6) b.dead = true;
      }

      b.vx += ax * dt;
      b.vy += ay * dt;
      const v = Math.hypot(b.vx, b.vy) || 1;
      const clamp = v > maxV ? maxV / v : v < minV ? minV / v : 1;
      b.vx *= clamp;
      b.vy *= clamp;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.phase += dt * (v > 18 ? 5 : 2.2);
    }

    let w = 0;
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      if (b.dead) {
        if (alive.get(b.id) === b) alive.delete(b.id);
        continue;
      }
      birds[w++] = b;
    }
    birds.length = w;

    for (const c of centroids.values()) {
      c.x /= c.n;
      c.y /= c.n;
    }
    placeTags(dt, centroids);
  }

  function draw() {
    ctx!.clearRect(0, 0, aw, ah);
    const base = narrow ? 0.28 : 0.48;
    for (const b of birds) {
      const glintOn = b.glint > 0 && (b.glint < 1.2 || Math.floor(b.glint * 8) % 2 === 0);
      const s = sprites[glintOn ? 3 : b.kind][Math.floor(b.phase) & 1][b.vx < 0 ? 1 : 0];
      ctx!.globalAlpha = Math.min(1, base * Math.max(0, Math.min(1, b.alpha)) * (glintOn ? 1.7 : 1));
      ctx!.drawImage(s, Math.round(b.x) - 3, Math.round(b.y) - 1);
    }
    ctx!.globalAlpha = 1;
  }

  function drawStatic() {
    // Reduced motion: the same flights, scattered round their anchors and still.
    birds.length = 0;
    alive.clear();
    let seed = 7;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const centroids = new Map<number, { x: number; y: number; n: number }>();
    for (const e of desired.values()) {
      const slot = slotFor(e.group);
      const a = anchor(slot);
      const ang = r() * Math.PI * 2;
      const rad = Math.sqrt(r()) * 22;
      let x = a.x + Math.cos(ang) * rad * 1.3;
      if (!narrow) x = slots[slot]?.home === 1 ? Math.max(cR + 3, Math.min(aw - 3, x)) : Math.max(3, Math.min(cL - 3, x));
      const b = makeBird(e, x, Math.max(4, Math.min(ah - 4, a.y + Math.sin(ang) * rad)), 0);
      b.vx = r() < 0.5 ? -1 : 1;
      b.phase = 1;
      birds.push(b);
      alive.set(e.id, b);
      const c = centroids.get(slot) ?? { x: 0, y: 0, n: 0 };
      c.x += b.x;
      c.y += b.y;
      c.n++;
      centroids.set(slot, c);
    }
    for (const c of centroids.values()) {
      c.x /= c.n;
      c.y /= c.n;
    }
    placeTags(0, centroids);
    draw();
  }

  function loop(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    step(dt);
    draw();
    raf = requestAnimationFrame(loop);
  }

  const onVisibility = () => {
    if (reduced) return;
    cancelAnimationFrame(raf);
    if (!document.hidden) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  };

  const ro = new ResizeObserver(measure);
  ro.observe(main);
  window.addEventListener("resize", measure);
  document.addEventListener("visibilitychange", onVisibility);
  measure();
  if (!reduced) {
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  return {
    setPosts(entries, areaNames) {
      names = areaNames;
      const sample = entries.length > MAX ? [...entries].sort((a, b) => hash(a.id) - hash(b.id)).slice(0, MAX) : entries;
      desired = new Map(sample.map((e) => [e.id, e]));
      layout();
      if (reduced) {
        drawStatic();
        return;
      }
      // Birds that stay keep flying (and may change plumage or flight); only the difference moves.
      for (const b of alive.values()) {
        const e = desired.get(b.id);
        if (e) {
          b.kind = e.kind;
          b.group = e.group;
        } else leave.add(b.id);
      }
      arrive = arrive.filter((e) => desired.has(e.id));
      const queued = new Set(arrive.map((e) => e.id));
      const fresh = sample.filter((e) => !alive.has(e.id) && !queued.has(e.id));
      // Shuffle so arrivals mix across areas instead of landing one flight at a time.
      for (let i = fresh.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
      }
      arrive.push(...fresh);
      // Proportional: a big sift moves a lot of birds quickly, a small one trickles. Always done in ~0.9s.
      releaseRate = Math.max(40, Math.max(arrive.length, leave.size) / 0.9);
    },
    setAsking(on) {
      if (on === asking) return;
      asking = on;
      if (on) layer.setAttribute("data-asking", "");
      else layer.removeAttribute("data-asking");
      if (reduced) return;
      if (on) measureVortex();
      else disperseUntil = t + 1.1;
    },
    surprise() {
      if (reduced) return;
      const list = [...alive.values()].filter((b) => b.state === 0);
      if (list.length) {
        const b = list[Math.floor(Math.random() * list.length)];
        b.state = 3;
        b.t = 0;
        alive.delete(b.id);
      }
    },
    pin() {
      if (reduced) return;
      const slot = Math.floor(Math.random() * Math.max(1, slots.length));
      pinPoint = anchor(slot);
      [...alive.values()]
        .sort((a, b) => Math.hypot(a.x - pinPoint.x, a.y - pinPoint.y) - Math.hypot(b.x - pinPoint.x, b.y - pinPoint.y))
        .slice(0, 28)
        .forEach((b) => {
          b.glint = 2;
        });
    },
    fall() {
      if (reduced) return;
      fallUntil = t + 2;
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("visibilitychange", onVisibility);
      for (const tag of tags.values()) tag.el.remove();
      tags.clear();
    },
  };
}

function Backdrop() {
  const { env } = useBrand();
  const live = useLive();
  const index = useIndex(env.snapshot);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const sim = useRef<Sim>(NOOP);

  const entries = useMemo(
    () =>
      live.ids.flatMap((id): Entry[] => {
        const p = index.posts.get(id);
        return p ? [{ id, kind: p.kind, group: p.group }] : [];
      }),
    [live.ids, index],
  );

  // A brand replay rebuilds the sky, so every flight arrives again.
  useEffect(() => {
    if (!canvasRef.current || !layerRef.current) return;
    const s = createSim(canvasRef.current, layerRef.current, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    sim.current = s;
    return () => {
      s.destroy();
      sim.current = NOOP;
    };
  }, [env.replay]);
  useEffect(() => sim.current.setPosts(entries, index.areaName), [entries, index, env.replay]);
  useEffect(() => sim.current.setAsking(live.asking), [live.asking, env.replay]);
  useMagpieEvents((e) => {
    if (e.type === "surprise") sim.current.surprise();
    if (e.type === "pin") sim.current.pin();
    if (e.type === "remove") sim.current.fall();
  });

  return (
    <>
      <canvas ref={canvasRef} aria-hidden="true" className="pl-sky" />
      <div ref={layerRef} aria-hidden="true" className="pl-tags" />
    </>
  );
}

/* ---------------- masthead: the legend, one line ---------------- */

function useTweened(value: number) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = reduced ? 1 : Math.min(1, (now - t0) / 600);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = Math.round(start + (value - start) * eased);
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}

/** The legend's key: the same bird as in the sky, at full strength, beating once when its count moves. */
function KeyBird({ kind, count }: { kind: Kind; count: number }) {
  const pal = PALS[kind];
  const cells = (rows: string[]) =>
    rows.flatMap((row, y) => [...row].flatMap((c, x) => (c === "." ? [] : [<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={pal[c as keyof Pal]} />])));
  return (
    <svg key={count} data-play="" viewBox="0 0 6 3" width={12} height={6} shapeRendering="crispEdges" aria-hidden="true" className="pl-key block shrink-0">
      <g>{cells(FRAME_DOWN)}</g>
      <g className="pl-up">
        <rect x={0} y={0} width={6} height={3} fill="var(--color-canvas)" />
        {cells(FRAME_UP)}
      </g>
    </svg>
  );
}

function Count({ kind, value }: { kind: Kind; value: number }) {
  const shown = useTweened(value);
  return (
    <span className="flex items-center gap-1.5">
      <KeyBird kind={kind} count={value} />
      <span className="font-medium text-ink tabular-nums">{formatCount(shown)}</span>
      <span>{KIND_LABEL[kind]}</span>
    </span>
  );
}

function Masthead() {
  const { env } = useBrand();
  const live = useLive();
  const index = useIndex(env.snapshot);
  const kinds = useMemo(() => {
    const k = [0, 0, 0];
    for (const id of live.ids) {
      const p = index.posts.get(id);
      if (p) k[p.kind]++;
    }
    return k;
  }, [live.ids, index]);
  const inAir = useTweened(live.count);
  const filtered = live.count !== live.total || live.askQuery !== null;

  let state: string | null = null;
  if (live.asking && live.askQuery) state = `swirling over “${live.askQuery}”`;
  else if (filtered && live.total > live.count) state = `${formatCount(live.total - live.count)} flew home`;

  return (
    <p className="-mb-2 flex h-8 min-w-0 items-center gap-x-3 overflow-hidden text-[13px] whitespace-nowrap text-ink-muted">
      <span className="flex items-center gap-1.5">
        <span className="font-semibold text-ink tabular-nums">{formatCount(inAir)}</span>
        <span>in the air</span>
      </span>
      {([0, 1, 2] as const).map((k) => (kinds[k] ? <Count key={k} kind={k} value={kinds[k]} /> : null))}
      {state ? <span className="min-w-0 truncate">{state}</span> : null}
    </p>
  );
}

export const plumage: Brand = { slug: "plumage", name: "Plumage", Mark: murmur.Mark, EmptyArt: murmur.EmptyArt, Masthead, Backdrop };
