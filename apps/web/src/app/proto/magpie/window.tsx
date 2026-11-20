"use client";
// Throwaway — Direction 8 "Window": the sidebar header is a small window onto the magpie's world. Axis: ambient world.
// Everything in the scene is real state: the sky follows your clock, the weather is the last sync, the nest grows
// with the corpus, pinned searches glint gold in it, and the bird reacts to what the app just did.
// It is ambient only: nothing in it needs a click, and it stays compact so the category tree keeps its room.

import { useEffect, useRef, useState } from "react";

import { formatCount, relativeTime } from "@/components/format";
import type { Snapshot } from "@/lib/types";

import { useBrand, useMagpieEvents, type Brand } from "./brand";
import { bayer, MAGPIE, SPRITE_W } from "./sprite";

import "./window.css";

/* ---------------- colour (authored in OKLCH, converted once for the pixel buffer) ---------------- */

type RGB = [number, number, number];

function ok(L: number, C: number, hue: number): RGB {
  const a = C * Math.cos((hue * Math.PI) / 180);
  const b = C * Math.sin((hue * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((v) => {
    const c = Math.min(1, Math.max(0, v));
    return Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
  }) as RGB;
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/* ---------------- scene constants ---------------- */

const W = 112;
const H = 40;
const FPS = 8;

type Phase = "night" | "dawn" | "day" | "dusk";
const phaseOf = (h: number): Phase => (h < 5 || h >= 21 ? "night" : h < 8 ? "dawn" : h < 17.5 ? "day" : "dusk");
const timeWord = (h: number) => (h < 5 || h >= 21 ? "night" : h < 8 ? "dawn" : h < 12 ? "morning" : h < 17.5 ? "afternoon" : "evening");

const SKY: Record<Phase, RGB[]> = {
  night: [ok(0.19, 0.05, 270), ok(0.24, 0.06, 268), ok(0.3, 0.06, 262), ok(0.36, 0.05, 250)],
  dawn: [ok(0.55, 0.08, 270), ok(0.71, 0.09, 330), ok(0.81, 0.1, 40), ok(0.9, 0.09, 75)],
  day: [ok(0.66, 0.11, 245), ok(0.74, 0.09, 240), ok(0.82, 0.06, 230), ok(0.9, 0.035, 220)],
  dusk: [ok(0.4, 0.08, 285), ok(0.56, 0.12, 330), ok(0.7, 0.14, 40), ok(0.82, 0.12, 70)],
};
/** Foreground is pulled toward the light of the hour. */
const AMBIENT: Record<Phase, [RGB, number]> = {
  night: [ok(0.25, 0.06, 268), 0.5],
  dawn: [ok(0.75, 0.08, 20), 0.15],
  day: [ok(1, 0, 0), 0],
  dusk: [ok(0.55, 0.12, 35), 0.22],
};
/** A faint wash of the same hour behind the page heading (read by window.css). */
const TINT: Record<Phase, string> = {
  night: "oklch(0.86 0.05 270 / 0.4)",
  dawn: "oklch(0.92 0.06 40 / 0.5)",
  day: "oklch(0.93 0.05 230 / 0.45)",
  dusk: "oklch(0.9 0.07 30 / 0.45)",
};

const C = {
  rainDay: ok(0.66, 0.015, 250),
  rainNight: ok(0.3, 0.02, 260),
  rainFg: ok(0.55, 0.01, 250),
  drop: ok(0.86, 0.04, 235),
  star: ok(0.95, 0.03, 90),
  starDim: ok(0.7, 0.04, 260),
  sunCore: ok(0.97, 0.08, 100),
  sunRim: ok(0.9, 0.14, 85),
  sunLowCore: ok(0.93, 0.1, 85),
  sunLowRim: ok(0.82, 0.15, 50),
  moon: ok(0.94, 0.02, 95),
  cloudDay: ok(0.98, 0.008, 240),
  cloudDayShade: ok(0.89, 0.02, 240),
  cloudNight: ok(0.42, 0.03, 265),
  cloudNightShade: ok(0.35, 0.03, 265),
  cloudDusk: ok(0.86, 0.06, 30),
  cloudDuskShade: ok(0.74, 0.08, 20),
  cloudRain: ok(0.7, 0.01, 250),
  cloudRainShade: ok(0.58, 0.012, 250),
  hillFar: ok(0.64, 0.06, 165),
  hillNear: ok(0.52, 0.07, 155),
  bark: ok(0.43, 0.05, 55),
  barkHi: ok(0.54, 0.05, 62),
  barkDark: ok(0.33, 0.04, 50),
  leaf: ok(0.56, 0.12, 145),
  leafDark: ok(0.43, 0.1, 148),
  leafHi: ok(0.69, 0.13, 135),
  nest: [ok(0.5, 0.06, 65), ok(0.42, 0.05, 55), ok(0.6, 0.06, 75)] as RGB[],
  gold: ok(0.84, 0.15, 85),
  goldHi: ok(0.97, 0.07, 95),
  far: ok(0.32, 0.02, 260),
};
const TRINKETS: RGB[] = [ok(0.7, 0.15, 25), ok(0.74, 0.14, 145), ok(0.7, 0.13, 300), ok(0.76, 0.11, 200), ok(0.72, 0.14, 345), ok(0.78, 0.12, 60)];

const BIRD: Record<string, RGB> = {
  K: ok(0.2, 0.015, 260),
  W: ok(0.97, 0.005, 90),
  B: ok(0.5, 0.16, 255),
  G: ok(0.55, 0.12, 175),
  V: ok(0.5, 0.16, 300),
  E: ok(0.97, 0, 0),
  Y: ok(0.84, 0.15, 85),
  H: ok(0.97, 0.06, 95),
  O: ok(0.64, 0.13, 68),
};
const CELLS = MAGPIE.flatMap((row, y) => [...row].flatMap((c, x) => (c === "." ? [] : [{ x, y, c }])));

/** Deterministic noise so the scene is the same on every load. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(11);
const STARS = Array.from({ length: 30 }, () => ({ x: Math.floor(R() * W), y: Math.floor(R() * 22), seed: Math.floor(R() * 200), big: R() > 0.86 }));
const RAIN = Array.from({ length: 34 }, () => ({ x: R() * (W + 20), y: R() * H }));
const CLOUDS = [
  { x0: 6, y: 4, w: 15, speed: 0.035 },
  { x0: 64, y: 9, w: 10, speed: 0.025 },
  { x0: 38, y: 2, w: 8, speed: 0.045 },
];
const RAIN_CLOUDS = [...CLOUDS, { x0: 90, y: 3, w: 18, speed: 0.03 }, { x0: 20, y: 10, w: 14, speed: 0.02 }];

// Geometry: a branch rising from the left into the right edge, the nest on its low end, the bird near the high end.
const branchY = (x: number) => Math.round(33 - (x - 4) * (8 / 107));
const NX = 22;
const BX = 60;
const BY = branchY(BX + 16) - 1 - 16;
const leafCluster = (cx: number, cy: number, r: number, n: number) =>
  Array.from({ length: n }, () => {
    const a = R() * Math.PI * 2;
    const d = Math.sqrt(R()) * r;
    return { x: Math.round(cx + Math.cos(a) * d * 1.3), y: Math.round(cy + Math.sin(a) * d), k: R() };
  });
const LEAVES = [...leafCluster(104, 13, 3.2, 26), ...leafCluster(110, 20, 2.6, 16), ...leafCluster(6, 37, 2.4, 14), ...leafCluster(97, 18, 2, 9)];

/* ---------------- state + paint ---------------- */

type Weather = "clear" | "rain" | "away";

/** Same reading as components/sync-status.tsx: any failure, stale export or warning is rain; a running sync means the bird is out. */
function weatherOf(s: Snapshot): Weather {
  const run = s.lastRun;
  if (!s.storeExists || !run) return "clear";
  if (run.stages.some((st) => st.outcome === "failed") || run.status === "failed" || run.upstreamSync === "failed" || run.stages.some((st) => st.outcome === "warning")) return "rain";
  if (run.status === "running") return "away";
  return "clear";
}

function syncTitle(s: Snapshot, now: number): string {
  const run = s.lastRun;
  if (!s.storeExists || !run) return "Never synced";
  if (run.stages.some((st) => st.outcome === "failed") || run.status === "failed") return "Last sync failed";
  if (run.upstreamSync === "failed") return "X export is stale";
  if (run.stages.some((st) => st.outcome === "warning")) return "Sync had problems";
  if (run.status === "running") return "Syncing now";
  return s.lastCompleteRunAt ? `Synced ${relativeTime(s.lastCompleteRunAt, now)}` : "Synced";
}

type Drop = { x: number; y: number; vy: number; landed: number | null };
type Scene = {
  frame: number;
  total: number;
  pins: number;
  weather: Weather;
  force: number | null;
  bird: boolean;
  introStart: number;
  flight: number | null;
  asking: boolean;
  drops: Drop[];
};

function paint(d: Uint8ClampedArray, st: Scene, date: Date) {
  const f = st.frame;
  const h = st.force ?? date.getHours() + date.getMinutes() / 60;
  const phase = phaseOf(h);
  const rain = st.weather === "rain";
  const p = Math.min(1, Math.max(0, (f - st.introStart) / 14));
  const [amb, ambAmt] = AMBIENT[phase];
  const tint = (c: RGB): RGB => {
    const o = ambAmt ? mix(c, amb, ambAmt) : c;
    return rain ? mix(o, C.rainFg, 0.18) : o;
  };
  const put = (x: number, y: number, c: RGB) => {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= W || py >= H) return;
    const i = (py * W + px) * 4;
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
    d[i + 3] = 255;
  };

  // Sky: four bands per hour, Bayer-dithered between them. On replay the hour dissolves in from the one before.
  const to = SKY[phase];
  const from = SKY[phase === "night" ? "dusk" : "night"];
  for (let y = 0; y < H; y++) {
    const t = (y / (H - 1)) * (to.length - 1);
    const i = Math.min(to.length - 2, Math.floor(t));
    const fr = t - i;
    for (let x = 0; x < W; x++) {
      const pal = bayer(x + 1, y + 2) < p ? to : from;
      let c = fr > bayer(x, y) ? pal[i + 1] : pal[i];
      if (rain) c = mix(c, phase === "night" ? C.rainNight : C.rainDay, 0.5);
      put(x, y, c);
    }
  }

  // Stars, twinkling slowly.
  const dark = phase === "night" || (phase === "dusk" && h >= 20) || st.force !== null;
  if (dark && !rain) {
    for (const s of STARS) {
      if ((f + s.seed) % 90 < 4) continue;
      put(s.x, s.y, s.big ? C.star : C.starDim);
      if (s.big && (f + s.seed) % 90 > 45) {
        put(s.x - 1, s.y, C.starDim);
        put(s.x + 1, s.y, C.starDim);
      }
    }
  }

  // Sun or moon on an arc across the hour.
  const disc = (cx: number, cy: number, core: RGB, rim: RGB, crescent: boolean) => {
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const r = dx * dx + dy * dy;
        if (r > 9.5) continue;
        if (crescent && (dx + 2) ** 2 + (dy - 1) ** 2 <= 6.5) continue;
        put(cx + dx, cy + dy, r > 4 ? rim : core);
      }
  };
  if (!rain) {
    const rise = (1 - p) * 14;
    if (h >= 6 && h <= 19.5) {
      const t = (h - 6) / 13.5;
      const low = phase !== "day";
      disc(8 + t * 96, 30 - Math.sin(Math.PI * t) * 26 + rise, low ? C.sunLowCore : C.sunCore, low ? C.sunLowRim : C.sunRim, false);
    }
    if (h >= 19 || h < 6.5 || st.force !== null) {
      const t = st.force !== null ? 0.62 : ((h - 19 + 24) % 24) / 11.5;
      disc(8 + t * 96, 30 - Math.sin(Math.PI * Math.min(1, t)) * 24 + rise, C.moon, C.moon, true);
    }
  }

  // Clouds drift, slowly.
  const [cl, cls] = rain
    ? [C.cloudRain, C.cloudRainShade]
    : phase === "night"
      ? [C.cloudNight, C.cloudNightShade]
      : phase === "dusk" || phase === "dawn"
        ? [C.cloudDusk, C.cloudDuskShade]
        : [C.cloudDay, C.cloudDayShade];
  for (const c of rain ? RAIN_CLOUDS : CLOUDS) {
    const span = W + c.w + 10;
    const x0 = ((c.x0 + f * c.speed) % span) - c.w - 5;
    for (let dx = 0; dx < c.w; dx++) {
      const hp = Math.round(1.5 + 2 * Math.sin((Math.PI * dx) / (c.w - 1)) + (dx % 5 === 2 ? 1 : 0));
      for (let k = 0; k <= hp; k++) put(x0 + dx, c.y + 3 - k, k === 0 ? cls : cl);
    }
  }

  // While a sync runs the bird is out: a far silhouette crosses the sky.
  if (st.weather === "away") {
    const x = ((f * 0.4) % (W + 20)) - 10;
    const y = 12 + Math.sin(f * 0.12) * 2;
    const up = Math.floor(f / 3) % 2 === 0;
    put(x, y, C.far);
    put(x - 1, y + (up ? -1 : 1), C.far);
    put(x + 1, y + (up ? -1 : 1), C.far);
  }

  // Hills.
  for (let x = 0; x < W; x++) {
    const yf = Math.round(29 + 2 * Math.sin(x * 0.09 + 1) + 1.5 * Math.sin(x * 0.23));
    for (let y = yf; y < H; y++) put(x, y, tint(C.hillFar));
    const yn = Math.round(35 + 1.5 * Math.sin(x * 0.13 + 2) + 1.5 * Math.sin(x * 0.31));
    for (let y = yn; y < H; y++) put(x, y, tint(C.hillNear));
  }

  // Branch, twigs, leaves.
  for (let x = 2; x < W; x++) {
    const y = branchY(x);
    put(x, y - 1, tint(C.barkHi));
    put(x, y, tint(C.bark));
    if (x > 9) put(x, y + 1, tint(C.barkDark));
  }
  const twig = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) put(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, tint(i < n / 2 ? C.bark : C.barkHi));
  };
  twig(94, branchY(94) - 1, 104, 14);
  twig(101, branchY(101) - 1, 110, 21);
  twig(12, branchY(12), 6, 37);
  for (const l of LEAVES) put(l.x, l.y, tint(l.k < 0.3 ? C.leafDark : l.k > 0.8 ? C.leafHi : C.leaf));

  // The nest: wider as the corpus grows (log scale), trinkets inside, a gold pixel per pinned search.
  const nw = Math.max(10, Math.min(28, Math.round(8 + 5 * Math.log10(st.total + 1))));
  const nh = Math.max(3, Math.round(nw / 5));
  const bottom = branchY(NX);
  const top = bottom - nh + 1;
  const left = Math.round(NX - nw / 2);
  for (let r = 0; r < nh; r++) {
    const half = (nw / 2) * (1 - (r / nh) ** 2 * 0.4);
    for (let x = Math.round(NX - half); x <= Math.round(NX + half); x++) put(x, top + r, tint(C.nest[(x * 3 + (top + r) * 5) % 3]));
  }
  put(left - 1, top - 1, tint(C.nest[2]));
  put(left + nw + 1, top - 1, tint(C.nest[0]));
  const k = Math.max(2, Math.min(6, Math.round(Math.log2(st.total / 50 + 1))));
  for (let i = 0; i < k; i++) put(left + 2 + i * Math.floor((nw - 4) / k), top, TRINKETS[i % TRINKETS.length]);
  const pins = Math.min(st.pins, 8);
  for (let i = 0; i < pins; i++) {
    const x = NX + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 2;
    const glint = (f + i * 23) % 70 < 2;
    put(x, top - 1, glint ? C.goldHi : C.gold);
  }

  // The bird: perched, or out and back after Surprise me, searching while an ask runs.
  const drawBird = (ox: number, oy: number, o: { blink?: boolean; hx?: number; hy?: number; flap?: boolean; flip?: boolean; glint?: boolean }) => {
    for (const { x, y, c } of CELLS) {
      let cx = x;
      let cy = y;
      if (y <= 6 && x >= 14) {
        cx += o.hx ?? 0;
        cy += o.hy ?? 0;
      }
      if (o.flap && (c === "B" || (c === "W" && x <= 12 && y >= 9))) cy -= 3;
      if (o.flip) cx = SPRITE_W - 1 - cx;
      put(ox + cx, oy + cy, tint(BIRD[c === "E" && o.blink ? "K" : c]));
    }
    if (o.glint) {
      const gx = ox + (o.flip ? SPRITE_W - 1 - 25 : 25);
      const gy = oy + 4;
      put(gx, gy, C.goldHi);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) put(gx + dx * 2, gy + dy * 2, C.goldHi);
    }
  };
  if (st.bird && st.weather !== "away") {
    const flight = st.flight === null ? null : f - st.flight;
    if (flight !== null && flight < 8) {
      const u = flight / 7;
      drawBird(BX + u * 64, BY - Math.sin((u * Math.PI) / 2) * 16, { flap: flight % 2 === 0 });
    } else if (flight !== null && flight < 12) {
      // Out of frame.
    } else if (flight !== null && flight < 22) {
      const u = (flight - 12) / 9;
      const e = 1 - (1 - u) ** 2;
      drawBird(W + 8 + (BX - W - 8) * e, BY - 14 * (1 - e), { flap: u < 0.85 && flight % 2 === 0, flip: u < 0.9, glint: true });
    } else {
      const glint = flight !== null && flight < 34;
      const search = st.asking ? Math.floor(f / 4) % 4 : -1;
      drawBird(BX, BY, {
        blink: f % 48 === 0,
        hx: search === 1 ? 1 : search === 3 ? -1 : 0,
        hy: search >= 0 ? (search % 2 === 0 ? 1 : 0) : f % 120 >= 60 && f % 120 < 70 ? 1 : 0,
        glint,
      });
    }
  }

  // A pin drops into the nest.
  for (const drop of st.drops) {
    if (drop.landed === null) {
      drop.vy += 0.5;
      drop.y += drop.vy;
      if (drop.y >= top - 1) {
        drop.y = top - 1;
        drop.landed = f;
      }
    }
    put(drop.x, drop.y, (f + Math.round(drop.y)) % 3 === 0 ? C.goldHi : C.gold);
  }
  st.drops = st.drops.filter((drop) => drop.landed === null || f - drop.landed < 24);

  // Rain, calm.
  if (rain) {
    for (const r of RAIN) {
      r.y += 1.5;
      r.x -= 0.4;
      if (r.y > H) {
        r.y -= H + 3;
        r.x += 12;
      }
      if (r.x < -2) r.x += W + 20;
      put(r.x, r.y, C.drop);
      put(r.x, r.y + 1, C.drop);
    }
  }
}

/* ---------------- component ---------------- */

function Scene({ force, bird, label, width }: { force: number | null; bird: boolean; label: string | null; width?: number }) {
  const { env } = useBrand();
  const total = env.snapshot.posts.filter((p) => !p.hidden).length;
  const pins = env.snapshot.topics.filter((t) => t.kind === "pinned").length;
  const weather = force !== null ? "clear" : weatherOf(env.snapshot);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const redraw = useRef<() => void>(() => {});
  const st = useRef<Scene>({ frame: 0, total, pins, weather, force, bird, introStart: 0, flight: null, asking: false, drops: [] });

  useEffect(() => {
    Object.assign(st.current, { total, pins, weather, force, bird });
    redraw.current();
  }, [total, pins, weather, force, bird]);

  useEffect(() => {
    st.current.introStart = st.current.frame;
  }, [env.replay]);

  useMagpieEvents((e) => {
    const s = st.current;
    if (e.type === "surprise") s.flight = s.frame;
    if (e.type === "ask") s.asking = true;
    if (e.type === "ask-done") s.asking = false;
    if (e.type === "pin") s.drops.push({ x: NX + (s.pins % 2 ? 1 : -1) * Math.ceil(s.pins / 2) * 2, y: -2, vy: 0, landed: null });
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !wrap || !ctx) return;
    const lo = document.createElement("canvas");
    lo.width = W;
    lo.height = H;
    const lctx = lo.getContext("2d");
    if (!lctx) return;
    const img = lctx.createImageData(W, H);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) st.current.introStart = -100;

    const draw = () => {
      paint(img.data, st.current, new Date());
      lctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(lo, 0, 0, canvas.width, canvas.height);
    };
    redraw.current = draw;

    // Whole device pixels per scene pixel, so every pixel stays square and crisp at any sidebar width.
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const avail = (width ?? wrap.clientWidth) - 6;
      const s = Math.max(1, Math.floor((avail * dpr) / W));
      canvas.width = W * s;
      canvas.height = H * s;
      canvas.style.width = `${(W * s) / dpr}px`;
      canvas.style.height = `${(H * s) / dpr}px`;
      draw();
    };
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    fit();

    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || t - last < 1000 / FPS) return;
      last = t;
      st.current.frame += 1;
      draw();
    };
    if (!reduced) raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      redraw.current = () => {};
    };
  }, [width]);

  return (
    <div ref={wrapRef} className="win-wrap" style={width ? { width } : undefined}>
      <div className="win-unit">
        <div className="win-frame">
          <div className="win-glass">
            <canvas ref={canvasRef} role={label ? "img" : undefined} aria-label={label ?? undefined} aria-hidden={label ? undefined : true} />
          </div>
        </div>
        <div className="win-sill" aria-hidden="true" />
      </div>
    </div>
  );
}

function Mark() {
  const { env } = useBrand();
  const [clock, setClock] = useState(env.now);
  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const date = new Date(clock);
  const h = date.getHours() + date.getMinutes() / 60;
  const phase = phaseOf(h);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--win-tint", TINT[phase]);
    return () => {
      root.style.removeProperty("--win-tint");
    };
  }, [phase]);

  const snapshot = env.snapshot;
  const total = snapshot.posts.filter((p) => !p.hidden).length;
  const pins = snapshot.topics.filter((t) => t.kind === "pinned").length;
  const weather = weatherOf(snapshot);
  const sync = syncTitle(snapshot, clock);
  const sky = weather === "rain" ? `Rain this ${timeWord(h)}` : weather === "away" ? `The magpie is out this ${timeWord(h)}` : `Clear ${timeWord(h)}`;
  const label = `${sky}. ${sync}. ${formatCount(total)} saved posts in the nest${pins ? `, ${pins} pinned ${pins === 1 ? "search" : "searches"} in gold` : ""}.`;

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <Scene force={null} bird label={label} />
      <div className="flex min-w-0 items-baseline justify-between gap-2 px-0.5">
        <span className="win-word shrink-0">Magpie</span>
        <span className={`min-w-0 truncate text-[12px] tabular-nums ${weather === "rain" ? "text-side-ink" : "text-side-muted"}`} aria-hidden="true">
          {sync} · {formatCount(total)}
        </span>
      </div>
    </div>
  );
}

function EmptyArt() {
  return <Scene force={23} bird={false} label={null} width={240} />;
}

export const windowBrand: Brand = { slug: "window", name: "Window", Mark, EmptyArt };
