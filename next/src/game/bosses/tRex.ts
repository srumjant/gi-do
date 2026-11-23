import { TILE } from '../../config/constants';
import type { DifficultyRecord } from '../../config/difficulty';
import type { BossDef, StationKind } from '../../data/levels';
import { spawnEnemy } from '../enemy';
import { boxHitsSolid, rectOverlap } from '../tiles';
import type { Rect, World } from '../types';

/**
 * The T-Rex, the final boss (docs/superpowers/specs/2026-11-22-three-levels-and-a-boss-design.md,
 * "Toy Castle, in detail"): four hits, each with one of the four tools, in order.
 *
 *   1. bow: shoot the target by the door, and the toy block hanging over the middle of the
 *      room drops; on his head, a hit.
 *   2. fart: only a jump on his head with the fart on lands hard enough.
 *   3. big head: touching him with a big head smashes his crown.
 *   4. chicken ray: he calls two little zombie dinos; ray them, then ray him, and he shrinks.
 *
 * He walks up and down, and now and then stops in the middle and roars, breathing a fireball
 * at the hero. His touch never hurts. Pure, like the rest of src/game/: gfx/tRex.ts draws him.
 */

export const TREX_HP = 4;
/** His body: the classic 18x20 sprite at 4. */
export const TREX_W = 72;
export const TREX_H = 80;
/** The tool each hit needs, in order. */
export const TREX_ROUNDS: readonly StationKind[] = ['bow', 'fart', 'bighead', 'chicken'];
/** How long he staggers after a hit. */
export const TREX_HURT_FRAMES = 90;
export const TREX_MAX_ZOMBIES = 2;
/** The toy block: 32x32, hanging this far above the floor until its target is shot. */
export const BLOCK_SIZE = 32;
export const BLOCK_HANG = 12 * TILE;
export const BLOCK_GRAVITY = 0.4;
/** Frames before a new block is lowered after one smashed on the floor. */
export const BLOCK_RELOAD = 90;
/** A target's box, as the course's (game/course.ts). */
const TARGET_W = 22;
const TARGET_H = 68;

export type TRexPhase = 'asleep' | 'walking' | 'roaring' | 'hurt' | 'defeated';

/** Something worth showing (gfx/tRex.ts). Positions in pixels. */
export interface TRexFx {
  kind: 'wake' | 'roar' | 'hit' | 'bonk' | 'thud' | 'drop' | 'smash' | 'crown' | 'dinos' | 'defeat';
  x: number;
  y: number;
}

export interface ToyBlock {
  /** Its top; it hangs at `floorY - BLOCK_HANG` until it drops. */
  y: number;
  vy: number;
  state: 'hanging' | 'falling' | 'gone';
  /** Frames until a new one is lowered, once gone. */
  reload: number;
}

export interface TRexState {
  kind: 'tRex';
  x: number;
  y: number;
  w: number;
  h: number;
  facing: 1 | -1;
  floorY: number;
  /** How far left and right he walks, as his `x`. */
  patrol: [number, number];
  /** Where he stops to roar, as his `x`: the middle of his walk, under the block. */
  roarX: number;
  hp: number;
  /** Hits taken: which tool the next hit needs (TREX_ROUNDS). */
  round: number;
  phase: TRexPhase;
  timer: number;
  /** Frames until he next heads for the middle to roar. */
  roarTimer: number;
  /** The target by the door that drops the block. */
  target: Rect;
  block: ToyBlock;
  /** The block's left edge: over the middle of him when he stands at `roarX`. */
  blockX: number;
  step: number;
  fx: TRexFx[];
}

export function walkSpeed(dc: DifficultyRecord, round: number): number {
  return Math.max(0.4, dc.enemySpeed) * (0.6 + 0.15 * round);
}

/** Frames between roars. */
export function roarInterval(dc: DifficultyRecord, round: number): number {
  return Math.max(120, Math.round(dc.enemyShootInterval * 2.4) - 30 * round);
}

/** How long he stands roaring. */
export function roarFrames(dc: DifficultyRecord): number {
  return Math.round(60 + 90 / (1 + dc.enemySpeed));
}

/** How fast his fireball flies, in pixels a frame. */
export function fireSpeed(dc: DifficultyRecord): number {
  return 1.2 + 1.3 * dc.enemySpeed;
}

/** The tool his next hit needs, or null once he is beaten. */
export function neededTool(b: TRexState): StationKind | null {
  return b.phase === 'defeated' ? null : TREX_ROUNDS[Math.min(b.round, TREX_ROUNDS.length - 1)];
}

export function buildTRex(def: BossDef, dc: DifficultyRecord): TRexState {
  if (def.spots.length === 0) throw new Error('the T-Rex needs the target for his block: a 1 in the level');
  const floorY = def.y * TILE;
  const patrol: [number, number] = [def.patrol[0] * TILE, def.patrol[1] * TILE - TREX_W];
  const roarX = Math.round((patrol[0] + patrol[1]) / 2);
  const [spot] = def.spots;
  return {
    kind: 'tRex',
    x: def.x * TILE + TILE / 2 - TREX_W / 2,
    y: floorY - TREX_H,
    w: TREX_W,
    h: TREX_H,
    facing: -1,
    floorY,
    patrol,
    roarX,
    hp: TREX_HP,
    round: 0,
    phase: 'asleep',
    timer: 0,
    roarTimer: roarInterval(dc, 0),
    target: { x: spot.x * TILE + (TILE - TARGET_W) / 2, y: (spot.y + 1) * TILE - TARGET_H, w: TARGET_W, h: TARGET_H },
    block: { y: floorY - BLOCK_HANG, vy: 0, state: 'hanging', reload: 0 },
    blockX: roarX + TREX_W / 2 - BLOCK_SIZE / 2,
    step: 0,
    fx: [],
  };
}

function pushFx(b: TRexState, fx: TRexFx): void {
  if (b.fx.length >= 32) b.fx.shift();
  b.fx.push(fx);
}

const dinos = (world: World) => world.enemies.filter((e) => e.alive && e.zombie);

/** Two little zombie dinos, one at each end of his walk, never on the hero. */
function callDinos(world: World, b: TRexState): void {
  const p = world.player;
  let up = dinos(world).length;
  for (const x of [b.patrol[0], b.patrol[1] + b.w - TILE]) {
    if (up >= TREX_MAX_ZOMBIES) return;
    if (Math.abs(x - p.x) < 3 * TILE) continue;
    const e = spawnEnemy(world.map, world.dc, { type: 'dino', x: Math.floor(x / TILE), floorRow: b.floorY / TILE, zombie: true });
    if (!e) continue;
    world.enemies.push(e);
    up++;
  }
  pushFx(b, { kind: 'dinos', x: b.x + b.w / 2, y: b.y });
}

function defeat(world: World, b: TRexState): void {
  b.phase = 'defeated';
  world.score += Math.round(2000 * world.dc.scoreMultiplier);
  world.sounds.push('win');
  world.enemyProjectiles = [];
  b.block.state = 'gone';
  b.block.reload = Infinity;
  for (const e of world.enemies) {
    if (!e.alive || !e.zombie) continue;
    e.alive = false;
    e.squashTimer = 30;
  }
  pushFx(b, { kind: 'defeat', x: b.x + b.w / 2, y: b.y + b.h / 2 });
}

function hit(world: World, b: TRexState): void {
  b.hp--;
  world.score += Math.round(500 * world.dc.scoreMultiplier);
  world.sounds.push('stomp', 'boing', 'boss-roar');
  world.rumbles.push({ strong: 0.6, weak: 0.6, dur: 150 });
  pushFx(b, { kind: TREX_ROUNDS[b.round] === 'bighead' ? 'crown' : 'hit', x: b.x + b.w / 2, y: b.y + 10 });
  if (b.hp <= 0) {
    defeat(world, b);
    return;
  }
  b.round = TREX_HP - b.hp;
  b.phase = 'hurt';
  b.timer = TREX_HURT_FRAMES;
}

/** He breathes a fireball at the hero. */
function breathe(world: World, b: TRexState): void {
  const p = world.player;
  const mx = b.facing < 0 ? b.x + 6 : b.x + b.w - 14;
  const my = b.y + 26;
  const dx = p.x + p.w / 2 - mx;
  const dy = p.y + p.h / 2 - my;
  const len = Math.max(1, Math.hypot(dx, dy));
  const v = fireSpeed(world.dc);
  world.enemyProjectiles.push({ x: mx, y: my, vx: (dx / len) * v, vy: (dy / len) * v, life: 300, type: 'fireball' });
}

/** The block: shot loose, it falls; on him, a hit (round one only); on the floor, it smashes. */
function stepBlock(world: World, b: TRexState): void {
  const block = b.block;
  if (block.state === 'gone') {
    if (--block.reload <= 0) {
      block.state = 'hanging';
      block.y = b.floorY - BLOCK_HANG;
      block.vy = 0;
    }
    return;
  }
  if (block.state === 'hanging') {
    for (const a of world.arrows) {
      if (a.life <= 0 || !rectOverlap({ x: a.x, y: a.y, w: 12, h: 4 }, b.target)) continue;
      a.life = 0;
      block.state = 'falling';
      world.sounds.push('shoot');
      pushFx(b, { kind: 'drop', x: b.blockX + BLOCK_SIZE / 2, y: block.y });
    }
    world.arrows = world.arrows.filter((a) => a.life > 0);
    return;
  }
  block.vy += BLOCK_GRAVITY;
  block.y += block.vy;
  const box = { x: b.blockX, y: block.y, w: BLOCK_SIZE, h: BLOCK_SIZE };
  const onHim = b.phase !== 'hurt' && rectOverlap(box, b);
  if (onHim || block.y + BLOCK_SIZE >= b.floorY) {
    block.state = 'gone';
    block.reload = BLOCK_RELOAD;
    pushFx(b, { kind: 'smash', x: b.blockX + BLOCK_SIZE / 2, y: block.y + BLOCK_SIZE });
    if (onHim && TREX_ROUNDS[b.round] === 'bow') hit(world, b);
    else world.sounds.push('block');
  }
}

/** Arrows and rays that reach him: the last round's ray, with no dino standing, is the last hit. */
function arrows(world: World, b: TRexState): void {
  for (const a of world.arrows) {
    if (a.life <= 0 || !rectOverlap({ x: a.x, y: a.y, w: 12, h: 4 }, b)) continue;
    a.life = 0;
    if (a.isChicken && TREX_ROUNDS[b.round] === 'chicken' && b.phase !== 'hurt' && dinos(world).length === 0) {
      world.sounds.push('cluck');
      hit(world, b);
      return;
    }
    world.sounds.push('block');
    pushFx(b, { kind: 'thud', x: a.x, y: a.y });
  }
  world.arrows = world.arrows.filter((a) => a.life > 0);
}

/** Touching him: the fart round's landing and the big head round's touch are hits; nothing hurts. */
function contact(world: World, b: TRexState): void {
  const p = world.player;
  const bigHead = p.bigHeadTimer > 0;
  const reach = bigHead ? 8 : 0;
  if (!rectOverlap({ x: p.x - reach, y: p.y, w: p.w + 2 * reach, h: p.h }, b)) return;
  const fromLeft = p.x + p.w / 2 < b.x + b.w / 2;
  const tool = TREX_ROUNDS[b.round];
  const ready = b.phase === 'walking' || b.phase === 'roaring';
  if (ready && tool === 'bighead' && bigHead) {
    p.vy = -6;
    p.vx = fromLeft ? -3 : 3;
    hit(world, b);
    return;
  }
  if (p.vy > 0 && p.y + p.h - 8 < b.y + b.h / 3) {
    p.vy = -7;
    p.y = b.y - p.h;
    p.vx = fromLeft ? -3 : 3;
    if (ready && tool === 'fart' && p.fartTimer > 0) {
      hit(world, b);
    } else {
      world.sounds.push('boing');
      pushFx(b, { kind: 'bonk', x: p.x + p.w / 2, y: b.y });
    }
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

/** He walks his patrol, turning at its ends; when it is time to roar he heads for the middle. */
function walk(world: World, b: TRexState): void {
  const speed = walkSpeed(world.dc, b.round);
  b.step++;
  b.roarTimer--;
  if (b.roarTimer <= 0) {
    const d = b.roarX - b.x;
    if (Math.abs(d) <= speed) {
      b.x = b.roarX;
      const p = world.player;
      b.facing = p.x + p.w / 2 < b.x + b.w / 2 ? -1 : 1;
      b.phase = 'roaring';
      b.timer = roarFrames(world.dc);
      world.sounds.push('boss-roar');
      pushFx(b, { kind: 'roar', x: b.x + b.w / 2, y: b.y });
      const fires = 1 + Math.floor(b.round / 2);
      for (let i = 0; i < fires; i++) breathe(world, b);
      return;
    }
    b.facing = d > 0 ? 1 : -1;
  }
  b.x += b.facing * speed;
  if (b.x <= b.patrol[0]) {
    b.x = b.patrol[0];
    b.facing = 1;
  }
  if (b.x >= b.patrol[1]) {
    b.x = b.patrol[1];
    b.facing = -1;
  }
}

export function stepTRex(world: World, b: TRexState): void {
  if (b.phase === 'defeated') return;
  const p = world.player;
  switch (b.phase) {
    case 'asleep':
      if (p.x + p.w / 2 > b.patrol[0]) {
        b.phase = 'walking';
        b.facing = p.x + p.w / 2 < b.x + b.w / 2 ? -1 : 1;
        world.sounds.push('boss-roar');
        pushFx(b, { kind: 'wake', x: b.x + b.w / 2, y: b.y });
      }
      return;
    case 'walking':
      walk(world, b);
      break;
    case 'roaring':
      if (--b.timer <= 0) {
        b.phase = 'walking';
        b.roarTimer = roarInterval(world.dc, b.round);
      }
      break;
    case 'hurt':
      if (--b.timer <= 0) {
        b.phase = 'walking';
        b.roarTimer = Math.round(roarInterval(world.dc, b.round) / 2);
        if (TREX_ROUNDS[b.round] === 'chicken') callDinos(world, b);
      }
      break;
  }
  // Each of these can land the last hit, and nothing after it should touch him.
  stepBlock(world, b);
  if (beaten(b)) return;
  arrows(world, b);
  if (beaten(b)) return;
  contact(world, b);
}

/** Read through a function so the step's narrowing of `phase` above does not hide a change. */
function beaten(b: TRexState): boolean {
  return b.phase === 'defeated';
}
