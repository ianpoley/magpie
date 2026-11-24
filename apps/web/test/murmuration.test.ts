import assert from "node:assert/strict";
import { test } from "node:test";

import { createMurmuration, type Bird, type Space } from "../src/lib/murmuration.ts";

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const SPACE: Space = { width: 640, height: 450 };
const DT = 1 / 60;

function fly(seconds: number, sim: ReturnType<typeof createMurmuration>) {
  for (let i = 0; i < seconds / DT; i++) sim.step(DT);
}

const cruising = (sim: ReturnType<typeof createMurmuration>) => sim.birds.filter((b) => b.state === "flying");

function largestGroup(birds: Bird[]): number {
  const parent = birds.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < birds.length; i++)
    for (let j = i + 1; j < birds.length; j++) if (Math.hypot(birds[i].x - birds[j].x, birds[i].y - birds[j].y) < 12) parent[find(i)] = find(j);
  const sizes = new Map<number, number>();
  for (let i = 0; i < birds.length; i++) sizes.set(find(i), (sizes.get(find(i)) ?? 0) + 1);
  return Math.max(...sizes.values()) / birds.length;
}

test("the flock settles as one body", () => {
  const sim = createMurmuration(seeded(1));
  sim.resize(SPACE);
  sim.setTarget(200);
  fly(20, sim);
  const birds = cruising(sim);
  assert.equal(birds.length, 200);
  assert.ok(largestGroup(birds) >= 0.8, "the flock has split up");
});

test("the flock wanders from one side of the page to the other", () => {
  const sim = createMurmuration(seeded(2));
  sim.resize(SPACE);
  sim.setTarget(200);
  fly(5, sim);
  let leftmost = SPACE.width;
  let rightmost = 0;
  for (let i = 0; i < 60 / DT; i++) {
    sim.step(DT);
    const birds = cruising(sim);
    const x = birds.reduce((sum, b) => sum + b.x, 0) / birds.length;
    leftmost = Math.min(leftmost, x);
    rightmost = Math.max(rightmost, x);
  }
  assert.ok(leftmost < SPACE.width * 0.25, `the flock got no further left than ${leftmost.toFixed(0)}`);
  assert.ok(rightmost > SPACE.width * 0.75, `the flock got no further right than ${rightmost.toFixed(0)}`);
});

test("the flock follows the count, one bird per post up to the cap", () => {
  const sim = createMurmuration(seeded(3));
  sim.resize(SPACE);
  sim.setTarget(120);
  fly(4, sim);
  assert.equal(sim.birds.filter((b) => b.state === "flying" || b.state === "arriving").length, 120);
  sim.setTarget(30);
  fly(4, sim);
  assert.equal(sim.birds.length, 30);
  sim.setTarget(5000);
  fly(6, sim);
  assert.equal(sim.birds.length, 320);
});

test("a flock sweeps past the screen's edge now and then", () => {
  const sim = createMurmuration(seeded(4));
  sim.resize(SPACE);
  sim.setTarget(200);
  fly(10, sim);
  let off = 0;
  let seen = 0;
  for (let i = 0; i < 60 / DT; i++) {
    sim.step(DT);
    for (const b of cruising(sim)) {
      seen++;
      if (b.x < 0 || b.x > SPACE.width || b.y < 0 || b.y > SPACE.height) off++;
    }
  }
  assert.ok(off / seen > 0.005, `only ${((off / seen) * 100).toFixed(1)}% of the flight went off screen`);
});

test("birds bank away from a held pointer", () => {
  const crowdAround = (withPointer: boolean) => {
    const sim = createMurmuration(seeded(5));
    sim.resize(SPACE);
    sim.setTarget(200);
    fly(10, sim);
    const flock = cruising(sim);
    const at = { x: flock.reduce((s, b) => s + b.x, 0) / flock.length, y: flock.reduce((s, b) => s + b.y, 0) / flock.length };
    if (withPointer) sim.pointAt(at);
    let crowd = 0;
    for (let i = 0; i < 2 / DT; i++) {
      sim.step(DT);
      crowd += cruising(sim).filter((b) => Math.hypot(b.x - at.x, b.y - at.y) < 8).length;
    }
    return crowd;
  };
  const held = crowdAround(true);
  const free = crowdAround(false);
  assert.ok(held < free * 0.5, `${held} bird-frames near the pointer against ${free} without it`);
});
