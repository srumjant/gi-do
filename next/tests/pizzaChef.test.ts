import { describe, expect, it } from 'vitest';
import { quietWorld, standAt, step } from './helpers/courseRuns';
import { TILE } from '../src/config/constants';
import { DIFF_KEYS, DIFFICULTY_CONFIG, type DifficultyKey } from '../src/config/difficulty';
import { courseLevel } from '../src/data/course';
import {
  CHEF_HP, CHEF_HURT_FRAMES, CHEF_MAX_PIZZAS, chickenFrames, chickenSpeed, GIANTS_BY_ROUND,
  PIZZA_SIZE, pizzaFlight, throwInterval, type PizzaChefState,
} from '../src/game/bosses/pizzaChef';
import type { World } from '../src/game/types';

/** A square in miniature: a door, the Pizza Chef at his oven, the cage at the far end. */
function square(): string[] {
  const rows = Array.from({ length: 25 }, () => '.'.repeat(40));
  const set = (x: number, y: number, ch: string) => { rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1); };
  rows[23] = '#'.repeat(40);
  rows[24] = '#'.repeat(40);
  set(1, 20, 'P');
  for (let y = 17; y <= 22; y++) set(3, y, ':');
  set(30, 22, 'Q');
  set(37, 22, 'R');
  return rows;
}
const SQUARE = courseLevel({ name: 'square', theme: 3, ending: 'boss', boss: 'pizzaChef', sections: [square()] });

const giants = (world: World) => world.enemies.filter((e) => e.alive && e.type === 'giant');
const pizzas = (world: World) => world.enemyProjectiles.filter((s) => s.type === 'pizza');

/** In the square with him awake, no pizza coming unless a test says, the hero safe unless a test says. */
function inSquare(difficulty: DifficultyKey = 'super_easy'): { world: World; b: PizzaChefState } {
  const world = quietWorld(SQUARE, difficulty);
  standAt(world, 9, 23);
  world.player.invincible = 99999;
  step(world);
  const b = world.courseBoss as PizzaChefState;
  b.throwTimer = 99999;
  return { world, b };
}

/** A chicken ray, flying into `box` from its left. */
function ray(world: World, box: { x: number; y: number; h: number }): void {
  world.arrows.push({ x: box.x - 8, y: box.y + box.h - 12, vx: 6, life: 60, isChicken: true });
}

/** Ray every giant into a chicken, then the chef: he is a chicken. */
function turnHim(world: World, b: PizzaChefState): void {
  for (const g of giants(world)) {
    ray(world, g);
    step(world);
  }
  ray(world, b);
  step(world);
}

/** Drop the hero onto him. */
function landOn(world: World, b: PizzaChefState): void {
  const p = world.player;
  p.x = b.x + b.w / 2 - p.w / 2;
  p.y = b.y - p.h + 3;
  p.vy = 4;
  p.onGround = false;
  step(world);
}

describe('the Pizza Chef', () => {
  it('waits at his oven until the hero is in the square, then calls a giant between them', () => {
    const world = quietWorld(SQUARE);
    standAt(world, 2, 23);
    step(world);
    const b = world.courseBoss as PizzaChefState;
    expect(b.phase).toBe('asleep');
    expect(giants(world)).toHaveLength(0);
    standAt(world, 9, 23);
    step(world);
    expect(b.phase).toBe('cooking');
    expect(giants(world)).toHaveLength(GIANTS_BY_ROUND[0]);
    const [g] = giants(world);
    expect(g.x + g.w).toBeLessThanOrEqual(b.x);
    expect(g.x).toBeGreaterThan(world.player.x);
  });

  it('calls his giants only between the hero and himself, never behind the hero', () => {
    // Found in the browser (2026-11-23): two giants came down on either side of a hero and
    // boxed them in under his pizzas.
    for (const col of [9, 16, 20, 24]) {
      const world = quietWorld(SQUARE);
      const b = world.courseBoss as PizzaChefState;
      standAt(world, col, 23);
      step(world);
      b.round = 1;
      b.giantsDue = 2;
      for (const g of giants(world)) g.alive = false;
      step(world);
      const p = world.player;
      for (const g of giants(world)) {
        expect({ col, right: g.x >= p.x + p.w }).toEqual({ col, right: true });
      }
    }
  });

  it('waits for room to call his giants, and bats rays away until they have come', () => {
    const world = quietWorld(SQUARE);
    standAt(world, 27, 23);
    world.player.invincible = 99999;
    step(world);
    const b = world.courseBoss as PizzaChefState;
    b.throwTimer = 99999;
    expect(giants(world)).toHaveLength(0);
    expect(b.giantsDue).toBe(1);
    world.arrows.push({ x: b.x - 8, y: b.y + 30, vx: 6, life: 60, isChicken: true });
    step(world);
    expect(b.phase).toBe('cooking');
    standAt(world, 12, 23);
    step(world);
    expect(giants(world)).toHaveLength(1);
  });

  it('bats a ray away with his peel while a giant stands', () => {
    const { world, b } = inSquare();
    ray(world, b);
    step(world);
    expect(b.phase).toBe('cooking');
    expect(world.sounds).toContain('block');
    expect(world.arrows).toHaveLength(0);
  });

  it('turns into a chicken once his giants are chickens: a smaller box, feet on the floor', () => {
    const { world, b } = inSquare();
    turnHim(world, b);
    expect(giants(world)).toHaveLength(0);
    expect(b.phase).toBe('chicken');
    expect(b.h).toBeLessThan(2 * TILE);
    expect(b.y + b.h).toBe(b.floorY);
  });

  it('as a chicken, runs from the hero, slower than the hero runs, and never hurts', () => {
    for (const key of DIFF_KEYS) {
      const dc = DIFFICULTY_CONFIG[key];
      expect({ key, slower: chickenSpeed(dc, CHEF_HP - 1) < dc.playerSpeed * 0.85 }).toEqual({ key, slower: true });
      const { world, b } = inSquare(key);
      turnHim(world, b);
      const p = world.player;
      p.invincible = 0;
      p.hasCape = false;
      standAt(world, Math.floor(b.x / TILE) - 3, 23);
      const x0 = b.x;
      step(world, {}, 10);
      expect({ key, away: b.x > x0 }).toEqual({ key, away: true });
      p.x = b.x - p.w + 6;
      step(world, {}, 5);
      expect({ key, dead: world.dead }).toEqual({ key, dead: false });
    }
  });

  it('is hit by a stomp on the chicken: dazed, then home to his oven and two giants', () => {
    const { world, b } = inSquare();
    turnHim(world, b);
    landOn(world, b);
    expect(b.hp).toBe(CHEF_HP - 1);
    expect(b.phase).toBe('hurt');
    expect(b.h).toBe(48);
    expect(world.player.vy).toBeLessThan(0);
    standAt(world, 9, 23);
    step(world, {}, CHEF_HURT_FRAMES - 1);
    expect(b.phase).toBe('hurt');
    expect(giants(world)).toHaveLength(0);
    for (let i = 0; i < 600 && b.phase !== 'cooking'; i++) step(world);
    expect(b.phase).toBe('cooking');
    expect(b.x).toBe(b.home);
    step(world);
    expect(giants(world)).toHaveLength(GIANTS_BY_ROUND[1]);
  });

  it('pops back unhurt when the chicken is not caught in time, and calls no giants', () => {
    const { world, b } = inSquare();
    turnHim(world, b);
    step(world, {}, chickenFrames(world.dc, 0));
    expect(b.phase).toBe('returning');
    expect(b.hp).toBe(CHEF_HP);
    for (let i = 0; i < 600 && b.phase !== 'cooking'; i++) step(world);
    step(world);
    expect(giants(world)).toHaveLength(0);
    // And a ray turns him again.
    ray(world, b);
    step(world);
    expect(b.phase).toBe('chicken');
  });

  it('never hurts as a cook: walking into him pushes the hero out, a stomp on his hat bounces off', () => {
    const { world, b } = inSquare();
    for (const g of giants(world)) g.alive = false;
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
    expect(p.vy).toBeLessThan(0);
    expect(b.hp).toBe(CHEF_HP);
  });

  it('tosses a pizza that comes down where the hero stood, and hurts a hero standing there', () => {
    for (const key of DIFF_KEYS) {
      const { world, b } = inSquare(key);
      for (const g of giants(world)) g.alive = false;
      const p = world.player;
      p.invincible = 0;
      p.hasCape = false;
      b.throwTimer = 1;
      step(world);
      expect({ key, up: pizzas(world).length }).toEqual({ key, up: 1 });
      step(world, {}, pizzaFlight(world.dc) + 10);
      expect({ key, dead: world.dead }).toEqual({ key, dead: true });
    }
  });

  it('misses a hero who moves, every difficulty', () => {
    for (const key of DIFF_KEYS) {
      const { world, b } = inSquare(key);
      for (const g of giants(world)) g.alive = false;
      const p = world.player;
      p.invincible = 0;
      p.hasCape = false;
      b.throwTimer = 1;
      step(world);
      b.throwTimer = 99999;
      step(world, { left: true }, pizzaFlight(world.dc) + 20);
      expect({ key, dead: world.dead }).toEqual({ key, dead: false });
    }
  });

  it('loses a pizza to an arrow, and never has more than two up', () => {
    const { world, b } = inSquare();
    b.throwTimer = 1;
    step(world, {}, 20);
    const [pz] = pizzas(world);
    world.arrows.push({ x: pz.x - 2, y: pz.y + 2, vx: 0, life: 60, isChicken: false });
    step(world);
    expect(pizzas(world)).toHaveLength(0);
    for (let i = 0; i < 5; i++) {
      b.throwTimer = 1;
      step(world);
    }
    expect(pizzas(world).length).toBeLessThanOrEqual(CHEF_MAX_PIZZAS);
    expect(PIZZA_SIZE).toBe(8);
  });

  it('is slower and kinder on Super Easy than on Hard', () => {
    const se = DIFFICULTY_CONFIG.super_easy;
    const hard = DIFFICULTY_CONFIG.hard;
    expect(throwInterval(se, 0)).toBeGreaterThan(throwInterval(hard, 0));
    expect(pizzaFlight(se)).toBeGreaterThan(pizzaFlight(hard));
    expect(chickenFrames(se, 0)).toBeGreaterThan(chickenFrames(hard, 0));
    expect(chickenFrames(se, 0)).toBeGreaterThanOrEqual(600);
    expect(chickenSpeed(se, 0)).toBeLessThan(chickenSpeed(hard, 0));
    expect(throwInterval(se, 2)).toBeLessThan(throwInterval(se, 0));
  });

  it('is beaten by three stomps on the chicken: his pizzas go, and the cage opens', () => {
    const { world, b } = inSquare();
    world.enemyProjectiles.push({ x: 20 * TILE, y: 10 * TILE, vx: 0, vy: 0, life: 400, type: 'pizza' });
    for (let i = 0; i < CHEF_HP; i++) {
      for (const g of giants(world)) g.alive = false;
      b.phase = 'cooking';
      b.giantsDue = 0;
      ray(world, b);
      step(world);
      expect(b.phase).toBe('chicken');
      landOn(world, b);
    }
    expect(b.phase).toBe('defeated');
    expect(pizzas(world)).toHaveLength(0);
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
