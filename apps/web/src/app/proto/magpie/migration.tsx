"use client";
// Throwaway — Riff on Murmur, "Migration". Axis: the flock as direct-manipulation navigation.
// Same dawn sky, mark and totals line as Murmur. The difference: the flock lines up in the right gutter as a migrating
// column that IS the list, top to bottom. One bird per result, in list order; the birds whose cards are on screen flap
// and sit inside a "you are here" band. Click or drag anywhere on the column (or arrow through it with the keyboard)
// and the list scrolls to that post, loading further pages on the way when the target isn't rendered yet.
// Usability first: nothing in it opens or hides content, it never crosses the content column, and on narrow screens it
// simply isn't there (plain scrolling still works).

import { useEffect, useRef } from "react";

import type { Post } from "@/lib/types";

import { useBrand, useLive, type Brand } from "./brand";
import { murmur } from "./murmur";

import "./migration.css";

const P = 2; // CSS px per art pixel
const COL_W = 100; // the column's hit area, CSS px
const MIN_GUTTER = 112; // below this the column hides
const TOP = 28;
const BOTTOM = 28;
const PAD = 14; // inside the column, before the first and after the last bird
const LANE_X = 24; // centre of the bird stream inside the column
const LEFT_FLOCK = 14;

// 6×3 sprites facing right, as in Murmur.
const FRAME_UP = ["...B..", "KKKKKK", "...WW."];
const FRAME_DOWN = ["......", "KKKBKK", "..BWW."];
const INK = { K: "oklch(0.4 0.035 255)", W: "oklch(0.99 0.005 80)", B: "oklch(0.58 0.12 245)" };
// Liked but not bookmarked: a rose wing flash, the same rose the app uses for likes.
const ROSE = { K: "oklch(0.4 0.035 255)", W: "oklch(0.99 0.005 80)", B: "oklch(0.6 0.2 5)" };

type Meta = { ms: number | null; tint: 0 | 1 };
type Bird = { id: string; x: number; y: number; tx: number; ty: number; alpha: number; phase: number; delay: number; tint: 0 | 1; leaving: boolean; lane: number; pick: number };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (ms: number | null) => {
  if (ms === null) return null;
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ’${String(d.getFullYear()).slice(2)}`;
};

/** Two stable numbers per post: where it sits across the lane, and whether it is one of the birds drawn when the list is too long to draw every one. */
function hashOf(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h >>>= 0;
  return { lane: (h % 1000) / 1000 - 0.5, pick: Math.floor(h / 1000) % 9973 };
}

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

type Els = { canvas: HTMLCanvasElement; col: HTMLDivElement; band: HTMLDivElement; here: HTMLSpanElement; labels: HTMLDivElement };
type Engine = { setData: (ids: string[], meta: Map<string, Meta>) => void; destroy: () => void };
const NOOP: Engine = { setData: () => {}, destroy: () => {} };

function createEngine(els: Els, reduced: boolean): Engine {
  const { canvas, col, band, here, labels } = els;
  const main = canvas.parentElement;
  const ctx = canvas.getContext("2d");
  if (!main || !ctx) return NOOP;

  // sprites[tint][frame][facing]
  const sprites = [INK, ROSE].map((pal) => [FRAME_UP, FRAME_DOWN].map((f) => [sprite(f, pal, false), sprite(f, pal, true)]));

  let L = 0; // main's left edge, viewport px
  let mainW = 0;
  let aw = 0;
  let ah = 0;
  let contentL = 0; // content column's inner edges, viewport px
  let contentR = 0;
  let colLeft = 0;
  let colH = 0;
  let show = false;
  let ids: string[] = [];
  let meta = new Map<string, Meta>();
  let index = new Map<string, number>();
  const birds = new Map<string, Bird>();
  let lo = -1;
  let hi = -1;
  let t = 0;
  let raf = 0;
  let last = 0;
  let frame = 0;
  let dirtyBand = true;
  let jumpToken = 0;
  const left = Array.from({ length: LEFT_FLOCK }, (_, i) => ({ a: 0.05 + (i % 5) * 0.013, b: 0.04 + (i % 7) * 0.009, p: i * 1.7, q: i * 2.3, r: 0.12 + (i % 4) * 0.05 }));

  const yOf = (i: number) => {
    const n = ids.length;
    const span = colH - PAD * 2;
    return TOP + PAD + (n <= 1 ? span / 2 : (i / (n - 1)) * span);
  };
  /**
   * A long list can't draw a bird per post without turning the column into a grey bar, so past ~1 bird per 5px a stable
   * sample flies (the same birds every time, so a narrowing filter reveals more of them rather than reshuffling). The
   * birds on screen are always drawn.
   */
  const density = () => {
    const span = colH - PAD * 2;
    const stride = Math.max(1, Math.ceil(ids.length / Math.max(1, span / 5)));
    const spacing = span / Math.max(1, Math.ceil(ids.length / stride));
    const k = Math.min(1, spacing / 6);
    return { stride, spread: 9 + 6 * (1 - k), alpha: 0.5 * Math.max(0.45, k) };
  };

  function retarget() {
    const { spread } = density();
    ids.forEach((id, i) => {
      const b = birds.get(id);
      if (!b) return;
      b.tx = colLeft + LANE_X + b.lane * spread * 2;
      b.ty = yOf(i);
    });
  }

  function renderLabels() {
    labels.textContent = "";
    if (!show || ids.length === 0) return;
    const k = Math.max(2, Math.floor((colH - PAD * 2) / 110) + 1);
    let prev: string | null = null;
    for (let j = 0; j < k; j++) {
      const i = ids.length === 1 ? 0 : Math.round((j / (k - 1)) * (ids.length - 1));
      const text = shortDate(meta.get(ids[i])?.ms ?? null);
      if (!text || text === prev) continue;
      prev = text;
      const s = document.createElement("span");
      s.className = "mg-label";
      s.textContent = text;
      s.style.top = `${yOf(i) - TOP}px`;
      labels.appendChild(s);
      if (ids.length === 1) break;
    }
  }

  function measure() {
    if (!main) return;
    const r = main.getBoundingClientRect();
    L = r.left;
    mainW = r.width;
    const h = window.innerHeight;
    canvas.style.left = `${L}px`;
    canvas.style.width = `${mainW}px`;
    canvas.style.height = `${h}px`;
    const nw = Math.ceil(mainW / P);
    const nh = Math.ceil(h / P);
    if (nw !== aw || nh !== ah) {
      aw = nw;
      ah = nh;
      canvas.width = aw;
      canvas.height = ah;
      ctx!.imageSmoothingEnabled = false;
    }
    const content = main.lastElementChild as HTMLElement | null;
    if (content) {
      const cr = content.getBoundingClientRect();
      const cs = getComputedStyle(content);
      contentL = cr.left + parseFloat(cs.paddingLeft);
      contentR = cr.right - parseFloat(cs.paddingRight);
    } else {
      contentL = L + mainW * 0.2;
      contentR = L + mainW * 0.8;
    }
    const gutter = L + mainW - contentR;
    show = gutter >= MIN_GUTTER && ids.length > 0;
    colLeft = contentR + Math.max(8, (gutter - COL_W) / 2);
    colH = h - TOP - BOTTOM;
    col.hidden = !show;
    col.style.left = `${colLeft}px`;
    col.style.top = `${TOP}px`;
    col.style.height = `${colH}px`;
    retarget();
    renderLabels();
    dirtyBand = true;
    if (reduced) paint();
  }

  /** Which posts are on screen right now: the loaded cards that intersect the viewport, mapped to list positions. */
  function updateBand() {
    dirtyBand = false;
    let a = Infinity;
    let z = -1;
    const vh = window.innerHeight;
    document.querySelectorAll<HTMLElement>("[data-post-card-open]").forEach((el) => {
      const i = index.get(el.dataset.postCardOpen ?? "");
      if (i === undefined) return;
      const r = el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= vh) return;
      if (i < a) a = i;
      if (i > z) z = i;
    });
    lo = z < 0 ? -1 : a;
    hi = z;
    if (!show || lo < 0) {
      band.style.opacity = "0";
      here.style.opacity = "0";
      col.setAttribute("aria-valuenow", "1");
      col.setAttribute("aria-valuetext", ids.length ? `Top of the list, ${ids.length} posts` : "No posts");
      return;
    }
    const y0 = yOf(lo) - TOP;
    const y1 = yOf(hi) - TOP;
    band.style.opacity = "1";
    band.style.transform = `translateY(${y0 - 7}px)`;
    band.style.height = `${y1 - y0 + 14}px`;
    const mid = (y0 + y1) / 2;
    here.style.opacity = "1";
    here.style.top = `${mid}px`;
    here.textContent = lo === hi ? `${lo + 1}` : `${lo + 1}–${hi + 1}`;
    // Dates near the position label step aside rather than overlap it.
    labels.querySelectorAll<HTMLElement>(".mg-label").forEach((s) => {
      s.style.opacity = Math.abs(parseFloat(s.style.top) - mid) < 16 ? "0" : "1";
    });
    const date = shortDate(meta.get(ids[lo])?.ms ?? null);
    col.setAttribute("aria-valuenow", String(lo + 1));
    col.setAttribute("aria-valuetext", `Post ${lo + 1}${hi > lo ? ` to ${hi + 1}` : ""} of ${ids.length}${date ? `, ${date}` : ""}`);
  }

  function setData(nextIds: string[], nextMeta: Map<string, Meta>) {
    ids = nextIds;
    meta = nextMeta;
    index = new Map(ids.map((id, i) => [id, i]));
    col.setAttribute("aria-valuemax", String(Math.max(1, ids.length)));
    measure();
    const { spread } = density();
    const keep = new Set(ids);
    // Leavers fly off to the right edge; newcomers stream in from it, top of the list first.
    birds.forEach((b) => {
      if (keep.has(b.id) || b.leaving) return;
      b.leaving = true;
      b.tx = L + mainW + 24;
      b.ty = b.y - 30;
    });
    ids.forEach((id, i) => {
      const existing = birds.get(id);
      if (existing && !existing.leaving) return;
      const { lane, pick } = hashOf(id);
      const tx = colLeft + LANE_X + lane * spread * 2;
      const ty = yOf(i);
      const m = meta.get(id);
      birds.set(id, {
        id,
        x: reduced ? tx : L + mainW + 8 + Math.random() * 30,
        y: reduced ? ty : ty + (Math.random() - 0.5) * 80,
        tx,
        ty,
        alpha: 1,
        phase: Math.random() * 2,
        delay: reduced ? 0 : (i / Math.max(1, ids.length)) * 0.7 + Math.random() * 0.15,
        tint: m?.tint ?? 0,
        leaving: false,
        lane,
        pick,
      });
    });
    if (reduced) {
      birds.forEach((b, id) => {
        if (b.leaving) birds.delete(id);
      });
      paint();
    }
  }

  function step(dt: number) {
    t += dt;
    frame++;
    if (dirtyBand || frame % 15 === 0) updateBand();
    const k = Math.min(1, dt * 5);
    birds.forEach((b, id) => {
      if (b.delay > 0) {
        b.delay -= dt;
        return;
      }
      const wob = b.leaving ? 0 : Math.sin(t * 0.7 + b.ty * 0.05) * 2.2;
      const dx = b.tx + wob - b.x;
      const dy = b.ty - b.y;
      b.x += dx * k;
      b.y += dy * k;
      const i = index.get(id);
      const inBand = i !== undefined && i >= lo && i <= hi;
      const moving = Math.abs(dx) + Math.abs(dy) > 3;
      if (inBand || moving) b.phase += dt * (moving ? 7 : 4.5);
      if (b.leaving) {
        b.alpha -= dt * 1.6;
        if (b.alpha <= 0) birds.delete(id);
      }
    });
  }

  function drawLeftFlock() {
    const gutter = contentL - L;
    if (gutter < 60) return;
    const gc = (gutter / 2) / P;
    const gw = gutter / P;
    ctx!.globalAlpha = 0.26;
    left.forEach((f, i) => {
      const tt = reduced ? i * 3 : t;
      const x = gc + Math.sin(tt * f.a * 6 + f.p) * gw * 0.32;
      const y = ah * (0.5 + 0.38 * Math.sin(tt * f.b * 6 + f.q));
      const facingLeft = Math.cos(tt * f.a * 6 + f.p) < 0;
      const fr = reduced ? 1 : Math.floor(tt * (2 + f.r * 8) + i) & 1;
      ctx!.drawImage(sprites[0][fr][facingLeft ? 1 : 0], Math.round(x) - 3, Math.round(y) - 1);
    });
  }

  function paint() {
    if (reduced) updateBand();
    ctx!.clearRect(0, 0, aw, ah);
    drawLeftFlock();
    if (!show && birds.size === 0) return;
    const { alpha, stride } = density();
    // Two passes: the column, then the on-screen birds on top at full strength.
    for (const pass of [0, 1]) {
      birds.forEach((b, id) => {
        if (b.delay > 0) return;
        const i = index.get(id);
        const inBand = !b.leaving && i !== undefined && i >= lo && i <= hi;
        if ((pass === 1) !== inBand) return;
        if (!inBand && b.pick % stride !== 0) return;
        if (!show && !b.leaving) return;
        const a = (inBand ? 0.95 : alpha) * Math.max(0, Math.min(1, b.alpha));
        if (a <= 0) return;
        ctx!.globalAlpha = a;
        const fr = reduced ? 1 : Math.floor(b.phase) & 1;
        const flip = b.leaving ? 0 : 1; // the column migrates upward-left: birds face the content
        ctx!.drawImage(sprites[b.tint][fr][flip], Math.round((b.x - L) / P) - 3, Math.round(b.y / P) - 1);
      });
    }
    ctx!.globalAlpha = 1;
  }

  function loop(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    step(dt);
    paint();
    raf = requestAnimationFrame(loop);
  }

  /* ---- navigation ---- */

  const cardFor = (id: string) => document.querySelector<HTMLElement>(`[data-post-card-open="${CSS.escape(id)}"]`);

  async function jumpTo(target: number) {
    if (!ids.length) return;
    const i = Math.max(0, Math.min(ids.length - 1, target));
    const token = ++jumpToken;
    for (let tries = 0; tries < 60; tries++) {
      if (token !== jumpToken) return;
      const el = cardFor(ids[i]);
      if (el) {
        window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 24, behavior: "instant" });
        dirtyBand = true;
        if (reduced) paint();
        return;
      }
      // Past the loaded set: go to the bottom so the list loads its next page, then look again.
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
      await new Promise((r) => setTimeout(r, 90));
    }
  }

  const indexAt = (clientY: number) => {
    const span = colH - PAD * 2;
    const k = (clientY - TOP - PAD) / Math.max(1, span);
    return Math.round(Math.max(0, Math.min(1, k)) * (ids.length - 1));
  };

  let dragging = false;
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    dragging = true;
    col.setPointerCapture(e.pointerId);
    col.dataset.dragging = "";
    void jumpTo(indexAt(e.clientY));
  };
  const onMove = (e: PointerEvent) => {
    if (dragging) void jumpTo(indexAt(e.clientY));
  };
  const onUp = (e: PointerEvent) => {
    dragging = false;
    delete col.dataset.dragging;
    if (col.hasPointerCapture(e.pointerId)) col.releasePointerCapture(e.pointerId);
  };
  const onKey = (e: KeyboardEvent) => {
    const from = lo < 0 ? 0 : lo;
    const by: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, PageDown: 10, PageUp: -10 };
    let to: number | null = null;
    if (e.key in by) to = from + by[e.key];
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = ids.length - 1;
    if (to === null) return;
    e.preventDefault(); // also keeps the picker's ←/→ from switching variants while you're in here
    void jumpTo(to);
  };
  const onScroll = () => {
    dirtyBand = true;
    if (reduced) paint();
  };
  const onVisibility = () => {
    if (reduced) return;
    cancelAnimationFrame(raf);
    if (!document.hidden) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  };

  col.addEventListener("pointerdown", onDown);
  col.addEventListener("pointermove", onMove);
  col.addEventListener("pointerup", onUp);
  col.addEventListener("pointercancel", onUp);
  col.addEventListener("keydown", onKey);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", measure);
  document.addEventListener("visibilitychange", onVisibility);
  const ro = new ResizeObserver(measure);
  ro.observe(main);
  measure();
  if (!reduced) {
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  return {
    setData,
    destroy() {
      jumpToken++;
      cancelAnimationFrame(raf);
      ro.disconnect();
      col.removeEventListener("pointerdown", onDown);
      col.removeEventListener("pointermove", onMove);
      col.removeEventListener("pointerup", onUp);
      col.removeEventListener("pointercancel", onUp);
      col.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}

function metaFor(posts: Post[]): Map<string, Meta> {
  return new Map(posts.map((p) => [p.id, { ms: p.createdAtMs ?? p.addedAtMs, tint: p.liked && !p.bookmarked ? 1 : 0 }]));
}

function Backdrop() {
  const { env } = useBrand();
  const live = useLive();
  const canvas = useRef<HTMLCanvasElement>(null);
  const col = useRef<HTMLDivElement>(null);
  const band = useRef<HTMLDivElement>(null);
  const here = useRef<HTMLSpanElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine>(NOOP);

  useEffect(() => {
    if (!canvas.current || !col.current || !band.current || !here.current || !labels.current) return;
    const e = createEngine(
      { canvas: canvas.current, col: col.current, band: band.current, here: here.current, labels: labels.current },
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    engine.current = e;
    return () => {
      e.destroy();
      engine.current = NOOP;
    };
  }, [env.replay]);

  // The column maps the post list; in Resources there is no list of cards to travel through, so the flock flies home.
  const ids = live.view === "posts" ? live.ids : [];
  const key = ids.join(",");
  useEffect(() => {
    engine.current.setData(key ? key.split(",") : [], metaFor(env.snapshot.posts));
  }, [key, env.snapshot.posts, env.replay]);

  return (
    <>
      <canvas ref={canvas} aria-hidden="true" className="mg-sky" />
      <div
        ref={col}
        role="slider"
        tabIndex={0}
        aria-label="Position in the list"
        aria-orientation="vertical"
        aria-valuemin={1}
        aria-valuenow={1}
        className="mg-col"
        hidden
      >
        <div ref={band} className="mg-band" aria-hidden="true" />
        <div ref={labels} aria-hidden="true" />
        <span ref={here} className="mg-label mg-here" aria-hidden="true" />
      </div>
    </>
  );
}

export const migration: Brand = { slug: "migration", name: "Migration", Mark: murmur.Mark, Masthead: murmur.Masthead, EmptyArt: murmur.EmptyArt, Backdrop };
