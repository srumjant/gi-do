import { describe, expect, it } from 'vitest';
import { TILE } from '../src/config/constants';
import { createClimb, LEARN_MOTION, stepClimb } from '../src/game/learn/climb';
import { blockCells, feetAbove, headBump, trapdoorCells } from '../src/game/learn/gate';
import { starBox, T_BRICK, T_EMPTY, T_LETTER, WALL } from '../src/game/learn/tower';
import type { Cell, Climb } from '../src/game/learn/types';
import { emptyInput, type InputState } from '../src/input/actions';
import { seeded } from './helpers/seeded';
import { towerMove } from './helpers/towerMove';

const climb = (): Climb => createClimb('letters', [], 'gigi', seeded(3));
const answerOf = (c: Climb, s: number): number => c.layout.storeys[s].blocks.findIndex((b) => b.correct);
const wrongOf = (c: Climb, s: number): number => c.layout.storeys[s].blocks.findIndex((b) => !b.correct);
const held = (f: number): InputState => ({ ...emptyInput(), jump: true, jumpPressed: f === 0 });
const idle = (): InputState => emptyInput();
const codes = (c: Climb, cells: Cell[]): number[] => cells.map(({ col, row }) => c.layout.map[row][col]);

/** Stands the hero on storey `s`'s letter floor, centred under block `block`. */
function standUnder(c: Climb, s: number, block: number): void {
  const st = c.layout.storeys[s];
  const b = st.blocks[block];
  const p = c.player;
  p.x = (b.col + WALL) * TILE + (b.width * TILE - p.w) / 2;
  p.y = st.letterFloorRow * TILE - p.h;
  p.vx = 0;
  p.vy = 0;
  p.onGround = true;
  c.storey = s;
  c.lastGround = s;
}

/** Steps until `until` holds (true) or the frames run out (false). */
function run(c: Climb, frames: number, input: (f: number) => InputState, until: () => boolean): boolean {
  const move = towerMove(c.layout.map);
  for (let f = 0; f < frames; f++) {
    stepClimb(c, input(f), move);
    if (until()) return true;
  }
  return false;
}

describe('a letter gate', () => {
  it('opens the trapdoor, springs you and scores for the right letter', () => {
    const c = climb();
    standUnder(c, 0, answerOf(c, 0));
    expect(run(c, 40, held, () => c.gates[0].solved)).toBe(true);
    expect(c.score).toBe(50);
    expect(c.gates[0].trapdoorOpen).toBe(true);
    expect(c.sprung).toBe(true);
    expect(c.player.vy).toBe(LEARN_MOTION.jumpForce);
    expect(codes(c, trapdoorCells(c.layout, 0)).every((code) => code === T_EMPTY)).toBe(true);
    expect(c.sounds).toContain('coin');
    expect(c.events).toContainEqual({ type: 'bump-right', storey: 0, block: answerOf(c, 0) });
  });

  it('carries you through with jump let go at once, and shuts behind you', () => {
    const c = climb();
    standUnder(c, 0, answerOf(c, 0));
    run(c, 40, held, () => c.gates[0].solved);
    expect(run(c, 150, idle, () => c.storey === 1 && c.player.onGround)).toBe(true);
    expect(c.gates[0].trapdoorOpen).toBe(false);
    expect(codes(c, trapdoorCells(c.layout, 0)).every((code) => code === T_BRICK)).toBe(true);
    expect(c.player.y + c.player.h).toBe(c.layout.storeys[1].floorRow * TILE);
    expect(c.events).toContainEqual({ type: 'storey', storey: 1 });
    expect(c.events).toContainEqual({ type: 'gate-closed', storey: 0 });
  });

  it('carries you through from a bump at either edge of the letter, not only its middle', () => {
    for (const edge of ['left', 'right'] as const) {
      const c = climb();
      const block = answerOf(c, 0);
      standUnder(c, 0, block);
      const b = c.layout.storeys[0].blocks[block];
      const left = (b.col + WALL) * TILE;
      c.player.x = edge === 'left' ? left - c.player.w + 4 : left + b.width * TILE - 4;
      expect(run(c, 40, held, () => c.gates[0].solved)).toBe(true);
      expect(run(c, 150, idle, () => c.storey === 1 && c.player.onGround)).toBe(true);
      expect(c.events.some((e) => e.type === 'rearm')).toBe(false);
    }
  });

  it('counts the hero through a ceiling only once the feet are above its top', () => {
    const c = climb();
    const top = c.layout.storeys[0].ceilingRows[0];
    // The one boundary both the trapdoor and the storey count go by: this row is the next floor.
    expect(c.layout.storeys[1].floorRow).toBe(top);
    c.player.y = top * TILE - c.player.h;
    expect(feetAbove(c.player, top)).toBe(false);
    c.player.y -= 0.5;
    expect(feetAbove(c.player, top)).toBe(true);
  });

  it('turns the whole letter ceiling to brick when it shuts', () => {
    const c = climb();
    standUnder(c, 0, answerOf(c, 0));
    run(c, 40, held, () => c.gates[0].solved);
    run(c, 150, idle, () => c.storey === 1 && c.player.onGround);
    c.layout.storeys[0].blocks.forEach((_, i) => {
      expect(codes(c, blockCells(c.layout, 0, i)).every((code) => code === T_BRICK)).toBe(true);
    });
  });

  it('wobbles for a wrong letter and costs nothing', () => {
    const c = climb();
    standUnder(c, 0, wrongOf(c, 0));
    expect(run(c, 40, held, () => c.gates[0].mistakes === 1)).toBe(true);
    expect(c.gates[0].solved).toBe(false);
    expect(c.gates[0].trapdoorOpen).toBe(false);
    expect(c.score).toBe(0);
    expect(codes(c, blockCells(c.layout, 0, answerOf(c, 0))).every((code) => code === T_LETTER)).toBe(true);
    expect(c.events).toContainEqual({ type: 'bump-wrong', storey: 0, block: wrongOf(c, 0) });
    expect(run(c, 120, idle, () => c.player.onGround)).toBe(true);
    expect(c.player.y + c.player.h).toBe(c.layout.storeys[0].letterFloorRow * TILE);
  });

  it('makes the right block glow after two misses', () => {
    const c = climb();
    for (let miss = 1; miss <= 2; miss++) {
      standUnder(c, 0, wrongOf(c, 0));
      run(c, 40, held, () => c.gates[0].mistakes === miss);
    }
    expect(c.events).toContainEqual({ type: 'hint', storey: 0, block: answerOf(c, 0) });
  });

  it('glows once, however many more misses follow', () => {
    const c = climb();
    for (let miss = 1; miss <= 3; miss++) {
      standUnder(c, 0, wrongOf(c, 0));
      run(c, 40, held, () => c.gates[0].mistakes === miss);
    }
    expect(c.gates[0].mistakes).toBe(3);
    expect(c.events.filter((e) => e.type === 'hint')).toHaveLength(1);
  });

  it('counts a head a little way under either edge of a letter, and not one just outside', () => {
    // The adventure's two probes, 3px in from each side (game/player.ts's headColumns), so
    // the reach is the same from the left as from the right.
    const missesJumpingFrom = (x: (left: number, right: number, w: number) => number): number => {
      const c = climb();
      const block = wrongOf(c, 0);
      standUnder(c, 0, block);
      const b = c.layout.storeys[0].blocks[block];
      const left = (b.col + WALL) * TILE;
      c.player.x = x(left, left + b.width * TILE, c.player.w);
      run(c, 40, held, () => false);
      return c.gates[0].mistakes;
    };
    expect(missesJumpingFrom((left, _right, w) => left - w + 4)).toBe(1); // 4px under the left edge
    expect(missesJumpingFrom((_left, right) => right - 4)).toBe(1); // 4px under the right edge
    expect(missesJumpingFrom((left, _right, w) => left - w + 2)).toBe(0); // 2px: both probes on brick
    expect(missesJumpingFrom((_left, right) => right - 2)).toBe(0);
  });

  it('counts a bump only from its own letter floor', () => {
    const c = climb();
    standUnder(c, 0, answerOf(c, 0));
    c.lastGround = -1;
    expect(headBump(c, blockCells(c.layout, 0, answerOf(c, 0))[0])).toBeNull();
    expect(c.gates[0].solved).toBe(false);
  });

  it('cannot be answered again once solved', () => {
    const c = climb();
    standUnder(c, 0, answerOf(c, 0));
    run(c, 40, held, () => c.gates[0].solved);
    run(c, 150, idle, () => c.storey === 1 && c.player.onGround);
    c.lastGround = 0;
    expect(headBump(c, blockCells(c.layout, 0, wrongOf(c, 0))[0])).toBeNull();
    expect(c.gates[0].mistakes).toBe(0);
  });

  it('brings the block back to spring you again if you end up under the open trapdoor', () => {
    const c = climb();
    standUnder(c, 0, answerOf(c, 0));
    run(c, 40, held, () => c.gates[0].solved);
    standUnder(c, 0, answerOf(c, 0)); // as if the spring had clipped the trapdoor's edge
    c.sprung = false;
    stepClimb(c, idle(), towerMove(c.layout.map));
    expect(c.gates[0].trapdoorOpen).toBe(false);
    expect(c.gates[0].armed).toBe(true);
    expect(codes(c, blockCells(c.layout, 0, answerOf(c, 0))).every((code) => code === T_LETTER)).toBe(true);
    expect(run(c, 40, held, () => c.gates[0].trapdoorOpen)).toBe(true);
    expect(c.score).toBe(50);
  });
});

describe('the roof', () => {
  it('is reached through the last gate', () => {
    const c = climb();
    const last = c.layout.storeys.length - 1;
    c.gates.slice(0, last).forEach((g) => { g.solved = true; g.armed = false; });
    standUnder(c, last, answerOf(c, last));
    run(c, 40, held, () => c.gates[last].solved);
    expect(run(c, 150, idle, () => c.player.onGround)).toBe(true);
    expect(c.storey).toBe(c.layout.storeys.length);
    expect(c.events).toContainEqual({ type: 'storey', storey: c.layout.storeys.length });
    expect(c.player.y + c.player.h).toBe(c.layout.roofRow * TILE);
  });

  it('ends the tower when the hero touches the star', () => {
    const c = climb();
    c.gates.forEach((g) => { g.solved = true; g.armed = false; });
    c.storey = c.layout.storeys.length;
    const star = starBox(c.layout);
    c.player.x = star.x;
    c.player.y = star.y + star.h - c.player.h;
    c.player.onGround = true;
    stepClimb(c, idle(), towerMove(c.layout.map));
    expect(c.finished).toBe(true);
    expect(c.score).toBe(100);
    expect(c.sounds).toContain('win');
    expect(c.events).toContainEqual({ type: 'finished' });
  });
});
