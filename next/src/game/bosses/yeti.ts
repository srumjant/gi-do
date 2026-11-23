import { TILE } from '../../config/constants';
import type { DifficultyRecord } from '../../config/difficulty';
import type { BossDef } from '../../data/levels';
import { spawnEnemy } from '../enemy';
import { playerHit } from '../player';
import { boxHitsSolid, rectOverlap } from '../tiles';
import type { EnemyProjectile, World } from '../types';

/**
 * The Yeti, Winter's boss (docs/superpowers/specs/2026-11-22-three-levels-and-a-boss-design.md):
 * a big white furry beast in the ice palace's throne room.
 *
 * He roars and paws the floor, then charges at the hero and cannot stop until he slams into a
 * wall. The charge hurts, from the front: jump over him. The slam shakes icicles down from the ceiling, each
 * hanging and shaking over its shadow first. Then he sits dizzy: jump on his head for a hit.
 * Not in time, he shakes it off and roars again. Outside a charge his touch never hurts. After
 * each hit he calls two zombie penguins and charges faster. Three hits and he is beaten.
 *
 * Pure, like the rest of src/game/: gfx/yeti.ts draws him and drains `fx`.
 */

export const YETI_HP = 3;
/** His body: the 20x20 sprite at 2. Two and a half tiles. */
export const YETI_W = 40;
export const YETI_H = 40;
/** How long he shakes his head after a hit before he winds up again. */
export const YETI_HURT_FRAMES = 60;
export const YETI_MAX_ZOMBIES = 2;
/** How much faster he goes each frame of a charge, until his top speed. */
export const CHARGE_ACCEL = 0.12;
/** Where icicles hang from: this far above the floor. The throne room's ceiling is just above. */
export const ICICLE_DROP = 12 * TILE;
export const ICICLE_GRAVITY = 0.35;
/** Frames between one icicle letting go and the next. */
const ICICLE_STAGGER = 8;

export type YetiPhase = 'asleep' | 'windup' | 'charging' | 'dizzy' | 'hurt' | 'defeated';

/** Something worth showing (gfx/yeti.ts). Positions in pixels. */
export interface YetiFx {
  kind: 'wake' | 'roar' | 'slam' | 'hit' | 'bonk' | 'thud';
  x: number;
  y: number;
}

/** An icicle hanging from the ceiling, about to let go. */
export interface HangingIcicle {
  /** Its left edge, in pixels. */
  x: number;
  /** Frames until it falls. */
  timer: number;
}

export interface YetiState {
  kind: 'yeti';
  x: number;
  y: number;
  w: number;
  h: number;
  facing: 1 | -1;
  /** The throne room's floor, in pixels. */
  floorY: number;
  /** The walls he slams into, as his `x`: just inside the door, and the dais's foot. */
  walls: [number, number];
  hp: number;
  /** Hits taken: 0, 1, 2. Each round a faster charge and more icicles. */
  round: number;
  phase: YetiPhase;
  /** Frames left of the windup, the dizzy spell or the head-shake. */
  timer: number;
  /** His speed in a charge, building up. */
  speed: number;
  /** Slams so far: where the icicles come down changes with each. */
  slams: number;
  icicles: HangingIcicle[];
  /** Counts up while he moves; his step follows it. */
  step: number;
  fx: YetiFx[];
}

/** Frames he roars and paws the floor before a charge: a long warning on Super Easy. */
export function windupFrames(dc: DifficultyRecord, round: number): number {
  return Math.max(30, Math.round(100 / (1 + dc.enemySpeed)) + 10 - 8 * round);
}

/** His top speed in a charge, in pixels a frame. */
export function chargeSpeed(dc: DifficultyRecord, round: number): number {
  return (1.6 + 0.9 * dc.enemySpeed) * (1 + 0.15 * round);
}

/**
 * Frames he sits dizzy after a slam: the window to jump on his head. Never too short to run the
 * whole room to him and jump (browser, 2026-11-23: he slams into the far wall, up to twenty
 * tiles off, and on Hard the window had shrunk to two seconds).
 */
export function dizzyFrames(dc: DifficultyRecord, round: number): number {
  return Math.max(200, Math.round(480 / (1 + dc.enemySpeed)) - 20 * round);
}

/** Icicles a slam brings down. */
export function icicleCount(dc: DifficultyRecord, round: number): number {
  return Math.round(2 + 2 * dc.enemySpeed) + round;
}

/** Frames an icicle hangs, shaking over its shadow, before it falls. */
export function icicleWarn(dc: DifficultyRecord): number {
  return Math.round(70 / (1 + dc.enemySpeed)) + 20;
}

export function buildYeti(def: BossDef): YetiState {
  const floorY = def.y * TILE;
  // His door is four columns before his patrol's start, and the dais starts one past its end
  // (data/course.ts): the walls are the door's inside face and the dais's foot.
  const walls: [number, number] = [(def.patrol[0] - 3) * TILE, (def.patrol[1] + 1) * TILE - YETI_W];
  return {
    kind: 'yeti',
    x: def.x * TILE + TILE / 2 - YETI_W / 2,
    y: floorY - YETI_H,
    w: YETI_W,
    h: YETI_H,
    facing: -1,
    floorY,
    walls,
    hp: YETI_HP,
    round: 0,
    phase: 'asleep',
    timer: 0,
    speed: 0,
    slams: 0,
    icicles: [],
    step: 0,
    fx: [],
  };
}

function pushFx(b: YetiState, fx: YetiFx): void {
  if (b.fx.length >= 32) b.fx.shift();
  b.fx.push(fx);
}

const falling = (world: World): EnemyProjectile[] => world.enemyProjectiles.filter((s) => s.type === 'icicle');

function windUp(world: World, b: YetiState): void {
  b.phase = 'windup';
  b.timer = windupFrames(world.dc, b.round);
  world.sounds.push('boss-roar');
  pushFx(b, { kind: 'roar', x: b.x + b.w / 2, y: b.y });
}

/** Into the wall: dizzy, and the ceiling lets go of its icicles, none on him. */
function slam(world: World, b: YetiState): void {
  b.phase = 'dizzy';
  b.timer = dizzyFrames(world.dc, b.round);
  b.speed = 0;
  b.slams++;
  world.sounds.push('stomp', 'block');
  world.rumbles.push({ strong: 0.6, weak: 0.6, dur: 200 });
  pushFx(b, { kind: 'slam', x: b.facing > 0 ? b.x + b.w : b.x, y: b.y + b.h / 2 });
  const [left, right] = b.walls;
  const first = Math.ceil(left / TILE);
  const last = Math.floor((right + b.w) / TILE) - 1;
  const clear = (col: number) => col * TILE + TILE <= b.x - TILE || col * TILE >= b.x + b.w + TILE;
  const cols: number[] = [];
  for (let c = first; c <= last; c++) if (clear(c)) cols.push(c);
  const count = Math.min(cols.length, icicleCount(world.dc, b.round));
  const spacing = cols.length / count;
  const shift = (b.slams * 3) % Math.max(1, Math.floor(spacing));
  const warn = icicleWarn(world.dc);
  for (let i = 0; i < count; i++) {
    const col = cols[Math.min(cols.length - 1, Math.floor(i * spacing) + shift)];
    b.icicles.push({ x: col * TILE + 4, timer: warn + i * ICICLE_STAGGER });
  }
}

/** Icicles hanging count down and let go; falling ones speed up. */
function icicles(world: World, b: YetiState): void {
  for (const s of falling(world)) s.vy += s.ay ?? 0;
  for (const ic of b.icicles) {
    if (--ic.timer > 0) continue;
    world.enemyProjectiles.push({
      x: ic.x, y: b.floorY - ICICLE_DROP, vx: 0, vy: 0, ay: ICICLE_GRAVITY, life: 200, type: 'icicle',
    });
  }
  b.icicles = b.icicles.filter((ic) => ic.timer > 0);
}

/** Two zombie penguins, one by each wall, never more than YETI_MAX_ZOMBIES up, never on the hero. */
function callZombies(world: World, b: YetiState): void {
  const p = world.player;
  const floorRow = b.floorY / TILE;
  let up = world.enemies.filter((e) => e.alive && e.zombie).length;
  for (const x of [b.walls[0] + TILE, b.walls[1] + b.w - 2 * TILE]) {
    if (up >= YETI_MAX_ZOMBIES) return;
    if (Math.abs(x - p.x) < 3 * TILE) continue;
    const e = spawnEnemy(world.map, world.dc, { type: 'penguin', x: Math.floor(x / TILE), floorRow, zombie: true });
    if (!e) continue;
    world.enemies.push(e);
    up++;
  }
}

function defeat(world: World, b: YetiState): void {
  b.phase = 'defeated';
  world.score += Math.round(1000 * world.dc.scoreMultiplier);
  world.sounds.push('win');
  b.icicles = [];
  world.enemyProjectiles = world.enemyProjectiles.filter((s) => s.type !== 'icicle');
  for (const e of world.enemies) {
    if (!e.alive || !e.zombie) continue;
    e.alive = false;
    e.squashTimer = 30;
  }
}

/** A stomp on his head while he sits dizzy. */
function hit(world: World, b: YetiState): void {
  b.hp--;
  world.score += Math.round(500 * world.dc.scoreMultiplier);
  world.sounds.push('stomp', 'boing', 'boss-roar');
  world.rumbles.push({ strong: 0.5, weak: 0.5, dur: 120 });
  pushFx(b, { kind: 'hit', x: b.x + b.w / 2, y: b.y });
  if (b.hp <= 0) {
    defeat(world, b);
    return;
  }
  b.round = YETI_HP - b.hp;
  b.phase = 'hurt';
  b.timer = YETI_HURT_FRAMES;
}

/** Arrows thud into his fur and drop. */
function arrows(world: World, b: YetiState): void {
  for (const a of world.arrows) {
    if (a.life <= 0 || !rectOverlap({ x: a.x, y: a.y, w: 12, h: 4 }, b)) continue;
    a.life = 0;
    world.sounds.push('block');
    pushFx(b, { kind: 'thud', x: a.x, y: a.y });
  }
  world.arrows = world.arrows.filter((a) => a.life > 0);
}

function contact(world: World, b: YetiState): void {
  const p = world.player;
  if (!rectOverlap(p, b)) return;
  const fromLeft = p.x + p.w / 2 < b.x + b.w / 2;
  const landing = p.vy > 0 && p.y + p.h - 8 < b.y + b.h / 2;
  if (landing) {
    p.vy = -7;
    p.y = b.y - p.h;
    if (b.phase === 'dizzy') {
      p.vx = fromLeft ? -2 : 2;
      hit(world, b);
    } else {
      // On his head, but not dizzy (even mid-charge): thrown off to the side, no harm.
      p.vx = fromLeft ? -3 : 3;
      world.sounds.push('boing');
      pushFx(b, { kind: 'bonk', x: p.x + p.w / 2, y: b.y });
    }
    return;
  }
  if (b.phase === 'charging') {
    // Only his front hurts: a hero who jumped him and comes down on his back as he runs off is
    // no harm (browser, 2026-11-23).
    const inFront = b.facing > 0 ? !fromLeft : fromLeft;
    if (inFront && p.invincible <= 0) playerHit(world);
    return;
  }
  if (b.phase === 'dizzy') return;
  const pushedX = fromLeft ? b.x - p.w - 1 : b.x + b.w + 1;
  if (!boxHitsSolid(world.map, { x: pushedX, y: p.y, w: p.w, h: p.h })) {
    p.x = pushedX;
    p.vx = fromLeft ? -3 : 3;
  } else {
    p.vx = 0;
  }
}

export function stepYeti(world: World, b: YetiState): void {
  if (b.phase === 'defeated') return;
  const p = world.player;
  const towardHero = (): 1 | -1 => (p.x + p.w / 2 < b.x + b.w / 2 ? -1 : 1);
  switch (b.phase) {
    case 'asleep':
      if (p.x + p.w / 2 > b.walls[0] + 3 * TILE) {
        b.facing = towardHero();
        pushFx(b, { kind: 'wake', x: b.x + b.w / 2, y: b.y });
        windUp(world, b);
      }
      return;
    case 'windup':
      b.facing = towardHero();
      b.step++;
      if (--b.timer <= 0) {
        // Never into the wall at his back: with the hero over him there, he charges into the
        // room (browser, 2026-11-23: a hero on his head at a wall made him slam at once).
        if (b.x <= b.walls[0]) b.facing = 1;
        if (b.x >= b.walls[1]) b.facing = -1;
        b.phase = 'charging';
        b.speed = 0;
      }
      break;
    case 'charging': {
      b.speed = Math.min(chargeSpeed(world.dc, b.round), b.speed + CHARGE_ACCEL);
      b.x += b.facing * b.speed;
      b.step++;
      const [left, right] = b.walls;
      if (b.x <= left || b.x >= right) {
        b.x = Math.min(right, Math.max(left, b.x));
        slam(world, b);
      }
      break;
    }
    case 'dizzy':
      if (--b.timer <= 0) windUp(world, b);
      break;
    case 'hurt':
      if (--b.timer <= 0) {
        callZombies(world, b);
        windUp(world, b);
      }
      break;
  }
  icicles(world, b);
  arrows(world, b);
  contact(world, b);
}
