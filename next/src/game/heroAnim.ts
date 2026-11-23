import type { HeroFrame } from './heroFrames';
import type { World } from './types';

/**
 * How the hero looks this step (docs/superpowers/specs/2026-11-23-ninja-and-cinderella-skins-design.md,
 * Animations): idle breathing and blinking, the shot, the wince when the cape is lost, and the
 * hop and fall when a life is. Presentation only: it reads the player and never writes it, so
 * no animation can change what a child can reach or what hits them. Stepped once per
 * simulation step, so a slow screen plays it at the same speed as the game.
 */

/** What it remembers between steps. */
export interface HeroAnim {
  /** Steps stood still. */
  still: number;
  /** Steps of wince left. */
  ouch: number;
  /** Steps since a life was lost (0 while alive). */
  dying: number;
  /** Whether the hero had the cape last step, to see it go. */
  hadCape: boolean;
}

export function createHeroAnim(): HeroAnim {
  return { still: 0, ouch: 0, dying: 0, hadCape: false };
}

/** The little the animation reads off the player and the world. */
export interface HeroState {
  /** `player.frame`: 0 stand, 1 run, 2 jump. */
  frame: number;
  facing: number;
  hasCape: boolean;
  arrowCooldown: number;
  dead: boolean;
}

/** The hero's state, read off the world. */
export function heroStateOf(world: World): HeroState {
  const p = world.player;
  return { frame: p.frame, facing: p.facing, hasCape: p.hasCape, arrowCooldown: p.arrowCooldown, dead: world.dead };
}

/** The picture and how to place it; dx and dy in world pixels, the angle in radians. */
export interface HeroLook {
  frame: HeroFrame;
  dx: number;
  dy: number;
  angle: number;
  flipY: boolean;
  /** The bow held out in front. */
  bow: boolean;
}

/** Standing still this long before the idle starts. */
export const IDLE_AFTER = 45;
/** A breath: up a pixel for this long, down for this long. */
export const BREATH = 40;
/** A blink this long, once every so often. */
export const BLINK_EVERY = 120;
export const BLINK_FOR = 7;
/** Firing sets the cooldown to 15: the shot shows while it is above this. */
export const SHOOT_ABOVE = 8;
/** And kicks back a pixel while it is above this. */
export const RECOIL_ABOVE = 12;
/** The wince when the cape goes: how long, how far back, how far over. */
export const OUCH_FOR = 24;
export const KNOCK = 4;
export const TILT = 0.3;
/** A life lost: a hang, then a hop up and a fall. */
export const DEATH_HANG = 14;
export const DEATH_HOP = 5;
export const DEATH_GRAVITY = 0.3;

const POSES: readonly HeroFrame[] = ['stand', 'run', 'jump'];

export function stepHeroAnim(a: HeroAnim, s: HeroState): HeroLook {
  const base = POSES[s.frame] ?? 'stand';
  const look: HeroLook = { frame: base, dx: 0, dy: 0, angle: 0, flipY: false, bow: false };
  if (a.hadCape && !s.hasCape) a.ouch = OUCH_FOR;
  a.hadCape = s.hasCape;

  if (s.dead) {
    a.dying++;
    a.still = 0;
    a.ouch = 0;
    const t = Math.max(0, a.dying - DEATH_HANG);
    return { ...look, frame: 'ouch', dy: -DEATH_HOP * t + (DEATH_GRAVITY * t * t) / 2, flipY: t > 0 };
  }
  a.dying = 0;

  if (a.ouch > 0) {
    const k = a.ouch / OUCH_FOR;
    a.ouch--;
    a.still = 0;
    return { ...look, frame: 'ouch', dx: -s.facing * KNOCK * k, angle: -s.facing * TILT * k };
  }

  if (s.arrowCooldown > SHOOT_ABOVE) {
    a.still = 0;
    return {
      ...look,
      // In the air the legs stay the jump's; on the ground, the arm goes out.
      frame: base === 'jump' ? 'jump' : 'shoot',
      dx: s.arrowCooldown > RECOIL_ABOVE ? -s.facing : 0,
      bow: true,
    };
  }

  if (base !== 'stand') {
    a.still = 0;
    return look;
  }
  a.still++;
  if (a.still <= IDLE_AFTER) return look;
  return { ...look, ...idleLook(a.still - IDLE_AFTER - 1) };
}

/** Breathing and blinking, `t` steps into standing still: shared with the character screen. */
export function idleLook(t: number): { frame: HeroFrame; dy: number } {
  const blink = t % BLINK_EVERY >= BLINK_EVERY - BLINK_FOR;
  return { frame: blink ? 'blink' : 'stand', dy: Math.floor(t / BREATH) % 2 === 1 ? -1 : 0 };
}
