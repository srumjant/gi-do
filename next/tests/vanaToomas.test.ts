import { describe, expect, it } from 'vitest';
import { jumpRise, quietWorld, standAt, step } from './helpers/courseRuns';
import { TILE } from '../src/config/constants';
import { DIFF_KEYS, DIFFICULTY_CONFIG, type DifficultyKey } from '../src/config/difficulty';
import { courseLevel } from '../src/data/course';
import {
  armourLeft, marchSpeed, stampInterval, TOOMAS_HP, TOOMAS_HURT_FRAMES, TOOMAS_MAX_ZOMBIES,
  TOOMAS_WINDUP_FRAMES, WAVE_H, waveSpeed, type VanaToomasState,
} from '../src/game/bosses/vanaToomas';
import type { World } from '../src/game/types';

/** A square in miniature: a door, Vana Toomas, the cage at the far end. */
function square(): string[] {
  const rows = Array.from({ length: 25 }, () => '.'.repeat(40));
  const set = (x: number, y: number, ch: string) => { rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1); };
  rows[23] = '#'.repeat(40);
  rows[24] = '#'.repeat(40);
  set(1, 20, 'P');
  for (let y = 17; y <= 22; y++) set(3, y, ':');
  set(20, 22, 'Q');
  set(36, 22, 'R');
  return rows;
}
const SQUARE = courseLevel({ name: 'square', theme: 2, ending: 'boss', boss: 'vanaToomas', sections: [square()] });

/** In the square, with him awake and facing left, the hero safe from waves unless a test says. */
function inSquare(difficulty: DifficultyKey = 'super_easy'): { world: World; b: VanaToomasState } {
  const world = quietWorld(SQUARE, difficulty);
  standAt(world, 9, 23);
  world.player.invincible = 99999;
  step(world);
  const b = world.courseBoss as VanaToomasState;
  b.stampTimer = 99999;
  b.facing = -1;
  return { world, b };
}

/** Drop the hero onto his helmet. */
function landOn(world: World, b: VanaToomasState): void {
  const p = world.player;
  p.x = b.x + b.w / 2 - p.w / 2;
  p.y = b.y - p.h + 3;
  p.vy = 4;
  p.onGround = false;
  step(world);
}

/** Put the hero against one side of him, walking in. */
function walkInto(world: World, b: VanaToomasState, side: 'front' | 'back'): void {
  const p = world.player;
  const left = (side === 'front') === (b.facing < 0);
  p.x = left ? b.x - p.w + 3 : b.x + b.w - 3;
  p.y = b.floorY - p.h;
  p.vy = 0;
  p.onGround = true;
  step(world, left ? { right: true } : { left: true });
}

const waves = (world: World) => world.enemyProjectiles.filter((s) => s.type === 'wave');

describe('Vana Toomas', () => {
  it('stands guard until the hero is in the square, then marches', () => {
    const world = quietWorld(SQUARE);
    standAt(world, 2, 23);
    step(world);
    const b = world.courseBoss as VanaToomasState;
    expect(b.phase).toBe('asleep');
    standAt(world, 9, 23);
    step(world);
    expect(b.phase).toBe('marching');
    const x0 = b.x;
    step(world, {}, 30);
    expect(b.x).not.toBe(x0);
  });

  it('clangs a stomp without a big head: the hero bounces off, he keeps his helmet', () => {
    const { world, b } = inSquare();
    landOn(world, b);
    expect(b.hp).toBe(TOOMAS_HP);
    expect(world.player.vy).toBeLessThan(0);
    expect(world.sounds).toContain('block');
  });

  it('pushes a hero without a big head out, from either side, unharmed', () => {
    for (const side of ['front', 'back'] as const) {
      const { world, b } = inSquare();
      const p = world.player;
      p.invincible = 0;
      p.hasCape = false;
      walkInto(world, b, side);
      expect({ side, hp: b.hp, dead: world.dead, out: p.x + p.w <= b.x || p.x >= b.x + b.w })
        .toEqual({ side, hp: TOOMAS_HP, dead: false, out: true });
    }
  });

  it('clangs arrows off', () => {
    const { world, b } = inSquare();
    world.arrows.push({ x: b.x - 6, y: b.y + 20, vx: 6, life: 60, isChicken: false });
    step(world);
    expect(world.arrows).toHaveLength(0);
    expect(b.hp).toBe(TOOMAS_HP);
  });

  it('loses his helmet to a big head landing on him, and staggers', () => {
    const { world, b } = inSquare();
    world.player.bigHeadTimer = 600;
    landOn(world, b);
    expect(b.hp).toBe(TOOMAS_HP - 1);
    expect(b.phase).toBe('hurt');
    expect(armourLeft(b)).toEqual(['plate', 'shield']);
    expect(b.fx.some((f) => f.kind === 'hit' && f.piece === 'helmet')).toBe(true);
    expect(world.player.vy).toBeLessThan(0);
  });

  it('loses a piece to a big head running into his back, but his shield turns it from the front', () => {
    const front = inSquare();
    front.world.player.bigHeadTimer = 600;
    walkInto(front.world, front.b, 'front');
    expect(front.b.hp).toBe(TOOMAS_HP);

    const back = inSquare();
    back.world.player.bigHeadTimer = 600;
    walkInto(back.world, back.b, 'back');
    expect(back.b.hp).toBe(TOOMAS_HP - 1);
  });

  it('turns even a big head while his flag pole is up', () => {
    const { world, b } = inSquare();
    world.player.bigHeadTimer = 600;
    b.stampTimer = 1;
    step(world);
    expect(b.phase).toBe('windup');
    landOn(world, b);
    expect(b.hp).toBe(TOOMAS_HP);
    expect(world.player.vy).toBeLessThan(0);
  });

  it('cannot be hit again while he staggers', () => {
    const { world, b } = inSquare();
    world.player.bigHeadTimer = 600;
    landOn(world, b);
    step(world, {}, 10);
    landOn(world, b);
    expect(b.hp).toBe(TOOMAS_HP - 1);
  });

  it('raises his flag pole, then stamps: a shockwave rolls each way along the floor', () => {
    const { world, b } = inSquare();
    b.stampTimer = 1;
    step(world);
    expect(b.phase).toBe('windup');
    const x = b.x;
    step(world, {}, TOOMAS_WINDUP_FRAMES - 1);
    expect(b.x).toBe(x);
    expect(waves(world)).toHaveLength(0);
    step(world);
    const [a, c] = waves(world);
    expect([Math.sign(a.vx), Math.sign(c.vx)].sort()).toEqual([-1, 1]);
    expect(a.y + WAVE_H).toBe(b.floorY);
    expect(b.phase).toBe('marching');
  });

  it('hurts with his shockwave, which every plain jump clears', () => {
    for (const key of DIFF_KEYS) {
      expect({ key, clears: jumpRise(key) > WAVE_H * 3 }).toEqual({ key, clears: true });
      // Standing still, it hits.
      const still = inSquare(key);
      const p = still.world.player;
      p.invincible = 0;
      p.hasCape = false;
      still.world.enemyProjectiles.push({ x: p.x + 60, y: still.b.floorY - WAVE_H, vx: -waveSpeed(still.world.dc), vy: 0, life: 400, type: 'wave' });
      step(still.world, {}, 60);
      expect({ key, hit: still.world.dead }).toEqual({ key, hit: true });
      // Jumping when it is two tiles off, it does not.
      const jump = inSquare(key);
      const q = jump.world.player;
      q.invincible = 0;
      q.hasCape = false;
      const wave = { x: q.x + 80, y: jump.b.floorY - WAVE_H, vx: -waveSpeed(jump.world.dc), vy: 0, life: 400, type: 'wave' };
      jump.world.enemyProjectiles.push(wave);
      let pressed = false;
      for (let i = 0; i < 90 && !jump.world.dead; i++) {
        const go = !pressed && wave.x - (q.x + q.w) < 2 * TILE;
        if (go) pressed = true;
        step(jump.world, { jump: pressed, jumpPressed: go });
      }
      expect({ key, dead: jump.world.dead }).toEqual({ key, dead: false });
    }
  });

  it('marches slower and stamps less on Super Easy than on Hard', () => {
    const se = DIFFICULTY_CONFIG.super_easy;
    const hard = DIFFICULTY_CONFIG.hard;
    expect(marchSpeed(se, 0)).toBeLessThan(marchSpeed(hard, 0));
    expect(stampInterval(se, 0)).toBeGreaterThan(stampInterval(hard, 0));
    expect(waveSpeed(se)).toBeLessThan(waveSpeed(hard));
    expect(marchSpeed(se, 2)).toBeGreaterThan(marchSpeed(se, 0));
    expect(stampInterval(se, 2)).toBeLessThan(stampInterval(se, 0));
  });

  it('throws a hero off his helmet to the side, staggers well away, and stamps as he recovers', () => {
    // Found in the browser (2026-11-22): bouncing on his helmet took all three pieces in under
    // three seconds, landing again the moment each stagger ended.
    const { world, b } = inSquare();
    world.player.bigHeadTimer = 9999;
    landOn(world, b);
    expect(Math.abs(world.player.vx)).toBeGreaterThan(0);
    const x0 = b.x;
    step(world, {}, TOOMAS_HURT_FRAMES);
    expect(Math.abs(b.x - x0)).toBeGreaterThanOrEqual(4 * TILE);
    expect(b.phase).toBe('windup');
  });

  it('calls zombie knights when hit, never more than two up, and marches on a round faster', () => {
    const { world, b } = inSquare();
    world.player.bigHeadTimer = 9999;
    landOn(world, b);
    const knights = () => world.enemies.filter((e) => e.alive && e.zombie && e.type === 'knight').length;
    expect(knights()).toBe(TOOMAS_MAX_ZOMBIES);
    step(world, {}, TOOMAS_HURT_FRAMES + TOOMAS_WINDUP_FRAMES + 1);
    expect(b.phase).toBe('marching');
    expect(b.round).toBe(1);
    b.facing = -1;
    landOn(world, b);
    expect(knights()).toBe(TOOMAS_MAX_ZOMBIES);
  });

  it('is beaten by three pieces of armour, takes his zombies with him, and opens the cage', () => {
    const { world, b } = inSquare();
    world.player.bigHeadTimer = 9999;
    world.enemyProjectiles.push({ x: 30 * TILE, y: b.floorY - WAVE_H, vx: 0.01, vy: 0, life: 400, type: 'wave' });
    for (let i = 0; i < TOOMAS_HP; i++) {
      b.phase = 'marching';
      landOn(world, b);
    }
    expect(b.phase).toBe('defeated');
    expect(armourLeft(b)).toEqual([]);
    expect(waves(world)).toHaveLength(0);
    expect(world.enemies.filter((e) => e.alive && e.zombie)).toHaveLength(0);
    standAt(world, SQUARE.rescuePos[0], 23);
    step(world);
    expect(world.won).toBe(true);
  });

  it('keeps the cage shut while he stands', () => {
    const { world } = inSquare();
    standAt(world, SQUARE.rescuePos[0], 23);
    step(world);
    expect(world.won).toBe(false);
  });
});
