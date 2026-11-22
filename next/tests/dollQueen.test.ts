import { describe, expect, it } from 'vitest';
import { jumpRise, quietWorld, standAt, step } from './helpers/courseRuns';
import { DIFF_KEYS, DIFFICULTY_CONFIG } from '../src/config/difficulty';
import { courseLevel } from '../src/data/course';
import {
  dizzyFrames, heartSpeed, QUEEN_H, QUEEN_HP, QUEEN_HURT_FRAMES, QUEEN_MAX_HEARTS, QUEEN_MAX_ZOMBIES,
  QUEEN_SIT_H, throwInterval,
  type DollQueenState,
} from '../src/game/bosses/dollQueen';
import type { Rect, World } from '../src/game/types';

/** The throne room in miniature: a door, the three spots (low, high, far), the Queen, the cage. */
function room(): string[] {
  const rows = Array.from({ length: 25 }, () => '.'.repeat(40));
  const set = (x: number, y: number, ch: string) => { rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1); };
  rows[23] = '#'.repeat(40);
  rows[24] = '#'.repeat(40);
  set(1, 20, 'P');
  for (let y = 17; y <= 22; y++) set(4, y, ':');
  set(13, 22, '1');
  set(21, 18, '2');
  set(31, 22, '3');
  set(26, 22, 'Q');
  set(36, 22, 'R');
  return rows;
}
const ROOM = courseLevel({ name: 'throne room', theme: 0, ending: 'boss', sections: [room()] });

/** In the room, out of harm's way (invincible), with the Queen awake. */
function inRoom(difficulty: keyof typeof DIFFICULTY_CONFIG = 'super_easy'): { world: World; q: DollQueenState } {
  const world = quietWorld(ROOM, difficulty);
  standAt(world, 8, 23);
  world.player.invincible = 99999;
  step(world);
  return { world, q: world.courseBoss as DollQueenState };
}

function shoot(world: World, box: Rect): void {
  world.arrows.push({ x: box.x - 8, y: box.y + box.h / 2 - 2, vx: 6, life: 60, isChicken: false });
}

/** Drop the hero onto her head. */
function stomp(world: World, q: DollQueenState): void {
  const p = world.player;
  p.x = q.x + q.w / 2 - p.w / 2;
  p.y = q.y - p.h + 3;
  p.vy = 4;
  p.onGround = false;
  step(world);
}

function knockParasol(world: World, q: DollQueenState): void {
  q.x = q.patrol[0];
  shoot(world, q.spots[q.round]);
  step(world);
}

describe('the Doll Queen', () => {
  it('sleeps until the hero is in the room, then raises her parasol and shows a target', () => {
    const world = quietWorld(ROOM);
    standAt(world, 2, 23);
    step(world);
    expect((world.courseBoss as DollQueenState).phase).toBe('asleep');
    standAt(world, 8, 23);
    step(world);
    expect((world.courseBoss as DollQueenState).phase).toBe('shielded');
    expect((world.courseBoss as DollQueenState).targetUp).toBe(true);
  });

  it('turns arrows and stomps away with her parasol', () => {
    const { world, q } = inRoom();
    shoot(world, q);
    step(world);
    expect(world.arrows).toHaveLength(0);
    stomp(world, q);
    expect(q.hp).toBe(QUEEN_HP);
    expect(world.player.vy).toBeLessThan(0);
  });

  it('sits down dizzy when her target is shot', () => {
    const { world, q } = inRoom();
    knockParasol(world, q);
    expect(q.phase).toBe('dizzy');
    expect(q.h).toBe(QUEEN_SIT_H);
    expect(q.targetUp).toBe(false);
  });

  it('loses a heart to a stomp while dizzy, and calls two zombies', () => {
    const { world, q } = inRoom();
    knockParasol(world, q);
    stomp(world, q);
    expect(q.hp).toBe(QUEEN_HP - 1);
    expect(q.phase).toBe('hurt');
    expect(world.enemies.filter((e) => e.zombie && e.alive)).toHaveLength(2);
  });

  it('loses a heart to an arrow while dizzy, too', () => {
    const { world, q } = inRoom();
    knockParasol(world, q);
    shoot(world, q);
    step(world);
    expect(q.hp).toBe(QUEEN_HP - 1);
  });

  it('gets back up when the dizziness wears off, with the same target', () => {
    const { world, q } = inRoom();
    knockParasol(world, q);
    step(world, {}, dizzyFrames(world.dc) + 1);
    expect(q.phase).toBe('shielded');
    expect(q.round).toBe(0);
    expect(q.targetUp).toBe(true);
    expect(q.h).toBe(QUEEN_H);
  });

  it('asks for the next spot each round, and three hits beat her', () => {
    const { world, q } = inRoom();
    for (let round = 0; round < QUEEN_HP; round++) {
      expect(q.round).toBe(round);
      world.enemies.forEach((e) => { e.alive = false; });
      knockParasol(world, q);
      expect(q.phase).toBe('dizzy');
      shoot(world, q);
      step(world);
      step(world, {}, QUEEN_HURT_FRAMES + 1);
    }
    expect(q.phase).toBe('defeated');
  });

  it('takes her zombies with her when she falls', () => {
    const { world, q } = inRoom();
    q.hp = 2;
    knockParasol(world, q);
    shoot(world, q);
    step(world);
    expect(world.enemies.some((e) => e.alive)).toBe(true);
    step(world, {}, QUEEN_HURT_FRAMES + 1);
    q.hp = 1;
    q.round = 0;
    knockParasol(world, q);
    shoot(world, q);
    step(world);
    step(world, {}, QUEEN_HURT_FRAMES + 1);
    expect(q.phase).toBe('defeated');
    expect(world.enemies.some((e) => e.alive)).toBe(false);
  });

  it('throws hearts at the hero, at a height a standing hero is hit by', () => {
    const { world, q } = inRoom();
    q.throwTimer = 1;
    step(world);
    const heart = world.enemyProjectiles.find((s) => s.type === 'heart')!;
    expect(heart.vx).toBeLessThan(0);
    const p = world.player;
    expect(heart.y + 8).toBeGreaterThan(p.y);
    expect(heart.y).toBeLessThan(p.y + p.h);
  });

  it('never has more than two zombies up, or two hearts in the air', () => {
    const { world, q } = inRoom('hard');
    for (let i = 0; i < 2; i++) {
      knockParasol(world, q);
      shoot(world, q);
      step(world);
      step(world, {}, QUEEN_HURT_FRAMES + 1);
    }
    expect(world.enemies.filter((e) => e.alive && e.zombie).length).toBeLessThanOrEqual(QUEEN_MAX_ZOMBIES);
    q.throwTimer = 1;
    for (let i = 0; i < 400; i++) {
      step(world);
      expect(world.enemyProjectiles.filter((s) => s.type === 'heart').length).toBeLessThanOrEqual(QUEEN_MAX_HEARTS);
    }
  });

  it('is quicker on hard than on super easy', () => {
    const easy = DIFFICULTY_CONFIG.super_easy;
    const hard = DIFFICULTY_CONFIG.hard;
    expect(throwInterval(hard, 0)).toBeLessThan(throwInterval(easy, 0));
    expect(heartSpeed(hard, 0)).toBeGreaterThan(heartSpeed(easy, 0));
    expect(dizzyFrames(hard)).toBeLessThan(dizzyFrames(easy));
  });

  it('sits low enough that a held jump reaches her head, on every difficulty', () => {
    for (const key of DIFF_KEYS) expect({ key, reach: jumpRise(key) > QUEEN_SIT_H }).toEqual({ key, reach: true });
  });

  it('keeps the sibling caged until she is beaten', () => {
    const { world, q } = inRoom();
    standAt(world, 36, 23);
    step(world);
    expect(world.won).toBe(false);
    q.phase = 'defeated';
    step(world);
    expect(world.won).toBe(true);
  });
});
