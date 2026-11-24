"use client";

import { type RefObject, useEffect, useRef, useSyncExternalStore } from "react";

import { useMagpieEvents } from "@/lib/magpie-events";
import { createMurmuration, MAX_BIRDS, type Murmuration } from "@/lib/murmuration";

import { FLY_DOWN, FLY_GOLD, FLY_INK, FLY_UP } from "./magpie";
import { SEARCH_INPUT_ID } from "./page-header";

const P = 2;
const GAP = 6;
const MIN_FRAME_MS = 10;
const ONE_BIRD_EACH = 100;
const GUTTER_ALPHA = 0.42;
const UNDER_COLUMN_ALPHA = 0.24;

type Sky = { setTarget: (n: number) => void; setAsking: (on: boolean) => void; surprise: () => void; pin: () => void; fall: () => void; destroy: () => void };
const NOOP: Sky = { setTarget: () => {}, setAsking: () => {}, surprise: () => {}, pin: () => {}, fall: () => {}, destroy: () => {} };

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

function createSky(canvas: HTMLCanvasElement, column: RefObject<HTMLElement | null>, reduced: boolean): Sky {
  const main = canvas.parentElement;
  const ctx = canvas.getContext("2d");
  if (!main || !ctx) return NOOP;

  const root = getComputedStyle(document.documentElement);
  const inks = (pal: Record<string, string>) => Object.fromEntries(Object.entries(pal).map(([k, v]) => [k, root.getPropertyValue(v).trim()]));
  const sprites = [FLY_INK, FLY_GOLD].map((pal) => [FLY_UP, FLY_DOWN].map((f) => [sprite(f, inks(pal), false), sprite(f, inks(pal), true)]));

  const sim: Murmuration = createMurmuration();
  let left = 0;
  let aw = 0;
  let ah = 0;
  let raf = 0;
  let last = 0;
  let frame = 0;
  let asking = false;
  let columnLeft = 0;
  let columnRight = 0;

  function measure() {
    if (!main) return;
    const r = main.getBoundingClientRect();
    left = r.left;
    const w = r.width;
    const h = window.innerHeight;
    canvas.style.left = `${left}px`;
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
    const col = column.current;
    columnLeft = aw * 0.2;
    columnRight = aw * 0.8;
    if (col) {
      const cr = col.getBoundingClientRect();
      const cs = getComputedStyle(col);
      columnLeft = (cr.left + parseFloat(cs.paddingLeft) - left) / P - GAP;
      columnRight = (cr.right - parseFloat(cs.paddingRight) - left) / P + GAP;
    }
    sim.resize({ width: aw, height: ah });
    if (reduced) {
      sim.scatter();
      draw();
    }
  }

  function measureVortex() {
    const f = document.getElementById(SEARCH_INPUT_ID)?.closest("form");
    if (!f) {
      sim.setVortex({ x: aw / 2, y: 50, rx: aw * 0.3, ry: 34 });
      return;
    }
    const r = f.getBoundingClientRect();
    sim.setVortex({ x: (r.left + r.width / 2 - left) / P, y: (r.top + r.height / 2) / P, rx: r.width / 2 / P + 26, ry: r.height / 2 / P + 30 });
  }

  function draw() {
    ctx!.clearRect(0, 0, aw, ah);
    for (const b of sim.birds) {
      const base = b.x > columnLeft && b.x < columnRight ? UNDER_COLUMN_ALPHA : GUTTER_ALPHA;
      const goldOn = b.gold > 0 && (b.gold < 1.2 || Math.floor(b.gold * 8) % 2 === 0);
      const s = sprites[goldOn ? 1 : 0][Math.floor(b.phase) & 1][b.vx < 0 ? 1 : 0];
      ctx!.globalAlpha = base * Math.max(0, Math.min(1, b.alpha)) * (goldOn ? 1.6 : 1);
      ctx!.drawImage(s, Math.round(b.x) - 3, Math.round(b.y) - 1);
    }
    ctx!.globalAlpha = 1;
  }

  function loop(now: number) {
    raf = requestAnimationFrame(loop);
    if (now - last < MIN_FRAME_MS) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    if (asking && ++frame % 6 === 0) measureVortex();
    sim.step(dt);
    draw();
  }

  const onVisibility = () => {
    if (reduced) return;
    cancelAnimationFrame(raf);
    if (!document.hidden) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  };

  const onPointer = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    const x = (e.clientX - left) / P;
    const y = e.clientY / P;
    sim.pointAt(x >= 0 && x <= aw && y >= 0 && y <= ah ? { x, y } : null);
  };
  const onPointerOut = () => sim.pointAt(null);

  const ro = new ResizeObserver(measure);
  ro.observe(main);
  window.addEventListener("resize", measure);
  document.addEventListener("visibilitychange", onVisibility);
  measure();
  if (!reduced) {
    last = performance.now();
    raf = requestAnimationFrame(loop);
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerOut);
  }

  return {
    setTarget(count) {
      sim.setTarget(count);
      if (reduced) {
        sim.scatter();
        draw();
      }
    },
    setAsking(on) {
      if (reduced) return;
      asking = on;
      if (on) measureVortex();
      sim.setAsking(on);
    },
    surprise() {
      if (!reduced) sim.surprise({ x: (window.innerWidth / 2 - left) / P, y: window.innerHeight / 2 / P });
    },
    pin() {
      if (!reduced) sim.pin();
    },
    fall() {
      if (!reduced) sim.fall();
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
      document.documentElement.removeEventListener("pointerleave", onPointerOut);
    },
  };
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const subscribeReducedMotion = (onChange: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const prefersReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;

function birdsFor(count: number, collection: number) {
  if (count <= ONE_BIRD_EACH || collection <= MAX_BIRDS) return count;
  const share = Math.log(count / ONE_BIRD_EACH) / Math.log(collection / ONE_BIRD_EACH);
  return Math.min(count, Math.round(ONE_BIRD_EACH + (MAX_BIRDS - ONE_BIRD_EACH) * Math.min(1, share)));
}

export function Flock({
  count,
  collection,
  asking,
  column,
}: {
  count: number;
  collection: number;
  asking: boolean;
  column: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sky = useRef<Sky>(NOOP);
  const reduced = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);

  useEffect(() => {
    if (!ref.current) return;
    const s = createSky(ref.current, column, reduced);
    sky.current = s;
    return () => {
      s.destroy();
      sky.current = NOOP;
    };
  }, [column, reduced]);
  const birds = birdsFor(count, collection);
  useEffect(() => sky.current.setTarget(birds), [birds, reduced]);
  useEffect(() => sky.current.setAsking(asking), [asking, reduced]);
  useMagpieEvents((event) => {
    if (event === "surprise") sky.current.surprise();
    if (event === "pin") sky.current.pin();
    if (event === "remove") sky.current.fall();
  });

  return <canvas ref={ref} aria-hidden="true" className="flock-sky" />;
}
