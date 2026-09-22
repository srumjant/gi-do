import { describe, expect, it } from 'vitest';
import { isSolid } from '../src/data/levels';
import { SOLID_TILE_INDEXES } from '../src/physics/tiles';

/**
 * What this can and cannot check.
 *
 * It checks the SET the collision layer is built from — the list handed to
 * `layer.setCollision`, which is what Phaser turns into the layer's colliding indexes.
 * It does not build a layer: Phaser reads `navigator` while its module body runs, so it
 * cannot be imported at all under Vitest's node environment, and the project has no DOM
 * environment installed. Shimming one far enough to construct a TilemapLayer means
 * standing up `navigator`, `Image`, a canvas and a renderer, at which point the thing
 * under test is the shim. The layer itself — that it exists, that its colliding indexes
 * are these four, that a bumped cell follows — was checked in the browser instead.
 */
describe('the collision layer collides on exactly the solid tiles', () => {
  it('accepts every code isSolid accepts and no other', () => {
    const codes = Array.from({ length: 256 }, (_, code) => code);
    expect(codes.filter((code) => SOLID_TILE_INDEXES.includes(code))).toEqual(
      codes.filter(isSolid),
    );
  });
});
