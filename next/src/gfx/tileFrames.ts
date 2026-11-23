import { isSolid, TILE_BRICK, TILE_GROUND, TILE_QUESTION } from '../data/levels';

/**
 * The level's static tiles (ground, brick and the ? block) as frames of one small tileset that
 * gfx/tiles.ts bakes per level's colours, for a Phaser tilemap layer to draw. Pure, so it is
 * tested without Phaser.
 *
 * They used to be one Graphics holding the whole level, up to 43,000 commands that Phaser
 * replayed every frame, off screen or not: most of a frame's drawing, and on a TV's slow
 * processor enough to slow the game and make the music late (2026-11-23). A tilemap layer
 * draws only the tiles on screen.
 */
export const FRAME_GROUND = 0;
/** Ground with the grass line on top, where the tile above is open (index.html:1690). */
export const FRAME_GROUND_TOP = 1;
export const FRAME_BRICK = 2;
export const FRAME_QUESTION = 3;
export const STATIC_FRAMES = 4;
/** No tile: Phaser's tilemaps read -1 as empty. */
export const FRAME_NONE = -1;

export function staticTileFrames(map: readonly (readonly number[])[]): number[][] {
  return map.map((row, ty) => row.map((code, tx) => {
    switch (code) {
      case TILE_GROUND:
        return ty > 0 && !isSolid(map[ty - 1][tx]) ? FRAME_GROUND_TOP : FRAME_GROUND;
      case TILE_BRICK:
        return FRAME_BRICK;
      case TILE_QUESTION:
        return FRAME_QUESTION;
      default:
        return FRAME_NONE;
    }
  }));
}
