import { describe, expect, it } from 'vitest';
import { arrowY, climbs, standAt, step } from './helpers/courseRuns';
import { TILE } from '../src/config/constants';
import { DIFF_KEYS, type DifficultyKey } from '../src/config/difficulty';
import { isSolid, TILE_GATE, TILE_EMPTY, TILE_SPRING, type Level } from '../src/data/levels';
import { KATEDRAAL } from '../src/data/levels2/katedraal';
import { PIAZZA } from '../src/data/levels2/piazza';
import { TURG } from '../src/data/levels2/turg';
import { STAGES } from '../src/data/stages';
import { spawnEnemy } from '../src/game/enemy';
import { createWorld, rescueSpot } from '../src/game/world';
import type { World } from '../src/game/types';

const LEVELS = [PIAZZA, TURG, KATEDRAAL];
const mapOf = (level: Level) => level.generate({} as never);
const giantsOf = (level: Level) => level.enemyDefs.filter((d) => d.type === 'giant');

/** A world where only the giants and the zombie cooks come: what the chicken ray is for. */
function guardedWorld(level: Level, key: DifficultyKey = 'super_easy'): World {
  const world = createWorld(0, key, 'gigi', undefined, level);
  for (const d of world.pending) d.spawned = d.type !== 'giant' && !d.zombie;
  return world;
}

/** Anything the hero should fire at, ahead and in line: a giant, a zombie, a target not yet hit. */
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
 * Run right, jumping at every wall or gap ahead (as courseRuns.ts's runRight does), and firing
 * whenever something stands in the way. True once the hero is past column `untilX`.
 */
function playRight(world: World, untilX: number, frames = 4000): boolean {
  let holding = 0;
  for (let i = 0; i < frames && !world.dead && !world.won; i++) {
    const p = world.player;
    const tx = Math.floor((p.x + p.w / 2) / TILE);
    const rows = [Math.floor((p.y + 2) / TILE), Math.floor((p.y + p.h - 2) / TILE)];
    const wall = rows.some((r) => (world.map[r]?.[tx + 1] ?? 0) !== 0);
    const gap = world.map[23][tx + 1] === 0 || world.map[23][tx + 2] === 0;
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

/** The first solid row above `floorRow` in column `x`: a giant's roof. */
function roofRow(map: number[][], x: number, floorRow: number): number {
  let y = floorRow - 1;
  while (y >= 0 && !isSolid(map[y][x])) y--;
  return y;
}

/** The top of the solid run that roof is the bottom of. */
function roofTop(map: number[][], x: number, roof: number): number {
  let y = roof;
  while (y > 0 && isSolid(map[y - 1][x])) y--;
  return y;
}

describe('Palermo, the theme', () => {
  it('is the run\'s next three levels: two chases after the Pizza Chef, then him', () => {
    expect(STAGES.slice(9, 12).map((s) => [s.theme, s.level, s.nameKey])).toEqual([
      [3, PIAZZA, 'level_4'], [3, TURG, 'level_4_2'], [3, KATEDRAAL, 'level_4_3'],
    ]);
    expect(LEVELS.map((l) => l.ending)).toEqual(['chase', 'chase', 'boss']);
    expect([PIAZZA.villain, TURG.villain]).toEqual(['pizzaChef', 'pizzaChef']);
    expect(KATEDRAAL.course!.boss?.kind).toBe('pizzaChef');
  });

  it('has its zombies as cooks', () => {
    for (const level of LEVELS) {
      for (const z of level.enemyDefs.filter((d) => d.zombie)) expect(z.type).toBe('cook');
    }
  });

  it('has every gap a plain jump on Hard', () => {
    for (const level of LEVELS) {
      const row = mapOf(level)[23];
      let run = 0;
      row.forEach((c, x) => {
        run = c === TILE_EMPTY ? run + 1 : 0;
        expect({ level: level.name, x, run: Math.min(run, 4) }).not.toEqual({ level: level.name, x, run: 4 });
      });
    }
  });

  it('stands every giant under a roof no jump gets over, too tall to climb even from a spring', () => {
    for (const level of LEVELS) {
      const map = mapOf(level);
      for (const def of giantsOf(level)) {
        const e = spawnEnemy(map, {} as never, def)!;
        for (let x = def.x; x < def.x + e.w / TILE; x++) {
          const roof = roofRow(map, x, def.floorRow!);
          const headroom = (def.floorRow! - roof - 1) * TILE;
          expect({ level: level.name, x, headroom: headroom >= e.h && headroom < e.h + 20 })
            .toEqual({ level: level.name, x, headroom: true });
          expect({ level: level.name, x, tall: roofTop(map, x, roof) <= 9 }).toEqual({ level: level.name, x, tall: true });
        }
      }
    }
  });

  it('puts a chicken ray station before every giant', () => {
    for (const level of LEVELS) {
      for (const def of giantsOf(level)) {
        const near = level.course!.stations.some((s) => s.kind === 'chicken' && s.x < def.x && def.x - s.x <= 20);
        expect({ level: level.name, x: def.x, near }).toEqual({ level: level.name, x: def.x, near: true });
      }
    }
  });

  it('hands out chicken rays after the last checkpoint before every giant and zombie cook', () => {
    // Found in the browser (2026-11-23): Turg's first flag stood after its station, so a hero
    // who died at the giant came back without a ray and with the station behind them.
    for (const level of LEVELS) {
      const [startX] = level.playerStart;
      const flags = level.course!.flags.map((f) => f.x);
      for (const guard of level.enemyDefs.filter((d) => d.type === 'giant' || d.zombie)) {
        const from = Math.max(startX, ...flags.filter((x) => x < guard.x));
        const ray = level.course!.stations.some((s) => s.kind === 'chicken' && s.x >= from && s.x < guard.x);
        expect({ level: level.name, x: guard.x, ray }).toEqual({ level: level.name, x: guard.x, ray: true });
      }
    }
  });

  it('lets no hero past a giant without a chicken ray', () => {
    for (const level of LEVELS) {
      for (const def of giantsOf(level)) {
        for (const key of DIFF_KEYS) {
          const world = guardedWorld(level, key);
          world.course!.stations.forEach((s) => { s.cooldown = 99999; });
          standAt(world, def.x - 6, def.floorRow!);
          const past = playRight(world, def.x + 4, 600);
          expect({ level: level.name, x: def.x, key, past }).toEqual({ level: level.name, x: def.x, key, past: false });
        }
      }
    }
  });
});

describe('Palermo väljak', () => {
  it('hands over the chicken ray before its two zombie cooks, and a station before the giant', () => {
    const ray = PIAZZA.course!.stations.find((s) => s.kind === 'chicken')!;
    const zombies = PIAZZA.enemyDefs.filter((d) => d.zombie);
    expect(zombies).toHaveLength(2);
    for (const z of zombies) expect(z.x).toBeGreaterThan(ray.x);
    expect(giantsOf(PIAZZA)).toHaveLength(1);
  });

  it('runs through to the chase on every difficulty, raying what is in the way', () => {
    for (const key of DIFF_KEYS) {
      const world = guardedWorld(PIAZZA, key);
      playRight(world, PIAZZA.width);
      expect({ key, won: world.won }).toEqual({ key, won: true });
    }
  });
});

describe('Turg', () => {
  const level = TURG;

  it('keeps the target out of a ray\'s reach until the giant in front of it is a chicken', () => {
    const world = guardedWorld(level);
    const t = world.course!.targets[0];
    const giant = giantsOf(level).find((d) => d.x * TILE < t.box.x && t.box.x - d.x * TILE < 14 * TILE)!;
    standAt(world, giant.x - 3, 23);
    // Long enough for the camera to catch up, and the giant to come into view.
    step(world, {}, 90);
    const g = world.enemies.find((e) => e.type === 'giant' && e.alive && Math.abs(e.x - giant.x * TILE) < TILE)!;
    const p = world.player;
    p.chickenRayCharges = 8;
    p.hasBow = true;
    step(world, { firePressed: true });
    step(world, {}, 30);
    expect(g.type).toBe('chicken');
    expect(t.hit).toBe(false);
    // The chicken wanders off; the next ray reaches the target, and the bars lift.
    g.alive = false;
    step(world, { firePressed: true });
    step(world, {}, 150);
    expect(t.hit).toBe(true);
    const bar = t.cells[0];
    expect(world.map[bar.y][bar.x]).toBe(TILE_EMPTY);
  });

  it('throws a hero up onto the roofs from the spring, which no plain jump reaches', () => {
    const map = mapOf(level);
    const spring = map[23].indexOf(TILE_SPRING);
    for (const key of DIFF_KEYS) {
      expect({ key, plain: climbs(level, key, spring + 2, 23, 16, false) }).toEqual({ key, plain: false });
      const world = guardedWorld(level, key);
      standAt(world, spring - 3, 23);
      let up = false;
      for (let i = 0; i < 240 && !up; i++) {
        step(world, { right: true });
        const p = world.player;
        up = p.onGround && p.y + p.h <= 16 * TILE;
      }
      expect({ key, up }).toEqual({ key, up: true });
    }
  });

  it('runs through to the chase on every difficulty, raying what is in the way', () => {
    for (const key of DIFF_KEYS) {
      const world = guardedWorld(level, key);
      playRight(world, level.width);
      expect({ key, won: world.won }).toEqual({ key, won: true });
    }
  });
});

describe('Katedraal', () => {
  const level = KATEDRAAL;

  it('has a gate that needs both its targets, one of them behind a giant', () => {
    const world = guardedWorld(level);
    const targets = world.course!.targets;
    const main = targets.find((t) => t.partOf === null)!;
    const helper = targets.find((t) => t.partOf !== null)!;
    const bar = main.cells[0];
    expect(world.map[bar.y][bar.x]).toBe(TILE_GATE);
    main.hit = true;
    step(world, {}, 150);
    expect(world.map[bar.y][bar.x]).toBe(TILE_GATE);
    helper.hit = true;
    step(world, {}, 150);
    expect(world.map[bar.y][bar.x]).toBe(TILE_EMPTY);
    expect(giantsOf(level).some((g) => g.x * TILE < main.box.x && main.box.x - g.x * TILE < 14 * TILE)).toBe(true);
  });

  it('puts two giants in the portico and zombie cooks in front of another', () => {
    expect(giantsOf(level).length).toBeGreaterThanOrEqual(4);
    expect(level.enemyDefs.filter((d) => d.zombie)).toHaveLength(2);
  });

  it('runs through to the square on every difficulty, raying what is in the way', () => {
    const door = level.course!.doors[0];
    for (const key of DIFF_KEYS) {
      const world = guardedWorld(level, key);
      const there = playRight(world, door.x + 2);
      expect({ key, there, dead: world.dead }).toEqual({ key, there: true, dead: false });
    }
  });

  it('ends with the Pizza Chef: the square\'s door shuts behind the hero, the cage on the steps', () => {
    const world = guardedWorld(level);
    const [door] = world.course!.doors;
    standAt(world, door.x + 3, 23);
    step(world);
    expect(world.map[door.cells[0].y][door.x]).toBe(TILE_GATE);
    const spot = rescueSpot(world);
    expect(spot.y + spot.h).toBe(22 * TILE);
  });
});
