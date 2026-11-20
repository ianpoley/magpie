"use client";
// Throwaway — Direction 5 "Murmur": a dawn sky, and a flock of tiny pixel magpies that IS your result set. Axis: living data.
// Filter, search or ask and the sift becomes visible: birds fly home as results drop and arrive as they return.
// Usability first: the flock lives in the gutters (never behind the content column), drifts slowly, stays low-contrast,
// and only crosses the header during the brief swirl while an ask is judging. Nothing in it needs opening or hovering.

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { formatCount } from "@/components/format";

import { useBrand, useLive, useMagpieEvents, type Brand, type Live } from "./brand";
import { MAGPIE } from "./sprite";

import "./murmur.css";

/* ---------------- the flock ---------------- */

const P = 2; // CSS px per art pixel
const MAX = 320; // birds drawn at once (one per result up to this; calmer gutters)
const CELL = 10; // neighbour grid, art px

// 6×3 sprites facing right: a long tail, white belly flash, one wing-gloss pixel.
const FRAME_UP = ["...B..", "KKKKKK", "...WW."];
const FRAME_DOWN = ["......", "KKKBKK", "..BWW."];
const INK = { K: "oklch(0.4 0.035 255)", W: "oklch(0.99 0.005 80)", B: "oklch(0.58 0.12 245)" };
const GOLD = { K: "oklch(0.62 0.13 70)", W: "oklch(0.96 0.07 95)", B: "oklch(0.84 0.15 85)" };

type Bird = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  /** 0 flying · 1 flying home · 2 arriving · 3 diving · 4 falling */
  state: 0 | 1 | 2 | 3 | 4;
  t: number;
  home: 0 | 1;
  gold: number;
  alpha: number;
  ex: number;
  ey: number;
  wander: number;
  dead: boolean;
};

type Sim = { setTarget: (n: number) => void; setAsking: (on: boolean) => void; surprise: () => void; pin: () => void; fall: () => void; destroy: () => void };
const NOOP: Sim = { setTarget: () => {}, setAsking: () => {}, surprise: () => {}, pin: () => {}, fall: () => {}, destroy: () => {} };

function sprite(rows: string[], pal: Record<string, string>, flip: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = rows[0].length;
  c.height = rows.length;
  const g = c.getContext("2d");
  if (!g) return c;
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      g.fillStyle = pal[ch];
      g.fillRect(flip ? row.length - 1 - x : x, y, 1, 1);
    }),
  );
  return c;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function createSim(canvas: HTMLCanvasElement, reduced: boolean): Sim {
  const main = canvas.parentElement;
  const ctx = canvas.getContext("2d");
  if (!main || !ctx) return NOOP;

  // sprites[palette][frame][facing]
  const sprites = [INK, GOLD].map((pal) => [FRAME_UP, FRAME_DOWN].map((f) => [sprite(f, pal, false), sprite(f, pal, true)]));

  let L = 0;
  let aw = 0;
  let ah = 0;
  let cL = 0;
  let cR = 0;
  let narrow = false;
  const birds: Bird[] = [];
  let target = 0;
  let arriveQueue = 0;
  let leaveQueue = 0;
  let releaseRate = 200;
  let asking = false;
  let disperseUntil = 0;
  let vortex = { x: 0, y: 0, rx: 0, ry: 0 };
  let pinPoint = { x: 0, y: 0 };
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
    canvas.style.left = `${L}px`;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    // main grows as the list loads more; only touch the backing store when the sky's size really changes (resizing clears it).
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
    narrow = cL < 28 || aw - cR < 28;
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

  /** Each half of the flock drifts round its own gutter. */
  function anchor(home: 0 | 1) {
    if (narrow) return { x: aw / 2 + Math.sin(t * 0.11 + home * 2) * aw * 0.3, y: ah * (0.5 + 0.3 * Math.sin(t * 0.07 + home * 1.7)) };
    const gl = home === 0 ? 0 : cR;
    const gw = home === 0 ? cL : aw - cR;
    return { x: gl + gw / 2 + Math.sin(t * 0.13 + home * 2.1) * gw * 0.22, y: ah * (0.46 + 0.3 * Math.sin(t * 0.08 + home * 1.7)) };
  }

  function makeBird(x: number, y: number, home: 0 | 1, state: Bird["state"]): Bird {
    const a = anchor(home);
    const d = Math.hypot(a.x - x, a.y - y) || 1;
    return { x, y, vx: ((a.x - x) / d) * 30, vy: ((a.y - y) / d) * 30, phase: rand(0, 2), state, t: 0, home, gold: 0, alpha: 1, ex: 0, ey: 0, wander: rand(0, Math.PI * 2), dead: false };
  }

  function spawnFromEdge() {
    const home: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
    const side = Math.random();
    const x = side < 0.7 ? (home === 0 ? -4 : aw + 4) : home === 0 ? rand(0, Math.max(1, cL)) : rand(cR, aw);
    const y = side < 0.7 ? rand(ah * 0.1, ah * 0.9) : -4;
    birds.push(makeBird(x, y, home, 2));
  }

  const flyers = () => birds.filter((b) => !b.dead && (b.state === 0 || b.state === 2));

  function sendHome(b: Bird) {
    b.state = 1;
    b.t = 0;
    b.ex = b.x < aw / 2 ? -1 : 1;
    b.ey = -0.5;
  }

  // Grid for neighbour lookups.
  let cols = 1;
  let rows = 1;
  let head = new Int32Array(1);
  let next = new Int32Array(1);

  function step(dt: number) {
    t += dt;
    frame++;

    // Release arrivals and departures over time, proportional to the change, so a sift reads as a continuous flow.
    const budget = Math.max(1, Math.round(releaseRate * dt));
    for (let k = 0; k < budget && arriveQueue > 0; k++, arriveQueue--) spawnFromEdge();
    if (leaveQueue > 0) {
      const list = flyers();
      for (let k = 0; k < budget && leaveQueue > 0 && list.length; k++, leaveQueue--) sendHome(list.splice(Math.floor(Math.random() * list.length), 1)[0]);
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

    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      b.t += dt;
      let ax = 0;
      let ay = 0;
      let maxV = 22;
      let minV = 7;

      if (b.state === 0 || b.state === 2) {
        // Boids: separation, alignment, cohesion over a handful of neighbours.
        let sx = 0, sy = 0, avx = 0, avy = 0, cx = 0, cy = 0, n = 0;
        const gx = Math.floor((b.x + 20) / CELL);
        const gy = Math.floor((b.y + 20) / CELL);
        for (let oy = -1; oy <= 1 && n < 10; oy++) {
          for (let ox = -1; ox <= 1 && n < 10; ox++) {
            const X = gx + ox;
            const Y = gy + oy;
            if (X < 0 || Y < 0 || X >= cols || Y >= rows) continue;
            for (let j = head[X + Y * cols]; j !== -1 && n < 10; j = next[j]) {
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
          // The swirl: an ellipse round the search bar, everyone orbiting it.
          const k = i * 2.39996 + t * 0.9;
          const j = (i % 9) - 4;
          const tx = vortex.x + Math.cos(k) * (vortex.rx + j * 1.5);
          const ty = vortex.y + Math.sin(k) * (vortex.ry + j);
          ax += (tx - b.x) * 2.2 - b.vx * 0.9;
          ay += (ty - b.y) * 2.2 - b.vy * 0.9;
          maxV = 70;
          minV = 0;
        } else {
          // Calm drift round the home gutter.
          const a = b.gold > 0.6 ? pinPoint : anchor(b.home);
          const spring = b.gold > 0.6 ? 2.4 : 0.09;
          ax += (a.x - b.x) * spring;
          ay += (a.y - b.y) * spring;
          b.wander += rand(-1, 1) * dt * 1.2;
          ax += Math.cos(b.wander) * 4;
          ay += Math.sin(b.wander) * 4;
          if (dispersing) {
            const dx = b.x - vortex.x;
            const dy = b.y - vortex.y;
            const d = Math.hypot(dx, dy) || 1;
            ax += (dx / d) * 40;
            ay += (dy / d) * 40;
            maxV = 50;
          }
          // Keep out of the content column, so nothing ever moves behind text.
          if (!narrow && b.x > cL - 6 && b.x < cR + 6) {
            const toLeft = b.x - (cL - 6);
            const toRight = cR + 6 - b.x;
            ax += toLeft < toRight ? -90 - toLeft * 4 : 90 + toRight * 4;
            maxV = Math.max(maxV, 34);
          }
          // Soft walls.
          if (b.y < 6) ay += (6 - b.y) * 8;
          if (b.y > ah - 6) ay -= (b.y - (ah - 6)) * 8;
          if (b.state === 0) {
            if (b.x < 3) ax += (3 - b.x) * 8;
            if (b.x > aw - 3) ax -= (b.x - (aw - 3)) * 8;
          }
        }
        if (b.state === 2) {
          maxV = Math.max(maxV, 40);
          if (b.t > 2.5) b.state = 0;
        }
        if (b.gold > 0) b.gold = Math.max(0, b.gold - dt);
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
      // Slow wingbeats; gliding when cruising.
      b.phase += dt * (v > 18 ? 5 : 2.2);
    }

    // Compact, then top back up if a dive or a fall left the flock short.
    let w = 0;
    for (let i = 0; i < birds.length; i++) if (!birds[i].dead) birds[w++] = birds[i];
    birds.length = w;
    const short = target - (flyers().length + arriveQueue - leaveQueue);
    if (short > 0) arriveQueue += short;
  }

  function draw() {
    ctx!.clearRect(0, 0, aw, ah);
    const base = narrow ? 0.24 : 0.42;
    for (const b of birds) {
      const goldOn = b.gold > 0 && (b.gold < 1.2 || Math.floor(b.gold * 8) % 2 === 0);
      const s = sprites[goldOn ? 1 : 0][Math.floor(b.phase) & 1][b.vx < 0 ? 1 : 0];
      ctx!.globalAlpha = base * Math.max(0, Math.min(1, b.alpha)) * (goldOn ? 1.6 : 1);
      ctx!.drawImage(s, Math.round(b.x) - 3, Math.round(b.y) - 1);
    }
    ctx!.globalAlpha = 1;
  }

  function drawStatic() {
    // Reduced motion: the same flock, scattered and still.
    birds.length = 0;
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < target; i++) {
      const home: 0 | 1 = i % 2 === 0 ? 0 : 1;
      const x = narrow ? r() * aw : home === 0 ? r() * Math.max(1, cL - 4) : cR + 4 + r() * Math.max(1, aw - cR - 4);
      const b = makeBird(x, ah * 0.08 + r() * ah * 0.84, home, 0);
      b.vx = r() < 0.5 ? -1 : 1;
      b.phase = 1;
      birds.push(b);
    }
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
    setTarget(count) {
      target = Math.min(count, MAX);
      if (reduced) {
        drawStatic();
        return;
      }
      const flying = flyers().length + arriveQueue - leaveQueue;
      const diff = target - flying;
      // Proportional: a big sift moves a lot of birds quickly, a small one trickles. Always done in ~0.9s.
      releaseRate = Math.max(40, Math.abs(diff) / 0.9);
      if (diff > 0) {
        const cancel = Math.min(leaveQueue, diff);
        leaveQueue -= cancel;
        arriveQueue += diff - cancel;
      } else if (diff < 0) {
        const cancel = Math.min(arriveQueue, -diff);
        arriveQueue -= cancel;
        leaveQueue += -diff - cancel;
      }
    },
    setAsking(on) {
      if (reduced || on === asking) return;
      asking = on;
      if (on) measureVortex();
      else disperseUntil = t + 1.1;
    },
    surprise() {
      if (reduced) return;
      const list = flyers();
      if (list.length) {
        const b = list[Math.floor(Math.random() * list.length)];
        b.state = 3;
        b.t = 0;
      }
    },
    pin() {
      if (reduced) return;
      const home: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
      pinPoint = anchor(home);
      flyers()
        .sort((a, b) => Math.hypot(a.x - pinPoint.x, a.y - pinPoint.y) - Math.hypot(b.x - pinPoint.x, b.y - pinPoint.y))
        .slice(0, 28)
        .forEach((b) => {
          b.gold = 2;
        });
    },
    fall() {
      if (reduced) return;
      const list = flyers();
      if (list.length) list[Math.floor(Math.random() * list.length)].state = 4;
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}

function Backdrop() {
  const { env } = useBrand();
  const live = useLive();
  const ref = useRef<HTMLCanvasElement>(null);
  const sim = useRef<Sim>(NOOP);

  // A brand replay rebuilds the sky, so the whole flock flies in again.
  useEffect(() => {
    if (!ref.current) return;
    const s = createSim(ref.current, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    sim.current = s;
    return () => {
      s.destroy();
      sim.current = NOOP;
    };
  }, [env.replay]);
  useEffect(() => sim.current.setTarget(live.count), [live.count, env.replay]);
  useEffect(() => sim.current.setAsking(live.asking), [live.asking, env.replay]);
  useMagpieEvents((e) => {
    if (e.type === "surprise") sim.current.surprise();
    if (e.type === "pin") sim.current.pin();
    if (e.type === "remove") sim.current.fall();
  });

  return <canvas ref={ref} aria-hidden="true" className="mm-sky" />;
}

/* ---------------- masthead: one line of orientation ---------------- */

/** A number that eases to its new value, so the count reads as the same flow as the birds. */
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

type LiveCounts = Live & { bookmarked?: number; liked?: number };

function Masthead() {
  const { env } = useBrand();
  const live = useLive() as LiveCounts;
  const visible = env.snapshot.posts.filter((p) => !p.hidden);
  const filtered = live.count !== live.total || live.askQuery !== null;
  // Bookmarked/liked follow the filters when the shell publishes them; otherwise they are shown only for the unfiltered corpus.
  const bm = live.bookmarked ?? (filtered ? null : visible.filter((p) => p.bookmarked).length);
  const lk = live.liked ?? (filtered ? null : visible.filter((p) => p.liked).length);
  const inAir = useTweened(live.count);

  let state: string | null = null;
  if (live.asking && live.askQuery) state = `swirling over “${live.askQuery}”`;
  else if (filtered && live.total > live.count) state = `${formatCount(live.total - live.count)} flew home`;

  return (
    <p className="-mb-2 flex h-8 min-w-0 items-center gap-x-2.5 overflow-hidden text-[13px] whitespace-nowrap text-ink-muted">
      <span className="font-semibold text-ink tabular-nums">{formatCount(inAir)}</span>
      <span>in the air</span>
      {bm !== null ? (
        <>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{formatCount(bm)}</span>
          <span>bookmarked</span>
        </>
      ) : null}
      {lk !== null ? (
        <>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{formatCount(lk)}</span>
          <span>liked</span>
        </>
      ) : null}
      {state ? (
        <>
          <span aria-hidden="true">·</span>
          <span className="min-w-0 truncate">{state}</span>
        </>
      ) : null}
    </p>
  );
}

/* ---------------- mark: the sprite with a wing beat ---------------- */

type Px = { x: number; y: number; c: string };
const BASE: Px[] = MAGPIE.flatMap((row, y) => [...row].flatMap((c, x) => (c === "." ? [] : [{ x, y, c }])));
// Raised-wing frame: the gloss lifts above the back and the body closes underneath it.
const UP: Px[] = BASE.filter((p) => p.c === "B").flatMap((p) => [
  { x: p.x, y: p.y, c: "K" },
  { x: p.x + 1, y: p.y - 6, c: "B" },
]);

const MARK_PAINT: Record<string, string> = {
  K: "oklch(0.18 0.03 262)",
  W: "oklch(0.99 0.005 80)",
  B: "oklch(0.6 0.13 245)",
  G: "oklch(0.6 0.11 180)",
  V: "oklch(0.55 0.13 290)",
  E: "oklch(0.97 0 0)",
  Y: "oklch(0.84 0.15 85)",
  H: "oklch(0.97 0.06 95)",
  O: "oklch(0.64 0.13 68)",
};

function FlapBird({ cell, className, style }: { cell: number; className?: string; style?: CSSProperties }) {
  const w = MAGPIE[0].length;
  const h = MAGPIE.length;
  const rect = (p: Px, k: string) => <rect key={k} x={p.x} y={p.y} width={1} height={1} fill={MARK_PAINT[p.c] ?? MARK_PAINT.K} />;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w * cell} height={h * cell} shapeRendering="crispEdges" aria-hidden="true" className={className} style={{ overflow: "visible", ...style }}>
      <g>{BASE.map((p) => rect(p, `b${p.x}-${p.y}`))}</g>
      <g className="mm-up">{UP.map((p, i) => rect(p, `u${i}`))}</g>
    </svg>
  );
}

function Mark() {
  const { env } = useBrand();
  const [n, setN] = useState(0);
  useMagpieEvents((e) => {
    if (e.type !== "remove") setN((v) => v + 1);
  });
  return (
    <span className="flex items-end gap-3" onPointerEnter={() => setN((v) => v + 1)}>
      <span key={`${env.replay}-${n}`} data-play="" className="mm-flap inline-block shrink-0" role="img" aria-label="Magpie">
        <FlapBird cell={2} />
      </span>
      <span className="pb-0.5 font-[family-name:var(--f-brico)] text-[26px] leading-none font-bold tracking-[-0.035em] text-side-ink">magpie</span>
    </span>
  );
}

/* ---------------- empty state ---------------- */

function TinyBird() {
  const cell = 3;
  const cells = (rows: string[]) =>
    rows.flatMap((row, y) => [...row].flatMap((c, x) => (c === "." ? [] : [<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={INK[c as keyof typeof INK]} />])));
  return (
    <svg viewBox="0 0 6 3" width={6 * cell} height={3 * cell} shapeRendering="crispEdges" className="mm-tiny block">
      <g>{cells(FRAME_DOWN)}</g>
      <g className="mm-up">
        <rect x={0} y={0} width={6} height={3} fill="var(--color-surface)" />
        {cells(FRAME_UP)}
      </g>
    </svg>
  );
}

function EmptyArt() {
  return (
    <div className="relative h-[96px] w-[180px]" aria-hidden="true">
      <span className="absolute bottom-3 left-1/2 h-[12px] w-[92px] -translate-x-1/2 rounded-[50%] bg-[oklch(0.24_0.03_255/0.07)]" />
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="mm-orbit absolute top-[38px] left-[81px]"
          style={{ "--r": `${40 + i * 9}px`, "--dur": `${5 + i * 0.8}s`, "--delay": `-${i * 1.4}s` } as CSSProperties}
        >
          <TinyBird />
        </span>
      ))}
    </div>
  );
}

export const murmur: Brand = { slug: "murmur", name: "Murmur", Mark, Masthead, EmptyArt, Backdrop };
