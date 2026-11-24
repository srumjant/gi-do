import { describe, expect, it } from 'vitest';
import { arrowY, standAt, step } from './helpers/courseRuns';
import { TILE } from '../src/config/constants';
import { DIFF_KEYS, type DifficultyKey } from '../src/config/difficulty';
import {
  isSolid, TILE_CRACKED, TILE_EMPTY, TILE_GATE, TILE_LAVA, TILE_PLANK, TILE_WATER, type Level, type StationKind,
} from '../src/data/levels';
import { MANGULOSSI } from '../src/data/levels2/mangulossi';
import { SAALID } from '../src/data/levels2/saalid';
import { TROONISAAL } from '../src/data/levels2/troonisaal';
import { STAGES } from '../src/data/stages';
import type { TRexState } from '../src/game/bosses/tRex';
import { finishLevel, getRunTotals, startRun } from '../src/game/run';
import { createWorld, rescueSpot } from '../src/game/world';
import type { World } from '../src/game/types';

const LEVELS = [MANGULOSSI, SAALID, TROONISAAL];
const mapOf = (level: Level) => level.generate({} as never);
const open = (c: number | undefined) => c === undefined || c === TILE_EMPTY || c === TILE_LAVA || c === TILE_WATER;

/** A world where only the zombies and giants come. */
function guardedWorld(level: Level, key: DifficultyKey = 'super_easy'): World {
  const world = createWorld(0, key, 'gigi', undefined, level);
  for (const d of world.pending) d.spawned = d.type !== 'giant' && !d.zombie;
  return world;
}

function inTheWay(world: World): boolean {
  const p = world.player;
  const front = p.x + p.w;
  const shotY = arrowY(p.y, p.h);
  const guard = world.enemies.some((e) => e.alive && (e.type === 'giant' || e.zombie)
    && e.x + e.w > front && e.x - front < 8 * TILE && e.y < p.y + p.h && e.y + e.h > p.y);
  const target = world.course!.targets.some((t) => !t.hit && t.box.x > front && t.box.x - front < 14 * TILE
    && shotY < t.box.y + t.box.h && shotY + 4 > t.box.y);
  return guard || target;
}

/** A drawbridge cell ahead whose planks are still coming down: wait for them. */
function bridgeComing(world: World, tx: number): boolean {
  return world.course!.targets.some((t) => t.done < t.cells.length
    && t.cells.some((c) => c.to === TILE_PLANK && (c.x === tx + 1 || c.x === tx + 2)));
}

/** Run right, jumping walls and gaps under the next steps, firing at what is in the way. */
function playRight(world: World, untilX: number, frames = 5000): boolean {
  let holding = 0;
  for (let i = 0; i < frames && !world.dead && !world.won; i++) {
    const p = world.player;
    const tx = Math.floor((p.x + p.w / 2) / TILE);
    const rows = [Math.floor((p.y + 2) / TILE), Math.floor((p.y + p.h - 2) / TILE)];
    const wall = rows.some((r) => !open(world.map[r]?.[tx + 1]));
    const below = Math.floor((p.y + p.h + 1) / TILE);
    const gap = open(world.map[below]?.[tx + 1]) || open(world.map[below]?.[tx + 2]);
    const wait = p.onGround && bridgeComing(world, tx);
    const start = p.onGround && holding === 0 && !wait && (wall || gap);
    if (start) holding = 20;
    const fire = p.arrowCooldown === 0 && inTheWay(world);
    step(world, { right: !wait, jump: holding > 0, jumpPressed: start, firePressed: fire });
    if (holding > 0) holding--;
    world.player.hasCape = false;
    if (p.x / TILE >= untilX) return true;
  }
  return world.won;
}

/** Runs of `code` at row `y`, as [first, last] columns. */
function runs(map: number[][], y: number, code: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  map[y].forEach((c, x) => {
    if (c !== code) return;
    if (map[y][x - 1] === code) out[out.length - 1][1] = x;
    else out.push([x, x]);
  });
  return out;
}

describe('Toy Castle, the theme', () => {
  it('is the sixth world: two chases after the T-Rex, then his fight', () => {
    expect(STAGES.slice(15, 18).map((s) => [s.theme, s.level, s.nameKey])).toEqual([
      [5, MANGULOSSI, 'level_6'], [5, SAALID, 'level_6_2'], [5, TROONISAAL, 'level_6_3'],
    ]);
    expect(LEVELS.map((l) => l.ending)).toEqual(['chase', 'chase', 'boss']);
    expect([MANGULOSSI.villain, SAALID.villain]).toEqual(['tRex', 'tRex']);
  });

  it('goes on to the home world when the Throne Room is done (2026-11-24); the run is won at its end', () => {
    startRun(17);
    expect(STAGES[17].level).toBe(TROONISAAL);
    expect(finishLevel(getRunTotals())).toBe('next-level');
    startRun(STAGES.length - 1);
    expect(finishLevel(getRunTotals())).toBe('game-won');
  });

  it('has its zombies as toy soldiers', () => {
    for (const level of LEVELS) {
      const zombies = level.enemyDefs.filter((d) => d.zombie);
      expect(zombies.length).toBeGreaterThan(0);
      for (const z of zombies) expect(z.type).toBe('soldier');
    }
  });

  it('has every gap a plain jump on Hard, but the moat, which only its drawbridge crosses', () => {
    for (const level of LEVELS) {
      const map = mapOf(level);
      const bridge = new Set(createWorld(0, 'hard', 'gigi', undefined, level).course!.targets
        .flatMap((t) => t.cells.filter((c) => c.to === TILE_PLANK).map((c) => c.x)));
      let run = 0;
      map[0].forEach((_, x) => {
        let floor = false;
        for (let y = 19; y < map.length; y++) if (isSolid(map[y][x])) floor = true;
        run = floor || bridge.has(x) ? 0 : run + 1;
        expect({ level: level.name, x, run: Math.min(run, 4) }).not.toEqual({ level: level.name, x, run: 4 });
      });
      if (level === MANGULOSSI) expect(bridge.size).toBeGreaterThanOrEqual(12);
    }
  });

  it('hands out what each obstacle needs after the last checkpoint before it', () => {
    for (const level of LEVELS) {
      const map = mapOf(level);
      const [startX] = level.playerStart;
      const flags = level.course!.flags.map((f) => f.x);
      const targets = level.course!.targets.map((t) => t.x);
      const needs: Array<{ x: number; kinds: StationKind[] }> = [
        ...level.enemyDefs.filter((d) => d.zombie).map((d) => ({ x: d.x, kinds: ['bow', 'chicken'] as StationKind[] })),
        ...level.enemyDefs.filter((d) => d.type === 'giant').map((d) => ({ x: d.x, kinds: ['chicken'] as StationKind[] })),
        ...targets.map((x) => ({ x, kinds: ['bow', 'chicken'] as StationKind[] })),
        ...runs(map, 22, TILE_CRACKED).map(([x]) => ({ x, kinds: ['bighead'] as StationKind[] })),
      ];
      for (const need of needs) {
        const from = Math.max(startX, ...flags.filter((x) => x < need.x));
        const ok = level.course!.stations.some((s) => need.kinds.includes(s.kind) && s.x >= from && s.x <= need.x);
        expect({ level: level.name, x: need.x, ok }).toEqual({ level: level.name, x: need.x, ok: true });
      }
    }
  });

  for (const level of LEVELS) {
    it(`runs ${level.name} through on every difficulty, shooting and raying what is in the way`, () => {
      const door = level.course!.doors[0];
      for (const key of DIFF_KEYS) {
        const world = guardedWorld(level, key);
        const there = playRight(world, door ? door.x + 2 : level.width);
        expect({ key, done: door ? there : world.won, dead: world.dead }).toEqual({ key, done: true, dead: false });
      }
    });
  }
});

describe('Mängulossi', () => {
  it('lays the drawbridge across the moat when its target is shot, and the gate lifts for its own', () => {
    const world = guardedWorld(MANGULOSSI);
    const [moat, gate] = world.course!.targets;
    expect(moat.cells.every((c) => c.to === TILE_PLANK)).toBe(true);
    expect(gate.cells.every((c) => c.to === TILE_EMPTY)).toBe(true);
    expect(world.map[gate.cells[0].y][gate.cells[0].x]).toBe(TILE_GATE);
    for (const t of [moat, gate]) t.hit = true;
    step(world, {}, 200);
    for (const c of moat.cells) expect(world.map[c.y][c.x]).toBe(TILE_PLANK);
    expect(world.map[gate.cells[0].y][gate.cells[0].x]).toBe(TILE_EMPTY);
  });
});

describe('Troonisaal', () => {
  it('shuts the throne room behind the hero, puts the T-Rex\'s block over the middle of his walk, and the cage on the dais', () => {
    const world = guardedWorld(TROONISAAL);
    const [door] = world.course!.doors;
    standAt(world, door.x + 3, 23);
    step(world);
    expect(world.map[door.cells[0].y][door.x]).toBe(TILE_GATE);
    const b = world.courseBoss as TRexState;
    expect(b.kind).toBe('tRex');
    // The block's target stands by the door, with room for the hero between them to shoot it
    // facing into the room (browser, 2026-11-23: a tile closer, there was none).
    expect(b.target.x - (door.x + 1) * TILE).toBeGreaterThanOrEqual(world.player.w + 4);
    // The block hangs under the ceiling, and the dais is past his walk.
    expect(isSolid(world.map[Math.floor((b.block.y - 50) / TILE)][Math.floor(b.blockX / TILE)])).toBe(false);
    // His walk ends a tile short of it, as the other bosses' walks end short of their cages.
    expect(isSolid(world.map[22][Math.floor((b.patrol[1] + b.w) / TILE) + 1])).toBe(true);
    expect(isSolid(world.map[22][Math.floor((b.patrol[1] + b.w) / TILE)])).toBe(false);
    const spot = rescueSpot(world);
    expect(spot.y + spot.h).toBe(21 * TILE);
    // A station for every tool.
    expect(new Set(world.course!.stations.filter((s) => s.x > door.x * TILE).map((s) => s.kind)))
      .toEqual(new Set(['bow', 'fart', 'bighead', 'chicken']));
  });
});
