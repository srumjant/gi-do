import { describe, expect, it } from 'vitest';
import {
  arrowRange, climbs, HEROES, hits, quietWorld, reachesTower, runRight, standAt, step,
} from './helpers/courseRuns';
import { DIFF_KEYS } from '../src/config/difficulty';
import { TILE_EMPTY, TILE_GATE, TILE_RAINBOW } from '../src/data/levels';
import { DOLL_GARDEN_2 } from '../src/data/levels2/dollGarden2';
import { NUKUAED } from '../src/data/levels2/nukuaed';
import { NUKUMAJA } from '../src/data/levels2/nukumaja';
import { STAGES } from '../src/data/stages';
import { rescueSpot } from '../src/game/world';
import { TILE } from '../src/config/constants';
import type { Rect, World } from '../src/game/types';

function shoot(world: World, box: Rect): void {
  world.arrows.push({ x: box.x - 8, y: box.y + box.h / 2 - 2, vx: 6, life: 60, isChicken: false });
}

describe('Doll Garden, the theme', () => {
  it('is the run\'s first three levels: two chases, then the Queen', () => {
    expect(STAGES.slice(0, 3).map((s) => [s.theme, s.level, s.nameKey])).toEqual([
      [0, NUKUAED, 'level_1'], [0, DOLL_GARDEN_2, 'level_1_2'], [0, NUKUMAJA, 'level_1_3'],
    ]);
    expect([NUKUAED.ending, DOLL_GARDEN_2.ending, NUKUMAJA.ending]).toEqual(['chase', 'chase', 'boss']);
  });
});

describe('Nukuaed', () => {
  const level = NUKUAED;

  it('hands over the bow, then shows the first zombies', () => {
    const bow = level.course!.stations.find((s) => s.kind === 'bow')!;
    const zombies = level.enemyDefs.filter((d) => d.zombie);
    expect(zombies).toHaveLength(2);
    for (const z of zombies) expect(z.x).toBeGreaterThan(bow.x);
  });

  it('has a rainbow block, and the cat after the zombies', () => {
    expect(level.generate({} as never).flat()).toContain(TILE_RAINBOW);
    const lastZombie = Math.max(...level.enemyDefs.filter((d) => d.zombie).map((d) => d.x));
    expect(level.catPosition).toBeGreaterThan(lastZombie);
  });

  it('runs through to the chase with plain jumping, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      const world = quietWorld(level, key);
      runRight(world, level.width, 1500);
      expect({ key, won: world.won }).toEqual({ key, won: true });
    }
  });
});

describe('Aiavärav', () => {
  it('ends in a chase once the hero is up on the tower', () => {
    const world = quietWorld(DOLL_GARDEN_2);
    standAt(world, DOLL_GARDEN_2.rescuePos[0] - 3, 16);
    step(world);
    expect(world.won).toBe(true);
  });

  it('is reached by the spring, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      expect({ key, spring: reachesTower(DOLL_GARDEN_2, key, true) }).toEqual({ key, spring: true });
    }
  });
});

describe('Nukumaja', () => {
  const level = NUKUMAJA;
  const [hall, pair, stairs, helper] = level.course!.targets;

  it('stands the sibling on the throne room floor, not up on the roof', () => {
    // Found in the browser (2026-11-22): the search from the top found the ceiling.
    const world = quietWorld(level);
    const spot = rescueSpot(world);
    expect(spot.y + spot.h).toBe(23 * TILE);
  });

  it('is indoors, and ends with the Doll Queen and her three target spots', () => {
    expect(level.indoors).toBe(true);
    expect(level.course!.boss?.kind).toBe('dollQueen');
    expect(level.course!.boss!.spots).toHaveLength(3);
  });

  it('stands its first target behind a row of zombies', () => {
    expect(level.enemyDefs.filter((d) => d.zombie && d.x < hall.x).length).toBeGreaterThanOrEqual(3);
    expect(hall.cells.every((c) => c.to === TILE_EMPTY)).toBe(true);
  });

  it('needs a low and a high target both hit to open its second gate', () => {
    expect(helper.partOf).toBe(1);
    const world = quietWorld(level);
    const big = world.course!.targets[1];
    const small = world.course!.targets[3];
    const bar = big.cells[0];
    shoot(world, big.box);
    step(world, {}, 60);
    expect(world.map[bar.y][bar.x]).toBe(TILE_GATE);
    shoot(world, small.box);
    step(world, {}, 80);
    expect(world.map[bar.y][bar.x]).toBe(TILE_EMPTY);
  });

  it('hangs the pair\'s high target out of a standing shot, in reach of a jumping one', () => {
    const box = quietWorld(level).course!.targets[3].box;
    for (const key of DIFF_KEYS) {
      for (const hero of HEROES) {
        const { standing, highest } = arrowRange(key, hero, 23);
        expect({ key, hero, standing: hits(box, standing) }).toEqual({ key, hero, standing: false });
        expect({ key, hero, jumping: highest < box.y + box.h }).toEqual({ key, hero, jumping: true });
      }
    }
  });

  it('lines its third target up only from the top of the stairs', () => {
    const box = quietWorld(level).course!.targets[2].box;
    for (const key of DIFF_KEYS) {
      for (const hero of HEROES) {
        const floor = arrowRange(key, hero, 23);
        expect({ key, hero, fromFloor: floor.highest < box.y + box.h }).toEqual({ key, hero, fromFloor: false });
        const top = arrowRange(key, hero, 14);
        expect({ key, hero, fromTop: hits(box, top.standing) }).toEqual({ key, hero, fromTop: true });
      }
    }
  });

  it('has stairs a plain jump climbs, on every difficulty', () => {
    const bow = level.course!.stations.find((s) => s.x > pair.x && s.x < stairs.x)!;
    for (const key of DIFF_KEYS) {
      expect({ key, up: climbs(level, key, bow.x + 1, 23, 14, false) }).toEqual({ key, up: true });
    }
  });

  it('shuts the throne room door behind the hero', () => {
    const world = quietWorld(level);
    const [door] = world.course!.doors;
    standAt(world, door.x + 3, 23);
    step(world);
    expect(world.map[door.cells[0].y][door.x]).toBe(TILE_GATE);
  });

  it('hangs the Queen\'s last target by the door, where her walk never reaches it', () => {
    // Across the room, her walk covered it, so from the door side she was always in the way,
    // and on hard she could not be jumped over: the fight could not be won (browser, 2026-11-22).
    const q = quietWorld(level).courseBoss!;
    const last = q.spots[2];
    expect(last.x + last.w).toBeLessThan(q.patrol[0]);
  });

  it('lets a hero standing between her walk and the last target jump-shoot it, on hard', () => {
    // Found in the browser (2026-11-22): with the door in the next column, an arrow at the last
    // target touched the shut door first and died before it got there.
    const world = quietWorld(level, 'hard');
    const q = world.courseBoss!;
    q.phase = 'shielded';
    q.round = 2;
    q.targetUp = true;
    q.x = q.patrol[1];
    q.throwTimer = 9999;
    const p = world.player;
    standAt(world, Math.floor(q.patrol[0] / TILE) - 1, 23);
    step(world);
    expect(world.map[20][world.course!.doors[0].x]).toBe(TILE_GATE);
    p.facing = -1;
    p.hasBow = true;
    p.bowCharges = 3;
    p.invincible = 999;
    p.y -= 50;
    p.vy = 0;
    p.onGround = false;
    step(world, { firePressed: true });
    step(world, {}, 6);
    expect(q.phase).toBe('dizzy');
  });

  it('hangs the Queen\'s second target out of a standing shot, in reach of a jumping one', () => {
    const spot = quietWorld(level).courseBoss!.spots[1];
    for (const key of DIFF_KEYS) {
      for (const hero of HEROES) {
        const { standing, highest } = arrowRange(key, hero, 23);
        expect({ key, hero, standing: hits(spot, standing) }).toEqual({ key, hero, standing: false });
        expect({ key, hero, jumping: highest < spot.y + spot.h }).toEqual({ key, hero, jumping: true });
      }
    }
  });
});

describe('high targets', () => {
  // The browser found this (2026-11-22): on super easy the top of a jump carries an arrow over
  // a short target box, so a child firing at the top of the jump missed. Every high target must
  // take a shot from the top of the jump, on every difficulty, for both heroes.
  const boxes: Array<[string, Rect]> = [
    ['the Garden Gate portcullis', quietWorld(DOLL_GARDEN_2).course!.targets[1].box],
    ['the Doll House pair', quietWorld(NUKUMAJA).course!.targets[3].box],
    ['the Queen\'s second spot', quietWorld(NUKUMAJA).courseBoss!.spots[1]],
    ['the Queen\'s third spot', quietWorld(NUKUMAJA).courseBoss!.spots[2]],
  ];
  // And hard's low jump must not leave only a few frames at the very top (browser, the same
  // day): anywhere in the top third of the jump counts.
  for (const [name, box] of boxes) {
    it(`${name} takes a shot from anywhere in the top third of a jump`, () => {
      for (const key of DIFF_KEYS) {
        for (const hero of HEROES) {
          const { standing, highest } = arrowRange(key, hero, 23);
          const third = highest + (standing - highest) / 3;
          expect({ key, hero, top: hits(box, highest), third: hits(box, third) })
            .toEqual({ key, hero, top: true, third: true });
          expect({ key, hero, standing: hits(box, standing) }).toEqual({ key, hero, standing: false });
        }
      }
    });
  }
});

