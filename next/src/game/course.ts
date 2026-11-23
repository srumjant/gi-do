import { TILE } from '../config/constants';
import {
  TILE_CRACKED, TILE_EMPTY, TILE_GATE, TILE_LAVA, TILE_PLANK, TILE_SPRING, TILE_WATER,
  type CourseDef, type StationKind,
} from '../data/levels';
import { grantSillyPowerup, playerDie } from './player';
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
 * A target's box, in pixels: 22 wide and 68 tall, its bottom on the row below the T. Sized for
 * both ends of the jump (browser, 2026-11-22): super easy's high jump carries an arrow over a
 * short box, and hard's low one reaches a high target only at the very top. At 68, a target
 * hung at row 19 takes a shot from anywhere in the top third of a jump on every difficulty,
 * and a standing shot still passes under it.
 */
const TARGET_W = 22;
const TARGET_H = 68;

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
  /** A helper's T (data/levels.ts's CourseDef), or null. */
  partOf: number | null;
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
  kind: 'smash' | 'plank' | 'gate' | 'target' | 'flag' | 'spring' | 'station' | 'splash' | 'vent';
  x: number;
  y: number;
  /** A splash into icy water rather than lava. */
  water?: boolean;
}

export interface CourseState {
  targets: TargetState[];
  stations: StationState[];
  /** Flags in tiles: `x` the column, `y` the floor row it stands on. */
  flags: Array<{ x: number; y: number }>;
  /** Doors (`:`), open until the player is through, then shut for good. */
  doors: Array<{ x: number; cells: Array<{ x: number; y: number }>; shut: boolean }>;
  /** Vents in the lava, each counting down to its next fireball. */
  vents: Array<{ x: number; y: number; timer: number }>;
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
      partOf: t.partOf ?? null,
      timer: 0,
    })),
    stations: def.stations.map((s) => ({
      kind: s.kind, x: s.x * TILE, y: s.y * TILE, cooldown: 0, announced: false,
    })),
    flags: def.flags.map((f) => ({ ...f })),
    doors: def.doors.map((d) => ({ x: d.x, cells: d.cells.map((c) => ({ ...c })), shut: false })),
    // Out of step with each other, so a row of vents is a rhythm to read, not one wall of fire.
    vents: def.vents.map((v) => ({ ...v, timer: 60 + ((v.x * 37) % 90) })),
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

/** Whether target `i` and every helper of it have been hit. */
function groupDone(course: CourseState, i: number): boolean {
  return course.targets[i].hit && course.targets.every((o) => o.partOf !== i || o.hit);
}

/**
 * Arrows against targets, after world.ts's stepArrows, so each arrow is where it has just flown
 * to; a hit spends the arrow. A T opens what it owns once it and its helpers (t) are all hit:
 * the first of two chimes, the last one sounds like the gate opening.
 */
function stepTargets(world: World, course: CourseState): void {
  course.targets.forEach((t, i) => {
    if (t.hit) return;
    for (const a of world.arrows) {
      if (a.life <= 0 || !rectOverlap({ x: a.x, y: a.y, w: 12, h: 4 }, t.box)) continue;
      a.life = 0;
      t.hit = true;
      t.timer = PLANK_INTERVAL * 3;
      world.score += Math.round(100 * world.dc.scoreMultiplier);
      world.sounds.push(groupDone(course, t.partOf ?? i) ? 'win' : 'coin');
      pushFx(course, { kind: 'target', x: t.box.x + t.box.w / 2, y: t.box.y + t.box.h / 3 });
      break;
    }
  });
  world.arrows = world.arrows.filter((a) => a.life > 0);

  course.targets.forEach((t, i) => {
    if (t.done >= t.cells.length || !groupDone(course, i)) return;
    if (--t.timer > 0) return;
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
  });
}

/** A door shuts behind the player once they are a step past it, and stays shut. */
function stepDoors(world: World, course: CourseState): void {
  const p = world.player;
  for (const d of course.doors) {
    if (d.shut || p.x < (d.x + 1) * TILE + 4) continue;
    d.shut = true;
    for (const c of d.cells) {
      world.map[c.y][c.x] = TILE_GATE;
      pushFx(course, { kind: 'gate', x: c.x * TILE + TILE / 2, y: c.y * TILE + TILE / 2 });
    }
    course.mapVersion++;
    world.sounds.push('block', 'boss-roar');
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

/** Frames a vent glows before it erupts. */
export const VENT_WARN_FRAMES = 45;

/** Frames between a vent's fireballs: slow on super easy, quick on hard. */
export function ventInterval(dc: { enemyShootInterval: number }): number {
  return Math.round(dc.enemyShootInterval * 0.9) + 40;
}

/** Whether a vent is about to erupt: the scene makes it glow. */
export function ventWarning(vent: { timer: number }): boolean {
  return vent.timer <= VENT_WARN_FRAMES;
}

/**
 * Lava under the hero's feet is a fall, as a pit is: a cape throws them up out of it, once, as
 * from a pit (player.ts), and without one it is the end of a life. Winter's icy water is the
 * same fall in another colour.
 */
function stepLava(world: World, course: CourseState): void {
  const p = world.player;
  if (world.dead) return;
  const y0 = Math.floor((p.y + p.h - 4) / TILE);
  const y1 = Math.floor((p.y + p.h - 1) / TILE);
  const x0 = Math.floor((p.x + 2) / TILE);
  const x1 = Math.floor((p.x + p.w - 3) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const code = world.map[ty]?.[tx];
      if (code !== TILE_LAVA && code !== TILE_WATER) continue;
      pushFx(course, { kind: 'splash', x: p.x + p.w / 2, y: ty * TILE, water: code === TILE_WATER });
      if (p.hasCape) {
        p.hasCape = false;
        p.invincible = 60;
        p.vy = -10;
        p.liftTimer = 30;
        p.y = ty * TILE - p.h - 1;
        world.sounds.push('cape');
      } else {
        playerDie(world);
      }
      return;
    }
  }
}

/**
 * How near the hero a vent has to be to erupt. A cannon only fires once it is spawned, near the
 * hero; a vent is part of the map, and far off it was a cannon's bang every second and a half,
 * all level long, from nothing on screen (browser, 2026-11-22).
 */
export const VENT_REACH = 20 * TILE;

/** Each vent near the hero counts down, glows (ventWarning), and spits a fireball straight up. */
function stepVents(world: World, course: CourseState): void {
  const p = world.player;
  for (const v of course.vents) {
    if (Math.abs(v.x * TILE - (p.x + p.w / 2)) > VENT_REACH) continue;
    if (--v.timer > 0) continue;
    v.timer = ventInterval(world.dc);
    world.enemyProjectiles.push({
      x: v.x * TILE + 4,
      y: v.y * TILE - 8,
      vx: 0,
      vy: -(2.4 + world.dc.enemySpeed),
      life: 50,
      type: 'fireball',
    });
    world.sounds.push('cannon-fire');
    pushFx(course, { kind: 'vent', x: v.x * TILE + TILE / 2, y: v.y * TILE });
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
  stepDoors(world, course);
  stepCracked(world, course);
  stepSprings(world, course);
  stepVents(world, course);
  stepLava(world, course);
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
