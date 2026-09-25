import { TILE } from '../../src/config/constants';
import { towerTileFaces } from '../../src/game/learn/tower';
import type { ClimbMove } from '../../src/game/learn/types';

/** Arcade's TILE_BIAS: how deep a falling body may sink into a tile top and be put back on it. */
const TILE_BIAS = 16;

/**
 * A stand-in for the tower scene's Arcade body, for tests: plain integration, then separation
 * against the tower's map with the same per-side rule the scene gives Arcade — solid tiles
 * stop you from every side, planks only from above, and a falling body up to TILE_BIAS deep
 * in a tile top is put back on it, as Arcade's TileCheckY does — inside the same left and
 * right world edges. Reports the row a rising head was stopped under, as the scene's mover
 * does (physics/player.ts's MoveReport).
 *
 * Phaser's package entry cannot load under Vitest, which is why this exists. Arcade's own
 * World and Body can, deep-imported from phaser/src, and run that way the gate tests and the
 * jump checks give the same verdicts. One structural difference remains: this separates X,
 * against the rows the body was in before this step's vertical move, then Y, where Arcade
 * moves both and resolves each tile along its smaller overlap. At a solid corner (an open
 * trapdoor's edge, a battlement) that can shift a sideways move by a frame.
 *
 * It reads `map` live, so trapdoors the gate rules open and shut are seen at once.
 */
export function towerMove(map: number[][]): ClimbMove {
  const faces = (col: number, row: number) => towerTileFaces(map[row]?.[col] ?? 0);
  const span = (from: number, size: number): [number, number] =>
    [Math.floor(from / TILE), Math.ceil((from + size) / TILE) - 1];

  return (p) => {
    let headHitRow: number | null = null;

    p.x += p.vx;
    // Arcade clamps to the world edges the scene sets (left and right) before any tile.
    const width = (map[0]?.length ?? 0) * TILE;
    if (p.x < 0) { p.x = 0; p.vx = 0; } else if (p.x + p.w > width) { p.x = width - p.w; p.vx = 0; }
    const [r0, r1] = span(p.y, p.h);
    const [x0, x1] = span(p.x, p.w);
    let wall: number | null = null;
    for (let r = r0; r <= r1 && wall === null; r++) {
      for (let c = x0; c <= x1; c++) {
        if (faces(c, r) === 'all') { wall = c; break; }
      }
    }
    if (wall !== null) {
      p.x = p.vx > 0 ? wall * TILE - p.w : (wall + 1) * TILE;
      p.vx = 0;
    }

    const prevBottom = p.y + p.h;
    p.y += p.vy;
    p.onGround = false;
    const [c0, c1] = span(p.x, p.w);
    if (p.vy < 0) {
      const row = Math.floor(p.y / TILE);
      for (let c = c0; c <= c1; c++) {
        if (faces(c, row) === 'all') headHitRow = row;
      }
      if (headHitRow !== null) {
        p.y = (row + 1) * TILE;
        p.vy = 0;
      }
    } else if (p.vy > 0) {
      const bottom = p.y + p.h;
      // Strictly below: Arcade's overlap test is strict, so feet exactly on a tile top land
      // there on the next step, not this one.
      for (let row = Math.floor(prevBottom / TILE); row * TILE < bottom; row++) {
        const top = row * TILE;
        if (bottom - top > TILE_BIAS) continue;
        let floor = false;
        for (let c = c0; c <= c1; c++) {
          if (faces(c, row) !== 'none') floor = true;
        }
        if (floor) {
          p.y = top - p.h;
          p.vy = 0;
          p.onGround = true;
          break;
        }
      }
    }
    return { headHitRow };
  };
}
