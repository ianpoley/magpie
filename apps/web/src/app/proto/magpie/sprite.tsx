"use client";
// Throwaway: the Magpie pixel sprite and its renderers (flat pixel, voxel, pixelated avatars).

import { useEffect, useRef, useState, type CSSProperties } from "react";

const initials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters.map((word) => Array.from(word)[0] ?? "").join("").toUpperCase() || "?";
};

/**
 * A magpie perched facing right, holding a coin in its bill.
 * K black · W white · B wing gloss (blue) · G tail gloss (green) · V tail tip (violet)
 * E eye glint · Y coin · H coin highlight · O coin shadow
 */
export const MAGPIE = [
  ".................KKKK......",
  "................KKKKKK.....",
  "...............KKKEKKKK....",
  "...............KKKKKKKKKYY.",
  "..............KKKKKK...YHYY",
  "..............KKKKKK...YYYO",
  "..........KKKKKKKKK.....OO.",
  "........KKWWWWWKKKK........",
  ".......KKKKWWWWKKKKW.......",
  "......KBBBBBBKKKWWWW.......",
  ".....KBBBBBWWKWWWWWW.......",
  "....KGBBBBWWWKWWWWW........",
  "...KGGKBBBKKKKWWWW.........",
  "..KGGV....KK..K.K..........",
  ".KGGV.........K.K..........",
  "KGVV.........KK.KK.........",
  "VV.........................",
];
export const SPRITE_W = MAGPIE[0].length;
export const SPRITE_H = MAGPIE.length;

/** Cells that move with the head when the bird pecks or bobs. */
const isHead = (x: number, y: number) => y <= 6 && x >= 14;

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
export const bayer = (x: number, y: number) => (BAYER[y % 4][x % 4] + 0.5) / 16;

export type Paint = Record<string, string | ((x: number, y: number) => string)>;

type Cell = { x: number; y: number; c: string };
const CELLS: Cell[] = MAGPIE.flatMap((row, y) => [...row].flatMap((c, x) => (c === "." ? [] : [{ x, y, c }])));

/**
 * The flat pixel bird. Each cell is a rect with class `p-<char>` and CSS vars:
 * --d (diagonal index, for sweeps), --b (Bayer threshold 0–1, for dithered reveals), --y (row).
 * The head cells sit in `g.mp-head`, the rest in `g.mp-body`, so a variant can bob or peck the head.
 */
export function PixelBird({
  cell,
  paint,
  className,
  style,
  title,
  pad = 0,
  play = false,
}: {
  cell: number;
  paint: Paint;
  className?: string;
  style?: CSSProperties;
  title?: string;
  pad?: number;
  play?: boolean;
}) {
  const w = SPRITE_W + pad * 2;
  const h = SPRITE_H + pad * 2;
  const rect = ({ x, y, c }: Cell) => {
    const p = paint[c] ?? paint.K;
    const fill = typeof p === "function" ? p(x, y) : p;
    if (fill === "none") return null;
    return (
      <rect
        key={`${x}-${y}`}
        x={x + pad}
        y={y + pad}
        width={1}
        height={1}
        fill={fill}
        className={`p-${c}`}
        style={{ "--d": x + y, "--b": bayer(x, y), "--y": y } as CSSProperties}
      />
    );
  };
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w * cell}
      height={h * cell}
      shapeRendering="crispEdges"
      className={className}
      style={style}
      data-play={play ? "" : undefined}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <g className="mp-body">{CELLS.filter((cell) => !isHead(cell.x, cell.y)).map(rect)}</g>
      <g className="mp-head">{CELLS.filter((cell) => isHead(cell.x, cell.y)).map(rect)}</g>
    </svg>
  );
}

/* ---------------- voxels ---------------- */

export type Cube = { x: number; u: number; z: number; color: string; cls?: string; delay?: number; key?: string };

const C30 = Math.cos(Math.PI / 6);
const proj = (X: number, U: number, Z: number, s: number): [number, number] => [(X - Z) * C30 * s, ((X + Z) * 0.5 - U) * s];

/** Isometric voxels: draws only exposed faces, back to front. Top is lit, the +Z face is the base color, +X is shaded. */
export function VoxelScene({
  cubes,
  s,
  className,
  style,
  title,
  light = "white",
  shade = "black",
  hot = false,
}: {
  cubes: Cube[];
  s: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
  light?: string;
  shade?: string;
  hot?: boolean;
}) {
  const filled = new Set(cubes.map((cube) => `${cube.x},${cube.u},${cube.z}`));
  const has = (x: number, u: number, z: number) => filled.has(`${x},${u},${z}`);
  const sorted = [...cubes].sort((a, b) => a.x + a.u + a.z - (b.x + b.u + b.z) || a.u - b.u);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { x, u, z } of cubes) {
    for (const [X, U, Z] of [[x, u + 1, z], [x + 1, u, z], [x, u, z + 1], [x + 1, u + 1, z + 1], [x, u + 1, z + 1], [x + 1, u + 1, z], [x + 1, u, z + 1]]) {
      const [px, py] = proj(X, U, Z, s);
      minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
    }
  }
  const poly = (pts: [number, number, number][]) => pts.map(([X, U, Z]) => proj(X, U, Z, s).map((n) => n.toFixed(2)).join(",")).join(" ");
  const pad = s;
  return (
    <svg
      viewBox={`${(minX - pad).toFixed(1)} ${(minY - pad * 2).toFixed(1)} ${(maxX - minX + pad * 2).toFixed(1)} ${(maxY - minY + pad * 3).toFixed(1)}`}
      width={maxX - minX + pad * 2}
      height={maxY - minY + pad * 3}
      className={className}
      style={style}
      data-hot={hot ? "" : undefined}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {sorted.map(({ x, u, z, color, cls, delay, key }) => has(x, u + 1, z) && has(x, u, z + 1) && has(x + 1, u, z) ? null : (
        <g key={key ?? `${x},${u},${z}`} className={cls ?? "vx"} style={{ "--u": u, "--x": x, "--delay": `${delay ?? 0}ms` } as CSSProperties}>
          {!has(x, u + 1, z) ? (
            <polygon points={poly([[x, u + 1, z], [x + 1, u + 1, z], [x + 1, u + 1, z + 1], [x, u + 1, z + 1]])} fill={`color-mix(in oklch, ${color}, ${light} 28%)`} />
          ) : null}
          {!has(x, u, z + 1) ? (
            <polygon points={poly([[x, u, z + 1], [x + 1, u, z + 1], [x + 1, u + 1, z + 1], [x, u + 1, z + 1]])} fill={color} />
          ) : null}
          {!has(x + 1, u, z) ? (
            <polygon points={poly([[x + 1, u, z], [x + 1, u, z + 1], [x + 1, u + 1, z + 1], [x + 1, u + 1, z]])} fill={`color-mix(in oklch, ${color}, ${shade} 30%)`} />
          ) : null}
        </g>
      ))}
    </svg>
  );
}

const DEPTH: Record<string, [number, number]> = {
  K: [0, 3], W: [0, 3], B: [0, 3], E: [0, 3],
  G: [1, 2], V: [1, 2],
  Y: [1, 2], H: [1, 2], O: [1, 2],
};

/** The sprite extruded into voxels; the bird builds from its feet up (delay by row). */
export function birdCubes(paint: Record<string, string>, offset = { x: 0, u: 0, z: 0 }, stagger = 45): Cube[] {
  const cubes: Cube[] = [];
  for (const { x, y, c } of CELLS) {
    const [z0, z1] = DEPTH[c] ?? [0, 3];
    const u = SPRITE_H - 1 - y;
    for (let z = z0; z < z1; z++) {
      // The eye only shows on the near face.
      const color = c === "E" && z < z1 - 1 ? paint.K : (paint[c] ?? paint.K);
      cubes.push({ x: x + offset.x, u: u + offset.u, z: z + offset.z, color, delay: u * stagger + x * 4, key: `b${x},${u},${z}` });
    }
  }
  return cubes;
}

/* ---------------- pixelated avatars ---------------- */

/**
 * An author's avatar resampled to `cells`×`cells` and drawn with hard pixels.
 * `oneBit` thresholds it against a Bayer matrix (needs CORS; falls back to a grayscale contrast filter).
 */
export function PixelAvatar({
  src,
  name,
  cells = 10,
  size = 40,
  oneBit = false,
  className,
  style,
  ink = "black",
  paper = "white",
}: {
  src: string | null;
  name: string;
  cells?: number;
  size?: number;
  oneBit?: boolean;
  className?: string;
  style?: CSSProperties;
  ink?: string;
  paper?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !src) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let cancelled = false;
    const draw = (img: HTMLImageElement, cors: boolean) => {
      if (cancelled) return;
      ctx.imageSmoothingEnabled = true;
      ctx.clearRect(0, 0, cells, cells);
      ctx.drawImage(img, 0, 0, cells, cells);
      if (!oneBit) return;
      if (!cors) {
        canvas.style.filter = "grayscale(1) contrast(3)";
        return;
      }
      const data = ctx.getImageData(0, 0, cells, cells);
      const css = getComputedStyle(canvas);
      const parse = (v: string) => {
        const probe = document.createElement("canvas").getContext("2d");
        if (!probe) return [0, 0, 0];
        probe.fillStyle = v;
        probe.fillRect(0, 0, 1, 1);
        return [...probe.getImageData(0, 0, 1, 1).data.slice(0, 3)];
      };
      const inkRGB = parse(css.getPropertyValue("--ink").trim() || ink);
      const paperRGB = parse(css.getPropertyValue("--paper").trim() || paper);
      const lums = Array.from({ length: cells * cells }, (_, i) => (0.2126 * data.data[i * 4] + 0.7152 * data.data[i * 4 + 1] + 0.0722 * data.data[i * 4 + 2]) / 255);
      // Auto-levels first, so a face spans the whole threshold range instead of dithering to a flat grey.
      const lo = Math.min(...lums);
      const hi = Math.max(...lums);
      for (let i = 0; i < cells * cells; i++) {
        const lum = hi - lo < 0.05 ? lums[i] : (lums[i] - lo) / (hi - lo);
        const x = i % cells;
        const y = Math.floor(i / cells);
        const rgb = lum > bayer(x, y) ? paperRGB : inkRGB;
        data.data.set([...rgb, 255], i * 4);
      }
      ctx.putImageData(data, 0, 0);
    };
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    if (oneBit) img.crossOrigin = "anonymous";
    img.onload = () => draw(img, oneBit);
    img.onerror = () => {
      if (!oneBit) return;
      const plain = new Image();
      plain.referrerPolicy = "no-referrer";
      plain.onload = () => draw(plain, false);
      plain.src = src;
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, cells, oneBit, ink, paper]);

  if (!src) {
    return (
      <span aria-hidden="true" className={className} style={{ width: size, height: size, display: "grid", placeItems: "center", fontSize: size * 0.34, fontWeight: 700, ...style }}>
        {initials(name)}
      </span>
    );
  }
  return <canvas ref={ref} width={cells} height={cells} aria-hidden="true" className={className} style={{ width: size, height: size, imageRendering: "pixelated", ...style }} />;
}

/* ---------------- tiny pixel glyphs ---------------- */

export const GLYPHS = {
  sparkle: ["...#...", "...#...", "..###..", "#######", "..###..", "...#...", "...#..."],
  coin: [".###.", "#.###", "#.###", "#.###", ".###."],
  gem: [".###.", "#####", ".###.", "..#.."],
  heart: [".#.#.", "#####", "#####", ".###.", "..#.."],
  mark: ["#####", "#####", "#####", "##.##", "#...#"],
  pouch: ["..#..", ".###.", "#####", "#####", ".###."],
} as const;

export function PixelGlyph({ glyph, px = 2, className, style }: { glyph: keyof typeof GLYPHS; px?: number; className?: string; style?: CSSProperties }) {
  const rows = GLYPHS[glyph];
  const w = rows[0].length;
  return (
    <svg viewBox={`0 0 ${w} ${rows.length}`} width={w * px} height={rows.length * px} shapeRendering="crispEdges" aria-hidden="true" className={className} style={style}>
      {rows.flatMap((row, y) => [...row].map((c, x) => (c === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" /> : null)))}
    </svg>
  );
}

/** Increments whenever any variant announces a find, so a logo can replay its animation. */
export function useFound(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const on = () => setN((v) => v + 1);
    window.addEventListener("magpie:found", on);
    return () => window.removeEventListener("magpie:found", on);
  }, []);
  return n;
}
export const announceFound = () => window.dispatchEvent(new Event("magpie:found"));
