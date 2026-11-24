export const MAX_BIRDS = 320;

export type Space = { width: number; height: number };
export type Vortex = { x: number; y: number; rx: number; ry: number };
export type Point = { x: number; y: number };

export type BirdState = "flying" | "leaving" | "arriving" | "diving" | "falling";

export type Bird = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  state: BirdState;
  t: number;
  gold: number;
  alpha: number;
  pace: number;
  startle: number;
  sx: number;
  sy: number;
  dead: boolean;
};

const K = 7;
const NEAR = 26;
const CELL = 13;
const SPACING = 7;
const CRUISE = 19;
const TURN = 1.6;
const MARGIN = 16;
const RELEASE_SECONDS = 0.9;
const OFFSCREEN = 48;
const SHY = 14;

const W_ALIGN = 1.6;
const W_COHERE = 0.45;
const W_SEPARATE = 2.4;
const W_GOAL = 0.5;
const W_EDGE = 3.2;

type Box = { x0: number; x1: number; y0: number; y1: number };

export function createMurmuration(random: () => number = Math.random) {
  const rand = (a: number, b: number) => a + random() * (b - a);

  let space: Space = { width: 0, height: 0 };
  const birds: Bird[] = [];
  let target = 0;
  let arriveQueue = 0;
  let leaveQueue = 0;
  let releaseRate = 200;
  let asking = false;
  let disperseUntil = 0;
  let vortex: Vortex = { x: 0, y: 0, rx: 0, ry: 0 };
  let pinPoint: Point = { x: 0, y: 0 };
  let diveTo: Point = { x: 0, y: 0 };
  let pointer: Point | null = null;
  let t = 0;
  let nextScare = 6;
  const phase = rand(0, 100);

  const box = (): Box => ({ x0: 0, x1: space.width, y0: 0, y1: space.height });
  const roam = (): Box => ({ x0: -OFFSCREEN, x1: space.width + OFFSCREEN, y0: -OFFSCREEN, y1: space.height + OFFSCREEN });
  const flying = (b: Bird) => !b.dead && (b.state === "flying" || b.state === "arriving");
  const flyers = () => birds.filter(flying);

  function goal(): Point {
    const b = box();
    const p = phase + t;
    const iy = Math.min(MARGIN * 2, (b.y1 - b.y0) / 3);
    const ux = Math.min(1, Math.max(0, 0.5 + 0.48 * Math.sin(p * 0.11) + 0.12 * Math.sin(p * 0.53 + 1.3)));
    const uy = 0.5 + 0.3 * Math.sin(p * 0.13 + 0.7) + 0.2 * Math.sin(p * 0.37 + 2.1);
    return { x: b.x0 + ux * (b.x1 - b.x0), y: b.y0 + iy + uy * Math.max(0, b.y1 - b.y0 - 2 * iy) };
  }

  function onScreen(p: Point): Point {
    const b = box();
    const clamp = (v: number, lo: number, hi: number) => (hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
    return { x: clamp(p.x, b.x0 + MARGIN, b.x1 - MARGIN), y: clamp(p.y, b.y0 + MARGIN, b.y1 - MARGIN) };
  }

  function makeBird(x: number, y: number, state: BirdState): Bird {
    const g = goal();
    const d = Math.hypot(g.x - x, g.y - y) || 1;
    const pace = rand(0.9, 1.1);
    return { x, y, vx: ((g.x - x) / d) * CRUISE * 1.6, vy: ((g.y - y) / d) * CRUISE * 1.6, phase: rand(0, 2), state, t: 0, gold: 0, alpha: 1, pace, startle: 0, sx: 0, sy: 0, dead: false };
  }

  function spawn() {
    const g = goal();
    const fromTop = random() < 0.3;
    const x = fromTop ? g.x + rand(-60, 60) : g.x < space.width / 2 ? -4 : space.width + 4;
    const y = fromTop ? -4 : rand(space.height * 0.1, space.height * 0.9);
    birds.push(makeBird(x, y, "arriving"));
  }

  function sendHome(b: Bird) {
    b.state = "leaving";
    b.t = 0;
    const toTop = b.y < Math.min(b.x, space.width - b.x);
    b.sx = (b.x < space.width / 2 ? -1 : 1) * (toTop ? 0.3 : 1);
    b.sy = toTop ? -1.5 : -0.5;
  }

  function startle(b: Bird, from: Point, reach: number) {
    const dx = b.x - from.x;
    const dy = b.y - from.y;
    const d = Math.hypot(dx, dy);
    if (d > reach) return;
    const v = Math.hypot(b.vx, b.vy) || 1;
    const side = dx * -b.vy + dy * b.vx >= 0 ? 1 : -1;
    b.sx = (dx / (d || 1)) * 0.6 + (-b.vy / v) * side;
    b.sy = (dy / (d || 1)) * 0.6 + (b.vx / v) * side;
    b.startle = 0.45;
  }

  function scare() {
    const list = flyers();
    if (list.length < 12) return;
    const at = list[Math.floor(random() * list.length)];
    for (const b of list) startle(b, at, 12);
  }

  function shy(from: Point) {
    for (const b of birds) if (flying(b) && b.startle <= 0) startle(b, from, SHY);
  }

  let cols = 1;
  let rows = 1;
  let head = new Int32Array(1);
  let next = new Int32Array(1);
  const nearIdx = new Int32Array(K);
  const nearD2 = new Float64Array(K);

  function step(dt: number) {
    t += dt;
    const { width, height } = space;

    const budget = Math.max(1, Math.round(releaseRate * dt));
    for (let k = 0; k < budget && arriveQueue > 0; k++, arriveQueue--) spawn();

    if (leaveQueue > 0) {
      const list = flyers();
      for (let k = 0; k < budget && leaveQueue > 0 && list.length; k++, leaveQueue--) {
        const b = list.splice(Math.floor(random() * list.length), 1)[0];
        sendHome(b);
      }
    }

    if (!asking && pointer) shy(pointer);

    if (!asking && t >= nextScare) {
      scare();
      nextScare = t + rand(7, 14);
    }

    cols = Math.max(1, Math.ceil((width + 40) / CELL));
    rows = Math.max(1, Math.ceil((height + 40) / CELL));
    if (head.length !== cols * rows) head = new Int32Array(cols * rows);
    if (next.length < birds.length) next = new Int32Array(birds.length * 2);
    head.fill(-1);
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      if (!flying(b)) continue;
      const c = Math.min(cols - 1, Math.max(0, Math.floor((b.x + 20) / CELL))) + Math.min(rows - 1, Math.max(0, Math.floor((b.y + 20) / CELL))) * cols;
      next[i] = head[c];
      head[c] = i;
    }

    const home = goal();
    const dispersing = !asking && t < disperseUntil;

    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      b.t += dt;
      let ax = 0;
      let ay = 0;
      let maxV = CRUISE * 3;
      let minV = 0;

      if (b.state === "flying" || b.state === "arriving") {
        let found = 0;
        const gx = Math.floor((b.x + 20) / CELL);
        const gy = Math.floor((b.y + 20) / CELL);
        for (let oy = -2; oy <= 2; oy++) {
          const Y = gy + oy;
          if (Y < 0 || Y >= rows) continue;
          for (let ox = -2; ox <= 2; ox++) {
            const X = gx + ox;
            if (X < 0 || X >= cols) continue;
            for (let j = head[X + Y * cols]; j !== -1; j = next[j]) {
              if (j === i) continue;
              const o = birds[j];
              const d2 = (b.x - o.x) ** 2 + (b.y - o.y) ** 2;
              if (d2 > NEAR * NEAR) continue;
              if (found < K) {
                nearIdx[found] = j;
                nearD2[found] = d2;
                found++;
              } else {
                let worst = 0;
                for (let q = 1; q < K; q++) if (nearD2[q] > nearD2[worst]) worst = q;
                if (d2 < nearD2[worst]) {
                  nearIdx[worst] = j;
                  nearD2[worst] = d2;
                }
              }
            }
          }
        }

        const speed = CRUISE * b.pace;
        let hx = 0;
        let hy = 0;
        if (found) {
          let avx = 0, avy = 0, cx = 0, cy = 0, sx = 0, sy = 0;
          for (let q = 0; q < found; q++) {
            const o = birds[nearIdx[q]];
            const ov = Math.hypot(o.vx, o.vy) || 1;
            avx += o.vx / ov;
            avy += o.vy / ov;
            cx += o.x;
            cy += o.y;
            const d2 = nearD2[q];
            if (d2 < SPACING * SPACING && d2 > 0) {
              const d = Math.sqrt(d2);
              sx += ((b.x - o.x) / d) * (1 - d / SPACING);
              sy += ((b.y - o.y) / d) * (1 - d / SPACING);
            }
          }
          const al = Math.hypot(avx, avy) || 1;
          hx += (avx / al) * W_ALIGN;
          hy += (avy / al) * W_ALIGN;
          const tcx = cx / found - b.x;
          const tcy = cy / found - b.y;
          const tc = Math.hypot(tcx, tcy);
          if (tc > 0) {
            const pull = Math.min(1, tc / NEAR) * W_COHERE;
            hx += (tcx / tc) * pull;
            hy += (tcy / tc) * pull;
          }
          hx += sx * W_SEPARATE;
          hy += sy * W_SEPARATE;
        }

        if (asking) {
          const k = i * 2.39996 + t * 0.9;
          const j = (i % 9) - 4;
          const tx = vortex.x + Math.cos(k) * (vortex.rx + j * 1.5);
          const ty = vortex.y + Math.sin(k) * (vortex.ry + j);
          ax += (tx - b.x) * 2.2 - b.vx * 0.9;
          ay += (ty - b.y) * 2.2 - b.vy * 0.9;
          maxV = 70;
        } else {
          const g = b.gold > 0.6 ? pinPoint : home;
          const gdx = g.x - b.x;
          const gdy = g.y - b.y;
          const gd = Math.hypot(gdx, gdy) || 1;
          if (b.gold > 0.6) {
            hx += (gdx / gd) * 4;
            hy += (gdy / gd) * 4;
          } else {
            const reach = b.state === "arriving" ? 2.5 : W_GOAL * Math.min(1.6, gd / 40);
            hx += (gdx / gd) * reach;
            hy += (gdy / gd) * reach;
          }

          if (b.state === "flying" || b.t > 1.2) {
            const bx = roam();
            const edge = (gap: number) => (gap >= MARGIN ? 0 : ((MARGIN - Math.max(gap, -MARGIN)) / MARGIN) ** 2);
            const left = edge(b.x - bx.x0);
            const right = edge(bx.x1 - b.x);
            const top = edge(b.y - bx.y0);
            const bottom = edge(bx.y1 - b.y);
            const push = left + right + top + bottom;
            if (push > 0) {
              hx += (left - right) * W_EDGE + (gdx / gd) * push * W_EDGE * 0.5;
              hy += (top - bottom) * W_EDGE + (gdy / gd) * push * W_EDGE * 0.5;
            }
          }

          if (b.startle > 0) {
            b.startle -= dt;
            hx += b.sx * 5;
            hy += b.sy * 5;
          }

          if (dispersing) {
            const dx = b.x - vortex.x;
            const dy = b.y - vortex.y;
            const d = Math.hypot(dx, dy) || 1;
            hx += (dx / d) * 3;
            hy += (dy / d) * 3;
          }

          const h = Math.hypot(hx, hy);
          const want = b.state === "arriving" ? speed * 1.8 : dispersing ? speed * 2 : b.gold > 0.6 ? speed * 2.4 : speed;
          if (h > 0) {
            ax += ((hx / h) * want - b.vx) * TURN;
            ay += ((hy / h) * want - b.vy) * TURN;
          }

          minV = speed * 0.6;
        }
        if (b.state === "arriving" && b.t > 2.5) b.state = "flying";
        if (b.gold > 0) b.gold = Math.max(0, b.gold - dt);
      } else if (b.state === "leaving") {
        ax += b.sx * 60;
        ay += b.sy * 40;
        maxV = 60;
        minV = 20;
        if (b.x < -10 || b.x > width + 10 || b.y < -10) b.dead = true;
      } else if (b.state === "diving") {
        ax += (diveTo.x - b.x) * 4;
        ay += (diveTo.y - b.y) * 4;
        maxV = 110;
        minV = 30;
        b.alpha -= dt * 1.3;
        if (b.alpha <= 0 || Math.hypot(diveTo.x - b.x, diveTo.y - b.y) < 4) b.dead = true;
      } else {
        ay += 90;
        b.vx *= 0.99;
        maxV = 120;
        b.alpha -= dt * 0.7;
        if (b.alpha <= 0 || b.y > height + 6) b.dead = true;
      }

      b.vx += ax * dt;
      b.vy += ay * dt;
      const v = Math.hypot(b.vx, b.vy) || 1;
      const clamp = v > maxV ? maxV / v : v < minV ? minV / v : 1;
      b.vx *= clamp;
      b.vy *= clamp;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.phase += dt * (v > CRUISE * 1.3 ? 6 : 2.6);
    }

    let w = 0;
    for (let i = 0; i < birds.length; i++) if (!birds[i].dead) birds[w++] = birds[i];
    birds.length = w;
    const short = target - (flyers().length + arriveQueue - leaveQueue);
    if (short > 0) arriveQueue += short;
  }

  return {
    birds: birds as readonly Bird[],
    resize(next: Space) {
      space = next;
    },
    setTarget(count: number) {
      target = Math.min(Math.max(0, count), MAX_BIRDS);
      const diff = target - (flyers().length + arriveQueue - leaveQueue);
      releaseRate = Math.max(40, Math.abs(diff) / RELEASE_SECONDS);
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
    setAsking(on: boolean) {
      if (on === asking) return;
      asking = on;
      if (on) return;
      disperseUntil = t + 1.1;
    },
    pointAt(at: Point | null) {
      pointer = at;
    },
    setVortex(next: Vortex) {
      vortex = next;
    },
    surprise(to: Point) {
      diveTo = to;
      const list = flyers();
      if (list.length) {
        const b = list[Math.floor(random() * list.length)];
        b.state = "diving";
        b.t = 0;
      }
    },
    pin() {
      pinPoint = onScreen(goal());
      flyers()
        .sort((a, b) => Math.hypot(a.x - pinPoint.x, a.y - pinPoint.y) - Math.hypot(b.x - pinPoint.x, b.y - pinPoint.y))
        .slice(0, 28)
        .forEach((b) => {
          b.gold = 2;
        });
    },
    fall() {
      const list = flyers();
      if (list.length) list[Math.floor(random() * list.length)].state = "falling";
    },
    step,
    scatter() {
      birds.length = 0;
      arriveQueue = 0;
      leaveQueue = 0;
      const g = onScreen(goal());
      const bx = box();
      for (let i = 0; i < target; i++) {
        const a = random() * Math.PI * 2;
        const r = Math.sqrt(random());
        const x = Math.min(bx.x1 - 4, Math.max(bx.x0 + 4, g.x + Math.cos(a) * r * Math.min(40, (bx.x1 - bx.x0) / 2.2)));
        const y = Math.min(bx.y1 - 6, Math.max(bx.y0 + 6, g.y + Math.sin(a) * r * 70));
        const b = makeBird(x, y, "flying");
        b.vx = random() < 0.5 ? -1 : 1;
        b.vy = 0;
        b.phase = 1;
        birds.push(b);
      }
    },
  };
}

export type Murmuration = ReturnType<typeof createMurmuration>;
