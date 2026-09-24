import { TILE } from '../../config/constants';
import { INSIDE, T_BRICK, T_EMPTY, T_LETTER, type TowerLayout, WALL } from './tower';
import type { Cell, Climb } from './types';

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
  const b = st.blocks.find((x) => x.correct) ?? st.blocks[0];
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
    c.events.push({ type: 'bump-right', storey, block });
    return 'right';
  }
  gate.mistakes++;
  c.sounds.push('block');
  c.events.push({ type: 'bump-wrong', storey, block });
  if (gate.mistakes === 2) {
    c.events.push({ type: 'hint', storey, block: blocks.findIndex((b) => b.correct) });
  }
  return 'wrong';
}

/**
 * Shuts every open trapdoor the hero's feet have risen above. The whole letter ceiling then
 * becomes plain brick: it is the next storey's floor now, and the gate is done.
 */
export function closeTrapdoors(c: Climb): void {
  const feet = c.player.y + c.player.h;
  c.gates.forEach((gate, s) => {
    if (!gate.trapdoorOpen) return;
    const st = c.layout.storeys[s];
    if (feet >= st.ceilingRows[0] * TILE) return;
    gate.trapdoorOpen = false;
    const letters = st.blocks.flatMap((_, i) => blockCells(c.layout, s, i));
    setCells(c, [...trapdoorCells(c.layout, s), ...letters], T_BRICK);
    c.events.push({ type: 'gate-closed', storey: s });
  });
}

/**
 * If the hero is standing on a letter floor whose trapdoor is still open — the spring
 * clipped the trapdoor's edge and they fell back — the right block comes back, armed, so
 * bumping it springs them again. Nobody can get stuck below a solved gate.
 */
export function rearmIfStranded(c: Climb): void {
  const s = c.lastGround;
  if (!c.player.onGround || s < 0) return;
  const gate = c.gates[s];
  if (!gate.trapdoorOpen) return;
  gate.trapdoorOpen = false;
  gate.armed = true;
  const answer = c.layout.storeys[s].blocks.findIndex((b) => b.correct);
  setCells(c, trapdoorCells(c.layout, s), T_BRICK);
  setCells(c, blockCells(c.layout, s, answer), T_LETTER);
  c.events.push({ type: 'rearm', storey: s, block: answer });
}

function setCells(c: Climb, cells: Cell[], code: number): void {
  for (const { col, row } of cells) c.layout.map[row][col] = code;
  c.events.push({ type: 'tiles', cells: cells.map((cell) => ({ ...cell, code })) });
}
