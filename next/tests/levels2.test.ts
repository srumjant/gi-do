import { describe, expect, it } from 'vitest';
import {
  arrowRange, climbs, HEROES, hits, quietWorld, reachesTower, runRight, standAt, step,
} from './helpers/courseRuns';
import { DIFF_KEYS } from '../src/config/difficulty';
import { TILE_EMPTY, TILE_GATE, TILE_PLANK } from '../src/data/levels';
import { DOLL_GARDEN_2 } from '../src/data/levels2/dollGarden2';
import { DINO_CANYON_2 } from '../src/data/levels2/dinoCanyon2';
import { STAGES } from '../src/data/stages';

describe('Doll Garden II', () => {
  const level = DOLL_GARDEN_2;
  const [bridge, gate] = level.course!.targets;

  it('is in the run, right after Doll Garden', () => {
    expect(STAGES[1]).toEqual({ theme: 0, level, nameKey: 'level_1_2' });
  });

  it('is all about the bow', () => {
    expect(level.course!.stations.map((s) => s.kind)).toEqual(['bow', 'bow', 'bow']);
    // A flag after each of the four puzzles; the fifth section ends at the sibling.
    expect(level.course!.flags).toHaveLength(4);
  });

  it('has a drawbridge whose target is in view from the edge', () => {
    expect(bridge.cells.every((c) => c.to === TILE_PLANK)).toBe(true);
    expect(bridge.cells).toHaveLength(18);
    const x0 = Math.min(...bridge.cells.map((c) => c.x));
    expect(bridge.x - (x0 - 1)).toBeLessThanOrEqual(10);
  });

  it('has a gate whose target is out of reach of a standing shot, but not of a jumping one', () => {
    const world = quietWorld(level);
    const t = world.course!.targets[1];
    expect(gate.cells.every((c) => c.to === TILE_EMPTY)).toBe(true);
    expect(world.map[gate.cells[0].y][gate.cells[0].x]).toBe(TILE_GATE);
    for (const key of DIFF_KEYS) {
      for (const hero of HEROES) {
        const { standing, highest } = arrowRange(key, hero, 23);
        expect({ key, hero, standing: hits(t.box, standing) }).toEqual({ key, hero, standing: false });
        expect({ key, hero, jumping: highest < t.box.y + t.box.h }).toEqual({ key, hero, jumping: true });
      }
    }
  });

  it('has a portcullis nobody jumps: its wall goes to the top of the screen', () => {
    const map = level.generate({} as never);
    const x = gate.cells[0].x;
    for (let y = 2; y <= 22; y++) expect(map[y][x]).not.toBe(TILE_EMPTY);
  });

  it('lifts the portcullis when the target is shot', () => {
    const world = quietWorld(level);
    const t = world.course!.targets[1];
    world.arrows.push({ x: t.box.x - 8, y: t.box.y + 10, vx: 6, life: 60, isChicken: false });
    step(world, {}, 80);
    for (const c of t.cells) expect(world.map[c.y][c.x]).toBe(TILE_EMPTY);
  });

  it('has three guards in its tunnel', () => {
    expect(level.enemyDefs.filter((d) => d.zombie)).toHaveLength(3);
  });

  it('puts the sibling on a tower only the spring reaches, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      expect({ key, jump: reachesTower(level, key, false) }).toEqual({ key, jump: false });
      expect({ key, spring: reachesTower(level, key, true) }).toEqual({ key, spring: true });
    }
  });
});

describe('Kaljusein (Dinosaur Canyon II)', () => {
  const level = DINO_CANYON_2;
  const [target] = level.course!.targets;
  // Found from the level rather than counted: the wall's fart, the spare fart on its first
  // step, and the fart before the ledge (data/levels2/dinoCanyon2.ts).
  const [wallFart, spareFart, ledgeFart] = level.course!.stations;
  const firstFlag = level.course!.flags[0];

  it('is in the run, right after Dinosaur Canyon', () => {
    expect(STAGES[4]).toEqual({ theme: 1, level, nameKey: 'level_2_2' });
  });

  it('teaches the fart jump, then mixes in the bow', () => {
    expect(level.course!.stations.map((s) => s.kind)).toEqual(['fart', 'fart', 'fart', 'bow', 'bow']);
  });

  it('has canyon ledges a plain jump gets over, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      const world = quietWorld(level, key);
      expect({ key, over: runRight(world, firstFlag.x) }).toEqual({ key, over: true });
    }
  });

  it('has a canyon wall of two steps, each needing a fart, on every difficulty', () => {
    // The first step's top is row 16, the second's, on top of it, row 9.
    expect(spareFart.y).toBe(15);
    for (const key of DIFF_KEYS) {
      const below = wallFart.x + 2;
      const onStep = spareFart.x + 3;
      expect({ key, plain: climbs(level, key, below, 23, 16, false) }).toEqual({ key, plain: false });
      expect({ key, fart: climbs(level, key, below, 23, 16, true) }).toEqual({ key, fart: true });
      expect({ key, plain2: climbs(level, key, onStep, 16, 9, false) }).toEqual({ key, plain2: false });
      expect({ key, fart2: climbs(level, key, onStep, 16, 9, true) }).toEqual({ key, fart2: true });
    }
  });

  it('hangs its target where only a shot from the high ledge, or a fart jump, reaches it', () => {
    const world = quietWorld(level);
    const t = world.course!.targets[0];
    for (const key of DIFF_KEYS) {
      for (const hero of HEROES) {
        const ground = arrowRange(key, hero, 23);
        expect({ key, hero, fromGround: ground.highest < t.box.y + t.box.h }).toEqual({ key, hero, fromGround: false });
        const ledge = arrowRange(key, hero, 15);
        expect({ key, hero, fromLedge: hits(t.box, ledge.standing) }).toEqual({ key, hero, fromLedge: true });
      }
    }
    expect(target.cells).toHaveLength(26);
  });

  it('needs a fart to get onto the ledge, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      expect({ key, plain: climbs(level, key, ledgeFart.x + 1, 23, 15, false) }).toEqual({ key, plain: false });
      expect({ key, fart: climbs(level, key, ledgeFart.x + 1, 23, 15, true) }).toEqual({ key, fart: true });
    }
  });

  it('cannot be crossed by a fart jump off the ledge: the overhang caps it', () => {
    for (const key of DIFF_KEYS) {
      const world = quietWorld(level, key);
      standAt(world, ledgeFart.x + 7, 15); // the ledge's right-hand end
      world.player.hasCape = false;
      for (let i = 0; i < 200 && !world.dead; i++) {
        world.player.fartTimer = 900;
        step(world, { right: true, jump: true, jumpPressed: world.player.onGround });
      }
      expect({ key, fell: world.dead }).toEqual({ key, fell: true });
    }
  });

  it('puts the sibling on a mesa only the spring reaches, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      expect({ key, jump: reachesTower(level, key, false) }).toEqual({ key, jump: false });
      expect({ key, spring: reachesTower(level, key, true) }).toEqual({ key, spring: true });
    }
  });
});
