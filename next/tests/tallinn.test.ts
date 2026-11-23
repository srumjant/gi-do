import { describe, expect, it } from 'vitest';
import { arrowRange, climbs, HEROES, hits, quietWorld, runRight, standAt, step } from './helpers/courseRuns';
import { TILE } from '../src/config/constants';
import { DIFF_KEYS, type DifficultyKey } from '../src/config/difficulty';
import { isSolid, TILE_CRACKED, TILE_EMPTY, TILE_GATE, TILE_SPRING, type Level } from '../src/data/levels';
import { RAEKODA } from '../src/data/levels2/raekoda';
import { TORNID } from '../src/data/levels2/tornid';
import { VANALINN } from '../src/data/levels2/vanalinn';
import { STAGES } from '../src/data/stages';
import { rescueSpot } from '../src/game/world';
import type { Rect, World } from '../src/game/types';

const mapOf = (level: Level) => level.generate({} as never);

/** The first solid row in a column: the top of whatever stands there. */
function topRow(level: Level, x: number): number {
  const map = mapOf(level);
  for (let y = 0; y < map.length; y++) if (isSolid(map[y][x])) return y;
  return map.length;
}

/** Every run of cracked stone along the ground floor under a tower's bricks: the towers' doors. */
function doors(level: Level): Array<[number, number]> {
  const map = mapOf(level);
  const row = map[22];
  const runs: Array<[number, number]> = [];
  row.forEach((c, x) => {
    if (c !== TILE_CRACKED || !isSolid(map[18][x]) || map[18][x] === TILE_CRACKED) return;
    if (row[x - 1] === TILE_CRACKED) runs[runs.length - 1][1] = x;
    else runs.push([x, x]);
  });
  return runs;
}

/** The springs in the ground, left to right, by their first column. */
function springs(level: Level): number[] {
  const row = mapOf(level)[23];
  return row.flatMap((c, x) => (c === TILE_SPRING && row[x - 1] !== TILE_SPRING ? [x] : []));
}

/**
 * Run at a spring from three tiles back: does the hero come down on `topRow` or higher, past it?
 * (Or reach the villain up there, which ends the level mid-air.)
 */
function springsUp(level: Level, key: DifficultyKey, springX: number, topRow: number): boolean {
  const world = quietWorld(level, key);
  standAt(world, springX - 3, 23);
  for (let i = 0; i < 240; i++) {
    const p = world.player;
    step(world, { right: true });
    if (world.won) return true;
    if (p.onGround && p.y + p.h <= topRow * TILE && p.x > (springX + 2) * TILE) return true;
  }
  return false;
}

function shoot(world: World, box: Rect): void {
  world.arrows.push({ x: box.x - 8, y: box.y + box.h - 20, vx: 6, life: 60, isChicken: false });
}

/** Run right; at a shut gate, shoot its target and wait for the bars, then run on. */
function runThrough(level: Level, key: DifficultyKey, untilX: number): World {
  const world = quietWorld(level, key);
  for (let leg = 0; leg < 6 && !world.won; leg++) {
    if (runRight(world, untilX, 2500)) break;
    const shut = world.course!.targets.find((t) => !t.hit);
    if (!shut) break;
    shoot(world, shut.box);
    step(world, {}, 120);
  }
  return world;
}

describe('Tallinn, the theme', () => {
  it('is the run\'s next three levels: two chases after Vana Toomas, then him', () => {
    expect(STAGES.slice(6, 9).map((s) => [s.theme, s.level, s.nameKey])).toEqual([
      [2, VANALINN, 'level_3'], [2, TORNID, 'level_3_2'], [2, RAEKODA, 'level_3_3'],
    ]);
    expect([VANALINN.ending, TORNID.ending, RAEKODA.ending]).toEqual(['chase', 'chase', 'boss']);
    expect([VANALINN.villain, TORNID.villain]).toEqual(['vanaToomas', 'vanaToomas']);
  });

  it('has its towers too tall for any plain jump, on every difficulty', () => {
    for (const level of [VANALINN, RAEKODA]) {
      for (const [x0] of doors(level)) {
        expect(topRow(level, x0)).toBeLessThanOrEqual(7);
        for (const key of DIFF_KEYS) {
          expect({ level: level.name, x0, key, over: climbs(level, key, x0 - 3, 23, 7, false) })
            .toEqual({ level: level.name, x0, key, over: false });
        }
      }
    }
  });
});

describe('Tallinna vanalinn', () => {
  const level = VANALINN;
  const [gate] = doors(level);

  it('puts the big head station in front of the town gate, and the gate\'s door is cracked', () => {
    const head = level.course!.stations.find((s) => s.kind === 'bighead')!;
    expect(head.x).toBeLessThan(gate[0]);
    expect(gate[0] - head.x).toBeLessThan(14);
    expect(doors(level)).toHaveLength(2);
  });

  it('stops a hero without a big head at the town gate', () => {
    const world = quietWorld(level);
    world.course!.stations.forEach((s) => { s.cooldown = 99999; });
    expect(runRight(world, gate[1] + 2, 1500)).toBe(false);
  });

  it('hands over the bow before its two zombie knights', () => {
    const bow = level.course!.stations.find((s) => s.kind === 'bow')!;
    const zombies = level.enemyDefs.filter((d) => d.zombie);
    expect(zombies.map((z) => z.type)).toEqual(['knight', 'knight']);
    for (const z of zombies) expect(z.x).toBeGreaterThan(bow.x);
  });

  it('runs through to the chase on every difficulty, smashing through both towers', () => {
    for (const key of DIFF_KEYS) {
      const world = quietWorld(level, key);
      runRight(world, level.width, 3000);
      expect({ key, won: world.won }).toEqual({ key, won: true });
    }
  });
});

describe('Tornid', () => {
  const level = TORNID;
  const [wallSpring, lastSpring] = springs(level);

  it('throws a hero up onto the town wall from the spring, which no plain jump reaches', () => {
    for (const key of DIFF_KEYS) {
      expect({ key, plain: climbs(level, key, wallSpring + 2, 23, 16, false) }).toEqual({ key, plain: false });
      expect({ key, spring: springsUp(level, key, wallSpring, 16) }).toEqual({ key, spring: true });
      expect({ key, last: springsUp(level, key, lastSpring, 16) }).toEqual({ key, last: true });
    }
  });

  it('drops a big head through the cracked tower floors, and holds anyone else up', () => {
    const map = mapOf(level);
    const floorX = map[16].findIndex((c, x) => c === TILE_CRACKED && map[19][x] === TILE_CRACKED);
    for (const bigHead of [false, true]) {
      const world = quietWorld(level);
      standAt(world, floorX + 3, 16);
      world.player.bigHeadTimer = bigHead ? 600 : 0;
      step(world, {}, 120);
      const feetRow = (world.player.y + world.player.h) / TILE;
      expect({ bigHead, feetRow }).toEqual({ bigHead, feetRow: bigHead ? 23 : 16 });
    }
  });

  it('keeps its target out of an arrow\'s reach until the tower door is smashed, then opens the gate', () => {
    const world = quietWorld(level);
    const t = world.course!.targets[0];
    const bar = t.cells[0];
    const [door] = doors(level).filter(([x]) => x < t.box.x / TILE).slice(-1);
    // From in front of the door, the arrow dies on it.
    world.arrows.push({ x: door[0] * TILE - 24, y: 22 * TILE - 4, vx: 6, life: 60, isChicken: false });
    step(world, {}, 30);
    expect(t.hit).toBeFalsy();
    // A big head walks through, and from there it is a shot.
    standAt(world, door[0] - 2, 23);
    world.player.bigHeadTimer = 600;
    for (let i = 0; i < 90 && world.player.x < (door[1] + 1) * TILE; i++) step(world, { right: true });
    expect(world.map[22][door[0]]).toBe(TILE_EMPTY);
    shoot(world, t.box);
    step(world, {}, 120);
    expect(t.hit).toBe(true);
    expect(world.map[bar.y][bar.x]).toBe(TILE_EMPTY);
  });

  it('has two zombie knights in the passage under the wall', () => {
    expect(level.enemyDefs.filter((d) => d.zombie).map((z) => z.type)).toEqual(['knight', 'knight']);
  });

  it('runs through to the chase on every difficulty, with the target shot', () => {
    for (const key of DIFF_KEYS) {
      const world = runThrough(level, key, level.width);
      expect({ key, won: world.won }).toEqual({ key, won: true });
    }
  });

  it('ends in a chase once the hero is up on the last tower', () => {
    const world = quietWorld(level);
    standAt(world, level.rescuePos[0] - 3, 16);
    step(world);
    expect(world.won).toBe(true);
  });
});

describe('Raekoja plats', () => {
  const level = RAEKODA;
  const [wallSpring, backSpring] = springs(level);

  it('has two zombie knights in front of its first cracked door', () => {
    const [door] = doors(level);
    const zombies = level.enemyDefs.filter((d) => d.zombie);
    expect(zombies).toHaveLength(2);
    for (const z of zombies) expect(z.x).toBeLessThan(door[0]);
  });

  it('springs up to the cracked wall on the town wall, and back up from beyond it', () => {
    for (const key of DIFF_KEYS) {
      expect({ key, up: springsUp(level, key, wallSpring, 15) }).toEqual({ key, up: true });
    }
    expect(backSpring).toBeGreaterThan(wallSpring + 15);
  });

  it('hides the gate\'s target behind the high cracked wall: no shot from the ground reaches it', () => {
    const world = quietWorld(level);
    const t = world.course!.targets[0];
    // It stands on the wall top, where a standing shot meets it (browser, 2026-11-22: a row
    // higher, every standing shot flew under it), and no shot from the ground can: the wall is
    // 8 tall, so even the top of super easy's jump flies below its foot.
    expect(t.box.y + t.box.h).toBe(15 * TILE);
    for (const key of DIFF_KEYS) {
      for (const hero of HEROES) {
        expect({ key, hero, onWall: hits(t.box, arrowRange(key, hero, 15).standing) }).toEqual({ key, hero, onWall: true });
        expect({ key, hero, fromGround: arrowRange(key, hero, 23).highest < t.box.y + t.box.h }).toEqual({ key, hero, fromGround: false });
      }
    }
    const map = mapOf(level);
    const crack = map[14].findIndex((c) => c === TILE_CRACKED);
    expect(crack).toBeGreaterThan(0);
    expect(crack).toBeLessThan(t.box.x / TILE);
    // The cracked wall reaches up to bricks: no spring carries the hero over it.
    expect(isSolid(map[7][crack])).toBe(true);
    expect(map[7][crack]).not.toBe(TILE_CRACKED);
  });

  it('runs through to the square on every difficulty, with the target shot', () => {
    const door = level.course!.doors[0];
    for (const key of DIFF_KEYS) {
      const world = runThrough(level, key, door.x + 2);
      expect({ key, there: world.player.x / TILE >= door.x + 2 }).toEqual({ key, there: true });
    }
  });

  it('ends with Vana Toomas, shuts the square\'s door behind the hero, and cages the sibling on the steps', () => {
    expect(level.course!.boss?.kind).toBe('vanaToomas');
    const world = quietWorld(level);
    const [door] = world.course!.doors;
    standAt(world, door.x + 3, 23);
    step(world);
    expect(world.map[door.cells[0].y][door.x]).toBe(TILE_GATE);
    const spot = rescueSpot(world);
    expect(spot.y + spot.h).toBe(22 * TILE);
  });
});
