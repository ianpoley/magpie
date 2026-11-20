"use client";
// Throwaway — Riff "Roost" on Murmur. Axis: the flock's LOCATION.
// Murmur's dawn sky stays, but the birds leave main and roost on the category tree: a thin wire under each area row,
// with tiny pixel magpies perched on it, as many as that area's share of what is on screen. Filter, search or ask and
// birds lift off the rows that drop out and fly to the rows that gain, so the tree itself shows where the sift went.
// Main stays clean (no totals line, no gutter flock). The roost never takes a click and sits below the row text.

import { useEffect, useRef, useState, type CSSProperties } from "react";

import type { Snapshot } from "@/lib/types";

import { useBrand, useLive, useMagpieEvents, type Brand } from "./brand";

import "./roost.css";

/* ---------------- data: birds per row ---------------- */

const PER_ROW = 16; // the busiest area in the whole collection fills its wire with this many
const UNFILED = "unfiled";

/** Posts per tree row (area rows and Unfiled) for a list of post ids. A post in two areas sits on both wires. */
function rowCounts(snapshot: Snapshot, ids: Iterable<string>): Map<string, number> {
  const topicArea = new Map(snapshot.topics.map((t) => [t.id, t.areaId]));
  const byId = new Map(snapshot.posts.map((p) => [p.id, p]));
  const out = new Map<string, number>();
  const inc = (k: string) => out.set(k, (out.get(k) ?? 0) + 1);
  for (const id of ids) {
    const post = byId.get(id);
    if (!post) continue;
    if (post.unfiled) inc(UNFILED);
    const seen = new Set<number>();
    for (const m of post.memberships) {
      const a = topicArea.get(m.topicId);
      if (a == null || seen.has(a)) continue;
      seen.add(a);
      inc(`area:${a}`);
    }
  }
  return out;
}

/** Birds per row: one bird stands for a fixed number of posts (set by the whole collection), so a sift visibly empties wires. */
function birdTargets(snapshot: Snapshot, ids: string[]): [string, number][] {
  const all = rowCounts(
    snapshot,
    snapshot.posts.filter((p) => !p.hidden).map((p) => p.id),
  );
  const unit = Math.max(1, Math.max(0, ...all.values()) / PER_ROW);
  return [...rowCounts(snapshot, ids)].map(([k, n]) => [k, n > 0 ? Math.min(PER_ROW, Math.max(1, Math.round(n / unit))) : 0] as [string, number]).filter(([, n]) => n > 0).sort((a, b) => a[0].localeCompare(b[0]));
}

/* ---------------- sprites ---------------- */

// 7×4, facing right. Perched: head up, blue wing gloss on the back, white belly, tail tipping down to the left, a foot on the wire.
const PERCH = [".....KK", "..BBKKK", ".KKWWK.", "K...K.."];
const FLY_UP = ["...BB..", "KKKKKKK", "...WW..", "......."];
const FLY_DOWN = [".......", "KKKBKKK", "..BWW..", "......."];
// Black birds on the dawn-indigo sidebar, rim-lit (see sprite) so the silhouette reads, not just the belly.
const INK = { K: "oklch(0.1 0.03 262)", W: "oklch(0.98 0.008 80)", B: "oklch(0.68 0.12 240)" };
const GOLD = { K: "oklch(0.66 0.13 72)", W: "oklch(0.97 0.06 95)", B: "oklch(0.86 0.15 88)" };
const WIRE = "oklch(0.86 0.035 70 / 0.2)";
const RIM = "oklch(0.84 0.06 62 / 0.42)";
const S = 2; // css px per art pixel
const BW = 7 * S;
const BH = 4 * S;

/** A sprite with a one-pixel rim of dawn light round it, so a black bird still reads against the indigo panel. */
function sprite(rows: string[], pal: Record<string, string>, flip: boolean): HTMLCanvasElement {
  const w = rows[0].length;
  const h = rows.length;
  const c = document.createElement("canvas");
  c.width = w + 2;
  c.height = h + 2;
  const g = c.getContext("2d");
  if (!g) return c;
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && rows[y][flip ? w - 1 - x : x] !== ".";
  g.fillStyle = RIM;
  for (let y = -1; y <= h; y++)
    for (let x = -1; x <= w; x++) if (!at(x, y) && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))) g.fillRect(x + 1, y + 1, 1, 1);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      g.fillStyle = pal[ch];
      g.fillRect((flip ? w - 1 - x : x) + 1, y + 1, 1, 1);
    }),
  );
  return c;
}

/* ---------------- the roost ---------------- */

type State = "perch" | "fly" | "orbit" | "loop" | "leave" | "fall";
type Bird = {
  key: string | null;
  rank: number;
  x: number;
  y: number;
  state: State;
  t: number;
  dur: number;
  delay: number;
  sx: number;
  sy: number;
  arc: number;
  vx: number;
  vy: number;
  alpha: number;
  facing: 1 | -1;
  phase: number;
  gold: number;
  startle: number;
};
type Row = { x0: number; x1: number; y: number };
type Sim = { setTargets: (t: [string, number][]) => void; setAsking: (on: boolean) => void; surprise: () => void; pin: () => void; remove: () => void; destroy: () => void };
const NOOP: Sim = { setTargets: () => {}, setAsking: () => {}, surprise: () => {}, pin: () => {}, remove: () => {}, destroy: () => {} };

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/** A stable shuffle of wire slots per row, so a few birds spread along the wire instead of bunching at one end. */
function slotOrder(key: string, n: number): number[] {
  let seed = [...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) >>> 0 || 1;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const ORDER = new Map<string, number[]>();
const orderOf = (key: string) => ORDER.get(key) ?? (ORDER.set(key, slotOrder(key, PER_ROW)), ORDER.get(key)!);

function createRoost(canvas: HTMLCanvasElement, reduced: boolean): Sim {
  const ctx = canvas.getContext("2d");
  const host = canvas.closest<HTMLElement>('aside, [role="dialog"]');
  if (!ctx || !host) return NOOP;

  const sprites = [INK, GOLD].map((pal) => [PERCH, FLY_UP, FLY_DOWN].map((f) => [sprite(f, pal, false), sprite(f, pal, true)]));

  let W = 0;
  let H = 0;
  let ox = 0; // host's viewport offset
  let oy = 0;
  let dpr = 1;
  let clip = { top: 0, bottom: 0 };
  let rows = new Map<string, Row>();
  let birds: Bird[] = [];
  let targets = new Map<string, number>();
  let asking = false;
  let fallPending = 0;
  let idle = 0;
  let raf = 0;
  let last = 0;
  let t = 0;
  let first = true;

  function measure() {
    const r = host!.getBoundingClientRect();
    if (r.width !== W || r.height !== H || window.devicePixelRatio !== dpr) {
      W = r.width;
      H = r.height;
      dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    // Fixed position is relative to the viewport unless an ancestor transforms (the mobile panel slides in); correct for either.
    if (r.left !== ox || r.top !== oy) {
      canvas.style.transform = "";
      const c = canvas.getBoundingClientRect();
      canvas.style.transform = `translate(${r.left - c.left}px, ${r.top - c.top}px)`;
      ox = r.left;
      oy = r.top;
    }
    const tree = host!.querySelector<HTMLElement>('[role="tree"]');
    rows = new Map();
    if (!tree) {
      clip = { top: 0, bottom: 0 };
      return;
    }
    // Perched birds are clipped to the scrolling part of the sidebar, so they scroll away with their rows.
    let top = 0;
    let bottom = H;
    for (let el: HTMLElement | null = tree.parentElement; el && el !== host; el = el.parentElement) {
      const oyStyle = getComputedStyle(el).overflowY;
      if (oyStyle === "visible") continue;
      const er = el.getBoundingClientRect();
      top = Math.max(top, er.top - oy);
      bottom = Math.min(bottom, er.bottom - oy);
    }
    clip = { top, bottom };
    for (const node of tree.querySelectorAll<HTMLElement>('[data-node^="area:"], [data-node="unfiled"]')) {
      const label = node.querySelector<HTMLElement>(":scope > [data-slot=tree-label]") ?? node;
      const lr = label.getBoundingClientRect();
      if (lr.height < 8) continue; // inside a collapsed group
      // The wire runs just under the row, through the gap above the next row's text, so birds never cross a name or a count.
      rows.set(node.dataset.node!, { x0: lr.left - ox + 10, x1: lr.right - ox - 10, y: lr.bottom - oy + 2 });
    }
  }

  const wireY = (row: Row, x: number) => {
    const k = Math.min(1, Math.max(0, (x - row.x0) / Math.max(1, row.x1 - row.x0)));
    return row.y + 4 * k * (1 - k) * 2; // 2px sag at the middle
  };

  /** Where a bird with this rank stands on this row's wire (top-left of its sprite). */
  function slot(key: string | null, rank: number): { x: number; y: number } | null {
    if (key === null) return null;
    const row = rows.get(key);
    if (!row) return null;
    const n = Math.max(1, Math.min(PER_ROW, Math.floor((row.x1 - row.x0) / (BW + 5))));
    const order = orderOf(key);
    const i = order[rank % PER_ROW] % n;
    const cx = row.x0 + ((i + 0.5) / n) * (row.x1 - row.x0) + (rank >= n ? 4 : 0);
    return { x: Math.round(cx - BW / 2), y: Math.round(wireY(row, cx) - BH) };
  }

  const orbitPoint = (b: Bird, i: number) => {
    const a = i * 2.39996 + t * 1.1;
    const ring = (i % 5) * 3;
    return { x: W / 2 + Math.cos(a) * (W * 0.36 + ring) - BW / 2, y: 40 + Math.sin(a) * (20 + ring * 0.6) };
  };

  function fly(b: Bird, delay = 0) {
    b.state = "fly";
    b.t = 0;
    b.delay = delay;
    b.sx = b.x;
    b.sy = b.y;
    const s = slot(b.key, b.rank);
    const d = s ? Math.hypot(s.x - b.x, s.y - b.y) : 0;
    b.dur = Math.min(1.3, 0.45 + d / 520);
    b.arc = Math.min(46, 10 + d * 0.25);
  }

  function makeBird(key: string, rank: number, from?: { x: number; y: number }): Bird {
    const s = slot(key, rank);
    const start = from ?? { x: W + 10, y: Math.max(20, (s?.y ?? H / 2) - rand(40, 110)) };
    return { key, rank, x: start.x, y: start.y, state: "perch", t: 0, dur: 0, delay: 0, sx: 0, sy: 0, arc: 0, vx: 0, vy: 0, alpha: 1, facing: Math.random() < 0.5 ? 1 : -1, phase: rand(0, 2), gold: 0, startle: 0 };
  }

  function depart(b: Bird) {
    b.key = null;
    if (reduced) {
      b.alpha = 0;
      return;
    }
    if (fallPending > t) {
      fallPending = 0;
      b.state = "fall";
      b.vx = rand(-10, 10);
      b.vy = -30;
    } else {
      b.state = "leave";
      b.vx = rand(60, 120);
      b.vy = rand(-70, -30);
    }
    b.t = 0;
  }

  /** Match the birds to the targets: keep who can stay, move the rest row to row, and only then send for more or let them go. */
  function reconcile() {
    measure();
    const placed = birds.filter((b) => b.key !== null);
    const free: Bird[] = [];
    const taken = new Map<string, Set<number>>();
    for (const b of placed) {
      const n = targets.get(b.key!) ?? 0;
      const set = taken.get(b.key!) ?? new Set<number>();
      if (b.rank < n && !set.has(b.rank)) {
        set.add(b.rank);
        taken.set(b.key!, set);
      } else {
        b.key = null;
        free.push(b);
      }
    }
    // Movers fly to the nearest open slot first, so a sift reads as birds hopping down the tree, not scrambling.
    const needs: { key: string; rank: number }[] = [];
    for (const [key, n] of targets) {
      const set = taken.get(key) ?? new Set<number>();
      for (let r = 0; r < n; r++) if (!set.has(r)) needs.push({ key, rank: r });
    }
    const shuffled = needs.sort(() => Math.random() - 0.5);
    shuffled.forEach((need, i) => {
      const b = free.pop();
      if (b) {
        b.key = need.key;
        b.rank = need.rank;
        if (reduced) {
          b.state = "perch";
        } else if (asking) {
          b.state = "orbit";
        } else fly(b, Math.min(0.5, i * 0.012));
      } else {
        const nb = makeBird(need.key, need.rank);
        birds.push(nb);
        if (reduced) nb.state = "perch";
        else if (asking) nb.state = "orbit";
        else fly(nb, (first ? rand(0, 0.7) : 0) + Math.min(0.5, i * 0.012));
      }
    });
    free.forEach(depart);
    first = false;
    if (reduced) draw();
  }

  function step(dt: number) {
    t += dt;
    measure();
    idle -= dt;
    const perched = birds.filter((b) => b.state === "perch" && b.key !== null);
    // Now and then one bird turns round on its wire: the roost is alive without anything moving across text.
    if (idle <= 0 && perched.length) {
      idle = rand(1.2, 2.8);
      const b = perched[Math.floor(Math.random() * perched.length)];
      b.facing = b.facing === 1 ? -1 : 1;
    }
    birds.forEach((b, i) => {
      b.t += dt;
      if (b.gold > 0) b.gold -= dt;
      if (b.startle > 0) b.startle -= dt;
      switch (b.state) {
        case "perch": {
          const s = slot(b.key, b.rank);
          if (s) {
            b.x = s.x;
            b.y = s.y - (b.startle > 0 ? (Math.floor(b.startle * 10) % 2) * 2 : 0);
          }
          break;
        }
        case "fly": {
          if (b.t < b.delay) break;
          const s = slot(b.key, b.rank);
          if (!s) {
            b.state = "perch";
            break;
          }
          const k = Math.min(1, (b.t - b.delay) / b.dur);
          const e = ease(k);
          const nx = b.sx + (s.x - b.sx) * e;
          b.facing = nx >= b.x ? 1 : -1;
          b.x = nx;
          b.y = b.sy + (s.y - b.sy) * e - Math.sin(Math.PI * k) * b.arc;
          b.phase += dt * 9;
          if (k >= 1) {
            b.state = "perch";
            b.phase = 0;
          }
          break;
        }
        case "orbit": {
          const p = orbitPoint(b, i);
          const f = Math.min(1, dt * 3.5);
          b.facing = p.x >= b.x ? 1 : -1;
          b.x += (p.x - b.x) * f;
          b.y += (p.y - b.y) * f;
          b.phase += dt * 8;
          break;
        }
        case "loop": {
          const s = slot(b.key, b.rank);
          const k = Math.min(1, b.t / 0.8);
          if (s) {
            const a = k * Math.PI * 2;
            b.x = s.x + Math.sin(a) * 12 * b.facing;
            b.y = s.y - (1 - Math.cos(a)) * 11;
          }
          b.phase += dt * 10;
          if (k >= 1) {
            b.state = "perch";
            b.phase = 0;
          }
          break;
        }
        case "leave":
          b.vx += 40 * dt;
          b.vy -= 20 * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.alpha -= dt * 1.1;
          b.phase += dt * 9;
          break;
        case "fall":
          b.vy += 520 * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.alpha -= dt * 1.2;
          break;
      }
    });
    birds = birds.filter((b) => b.alpha > 0 && b.x < W + 40 && b.y < H + 20);
  }

  function draw() {
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, W, H);
    if (!W || clip.bottom <= clip.top) return;
    ctx!.imageSmoothingEnabled = false;
    // The wires, clipped to the tree's scroller: every area has one, so an empty wire reads as "nothing here in this sift".
    ctx!.save();
    ctx!.beginPath();
    ctx!.rect(0, clip.top, W, clip.bottom - clip.top);
    ctx!.clip();
    ctx!.strokeStyle = WIRE;
    ctx!.lineWidth = 1;
    for (const row of rows.values()) {
      ctx!.beginPath();
      ctx!.moveTo(row.x0, row.y + 0.5);
      ctx!.quadraticCurveTo((row.x0 + row.x1) / 2, row.y + 4.5, row.x1, row.y + 0.5);
      ctx!.stroke();
    }
    for (const b of birds) if (b.state !== "orbit" && b.state !== "leave") paint(b);
    ctx!.restore();
    // Circling and departing birds are free of the scroller: the ask swirl rides over the header.
    for (const b of birds) if (b.state === "orbit" || b.state === "leave") paint(b);
    ctx!.globalAlpha = 1;
  }

  function paint(b: Bird) {
    if (b.state === "fly" && b.t < b.delay) return;
    if (b.state === "perch" && !slot(b.key, b.rank)) return;
    const gold = b.gold > 0 ? 1 : 0;
    const frame = b.state === "perch" ? (b.startle > 0 ? 1 + (Math.floor(b.startle * 12) & 1) : 0) : 1 + (Math.floor(b.phase) & 1);
    ctx!.globalAlpha = Math.max(0, Math.min(1, b.alpha)) * (b.state === "perch" ? 0.95 : 0.85);
    ctx!.drawImage(sprites[gold][frame][b.facing === 1 ? 0 : 1], Math.round(b.x) - S, Math.round(b.y) - S, BW + 2 * S, BH + 2 * S);
  }

  function loop(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    if (W || host!.getBoundingClientRect().width) {
      step(dt);
      draw();
    }
    raf = requestAnimationFrame(loop);
  }

  // Reduced motion: no flights and no idling, but the birds still follow their rows as the tree scrolls and opens.
  const redraw = () => {
    measure();
    draw();
  };
  const ro = new ResizeObserver(redraw);
  ro.observe(host);
  const onVisibility = () => {
    cancelAnimationFrame(raf);
    if (!document.hidden && !reduced) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  let mo: MutationObserver | null = null;
  if (reduced) {
    host.addEventListener("scroll", redraw, true);
    window.addEventListener("resize", redraw);
    // Expanding an area moves the rows under it without resizing the host.
    mo = new MutationObserver(redraw);
    mo.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-expanded", "aria-expanded", "hidden"] });
  } else {
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }
  measure();

  return {
    setTargets(next) {
      targets = new Map(next);
      reconcile();
    },
    setAsking(on) {
      if (on === asking) return;
      asking = on;
      if (reduced) return;
      if (on) {
        for (const b of birds) if (b.key !== null && b.state !== "leave" && b.state !== "fall") b.state = "orbit";
      } else {
        birds.filter((b) => b.state === "orbit").forEach((b, i) => fly(b, Math.min(0.6, i * 0.01)));
      }
    },
    surprise() {
      if (reduced) return;
      const list = birds.filter((b) => b.state === "perch" && slot(b.key, b.rank));
      if (!list.length) return;
      const b = list[Math.floor(Math.random() * list.length)];
      b.state = "loop";
      b.t = 0;
    },
    pin() {
      // A glint runs down the tree, wire by wire, left to right.
      const keys = [...rows.entries()].sort((a, b) => a[1].y - b[1].y).map(([k]) => k);
      for (const b of birds) {
        if (b.key === null) continue;
        const s = slot(b.key, b.rank);
        const order = Math.max(0, keys.indexOf(b.key));
        b.gold = 1.1 + order * 0.06 + (s ? s.x / Math.max(1, W) : 0) * 0.25;
      }
      if (reduced) draw();
    },
    remove() {
      if (reduced) return;
      // If the list shrinks enough to cost a bird, that bird drops off its wire; if not, a bird startles.
      fallPending = t + 0.8;
      window.setTimeout(() => {
        if (fallPending === 0) return;
        fallPending = 0;
        const list = birds.filter((b) => b.state === "perch" && slot(b.key, b.rank));
        if (list.length) list[Math.floor(Math.random() * list.length)].startle = 0.6;
      }, 700);
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      host.removeEventListener("scroll", redraw, true);
      window.removeEventListener("resize", redraw);
    },
  };
}

function Roost() {
  const { env } = useBrand();
  const live = useLive();
  const ref = useRef<HTMLCanvasElement>(null);
  const sim = useRef<Sim>(NOOP);
  const targets = birdTargets(env.snapshot, live.ids);
  const key = JSON.stringify(targets);

  useEffect(() => {
    if (!ref.current) return;
    const s = createRoost(ref.current, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    sim.current = s;
    return () => {
      s.destroy();
      sim.current = NOOP;
    };
  }, [env.replay]);
  useEffect(() => sim.current.setTargets(JSON.parse(key) as [string, number][]), [key, env.replay]);
  useEffect(() => sim.current.setAsking(live.asking), [live.asking, env.replay]);
  useMagpieEvents((e) => {
    if (e.type === "surprise") sim.current.surprise();
    if (e.type === "pin") sim.current.pin();
    if (e.type === "remove") sim.current.remove();
  });

  return <canvas ref={ref} aria-hidden="true" className="rs-roost" />;
}

/* ---------------- mark: birds standing on the wordmark ---------------- */

const MARK_INK = { K: "oklch(0.16 0.035 262)", W: "oklch(0.99 0.005 80)", B: "oklch(0.68 0.12 240)" };

function PerchBird({ flip, cell = 2 }: { flip?: boolean; cell?: number }) {
  return (
    <svg viewBox="0 0 7 4" width={7 * cell} height={4 * cell} shapeRendering="crispEdges" aria-hidden="true" style={flip ? { transform: "scaleX(-1)" } : undefined}>
      {PERCH.flatMap((row, y) =>
        [...row].flatMap((c, x) => (c === "." ? [] : [<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={MARK_INK[c as keyof typeof MARK_INK]} />])),
      )}
    </svg>
  );
}

// Left offsets in em, tuned to Bricolage Grotesque bold at the mark's size: on the m's shoulder, the p's bowl, the e's cap.
const ON_LETTERS = [
  { left: "0.12em", flip: false, d: 0 },
  { left: "1.88em", flip: true, d: 90 },
  { left: "2.62em", flip: false, d: 180 },
];

function Mark() {
  const { env } = useBrand();
  const [n, setN] = useState(0);
  useMagpieEvents((e) => {
    if (e.type !== "copy") setN((v) => v + 1);
  });
  return (
    <span className="flex items-end" role="img" aria-label="Magpie">
      <span className="relative inline-block pt-2 font-[family-name:var(--f-brico)] text-[26px] leading-none font-bold tracking-[-0.035em] text-side-ink" aria-hidden="true">
        magpie
        {ON_LETTERS.map((p, i) => (
          <span
            key={`${env.replay}-${n}-${i}`}
            data-play=""
            className="rs-perch"
            style={{ left: p.left, bottom: "0.5em", "--d": `${p.d}ms` } as CSSProperties}
          >
            <PerchBird flip={p.flip} />
          </span>
        ))}
      </span>
      <Roost />
    </span>
  );
}

/* ---------------- empty state: a bare wire ---------------- */

function EmptyArt() {
  const bird = (x: number, y: number, flip = false) =>
    PERCH.flatMap((row, ry) =>
      [...row].flatMap((c, rx) =>
        c === "." ? [] : [<rect key={`${x}-${rx}-${ry}`} x={x + (flip ? 6 - rx : rx)} y={y + ry} width={1} height={1} fill={c === "K" ? "oklch(0.3 0.03 255)" : c === "W" ? "oklch(0.99 0.005 80)" : "oklch(0.58 0.12 245)"} />],
      ),
    );
  return (
    <svg viewBox="0 0 90 30" width={180} height={60} shapeRendering="crispEdges" aria-hidden="true">
      <rect x={2} y={8} width={2} height={22} fill="oklch(0.24 0.03 255 / 0.18)" />
      <rect x={86} y={8} width={2} height={22} fill="oklch(0.24 0.03 255 / 0.18)" />
      <path d="M4 10 Q45 18 86 10" fill="none" stroke="oklch(0.24 0.03 255 / 0.22)" strokeWidth={0.6} shapeRendering="geometricPrecision" />
      <g className="rs-pacer">{bird(72, 6.6)}</g>
    </svg>
  );
}

export const roost: Brand = { slug: "roost", name: "Roost", Mark, EmptyArt };
