import { describe, expect, it } from 'vitest';
import { TILE } from '../src/config/constants';
import { DIFF_KEYS, DIFFICULTY_CONFIG } from '../src/config/difficulty';
import { courseLevel } from '../src/data/course';
import { HOME_THEME, TILE_ICE, TILE_QUESTION, isSolid, makeGround } from '../src/data/levels';
import { HOMMIK } from '../src/data/levels2/hommik';
import { PAEV } from '../src/data/levels2/paev';
import { OHTU } from '../src/data/levels2/ohtu';
import { VANNITUBA } from '../src/data/levels2/vannituba';
import { DEMOS } from '../src/data/demos';
import { TROONISAAL } from '../src/data/levels2/troonisaal';
import { STAGES } from '../src/data/stages';
import { HAIRBRUSH_S, HOUSEFLY_S, SOCK_S } from '../src/data/sprites';
import { isGroundPatrol, plungerRest, plungerSquatting, spawnEnemy } from '../src/game/enemy';
import {
  BRUSH_R, BUBBLE_W, brushSpeed, brushTouches, bubbleInterval, DROP_W, duckSpeed, TAP_REACH, TAP_WARN_FRAMES, tapInterval, tapWarning,
} from '../src/game/course';
import { getEnemySpriteInfo } from '../src/game/run';
import type { World } from '../src/game/types';
import { arrowY, jumpRise, quietWorld, standAt, step } from './helpers/courseRuns';

const dc = DIFFICULTY_CONFIG.normal;

describe('the home\'s enemies', () => {
  it('has a fly that flies like a bat: no gravity, as high up, as quick', () => {
    const map = makeGround(40, 25);
    const fly = spawnEnemy(map, dc, { type: 'fly', x: 10 })!;
    const bat = spawnEnemy(map, dc, { type: 'bat', x: 10 })!;
    expect(fly.noGravity).toBe(true);
    expect(fly.y + fly.h).toBe(bat.y + bat.h);
    expect(fly.vx).toBe(bat.vx);
    expect(isGroundPatrol(fly)).toBe(false);
    expect(getEnemySpriteInfo('fly').sprite).toBe(HOUSEFLY_S);
  });

  it('has a smelly sock that walks like a doll and can be stomped', () => {
    const map = makeGround(40, 25);
    const sock = spawnEnemy(map, dc, { type: 'sock', x: 10 })!;
    const doll = spawnEnemy(map, dc, { type: 'doll', x: 10 })!;
    expect(isGroundPatrol(sock)).toBe(true);
    expect(sock.vx).toBe(doll.vx);
    expect(sock.noStomp).toBe(false);
    expect(getEnemySpriteInfo('sock').sprite).toBe(SOCK_S);
  });

  it('has a hairbrush, only ever a zombie: nobody stomps on a hairbrush', () => {
    const map = makeGround(40, 25);
    const brush = spawnEnemy(map, dc, { type: 'hairbrush', x: 10, zombie: true })!;
    expect(brush.zombie).toBe(true);
    expect(isGroundPatrol(brush)).toBe(true);
    expect(getEnemySpriteInfo('hairbrush').sprite).toBe(HAIRBRUSH_S);
  });
});

/** A 25-row section `w` wide, ground in the bottom two rows, with `rows` written in by row number. */
function sectionOf(w: number, rows: Record<number, string>): string[] {
  return Array.from({ length: 25 }, (_, y) => rows[y] ?? (y >= 23 ? '#'.repeat(w) : '.'.repeat(w)));
}

/** A floor 60 wide with one tap over it at column 40, six tiles up. */
const TAP_LEVEL = courseLevel({
  name: 'Tap', theme: 0,
  sections: [sectionOf(60, { 17: `${'.'.repeat(40)}w${'.'.repeat(19)}`, 20: `..P${'.'.repeat(57)}`, 22: `${'.'.repeat(58)}R.` })],
});

/** Steps until the tap lets go of a drop; returns it. */
function untilDrop(world: ReturnType<typeof quietWorld>, frames = 400) {
  for (let i = 0; i < frames; i++) {
    step(world);
    const drop = world.enemyProjectiles.find((s) => s.type === 'drop');
    if (drop) return drop;
  }
  return undefined;
}

describe('the dripping tap', () => {
  it('wobbles, then lets go of a drop that falls straight down and splashes on the floor', () => {
    const world = quietWorld(TAP_LEVEL, 'normal');
    standAt(world, 30, 23);
    const tap = world.course!.taps[0];
    tap.timer = TAP_WARN_FRAMES;
    step(world);
    expect(tapWarning(tap)).toBe(true);
    const drop = untilDrop(world)!;
    expect(drop.vx).toBe(0);
    expect(drop.x + DROP_W / 2).toBe(40 * TILE + TILE / 2);
    let splash;
    for (let i = 0; i < 80 && !splash; i++) {
      step(world);
      splash = world.course!.fx.find((f) => f.kind === 'drip');
    }
    expect(splash?.y).toBe(23 * TILE);
    expect(world.enemyProjectiles.filter((s) => s.type === 'drop')).toHaveLength(0);
    expect(world.dead).toBe(false);
  });

  it('hurts the hero standing under it', () => {
    const world = quietWorld(TAP_LEVEL, 'normal');
    world.player.hasCape = false;
    standAt(world, 40, 23);
    world.course!.taps[0].timer = 2;
    for (let i = 0; i < 80 && !world.dead; i++) step(world);
    expect(world.dead).toBe(true);
  });

  it('leaves time to run under it after a drop, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      const world = quietWorld(TAP_LEVEL, key);
      world.player.hasCape = false;
      standAt(world, 36, 23);
      world.course!.taps[0].timer = 2;
      // Wait for the splash, then run.
      for (let i = 0; i < 200 && !world.course!.fx.some((f) => f.kind === 'drip'); i++) step(world);
      for (let i = 0; i < 200 && world.player.x < 44 * TILE; i++) step(world, { right: true });
      expect({ key, dead: world.dead, past: world.player.x >= 44 * TILE }).toEqual({ key, dead: false, past: true });
    }
  });

  it('drips only near the hero, and slower on Super Easy than on Hard', () => {
    const world = quietWorld(TAP_LEVEL, 'normal');
    standAt(world, 2, 23);
    expect(40 * TILE - 2 * TILE).toBeGreaterThan(TAP_REACH);
    expect(untilDrop(world, 600)).toBeUndefined();
    expect(tapInterval(DIFFICULTY_CONFIG.super_easy)).toBeGreaterThan(tapInterval(DIFFICULTY_CONFIG.hard));
  });
});

const mapOf = () => HOMMIK.generate({} as never);

/** Only the zombies come, and the taps are quiet: a runner sees only the level's shape. */
function guardedWorld(key: (typeof DIFF_KEYS)[number]): World {
  const world = quietWorld(HOMMIK, key);
  for (const d of world.pending) d.spawned = !d.zombie;
  for (const t of world.course!.taps) t.timer = 1e9;
  return world;
}

/** Runs right, jumping at every wall, shooting a zombie in the way. */
function playRight(world: World, frames = 6000): boolean {
  let holding = 0;
  for (let i = 0; i < frames && !world.dead && !world.won; i++) {
    const p = world.player;
    const tx = Math.floor((p.x + p.w / 2) / TILE);
    const rows = [Math.floor((p.y + 2) / TILE), Math.floor((p.y + p.h - 2) / TILE)];
    const wall = rows.some((r) => isSolid(world.map[r]?.[tx + 1]));
    const start = p.onGround && holding === 0 && wall;
    if (start) holding = 20;
    const shotY = arrowY(p.y, p.h);
    const zombie = world.enemies.some((e) => e.alive && e.zombie && e.x > p.x && e.x - p.x < 8 * TILE
      && e.y < shotY + 4 && e.y + e.h > shotY);
    step(world, { right: true, jump: holding > 0, jumpPressed: start, firePressed: p.arrowCooldown === 0 && zombie });
    if (holding > 0) holding--;
  }
  return world.won;
}

describe('HOMMIK, the morning', () => {
  it('comes right after the T-Rex, the first level of the home world, and ends with Härra Kaka running off', () => {
    const at = STAGES.findIndex((s) => s.level === HOMMIK);
    expect(STAGES[at - 1].level).toBe(TROONISAAL);
    expect(STAGES[at]).toEqual({ theme: HOME_THEME, level: HOMMIK, nameKey: 'level_7_1' });
    expect(HOMMIK.ending).toBe('chase');
    expect(HOMMIK.villain).toBe('poo');
    expect(HOMMIK.home).toBe(true);
  });

  it('starts on the bed, and bouncing on it brings the head up to the ? block over it, on every difficulty', () => {
    // The tests' mover does not bump blocks (helpers/testMove.ts); the Arcade one does, on the
    // head reaching the block's underside, which is what this checks. Seen in the browser too.
    expect(HOMMIK.generate({} as never)[14][4]).toBe(TILE_QUESTION);
    for (const key of DIFF_KEYS) {
      const world = quietWorld(HOMMIK, key);
      let top = Infinity;
      for (let i = 0; i < 200; i++) {
        step(world);
        top = Math.min(top, world.player.y);
      }
      expect({ key, reaches: top <= 15 * TILE, onBed: world.player.x === 4 * TILE }).toEqual({ key, reaches: true, onBed: true });
    }
  });

  it('needs the step stool to get onto the counter on Hard, not on Super Easy', () => {
    // The counter runs from column 82 (the sink's section starts at 74); its top is its first solid row.
    const top = mapOf().findIndex((row) => isSolid(row[90]));
    const tall = (23 - top) * TILE;
    expect(jumpRise('hard')).toBeLessThan(tall);
    expect(jumpRise('super_easy')).toBeGreaterThan(tall);
    expect(jumpRise('hard')).toBeGreaterThan(2 * TILE);
  });

  it('hangs its taps over the counter, with room to see a drop fall', () => {
    const map = mapOf();
    const taps = quietWorld(HOMMIK).course!.taps;
    expect(taps).toHaveLength(3);
    for (const t of taps) {
      let y = t.y + 1;
      while (!isSolid(map[y][t.x])) y++;
      expect(y - t.y).toBeGreaterThanOrEqual(4);
    }
  });

  it('hands over the bow after the last potty before the hairbrush', () => {
    const bow = HOMMIK.course!.stations.find((s) => s.kind === 'bow')!;
    const brush = HOMMIK.enemyDefs.find((d) => d.type === 'hairbrush')!;
    const potties = HOMMIK.course!.flags.filter((f) => f.x < brush.x);
    expect(bow.x).toBeGreaterThan(Math.max(...potties.map((f) => f.x)));
    expect(bow.x).toBeLessThan(brush.x);
  });

  it('runs through to Härra Kaka running off, shooting the hairbrush, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      expect({ key, won: playRight(guardedWorld(key)) }).toEqual({ key, won: true });
    }
  });
});

describe('the plunger', () => {
  /** A floor 40 wide, a plunger at column 20. */
  const PLUNGER_LEVEL = courseLevel({
    name: 'Plunger', theme: 0,
    sections: [sectionOf(40, { 20: `..P${'.'.repeat(37)}`, 22: `${'.'.repeat(20)}j${'.'.repeat(17)}R.` })],
  });
  const withPlunger = (key: (typeof DIFF_KEYS)[number]) => {
    const world = quietWorld(PLUNGER_LEVEL, key);
    for (const d of world.pending) d.spawned = false;
    world.player.hasCape = false;
    standAt(world, 2, 23);
    step(world);
    const e = world.enemies.find((x) => x.type === 'plunger')!;
    return { world, e };
  };

  it('stays where it stands and jumps straight up, again and again, squatting first, landing with a plop', () => {
    const { world, e } = withPlunger('normal');
    const x = e.x;
    let jumps = 0;
    let squatted = false;
    let plops = 0;
    for (let i = 0; i < 400; i++) {
      const wasDown = !e.airborne;
      if (plungerSquatting(e, world.dc)) squatted = true;
      step(world);
      if (wasDown && e.airborne) jumps++;
      plops += world.sounds.filter((s) => s === 'plop').length;
      expect(e.x).toBe(x);
    }
    expect(jumps).toBeGreaterThanOrEqual(2);
    expect(squatted).toBe(true);
    expect(plops).toBeGreaterThanOrEqual(2);
  });

  it('jumps less often on Super Easy than on Hard', () => {
    expect(plungerRest(DIFFICULTY_CONFIG.super_easy)).toBeGreaterThan(plungerRest(DIFFICULTY_CONFIG.hard));
  });

  it('is stomped while it is down, and hurts while it is up or by touch', () => {
    // Down: a hero coming down on it squashes it.
    let { world, e } = withPlunger('normal');
    world.player.x = e.x;
    world.player.y = e.y - world.player.h + 2;
    world.player.vy = 3;
    step(world);
    expect(e.alive).toBe(false);
    // Up: the same comes to harm.
    ({ world, e } = withPlunger('normal'));
    for (let i = 0; i < 400 && !e.airborne; i++) step(world);
    step(world, {}, 6);
    world.player.x = e.x;
    world.player.y = e.y - world.player.h + 2;
    world.player.vy = 3;
    step(world);
    expect(world.dead).toBe(true);
    // At its side, on the ground: harm.
    ({ world, e } = withPlunger('normal'));
    standAt(world, 19, 23);
    world.player.x = e.x - world.player.w + 3;
    step(world);
    expect(world.dead).toBe(true);
  });

  it('lets a hero run under it while it is up, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      const { world, e } = withPlunger(key);
      standAt(world, 18, 23);
      world.player.x = e.x - world.player.w - TILE;
      for (let i = 0; i < 400 && !e.airborne; i++) step(world);
      for (let i = 0; i < 60 && world.player.x < e.x + e.w + 4; i++) step(world, { right: true });
      expect({ key, dead: world.dead, past: world.player.x >= e.x + e.w + 4 }).toEqual({ key, dead: false, past: true });
    }
  });
});

describe('the toilet brush', () => {
  /** A floor 40 wide, a brush spinning round column 20, three and a half tiles over the floor. */
  const BRUSH_LEVEL = courseLevel({
    name: 'Brush', theme: 0,
    sections: [sectionOf(40, { 19: `${'.'.repeat(20)}X${'.'.repeat(19)}`, 20: `..P${'.'.repeat(37)}`, 22: `${'.'.repeat(38)}R.` })],
  });

  it('turns at its difficulty\'s speed, slower on Super Easy', () => {
    expect(brushSpeed(DIFFICULTY_CONFIG.super_easy)).toBeLessThan(brushSpeed(DIFFICULTY_CONFIG.hard));
    const world = quietWorld(BRUSH_LEVEL, 'normal');
    standAt(world, 2, 23);
    const b = world.course!.brushes[0];
    const a0 = b.angle;
    step(world, {}, 10);
    expect(b.angle - a0).toBeCloseTo(10 * brushSpeed(world.dc), 5);
  });

  it('hurts along its whole length, and nowhere else', () => {
    const b = { x: 200, y: 200, angle: 0 };
    expect(brushTouches(b, { x: 200 + BRUSH_R - 4, y: 190, w: 16, h: 24 })).toBe(true);
    expect(brushTouches(b, { x: 200 - BRUSH_R - 10, y: 190, w: 16, h: 24 })).toBe(true);
    expect(brushTouches(b, { x: 200 + BRUSH_R + 6, y: 190, w: 16, h: 24 })).toBe(false);
    expect(brushTouches({ ...b, angle: Math.PI / 2 }, { x: 230, y: 190, w: 16, h: 24 })).toBe(false);
  });

  it('leaves standing room beside it, and a gap a run gets through, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      // Beside it, out of its reach, all the way round.
      const still = quietWorld(BRUSH_LEVEL, key);
      still.player.hasCape = false;
      standAt(still, 20 - 4, 23);
      step(still, {}, Math.ceil((2 * Math.PI) / brushSpeed(still.dc)));
      expect({ key, standing: !still.dead }).toEqual({ key, standing: true });
      // A run from beside it to past it: some start times get through, and not just one.
      let through = 0;
      const tries = 24;
      for (let k = 0; k < tries; k++) {
        const world = quietWorld(BRUSH_LEVEL, key);
        world.player.hasCape = false;
        standAt(world, 20 - 4, 23);
        step(world, {}, Math.round((k * Math.PI) / brushSpeed(world.dc) / tries));
        for (let i = 0; i < 120 && !world.dead && world.player.x < (20 + 4) * TILE; i++) step(world, { right: true });
        if (!world.dead) through++;
      }
      expect({ key, enough: through >= tries / 4 }).toEqual({ key, enough: true });
    }
  });
});

describe('soap bubbles', () => {
  /** A soap dish on the floor at column 10, a ceiling over it at row 10, a shelf at row 15 from column 13. */
  const ceiling = `${'.'.repeat(6)}${'B'.repeat(8)}${'.'.repeat(26)}`;
  const shelf = `${'.'.repeat(13)}${'B'.repeat(6)}${'.'.repeat(21)}`;
  const BUBBLE_LEVEL = courseLevel({
    name: 'Bubbles', theme: 0,
    sections: [sectionOf(40, { 10: ceiling, 15: shelf, 20: `..P${'.'.repeat(37)}`, 22: `${'.'.repeat(10)}O${'.'.repeat(27)}R.` })],
  });
  const atTheDish = (key: (typeof DIFF_KEYS)[number] = 'normal') => {
    const world = quietWorld(BUBBLE_LEVEL, key);
    standAt(world, 10, 23);
    world.player.x = 10 * TILE;
    world.course!.soaps[0].timer = 2;
    return world;
  };

  it('come more often on Super Easy than on Hard', () => {
    expect(bubbleInterval(DIFFICULTY_CONFIG.super_easy)).toBeLessThan(bubbleInterval(DIFFICULTY_CONFIG.hard));
  });

  it('lift a hero standing at the dish, carry them up, and pop at whatever is over them', () => {
    const world = atTheDish();
    let lowest = Infinity;
    let popped = false;
    for (let i = 0; i < 600 && !popped; i++) {
      step(world);
      // Just the one bubble, so nothing catches the hero when it pops.
      if (world.course!.bubbles.length > 0) world.course!.soaps[0].timer = 1e9;
      lowest = Math.min(lowest, world.player.y);
      popped = world.course!.fx.some((f) => f.kind === 'pop');
    }
    expect(lowest).toBeLessThan(23 * TILE - world.player.h - 4 * TILE);
    expect(popped).toBe(true);
    // Popped under the ceiling: the hero's head had got up to it.
    expect(lowest).toBeLessThanOrEqual(11 * TILE + 2);
    step(world, {}, 80);
    expect(world.player.y + world.player.h).toBe(23 * TILE);
  });

  it('let a rider jump off onto a shelf, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      const world = atTheDish(key);
      for (let i = 0; i < 600 && world.player.y + world.player.h > 15 * TILE - 2; i++) step(world);
      // Jump off to the right, and stop once over the shelf.
      for (let i = 0; i < 90; i++) step(world, { right: world.player.x < 14 * TILE, jump: i < 12, jumpPressed: i === 0 });
      const p = world.player;
      expect({ key, onShelf: p.onGround && p.y + p.h === 15 * TILE && p.x > 13 * TILE }).toEqual({ key, onShelf: true });
    }
  });

  it('are solid only from above: one rising past a hero beside it does not lift them', () => {
    const world = atTheDish();
    world.player.x = 10 * TILE + TILE / 2 + BUBBLE_W / 2 + 2;
    step(world, {}, 120);
    expect(world.player.y + world.player.h).toBe(23 * TILE);
    expect(world.course!.bubbles.length).toBeGreaterThan(0);
  });
});

describe('PÄEV, the day', () => {
  const map = PAEV.generate({} as never);
  const col = (section: number, x: number) => [0, 42, 82, 122][section] + x;

  it('comes after HOMMIK, and ends with Härra Kaka running off again', () => {
    const at = STAGES.findIndex((s) => s.level === PAEV);
    expect(STAGES[at - 1].level).toBe(HOMMIK);
    expect(STAGES[at]).toEqual({ theme: HOME_THEME, level: PAEV, nameKey: 'level_7_2' });
    expect([PAEV.ending, PAEV.villain, PAEV.home]).toEqual(['chase', 'poo', true]);
  });

  it('has plungers in the hall and toilet brushes at the end', () => {
    expect(PAEV.enemyDefs.filter((d) => d.type === 'plunger')).toHaveLength(3);
    expect(PAEV.course!.brushes).toHaveLength(2);
  });

  it('has a washing machine only a fart jump gets over, its station at its foot, on every difficulty', () => {
    const washer = col(1, 22);
    const top = map.findIndex((row) => isSolid(row[washer]));
    const fart = PAEV.course!.stations.find((s) => s.kind === 'fart')!;
    const potties = PAEV.course!.flags.filter((f) => f.x < washer);
    expect(fart.x).toBeGreaterThan(Math.max(...potties.map((f) => f.x)));
    expect(23 - top).toBe(7);
    /** Runs at it from three tiles off, jumping all the way: does the hero get to the far side? */
    const getsPast = (key: (typeof DIFF_KEYS)[number], fart: boolean) => {
      const world = quietWorld(PAEV, key);
      world.course!.stations.forEach((s) => { s.cooldown = 99999; });
      standAt(world, washer - 3, 23);
      for (let i = 0; i < 240; i++) {
        const p = world.player;
        if (fart) p.fartTimer = 900;
        step(world, { right: true, jump: true, jumpPressed: p.onGround });
      }
      return world.player.x > (washer + 3) * TILE;
    };
    for (const key of DIFF_KEYS) {
      expect({ key, plain: getsPast(key, false), fart: getsPast(key, true) }).toEqual({ key, plain: false, fart: true });
    }
  });

  it('puts the shelf out of a jump\'s reach, so a bubble is the way up', () => {
    expect(jumpRise('super_easy')).toBeLessThan((23 - 13) * TILE - TILE);
    expect(PAEV.course!.soaps).toHaveLength(1);
  });

  it('hangs the curtain\'s target where a shot from the shelf hits it and one from the floor does not', () => {
    const t = quietWorld(PAEV).course!.targets[0];
    const hits = (y: number) => y < t.box.y + t.box.h && y + 4 > t.box.y;
    const h = 24;
    expect(hits(arrowY(13 * TILE - h, h))).toBe(true);
    for (const key of DIFF_KEYS) expect(hits(arrowY(23 * TILE - h - jumpRise(key), h))).toBe(false);
  });
});

describe('the shampoo bottle', () => {
  const BOTTLE_LEVEL = courseLevel({
    name: 'Bottle', theme: 0,
    sections: [sectionOf(40, { 20: `..P${'.'.repeat(37)}`, 22: `${'.'.repeat(20)}m${'.'.repeat(17)}R.` })],
  });

  it('squirts soap blobs flat at the hero, as a cannon fires, and is not stomped', () => {
    const world = quietWorld(BOTTLE_LEVEL, 'normal');
    for (const d of world.pending) d.spawned = false;
    standAt(world, 12, 23);
    let squirted = false;
    let blob;
    for (let i = 0; i < 300 && !blob; i++) {
      step(world);
      squirted = squirted || world.sounds.includes('squirt');
      blob = world.enemyProjectiles.find((s) => s.type === 'soap');
    }
    const bottle = world.enemies.find((e) => e.type === 'shampoo')!;
    expect(blob).toBeDefined();
    expect(blob!.vy).toBe(0);
    expect(blob!.vx).toBeLessThan(0);
    expect(squirted).toBe(true);
    expect(bottle.noStomp).toBe(true);
    expect(bottle.vx).toBe(0);
  });
});

describe('rubber ducks', () => {
  /** A bath: rims at 6-7 and 24-25, three rows up; water between them; two ducks on it. */
  const water = `${'#'.repeat(6)}BB${'_'.repeat(16)}BB${'#'.repeat(14)}`;
  const rims = `${'.'.repeat(6)}BB${'_'.repeat(16)}BB${'.'.repeat(14)}`;
  const BATH = courseLevel({
    name: 'Bath', theme: 0,
    sections: [sectionOf(40, {
      20: `..P...BB..q.......q.....BB${'.'.repeat(14)}`,
      21: rims, 22: `${rims.slice(0, 38)}R.`, 23: water, 24: water,
    })],
  });
  const inTheBath = (key: (typeof DIFF_KEYS)[number] = 'normal') => {
    const world = quietWorld(BATH, key);
    world.player.hasCape = false;
    standAt(world, 2, 23);
    return world;
  };

  it('drift back and forth over their own stretch of the bath, slower on Super Easy', () => {
    expect(duckSpeed(DIFFICULTY_CONFIG.super_easy)).toBeLessThan(duckSpeed(DIFFICULTY_CONFIG.hard));
    const world = inTheBath();
    const ducks = world.course!.ducks;
    expect(ducks.map((d) => [d.left / TILE, d.right / TILE])).toEqual([[8, 16], [16, 24]]);
    const seen = ducks.map(() => ({ min: Infinity, max: -Infinity }));
    for (let i = 0; i < 1200; i++) {
      step(world);
      ducks.forEach((d, j) => { seen[j].min = Math.min(seen[j].min, d.x); seen[j].max = Math.max(seen[j].max, d.x + d.w); });
    }
    ducks.forEach((d, j) => {
      expect(seen[j].min).toBe(d.left);
      expect(seen[j].max).toBe(d.right);
    });
    // On the water: a rider stands a little under the rims' tops.
    expect(ducks[0].y).toBe(21 * TILE - 6);
  });

  it('carry a hero who lands on one along with it', () => {
    const world = inTheBath();
    const duck = world.course!.ducks[0];
    const p = world.player;
    p.x = duck.x + 8;
    p.y = duck.y - p.h - 6;
    p.vy = 1;
    p.onGround = false;
    step(world, {}, 10);
    expect(p.y + p.h).toBe(duck.y);
    const before = { hero: p.x, duck: duck.x };
    step(world, {}, 20);
    expect(p.y + p.h).toBe(duck.y);
    expect(p.x - before.hero).toBeCloseTo(duck.x - before.duck, 5);
    expect(duck.x).not.toBe(before.duck);
  });

  it('let a hero who misses them fall in', () => {
    const world = inTheBath();
    const p = world.player;
    // Over the water between the ducks: one starts at the bath's left end, the other at its right.
    p.x = 15 * TILE;
    p.y = 19 * TILE;
    p.vy = 1;
    p.onGround = false;
    for (let i = 0; i < 60 && !world.dead; i++) step(world);
    expect(world.dead).toBe(true);
  });
});

describe('ÕHTU, the evening', () => {
  const col = (section: number, x: number) => [0, 40, 80][section] + x;

  it('comes after PÄEV and ends the run with Härra Kaka\'s fight', () => {
    const at = STAGES.findIndex((s) => s.level === OHTU);
    expect(STAGES[at - 1].level).toBe(PAEV);
    expect(at).toBe(STAGES.length - 1);
    expect(STAGES[at]).toEqual({ theme: HOME_THEME, level: OHTU, nameKey: 'level_7_3' });
    expect([OHTU.ending, OHTU.course!.boss!.kind, OHTU.home]).toEqual(['boss', 'poo', true]);
    expect(STAGES.some((s) => s.level === VANNITUBA)).toBe(false);
    expect(DEMOS.poo.level).toBe(VANNITUBA);
  });

  it('ends with the very bathroom ?boss=poo has', () => {
    const ours = OHTU.generate({} as never).map((row) => row.slice(-44));
    const its = VANNITUBA.generate({} as never).map((row) => row.slice(-44));
    expect(ours).toEqual(its);
  });

  it('has two shampoo bottles on a wet floor', () => {
    const bottles = OHTU.enemyDefs.filter((d) => d.type === 'shampoo');
    const map = OHTU.generate({} as never);
    expect(bottles).toHaveLength(2);
    for (const b of bottles) expect(map[23][b.x]).toBe(TILE_ICE);
  });

  it('can be crossed duck to duck, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      const world = quietWorld(OHTU, key);
      world.player.hasCape = false;
      const c = world.course!;
      standAt(world, col(1, 6), 20);
      const farRim = col(1, 32) * TILE;
      let hold = 0;
      for (let i = 0; i < 4000 && !world.dead && world.player.x < farRim; i++) {
        const p = world.player;
        const on = c.riding ? c.ducks.indexOf(c.riding as (typeof c.ducks)[number]) : -1;
        const edge = on >= 0 ? c.ducks[on].x + c.ducks[on].w : col(1, 8) * TILE;
        const next = on + 1 < c.ducks.length ? c.ducks[on + 1].x : farRim;
        let right = false;
        let jump = false;
        let jumpPressed = false;
        if (hold > 0) {
          right = true;
          jump = hold > 10;
          hold--;
        } else if (p.onGround) {
          if (p.x + p.w < edge - 1) right = true;
          else if (next - (p.x + p.w) < 4) {
            // Onto the next duck: a step; onto the rim, which stands higher: a hop.
            right = true;
            if (next === farRim) { jumpPressed = true; jump = true; hold = 16; }
          }
        }
        step(world, { right, jump, jumpPressed });
      }
      expect({ key, dead: world.dead, across: world.player.x >= farRim }).toEqual({ key, dead: false, across: true });
    }
  });
});
