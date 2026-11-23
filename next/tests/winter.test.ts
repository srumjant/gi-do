import { describe, expect, it } from 'vitest';
import { arrowY, standAt, step } from './helpers/courseRuns';
import { TILE } from '../src/config/constants';
import { DIFF_KEYS, type DifficultyKey } from '../src/config/difficulty';
import {
  isSolid, TILE_CRACKED, TILE_EMPTY, TILE_GATE, TILE_ICE, TILE_LAVA, TILE_WATER, type Level, type StationKind,
} from '../src/data/levels';
import { JAALOSS } from '../src/data/levels2/jaaloss';
import { JARV } from '../src/data/levels2/jarv';
import { TALVEMAA } from '../src/data/levels2/talvemaa';
import { STAGES } from '../src/data/stages';
import type { YetiState } from '../src/game/bosses/yeti';
import { createWorld, rescueSpot } from '../src/game/world';
import type { World } from '../src/game/types';

const LEVELS = [TALVEMAA, JARV, JAALOSS];
const mapOf = (level: Level) => level.generate({} as never);
const open = (c: number | undefined) => c === undefined || c === TILE_EMPTY || c === TILE_LAVA || c === TILE_WATER;

/** A world where only the zombies and giants come: the ordinary enemies would only kill the runner. */
function guardedWorld(level: Level, key: DifficultyKey = 'super_easy'): World {
  const world = createWorld(0, key, 'gigi', undefined, level);
  for (const d of world.pending) d.spawned = d.type !== 'giant' && !d.zombie;
  return world;
}

/** A zombie, a giant or a target not yet hit, ahead and in line. */
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

/**
 * Run right, jumping at every wall ahead and at every gap under the next steps (on the floor
 * the hero stands on, the lake's floes as much as the ground), firing at whatever is in the way.
 */
function playRight(world: World, untilX: number, frames = 5000): boolean {
  let holding = 0;
  for (let i = 0; i < frames && !world.dead && !world.won; i++) {
    const p = world.player;
    const tx = Math.floor((p.x + p.w / 2) / TILE);
    const rows = [Math.floor((p.y + 2) / TILE), Math.floor((p.y + p.h - 2) / TILE)];
    const wall = rows.some((r) => !open(world.map[r]?.[tx + 1]));
    const below = Math.floor((p.y + p.h + 1) / TILE);
    const gap = open(world.map[below]?.[tx + 1]) || open(world.map[below]?.[tx + 2]);
    const start = p.onGround && holding === 0 && (wall || gap);
    if (start) holding = 20;
    const fire = p.arrowCooldown === 0 && inTheWay(world);
    step(world, { right: true, jump: holding > 0, jumpPressed: start, firePressed: fire });
    if (holding > 0) holding--;
    world.player.hasCape = false;
    if (p.x / TILE >= untilX) return true;
  }
  return world.won;
}

/** Each column's floor: the first solid tile from row 19 down, or none. */
function floors(level: Level): Array<number | null> {
  const map = mapOf(level);
  return map[0].map((_, x) => {
    for (let y = 19; y < map.length; y++) if (isSolid(map[y][x])) return y;
    return null;
  });
}

/** Runs of `ch`-tiles at row `y`, as [first, last] columns. */
function runs(map: number[][], y: number, code: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  map[y].forEach((c, x) => {
    if (c !== code) return;
    if (map[y][x - 1] === code) out[out.length - 1][1] = x;
    else out.push([x, x]);
  });
  return out;
}

/** The ice cliffs: runs of ice standing seven tall from the ground, by first column. */
function cliffs(level: Level): Array<[number, number]> {
  const map = mapOf(level);
  return runs(map, 16, TILE_ICE).filter(([x]) => map[22][x] === TILE_ICE);
}

describe('Winter, the theme', () => {
  it('is the run\'s next three levels: two chases after the Yeti, then him', () => {
    expect(STAGES.slice(12, 15).map((s) => [s.theme, s.level, s.nameKey])).toEqual([
      [4, TALVEMAA, 'level_5'], [4, JARV, 'level_5_2'], [4, JAALOSS, 'level_5_3'],
    ]);
    expect(LEVELS.map((l) => l.ending)).toEqual(['chase', 'chase', 'boss']);
    expect([TALVEMAA.villain, JARV.villain]).toEqual(['yeti', 'yeti']);
    expect(JAALOSS.course!.boss?.kind).toBe('yeti');
  });

  it('has its zombies as penguins', () => {
    for (const level of LEVELS) {
      const zombies = level.enemyDefs.filter((d) => d.zombie);
      expect(zombies.length).toBeGreaterThan(0);
      for (const z of zombies) expect(z.type).toBe('penguin');
    }
  });

  it('has every gap a plain jump on Hard', () => {
    for (const level of LEVELS) {
      let run = 0;
      floors(level).forEach((f, x) => {
        run = f === null ? run + 1 : 0;
        expect({ level: level.name, x, run: Math.min(run, 4) }).not.toEqual({ level: level.name, x, run: 4 });
      });
    }
  });

  it('hands out what each obstacle needs after the last checkpoint before it', () => {
    for (const level of LEVELS) {
      const map = mapOf(level);
      const [startX] = level.playerStart;
      const flags = level.course!.flags.map((f) => f.x);
      const needs: Array<{ x: number; kinds: StationKind[] }> = [
        ...level.enemyDefs.filter((d) => d.zombie).map((d) => ({ x: d.x, kinds: ['bow', 'chicken'] as StationKind[] })),
        ...level.enemyDefs.filter((d) => d.type === 'giant').map((d) => ({ x: d.x, kinds: ['chicken'] as StationKind[] })),
        ...runs(map, 22, TILE_CRACKED).map(([x]) => ({ x, kinds: ['bighead'] as StationKind[] })),
        ...cliffs(level).map(([x]) => ({ x, kinds: ['fart'] as StationKind[] })),
      ];
      for (const need of needs) {
        const from = Math.max(startX, ...flags.filter((x) => x < need.x));
        const ok = level.course!.stations.some((s) => need.kinds.includes(s.kind) && s.x >= from && s.x < need.x);
        expect({ level: level.name, x: need.x, ok }).toEqual({ level: level.name, x: need.x, ok: true });
      }
    }
  });

  it('has its ice cliffs too tall for a plain jump, and not for a fart', () => {
    /** From three tiles before, a held running jump: up onto the ice, or clean over it? */
    const crosses = (level: Level, key: DifficultyKey, [x0, x1]: [number, number], fart: boolean) => {
      const world = guardedWorld(level, key);
      world.course!.stations.forEach((s) => { s.cooldown = 99999; });
      standAt(world, x0 - 3, 23);
      for (let i = 0; i < 240; i++) {
        const p = world.player;
        if (fart) p.fartTimer = 900;
        step(world, { right: true, jump: true, jumpPressed: p.onGround });
        if (p.onGround && (p.y + p.h <= 16 * TILE || p.x > (x1 + 1) * TILE)) return true;
      }
      return false;
    };
    for (const level of [JARV, JAALOSS]) {
      const [cliff] = cliffs(level);
      expect(cliff).toBeDefined();
      for (const key of DIFF_KEYS) {
        expect({ level: level.name, key, plain: crosses(level, key, cliff, false) })
          .toEqual({ level: level.name, key, plain: false });
        expect({ level: level.name, key, fart: crosses(level, key, cliff, true) })
          .toEqual({ level: level.name, key, fart: true });
      }
    }
  });

  it('stops no hero at a cracked wall who has a big head, and every hero who has none', () => {
    for (const level of [JARV, JAALOSS]) {
      const [[x0, x1]] = runs(mapOf(level), 22, TILE_CRACKED);
      for (const bigHead of [false, true]) {
        const world = guardedWorld(level);
        world.course!.stations.forEach((s) => { s.cooldown = 99999; });
        standAt(world, x0 - 3, 23);
        world.player.bigHeadTimer = bigHead ? 900 : 0;
        const through = playRight(world, x1 + 2, 300);
        expect({ level: level.name, bigHead, through }).toEqual({ level: level.name, bigHead, through: bigHead });
      }
    }
  });
});

describe('Talvine imedemaa', () => {
  it('has a long flat stretch of ice, and ice right up to a pit', () => {
    const map = mapOf(TALVEMAA);
    const ice = runs(map, 23, TILE_ICE);
    expect(ice.some(([a, b]) => b - a >= 12)).toBe(true);
    expect(ice.some(([, b]) => open(map[23][b + 1]))).toBe(true);
  });

  it('runs through to the chase on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      const world = guardedWorld(TALVEMAA, key);
      playRight(world, TALVEMAA.width);
      expect({ key, won: world.won }).toEqual({ key, won: true });
    }
  });
});

describe('Jäätunud järv', () => {
  const level = JARV;
  const floes = () => runs(mapOf(level), 22, TILE_ICE).filter(([x]) => mapOf(level)[23][x] === TILE_WATER);

  it('floats its floes on icy water, each long enough to land on from a full jump and slide to a stop', () => {
    // Found by this test (2026-11-23): on six-tile floes, super easy's long jump came down near
    // the far end, and a hero who let go slid off into the water.
    expect(floes().length).toBeGreaterThanOrEqual(3);
    for (const key of DIFF_KEYS) {
      for (const [a, b] of floes().slice(1)) {
        // From the floe before, run and jump onto this one with jump held, and let go of
        // everything the moment you land.
        const world = guardedWorld(level, key);
        const before = floes().filter(([, e]) => e < a).pop()!;
        standAt(world, before[0] + 1, 22);
        let jumped = false;
        let landed = false;
        for (let i = 0; i < 300 && !world.dead; i++) {
          const p = world.player;
          landed = landed || (jumped && p.onGround);
          const press = !jumped && p.onGround && (p.x + p.w) / TILE >= before[1] + 0.6;
          step(world, { right: !landed, jump: (jumped || press) && !landed, jumpPressed: press });
          if (press) jumped = true;
        }
        const p = world.player;
        expect({ key, floe: a, safe: !world.dead && p.x >= a * TILE - p.w && p.x <= (b + 1) * TILE })
          .toEqual({ key, floe: a, safe: true });
      }
    }
  });

  it('drops a hero who falls between the floes into the water', () => {
    const world = guardedWorld(level);
    const [first] = floes();
    standAt(world, first[1] + 2, 22);
    world.player.hasCape = false;
    world.player.invincible = 0;
    step(world, {}, 40);
    expect(world.dead).toBe(true);
  });

  it('runs through to the chase on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      const world = guardedWorld(level, key);
      playRight(world, level.width);
      expect({ key, won: world.won, x: Math.round(world.player.x / TILE) }).toEqual({ key, won: true, x: expect.any(Number) });
    }
  });
});

describe('Jääloss', () => {
  const level = JAALOSS;

  it('keeps the target behind cracked ice until a big head smashes it, and then it opens the gate', () => {
    const world = guardedWorld(level);
    const t = world.course!.targets[0];
    const [[x0]] = runs(mapOf(level), 22, TILE_CRACKED);
    expect(x0 * TILE).toBeLessThan(t.box.x);
    world.arrows.push({ x: x0 * TILE - 24, y: 22 * TILE - 4, vx: 6, life: 60, isChicken: false });
    step(world, {}, 30);
    expect(t.hit).toBe(false);
    const bar = t.cells[0];
    expect(world.map[bar.y][bar.x]).toBe(TILE_GATE);
  });

  it('runs through to the throne room on every difficulty', () => {
    const door = level.course!.doors[0];
    for (const key of DIFF_KEYS) {
      const world = guardedWorld(level, key);
      const there = playRight(world, door.x + 2);
      expect({ key, there, dead: world.dead }).toEqual({ key, there: true, dead: false });
    }
  });

  it('shuts the throne room door behind the hero, cages the sibling on the dais, and the Yeti slams into its walls', () => {
    const world = guardedWorld(level);
    const [door] = world.course!.doors;
    standAt(world, door.x + 3, 23);
    step(world);
    expect(world.map[door.cells[0].y][door.x]).toBe(TILE_GATE);
    const spot = rescueSpot(world);
    expect(spot.y + spot.h).toBe(21 * TILE);
    const b = world.courseBoss as YetiState;
    // His walls are the room's: the door's inside face, and the dais's foot.
    expect(isSolid(world.map[22][Math.floor(b.walls[0] / TILE) - 1])).toBe(true);
    expect(isSolid(world.map[22][Math.floor((b.walls[1] + b.w) / TILE)])).toBe(true);
    expect(isSolid(world.map[22][Math.floor((b.walls[1] + b.w) / TILE) - 1])).toBe(false);
    // And the icicles hang just under the ceiling.
    expect(isSolid(world.map[10][16])).toBe(true);
  });
});
