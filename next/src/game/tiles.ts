import { TILE } from '../config/constants';
import { isSolid, type TileMap } from '../data/levels';
import type { Rect } from './types';

/**
 * `isSolid` was already ported in Plan 1 (`../data/levels`, alongside the tile-code
 * constants it switches on). Re-exported here — the location this task's test imports
 * it from — rather than duplicated, so there is exactly one place that knows the four
 * solid codes instead of two copies that could silently drift apart.
 */
export { isSolid };

/**
 * Whether a box overlaps any solid tile. For a push that moves the hero by hand: Arcade,
 * finding them inside a wall, separates them the short way, which can be down through the
 * floor (browser, 2026-11-22).
 */
export function boxHitsSolid(map: TileMap, box: Rect): boolean {
  const x0 = Math.floor(box.x / TILE);
  const x1 = Math.floor((box.x + box.w - 1) / TILE);
  const y0 = Math.floor(box.y / TILE);
  const y1 = Math.floor((box.y + box.h - 1) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) if (isSolid(map[ty]?.[tx] ?? 0)) return true;
  }
  return false;
}

/**
 * Port of index.html:1137. Reads a tile by pixel coordinate, flooring to the tile grid.
 * The live version reads `LEVELS[currentLevel]` and the `map` global for its bounds;
 * this takes the map as a parameter and derives the bounds from it directly —
 * `map.length` is the height, `map[0].length` the width, exactly as the live level
 * dimensions are.
 *
 * Out of bounds reads as empty (0) on every side — there is no solid-outside-the-world
 * behaviour. Nothing in the tile layer stops the player leaving sideways: what keeps
 * them in on the left is a separate `x` clamp in the player controller, and there is
 * nothing at all on the right, by design.
 */
export function getTile(map: TileMap, px: number, py: number): number {
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  const height = map.length;
  const width = map[0].length;
  if (tx < 0 || ty < 0 || ty >= height || tx >= width) return 0;
  return map[ty][tx];
}

/**
 * Port of index.html:1136. Scans DOWNWARD from the top of the column (ty = 0 first) and
 * returns the pixel y of the FIRST solid tile found. A column with a platform above the
 * ground therefore resolves to the platform, not the floor — that is deliberate live
 * behaviour (it is why an enemy or pickup can spawn on a ledge instead of the ground),
 * reproduced here rather than "fixed". Falls back to the ground row
 * (`(height - 2) * TILE`) when the column has no solid tile at all, matching the live
 * fallback exactly.
 */
export function findGroundY(map: TileMap, tx: number): number {
  const height = map.length;
  const width = map[0].length;
  for (let ty = 0; ty < height; ty++) {
    if (tx >= 0 && tx < width && isSolid(map[ty][tx])) return ty * TILE;
  }
  return (height - 2) * TILE;
}

/**
 * The top of the first solid tile at or below row `fromRow` in column `tx`, in pixels: what
 * something placed at that row stands on. For hand-built levels, which say where things
 * stand, and can have a ceiling that `findGroundY`'s search from the top would find first.
 */
export function findFloorBelow(map: TileMap, tx: number, fromRow: number): number {
  for (let ty = Math.max(0, fromRow); ty < map.length; ty++) {
    if (isSolid(map[ty]?.[tx] ?? 0)) return ty * TILE;
  }
  return (map.length - 2) * TILE;
}

/**
 * Port of index.html:1139. Strict `<` / `>` on every side, so rectangles that merely
 * touch at an edge do not count as overlapping.
 */
export function rectOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Which sides of a tile stop the player. `top` is a plank: land on it from above, jump up
 * through it from below. The adventure only ever has `all` and `none`; learn mode's tower
 * adds `top` (game/learn/tower.ts's `towerTileFaces`).
 */
export type TileFaces = 'none' | 'all' | 'top';

/** A tile vocabulary's collision: one answer per tile code. */
export type FacesRule = (code: number) => TileFaces;
