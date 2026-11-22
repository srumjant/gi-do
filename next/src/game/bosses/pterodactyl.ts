import { TILE } from '../../config/constants';
import type { DifficultyRecord } from '../../config/difficulty';
import type { BossDef } from '../../data/levels';
import { spawnEnemy } from '../enemy';
import { rectOverlap } from '../tiles';
import type { World } from '../types';

/**
 * The Pterodactyl, Dinosaur Canyon's boss (docs/superpowers/specs/2026-11-22-three-levels-and-a-boss-design.md).
 *
 * She flies back and forth over the arena, PTERO_ALTITUDE above the floor: no plain jump
 * reaches her back on any difficulty, a fart jump does on every one, so the theme's tool is the
 * way to beat her. Landing on her back is a hit. A hero jumping up under her passes up through
 * her and lands on her back on the way down: a child jumps when she is overhead, and found in
 * the browser (2026-11-22), bouncing off her belly made that the one jump that never worked.
 * Touching her side on the way down just pushes the hero off, unharmed. She drops rocks straight
 * down, with a shadow on the floor first, and after each hit she flies up out of sight, calls
 * zombie dinos and comes back faster. Three hits.
 *
 * Pure, like the rest of src/game/: gfx/pterodactyl.ts draws her and drains `fx`.
 */

export const PTERO_HP = 3;
/** Her body, in pixels: the 24x12 sprite at 2. */
export const PTERO_W = 48;
export const PTERO_H = 24;
/**
 * The bottom of her body, this far above the floor. Her back is then 128px up: hard's plain
 * jump lifts the feet 62px and super easy's 98, every fart jump at least 141.
 */
export const PTERO_ALTITUDE = 104;
/** How long she is gone, up out of sight, after a hit. */
export const PTERO_HURT_FRAMES = 100;
/** Frames of shadow on the floor before a rock drops. */
export const PTERO_WARN_FRAMES = 40;
export const PTERO_MAX_ZOMBIES = 2;
export const PTERO_MAX_ROCKS = 2;

export type PteroPhase = 'asleep' | 'flying' | 'hurt' | 'defeated';

/** Something worth showing (gfx/pterodactyl.ts). Positions in pixels. */
export interface PteroFx {
  kind: 'wake' | 'hit' | 'bounce';
  x: number;
  y: number;
}

export interface PterodactylState {
  kind: 'pterodactyl';
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  facing: 1 | -1;
  /** The arena's floor, in pixels. */
  floorY: number;
  /** How far left and right she flies, as her `x`, in pixels. */
  patrol: [number, number];
  hp: number;
  /** 0, 1, 2: each round faster, dropping more. */
  round: number;
  phase: PteroPhase;
  /** Frames left of being gone after a hit. */
  timer: number;
  /** Frames to her next rock. */
  dropTimer: number;
  /** Counts up while she flies; her bob and her wings follow it. */
  flap: number;
  /** Drained by the scene; capped. */
  fx: PteroFx[];
}

export function flySpeed(dc: DifficultyRecord, round: number): number {
  return Math.max(0.5, dc.enemySpeed) * (0.8 + 0.4 * round);
}

export function dropInterval(dc: DifficultyRecord, round: number): number {
  return Math.max(80, Math.round(dc.enemyShootInterval * 1.4) - round * 30);
}

export function rockSpeed(dc: DifficultyRecord): number {
  return 1.2 + dc.enemySpeed;
}

/** Her body's y while flying: the altitude, bobbing a little. */
function flightY(b: PterodactylState): number {
  return b.floorY - PTERO_ALTITUDE - b.h + Math.sin(b.flap * 0.06) * 4;
}

export function buildPterodactyl(def: BossDef, dc: DifficultyRecord): PterodactylState {
  const floorY = def.y * TILE;
  const b: PterodactylState = {
    kind: 'pterodactyl',
    x: def.x * TILE + TILE / 2 - PTERO_W / 2,
    y: 0,
    w: PTERO_W,
    h: PTERO_H,
    vx: 0,
    facing: -1,
    floorY,
    patrol: [def.patrol[0] * TILE, def.patrol[1] * TILE - PTERO_W],
    hp: PTERO_HP,
    round: 0,
    phase: 'asleep',
    timer: 0,
    dropTimer: dropInterval(dc, 0),
    flap: 0,
    fx: [],
  };
  b.y = flightY(b);
  return b;
}

/** Whether a rock is about to drop: the scene shows its shadow on the floor. */
export function rockWarning(b: PterodactylState): boolean {
  return b.phase === 'flying' && b.dropTimer <= PTERO_WARN_FRAMES;
}

function pushFx(b: PterodactylState, fx: PteroFx): void {
  if (b.fx.length >= 32) b.fx.shift();
  b.fx.push(fx);
}

/** Two zombie dinos from the ends of her flight, never more than PTERO_MAX_ZOMBIES up. */
function callZombies(world: World, b: PterodactylState): void {
  const floorRow = b.floorY / TILE;
  const up = world.enemies.filter((e) => e.alive && e.zombie).length;
  for (const x of [b.patrol[1] + b.w, b.patrol[0]].slice(0, Math.max(0, PTERO_MAX_ZOMBIES - up))) {
    const e = spawnEnemy(world.map, world.dc, { type: 'dino', x: Math.floor(x / TILE), floorRow, zombie: true });
    if (e) world.enemies.push(e);
  }
}

function defeat(world: World, b: PterodactylState): void {
  b.phase = 'defeated';
  world.score += Math.round(1000 * world.dc.scoreMultiplier);
  world.sounds.push('win');
  for (const e of world.enemies) {
    if (!e.alive || !e.zombie) continue;
    e.alive = false;
    e.squashTimer = 30;
  }
}

function hit(world: World, b: PterodactylState): void {
  b.hp--;
  world.score += Math.round(500 * world.dc.scoreMultiplier);
  world.sounds.push('stomp', 'boss-roar');
  pushFx(b, { kind: 'hit', x: b.x + b.w / 2, y: b.y + b.h / 2 });
  if (b.hp <= 0) {
    defeat(world, b);
    return;
  }
  b.phase = 'hurt';
  b.timer = PTERO_HURT_FRAMES;
  callZombies(world, b);
}

function fly(world: World, b: PterodactylState): void {
  const speed = flySpeed(world.dc, b.round);
  b.vx = (b.vx < 0 ? -1 : 1) * speed;
  b.x += b.vx;
  if (b.x <= b.patrol[0]) {
    b.x = b.patrol[0];
    b.vx = speed;
  }
  if (b.x >= b.patrol[1]) {
    b.x = b.patrol[1];
    b.vx = -speed;
  }
  b.facing = b.vx < 0 ? -1 : 1;
  b.flap++;
  b.y = flightY(b);

  if (--b.dropTimer > 0) return;
  b.dropTimer = dropInterval(world.dc, b.round);
  if (world.enemyProjectiles.filter((s) => s.type === 'rock').length >= PTERO_MAX_ROCKS) return;
  world.enemyProjectiles.push({
    x: b.x + b.w / 2 - 4,
    y: b.y + b.h,
    vx: 0,
    vy: rockSpeed(world.dc),
    life: 400,
    type: 'rock',
  });
  world.sounds.push('boss-fire');
}

/** Arrows bounce off her: only landing on her back counts. */
function arrows(world: World, b: PterodactylState): void {
  for (const a of world.arrows) {
    if (a.life <= 0 || !rectOverlap({ x: a.x, y: a.y, w: 12, h: 4 }, b)) continue;
    a.life = 0;
    world.sounds.push('block');
    pushFx(b, { kind: 'bounce', x: a.x, y: a.y });
  }
  world.arrows = world.arrows.filter((a) => a.life > 0);
}

/**
 * Landing on her back is a hit. On the way up the hero passes through her, so a jump from right
 * under her comes down on her back; on the way down, a touch below her back pushes the hero off
 * her side, unharmed.
 */
function contact(world: World, b: PterodactylState): void {
  const p = world.player;
  if (p.vy <= 0 || !rectOverlap(p, b)) return;
  if (p.y + p.h - 6 < b.y + b.h / 2) {
    p.vy = -7;
    hit(world, b);
    return;
  }
  const fromLeft = p.x + p.w / 2 < b.x + b.w / 2;
  p.x = fromLeft ? b.x - p.w - 1 : b.x + b.w + 1;
  p.vx = fromLeft ? -3 : 3;
  world.sounds.push('boing');
  pushFx(b, { kind: 'bounce', x: p.x + p.w / 2, y: p.y });
}

/** One step of her, after the course and the enemies (game/world.ts's stepWorld). */
export function stepPterodactyl(world: World, b: PterodactylState): void {
  const p = world.player;
  switch (b.phase) {
    case 'defeated':
      return;
    case 'asleep':
      b.flap++;
      b.y = flightY(b);
      if (p.x + p.w / 2 > b.patrol[0]) {
        b.phase = 'flying';
        world.sounds.push('boss-roar');
        pushFx(b, { kind: 'wake', x: b.x + b.w / 2, y: b.y });
      }
      return;
    case 'hurt':
      // Up out of sight, then back, faster.
      b.y -= 3;
      if (--b.timer > 0) return;
      b.round++;
      b.phase = 'flying';
      b.y = flightY(b);
      world.sounds.push('boss-roar');
      return;
    case 'flying':
      fly(world, b);
      break;
  }
  arrows(world, b);
  contact(world, b);
}
