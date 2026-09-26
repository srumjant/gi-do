import { TILE } from '../../src/config/constants';
import { stepClimb } from '../../src/game/learn/climb';
import { WALL } from '../../src/game/learn/tower';
import type { Climb } from '../../src/game/learn/types';
import { emptyInput, type InputState } from '../../src/input/actions';
import { towerMove } from './towerMove';

/** Storey `s`'s right block, and one of its wrong ones. */
export const answerOf = (c: Climb, s: number): number => c.layout.storeys[s].blocks.findIndex((b) => b.correct);
export const wrongOf = (c: Climb, s: number): number => c.layout.storeys[s].blocks.findIndex((b) => !b.correct);

/** Jump held from frame 0; and nothing pressed at all. */
export const held = (f: number): InputState => ({ ...emptyInput(), jump: true, jumpPressed: f === 0 });
export const idle = (): InputState => emptyInput();

/** Stands the hero on storey `s`'s letter floor, centred under block `block`. */
export function standUnder(c: Climb, s: number, block: number): void {
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
export function run(c: Climb, frames: number, input: (f: number) => InputState, until: () => boolean): boolean {
  const move = towerMove(c.layout.map);
  for (let f = 0; f < frames; f++) {
    stepClimb(c, input(f), move);
    if (until()) return true;
  }
  return false;
}
