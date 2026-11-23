import { TILE } from '../../src/config/constants';
import type { DifficultyKey } from '../../src/config/difficulty';
import {
  isSolid, TILE_CRACKED, TILE_LAVA, TILE_SPRING, TILE_WATER, type Level, type TileMap,
} from '../../src/data/levels';
import { playerSize } from '../../src/game/player';
import { arrowY, jumpRise } from './courseRuns';

/**
 * Where a hero can get to in a level, on the grid, and whether from everywhere they can get to
 * they can still finish it (found by the owner, 2026-11-23: step off the top of Nukumaja's
 * stairs before shooting the target, and you were stuck below it between a wall and the gate).
 *
 * A cell (x, y) is somewhere to stand: solid at row y, two rows of room above. From one a hero
 * can walk to the next, jump up to the difficulty's height and across its reach, and drop any
 * distance, if the way is clear; a spring throws them as high as a fart does. The fart and the
 * big head are powers with a station: picked up, the hero has them; and wherever they land
 * they may since have run out, so "can still finish" is asked without them. A target opens its
 * gate or bridge once some cell can shoot it (a standing shot or a jump-shot, the line clear).
 * Enemies are left out: an arrow or a ray deals with every one that stands in the way.
 */

export interface Lock {
  /** The leftmost cell of a stretch the hero can get stuck in, and how many cells it has. */
  x: number;
  y: number;
  cells: number;
  /** Whether a fall (a pit, lava, water) is in reach from it: a way out, by losing a life. */
  canDie: boolean;
}

interface Move { rise: number; reach: number }

function moves(key: DifficultyKey): { plain: Move; fart: Move } {
  const plain = jumpRise(key) / TILE;
  const fart = jumpRise(key, true) / TILE;
  // Measured run-jump lengths: about 1.41 times the rise for a plain jump, 0.98 for a fart.
  return {
    plain: { rise: Math.floor(plain), reach: Math.floor(plain * 1.41) },
    fart: { rise: Math.floor(fart), reach: Math.floor(fart * 0.98) },
  };
}

interface State { hit: number; fart: boolean; bighead: boolean }
const stateKey = (s: State) => `${s.hit}:${s.fart ? 1 : 0}${s.bighead ? 1 : 0}`;

export function findLocks(level: Level, key: DifficultyKey): { locks: Lock[]; finishable: boolean } {
  const base = level.generate({} as never);
  const H = base.length;
  const W = base[0].length;
  const course = level.course!;
  const targets = course.targets;
  const heroH = playerSize('gigi').h;
  const { plain, fart } = moves(key);
  const stations = course.stations.map((s) => ({ kind: s.kind, x: s.x, y: s.y }));

  /** The map with every target in `hit` (and its helpers) applied. */
  const mapFor = (hit: number): TileMap => {
    const map = base.map((r) => r.slice());
    targets.forEach((t, i) => {
      if (t.partOf !== undefined) return;
      const helpers = targets.map((h, j) => (h.partOf === i ? j : -1)).filter((j) => j >= 0);
      if (!(hit & (1 << i)) || helpers.some((j) => !(hit & (1 << j)))) return;
      for (const c of t.cells) map[c.y][c.x] = c.to;
    });
    return map;
  };

  interface Graph { map: TileMap; id: Int32Array; cells: Array<[number, number]>; edges: number[][]; dies: boolean[] }
  const graphs = new Map<string, Graph>();
  const graphFor = (s: State): Graph => {
    const k = stateKey(s);
    const cached = graphs.get(k);
    if (cached) return cached;
    const map = mapFor(s.hit);
    const solid = (x: number, y: number) => {
      const c = map[y]?.[x];
      if (c === undefined) return y >= 0 && (x < 0 || x >= W);
      if (s.bighead && c === TILE_CRACKED) return false;
      return isSolid(c);
    };
    const clear = (x: number, y0: number, y1: number) => {
      for (let y = Math.max(0, y0); y <= y1; y++) if (solid(x, y)) return false;
      return true;
    };
    const standable = (x: number, y: number) => x >= 0 && x < W && y > 1 && y < H && solid(x, y) && clear(x, y - 2, y - 1);
    const id = new Int32Array(W * H).fill(-1);
    const cells: Array<[number, number]> = [];
    for (let x = 0; x < W; x++) for (let y = 2; y < H; y++) if (standable(x, y)) { id[y * W + x] = cells.length; cells.push([x, y]); }
    const edges: number[][] = cells.map(() => []);
    const dies: boolean[] = cells.map(() => false);
    const deadly = (x: number, y: number) => map[y]?.[x] === TILE_LAVA || map[y]?.[x] === TILE_WATER;
    cells.forEach(([x, y], n) => {
      const m = map[y][x] === TILE_SPRING || s.fart ? fart : plain;
      for (let dx = -m.reach; dx <= m.reach; dx++) {
        const x2 = x + dx;
        if (x2 < 0 || x2 >= W) continue;
        // Every surface in that column within the jump's height: over the columns between, the
        // arc passes at the higher floor's height, and drops down the landing column.
        for (let y2 = Math.max(2, y - m.rise); y2 < H; y2++) {
          if (dx === 0 || !standable(x2, y2)) continue;
          const top = Math.min(y, y2);
          if (!clear(x, top - 2, y - 1)) continue;
          let ok = true;
          for (let cx = Math.min(x, x2) + 1; cx < Math.max(x, x2) && ok; cx++) ok = clear(cx, top - 2, top - 1);
          if (ok && clear(x2, top - 2, y2 - 1)) edges[n].push(id[y2 * W + x2]);
        }
        // Over an edge into nothing, lava or water: a way to lose a life.
        if (Math.abs(dx) <= 1 && dx !== 0 && clear(x2, y - 2, y - 1)) {
          let fy = y;
          while (fy < H && !solid(x2, fy) && !deadly(x2, fy)) fy++;
          if (fy >= H || deadly(x2, fy)) dies[n] = true;
        }
      }
    });
    const g = { map, id, cells, edges, dies };
    graphs.set(k, g);
    return g;
  };

  /** Targets cell `n` can shoot in this state: standing, or anywhere up its jump. */
  const shootable = (g: Graph, s: State, n: number): number[] => {
    const [x, y] = g.cells[n];
    const standY = arrowY(y * TILE - heroH, heroH);
    const out: number[] = [];
    targets.forEach((t, i) => {
      if (s.hit & (1 << i)) return;
      const b = { x: t.x * TILE + (TILE - 22) / 2, y: (t.y + 1) * TILE - 68, w: 22, h: 68 };
      const tx = Math.floor((b.x + b.w / 2) / TILE);
      if (Math.abs(tx - x) > 22 || tx === x) return;
      for (let h = standY; h >= standY - plain.rise * TILE; h -= 2) {
        if (!(h < b.y + b.h && h + 4 > b.y)) continue;
        const rows = [Math.floor(h / TILE), Math.floor((h + 3) / TILE)];
        let clearLine = true;
        for (let cx = Math.min(x, tx) + 1; cx < Math.max(x, tx) && clearLine; cx++) {
          for (const r of rows) if (isSolid(g.map[r]?.[cx] ?? 0)) clearLine = false;
        }
        // Room to jump that high where the hero stands.
        for (let r = Math.floor(h / TILE); r < y && clearLine; r++) if (isSolid(g.map[r]?.[x] ?? 0)) clearLine = false;
        if (clearLine) { out.push(i); break; }
      }
    });
    return out;
  };

  const [rx, ry] = level.rescuePos;
  const isGoal = (g: Graph, n: number) => {
    const [x, y] = g.cells[n];
    return Math.abs(x - rx) <= 1 && y > ry && y <= ry + 3;
  };

  // Win(S): the cells from which, in state S, the end can still be reached.
  const wins = new Map<string, Uint8Array>();
  const winFor = (s: State): Uint8Array => {
    const k = stateKey(s);
    const cached = wins.get(k);
    if (cached) return cached;
    const g = graphFor(s);
    const win = new Uint8Array(g.cells.length);
    wins.set(k, win);
    const seeds: number[] = [];
    g.cells.forEach((_, n) => {
      let w = isGoal(g, n);
      if (!w) {
        for (const st of stations) {
          if (st.kind !== 'fart' && st.kind !== 'bighead') continue;
          const [x, y] = g.cells[n];
          if (Math.abs(st.x - x) > 1 || st.y < y - 3 || st.y >= y) continue;
          const next = { ...s, [st.kind]: true };
          if (stateKey(next) === k) continue;
          const g2 = graphFor(next);
          const m = g2.id[y * base[0].length + x];
          if (m >= 0 && winFor(next)[m]) { w = true; break; }
        }
      }
      if (!w) {
        for (const i of shootable(g, s, n)) {
          const next = { ...s, hit: s.hit | (1 << i) };
          const g2 = graphFor(next);
          const [x, y] = g.cells[n];
          const m = g2.id[y * base[0].length + x];
          if (m >= 0 && winFor(next)[m]) { w = true; break; }
        }
      }
      if (w) { win[n] = 1; seeds.push(n); }
    });
    // Backwards: whoever can move into a winning cell wins.
    const back: number[][] = g.cells.map(() => []);
    g.edges.forEach((es, n) => { for (const m of es) back[m].push(n); });
    while (seeds.length) {
      const m = seeds.pop()!;
      for (const n of back[m]) if (!win[n]) { win[n] = 1; seeds.push(n); }
    }
    return win;
  };

  // Forward from the start, through every state the hero can be in.
  const [px, py] = level.playerStart;
  const start0: State = { hit: 0, fart: false, bighead: false };
  const g0 = graphFor(start0);
  let startCell = -1;
  for (let y = py; y < H && startCell < 0; y++) startCell = g0.id[y * W + px];
  const seen = new Set<string>();
  const queue: Array<[State, number]> = [[start0, startCell]];
  const locked = new Map<number, boolean>();
  let finishable = false;
  while (queue.length) {
    const [s, n] = queue.pop()!;
    const k = `${stateKey(s)}@${n}`;
    if (n < 0 || seen.has(k)) continue;
    seen.add(k);
    const g = graphFor(s);
    if (isGoal(g, n)) finishable = true;
    // Landed here, the timed powers may be gone: can the end still be reached?
    const [x, y] = g.cells[n];
    const bare = { hit: s.hit, fart: false, bighead: false };
    const gb = graphFor(bare);
    const nb = gb.id[y * W + x];
    if (nb >= 0 && !winFor(bare)[nb]) locked.set(y * W + x, gb.dies[nb]);
    for (const m of g.edges[n]) queue.push([s, m]);
    for (const st of stations) {
      if ((st.kind !== 'fart' && st.kind !== 'bighead') || s[st.kind]) continue;
      if (Math.abs(st.x - x) > 1 || st.y < y - 3 || st.y >= y) continue;
      const next = { ...s, [st.kind]: true };
      queue.push([next, graphFor(next).id[y * W + x]]);
    }
    for (const i of shootable(g, s, n)) {
      const next = { ...s, hit: s.hit | (1 << i) };
      queue.push([next, graphFor(next).id[y * W + x]]);
    }
  }

  // Group the stuck cells into stretches: neighbours along a floor.
  const locks: Lock[] = [];
  const done = new Set<number>();
  for (const [cell, canDie] of [...locked].sort((a, b) => (a[0] % W) - (b[0] % W))) {
    if (done.has(cell)) continue;
    const y = Math.floor(cell / W);
    let x = cell % W;
    let count = 0;
    let die = canDie;
    while (locked.has(y * W + x)) { done.add(y * W + x); die = die || locked.get(y * W + x)!; count++; x++; }
    locks.push({ x: cell % W, y, cells: count, canDie: die });
  }
  return { locks, finishable };
}
