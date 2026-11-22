import { describe, expect, it } from 'vitest';
import { jumpRise, quietWorld, standAt, step } from './helpers/courseRuns';
import { DIFF_KEYS, type DifficultyKey } from '../src/config/difficulty';
import { courseLevel } from '../src/data/course';
import {
  PTERO_ALTITUDE, PTERO_H, PTERO_HP, PTERO_HURT_FRAMES, PTERO_MAX_ROCKS, PTERO_MAX_ZOMBIES,
  PTERO_WARN_FRAMES, rockWarning, type PterodactylState,
} from '../src/game/bosses/pterodactyl';
import type { World } from '../src/game/types';

/** An arena in miniature: a door, the Pterodactyl's perch, the cage at the far end. */
function arena(): string[] {
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
const ARENA = courseLevel({ name: 'arena', theme: 1, ending: 'boss', boss: 'pterodactyl', sections: [arena()] });

/** In the arena, out of harm's way (invincible), with her awake. */
function inArena(difficulty: DifficultyKey = 'super_easy'): { world: World; b: PterodactylState } {
  const world = quietWorld(ARENA, difficulty);
  standAt(world, 9, 23);
  world.player.invincible = 99999;
  step(world);
  return { world, b: world.courseBoss as PterodactylState };
}

/** Drop the hero onto her back. */
function landOn(world: World, b: PterodactylState): void {
  const p = world.player;
  p.x = b.x + b.w / 2 - p.w / 2;
  p.y = b.y - p.h + 3;
  p.vy = 4;
  p.onGround = false;
  step(world);
}

const rocks = (world: World) => world.enemyProjectiles.filter((s) => s.type === 'rock').length;

describe('the Pterodactyl', () => {
  it('sleeps until the hero is in the arena, then flies at her altitude', () => {
    const world = quietWorld(ARENA);
    standAt(world, 2, 23);
    step(world);
    const b = world.courseBoss as PterodactylState;
    expect(b.phase).toBe('asleep');
    standAt(world, 9, 23);
    step(world);
    expect(b.phase).toBe('flying');
    expect(b.floorY - (b.y + b.h)).toBeGreaterThan(PTERO_ALTITUDE - 6);
  });

  it('is out of reach of every plain jump, and in reach of every fart jump', () => {
    for (const key of DIFF_KEYS) {
      expect({ key, plain: jumpRise(key) > PTERO_ALTITUDE + PTERO_H - 4 }).toEqual({ key, plain: false });
      expect({ key, fart: jumpRise(key, true) > PTERO_ALTITUDE + PTERO_H + 4 }).toEqual({ key, fart: true });
    }
  });

  it('takes a hit when the hero lands on her back', () => {
    const { world, b } = inArena();
    landOn(world, b);
    expect(b.hp).toBe(PTERO_HP - 1);
    expect(b.phase).toBe('hurt');
    expect(world.player.vy).toBeLessThan(0);
  });

  it('lets a hero jumping up under her pass through, unharmed', () => {
    const { world, b } = inArena();
    const p = world.player;
    p.invincible = 0;
    p.hasCape = false;
    p.x = b.x + b.w / 2 - p.w / 2;
    p.y = b.y + b.h - 6;
    p.vy = -4;
    p.onGround = false;
    step(world);
    expect(b.hp).toBe(PTERO_HP);
    expect(world.dead).toBe(false);
    expect(p.vy).toBeLessThan(0);
  });

  it('is hit by a fart jump from right under her, coming down on her back, on every difficulty', () => {
    // Found in the browser (2026-11-22): a child jumps when she is overhead, and bouncing off
    // her belly made that jump never work.
    for (const key of DIFF_KEYS) {
      const { world, b } = inArena(key);
      b.dropTimer = 9999;
      const p = world.player;
      standAt(world, Math.round((b.x + b.w / 2) / 16), 23);
      let hitAt = -1;
      for (let i = 0; i < 150 && hitAt < 0; i++) {
        p.fartTimer = 900;
        const dx = b.x + b.w / 2 - (p.x + p.w / 2);
        step(world, { jump: true, jumpPressed: i === 0, right: dx > 3, left: dx < -3 });
        if (b.hp < PTERO_HP) hitAt = i;
      }
      expect({ key, hit: hitAt >= 0 }).toEqual({ key, hit: true });
    }
  });

  it('pushes a hero off her side on the way down, unharmed', () => {
    const { world, b } = inArena();
    const p = world.player;
    p.invincible = 0;
    p.hasCape = false;
    p.x = b.x - p.w + 4;
    p.y = b.y + b.h - p.h + 4;
    p.vy = 2;
    p.onGround = false;
    step(world);
    expect(b.hp).toBe(PTERO_HP);
    expect(world.dead).toBe(false);
    expect(p.x + p.w).toBeLessThanOrEqual(b.x);
  });

  it('shrugs arrows off', () => {
    const { world, b } = inArena();
    world.arrows.push({ x: b.x - 6, y: b.y + 8, vx: 6, life: 60, isChicken: false });
    step(world);
    expect(world.arrows).toHaveLength(0);
    expect(b.hp).toBe(PTERO_HP);
  });

  it('shows a rock coming before it drops, then drops it straight down', () => {
    const { world, b } = inArena();
    b.dropTimer = PTERO_WARN_FRAMES + 1;
    step(world);
    expect(rockWarning(b)).toBe(true);
    expect(rocks(world)).toBe(0);
    step(world, {}, PTERO_WARN_FRAMES);
    const rock = world.enemyProjectiles.find((s) => s.type === 'rock')!;
    expect(rock.vx).toBe(0);
    expect(rock.vy).toBeGreaterThan(0);
  });

  it('never has more than two rocks in the air', () => {
    const { world, b } = inArena('hard');
    for (let i = 0; i < 300; i++) {
      b.dropTimer = 1;
      step(world);
      expect(rocks(world)).toBeLessThanOrEqual(PTERO_MAX_ROCKS);
    }
  });

  it('flies up out of sight when hit, calls zombie dinos, and comes back a round faster', () => {
    const { world, b } = inArena();
    landOn(world, b);
    const zombies = world.enemies.filter((e) => e.alive && e.zombie);
    expect(zombies.length).toBe(PTERO_MAX_ZOMBIES);
    expect(zombies.every((e) => e.type === 'dino')).toBe(true);
    const y0 = b.y;
    step(world, {}, 10);
    expect(b.y).toBeLessThan(y0);
    step(world, {}, PTERO_HURT_FRAMES);
    expect(b.phase).toBe('flying');
    expect(b.round).toBe(1);
  });

  it('is beaten by three landings, and takes her zombies with her', () => {
    const { world, b } = inArena();
    for (let i = 0; i < PTERO_HP; i++) {
      if (b.phase === 'hurt') step(world, {}, PTERO_HURT_FRAMES + 1);
      landOn(world, b);
    }
    expect(b.phase).toBe('defeated');
    expect(world.enemies.some((e) => e.alive)).toBe(false);
  });

  it('keeps the sibling caged until she is beaten', () => {
    const { world, b } = inArena();
    standAt(world, 36, 23);
    step(world);
    expect(world.won).toBe(false);
    b.phase = 'defeated';
    step(world);
    expect(world.won).toBe(true);
  });
});
