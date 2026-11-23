import { describe, expect, it } from 'vitest';
import { TILE_BRICK, TILE_GROUND, TILE_QUESTION } from '../src/data/levels';
import {
  FRAME_BRICK, FRAME_GROUND, FRAME_GROUND_TOP, FRAME_NONE, FRAME_QUESTION, staticTileFrames,
} from '../src/gfx/tileFrames';
import { createWorld } from '../src/game/world';
import { STAGES } from '../src/data/stages';

describe('the level\'s static tiles as tileset frames', () => {
  it('gives ground its grass top only where the tile above is open, and bricks and ? blocks their own', () => {
    const map = [
      [TILE_GROUND, 0, 0, 0],
      [TILE_GROUND, TILE_GROUND, TILE_QUESTION, TILE_BRICK],
      [TILE_GROUND, TILE_GROUND, TILE_BRICK, TILE_GROUND],
    ];
    expect(staticTileFrames(map)).toEqual([
      // The top row has nothing above it: no grass, as the live tile loop draws it.
      [FRAME_GROUND, FRAME_NONE, FRAME_NONE, FRAME_NONE],
      // Open above: the grass line. Under ground: buried, none.
      [FRAME_GROUND, FRAME_GROUND_TOP, FRAME_QUESTION, FRAME_BRICK],
      // Under ground and under a brick: buried too.
      [FRAME_GROUND, FRAME_GROUND, FRAME_BRICK, FRAME_GROUND],
    ]);
  });

  it('draws exactly the ground, brick and ? cells of every stage, and nothing else', () => {
    for (const stage of STAGES) {
      const world = createWorld(stage.theme, 'normal', 'gigi', undefined, stage.level);
      const frames = staticTileFrames(world.map);
      world.map.forEach((row, ty) => row.forEach((code, tx) => {
        const drawn = frames[ty][tx] !== FRAME_NONE;
        const statics = code === TILE_GROUND || code === TILE_BRICK || code === TILE_QUESTION;
        if (drawn !== statics) expect({ stage: stage.level.name, tx, ty, code, drawn }).toEqual({ stage: stage.level.name, tx, ty, code, drawn: statics });
      }));
    }
  });
});
