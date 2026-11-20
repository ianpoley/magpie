"use client";
// The flock: a murmuration of tiny pixel magpies that IS the result set, one bird per post on screen.
// Filter, search or ask and the sift becomes visible: birds leave as results drop and arrive as they return.
// Usability first: the flock lives in the gutters (never behind the content column), stays low-contrast,
// and only crosses the header during the brief swirl while an ask is judging. Nothing in it needs opening or hovering.
// The flight itself is lib/murmuration.ts; this component measures the page, runs the clock and draws.

import { useEffect, useRef } from "react";

import { useMagpieEvents } from "@/lib/magpie-events";
import { createMurmuration, type Murmuration } from "@/lib/murmuration";

import { FLY_DOWN, FLY_GOLD, FLY_INK, FLY_UP } from "./magpie";
import { SEARCH_INPUT_ID } from "./page-header";

const P = 2; // CSS px per art pixel
const GAP = 6; // art px kept clear on each side of the content column

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

function createSky(canvas: HTMLCanvasElement, reduced: boolean): Sky {
  const main = canvas.parentElement;
  const ctx = canvas.getContext("2d");
  if (!main || !ctx) return NOOP;

  // sprites[palette][frame][facing], inked from the bird tokens in globals.css.
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

  function measure() {
    if (!main) return;
    const r = main.getBoundingClientRect();
    left = r.left;
    const w = r.width;
    const h = window.innerHeight;
    canvas.style.left = `${left}px`;
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
    let columnLeft = aw * 0.2;
    let columnRight = aw * 0.8;
    if (col) {
      const cr = col.getBoundingClientRect();
      const cs = getComputedStyle(col);
      columnLeft = (cr.left + parseFloat(cs.paddingLeft) - left) / P - GAP;
      columnRight = (cr.right - parseFloat(cs.paddingRight) - left) / P + GAP;
    }
    sim.resize({ width: aw, height: ah, columnLeft, columnRight });
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
    const base = sim.narrow ? 0.24 : 0.42;
    for (const b of sim.birds) {
      const goldOn = b.gold > 0 && (b.gold < 1.2 || Math.floor(b.gold * 8) % 2 === 0);
      const s = sprites[goldOn ? 1 : 0][Math.floor(b.phase) & 1][b.vx < 0 ? 1 : 0];
      ctx!.globalAlpha = base * Math.max(0, Math.min(1, b.alpha)) * (goldOn ? 1.6 : 1);
      ctx!.drawImage(s, Math.round(b.x) - 3, Math.round(b.y) - 1);
    }
    ctx!.globalAlpha = 1;
  }

  function loop(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    if (asking && ++frame % 6 === 0) measureVortex();
    sim.step(dt);
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
      // Toward the middle of the screen, where the opened post appears.
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
    },
  };
}

/**
 * Fixed over <main>, behind its content column. <main> must be `relative` and the content column must be its
 * last child and sit above the sky (z-index 1): the sky measures that column to keep birds out from behind text.
 */
export function Flock({ count, asking }: { count: number; asking: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sky = useRef<Sky>(NOOP);

  useEffect(() => {
    if (!ref.current) return;
    const s = createSky(ref.current, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    sky.current = s;
    return () => {
      s.destroy();
      sky.current = NOOP;
    };
  }, []);
  useEffect(() => sky.current.setTarget(count), [count]);
  useEffect(() => sky.current.setAsking(asking), [asking]);
  useMagpieEvents((event) => {
    if (event === "surprise") sky.current.surprise();
    if (event === "pin") sky.current.pin();
    if (event === "remove") sky.current.fall();
  });

  return <canvas ref={ref} aria-hidden="true" className="flock-sky" />;
}
