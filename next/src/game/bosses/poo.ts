import { TILE } from '../../config/constants';
import type { DifficultyRecord } from '../../config/difficulty';
import type { BossDef } from '../../data/levels';
import { spawnEnemy } from '../enemy';
import { playerHit } from '../player';
import { rectOverlap } from '../tiles';
import type { World } from '../types';

/**
 * Härra Kaka, the poo boss (docs/superpowers/specs/2026-11-24-poo-boss-design.md): the owner's
 * children's idea, on a screen of his own (?boss=poo).
 *
 * A big poo hopping about a bathroom. He crouches, hops toward the hero and lands with a plop
 * that sends a stink wave along the floor both ways: low, so every jump clears it. Touching him
 * hurts, on top or at the side: nobody stomps on a poo. The weapon is the giant toilet at the
 * end of the room: land on the button on its lid and the lid springs open, throwing the hero
 * across the room, while the super flush sucks the poo (and his stink) across the floor into the
 * bowl. A piece of him goes down; the rest is spat back out, smaller and quicker, with two little
 * poos. Three flushes and he is gone for good.
 *
 * Pure, like the rest of src/game/: gfx/poo.ts draws him and his bathroom and drains `fx`.
 */

export const POO_HP = 3;
/** His body at full size: the 20x18 sprite at 2. He shrinks with each flush (pooSize). */
export const POO_W = 40;
export const POO_H = 36;
/** After he is spat back out of the bowl: his flight through the air, then lying squashed. */
export const POO_SPAT_FRAMES = 60;
/** The first frames of it, flying out of the bowl in an arc: nothing hurts until he lands. */
export const SPIT_FLIGHT = 28;
/** How long he crouches before a hop. */
export const POO_CROUCH_FRAMES = 22;
/** Pulling him down in a hop, pixels a frame each frame. */
export const POO_GRAVITY = 0.35;
/** A stink wave, in pixels: as low as Toomas's. */
export const STINK_H = 8;
/** Little poos up at once, at most. */
export const POO_MAX_LITTLE = 4;

/** The giant toilet (the 16x20 sprite at 3), standing just before the cage's step. */
export const TOILET_W = 48;
/** Its middle, this far left of where the room's right side ends (the patrol's right end). */
export const TOILET_IN = 28;
/**
 * The flush button on top of the tank: the tank's top, this high above the floor (Hard's jump
 * lifts the feet 62); and the press zone's left end from the toilet's middle, over the back of
 * the bowl as well as the tank, for a child jumping at the toilet.
 */
export const BUTTON_UP = 60;
export const BUTTON_LEFT = 12;
/** And on behind the tank, to the cage's step. */
export const BEHIND_TANK = 20;
/** The bowl's front, from the toilet's middle: the poo keeps clear of it. */
export const LID_LEFT = 24;
export const LID_RIGHT = 8;
/** How far the poo keeps from the lid, so the toilet is always there to be reached. */
export const TOILET_GAP = 6;
/** The flush: how long the poo is sucked across the floor, how long the hero flies, how high. */
/**
 * Long enough to watch him go in: along the floor, up over the rim, round and down the bowl
 * (owner, 2026-11-24: "only thing happens is that poo is moved towards toilet not pulled into it").
 */
export const SUCK_FRAMES = 100;
export const FLING_FRAMES = 56;
export const FLING_UP = 70;
/**
 * How far back from the lid the hero is thrown. Not the whole room: thrown out of sight, the
 * poo going down the toilet could not be seen (owner, 2026-11-24: "throwing too far").
 */
export const FLING_DIST = 190;

export type PooPhase = 'asleep' | 'hopping' | 'sucked' | 'spat' | 'defeated';
/** Within a hop: resting on the floor, crouching for the next, in the air. */
export type PooHop = 'rest' | 'crouch' | 'air';

export interface PooFx {
  kind: 'wake' | 'plop' | 'thud' | 'press' | 'hit' | 'spit' | 'defeat';
  x: number;
  y: number;
}

/** The hero thrown across the room by the lid: frames into the flight, where from, where to. */
export interface Fling {
  t: number;
  x0: number;
  y0: number;
  x1: number;
}

export interface PooState {
  kind: 'poo';
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  floorY: number;
  /** How far left and right his hops go, as his `x` at full size, in pixels: short of the lid. */
  patrol: [number, number];
  /** The toilet's middle, in pixels. */
  toiletX: number;
  hp: number;
  /** 0, 1, 2: each round smaller and quicker. */
  round: number;
  phase: PooPhase;
  hop: PooHop;
  /** Frames left of a rest, a crouch, being sucked, or lying where he was spat. */
  timer: number;
  /** The hero's flight from the lid, while it lasts. */
  fling: Fling | null;
  /** Where the last throw put the hero down: he is spat out between there and the toilet. */
  landX: number;
  /** Drained by the scene; capped. */
  fx: PooFx[];
}

/** 1 at full health, smaller with each flush. */
export function pooSize(hp: number): number {
  return [0.6, 0.6, 0.8, 1][Math.max(0, Math.min(POO_HP, hp))];
}

/** Frames he rests between hops: long on Super Easy, short on Hard. */
export function restFrames(dc: DifficultyRecord, round: number): number {
  return Math.max(20, Math.round(55 / dc.enemySpeed) - round * 8);
}

/** How fast he hops across, in pixels a frame. */
export function hopSpeed(dc: DifficultyRecord, round: number): number {
  return 0.9 * dc.enemySpeed + 0.35 * round;
}

/** How hard he springs up: lower on Super Easy. */
export function hopLift(dc: DifficultyRecord): number {
  return 4.2 + 1.4 * Math.min(1.2, dc.enemySpeed);
}

export function stinkSpeed(dc: DifficultyRecord): number {
  return 0.8 + dc.enemySpeed;
}

/**
 * Where coming down presses the flush button on top of the tank (owner, 2026-11-24: "button
 * is on top of toilet and opens lid"). The toilet is not solid, so a child walks into it; any
 * jump at its back that comes down through the button's height presses it, and Hard's, which
 * only just reaches the tank's top, does too.
 */
export function buttonBox(b: PooState): { x: number; y: number; w: number; h: number } {
  // On to the gap behind the tank as well: a fast run (Super Easy's) carries a child past it.
  return { x: b.toiletX - BUTTON_LEFT, y: b.floorY - BUTTON_UP - 2, w: BUTTON_LEFT + TOILET_W / 2 + BEHIND_TANK, h: 18 };
}

export function buildPoo(def: BossDef, dc: DifficultyRecord): PooState {
  const floorY = def.y * TILE;
  const right = def.patrol[1] * TILE;
  const toiletX = right - TOILET_IN;
  return {
    kind: 'poo',
    x: def.x * TILE + TILE / 2 - POO_W / 2,
    y: floorY - POO_H,
    w: POO_W,
    h: POO_H,
    vx: 0,
    vy: 0,
    facing: -1,
    floorY,
    patrol: [def.patrol[0] * TILE, toiletX - LID_LEFT - TOILET_GAP - POO_W],
    toiletX,
    hp: POO_HP,
    round: 0,
    phase: 'asleep',
    hop: 'rest',
    timer: restFrames(dc, 0),
    fling: null,
    landX: 0,
    fx: [],
  };
}

function pushFx(b: PooState, fx: PooFx): void {
  if (b.fx.length >= 32) b.fx.shift();
  b.fx.push(fx);
}

/** His box to his size, keeping his feet and middle where they are. */
function resize(b: PooState): void {
  const size = pooSize(b.hp);
  const cx = b.x + b.w / 2;
  b.w = Math.round(POO_W * size);
  b.h = Math.round(POO_H * size);
  b.x = cx - b.w / 2;
  b.y = b.floorY - b.h;
}

function towardHero(world: World, b: PooState): 1 | -1 {
  const p = world.player;
  return p.x + p.w / 2 < b.x + b.w / 2 ? -1 : 1;
}

/** Two little poos splash out of the bowl with him, never more than POO_MAX_LITTLE up. */
function splash(world: World, b: PooState): void {
  const floorRow = b.floorY / TILE;
  const up = world.enemies.filter((e) => e.alive && e.type === 'poolet').length;
  const left = Math.floor(b.patrol[0] / TILE);
  const right = Math.floor((b.patrol[1] + POO_W) / TILE);
  const cols = [right - 1, right - 3].slice(0, Math.max(0, POO_MAX_LITTLE - up));
  for (const col of cols) {
    const e = spawnEnemy(world.map, world.dc, { type: 'poolet', x: Math.max(left, col), floorRow });
    if (e) world.enemies.push(e);
  }
}

function defeat(world: World, b: PooState): void {
  b.phase = 'defeated';
  b.vx = 0;
  b.vy = 0;
  world.score += Math.round(1000 * world.dc.scoreMultiplier);
  world.sounds.push('win');
  pushFx(b, { kind: 'defeat', x: b.x + b.w / 2, y: b.y + b.h / 2 });
  // Nothing stinks or bites once he is gone: his waves settle, his little poos squash.
  world.enemyProjectiles = world.enemyProjectiles.filter((s) => s.type !== 'stink');
  for (const e of world.enemies) {
    if (!e.alive || e.type !== 'poolet') continue;
    e.alive = false;
    e.squashTimer = 30;
  }
}

/** A plop: a stink wave each way along the floor, but never one starting on the hero. */
function plop(world: World, b: PooState): void {
  const p = world.player;
  const speed = stinkSpeed(world.dc);
  for (const dir of [-1, 1]) {
    const x = b.x + b.w / 2 - 4 + dir * (b.w / 2 + 2);
    // Started inside the hero it would be a hit nobody could jump (browser, Hard, 2026-11-24).
    if (rectOverlap({ x: p.x - 4, y: p.y, w: p.w + 8, h: p.h }, { x, y: b.floorY - STINK_H, w: 8, h: STINK_H })) continue;
    world.enemyProjectiles.push({ x, y: b.floorY - STINK_H, vx: dir * speed, vy: 0, life: 400, type: 'stink' });
  }
  world.sounds.push('stomp');
  world.rumbles.push({ strong: 0.25, weak: 0.25, dur: 70 });
  pushFx(b, { kind: 'plop', x: b.x + b.w / 2, y: b.floorY });
}

/** Rest, crouch, hop toward the hero, land with a plop. */
function hopAbout(world: World, b: PooState): void {
  if (b.hop === 'air') {
    b.vy += POO_GRAVITY;
    b.x += b.vx;
    b.y += b.vy;
    const left = b.patrol[0];
    const right = b.patrol[1] + POO_W - b.w;
    if (b.x < left || b.x > right) {
      b.x = Math.max(left, Math.min(right, b.x));
      b.vx = 0;
    }
    if (b.y + b.h >= b.floorY) {
      b.y = b.floorY - b.h;
      b.vy = 0;
      b.vx = 0;
      b.hop = 'rest';
      b.timer = restFrames(world.dc, b.round);
      plop(world, b);
    }
    return;
  }
  b.facing = towardHero(world, b);
  if (--b.timer > 0) return;
  if (b.hop === 'rest') {
    b.hop = 'crouch';
    b.timer = POO_CROUCH_FRAMES;
    return;
  }
  b.hop = 'air';
  b.vx = b.facing * hopSpeed(world.dc, b.round);
  b.vy = -hopLift(world.dc);
}

/**
 * The hero lands on the flush button: the lid springs open and throws them back, and the
 * super flush starts sucking the poo in. It sucks his stink in too, so nothing waits where the
 * hero comes down.
 */
function press(world: World, b: PooState): void {
  const p = world.player;
  const button = buttonBox(b);
  b.landX = Math.max(b.patrol[0], button.x - FLING_DIST - p.w);
  b.fling = { t: 0, x0: p.x, y0: button.y - p.h, x1: b.landX };
  b.phase = 'sucked';
  b.timer = SUCK_FRAMES;
  b.vx = 0;
  b.vy = 0;
  b.y = b.floorY - b.h;
  world.enemyProjectiles = world.enemyProjectiles.filter((s) => s.type !== 'stink');
  world.sounds.push('boing');
  world.rumbles.push({ strong: 0.6, weak: 0.4, dur: 200 });
  pushFx(b, { kind: 'press', x: b.toiletX, y: button.y });
}

/** Across the floor and into the bowl; a piece goes down, and the rest is spat back out. */
function suck(world: World, b: PooState): void {
  const target = b.toiletX - LID_LEFT / 2 - b.w / 2;
  const gap = target - b.x;
  b.x += Math.sign(gap) * Math.min(Math.abs(gap), 1 + Math.abs(gap) * 0.08);
  if (--b.timer > 0) return;
  b.hp--;
  world.score += Math.round(500 * world.dc.scoreMultiplier);
  world.sounds.push('boss-roar');
  pushFx(b, { kind: 'hit', x: b.x + b.w / 2, y: b.y });
  if (b.hp <= 0) {
    defeat(world, b);
    return;
  }
  // Spat back out between where the hero came down and the toilet, smaller, with two little
  // poos: to flush again, the hero has to get past him.
  resize(b);
  const hero = b.landX + world.player.w;
  const between = hero + (buttonBox(b).x - hero) / 2;
  b.x = Math.max(b.patrol[0], Math.min(b.patrol[1] + POO_W - b.w, between - b.w / 2));
  b.round++;
  b.phase = 'spat';
  b.timer = POO_SPAT_FRAMES;
  splash(world, b);
  world.sounds.push('stomp');
  pushFx(b, { kind: 'spit', x: b.x + b.w / 2, y: b.y });
}

/** The hero's flight from the lid: along an arc, over everything, down on the floor by the bathtub. */
function fly(world: World, b: PooState): void {
  const f = b.fling;
  if (!f) return;
  const p = world.player;
  f.t++;
  const k = Math.min(1, f.t / FLING_FRAMES);
  const floor = b.floorY - p.h;
  p.x = f.x0 + (f.x1 - f.x0) * k;
  p.y = f.y0 + (floor - f.y0) * k - FLING_UP * Math.sin(Math.PI * k);
  p.vx = 0;
  p.vy = 0;
  p.facing = -1;
  if (k >= 1) {
    p.y = floor;
    b.fling = null;
  }
}

/** Arrows stick in him and do nothing. */
function arrows(world: World, b: PooState): void {
  for (const a of world.arrows) {
    if (a.life <= 0 || !rectOverlap({ x: a.x, y: a.y, w: 12, h: 4 }, b)) continue;
    a.life = 0;
    world.sounds.push('block');
    pushFx(b, { kind: 'thud', x: a.x, y: a.y });
  }
  world.arrows = world.arrows.filter((a) => a.life > 0);
}

/**
 * The part of him that hurts: his body, not the empty corners of his box. He is a heap with a
 * narrow tip, so a jump over him that only clips a corner is a jump over him.
 */
export function hurtBox(b: PooState): { x: number; y: number; w: number; h: number } {
  const side = Math.round(b.w * 0.12);
  // Lying squashed where he was spat, he is flat, and only that flat heap hurts.
  const top = Math.round(b.h * (b.phase === 'spat' ? 0.6 : 0.25));
  return { x: b.x + side, y: b.y + top, w: b.w - 2 * side, h: b.h - top };
}

/** Whether he is still in the air, flying out of the bowl to where he lands. */
export function flyingOut(b: PooState): boolean {
  return b.phase === 'spat' && b.timer > POO_SPAT_FRAMES - SPIT_FLIGHT;
}

/** Touching him hurts, on top or at the side; the hero is thrown back off him either way. */
function contact(world: World, b: PooState): void {
  const p = world.player;
  if (b.fling || flyingOut(b) || !rectOverlap(p, hurtBox(b))) return;
  const fromLeft = p.x + p.w / 2 < b.x + b.w / 2;
  p.vx = fromLeft ? -4 : 4;
  p.vy = Math.min(p.vy, -4);
  if (p.invincible <= 0) playerHit(world);
}

/** Coming down on the flush button, while he is about. */
function onTheButton(world: World, b: PooState): boolean {
  const p = world.player;
  const button = buttonBox(b);
  const feet = p.y + p.h;
  return !b.fling && p.vy > 0 && feet >= button.y - 2 && feet <= button.y + button.h
    && p.x + p.w > button.x && p.x < button.x + button.w;
}

export function stepPoo(world: World, b: PooState): void {
  fly(world, b);
  switch (b.phase) {
    case 'defeated':
      return;
    case 'asleep': {
      const p = world.player;
      if (p.x + p.w / 2 > b.patrol[0]) {
        b.phase = 'hopping';
        b.hop = 'rest';
        b.timer = restFrames(world.dc, 0);
        b.facing = towardHero(world, b);
        world.sounds.push('boss-roar');
        pushFx(b, { kind: 'wake', x: b.x + b.w / 2, y: b.y });
      }
      return;
    }
    case 'sucked':
      suck(world, b);
      return;
    case 'spat':
      if (--b.timer <= 0) {
        b.phase = 'hopping';
        b.hop = 'crouch';
        b.timer = POO_CROUCH_FRAMES;
      }
      break;
    case 'hopping':
      hopAbout(world, b);
      break;
  }
  if (onTheButton(world, b)) {
    press(world, b);
    return;
  }
  arrows(world, b);
  contact(world, b);
}
