import { TILE } from '../../config/constants';
import type { DifficultyRecord } from '../../config/difficulty';
import type { BossDef } from '../../data/levels';
import { spawnEnemy } from '../enemy';
import { playerHit } from '../player';
import { boxHitsSolid, rectOverlap } from '../tiles';
import type { Rect, World } from '../types';

/**
 * The Doll Queen, Doll Garden's boss (docs/superpowers/specs/2026-11-22-three-levels-and-a-boss-design.md).
 *
 * A doll three times the hero's height under a big parasol. The parasol turns arrows and stomps
 * away; a target stands somewhere in the room, and shooting it knocks the parasol off. She sits
 * down dizzy for a while, and a stomp or an arrow then costs her a heart. Three hearts. Each
 * round's target stands somewhere harder (the level's spots 1, 2, 3: low, high, far) and she
 * walks and throws faster. She throws hearts, which drift across the room at a standing hero's
 * height, and calls two zombies each time she is hit.
 *
 * Pure, like the rest of src/game/: gfx/dollQueen.ts draws her from this state and drains `fx`.
 */

export const QUEEN_HP = 3;
/** Her body, in pixels: the 12x18 sprite at 4, less a little at each side. */
export const QUEEN_W = 40;
export const QUEEN_H = 72;
/** Sitting down dizzy: low enough that a held jump on every difficulty reaches her head. */
export const QUEEN_SIT_H = 48;
/** How long she reels after a hit, untouchable, before the next round. */
export const QUEEN_HURT_FRAMES = 60;

const TARGET_W = 22;
const TARGET_H = 68;
/** A heart's height above the floor: a standing hero's chest, so a child jumps it or shoots it. */
const HEART_HEIGHT = 20;

export type QueenPhase = 'asleep' | 'shielded' | 'dizzy' | 'hurt' | 'defeated';

/** Something worth showing (gfx/dollQueen.ts). Positions in pixels. */
export interface QueenFx {
  kind: 'wake' | 'target' | 'hit' | 'clang';
  x: number;
  y: number;
}

export interface DollQueenState {
  kind: 'dollQueen';
  /** Her body's box: standing, or sitting when dizzy. */
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  facing: 1 | -1;
  /** The floor she stands on, in pixels. */
  floorY: number;
  /** How far left and right her walk goes, as her `x`, in pixels. */
  patrol: [number, number];
  hp: number;
  /** 0, 1, 2: which spot this round's target stands on. */
  round: number;
  phase: QueenPhase;
  /** Frames left of being dizzy, or of reeling from a hit. */
  timer: number;
  /** Frames to her next throw. */
  throwTimer: number;
  /** Each round's target box, in pixels. */
  spots: Rect[];
  /** Whether this round's target is standing. */
  targetUp: boolean;
  /** Drained by the scene; capped, so a driver that never drains it cannot grow it forever. */
  fx: QueenFx[];
}

export function walkSpeed(dc: DifficultyRecord, round: number): number {
  return 0.6 * dc.enemySpeed * (1 + 0.35 * round);
}

export function throwInterval(dc: DifficultyRecord, round: number): number {
  return Math.max(70, Math.round(dc.enemyShootInterval * 1.3) - round * 25);
}

export function heartSpeed(dc: DifficultyRecord, round: number): number {
  return 1.1 * dc.enemySpeed * (1 + 0.25 * round);
}

/** About ten seconds on super easy, three to five elsewhere. */
export function dizzyFrames(dc: DifficultyRecord): number {
  return Math.round(180 + 120 / dc.enemySpeed);
}

export function buildDollQueen(def: BossDef, dc: DifficultyRecord): DollQueenState {
  if (def.spots.length === 0) throw new Error('the Doll Queen needs her target spots, 1, 2, 3');
  const floorY = def.y * TILE;
  return {
    kind: 'dollQueen',
    x: def.x * TILE + TILE / 2 - QUEEN_W / 2,
    y: floorY - QUEEN_H,
    w: QUEEN_W,
    h: QUEEN_H,
    vx: 0,
    facing: -1,
    floorY,
    patrol: [def.patrol[0] * TILE, def.patrol[1] * TILE - QUEEN_W],
    hp: QUEEN_HP,
    round: 0,
    phase: 'asleep',
    timer: 0,
    throwTimer: throwInterval(dc, 0),
    spots: def.spots.map((s) => ({
      x: s.x * TILE + (TILE - TARGET_W) / 2,
      y: (s.y + 1) * TILE - TARGET_H,
      w: TARGET_W,
      h: TARGET_H,
    })),
    targetUp: false,
    fx: [],
  };
}

/** This round's target box. */
export function currentSpot(q: DollQueenState): Rect {
  return q.spots[Math.min(q.round, q.spots.length - 1)];
}

function pushFx(q: DollQueenState, fx: QueenFx): void {
  if (q.fx.length >= 32) q.fx.shift();
  q.fx.push(fx);
}

function centre(q: DollQueenState): { x: number; y: number } {
  return { x: q.x + q.w / 2, y: q.y + q.h / 2 };
}

/** On her feet, parasol up, this round's target standing. */
function standUp(q: DollQueenState): void {
  q.phase = 'shielded';
  q.h = QUEEN_H;
  q.y = q.floorY - q.h;
  q.targetUp = true;
}

function sitDown(world: World, q: DollQueenState): void {
  q.phase = 'dizzy';
  q.timer = dizzyFrames(world.dc);
  q.targetUp = false;
  q.vx = 0;
  q.h = QUEEN_SIT_H;
  q.y = q.floorY - q.h;
  world.sounds.push('win', 'boing');
}

/** The most of her zombies up at once, and of her hearts in the air at once. */
export const QUEEN_MAX_ZOMBIES = 2;
export const QUEEN_MAX_HEARTS = 2;

/**
 * Zombie dolls from the ends of her walk, the far end first, never more than
 * QUEEN_MAX_ZOMBIES up at once. Uncapped, by the last round on hard four of them shoved the
 * hero into the corner while her hearts came: not hard, just unreadable (browser, 2026-11-22).
 */
function callZombies(world: World, q: DollQueenState): void {
  const floorRow = q.floorY / TILE;
  const up = world.enemies.filter((e) => e.alive && e.zombie).length;
  for (const x of [q.patrol[1] + q.w, q.patrol[0]].slice(0, Math.max(0, QUEEN_MAX_ZOMBIES - up))) {
    const e = spawnEnemy(world.map, world.dc, { type: 'doll', x: Math.floor(x / TILE), floorRow, zombie: true });
    if (e) world.enemies.push(e);
  }
}

function hit(world: World, q: DollQueenState): void {
  q.hp--;
  q.phase = 'hurt';
  q.timer = QUEEN_HURT_FRAMES;
  world.score += Math.round(500 * world.dc.scoreMultiplier);
  world.sounds.push('stomp', 'boss-roar');
  pushFx(q, { kind: 'hit', ...centre(q) });
  if (q.hp > 0) callZombies(world, q);
}

function defeat(world: World, q: DollQueenState): void {
  q.phase = 'defeated';
  q.targetUp = false;
  world.score += Math.round(1000 * world.dc.scoreMultiplier);
  world.sounds.push('win');
  // Her zombies go with her.
  for (const e of world.enemies) {
    if (!e.alive || !e.zombie) continue;
    e.alive = false;
    e.squashTimer = 30;
  }
}

function walkAndThrow(world: World, q: DollQueenState): void {
  const p = world.player;
  const speed = walkSpeed(world.dc, q.round);
  q.vx = (q.vx < 0 ? -1 : 1) * speed;
  q.x += q.vx;
  if (q.x <= q.patrol[0]) {
    q.x = q.patrol[0];
    q.vx = speed;
  }
  if (q.x >= q.patrol[1]) {
    q.x = q.patrol[1];
    q.vx = -speed;
  }
  q.facing = p.x + p.w / 2 < q.x + q.w / 2 ? -1 : 1;

  if (--q.throwTimer > 0) return;
  q.throwTimer = throwInterval(world.dc, q.round);
  if (world.enemyProjectiles.filter((s) => s.type === 'heart').length >= QUEEN_MAX_HEARTS) return;
  world.enemyProjectiles.push({
    x: q.x + q.w / 2 + q.facing * (q.w / 2 + 4),
    y: q.floorY - HEART_HEIGHT,
    vx: q.facing * heartSpeed(world.dc, q.round),
    vy: 0,
    life: 900,
    type: 'heart',
  });
  world.sounds.push('boss-fire');
}

/** Arrows: her target first, then her — turned away by the parasol, or a hit while she sits. */
function arrows(world: World, q: DollQueenState): void {
  const target = currentSpot(q);
  for (const a of world.arrows) {
    if (a.life <= 0) continue;
    const box = { x: a.x, y: a.y, w: 12, h: 4 };
    if (q.phase === 'shielded' && q.targetUp && rectOverlap(box, target)) {
      a.life = 0;
      pushFx(q, { kind: 'target', x: target.x + target.w / 2, y: target.y });
      sitDown(world, q);
      continue;
    }
    if (!rectOverlap(box, q)) continue;
    a.life = 0;
    if (q.phase === 'dizzy') {
      hit(world, q);
      break;
    }
    world.sounds.push('block');
    pushFx(q, { kind: 'clang', x: a.x, y: a.y });
  }
  world.arrows = world.arrows.filter((a) => a.life > 0);
}

/**
 * The hero touching her. From above: a stomp while she sits dizzy is a hit; while her parasol
 * is up it just bounces the hero off. From the side: pushed away, and hurt unless she is sitting.
 * Stomps work through a cape's blink; only the hurting waits for it.
 */
function contact(world: World, q: DollQueenState): void {
  const p = world.player;
  if (!rectOverlap(p, q)) return;
  const fromAbove = p.vy > 0 && p.y + p.h - 6 < q.y + q.h / 2;
  if (fromAbove) {
    p.vy = -6;
    if (q.phase === 'dizzy') {
      hit(world, q);
    } else {
      world.sounds.push('boing');
      pushFx(q, { kind: 'clang', x: p.x + p.w / 2, y: q.y });
    }
    return;
  }
  const fromLeft = p.x + p.w / 2 < q.x + q.w / 2;
  const pushedX = fromLeft ? q.x - p.w - 1 : q.x + q.w + 1;
  // Never into a wall (see enemy.ts's zombie push).
  if (!boxHitsSolid(world.map, { x: pushedX, y: p.y, w: p.w, h: p.h })) p.x = pushedX;
  p.vx = fromLeft ? -3 : 3;
  if (q.phase === 'shielded' && p.invincible <= 0) playerHit(world);
}

/** One step of her, after the course and the enemies (game/world.ts's stepWorld). */
export function stepDollQueen(world: World, q: DollQueenState): void {
  const p = world.player;
  switch (q.phase) {
    case 'defeated':
      return;
    case 'asleep':
      if (p.x + p.w / 2 > q.patrol[0]) {
        world.sounds.push('boss-roar');
        pushFx(q, { kind: 'wake', ...centre(q) });
        standUp(q);
      }
      return;
    case 'hurt':
      if (--q.timer > 0) return;
      if (q.hp <= 0) {
        defeat(world, q);
        return;
      }
      q.round++;
      world.sounds.push('boss-roar');
      standUp(q);
      return;
    case 'dizzy':
      if (--q.timer <= 0) {
        world.sounds.push('boss-roar');
        standUp(q);
        return;
      }
      break;
    case 'shielded':
      walkAndThrow(world, q);
      break;
  }
  arrows(world, q);
  if (q.phase === 'shielded' || q.phase === 'dizzy') contact(world, q);
}
