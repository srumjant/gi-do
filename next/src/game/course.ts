import { TILE } from '../config/constants';
import {
  TILE_CRACKED, TILE_EMPTY, TILE_PLANK, TILE_SPRING,
  type CourseDef, type StationKind,
} from '../data/levels';
import { grantSillyPowerup } from './player';
import { getTile, rectOverlap } from './tiles';
import { PICKUP_RUMBLE, type Rect, type World } from './types';

/**
 * The obstacle course's rules (data/course.ts draws the level): targets that lower
 * drawbridges, power-up stations that come back, cracked blocks a big head smashes, springs
 * and checkpoint flags.
 *
 * The RULES live here, free of Phaser, so Vitest can check them; the engine work is
 * Phaser's. The tiles these rules write are drawn and collided by Phaser tilemap layers,
 * the effects in `fx` become Phaser particles and tweens (gfx/course.ts), and the giant
 * is stopped by an Arcade static body rather than by anything in this file.
 */

/** Frames before a taken station is back. */
export const STATION_COOLDOWN = 300;
/** Frames between one drawbridge plank and the next. */
export const PLANK_INTERVAL = 4;
/** A spring's throw, as a multiple of the difficulty's own jump. */
export const SPRING_FORCE = 1.5;
/** How long a spring's throw (and a cape's rescue) ignores letting go of jump. */
export const LIFT_FRAMES = 40;
/** The fewest arrows a bow station hands out, whatever the difficulty's own count. */
export const MIN_STATION_ARROWS = 5;

/**
 * A target's box, in pixels: the big bullseye at chest height, 22 wide and 36 tall, its
 * bottom on the row below the T. Any arrow a standing child fires at it goes in.
 */
const TARGET_W = 22;
const TARGET_H = 36;

export interface TargetState {
  /** The target's box, in pixels. */
  box: Rect;
  hit: boolean;
  /** What the shot changes, in order (data/levels.ts's CourseDef). */
  cells: Array<{ x: number; y: number; to: number }>;
  /** Cells changed so far. */
  done: number;
  /** Frames until the next one. */
  timer: number;
}

export interface StationState {
  kind: StationKind;
  /** Top-left, in pixels; the pickup box is one tile. */
  x: number;
  y: number;
  /** Frames until it is back; 0 while it is there to take. */
  cooldown: number;
  /** Whether a silly power-up from here has had its announcement in this life yet. */
  announced: boolean;
}

/** Something the scene should make a little show of. Positions in pixels. */
export interface CourseFx {
  kind: 'smash' | 'plank' | 'gate' | 'target' | 'flag' | 'spring' | 'station';
  x: number;
  y: number;
}

export interface CourseState {
  targets: TargetState[];
  stations: StationState[];
  /** Flags in tiles: `x` the column, `y` the floor row it stands on. */
  flags: Array<{ x: number; y: number }>;
  /**
   * Bumped whenever this module rewrites a map cell, so the scene knows to redraw the
   * tiles it owns (cracked blocks, planks) without comparing the whole map every frame.
   */
  mapVersion: number;
  /** Drained by the scene. Capped, so a driver that never drains it cannot grow it forever. */
  fx: CourseFx[];
}

const FX_CAP = 64;

function pushFx(course: CourseState, fx: CourseFx): void {
  if (course.fx.length >= FX_CAP) course.fx.shift();
  course.fx.push(fx);
}

/** A course's state as a level build starts it: nothing shot, nothing taken, nothing smashed. */
export function buildCourse(def: CourseDef): CourseState {
  return {
    targets: def.targets.map((t) => ({
      box: { x: t.x * TILE + (TILE - TARGET_W) / 2, y: (t.y + 1) * TILE - TARGET_H, w: TARGET_W, h: TARGET_H },
      hit: false,
      cells: t.cells.map((c) => ({ ...c })),
      done: 0,
      timer: 0,
    })),
    stations: def.stations.map((s) => ({
      kind: s.kind, x: s.x * TILE, y: s.y * TILE, cooldown: 0, announced: false,
    })),
    flags: def.flags.map((f) => ({ ...f })),
    mapVersion: 0,
    fx: [],
  };
}

/**
 * Taking a station. The bow and the cape are the adventure's own pickups; the three silly
 * ones are the rainbow block's prizes, chosen rather than rolled. A silly one stops the world
 * for its announcement the first time it is taken in a life, so a child learns what it is;
 * after that it is just the pickup sound.
 */
export function takeStation(world: World, station: StationState): void {
  const p = world.player;
  station.cooldown = STATION_COOLDOWN;
  if (station.kind === 'bow') {
    p.hasBow = true;
    p.bowCharges = Math.max(p.bowCharges, world.dc.bowCharges, MIN_STATION_ARROWS);
  } else if (station.kind === 'cape') {
    p.hasCape = true;
  } else {
    grantSillyPowerup(world, station.kind, !station.announced);
    station.announced = true;
  }
  if (station.kind === 'bow' || station.kind === 'cape' || world.powerupPopup === null) {
    world.sounds.push('pickup');
    world.rumbles.push(PICKUP_RUMBLE);
  }
}

function stepStations(world: World, course: CourseState): void {
  const p = world.player;
  const box = { x: p.x, y: p.y, w: p.w, h: p.h };
  for (const s of course.stations) {
    if (s.cooldown > 0) {
      s.cooldown--;
      if (s.cooldown === 0) pushFx(course, { kind: 'station', x: s.x + TILE / 2, y: s.y + TILE / 2 });
      continue;
    }
    if (rectOverlap(box, { x: s.x, y: s.y, w: TILE, h: TILE })) takeStation(world, s);
  }
}

/**
 * Arrows against targets. Runs after world.ts's stepArrows, so it sees each arrow where it
 * has just flown to; a hit spends the arrow. A chicken ray counts too — a target is not
 * fussy about what hits it.
 */
function stepTargets(world: World, course: CourseState): void {
  for (const t of course.targets) {
    if (t.hit) continue;
    for (const a of world.arrows) {
      if (a.life <= 0 || !rectOverlap({ x: a.x, y: a.y, w: 12, h: 4 }, t.box)) continue;
      a.life = 0;
      t.hit = true;
      t.timer = PLANK_INTERVAL * 3;
      world.score += Math.round(100 * world.dc.scoreMultiplier);
      world.sounds.push('win');
      pushFx(course, { kind: 'target', x: t.box.x + t.box.w / 2, y: t.box.y + t.box.h / 3 });
      break;
    }
  }
  world.arrows = world.arrows.filter((a) => a.life > 0);

  for (const t of course.targets) {
    if (!t.hit || t.done >= t.cells.length) continue;
    if (--t.timer > 0) continue;
    t.timer = PLANK_INTERVAL;
    const cell = t.cells[t.done++];
    world.map[cell.y][cell.x] = cell.to;
    course.mapVersion++;
    world.sounds.push('block');
    pushFx(course, {
      kind: cell.to === TILE_PLANK ? 'plank' : 'gate',
      x: cell.x * TILE + TILE / 2,
      y: cell.y * TILE + TILE / 2,
    });
  }

}

/**
 * A big head smashes any cracked block it touches, from any side: walking into a wall of
 * them knocks a hero-shaped hole through it. The box reaches a little past the body, and
 * further up, because the head that does the smashing is drawn far bigger than the hitbox.
 */
function stepCracked(world: World, course: CourseState): void {
  const p = world.player;
  if (p.bigHeadTimer <= 0) return;
  const reach = 4;
  const x0 = Math.floor((p.x - reach) / TILE);
  const x1 = Math.floor((p.x + p.w + reach - 1) / TILE);
  const y0 = Math.floor((p.y - reach * 3) / TILE);
  const y1 = Math.floor((p.y + p.h + reach - 1) / TILE);
  let smashed = 0;
  for (let ty = Math.max(0, y0); ty <= y1 && ty < world.map.length; ty++) {
    for (let tx = Math.max(0, x0); tx <= x1 && tx < world.map[0].length; tx++) {
      if (world.map[ty][tx] !== TILE_CRACKED) continue;
      world.map[ty][tx] = TILE_EMPTY;
      smashed++;
      pushFx(course, { kind: 'smash', x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
    }
  }
  if (smashed > 0) {
    course.mapVersion++;
    world.score += smashed * Math.round(20 * world.dc.scoreMultiplier);
    world.sounds.push('block', 'boing');
    world.rumbles.push({ strong: 0.4, weak: 0.4, dur: 90 });
  }
}

/**
 * A spring under your feet throws you up, higher than any jump, and the throw does not stop
 * when jump is let go (LIFT_FRAMES; see stepPlayer's jump cut). Coyote time and the jump
 * buffer are spent so a jump pressed on the same step cannot replace the throw with a
 * smaller one.
 */
function stepSprings(world: World, course: CourseState): void {
  const p = world.player;
  if (!p.onGround) return;
  // Either foot: Arcade keeps a body up while any part of it is on a tile, so a child can
  // stand on a one-tile spring with their middle over thin air.
  const feetY = p.y + p.h + 1;
  const onSpring = getTile(world.map, p.x + 2, feetY) === TILE_SPRING
    || getTile(world.map, p.x + p.w - 2, feetY) === TILE_SPRING;
  if (!onSpring) return;
  p.vy = world.dc.jumpForce * SPRING_FORCE;
  p.onGround = false;
  p.coyoteTime = 0;
  p.jumpBuffer = 0;
  p.liftTimer = LIFT_FRAMES;
  world.sounds.push('boing');
  pushFx(course, { kind: 'spring', x: p.x + p.w / 2, y: p.y + p.h });
}

/**
 * A flag counts once the player is past its pole, at any height: a spring or a fart jump can
 * carry a child clean over one, and that must not cost them the checkpoint.
 */
function stepFlags(world: World, course: CourseState): void {
  const p = world.player;
  for (const f of course.flags) {
    if (world.checkpoint && world.checkpoint.x >= f.x) continue;
    if (p.x + p.w / 2 < f.x * TILE + TILE / 2) continue;
    world.checkpoint = { x: f.x, y: f.y };
    world.sounds.push('coin', 'pickup');
    pushFx(course, { kind: 'flag', x: f.x * TILE + TILE / 2, y: (f.y - 3) * TILE });
  }
}

/**
 * One step of the course, after the arrows have flown and the enemies have moved, and
 * before the rescue check and the camera. Called by world.ts's stepWorld only
 * on a level that has a course.
 */
export function stepCourse(world: World): void {
  const course = world.course;
  if (!course) return;
  stepStations(world, course);
  stepTargets(world, course);
  stepCracked(world, course);
  stepSprings(world, course);
  stepFlags(world, course);
}

/**
 * Where a death brings you back to on a course: standing at the last flag touched, with
 * every enemy behind it already used up, so nothing from a finished section chases you.
 * Called by world.ts's respawnLevel after it has rebuilt the level from scratch.
 */
export function placeAtCheckpoint(world: World): void {
  const cp = world.checkpoint;
  if (!cp) return;
  const p = world.player;
  p.x = cp.x * TILE;
  p.y = cp.y * TILE - p.h;
  for (const d of world.pending) if (d.x < cp.x) d.spawned = true;
}

/** Whether a cracked block is still standing at this tile. For the scene's redraw. */
export function isCracked(world: World, tx: number, ty: number): boolean {
  return world.map[ty]?.[tx] === TILE_CRACKED;
}
