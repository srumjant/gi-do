import { TILE } from '../../config/constants';
import { DIFFICULTY_CONFIG } from '../../config/difficulty';
import type { InputState } from '../../input/actions';
import {
  type Character, headColumns, type MotionRecord, playerSize, stepMotion, stepWalkCycle,
} from '../player';
import { random } from '../random';
import { rectOverlap } from '../tiles';
import type { PlayerState } from '../types';
import { type LearnMode, pickTargets, type Rand } from './content';
import { closeTrapdoors, feetAbove, headBump, rearmIfStranded } from './gate';
import { buildTower, starBox, WALL } from './tower';
import type { Climb, ClimbMove } from './types';

/** The gentlest adventure feel, super_easy's speed and jump: the one the tower is built around. */
export const LEARN_MOTION: MotionRecord = {
  playerSpeed: DIFFICULTY_CONFIG.super_easy.playerSpeed,
  jumpForce: DIFFICULTY_CONFIG.super_easy.jumpForce,
};

/** A fresh tower for `mode`, adding what it asks to `used`, with the hero at the door. */
export function createClimb(mode: LearnMode, used: string[], character: Character, rand: Rand = random): Climb {
  const { targets, word } = pickTargets(mode, used, rand);
  const layout = buildTower(mode, targets, word, rand);
  const { w, h } = playerSize(character);
  const player: PlayerState = {
    x: (layout.start.col + WALL) * TILE,
    y: layout.start.row * TILE - h,
    vx: 0,
    vy: 0,
    w,
    h,
    onGround: false,
    facing: 1,
    coyoteTime: 0,
    jumpBuffer: 0,
    frame: 0,
    frameTimer: 0,
    // The adventure's fields, unused on the tower: no enemies, no bow, no power-ups.
    invincible: 0,
    hasBow: false,
    bowCharges: 0,
    arrowCooldown: 0,
    hasCape: false,
    fartTimer: 0,
    bigHeadTimer: 0,
    chickenRayCharges: 0,
  };
  return {
    layout,
    player,
    gates: layout.storeys.map(() => ({ solved: false, armed: true, mistakes: 0, trapdoorOpen: false })),
    storey: 0,
    lastGround: -1,
    sprung: false,
    finished: false,
    score: 0,
    sounds: [],
    events: [],
  };
}

/**
 * One fixed step of the climb: the adventure's movement, the mover, then the gate rules on
 * what the head hit, the trapdoors, where the hero now stands, the walk cycle and the star.
 */
export function stepClimb(c: Climb, input: InputState, move: ClimbMove): void {
  if (c.finished) return;
  const p = c.player;

  stepMotion(p, input, LEARN_MOTION, c.sounds, { noJumpCut: c.sprung });
  if (c.sprung && p.vy >= 0) c.sprung = false;

  const { headHitRow } = move(p);
  if (headHitRow !== null) {
    // Which cells of that row the head hit: the adventure's two probes, 3px in from each
    // side (game/player.ts's headColumns), so a head a little way under either edge of a
    // letter bumps it. A probe on plain brick is not a bump; only a counted one ends this.
    for (const col of headColumns(p)) {
      const outcome = headBump(c, { col, row: headHitRow });
      if (outcome === 'right') {
        // The spring: a jump's worth of speed from where the head met the block, exempt
        // from the jump cut until the apex. It clears the ceiling top by 42px even if the
        // child lets go of jump at once (tests/learnJumps.test.ts).
        p.vy = LEARN_MOTION.jumpForce;
        c.sprung = true;
        c.sounds.push('boing');
      }
      if (outcome) break;
    }
  }

  closeTrapdoors(c);
  trackGround(c);
  rearmIfStranded(c);
  trackStorey(c);
  stepWalkCycle(p);
  checkStar(c);
}

/** Remembers whether the hero is standing on a letter floor, and whose. */
function trackGround(c: Climb): void {
  const p = c.player;
  if (!p.onGround) return;
  const feet = p.y + p.h;
  c.lastGround = c.layout.storeys.findIndex((st) => Math.abs(st.letterFloorRow * TILE - feet) < 0.5);
}

/** Moves `storey` up once the hero's feet rise above the next floor (the roof, after the last). */
function trackStorey(c: Climb): void {
  const { storeys, roofRow } = c.layout;
  if (c.storey >= storeys.length) return;
  const next = c.storey + 1;
  const nextFloorRow = next < storeys.length ? storeys[next].floorRow : roofRow;
  if (!feetAbove(c.player, nextFloorRow)) return;
  c.storey = next;
  c.events.push({ type: 'storey', storey: next });
}

/** On the roof, touching the star ends the tower. */
function checkStar(c: Climb): void {
  if (c.storey < c.layout.storeys.length) return;
  if (!rectOverlap(c.player, starBox(c.layout))) return;
  c.finished = true;
  c.score += 100;
  c.sounds.push('win');
  c.events.push({ type: 'finished' });
}
