import { TILE } from '../../config/constants';
import type { PlayerState } from '../types';
import { INSIDE, T_BRICK, T_EMPTY, T_LETTER, type TowerLayout, WALL } from './tower';
import type { RumbleCue } from '../types';
import type { Cell, Climb } from './types';

/**
 * The September plan's two buzzes (docs/plans/2026-09-20-learn-path-refinement.md, §7): a
 * short one on the light motor for a right letter, a longer, duller one on the heavy motor
 * for a wrong one.
 */
export const RIGHT_RUMBLE: RumbleCue = { strong: 0, weak: 0.6, dur: 120 };
export const WRONG_RUMBLE: RumbleCue = { strong: 0.35, weak: 0, dur: 200 };

/**
 * The hero's feet are above the top of map row `row`. A letter ceiling's top row is the next
 * storey's floor, so this one test both shuts a trapdoor and counts the hero into the storey
 * above (climb.ts), on the same step.
 */
export function feetAbove(p: PlayerState, row: number): boolean {
  return p.y + p.h < row * TILE;
}

/** Which gate and block a map cell belongs to, or null. */
export function blockAt(layout: TowerLayout, col: number, row: number): { storey: number; block: number } | null {
  const inside = col - WALL;
  for (let s = 0; s < layout.storeys.length; s++) {
    const st = layout.storeys[s];
    if (row !== st.ceilingRows[0] && row !== st.ceilingRows[1]) continue;
    const block = st.blocks.findIndex((b) => inside >= b.col && inside < b.col + b.width);
    return block >= 0 ? { storey: s, block } : null;
  }
  return null;
}

/** Storey `s`'s right block. buildTower gives every storey exactly one (tests/learnTower.test.ts). */
function answerIndex(layout: TowerLayout, storey: number): number {
  const i = layout.storeys[storey].blocks.findIndex((b) => b.correct);
  if (i < 0) throw new Error(`storey ${storey} has no right block`);
  return i;
}

/** A block's map cells: its columns through both ceiling rows. */
export function blockCells(layout: TowerLayout, storey: number, block: number): Cell[] {
  const st = layout.storeys[storey];
  const b = st.blocks[block];
  return st.ceilingRows.flatMap((row) =>
    Array.from({ length: b.width }, (_, i) => ({ col: b.col + i + WALL, row })));
}

/** The trapdoor: the right block's columns plus one on each side, through both ceiling rows. */
export function trapdoorCells(layout: TowerLayout, storey: number): Cell[] {
  const st = layout.storeys[storey];
  const b = st.blocks[answerIndex(layout, storey)];
  const from = Math.max(0, b.col - 1);
  const to = Math.min(INSIDE - 1, b.col + b.width);
  return st.ceilingRows.flatMap((row) =>
    Array.from({ length: to - from + 1 }, (_, i) => ({ col: from + i + WALL, row })));
}

export type BumpOutcome = 'right' | 'wrong' | null;

/**
 * A rising head hit cell `hit`. Counts only for an armed gate, and only if the jump began on
 * that gate's own letter floor. Right: the gate is solved (scoring once) and its trapdoor
 * opens; the caller springs the hero (climb.ts). Wrong: a miss, and after two the right
 * block glows. Returns what happened, or null for a bump that does not count.
 */
export function headBump(c: Climb, hit: Cell): BumpOutcome {
  const found = blockAt(c.layout, hit.col, hit.row);
  if (!found) return null;
  const { storey, block } = found;
  const gate = c.gates[storey];
  if (!gate.armed || c.lastGround !== storey) return null;
  const blocks = c.layout.storeys[storey].blocks;
  if (blocks[block].correct) {
    if (!gate.solved) {
      gate.solved = true;
      c.score += 50;
    }
    gate.armed = false;
    gate.trapdoorOpen = true;
    setCells(c, trapdoorCells(c.layout, storey), T_EMPTY);
    c.sounds.push('coin');
    c.rumbles.push(RIGHT_RUMBLE);
    c.events.push({ type: 'bump-right', storey, block });
    return 'right';
  }
  gate.mistakes++;
  c.sounds.push('wrong');
  c.rumbles.push(WRONG_RUMBLE);
  c.events.push({ type: 'bump-wrong', storey, block });
  if (gate.mistakes === 2) {
    c.events.push({ type: 'hint', storey, block: answerIndex(c.layout, storey) });
  }
  return 'wrong';
}

/**
 * Shuts every open trapdoor the hero's feet have risen above. The whole letter ceiling then
 * becomes plain brick: it is the next storey's floor now, and the gate is done.
 */
export function closeTrapdoors(c: Climb): void {
  c.gates.forEach((gate, s) => {
    if (!gate.trapdoorOpen) return;
    const st = c.layout.storeys[s];
    if (!feetAbove(c.player, st.ceilingRows[0])) return;
    gate.trapdoorOpen = false;
    // The right block's cells are the trapdoor's already.
    const answer = answerIndex(c.layout, s);
    const letters = st.blocks.flatMap((_, i) => (i === answer ? [] : blockCells(c.layout, s, i)));
    setCells(c, [...trapdoorCells(c.layout, s), ...letters], T_BRICK);
    c.events.push({ type: 'gate-closed', storey: s });
  });
}

/**
 * A safety net: if the hero is ever standing on a letter floor whose trapdoor is still open,
 * the right block comes back, armed, so bumping it springs them again. Play does not produce
 * this today: a counted bump leaves the hero's body at least 3px inside the opening's edges,
 * which one step's drift (3px at most) cannot cross before the head is in the opening. But
 * nobody may get stuck below a solved gate.
 */
export function rearmIfStranded(c: Climb): void {
  const s = c.lastGround;
  if (!c.player.onGround || s < 0) return;
  const gate = c.gates[s];
  if (!gate.trapdoorOpen) return;
  gate.trapdoorOpen = false;
  gate.armed = true;
  const answer = answerIndex(c.layout, s);
  setCells(c, trapdoorCells(c.layout, s), T_BRICK);
  setCells(c, blockCells(c.layout, s, answer), T_LETTER);
  c.events.push({ type: 'rearm', storey: s, block: answer });
}

function setCells(c: Climb, cells: Cell[], code: number): void {
  for (const { col, row } of cells) c.layout.map[row][col] = code;
  c.events.push({ type: 'tiles', cells: cells.map((cell) => ({ ...cell, code })) });
}
