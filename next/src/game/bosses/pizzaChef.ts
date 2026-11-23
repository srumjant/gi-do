import { TILE } from '../../config/constants';
import type { DifficultyRecord } from '../../config/difficulty';
import type { BossDef } from '../../data/levels';
import { chickenify, spawnEnemy } from '../enemy';
import { boxHitsSolid, rectOverlap } from '../tiles';
import type { EnemyProjectile, World } from '../types';

/**
 * Pitsakokk, the Pizza Chef, Palermo's boss
 * (docs/superpowers/specs/2026-11-22-three-levels-and-a-boss-design.md): a cook at his oven in
 * the cathedral square, guarded by giants, tossing pizzas.
 *
 * While a giant stands, or one he has called has not come yet, he bats a chicken ray away with
 * his peel; the ray makes a chicken of the giant instead. With no giant left, a ray turns HIM into a big chicken in a chef's hat, who
 * runs about the square for a few seconds; jump on the chicken for a hit. Then he pops back,
 * sits dazed, walks back to his oven and calls the next giants. Not caught in time, he pops
 * back unhurt. His touch never hurts; only the pizzas do. Three hits and he is beaten.
 *
 * Pure, like the rest of src/game/: gfx/pizzaChef.ts draws him and drains `fx`.
 */

export const CHEF_HP = 3;
/** The cook: the 16x24 sprite at 2. Three tiles tall. */
export const CHEF_W = 32;
export const CHEF_H = 48;
/** The chicken he turns into: a 16x14 bird at 2, the hat on top. */
export const CHEF_CHICKEN_W = 32;
export const CHEF_CHICKEN_H = 28;
/** How long he sits dazed after a hit. */
export const CHEF_HURT_FRAMES = 90;
/** How fast he walks back to his oven, in pixels a frame. */
export const CHEF_WALK_SPEED = 1.2;
/** Giants he calls, round by round. */
export const GIANTS_BY_ROUND = [1, 2, 2] as const;
export const CHEF_MAX_PIZZAS = 2;
/** How high a pizza flies over his hand, in pixels. */
export const PIZZA_ARC = 4 * TILE;
/** A pizza's box: the projectile pass's own 8x8. */
export const PIZZA_SIZE = 8;
/** Where a giant stands, in tiles left of his oven: the first free one, nearest first. */
const GIANT_SPOTS = [4, 8, 12];
/** How far he stops short of the patrol end, cornered as a chicken, before he dashes back. */
const DASH_FRAMES = 50;

export type ChefPhase = 'asleep' | 'cooking' | 'chicken' | 'hurt' | 'returning' | 'defeated';

/** Something worth showing (gfx/pizzaChef.ts). Positions in pixels. */
export interface ChefFx {
  kind: 'wake' | 'throw' | 'swat' | 'poof' | 'hit' | 'bonk' | 'giant' | 'defeat';
  x: number;
  y: number;
}

export interface PizzaChefState {
  kind: 'pizzaChef';
  x: number;
  y: number;
  w: number;
  h: number;
  facing: 1 | -1;
  /** The square's floor, in pixels. */
  floorY: number;
  /** His oven: where he cooks, as his `x`. */
  home: number;
  /** How far left and right he runs, as his `x`, in pixels. */
  patrol: [number, number];
  hp: number;
  /** Hits taken: 0, 1, 2. Each round more giants, quicker pizzas, a shorter chicken. */
  round: number;
  phase: ChefPhase;
  /** Frames left as a chicken, or dazed. */
  timer: number;
  /** Frames to his next pizza. */
  throwTimer: number;
  /** Giants still to call, when the hero stops standing where they go. */
  giantsDue: number;
  /** As a chicken, cornered: frames left before he dashes back past the hero; dashing, negative. */
  corner: number;
  /** Counts up while he moves; his step follows it. */
  step: number;
  fx: ChefFx[];
}

/** Frames between pizzas. */
export function throwInterval(dc: DifficultyRecord, round: number): number {
  return Math.max(70, Math.round(dc.enemyShootInterval * 1.2) - round * 20);
}

/** Frames a pizza is in the air. */
export function pizzaFlight(dc: DifficultyRecord): number {
  return Math.round(110 / (1 + dc.enemySpeed));
}

/** Frames he stays a chicken. */
export function chickenFrames(dc: DifficultyRecord, round: number): number {
  return Math.max(180, Math.round(780 / (1 + dc.enemySpeed)) - round * 60);
}

/** How fast he runs as a chicken: always slower than the hero. */
export function chickenSpeed(dc: DifficultyRecord, round: number): number {
  return 0.8 + 0.6 * dc.enemySpeed + 0.2 * round;
}

export function buildPizzaChef(def: BossDef, dc: DifficultyRecord): PizzaChefState {
  const floorY = def.y * TILE;
  const home = def.x * TILE + TILE / 2 - CHEF_W / 2;
  return {
    kind: 'pizzaChef',
    x: home,
    y: floorY - CHEF_H,
    w: CHEF_W,
    h: CHEF_H,
    facing: -1,
    floorY,
    home,
    patrol: [def.patrol[0] * TILE, def.patrol[1] * TILE - CHEF_W],
    hp: CHEF_HP,
    round: 0,
    phase: 'asleep',
    timer: 0,
    throwTimer: throwInterval(dc, 0),
    giantsDue: 0,
    corner: 0,
    step: 0,
    fx: [],
  };
}

function pushFx(b: PizzaChefState, fx: ChefFx): void {
  if (b.fx.length >= 32) b.fx.shift();
  b.fx.push(fx);
}

const pizzas = (world: World): EnemyProjectile[] => world.enemyProjectiles.filter((s) => s.type === 'pizza');
const giants = (world: World) => world.enemies.filter((e) => e.alive && e.type === 'giant');

/** His size as a cook or as a chicken, feet on the floor, keeping his middle where it is. */
function resize(b: PizzaChefState, w: number, h: number): void {
  b.x += (b.w - w) / 2;
  b.w = w;
  b.h = h;
  b.y = b.floorY - h;
}

/**
 * The giants still due, each on the first free spot in front of his oven, and only between the
 * hero and him: never on the hero, never behind them (browser, 2026-11-23: two giants came down
 * either side of a hero and boxed them in under his pizzas). With no room, they wait.
 */
function callGiants(world: World, b: PizzaChefState): void {
  const p = world.player;
  const homeCol = Math.round(b.home / TILE);
  for (const offset of GIANT_SPOTS) {
    if (b.giantsDue <= 0) return;
    const col = homeCol - offset;
    const e = spawnEnemy(world.map, world.dc, { type: 'giant', x: col, floorRow: b.floorY / TILE });
    if (!e || e.x < b.patrol[0]) continue;
    const taken = giants(world).some((g) => rectOverlap(g, e));
    const room = e.x >= p.x + p.w + TILE;
    if (taken || !room) continue;
    world.enemies.push(e);
    b.giantsDue--;
    world.sounds.push('stomp');
    pushFx(b, { kind: 'giant', x: e.x + e.w / 2, y: b.floorY });
  }
}

/** A pizza, lobbed so it comes down where the hero stands now. */
function toss(world: World, b: PizzaChefState): void {
  if (pizzas(world).length >= CHEF_MAX_PIZZAS) return;
  const p = world.player;
  const t = pizzaFlight(world.dc);
  const x0 = b.facing < 0 ? b.x : b.x + b.w - PIZZA_SIZE;
  const y0 = b.y + 14;
  const landX = p.x + p.w / 2 - PIZZA_SIZE / 2;
  const landY = b.floorY - PIZZA_SIZE;
  const ay = (8 * PIZZA_ARC) / (t * t);
  world.enemyProjectiles.push({
    x: x0,
    y: y0,
    vx: (landX - x0) / t,
    vy: (landY - y0 - (ay * t * t) / 2) / t,
    ay,
    life: t + 40,
    type: 'pizza',
  });
  world.sounds.push('jump');
  pushFx(b, { kind: 'throw', x: x0, y: y0 });
}

function defeat(world: World, b: PizzaChefState): void {
  b.phase = 'defeated';
  resize(b, CHEF_W, CHEF_H);
  world.score += Math.round(1000 * world.dc.scoreMultiplier);
  world.sounds.push('win');
  world.enemyProjectiles = world.enemyProjectiles.filter((s) => s.type !== 'pizza');
  for (const g of giants(world)) chickenify(g);
  pushFx(b, { kind: 'defeat', x: b.x + b.w / 2, y: b.y + b.h / 2 });
}

/** A stomp on the chicken: he pops back into himself, dazed. */
function hit(world: World, b: PizzaChefState): void {
  b.hp--;
  world.score += Math.round(500 * world.dc.scoreMultiplier);
  world.sounds.push('stomp', 'boing', 'boss-roar');
  world.rumbles.push({ strong: 0.5, weak: 0.5, dur: 120 });
  pushFx(b, { kind: 'hit', x: b.x + b.w / 2, y: b.y + b.h / 2 });
  if (b.hp <= 0) {
    defeat(world, b);
    return;
  }
  resize(b, CHEF_W, CHEF_H);
  b.round = CHEF_HP - b.hp;
  b.phase = 'hurt';
  b.timer = CHEF_HURT_FRAMES;
  b.giantsDue = GIANTS_BY_ROUND[b.round];
}

/** Turned into a chicken by a ray. */
function turn(world: World, b: PizzaChefState): void {
  b.phase = 'chicken';
  b.timer = chickenFrames(world.dc, b.round);
  b.corner = 0;
  resize(b, CHEF_CHICKEN_W, CHEF_CHICKEN_H);
  world.sounds.push('cluck');
  pushFx(b, { kind: 'poof', x: b.x + b.w / 2, y: b.y + b.h / 2 });
}

/**
 * Rays and arrows that reach him (the ones that hit a giant or anything else first are spent
 * already: world.ts flies them before he steps). Cooking with no giant up, a ray turns him;
 * anything else he bats away with his peel, or, as a chicken, it just ruffles him.
 */
function arrows(world: World, b: PizzaChefState): void {
  for (const a of world.arrows) {
    if (a.life <= 0 || !rectOverlap({ x: a.x, y: a.y, w: 12, h: 4 }, b)) continue;
    a.life = 0;
    if (b.phase === 'chicken') {
      world.sounds.push('cluck');
    } else if (a.isChicken && b.phase === 'cooking' && giants(world).length === 0 && b.giantsDue === 0) {
      turn(world, b);
    } else {
      world.sounds.push('block');
      pushFx(b, { kind: 'swat', x: a.x, y: a.y });
    }
  }
  world.arrows = world.arrows.filter((a) => a.life > 0);
}

/** As a chicken, he runs from the hero; cornered a while, he dashes back past them. */
function runAbout(world: World, b: PizzaChefState): void {
  const p = world.player;
  const speed = chickenSpeed(world.dc, b.round);
  const [left, right] = b.patrol;
  let dir: number;
  if (b.corner < 0) {
    dir = b.facing;
    b.corner++;
  } else {
    dir = p.x + p.w / 2 < b.x + b.w / 2 ? 1 : -1;
  }
  b.x = Math.min(right, Math.max(left, b.x + dir * speed));
  b.facing = dir > 0 ? 1 : -1;
  b.step++;
  const cornered = b.corner >= 0 && (b.x <= left || b.x >= right);
  if (!cornered) return;
  if (++b.corner < cornerFrames(world.dc)) return;
  // Out past the hero, the way he came.
  b.facing = b.x <= left ? 1 : -1;
  b.corner = -DASH_FRAMES;
}

/** Frames he waits in a corner before he dashes out: longer on Super Easy. */
export function cornerFrames(dc: DifficultyRecord): number {
  return Math.round(60 / dc.enemySpeed);
}

/** Back to his oven; there, the next round's giants. */
function walkHome(world: World, b: PizzaChefState): void {
  const d = b.home - b.x;
  if (Math.abs(d) > CHEF_WALK_SPEED) {
    b.x += Math.sign(d) * CHEF_WALK_SPEED;
    b.facing = d > 0 ? 1 : -1;
    b.step++;
    return;
  }
  b.x = b.home;
  b.facing = -1;
  b.phase = 'cooking';
  b.throwTimer = throwInterval(world.dc, b.round);
}

/** Touching him: as a chicken, a stomp is a hit and the rest is nothing; as a cook, never harm. */
function contact(world: World, b: PizzaChefState): void {
  const p = world.player;
  if (!rectOverlap(p, b)) return;
  const fromLeft = p.x + p.w / 2 < b.x + b.w / 2;
  const landing = p.vy > 0 && p.y + p.h - 8 < b.y + b.h / 2;
  if (b.phase === 'chicken') {
    if (!landing) return;
    p.vy = -7;
    p.y = b.y - p.h;
    hit(world, b);
    return;
  }
  if (landing) {
    // His hat is no step: off it, to the side nearer.
    p.vy = -6;
    p.y = b.y - p.h;
    p.vx = fromLeft ? -3 : 3;
    world.sounds.push('boing');
    pushFx(b, { kind: 'bonk', x: p.x + p.w / 2, y: b.y });
    return;
  }
  const pushedX = fromLeft ? b.x - p.w - 1 : b.x + b.w + 1;
  if (!boxHitsSolid(world.map, { x: pushedX, y: p.y, w: p.w, h: p.h })) {
    p.x = pushedX;
    p.vx = fromLeft ? -3 : 3;
  } else {
    p.vx = 0;
  }
}

export function stepPizzaChef(world: World, b: PizzaChefState): void {
  if (b.phase === 'defeated') return;
  // His pizzas fall: the projectile pass flies them straight, so the arc is his.
  for (const s of pizzas(world)) s.vy += s.ay ?? 0;
  const p = world.player;
  switch (b.phase) {
    case 'asleep':
      if (p.x + p.w / 2 > b.patrol[0]) {
        b.phase = 'cooking';
        b.giantsDue = GIANTS_BY_ROUND[0];
        world.sounds.push('boss-roar');
        pushFx(b, { kind: 'wake', x: b.x + b.w / 2, y: b.y });
        callGiants(world, b);
      }
      return;
    case 'cooking':
      b.facing = p.x + p.w / 2 < b.x + b.w / 2 ? -1 : 1;
      if (b.giantsDue > 0) callGiants(world, b);
      if (--b.throwTimer <= 0) {
        toss(world, b);
        b.throwTimer = throwInterval(world.dc, b.round);
      }
      break;
    case 'chicken':
      runAbout(world, b);
      if (--b.timer <= 0) {
        // Not caught: he pops back, unhurt, and goes back to his oven.
        resize(b, CHEF_W, CHEF_H);
        b.phase = 'returning';
        world.sounds.push('boss-roar');
        pushFx(b, { kind: 'poof', x: b.x + b.w / 2, y: b.y + b.h / 2 });
      }
      break;
    case 'hurt':
      if (--b.timer <= 0) b.phase = 'returning';
      break;
    case 'returning':
      walkHome(world, b);
      break;
  }
  arrows(world, b);
  contact(world, b);
}
