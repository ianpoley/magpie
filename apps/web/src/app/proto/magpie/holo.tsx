"use client";
// Throwaway — Direction 7 "Holo": every saved post is a collectible foil card; the logo is a real 3D voxel magpie.
// Axis: material + 3D. Usability first: the foil lives on card edges only (never over text), tilt is ≤2.5°,
// responds instantly and settles in 150ms, and only the card under the pointer gets any work.
// No masthead: a strip of area cards would only repeat the category tree.

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

import { useBrand, useMagpieEvents, type Brand } from "./brand";
import { MAGPIE, SPRITE_H, SPRITE_W } from "./sprite";

import "./holo.css";

/* ------------------------------------------------------------------ */
/* The voxel model: the sprite extruded, exterior faces only.          */
/* ------------------------------------------------------------------ */

type V3 = [number, number, number];
type Face = { pts: V3[]; n: V3; c: string };

/** [L, C, H] per sprite character; gloss characters shift hue with the view angle. */
const PAL: Record<string, V3> = {
  K: [0.25, 0.012, 255],
  W: [0.97, 0.004, 240],
  B: [0.52, 0.17, 255],
  G: [0.6, 0.13, 175],
  V: [0.52, 0.16, 330],
  E: [0.98, 0, 0],
  Y: [0.84, 0.15, 85],
  H: [0.96, 0.07, 95],
  O: [0.66, 0.13, 68],
};
const GLOSS = new Set(["B", "G", "V"]);
const DEPTH: Record<string, [number, number]> = { K: [0, 3], W: [0, 3], B: [0, 3], E: [0, 3], G: [1, 2], V: [1, 2], Y: [1, 2], H: [1, 2], O: [1, 2] };

const FACES: Face[] = (() => {
  const cells: { x: number; y: number; z: number; c: string }[] = [];
  MAGPIE.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === ".") return;
      const [z0, z1] = DEPTH[c] ?? [0, 3];
      for (let z = z0; z < z1; z++) cells.push({ x, y, z, c });
    }),
  );
  const filled = new Set(cells.map(({ x, y, z }) => `${x},${y},${z}`));
  const has = (x: number, y: number, z: number) => filled.has(`${x},${y},${z}`);
  const ox = SPRITE_W / 2;
  const oy = SPRITE_H / 2;
  const oz = 1.5;
  const faces: Face[] = [];
  for (const { x, y, z, c } of cells) {
    // Model space: X right, Y up, Z toward the viewer at yaw 0.
    const X0 = x - ox, X1 = X0 + 1;
    const Y1 = oy - y, Y0 = Y1 - 1;
    const Z0 = z - oz, Z1 = Z0 + 1;
    const side = c === "E" ? "K" : c;
    const add = (pts: V3[], n: V3, color: string) => faces.push({ pts, n, c: color });
    if (!has(x, y - 1, z)) add([[X0, Y1, Z0], [X1, Y1, Z0], [X1, Y1, Z1], [X0, Y1, Z1]], [0, 1, 0], side);
    if (!has(x, y + 1, z)) add([[X0, Y0, Z1], [X1, Y0, Z1], [X1, Y0, Z0], [X0, Y0, Z0]], [0, -1, 0], side);
    if (!has(x, y, z + 1)) add([[X0, Y0, Z1], [X1, Y0, Z1], [X1, Y1, Z1], [X0, Y1, Z1]], [0, 0, 1], c);
    if (!has(x, y, z - 1)) add([[X1, Y0, Z0], [X0, Y0, Z0], [X0, Y1, Z0], [X1, Y1, Z0]], [0, 0, -1], c);
    if (!has(x + 1, y, z)) add([[X1, Y0, Z1], [X1, Y0, Z0], [X1, Y1, Z0], [X1, Y1, Z1]], [1, 0, 0], side);
    if (!has(x - 1, y, z)) add([[X0, Y0, Z0], [X0, Y0, Z1], [X0, Y1, Z1], [X0, Y1, Z0]], [-1, 0, 0], side);
  }
  return faces;
})();

const TAU = Math.PI * 2;
const PITCH = 0.42;
const LIGHT: V3 = (() => {
  const v: V3 = [-0.35, 0.78, 0.55];
  const m = Math.hypot(...v);
  return [v[0] / m, v[1] / m, v[2] / m];
})();
/** The resting pose: a three-quarter turn so the depth reads. */
const FRONT = -0.42;
/** The model fits a 28-unit box at any yaw. */
const FIT = 28;

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, yaw: number) {
  const ca = Math.cos(yaw), sa = Math.sin(yaw), cp = Math.cos(PITCH), sp = Math.sin(PITCH);
  const tf = ([x, y, z]: V3): V3 => {
    const X = x * ca + z * sa;
    const Z = -x * sa + z * ca;
    return [X, y * cp - Z * sp, y * sp + Z * cp];
  };
  const scale = Math.min(w, h) / FIT;
  const list: { f: Face; n: V3; d: number }[] = [];
  for (const f of FACES) {
    const n = tf(f.n);
    if (n[2] <= 0.0001) continue;
    let d = 0;
    for (const p of f.pts) d += tf(p)[2];
    list.push({ f, n, d });
  }
  list.sort((a, b) => a.d - b.d);
  ctx.clearRect(0, 0, w, h);
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(0.6, scale * 0.12);
  for (const { f, n } of list) {
    const [L, C, H] = PAL[f.c] ?? PAL.K;
    const lambert = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    const l = Math.min(0.99, L * (0.62 + 0.5 * lambert) + (f.c === "K" ? 0.04 * lambert : 0));
    // Gloss is view-dependent, as real iridescence is: the hue slides as the bird turns.
    const hue = GLOSS.has(f.c) ? H + 60 * Math.sin(yaw * 2 + n[0] * 1.6) : H;
    const color = `oklch(${l.toFixed(3)} ${C} ${hue.toFixed(1)})`;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.beginPath();
    f.pts.forEach((p, i) => {
      const [x, y] = tf(p);
      const sx = w / 2 + x * scale;
      const sy = h / 2 - y * scale + scale * 0.6;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

/** The bird, turning slowly; holds a front pose under the pointer; one quick turn when the app finds something. */
function Bird3D({ width, height, title, period = 18 }: { width: number; height: number; title?: string; period?: number }) {
  const { env } = useBrand();
  const ref = useRef<HTMLCanvasElement>(null);
  const motion = useRef({ hover: false, boost: 0 });
  const firstReplay = useRef(true);

  useMagpieEvents((e) => {
    if (e.type === "surprise" || e.type === "pin" || (e.type === "ask-done" && !e.failed)) motion.current.boost += TAU;
  });

  useEffect(() => {
    if (firstReplay.current) {
      firstReplay.current = false;
      return;
    }
    motion.current.boost += TAU;
  }, [env.replay]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const W = canvas.width;
    const H = canvas.height;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let yaw = FRONT;
    draw(ctx, W, H, yaw);
    if (reduced) return;

    let raf = 0;
    let last = 0;
    let onscreen = true;
    const frame = (t: number) => {
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;
      const m = motion.current;
      if (m.boost > 0) {
        // One fast revolution that eases out.
        const step = Math.min(m.boost, Math.max(dt * 2, m.boost * (1 - Math.exp(-dt * 3.5))));
        yaw += step;
        m.boost -= step;
      } else if (m.hover) {
        const target = Math.round((yaw - FRONT) / TAU) * TAU + FRONT;
        yaw += (target - yaw) * (1 - Math.exp(-dt * 8));
      } else {
        yaw += (dt * TAU) / period;
      }
      draw(ctx, W, H, yaw);
      raf = requestAnimationFrame(frame);
    };
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
      if (onscreen && !document.hidden) raf = requestAnimationFrame(frame);
    };
    const io = new IntersectionObserver(([entry]) => {
      onscreen = entry.isIntersecting;
      sync();
    });
    io.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [width, height, period]);

  return (
    <canvas
      ref={ref}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      onPointerEnter={() => {
        motion.current.hover = true;
      }}
      onPointerLeave={() => {
        motion.current.hover = false;
      }}
      style={{ width, height, display: "block" }}
    />
  );
}

function FoilTile({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span className="holo-tile" style={style}>
      {children}
    </span>
  );
}

function Mark() {
  return (
    <span className="flex items-center gap-3">
      <FoilTile>
        <Bird3D width={88} height={62} title="Magpie" />
      </FoilTile>
      <span className="holo-word">magpie</span>
    </span>
  );
}

function EmptyArt() {
  return (
    <FoilTile style={{ borderRadius: 18 }}>
      <Bird3D width={200} height={140} period={14} />
    </FoilTile>
  );
}

/* ------------------------------------------------------------------ */
/* Card tilt + foil: one delegated listener; only the card under the   */
/* pointer gets variables, and nothing runs while scrolling.           */
/* ------------------------------------------------------------------ */

const MAX_TILT = 2.5; // degrees
const SETTLE_MS = 150;
const HUE_RE = /oklch\(\s*[\d.]+%?\s+[\d.]+\s+([\d.]+)/;

function foilHue(card: HTMLElement): string {
  if (card.dataset.foilH) return card.dataset.foilH;
  // The author's hue, read once from their name's inline colour.
  const name = card.querySelector<HTMLElement>('header [style^="color"]');
  const match = name ? HUE_RE.exec(name.style.color || getComputedStyle(name).color) : null;
  let hue = match ? Number.parseFloat(match[1]) : NaN;
  if (!Number.isFinite(hue)) {
    let h = 0;
    for (const ch of card.textContent?.slice(0, 40) ?? "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    hue = h % 360;
  }
  card.dataset.foilH = String(Math.round(hue));
  card.style.setProperty("--foil-h", card.dataset.foilH);
  return card.dataset.foilH;
}

const VARS = ["--rx", "--ry", "--mx", "--my", "--tx", "--ty"];

function useCardFoil() {
  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timers = new WeakMap<HTMLElement, number>();
    let current: HTMLElement | null = null;
    let pressed = false;
    let raf = 0;
    let pending: { card: HTMLElement; x: number; y: number } | null = null;

    const clear = (card: HTMLElement) => {
      VARS.forEach((v) => card.style.removeProperty(v));
      delete card.dataset.holo;
    };
    const release = (card: HTMLElement | null) => {
      if (!card) return;
      VARS.forEach((v) => card.style.removeProperty(v));
      card.dataset.holo = "settle";
      window.clearTimeout(timers.get(card));
      timers.set(
        card,
        window.setTimeout(() => {
          if (card.dataset.holo === "settle") clear(card);
        }, SETTLE_MS + 30),
      );
    };
    const apply = () => {
      raf = 0;
      if (!pending) return;
      const { card, x, y } = pending;
      pending = null;
      const r = card.getBoundingClientRect();
      const px = Math.min(1, Math.max(0, (x - r.left) / r.width));
      const py = Math.min(1, Math.max(0, (y - r.top) / r.height));
      card.style.setProperty("--rx", `${((0.5 - py) * 2 * MAX_TILT).toFixed(2)}deg`);
      card.style.setProperty("--ry", `${((px - 0.5) * 2 * MAX_TILT).toFixed(2)}deg`);
      card.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
      card.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
      card.style.setProperty("--tx", ((px - 0.5) * 2).toFixed(3));
      card.style.setProperty("--ty", ((py - 0.5) * 2).toFixed(3));
    };
    const still = () => !fine.matches || reduced.matches || pressed || (window.getSelection()?.toString() ?? "") !== "";

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      const card = e.target instanceof Element ? e.target.closest<HTMLElement>("main article") : null;
      if (card !== current) {
        release(current);
        current = card;
      }
      if (!card || still()) {
        if (card && card.dataset.holo === "on") release(card);
        return;
      }
      window.clearTimeout(timers.get(card));
      foilHue(card);
      card.dataset.holo = "on";
      pending = { card, x: e.clientX, y: e.clientY };
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onDown = () => {
      pressed = true;
      release(current);
    };
    const onUp = () => {
      pressed = false;
    };
    const onScroll = () => {
      // The card under a still pointer changes as the list scrolls; let go rather than track it.
      if (current) {
        release(current);
        current = null;
      }
    };
    const onLeave = () => {
      release(current);
      current = null;
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointercancel", onUp, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", onScroll, { capture: true });
      // No card keeps a stale tilt or hue once another direction takes over.
      document.querySelectorAll<HTMLElement>("main article").forEach((card) => {
        clear(card);
        card.style.removeProperty("--foil-h");
        delete card.dataset.foilH;
      });
    };
  }, []);
}

/** A soft prismatic light leak behind the page; installs the card foil. */
function Backdrop() {
  useCardFoil();
  return <div aria-hidden="true" className="holo-backdrop" />;
}

export const holo: Brand = { slug: "holo", name: "Holo", Mark, EmptyArt, Backdrop };
