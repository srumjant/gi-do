import { describe, expect, it } from 'vitest';
import { TILE } from '../src/config/constants';
import { LEARN_MOTION } from '../src/game/learn/climb';
import { pickTargets, type LearnMode } from '../src/game/learn/content';
import { trapdoorCells } from '../src/game/learn/gate';
import { buildTower, GAPS, type Storey, T_EMPTY, type TowerLayout, WALL } from '../src/game/learn/tower';
import { type Character, playerSize, stepMotion } from '../src/game/player';
import type { PlayerState } from '../src/game/types';
import { emptyInput, type InputState } from '../src/input/actions';
import { seeded } from './helpers/seeded';
import { towerMove } from './helpers/towerMove';

const MODES: LearnMode[] = ['letters', 'syllables', 'words'];
const TOWERS: TowerLayout[] = MODES.flatMap((mode) => Array.from({ length: 40 }, (_, i) => {
  const rand = seeded(1000 + i);
  const { targets, word } = pickTargets(mode, [], rand);
  return buildTower(mode, targets, word, rand);
}));
const CHARACTERS: Character[] = ['gigi', 'dodo'];

function standing(character: Character, x: number, feetY: number): PlayerState {
  const { w, h } = playerSize(character);
  return {
    x, y: feetY - h, vx: 0, vy: 0, w, h, onGround: true, facing: 1,
    coyoteTime: 0, jumpBuffer: 0, frame: 0, frameTimer: 0, invincible: 0,
    hasBow: false, bowCharges: 0, arrowCooldown: 0, hasCape: false,
    fartTimer: 0, bigHeadTimer: 0, chickenRayCharges: 0,
  };
}

interface Outcome {
  /** The row whose top the hero landed on, or null. */
  landedRow: number | null;
  x: number;
  minHead: number;
  minFeet: number;
  /** Steps on which the hero's rising head was stopped by a tile. */
  headStops: number;
}

/** Runs the real movement against the tower until the hero lands (or 4 seconds pass). */
function jump(map: number[][], p: PlayerState, input: (f: number) => InputState, spring = false): Outcome {
  const move = towerMove(map);
  let exempt = spring;
  let minHead = p.y;
  let minFeet = p.y + p.h;
  let headStops = 0;
  for (let f = 0; f < 240; f++) {
    stepMotion(p, input(f), LEARN_MOTION, [], { noJumpCut: exempt });
    if (exempt && p.vy >= 0) exempt = false;
    if (move(p).headHitRow !== null) headStops++;
    minHead = Math.min(minHead, p.y);
    minFeet = Math.min(minFeet, p.y + p.h);
    if (f > 2 && p.onGround) return { landedRow: (p.y + p.h) / TILE, x: p.x, minHead, minFeet, headStops };
  }
  return { landedRow: null, x: p.x, minHead, minFeet, headStops };
}

const held = (dir: number) => (f: number): InputState =>
  ({ ...emptyInput(), jump: true, jumpPressed: f === 0, left: dir < 0, right: dir > 0 });
const tap = (f: number): InputState => ({ ...emptyInput(), jump: f === 0, jumpPressed: f === 0 });

function overlaps(x: number, w: number, plank: { col: number; width: number }): boolean {
  const left = (plank.col + WALL) * TILE;
  return x + w > left && x < left + plank.width * TILE;
}

/**
 * Landed on plank `k` of the storey — or, when that plank is the storey's last, on the letter
 * floor above it. A full held jump rises 98.4px, just over two hops (96px), so from the plank
 * below the last one it can carry the hero straight onto the full-width letter floor. That is
 * progress, not a miss.
 */
function landedWell(st: Storey, k: number, out: Outcome, w: number): boolean {
  if (out.landedRow === st.planks[k].row && overlaps(out.x, w, st.planks[k])) return true;
  return k === st.planks.length - 1 && out.landedRow === st.letterFloorRow;
}

function centredUnder(character: Character, span: { col: number; width: number }): number {
  return (span.col + WALL) * TILE + (span.width * TILE - playerSize(character).w) / 2;
}

describe('every hop between planks', () => {
  for (const character of CHARACTERS) {
    it(`lands a standing jump from the edge that holds the direction, for ${character}`, () => {
      const misses: string[] = [];
      TOWERS.forEach((t, ti) => t.storeys.forEach((st, s) => st.planks.slice(1).forEach((b, k) => {
        const a = st.planks[k];
        const dir = b.col > a.col ? 1 : -1;
        const { w } = playerSize(character);
        const x = dir > 0 ? (a.col + a.width + WALL) * TILE - w : (a.col + WALL) * TILE;
        const out = jump(t.map, standing(character, x, a.row * TILE), held(dir));
        if (!landedWell(st, k + 1, out, w)) misses.push(`tower ${ti} storey ${s} hop ${k + 1}`);
      })));
      expect(misses).toEqual([]);
    });

    it(`lands even a running jump from the very lip onto a long plank, for ${character}`, () => {
      const misses: string[] = [];
      TOWERS.forEach((t, ti) => t.storeys.forEach((st, s) => st.planks.slice(1).forEach((b, k) => {
        if (b.width !== 8 - GAPS[s]) return;
        const a = st.planks[k];
        const dir = b.col > a.col ? 1 : -1;
        const { w } = playerSize(character);
        const x = dir > 0 ? (a.col + a.width + WALL) * TILE - 1 : (a.col + WALL) * TILE - w + 1;
        const p = standing(character, x, a.row * TILE);
        p.vx = dir * LEARN_MOTION.playerSpeed;
        const out = jump(t.map, p, held(dir));
        if (!landedWell(st, k + 1, out, w)) misses.push(`tower ${ti} storey ${s} hop ${k + 1}`);
      })));
      expect(misses).toEqual([]);
    });

    it(`lands a jump from the last plank on the letter floor, for ${character}`, () => {
      TOWERS.forEach((t) => t.storeys.forEach((st) => {
        const last = st.planks[st.planks.length - 1];
        expect(jump(t.map, standing(character, centredUnder(character, last), last.row * TILE), held(0)).landedRow)
          .toBe(st.letterFloorRow);
      }));
    });
  }
});

describe('the letter ceiling', () => {
  for (const character of CHARACTERS) {
    it(`is out of reach from every plank, for ${character}`, () => {
      const reached: string[] = [];
      TOWERS.forEach((t, ti) => t.storeys.forEach((st, s) => {
        const underside = (st.ceilingRows[1] + 1) * TILE;
        st.planks.forEach((pl, k) => {
          const out = jump(t.map, standing(character, centredUnder(character, pl), pl.row * TILE), held(0));
          if (out.headStops > 0 || out.minHead <= underside) reached.push(`tower ${ti} storey ${s} plank ${k}`);
        });
      }));
      expect(reached).toEqual([]);
    });

    it(`is reached from the letter floor by a held jump but not a tap, for ${character}`, () => {
      TOWERS.forEach((t) => t.storeys.forEach((st) => st.blocks.forEach((b) => {
        const x = centredUnder(character, b);
        const feet = st.letterFloorRow * TILE;
        expect(jump(t.map, standing(character, x, feet), held(0)).headStops).toBeGreaterThan(0);
        expect(jump(t.map, standing(character, x, feet), tap).headStops).toBe(0);
      })));
    });
  }
});

describe('the spring', () => {
  function springFrom(t: TowerLayout, s: number, character: Character, exempt: boolean): Outcome {
    const st = t.storeys[s];
    const map = t.map.map((row) => [...row]);
    for (const { col, row } of trapdoorCells(t, s)) map[row][col] = T_EMPTY;
    const b = st.blocks.find((x) => x.correct) ?? st.blocks[0];
    const { h } = playerSize(character);
    const p = standing(character, centredUnder(character, b), (st.ceilingRows[1] + 1) * TILE + h);
    p.onGround = false;
    p.vy = LEARN_MOTION.jumpForce;
    return jump(map, p, () => emptyInput(), exempt);
  }

  for (const character of CHARACTERS) {
    it(`carries ${character} above the ceiling with jump let go`, () => {
      TOWERS.forEach((t) => t.storeys.forEach((st, s) => {
        expect(springFrom(t, s, character, true).minFeet).toBeLessThan(st.ceilingRows[0] * TILE);
      }));
    });

    it(`would leave ${character} under the trapdoor without the jump-cut exemption`, () => {
      TOWERS.forEach((t) => t.storeys.forEach((st, s) => {
        expect(springFrom(t, s, character, false).minFeet).toBeGreaterThan(st.ceilingRows[0] * TILE);
      }));
    });
  }
});
