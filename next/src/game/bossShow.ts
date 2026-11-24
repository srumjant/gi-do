import type { Villain } from '../data/levels';
import type { CourseBoss } from './bosses';
import { CHEF_HP } from './bosses/pizzaChef';
import { POO_HP } from './bosses/poo';
import { PTERO_HP } from './bosses/pterodactyl';
import { QUEEN_HP } from './bosses/dollQueen';
import { TREX_HP, TREX_ROUNDS } from './bosses/tRex';
import { TOOMAS_HP } from './bosses/vanaToomas';
import { YETI_HP } from './bosses/yeti';

/**
 * The boss show (docs/superpowers/specs/2026-11-23-boss-show-design.md): what a boss says and
 * how its body moves, from its state, the events its view drained and the hero. Presentation
 * only: it reads the fight and never writes it, so it cannot make one unwinnable. Run once per
 * rendered frame, it advances by the simulation steps taken since, so a slow screen plays it at
 * the game's speed. gfx/bossShow.ts draws it.
 */

/** Every boss's hearts, for how red it has gone. */
export const HEARTS: Readonly<Record<Villain, number>> = {
  dollQueen: QUEEN_HP, pterodactyl: PTERO_HP, vanaToomas: TOOMAS_HP, pizzaChef: CHEF_HP, yeti: YETI_HP, tRex: TREX_HP,
  poo: POO_HP,
};

/** The events that mean "that did not count yet", each boss's own (game/bosses/*.ts). */
export const SHRUGS: Readonly<Record<Villain, readonly string[]>> = {
  dollQueen: ['clang'],
  pterodactyl: ['bounce'],
  vanaToomas: ['clang'],
  pizzaChef: ['swat', 'bonk'],
  yeti: ['thud', 'bonk'],
  tRex: ['thud', 'bonk'],
  poo: ['thud'],
};

/** The entrance's hop, and how high it goes in pixels. */
export const HOP = 30;
export const HOP_HEIGHT = 14;
/** The name banner, the last BANNER_FADE of it fading. */
export const BANNER = 100;
export const BANNER_FADE = 20;
/** How long a line stays up. */
export const LINE = 90;
/** A "that did not count" line waits this long before it comes again. */
export const SHRUG_GAP = 180;
/** On Super Easy and Easy, stuck this long without a hit, the boss blurts out a hint; then again every so often. */
export const HINT_AFTER = 480;
export const HINT_EVERY = 600;
/** A hit's white flash and squash; a shrug's wobble. */
export const FLASH = 12;
export const SQUASH = 14;
export const WOBBLE = 20;
/** A blink, every so often, while awake and not dizzy. */
export const BLINK_EVERY = 200;
export const BLINK_FOR = 6;
/** Frames before an attack in which the boss crouches. */
export const CROUCH = 18;
/** How red the last heart makes it: the red copy's alpha with every heart gone. */
export const RED_MAX = 0.35;

/** How much a line matters, when several come at once: the higher wins, and may cut one off. */
const PRIORITY = { intro: 1, hint: 1, shrug: 2, laugh: 3, hit: 5, beaten: 6 } as const;

export interface BossShowState {
  /** world.animFrame when last run; null before the first. */
  frame: number | null;
  /** Steps since the show began, for its cycles. */
  t: number;
  awake: boolean;
  beaten: boolean;
  hop: number;
  banner: number;
  flash: number;
  squash: number;
  wobble: number;
  line: string | null;
  linePriority: number;
  lineLeft: number;
  lastShrug: number;
  /** Steps awake since the last hit, for the hints. */
  stuck: number;
  /** Hits seen, to take "AI!", "OI-OI!" and "AUH!" in turn. */
  hits: number;
  heroDead: boolean;
  heroHadCape: boolean;
  lastX: number | null;
}

export function createBossShow(): BossShowState {
  return {
    frame: null, t: 0, awake: false, beaten: false, hop: 0, banner: 0, flash: 0, squash: 0, wobble: 0,
    line: null, linePriority: 0, lineLeft: 0, lastShrug: -Infinity, stuck: 0, hits: 0,
    heroDead: false, heroHadCape: false, lastX: null,
  };
}

export interface ShowInput {
  boss: CourseBoss;
  /** The fx kinds the boss's view drained this frame. */
  events: readonly string[];
  /** world.animFrame: the show advances by the steps since it last ran. */
  frame: number;
  heroDead: boolean;
  heroHasCape: boolean;
  /** Super Easy or Easy: the boss blurts out hints. */
  hints: boolean;
}

/** How the boss looks this frame, laid over where its view put it. */
export interface BossLook {
  /** Pixels up (negative) or down. */
  dy: number;
  /** Squash and stretch, about the feet. */
  sx: number;
  sy: number;
  /** Degrees. */
  angle: number;
  /** 0..1: the white copy's alpha. */
  flash: number;
  /** 0..1: the red copy's alpha. */
  red: number;
  eyesShut: boolean;
  /** 0..1: the name banner's alpha; 0 when gone. */
  banner: number;
}

export interface ShowFrame {
  look: BossLook;
  /** The line on show (an i18n key), or null. */
  line: string | null;
  /** Whether the line came this frame. */
  newLine: boolean;
}

/** Winding up an attack: the moment before a heart, a rock, a stamp, a pizza, a charge, a roar. */
export function windingUp(b: CourseBoss): boolean {
  switch (b.kind) {
    case 'dollQueen': return b.phase === 'shielded' && b.throwTimer < CROUCH;
    case 'pterodactyl': return b.phase === 'flying' && b.dropTimer < CROUCH;
    case 'vanaToomas': return b.phase === 'windup';
    case 'pizzaChef': return b.phase === 'cooking' && b.throwTimer < CROUCH;
    case 'yeti': return b.phase === 'windup';
    case 'tRex': return b.phase === 'roaring';
    case 'poo': return b.phase === 'hopping' && b.hop === 'crouch';
  }
}

/** The hint for what the fight wants now: reverse psychology, "just don't ...". */
export function hintFor(b: CourseBoss): string | null {
  switch (b.kind) {
    case 'dollQueen': return b.phase === 'shielded' ? 'hint_target' : b.phase === 'dizzy' ? 'hint_head' : null;
    case 'pterodactyl': return b.phase === 'flying' ? 'hint_fart' : null;
    case 'vanaToomas': return b.phase === 'marching' || b.phase === 'windup' ? 'hint_bighead' : null;
    case 'pizzaChef': return b.phase === 'cooking' ? 'hint_chicken' : b.phase === 'chicken' ? 'hint_head' : null;
    case 'yeti': return b.phase === 'windup' || b.phase === 'charging' ? 'hint_jump_over' : b.phase === 'dizzy' ? 'hint_head' : null;
    case 'tRex': {
      if (b.phase !== 'walking' && b.phase !== 'roaring') return null;
      const tool = TREX_ROUNDS[b.round];
      return tool === 'bow' ? 'hint_target' : tool === 'fart' ? 'hint_fart' : tool === 'bighead' ? 'hint_bighead' : 'hint_chicken';
    }
    case 'poo': return b.phase === 'hopping' || b.phase === 'spat' ? 'hint_button' : null;
  }
}

const PLAIN: BossLook = { dy: 0, sx: 1, sy: 1, angle: 0, flash: 0, red: 0, eyesShut: false, banner: 0 };

export function stepBossShow(s: BossShowState, input: ShowInput): ShowFrame {
  const b = input.boss;
  const steps = s.frame === null ? 1 : Math.max(0, Math.min(10, input.frame - s.frame));
  s.frame = input.frame;
  s.t += steps;
  s.hop = Math.max(0, s.hop - steps);
  s.banner = Math.max(0, s.banner - steps);
  s.flash = Math.max(0, s.flash - steps);
  s.squash = Math.max(0, s.squash - steps);
  s.wobble = Math.max(0, s.wobble - steps);
  s.lineLeft -= steps;
  if (s.lineLeft <= 0) {
    s.line = null;
    s.linePriority = 0;
  }
  const stuckBefore = s.stuck;
  if (s.awake && !s.beaten) s.stuck += steps;

  let offer: { key: string; priority: number } | null = null;
  const say = (key: string, priority: number): void => {
    if (!offer || priority > offer.priority) offer = { key, priority };
  };
  const events = input.events;

  if (events.includes('wake') && !s.awake) {
    s.awake = true;
    s.hop = HOP;
    s.banner = BANNER;
    s.stuck = 0;
    say(`boss_intro_${b.kind}`, PRIORITY.intro);
  }
  if (events.includes('hit')) {
    s.hits++;
    s.flash = FLASH;
    s.squash = SQUASH;
    s.stuck = 0;
    say(b.hp === 1 ? 'boss_last' : `boss_hit_${((s.hits - 1) % 3) + 1}`, PRIORITY.hit);
  }
  const shrugged = events.some((e) => SHRUGS[b.kind].includes(e));
  if (shrugged) {
    s.wobble = WOBBLE;
    if (s.t - s.lastShrug >= SHRUG_GAP) say(`boss_shrug_${b.kind}`, PRIORITY.shrug);
  }
  const hurt = (input.heroDead && !s.heroDead) || (s.heroHadCape && !input.heroHasCape);
  s.heroDead = input.heroDead;
  s.heroHadCape = input.heroHasCape;
  if (hurt && s.awake && !s.beaten) say('boss_laugh', PRIORITY.laugh);
  if (b.phase === 'defeated' && !s.beaten) {
    s.beaten = true;
    say(`boss_beaten_${b.kind}`, PRIORITY.beaten);
  }
  if (input.hints && s.awake && !s.beaten && s.stuck >= HINT_AFTER) {
    const round = (stuck: number): number => (stuck < HINT_AFTER ? -1 : Math.floor((stuck - HINT_AFTER) / HINT_EVERY));
    const hint = hintFor(b);
    if (hint && round(s.stuck) > round(stuckBefore)) say(hint, PRIORITY.hint);
  }

  let newLine = false;
  const chosen = offer as { key: string; priority: number } | null;
  if (chosen && (s.line === null || chosen.priority >= s.linePriority)) {
    s.line = chosen.key;
    s.linePriority = chosen.priority;
    s.lineLeft = LINE;
    newLine = true;
    if (chosen.key === `boss_shrug_${b.kind}`) s.lastShrug = s.t;
  }

  const moved = s.lastX !== null && Math.abs(b.x - s.lastX) > 0.2 * Math.max(1, steps);
  s.lastX = b.x;
  if (s.beaten) return { look: { ...PLAIN }, line: s.line, newLine };

  const look: BossLook = { ...PLAIN };
  if (moved) {
    // In step: a bob and a little squash.
    const phase = s.t * 0.3;
    look.dy = -Math.abs(Math.sin(phase)) * 2;
    look.sy = 1 + 0.05 * Math.sin(phase * 2);
  } else {
    // A slow breath.
    look.sy = 1 + 0.025 * Math.sin(s.t * 0.07);
  }
  look.sx = 1 - (look.sy - 1) / 2;
  if (windingUp(b)) {
    look.sy *= 0.9;
    look.sx *= 1.08;
  }
  if (s.hop > 0) look.dy -= HOP_HEIGHT * Math.sin(Math.PI * (1 - s.hop / HOP));
  if (s.squash > 0) {
    const k = s.squash / SQUASH;
    look.sx *= 1 + 0.2 * k;
    look.sy *= 1 - 0.2 * k;
  }
  look.flash = s.flash / FLASH;
  if (s.wobble > 0) look.angle = Math.sin(s.wobble * 0.9) * 6 * (s.wobble / WOBBLE);
  look.red = RED_MAX * Math.max(0, HEARTS[b.kind] - b.hp) / HEARTS[b.kind];
  const dizzy = b.phase === 'dizzy' || b.phase === 'hurt' || b.phase === 'spat';
  const blinking = s.t % BLINK_EVERY >= BLINK_EVERY - BLINK_FOR;
  look.eyesShut = b.phase === 'asleep' || dizzy || blinking;
  look.banner = s.banner > 0 ? Math.min(1, s.banner / BANNER_FADE) : 0;
  return { look, line: s.line, newLine };
}
