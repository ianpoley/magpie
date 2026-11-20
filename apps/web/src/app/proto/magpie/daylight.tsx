"use client";
// Throwaway — riff on Murmur, "Daylight". Axis: palette / time.
// Murmur's flock, totals line and mark, unchanged in behaviour. The whole theme follows the viewer's clock instead:
// dawn (Murmur), day (clear high blue), dusk (low amber sun, birds as silhouettes), night (a real dark theme, pixel stars, moonlit birds).
// The phase lives on <html data-sky>; it cross-fades only when the clock crosses a boundary. Review any phase with #v=5&sky=night.

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";

import { useBrand, useLive, useMagpieEvents, type Brand } from "./brand";
import { murmur } from "./murmur";

import "./daylight.css";

/* ---------------- the phase ---------------- */

const PHASES = ["dawn", "day", "dusk", "night"] as const;
type Phase = (typeof PHASES)[number];

function clockPhase(d = new Date()): Phase {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 5 && h < 9) return "dawn";
  if (h >= 9 && h < 17) return "day";
  if (h >= 17 && h < 20.5) return "dusk";
  return "night";
}

/** Review override from the hash (#v=5&sky=dusk). Read only, never written. */
function overridePhase(): Phase | null {
  const s = new URLSearchParams(window.location.hash.slice(1)).get("sky");
  return (PHASES as readonly string[]).includes(s ?? "") ? (s as Phase) : null;
}

const phaseStore = {
  subscribe(cb: () => void) {
    window.addEventListener("hashchange", cb);
    const id = window.setInterval(cb, 30_000);
    return () => {
      window.removeEventListener("hashchange", cb);
      window.clearInterval(id);
    };
  },
  get: (): Phase => overridePhase() ?? clockPhase(),
};

/* ---------------- the flock (Murmur's sim, with a sky per phase) ---------------- */

const P = 2;
const MAX = 320;
const CELL = 10;

const FRAME_UP = ["...B..", "KKKKKK", "...WW."];
const FRAME_DOWN = ["......", "KKKBKK", "..BWW."];

type Pal = { K: string; W: string; B: string; O?: string };
const GOLD: Pal = { K: "oklch(0.62 0.13 70)", W: "oklch(0.96 0.07 95)", B: "oklch(0.84 0.15 85)" };
const SKY: Record<Phase, { ink: Pal; gold: Pal; alpha: number }> = {
  dawn: { ink: { K: "oklch(0.4 0.035 255)", W: "oklch(0.99 0.005 80)", B: "oklch(0.58 0.12 245)" }, gold: GOLD, alpha: 0.42 },
  day: { ink: { K: "oklch(0.34 0.04 255)", W: "oklch(1 0 0)", B: "oklch(0.56 0.15 240)" }, gold: GOLD, alpha: 0.4 },
  // Backlit by a low sun: every pixel one dark shape.
  dusk: { ink: { K: "oklch(0.24 0.035 25)", W: "oklch(0.24 0.035 25)", B: "oklch(0.24 0.035 25)" }, gold: { ...GOLD, K: "oklch(0.5 0.12 55)" }, alpha: 0.5 },
  // Dark birds with a pale moonlit rim.
  night: {
    ink: { K: "oklch(0.26 0.03 265)", W: "oklch(0.78 0.02 250)", B: "oklch(0.48 0.08 245)", O: "oklch(0.86 0.04 245)" },
    gold: { ...GOLD, O: "oklch(0.92 0.09 90)" },
    alpha: 0.55,
  },
};

type Bird = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
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

type Sim = {
  setTarget: (n: number) => void;
  setAsking: (on: boolean) => void;
  setSky: (p: Phase) => void;
  surprise: () => void;
  pin: () => void;
  fall: () => void;
  destroy: () => void;
};
const NOOP: Sim = { setTarget: () => {}, setAsking: () => {}, setSky: () => {}, surprise: () => {}, pin: () => {}, fall: () => {}, destroy: () => {} };

/** A sprite with a 1px margin, so a rim can sit outside the body. */
function sprite(rows: string[], pal: Pal, flip: boolean): HTMLCanvasElement {
  const w = rows[0].length;
  const h = rows.length;
  const c = document.createElement("canvas");
  c.width = w + 2;
  c.height = h + 2;
  const g = c.getContext("2d");
  if (!g) return c;
  const on = (x: number, y: number) => y >= 0 && y < h && x >= 0 && x < w && rows[y][x] !== ".";
  const X = (x: number) => (flip ? w - 1 - x : x) + 1;
  if (pal.O) {
    g.fillStyle = pal.O;
    for (let y = -1; y <= h; y++)
      for (let x = -1; x <= w; x++) if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) g.fillRect(X(x), y + 1, 1, 1);
  }
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      g.fillStyle = pal[ch as "K" | "W" | "B"];
      g.fillRect(X(x), y + 1, 1, 1);
    }),
  );
  return c;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function createSim(canvas: HTMLCanvasElement, reduced: boolean, initial: Phase): Sim {
  const main = canvas.parentElement;
  const ctx = canvas.getContext("2d");
  if (!main || !ctx) return NOOP;

  // sprites[phase][palette][frame][facing]
  const sprites = Object.fromEntries(
    PHASES.map((p) => [p, [SKY[p].ink, SKY[p].gold].map((pal) => [FRAME_UP, FRAME_DOWN].map((f) => [sprite(f, pal, false), sprite(f, pal, true)]))]),
  ) as Record<Phase, HTMLCanvasElement[][][]>;
  let sky = initial;

  let L = 0;
  let aw = 0;
  let ah = 0;
  let cL = 0;
  let cR = 0;
  let narrow = false;
  const birds: Bird[] = [];
  let stars: { x: number; y: number; ph: number; big: boolean }[] = [];
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

  function placeStars() {
    // Seeded, so the same sky comes back; gutters only, never behind the content column.
    let seed = 11;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    stars = [];
    if (narrow) return;
    const n = Math.round(((cL + (aw - cR)) * ah) / 900);
    for (let i = 0; i < n; i++) {
      const left = r() < cL / (cL + (aw - cR));
      const x = left ? 2 + r() * Math.max(1, cL - 6) : cR + 4 + r() * Math.max(1, aw - cR - 6);
      stars.push({ x: Math.round(x), y: Math.round(2 + r() * (ah - 4)), ph: r() * Math.PI * 2, big: r() < 0.12 });
    }
  }

  function measure() {
    if (!main) return;
    const r = main.getBoundingClientRect();
    L = r.left;
    const w = r.width;
    const h = window.innerHeight;
    canvas.style.left = `${L}px`;
    canvas.style.width = `${w}px`;
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
    narrow = cL < 28 || aw - cR < 28;
    placeStars();
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

  let cols = 1;
  let rows = 1;
  let head = new Int32Array(1);
  let next = new Int32Array(1);

  function step(dt: number) {
    t += dt;
    frame++;

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
          const k = i * 2.39996 + t * 0.9;
          const j = (i % 9) - 4;
          const tx = vortex.x + Math.cos(k) * (vortex.rx + j * 1.5);
          const ty = vortex.y + Math.sin(k) * (vortex.ry + j);
          ax += (tx - b.x) * 2.2 - b.vx * 0.9;
          ay += (ty - b.y) * 2.2 - b.vy * 0.9;
          maxV = 70;
          minV = 0;
        } else {
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
      b.phase += dt * (v > 18 ? 5 : 2.2);
    }

    let w = 0;
    for (let i = 0; i < birds.length; i++) if (!birds[i].dead) birds[w++] = birds[i];
    birds.length = w;
    const short = target - (flyers().length + arriveQueue - leaveQueue);
    if (short > 0) arriveQueue += short;
  }

  /** A filled pixel disc, optionally bitten by a second disc (the crescent). */
  function disc(cx: number, cy: number, r: number, color: string, bite?: { dx: number; dy: number }) {
    ctx!.fillStyle = color;
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r + r) continue;
        if (bite && (x - bite.dx) ** 2 + (y - bite.dy) ** 2 <= r * r) continue;
        ctx!.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
      }
  }

  function drawSky() {
    if (narrow) return;
    if (sky === "night") {
      for (const s of stars) {
        const tw = reduced ? 0.6 : 0.5 + 0.5 * Math.sin(t * 0.7 + s.ph);
        ctx!.globalAlpha = 0.18 + 0.42 * tw;
        ctx!.fillStyle = "oklch(0.93 0.03 90)";
        ctx!.fillRect(s.x, s.y, 1, 1);
        if (s.big) {
          ctx!.globalAlpha *= 0.5;
          ctx!.fillRect(s.x - 1, s.y, 1, 1);
          ctx!.fillRect(s.x + 1, s.y, 1, 1);
          ctx!.fillRect(s.x, s.y - 1, 1, 1);
          ctx!.fillRect(s.x, s.y + 1, 1, 1);
        }
      }
      ctx!.globalAlpha = 0.85;
      disc(cR + (aw - cR) * 0.62, 26, 6, "oklch(0.94 0.035 95)", { dx: 3, dy: -2 });
    } else if (sky === "dusk") {
      // The sun, half set behind the bottom of the left gutter.
      ctx!.globalAlpha = 0.22;
      disc(cL * 0.42, ah + 2, 18, "oklch(0.86 0.1 60)");
      ctx!.globalAlpha = 0.5;
      disc(cL * 0.42, ah + 2, 11, "oklch(0.8 0.13 55)");
    }
    ctx!.globalAlpha = 1;
  }

  function draw() {
    ctx!.clearRect(0, 0, aw, ah);
    drawSky();
    const set = sprites[sky];
    const a = SKY[sky].alpha;
    const base = narrow ? a * 0.57 : a;
    for (const b of birds) {
      const goldOn = b.gold > 0 && (b.gold < 1.2 || Math.floor(b.gold * 8) % 2 === 0);
      const s = set[goldOn ? 1 : 0][Math.floor(b.phase) & 1][b.vx < 0 ? 1 : 0];
      ctx!.globalAlpha = Math.min(1, base * Math.max(0, Math.min(1, b.alpha)) * (goldOn ? 1.6 : 1));
      ctx!.drawImage(s, Math.round(b.x) - 4, Math.round(b.y) - 2);
    }
    ctx!.globalAlpha = 1;
  }

  function drawStatic() {
    birds.length = 0;
    let seed = 7;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
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
    setSky(p) {
      sky = p;
      // Paint now, so a cross-fade's "after" snapshot already has the new birds.
      draw();
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
  const phase = useSyncExternalStore(phaseStore.subscribe, phaseStore.get, () => null);
  const ref = useRef<HTMLCanvasElement>(null);
  const sim = useRef<Sim>(NOOP);
  const shown = useRef<Phase | null>(null);

  // The phase goes on <html> before paint. A change the clock makes cross-fades; first paint and review overrides switch instantly.
  useLayoutEffect(() => {
    if (!phase) return;
    const root = document.documentElement;
    const apply = () => {
      root.dataset.sky = phase;
      sim.current.setSky(phase);
    };
    const fromClock = shown.current !== null && shown.current !== phase && overridePhase() === null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    shown.current = phase;
    if (fromClock && !reduced && typeof document.startViewTransition === "function") document.startViewTransition(apply);
    else apply();
  }, [phase]);
  useLayoutEffect(
    () => () => {
      delete document.documentElement.dataset.sky;
    },
    [],
  );

  useEffect(() => {
    if (!ref.current) return;
    const s = createSim(ref.current, window.matchMedia("(prefers-reduced-motion: reduce)").matches, shown.current ?? "dawn");
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

// Mark, totals line and empty state are Murmur's own; only the sky changes.
export const daylight: Brand = { ...murmur, slug: "daylight", name: "Daylight", Backdrop };
