import { describe, expect, it } from 'vitest';
import { climbs, jumpRise, quietWorld, runRight, standAt, step } from './helpers/courseRuns';
import { TILE } from '../src/config/constants';
import { DIFF_KEYS } from '../src/config/difficulty';
import { isSolid, TILE_GATE, TILE_LAVA, type Level } from '../src/data/levels';
import { DINO_CANYON_2 } from '../src/data/levels2/dinoCanyon2';
import { KANJON } from '../src/data/levels2/kanjon';
import { VULKAAN } from '../src/data/levels2/vulkaan';
import { STAGES } from '../src/data/stages';
import { PTERO_ALTITUDE, PTERO_H, type PterodactylState } from '../src/game/bosses/pterodactyl';
import { rescueSpot } from '../src/game/world';

/** The first solid row in a column: the top of whatever stands there. */
function topRow(level: Level, x: number): number {
  const map = level.generate({} as never);
  for (let y = 0; y < map.length; y++) if (isSolid(map[y][x])) return y;
  return map.length;
}

/** Every run of lava along the bottom, as its first and last column. */
function lavaRuns(level: Level): Array<[number, number]> {
  const row = level.generate({} as never)[23];
  const runs: Array<[number, number]> = [];
  row.forEach((c, x) => {
    if (c !== TILE_LAVA) return;
    if (row[x - 1] === TILE_LAVA) runs[runs.length - 1][1] = x;
    else runs.push([x, x]);
  });
  return runs;
}

describe('Dinosaur Canyon, the theme', () => {
  it('is the run\'s next three levels: two chases after the Pterodactyl, then her', () => {
    expect(STAGES.slice(3, 6).map((s) => [s.theme, s.level, s.nameKey])).toEqual([
      [1, KANJON, 'level_2'], [1, DINO_CANYON_2, 'level_2_2'], [1, VULKAAN, 'level_2_3'],
    ]);
    expect([KANJON.ending, DINO_CANYON_2.ending, VULKAAN.ending]).toEqual(['chase', 'chase', 'boss']);
    expect([KANJON.villain, DINO_CANYON_2.villain]).toEqual(['pterodactyl', 'pterodactyl']);
  });
});

describe('Kanjon', () => {
  const level = KANJON;
  const fart = level.course!.stations.find((s) => s.kind === 'fart')!;
  const cliff = fart.x + [...level.generate({} as never)[22]].slice(fart.x).findIndex((c) => isSolid(c));

  it('has its first cliff 7 tall, with the fart station in front of it', () => {
    expect(topRow(level, cliff)).toBe(16);
    expect(cliff - fart.x).toBeLessThan(12);
  });

  it('needs a fart to climb the cliff, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      expect({ key, plain: climbs(level, key, fart.x + 2, 23, 16, false) }).toEqual({ key, plain: false });
      expect({ key, fart: climbs(level, key, fart.x + 2, 23, 16, true) }).toEqual({ key, fart: true });
    }
  });

  it('is stopped at the cliff without the station', () => {
    const world = quietWorld(level, 'super_easy');
    world.course!.stations.forEach((s) => { s.cooldown = 99999; });
    expect(runRight(world, cliff + 4, 1500)).toBe(false);
  });

  it('hands over the bow before its two zombie dinos', () => {
    const bow = level.course!.stations.find((s) => s.kind === 'bow')!;
    const zombies = level.enemyDefs.filter((d) => d.zombie);
    expect(zombies.map((z) => z.type)).toEqual(['dino', 'dino']);
    for (const z of zombies) expect(z.x).toBeGreaterThan(bow.x);
  });

  it('runs through to the chase on every difficulty, plain jumps and the fart at the cliff', () => {
    for (const key of DIFF_KEYS) {
      const world = quietWorld(level, key);
      runRight(world, level.width, 2500);
      expect({ key, won: world.won }).toEqual({ key, won: true });
    }
  });
});

describe('Kaljusein', () => {
  const level = DINO_CANYON_2;

  it('ends in a chase once the hero is up on the mesa', () => {
    const world = quietWorld(level);
    standAt(world, level.rescuePos[0] - 3, 16);
    step(world);
    expect(world.won).toBe(true);
  });

  it('has two zombie dinos by its cannons', () => {
    const cannons = level.enemyDefs.filter((d) => d.type === 'cannon');
    const zombies = level.enemyDefs.filter((d) => d.zombie);
    expect(zombies.map((z) => z.type)).toEqual(['dino', 'dino']);
    for (const z of zombies) expect(Math.min(...cannons.map((c) => Math.abs(c.x - z.x)))).toBeLessThanOrEqual(6);
  });
});

describe('Vulkaan', () => {
  const level = VULKAAN;
  const fart = level.course!.stations.find((s) => s.kind === 'fart')!;

  it('has lava with two vents on the way, and the Pterodactyl at the end', () => {
    expect(lavaRuns(level).length).toBeGreaterThanOrEqual(5);
    expect(level.course!.vents).toHaveLength(2);
    expect(level.course!.boss?.kind).toBe('pterodactyl');
  });

  it('needs a fart up the volcano wall, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      expect({ key, plain: climbs(level, key, fart.x + 2, 23, 16, false) }).toEqual({ key, plain: false });
      expect({ key, fart: climbs(level, key, fart.x + 2, 23, 16, true) }).toEqual({ key, fart: true });
    }
  });

  it('lands every jump over the lava on the far side, plain or farting, from the last two tiles, on every difficulty', () => {
    // A child holds right through a jump, and after the wall every jump is a fart jump for 15
    // seconds; so a jump at full run, from anywhere in the last two tiles before the lava, must
    // come down on the far side whatever its length, never past it into the next lava. Before
    // the fart station there is no fart to be had (a death respawns without one).
    for (const [start, end] of lavaRuns(level)) {
      const floor = topRow(level, start - 1);
      for (const key of DIFF_KEYS) {
        for (const farting of start > fart.x ? [false, true] : [false]) {
          for (const back of [0, 1, 2]) {
            const world = quietWorld(level, key);
            world.course!.vents = [];
            const p = world.player;
            standAt(world, start - 1 - back, floor);
            p.hasCape = false;
            p.vx = world.dc.playerSpeed;
            let left = false;
            for (let i = 0; i < 200 && !world.dead; i++) {
              if (farting) p.fartTimer = 900;
              step(world, { right: true, jump: true, jumpPressed: i === 0 });
              if (!p.onGround) left = true;
              if (left && p.onGround) break;
            }
            const landed = Math.floor((p.x + p.w / 2) / TILE);
            expect({ start, key, farting, back, dead: world.dead, over: landed > end })
              .toEqual({ start, key, farting, back, dead: false, over: true });
          }
        }
      }
    }
  });

  it('runs through to the arena door on every difficulty', () => {
    const door = level.course!.doors[0];
    for (const key of DIFF_KEYS) {
      const world = quietWorld(level, key);
      world.course!.vents = [];
      expect({ key, there: runRight(world, door.x + 2, 3000) }).toEqual({ key, there: true });
    }
  });

  it('shuts the arena door behind the hero', () => {
    const world = quietWorld(level);
    const [door] = world.course!.doors;
    standAt(world, door.x + 3, 23);
    step(world);
    expect(world.map[door.cells[0].y][door.x]).toBe(TILE_GATE);
  });

  it('stands the cage on the rock', () => {
    const world = quietWorld(level);
    const spot = rescueSpot(world);
    expect(spot.y + spot.h).toBe(22 * TILE);
  });

  it('keeps her back out of a plain jump\'s reach even from the cage\'s rock', () => {
    const b = quietWorld(level).courseBoss as PterodactylState;
    // Her lowest, at the bottom of her bob: her back is this far above the floor.
    const back = PTERO_ALTITUDE + PTERO_H - 4;
    expect(b.floorY).toBe(23 * TILE);
    for (const key of DIFF_KEYS) {
      expect({ key, reach: TILE + jumpRise(key) < back }).toEqual({ key, reach: true });
    }
  });
});
