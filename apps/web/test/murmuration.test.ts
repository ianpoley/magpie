import assert from "node:assert/strict";
import { test } from "node:test";

import { createMurmuration, type Bird, type Space } from "../src/lib/murmuration.ts";

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const SPACE: Space = { width: 640, height: 450, columnLeft: 120, columnRight: 520 };
const DT = 1 / 60;

function fly(seconds: number, sim: ReturnType<typeof createMurmuration>) {
  for (let i = 0; i < seconds / DT; i++) sim.step(DT);
}

const cruising = (sim: ReturnType<typeof createMurmuration>) => sim.birds.filter((b) => b.state === 0);
const overColumn = (b: Bird) => b.x > SPACE.columnLeft && b.x < SPACE.columnRight;
const sideOf = (b: Bird) => (b.x < (SPACE.columnLeft + SPACE.columnRight) / 2 ? 0 : 1);

function largestGroup(birds: Bird[]): number {
  const parent = birds.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < birds.length; i++)
    for (let j = i + 1; j < birds.length; j++) if (Math.hypot(birds[i].x - birds[j].x, birds[i].y - birds[j].y) < 12) parent[find(i)] = find(j);
  const sizes = new Map<number, number>();
  for (let i = 0; i < birds.length; i++) sizes.set(find(i), (sizes.get(find(i)) ?? 0) + 1);
  return Math.max(...sizes.values()) / birds.length;
}

test("the flock settles as one body per gutter, clear of the column", () => {
  const sim = createMurmuration(seeded(1));
  sim.resize(SPACE);
  sim.setTarget(200);
  fly(20, sim);
  const birds = cruising(sim);
  assert.equal(birds.length, 200);
  assert.equal(birds.filter(overColumn).length, 0);
  for (const side of [0, 1]) assert.ok(largestGroup(birds.filter((b) => b.home === side)) >= 0.8, `gutter ${side} has split up`);
});

test("after an ask's swirl the birds split evenly and none is left following the other gutter", () => {
  const sim = createMurmuration(seeded(2));
  sim.resize(SPACE);
  sim.setTarget(320);
  fly(10, sim);
  sim.setVortex({ x: 270, y: 48, rx: 150, ry: 40 });
  sim.setAsking(true);
  fly(5, sim);
  sim.setAsking(false);
  fly(8, sim);
  const birds = cruising(sim);
  assert.equal(birds.filter(overColumn).length, 0);
  assert.equal(birds.filter((b) => b.home !== sideOf(b)).length, 0);
  const left = birds.filter((b) => b.home === 0).length;
  assert.ok(Math.abs(left - birds.length / 2) <= 2, `split ${left}/${birds.length - left}`);
});

test("the flock follows the count, one bird per post up to the cap", () => {
  const sim = createMurmuration(seeded(3));
  sim.resize(SPACE);
  sim.setTarget(120);
  fly(4, sim);
  assert.equal(sim.birds.filter((b) => b.state === 0 || b.state === 2).length, 120);
  sim.setTarget(30);
  fly(4, sim);
  assert.equal(sim.birds.length, 30);
  sim.setTarget(5000);
  fly(6, sim);
  assert.equal(sim.birds.length, 320);
});
