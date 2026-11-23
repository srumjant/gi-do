import { describe, expect, it } from 'vitest';
import { quietWorld, standAt, step } from './helpers/courseRuns';
import { TILE } from '../src/config/constants';
import { DIFF_KEYS, DIFFICULTY_CONFIG, type DifficultyKey } from '../src/config/difficulty';
import { courseLevel } from '../src/data/course';
import {
  chargeSpeed, dizzyFrames, ICICLE_DROP, icicleCount, icicleWarn, windupFrames, YETI_HP,
  YETI_HURT_FRAMES, YETI_MAX_ZOMBIES, type YetiState,
} from '../src/game/bosses/yeti';
import type { World } from '../src/game/types';

/** A throne room in miniature: a door, the Yeti, the cage on a dais at the far end. */
function room(): string[] {
  const rows = Array.from({ length: 25 }, () => '.'.repeat(32));
  const set = (x: number, y: number, ch: string) => { rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1); };
  rows[23] = '#'.repeat(32);
  rows[24] = '#'.repeat(32);
  for (let x = 0; x < 32; x++) set(x, 10, 'B');
  set(1, 20, 'P');
  for (let y = 11; y <= 16; y++) set(3, y, 'B');
  for (let y = 17; y <= 22; y++) set(3, y, ':');
  set(22, 22, 'Q');
  for (let x = 26; x <= 30; x++) set(x, 22, '#');
  set(28, 21, 'R');
  for (let y = 11; y <= 22; y++) set(31, y, 'B');
  return rows;
}
const ROOM = courseLevel({ name: 'room', theme: 4, ending: 'boss', boss: 'yeti', sections: [room()] });

const icicles = (world: World) => world.enemyProjectiles.filter((s) => s.type === 'icicle');
const zombies = (world: World) => world.enemies.filter((e) => e.alive && e.zombie);

/** In the room, him awake and winding up, the hero safe unless a test says. */
function inRoom(difficulty: DifficultyKey = 'super_easy', heroCol = 9): { world: World; b: YetiState } {
  const world = quietWorld(ROOM, difficulty);
  standAt(world, heroCol, 23);
  world.player.invincible = 99999;
  step(world);
  return { world, b: world.courseBoss as YetiState };
}

/** On through his windup and charge, to the slam. */
function toSlam(world: World, b: YetiState): void {
  for (let i = 0; i < 600 && b.phase !== 'dizzy'; i++) step(world);
}

/** Drop the hero onto his head. */
function landOn(world: World, b: YetiState): void {
  const p = world.player;
  p.x = b.x + b.w / 2 - p.w / 2;
  p.y = b.y - p.h + 3;
  p.vy = 4;
  p.onGround = false;
  step(world);
}

/**
 * The hero at column 9 facing him, he charges from his spot. Jump `jumpAt` frames into the
 * charge, running at him or standing: does the charge pass without a hit?
 */
function clears(key: DifficultyKey, jumpAt: number, running: boolean): boolean {
  const world = quietWorld(ROOM, key);
  standAt(world, 9, 23);
  world.player.invincible = 99999;
  step(world);
  const b = world.courseBoss as YetiState;
  while (b.phase !== 'charging') step(world);
  const p = world.player;
  p.invincible = 0;
  p.hasCape = false;
  for (let i = 0; i < 400 && b.phase === 'charging' && !world.dead; i++) {
    const go = i === jumpAt;
    step(world, { right: running, jump: i >= jumpAt, jumpPressed: go });
  }
  return !world.dead;
}

/** How many frames of the charge a jump can start on and clear him. */
function jumpWindow(key: DifficultyKey, running: boolean): number {
  let n = 0;
  for (let f = 0; f < 200; f++) if (clears(key, f, running)) n++;
  return n;
}

describe('the Yeti', () => {
  it('waits until the hero is in the room, then roars facing them, and charges, speeding up', () => {
    const world = quietWorld(ROOM);
    standAt(world, 2, 23);
    step(world);
    const b = world.courseBoss as YetiState;
    expect(b.phase).toBe('asleep');
    standAt(world, 9, 23);
    world.player.invincible = 99999;
    step(world);
    expect(b.phase).toBe('windup');
    expect(b.facing).toBe(-1);
    const x0 = b.x;
    step(world, {}, windupFrames(world.dc, 0) - 1);
    expect(b.x).toBe(x0);
    step(world, {}, 2);
    expect(b.phase).toBe('charging');
    const v1 = b.speed;
    step(world, {}, 5);
    expect(b.speed).toBeGreaterThan(v1);
    expect(b.x).toBeLessThan(x0);
  });

  it('charges until he slams into the wall, inside the door, and sits dizzy', () => {
    const { world, b } = inRoom();
    toSlam(world, b);
    expect(b.phase).toBe('dizzy');
    expect(b.x).toBe(b.walls[0]);
    expect(world.map[22][Math.floor(b.x / TILE) - 1]).not.toBe(0);
  });

  it('turns round to charge the other way, and slams into the dais', () => {
    const { world, b } = inRoom('super_easy', 24);
    b.x = 6 * TILE;
    world.player.x = 24 * TILE;
    toSlam(world, b);
    expect(b.x).toBe(b.walls[1]);
    expect(world.map[22][Math.floor((b.x + b.w) / TILE)]).not.toBe(0);
  });

  it('hurts with a charge a hero who stands in the way, and every jump at him clears it', () => {
    for (const key of DIFF_KEYS) {
      expect({ key, standingStill: clears(key, 9999, false) }).toEqual({ key, standingStill: false });
      expect({ key, window: jumpWindow(key, true) >= 20 }).toEqual({ key, window: true });
    }
    expect(jumpWindow('super_easy', false)).toBeGreaterThanOrEqual(30);
  });

  it('brings icicles down with the slam: each hangs first, never over him, then falls and hurts', () => {
    const { world, b } = inRoom();
    toSlam(world, b);
    expect(b.icicles).toHaveLength(icicleCount(world.dc, 0));
    for (const ic of b.icicles) expect(ic.x + 8 <= b.x - TILE || ic.x >= b.x + b.w + TILE).toBe(true);
    expect(icicles(world)).toHaveLength(0);
    step(world, {}, icicleWarn(world.dc) + 1);
    const [first] = icicles(world);
    // It lets go from the ceiling (a frame of falling ago).
    expect(first.y - (b.floorY - ICICLE_DROP)).toBeLessThan(4);
    // Under one, a hero is hurt.
    const p = world.player;
    p.invincible = 0;
    p.hasCape = false;
    standAt(world, Math.floor(first.x / TILE), 23);
    step(world, {}, 60);
    expect(world.dead).toBe(true);
  });

  it('loses an icicle to an arrow', () => {
    const { world, b } = inRoom();
    toSlam(world, b);
    step(world, {}, icicleWarn(world.dc) + 10);
    const [ic] = icicles(world);
    world.arrows.push({ x: ic.x - 2, y: ic.y + 2, vx: 0, life: 60, isChicken: false });
    step(world);
    expect(icicles(world).includes(ic)).toBe(false);
  });

  it('is hit by a stomp on his head while he sits dizzy, and calls two zombie penguins', () => {
    const { world, b } = inRoom();
    toSlam(world, b);
    standAt(world, 20, 23);
    landOn(world, b);
    expect(b.hp).toBe(YETI_HP - 1);
    expect(b.phase).toBe('hurt');
    expect(world.player.vy).toBeLessThan(0);
    step(world, {}, YETI_HURT_FRAMES);
    expect(b.phase).toBe('windup');
    expect(zombies(world).length).toBeGreaterThan(0);
    expect(zombies(world).length).toBeLessThanOrEqual(YETI_MAX_ZOMBIES);
    for (const z of zombies(world)) expect(z.type).toBe('penguin');
    expect(chargeSpeed(world.dc, b.round)).toBeGreaterThan(chargeSpeed(world.dc, 0));
  });

  it('sits dizzy long enough to run the whole room to him and jump, every difficulty, every round', () => {
    const { b } = inRoom();
    const span = b.walls[1] + b.w - b.walls[0];
    for (const key of DIFF_KEYS) {
      const dc = DIFFICULTY_CONFIG[key];
      for (let round = 0; round < YETI_HP; round++) {
        expect({ key, round, ok: span / dc.playerSpeed + 40 < dizzyFrames(dc, round) }).toEqual({ key, round, ok: true });
      }
    }
  });

  it('shakes off the dizzy spell unhurt when nobody jumps on him, and roars again', () => {
    const { world, b } = inRoom();
    toSlam(world, b);
    step(world, {}, dizzyFrames(world.dc, 0));
    expect(b.phase).toBe('windup');
    expect(b.hp).toBe(YETI_HP);
  });

  it('never hurts outside a charge: walking into him pushes the hero off, his head bounces them', () => {
    const { world, b } = inRoom();
    const p = world.player;
    p.invincible = 0;
    p.hasCape = false;
    p.x = b.x - p.w + 4;
    p.y = b.floorY - p.h;
    p.onGround = true;
    step(world, { right: true });
    expect(world.dead).toBe(false);
    expect(p.x + p.w).toBeLessThanOrEqual(b.x);
    landOn(world, b);
    expect(world.dead).toBe(false);
    expect(b.hp).toBe(YETI_HP);
    // Mid-charge, his head is no harm either: only running into him is.
    while (b.phase !== 'charging') step(world);
    step(world, {}, 5);
    landOn(world, b);
    expect(world.dead).toBe(false);
  });

  it('throws a hero off his head, and never charges into the wall at his back', () => {
    // Found in the browser (2026-11-23): a hero standing on his head while he wound up at a
    // wall made him charge straight into it, dizzy at once, and stomped in the same breath.
    const { world, b } = inRoom();
    toSlam(world, b);
    step(world, {}, dizzyFrames(world.dc, 0));
    expect(b.phase).toBe('windup');
    expect(b.x).toBe(b.walls[0]);
    // On his head, a little to the wall side of his middle.
    const p = world.player;
    p.x = b.x + b.w / 2 - p.w / 2 - 4;
    p.y = b.y - p.h + 3;
    p.vy = 4;
    p.onGround = false;
    step(world);
    expect(Math.abs(p.vx)).toBeGreaterThan(0);
    p.x = b.x + b.w / 2 - p.w / 2 - 4;
    p.y = b.y - p.h;
    while (b.phase === 'windup') step(world);
    expect(b.phase).toBe('charging');
    expect(b.facing).toBe(1);
    step(world, {}, 10);
    expect(b.x).toBeGreaterThan(b.walls[0]);
  });

  it('hurts in a charge only from the front: touching his back as he runs off is no harm', () => {
    // Found in the browser (2026-11-23): a hero who jumped him came down on his back as he ran
    // away, and was hurt.
    const { world, b } = inRoom();
    while (b.phase !== 'charging') step(world);
    step(world, {}, 10);
    const p = world.player;
    p.invincible = 0;
    p.hasCape = false;
    // Behind him: he charges left, the hero at his right side.
    p.x = b.x + b.w - 4;
    p.y = b.floorY - p.h;
    p.vy = 0;
    p.onGround = true;
    step(world);
    expect(world.dead).toBe(false);
  });

  it('is slower and kinder on Super Easy than on Hard', () => {
    const se = DIFFICULTY_CONFIG.super_easy;
    const hard = DIFFICULTY_CONFIG.hard;
    expect(windupFrames(se, 0)).toBeGreaterThan(windupFrames(hard, 0));
    expect(chargeSpeed(se, 0)).toBeLessThan(chargeSpeed(hard, 0));
    expect(dizzyFrames(se, 0)).toBeGreaterThan(dizzyFrames(hard, 0));
    expect(icicleCount(se, 0)).toBeLessThan(icicleCount(hard, 0));
    expect(icicleWarn(se)).toBeGreaterThan(icicleWarn(hard));
  });

  it('is beaten by three stomps: icicles and zombies gone, and the cage opens', () => {
    const { world, b } = inRoom();
    for (let i = 0; i < YETI_HP; i++) {
      toSlam(world, b);
      expect(b.phase).toBe('dizzy');
      landOn(world, b);
      if (b.phase === 'hurt') step(world, {}, YETI_HURT_FRAMES);
    }
    expect(b.phase).toBe('defeated');
    expect(b.icicles).toHaveLength(0);
    expect(icicles(world)).toHaveLength(0);
    expect(zombies(world)).toHaveLength(0);
    standAt(world, ROOM.rescuePos[0], 22);
    step(world);
    expect(world.won).toBe(true);
  });

  it('keeps the cage shut while he stands', () => {
    const { world } = inRoom();
    standAt(world, ROOM.rescuePos[0], 22);
    step(world);
    expect(world.won).toBe(false);
  });
});
