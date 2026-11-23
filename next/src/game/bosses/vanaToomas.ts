import { TILE } from '../../config/constants';
import type { DifficultyRecord } from '../../config/difficulty';
import type { BossDef } from '../../data/levels';
import { spawnEnemy } from '../enemy';
import { boxHitsSolid, rectOverlap } from '../tiles';
import type { World } from '../types';

/**
 * Vana Toomas, Tallinn's boss (docs/superpowers/specs/2026-11-22-three-levels-and-a-boss-design.md):
 * the knight from the top of the town hall spire, in helmet, breastplate and shield.
 *
 * He marches up and down the square. His armour turns everything but a big head: without one a
 * stomp bounces the hero off with a clang, a side touch pushes them out, arrows clang off, and
 * nothing he does by touch ever hurts. With a big head, landing on him or running into his back
 * knocks a piece of armour off; his front is his shield, and clangs. Now and then he stops,
 * raises his flag pole and stamps it down: a shockwave rolls along the floor both ways, low
 * enough for every jump. While the pole is up he is braced, and even a big head clangs off:
 * the window is while he marches, rare on Super Easy and short on Hard. After each hit he staggers, calls zombie knights and marches faster.
 * Three pieces, and he sits down, beaten.
 *
 * Pure, like the rest of src/game/: gfx/vanaToomas.ts draws him and drains `fx`.
 */

export const TOOMAS_HP = 3;
/** His body, in pixels: the 16x24 sprite at 2. Three tiles tall. */
export const TOOMAS_W = 32;
export const TOOMAS_H = 48;
/** How long he staggers after a hit, with nothing landing on him. */
export const TOOMAS_HURT_FRAMES = 80;
/**
 * How fast he staggers away from the hero, in pixels a frame. Far enough that a hero bouncing
 * on his helmet does not just land on it again the moment he recovers: in the browser
 * (2026-11-22) that took all three pieces in under three seconds.
 */
export const TOOMAS_STAGGER_SPEED = 1.5;
/** How long his flag pole is up before it comes down. */
export const TOOMAS_WINDUP_FRAMES = 40;
export const TOOMAS_MAX_ZOMBIES = 2;
/** A shockwave, in pixels: low and long. */
export const WAVE_H = 8;

/** The armour, in the order it comes off. */
export const ARMOUR = ['helmet', 'plate', 'shield'] as const;
export type ArmourPiece = (typeof ARMOUR)[number];

export type ToomasPhase = 'asleep' | 'marching' | 'windup' | 'hurt' | 'defeated';

/** Something worth showing (gfx/vanaToomas.ts). Positions in pixels. */
export interface ToomasFx {
  kind: 'wake' | 'hit' | 'clang' | 'stamp';
  x: number;
  y: number;
  /** The piece that flew off, on a hit. */
  piece?: ArmourPiece;
}

export interface VanaToomasState {
  kind: 'vanaToomas';
  x: number;
  y: number;
  w: number;
  h: number;
  facing: 1 | -1;
  /** The square's floor, in pixels. */
  floorY: number;
  /** How far left and right he marches, as his `x`, in pixels. */
  patrol: [number, number];
  hp: number;
  /** 0, 1, 2: each round faster, stamping more often. */
  round: number;
  phase: ToomasPhase;
  /** Frames left of the stagger, or of the windup. */
  timer: number;
  /** Frames to his next stamp. */
  stampTimer: number;
  /** Counts up while he marches; his step follows it. */
  step: number;
  /** Drained by the scene; capped. */
  fx: ToomasFx[];
}

export function marchSpeed(dc: DifficultyRecord, round: number): number {
  return Math.max(0.4, dc.enemySpeed) * (0.7 + 0.35 * round);
}

export function stampInterval(dc: DifficultyRecord, round: number): number {
  return Math.max(100, Math.round(dc.enemyShootInterval * 2) - round * 40);
}

export function waveSpeed(dc: DifficultyRecord): number {
  return 1.2 + dc.enemySpeed;
}

/** The pieces he still wears. */
export function armourLeft(b: VanaToomasState): ArmourPiece[] {
  return ARMOUR.slice(TOOMAS_HP - Math.max(0, b.hp));
}

export function buildVanaToomas(def: BossDef, dc: DifficultyRecord): VanaToomasState {
  const floorY = def.y * TILE;
  return {
    kind: 'vanaToomas',
    x: def.x * TILE + TILE / 2 - TOOMAS_W / 2,
    y: floorY - TOOMAS_H,
    w: TOOMAS_W,
    h: TOOMAS_H,
    facing: -1,
    floorY,
    patrol: [def.patrol[0] * TILE, def.patrol[1] * TILE - TOOMAS_W],
    hp: TOOMAS_HP,
    round: 0,
    phase: 'asleep',
    timer: 0,
    stampTimer: stampInterval(dc, 0),
    step: 0,
    fx: [],
  };
}

function pushFx(b: VanaToomasState, fx: ToomasFx): void {
  if (b.fx.length >= 32) b.fx.shift();
  b.fx.push(fx);
}

/** Two zombie knights from the ends of his march, never more than TOOMAS_MAX_ZOMBIES up. */
function callZombies(world: World, b: VanaToomasState): void {
  const floorRow = b.floorY / TILE;
  const up = world.enemies.filter((e) => e.alive && e.zombie).length;
  for (const x of [b.patrol[1] + b.w, b.patrol[0]].slice(0, Math.max(0, TOOMAS_MAX_ZOMBIES - up))) {
    const e = spawnEnemy(world.map, world.dc, { type: 'knight', x: Math.floor(x / TILE), floorRow, zombie: true });
    if (e) world.enemies.push(e);
  }
}

function defeat(world: World, b: VanaToomasState): void {
  b.phase = 'defeated';
  world.score += Math.round(1000 * world.dc.scoreMultiplier);
  world.sounds.push('win');
  // His last shockwaves settle with him: nothing hurts once he is beaten (a wave still rolling
  // took a cape after the win, in the browser).
  world.enemyProjectiles = world.enemyProjectiles.filter((s) => s.type !== 'wave');
  for (const e of world.enemies) {
    if (!e.alive || !e.zombie) continue;
    e.alive = false;
    e.squashTimer = 30;
  }
}

function hit(world: World, b: VanaToomasState): void {
  const piece = armourLeft(b)[0];
  b.hp--;
  world.score += Math.round(500 * world.dc.scoreMultiplier);
  world.sounds.push('block', 'boing', 'boss-roar');
  world.rumbles.push({ strong: 0.5, weak: 0.5, dur: 120 });
  pushFx(b, { kind: 'hit', x: b.x + b.w / 2, y: b.y + 8, piece });
  if (b.hp <= 0) {
    defeat(world, b);
    return;
  }
  b.phase = 'hurt';
  b.timer = TOOMAS_HURT_FRAMES;
  callZombies(world, b);
}

function clang(world: World, b: VanaToomasState, x: number, y: number): void {
  world.sounds.push('block');
  pushFx(b, { kind: 'clang', x, y });
}

/** He marches; at a patrol end he turns. */
function march(world: World, b: VanaToomasState): void {
  b.x += b.facing * marchSpeed(world.dc, b.round);
  if (b.x <= b.patrol[0]) {
    b.x = b.patrol[0];
    b.facing = 1;
  }
  if (b.x >= b.patrol[1]) {
    b.x = b.patrol[1];
    b.facing = -1;
  }
  b.step++;
  if (--b.stampTimer > 0) return;
  b.phase = 'windup';
  b.timer = TOOMAS_WINDUP_FRAMES;
}

/** The flag pole comes down: a shockwave rolls each way along the floor. */
function stamp(world: World, b: VanaToomasState): void {
  const speed = waveSpeed(world.dc);
  for (const dir of [-1, 1]) {
    world.enemyProjectiles.push({
      x: b.x + b.w / 2 - 4 + dir * (b.w / 2 + 2),
      y: b.floorY - WAVE_H,
      vx: dir * speed,
      vy: 0,
      life: 400,
      type: 'wave',
    });
  }
  world.sounds.push('stomp');
  world.rumbles.push({ strong: 0.3, weak: 0.3, dur: 80 });
  pushFx(b, { kind: 'stamp', x: b.x + b.w / 2, y: b.floorY });
  b.phase = 'marching';
  b.stampTimer = stampInterval(world.dc, b.round);
}

/** Arrows clang off his armour. */
function arrows(world: World, b: VanaToomasState): void {
  for (const a of world.arrows) {
    if (a.life <= 0 || !rectOverlap({ x: a.x, y: a.y, w: 12, h: 4 }, b)) continue;
    a.life = 0;
    clang(world, b, a.x, a.y);
  }
  world.arrows = world.arrows.filter((a) => a.life > 0);
}

/**
 * A big head landing on him, or running into his back, knocks a piece off. Anything else is
 * his armour: a stomp bounces the hero off, a side touch pushes them out, and neither hurts.
 */
function contact(world: World, b: VanaToomasState): void {
  const p = world.player;
  if (!rectOverlap(p, b)) return;
  const bigHead = p.bigHeadTimer > 0;
  // Braced with his pole up, he turns even a big head (browser, 2026-11-22: without this,
  // Hard's fight was over in five seconds).
  const canHit = bigHead && b.phase === 'marching';
  const fromLeft = p.x + p.w / 2 < b.x + b.w / 2;
  if (p.vy > 0 && p.y + p.h - 6 < b.y + b.h / 3) {
    // Off his helmet, and off to the side he is nearer: never straight back down onto it.
    p.vy = -7;
    p.y = b.y - p.h;
    p.vx = fromLeft ? -3 : 3;
    if (canHit) hit(world, b);
    else clang(world, b, p.x + p.w / 2, b.y);
    return;
  }
  const atHisBack = fromLeft ? b.facing > 0 : b.facing < 0;
  if (canHit && atHisBack) hit(world, b);
  else clang(world, b, fromLeft ? b.x : b.x + b.w, p.y + p.h / 2);
  const pushedX = fromLeft ? b.x - p.w - 1 : b.x + b.w + 1;
  if (!boxHitsSolid(world.map, { x: pushedX, y: p.y, w: p.w, h: p.h })) {
    p.x = pushedX;
    p.vx = fromLeft ? -4 : 4;
  } else {
    // Never into a wall (see enemy.ts's zombie push): against one, he turns back instead.
    b.x = fromLeft ? p.x + p.w + 1 : p.x - b.w - 1;
    b.facing = fromLeft ? 1 : -1;
    p.vx = 0;
  }
}

export function stepVanaToomas(world: World, b: VanaToomasState): void {
  switch (b.phase) {
    case 'defeated':
      return;
    case 'asleep': {
      const p = world.player;
      if (p.x + p.w / 2 > b.patrol[0]) {
        b.phase = 'marching';
        b.facing = p.x + p.w / 2 < b.x + b.w / 2 ? -1 : 1;
        world.sounds.push('boss-roar');
        pushFx(b, { kind: 'wake', x: b.x + b.w / 2, y: b.y });
      }
      return;
    }
    case 'hurt': {
      // He staggers away from the hero, then, cross, raises his flag pole at once: a round
      // faster from then on.
      const p = world.player;
      const away = p.x + p.w / 2 < b.x + b.w / 2 ? 1 : -1;
      b.x = Math.min(b.patrol[1], Math.max(b.patrol[0], b.x + away * TOOMAS_STAGGER_SPEED));
      b.facing = away > 0 ? -1 : 1;
      if (--b.timer <= 0) {
        b.round++;
        b.phase = 'windup';
        b.timer = TOOMAS_WINDUP_FRAMES;
      }
      break;
    }
    case 'windup':
      if (--b.timer <= 0) stamp(world, b);
      break;
    case 'marching':
      march(world, b);
      break;
  }
  arrows(world, b);
  contact(world, b);
}
