// The Phaser import here is a TYPE import, and has to stay one. Nothing in this file
// needs a Phaser value — `make.tilemap`, `createLayer` and `setCollision` all hang off
// objects the scene hands us — so the import erases at compile time and this module can
// be loaded outside a browser. That is what makes SOLID_TILE_INDEXES below reachable
// from tests/physics.test.ts: Phaser reads `navigator` while its module body runs, so
// `import Phaser from 'phaser'` throws outright under Vitest's node environment. Reach
// for one Phaser value here — a `Phaser.Math` helper, a constant — and that test can no
// longer import this file.
import type Phaser from 'phaser';
import { TILE } from '../config/constants';
import { isSolid } from '../data/levels';
import type { FacesRule, TileFaces } from '../game/tiles';
import type { World } from '../game/types';

/**
 * How far SOLID_TILE_INDEXES below interrogates `isSolid`. The level vocabulary only
 * runs 0-5 (data/levels.ts) so everything past 5 answers false today, and the ceiling
 * is arbitrary but generous on purpose: the set is built by ASKING `isSolid` rather
 * than by restating its four codes, so a solid tile type added there starts colliding
 * here without anyone having to remember this file exists.
 */
const MAX_TILE_CODE = 255;

/**
 * Every tile code `isSolid` accepts — 1, 2, 3 and 5 today — in the shape a Phaser
 * tilemap layer wants it: a list of colliding tile indexes.
 *
 * This is the whole of the collision RULE, and the only part of this module a test can
 * reach (see the import comment above). Everything below is the plumbing that hands it
 * to Phaser.
 */
export const SOLID_TILE_INDEXES: readonly number[] = Array.from(
  { length: MAX_TILE_CODE + 1 },
  (_, code) => code,
).filter(isSolid);

/**
 * Builds Arcade's view of the level: a Phaser tilemap layer carrying the same indexes
 * as `world.map`, colliding on the solid ones.
 *
 * `world.map` stays the source of truth. The number array is what the pure simulation
 * reads (game/tiles.ts's `getTile`), what block bumps rewrite, and what `respawnLevel`
 * regenerates; this layer is a DERIVED copy of it that exists because Arcade cannot
 * collide against a number array. Phaser's parser reads the array once and builds its
 * own Tile objects from it, so the two do not stay in step by themselves —
 * `syncCollisionLayer` below is what keeps them together.
 *
 * Two deliberate absences:
 *
 *   - **It is invisible.** The tiles are already on screen: gfx/tiles.ts draws every
 *     one of them once in `drawStaticTiles`, plus the rainbow and bumped-brick
 *     overlays. This layer is collision geometry and nothing else, and a visible one
 *     would draw the whole map a second time on top of that.
 *   - **It has no tileset.** A tileset is a picture, and nothing here draws. Passing
 *     an empty list is legal (TilemapLayer#setTilesets skips falsy entries), and the
 *     tile SIZE that Arcade separates against does not come from it — Phaser's 2D-array
 *     parser stamps `tileWidth`/`tileHeight` onto every Tile as it builds them. The one
 *     thing this costs is `layer.putTileAt`, which dereferences the tileset to re-read
 *     a tile's size; `syncCollisionLayer` sets the index and the collision flags
 *     directly instead.
 */
export function createCollisionLayer(
  scene: Phaser.Scene,
  world: World,
): Phaser.Tilemaps.TilemapLayer {
  const tilemap = scene.make.tilemap({
    data: world.map,
    tileWidth: TILE,
    tileHeight: TILE,
  });

  // The last argument picks between the two kinds of layer Phaser 4 can build, and
  // `false` asks for the CPU one — the only kind Arcade Physics collides against. It is
  // also the default, but the type of `createLayer` is the union of both whatever is
  // passed, so it has to be narrowed below; `culledTiles` is one of the fields only the
  // CPU layer carries.
  const layer = tilemap.createLayer(0, [], 0, 0, false);
  if (!layer || !('culledTiles' in layer)) {
    throw new Error('the collision tilemap has no layer 0 to build');
  }

  layer.setVisible(false);
  // `setCollision` wants a mutable array and SOLID_TILE_INDEXES is frozen by its type.
  layer.setCollision([...SOLID_TILE_INDEXES]);
  return layer;
}

/**
 * Re-reads `world.map` and moves any cell that has changed onto the collision layer,
 * collision flags and all. Called once per frame, after the simulation has stepped.
 *
 * The change this exists for is a block bump: taking a `?` block (tile 3) or a rainbow
 * block (tile 5) from underneath rewrites its cell to a brick (tile 2) in `world.map`
 * (player.ts's `bumpBlocksAbove`), and gfx/tiles.ts's `updateBumpedBlocks` repaints it.
 * Without this the layer would still be holding the tile the level was born with.
 *
 * All three of those codes are solid, so today a bump changes a cell's INDEX without
 * changing whether it collides, and every assertion this function could make about
 * level 1 would pass with the body deleted. That is a coincidence of the current tile
 * vocabulary, not a property of the game — write one non-solid block remnant (a bumped
 * block that leaves a hole, say) and the layer would quietly go on colliding with a
 * tile that is no longer there. So the index and the collision are both written, from
 * the same `isSolid` that built the layer.
 *
 * It diffs the whole map rather than watching the block lists. That is ~3000 integer
 * compares for level 1 and ~3750 for the widest level, once a frame — nothing beside
 * the drawing — and it buys the property worth having: ANY change to `world.map`
 * reaches the layer, whatever wrote it. A respawn arrives this way too, as it must —
 * `respawnLevel` replaces `world.map` with a freshly generated array in which every
 * bumped block is a `?` again, and every one of those cells differs from the layer.
 *
 * Both sides are the level's own dimensions — the layer was parsed from a map of this
 * level and `respawnLevel` regenerates the same level — so the row lookup needs no
 * bounds check. A different level means a different world and a different layer.
 */
export function syncCollisionLayer(layer: Phaser.Tilemaps.TilemapLayer, world: World): void {
  const tiles = layer.layer.data;
  for (let ty = 0; ty < tiles.length; ty++) {
    const row = tiles[ty];
    const source = world.map[ty];
    for (let tx = 0; tx < row.length; tx++) {
      const code = source[tx];
      const tile = row[tx];
      if (tile.index === code) continue;
      tile.index = code;
      // One argument sets all four sides, and recalculates this tile's and its
      // neighbours' interesting faces — the edges Arcade separates against, which are
      // exactly what a cell turning solid or hollow changes for the tiles around it.
      tile.setCollision(isSolid(code));
    }
  }
}

/**
 * `Tile#setCollision`'s four sides — left, right, up, down — for each kind of tile.
 *
 * Arcade names the sides of the TILE: `up` is its top face, which stops a body moving DOWN
 * onto it (`TileCheckY`: `deltaY() > 0 && collideUp`), and `down` is its underside, which
 * stops a body moving up. So a plank is `up` alone. This is the only part of the per-side
 * collision a test can reach (see the Phaser import note at the top of this file).
 */
export function collisionSides(faces: TileFaces): [boolean, boolean, boolean, boolean] {
  switch (faces) {
    case 'all': return [true, true, true, true];
    case 'top': return [false, false, true, false];
    default: return [false, false, false, false];
  }
}

/**
 * Sets every tile's collision in `layer` from `rule`, then recomputes, once, the faces
 * Arcade separates against. Tiles Phaser holds as empty (index -1) answer `none`.
 */
export function applyTileFaces(layer: Phaser.Tilemaps.TilemapLayer, rule: FacesRule): void {
  layer.forEachTile((tile) => {
    const [left, right, up, down] = collisionSides(rule(tile.index));
    tile.setCollision(left, right, up, down, false);
  });
  layer.calculateFacesWithin();
}

/**
 * The same for one tile — one just put back into the layer, such as a trapdoor cell that
 * has shut. Recalculates that tile's faces and its neighbours'.
 */
export function applyTileFacesAt(
  layer: Phaser.Tilemaps.TilemapLayer,
  tileX: number,
  tileY: number,
  rule: FacesRule,
): void {
  const tile = layer.getTileAt(tileX, tileY);
  if (!tile) return;
  const [left, right, up, down] = collisionSides(rule(tile.index));
  tile.setCollision(left, right, up, down, true);
}
