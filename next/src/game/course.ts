import { TILE } from '../config/constants';
import {
  TILE_CRACKED, TILE_EMPTY, TILE_GATE, TILE_LAVA, TILE_PLANK, TILE_SPRING, TILE_WATER,
  type CourseDef, type StationKind,
} from '../data/levels';
import { grantSillyPowerup, playerDie, playerHit } from './player';
import { getTile, isSolid, rectOverlap } from './tiles';
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
  kind: 'smash' | 'plank' | 'gate' | 'target' | 'flag' | 'spring' | 'station' | 'splash' | 'vent' | 'drip' | 'pop';
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
  /** Taps over the floor, each counting down to its next drop. */
  taps: Array<{ x: number; y: number; timer: number }>;
  /** Toilet brushes: each one's pivot in pixels, and the angle it has turned to. */
  brushes: Array<{ x: number; y: number; angle: number }>;
  /** Soap dishes (tiles: the column, and the floor row the dish stands on), each counting down. */
  soaps: Array<{ x: number; y: number; timer: number }>;
  /** Bubbles rising from them. */
  bubbles: Bubble[];
  /** Rubber ducks on the baths. */
  ducks: Duck[];
  /** The bubble or duck the hero stands on, if any. */
  riding: Bubble | Duck | null;
  /** Where the hero's feet were at the end of the last step, so a bubble knows a hero came down onto it. */
  feet: number | null;
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
    taps: (def.taps ?? []).map((t) => ({ ...t, timer: 60 + ((t.x * 37) % 90) })),
    // The first bubble soon after a hero comes near.
    soaps: (def.soaps ?? []).map((s) => ({ ...s, timer: 30 })),
    bubbles: [],
    // Each from an end of its stretch: the first on a bath from its left end going right, the
    // next from its right end going left, and so on, so neighbours always meet at their border.
    ducks: (def.ducks ?? []).map((d) => {
      const all = def.ducks ?? [];
      let k = 0;
      for (let cur = d; ; k++) {
        const before = all.find((e) => e.y === cur.y && e.right + 1 === cur.left);
        if (!before) break;
        cur = before;
      }
      const left = d.left * TILE;
      const right = (d.right + 1) * TILE;
      const first = k % 2 === 0;
      return { x: first ? left : right - DUCK_W, y: d.y * TILE - DUCK_SINK, w: DUCK_W, dir: first ? 1 : -1, left, right, dx: 0 } as Duck;
    }),
    riding: null,
    feet: null,
    // Each starting at its own angle, so two in a row do not turn as one.
    brushes: (def.brushes ?? []).map((b) => ({
      x: b.x * TILE + TILE / 2, y: b.y * TILE + TILE / 2, angle: (((b.x * 37) % 90) / 90) * Math.PI,
    })),
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

/** Frames a tap wobbles, a drop swelling at its spout, before it lets go. */
export const TAP_WARN_FRAMES = 45;
/** A drop's box (the enemy projectiles' 8px square) and how fast it falls. */
export const DROP_W = 8;
export const DROP_H = 8;
export const DROP_SPEED = 3;
/** How near the hero a tap has to be to drip: as a vent, so far-off taps make no sound. */
export const TAP_REACH = VENT_REACH;

/** Frames between a tap's drops: slow on super easy, quick on hard, as a vent's. */
export function tapInterval(dc: { enemyShootInterval: number }): number {
  return ventInterval(dc);
}

/** Whether a tap is about to let go: the scene swells a drop at its spout. */
export function tapWarning(tap: { timer: number }): boolean {
  return tap.timer <= TAP_WARN_FRAMES;
}

/**
 * Each tap near the hero counts down and lets go of a drop, which falls straight down; a drop
 * about to reach whatever is under it splashes there and is gone. Touching one on the way
 * down is a hit (world.ts's stepEnemyProjectiles, as any enemy shot).
 */
function stepTaps(world: World, course: CourseState): void {
  const p = world.player;
  for (const tap of course.taps) {
    if (Math.abs(tap.x * TILE + TILE / 2 - (p.x + p.w / 2)) > TAP_REACH) continue;
    if (--tap.timer > 0) continue;
    tap.timer = tapInterval(world.dc);
    world.enemyProjectiles.push({
      x: tap.x * TILE + (TILE - DROP_W) / 2,
      y: (tap.y + 1) * TILE,
      vx: 0,
      vy: DROP_SPEED,
      life: 300,
      type: 'drop',
    });
    world.sounds.push('drip');
  }
  const landed = world.enemyProjectiles.filter((ep) => ep.type === 'drop'
    && isSolid(getTile(world.map, ep.x + DROP_W / 2, ep.y + DROP_H + ep.vy)));
  if (landed.length === 0) return;
  for (const ep of landed) {
    pushFx(course, { kind: 'drip', x: ep.x + DROP_W / 2, y: Math.floor((ep.y + DROP_H + ep.vy) / TILE) * TILE });
  }
  world.enemyProjectiles = world.enemyProjectiles.filter((ep) => !landed.includes(ep));
}

/** A soap bubble (the home world): its box's left, its top (where a rider stands), its width, where its top started, its age. */
export interface Bubble {
  x: number;
  y: number;
  w: number;
  from: number;
  age: number;
  popped: boolean;
}
export const BUBBLE_W = 32;
/** Pixels a bubble rises a frame. */
export const BUBBLE_RISE = 0.7;
/** The longest a bubble lasts before it pops of itself. */
export const BUBBLE_LIFE = 900;

/**
 * A rubber duck on a bath (the home world): its box's left and its back's top (where a rider
 * stands), its width, which way it is drifting, the stretch of the bath it keeps to (pixels,
 * `right` its far edge), and how far it moved this step, which a rider moves with it.
 */
export interface Duck {
  x: number;
  y: number;
  w: number;
  dir: 1 | -1;
  left: number;
  right: number;
  dx: number;
}
export const DUCK_W = 32;
/** How far down into the water a duck's back sits from the water's top. */
export const DUCK_SINK = 6;

/** Pixels a duck drifts a frame: slower on Super Easy. */
export function duckSpeed(dc: { enemySpeed: number }): number {
  return 0.3 + 0.25 * dc.enemySpeed;
}

/** Something a hero can stand on that moves: a bubble or a duck. */
type Ride = Bubble | Duck;

/** Frames between a soap dish's bubbles: more often on Super Easy. */
export function bubbleInterval(dc: { enemyShootInterval: number }): number {
  return Math.round(260 - dc.enemyShootInterval / 2);
}

/** Whether anything solid is at pixel row `y` across `x0..x1`. */
function solidAcross(world: World, x0: number, x1: number, y: number): boolean {
  for (let x = x0; x <= x1; x += TILE / 2) if (isSolid(getTile(world.map, x, y))) return true;
  return isSolid(getTile(world.map, x1, y));
}

/**
 * Soap dishes near the hero let go of bubbles, which rise and pop at whatever is over them (over
 * their rider's head, when ridden); rubber ducks drift back and forth over their stretches of the
 * bath. Both are solid only from above: a hero coming down onto one lands, and a rider is carried
 * along, up with a bubble until they jump off or it pops, sideways with a duck. Stepped after the hero
 * has moved, so it can put them back on top: both movers place the hero's body from `p.x`/`p.y`
 * every step (physics/player.ts), as the poo fight's fling relies on too.
 */
function stepRides(world: World, course: CourseState): void {
  const p = world.player;
  for (const s of course.soaps) {
    if (Math.abs(s.x * TILE - (p.x + p.w / 2)) > VENT_REACH) continue;
    if (--s.timer > 0) continue;
    s.timer = bubbleInterval(world.dc);
    const top = s.y * TILE;
    course.bubbles.push({ x: s.x * TILE + TILE / 2 - BUBBLE_W / 2, y: top, w: BUBBLE_W, from: top, age: 0, popped: false });
  }
  const rides: Ride[] = [...course.bubbles, ...course.ducks];
  const was = new Map(rides.map((r) => [r, r.y]));
  for (const b of course.bubbles) {
    b.y -= BUBBLE_RISE;
    b.age++;
    const head = b === course.riding ? b.y - p.h : b.y;
    if (b.age > BUBBLE_LIFE || head < TILE || solidAcross(world, b.x + 2, b.x + BUBBLE_W - 2, head)) b.popped = true;
  }
  const speed = duckSpeed(world.dc);
  for (const d of course.ducks) {
    const x0 = d.x;
    d.x += d.dir * speed;
    if (d.x <= d.left) {
      d.x = d.left;
      d.dir = 1;
    } else if (d.x + d.w >= d.right) {
      d.x = d.right - d.w;
      d.dir = -1;
    }
    d.dx = d.x - x0;
  }
  // A rider on a duck goes along with it, unless a wall is in the way.
  const on = course.riding;
  if (on && 'dx' in on && on.dx !== 0) {
    const nx = p.x + on.dx;
    const edge = on.dx > 0 ? nx + p.w : nx;
    if (!isSolid(getTile(world.map, edge, p.y + 2)) && !isSolid(getTile(world.map, edge, p.y + p.h - 2))) p.x = nx;
  }
  const feet = p.y + p.h;
  const over = (r: Ride) => p.x + p.w > r.x + 2 && p.x < r.x + r.w - 2;
  let riding: Ride | null = null;
  if (!world.dead && p.vy >= 0) {
    for (const r of rides) {
      if (('popped' in r && r.popped) || !over(r)) continue;
      const landed = course.feet !== null && course.feet <= (was.get(r) ?? r.y) + 1 && feet >= r.y;
      if (r === course.riding || landed) {
        riding = r;
        break;
      }
    }
  }
  if (riding) {
    p.y = riding.y - p.h;
    p.vy = 0;
    p.onGround = true;
  }
  course.riding = riding;
  for (const b of course.bubbles) {
    if (!b.popped) continue;
    pushFx(course, { kind: 'pop', x: b.x + BUBBLE_W / 2, y: b.y + BUBBLE_W / 2 });
    world.sounds.push('pop');
  }
  course.bubbles = course.bubbles.filter((b) => !b.popped);
  course.feet = p.y + p.h;
}

/** A toilet brush's half length: it spins round its middle (the home world). */
export const BRUSH_R = 36;

/** Radians a brush turns a frame: slower on Super Easy. */
export function brushSpeed(dc: { enemySpeed: number }): number {
  return 0.018 + 0.012 * dc.enemySpeed;
}

/** Whether a brush at its angle touches a box anywhere along its length. */
export function brushTouches(b: { x: number; y: number; angle: number }, box: Rect): boolean {
  const dx = Math.cos(b.angle) * BRUSH_R;
  const dy = Math.sin(b.angle) * BRUSH_R;
  for (let i = -10; i <= 10; i++) {
    const px = b.x + (dx * i) / 10;
    const py = b.y + (dy * i) / 10;
    if (px > box.x - 3 && px < box.x + box.w + 3 && py > box.y - 3 && py < box.y + box.h + 3) return true;
  }
  return false;
}

/** Brushes spin; one that touches the hero is a hit. Nothing stops a brush. */
function stepBrushes(world: World, course: CourseState): void {
  const p = world.player;
  for (const b of course.brushes) {
    b.angle += brushSpeed(world.dc);
    if (world.dead || p.invincible > 0) continue;
    if (brushTouches(b, { x: p.x + 2, y: p.y, w: p.w - 4, h: p.h })) playerHit(world);
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
  // First, so whatever follows sees the hero back on the bubble or duck they stand on.
  stepRides(world, course);
  stepStations(world, course);
  stepTargets(world, course);
  stepDoors(world, course);
  stepCracked(world, course);
  stepSprings(world, course);
  stepVents(world, course);
  stepTaps(world, course);
  stepBrushes(world, course);
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
