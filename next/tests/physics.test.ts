import { describe, expect, it } from 'vitest';
import { STEP_HZ, TILE } from '../src/config/constants';
import { isSolid, TILE_BRICK } from '../src/data/levels';
import { bumpBlocksAbove } from '../src/game/player';
import { createWorld } from '../src/game/world';
import { PX_PER_FRAME_TO_PX_PER_SECOND } from '../src/physics/body';
import { headTileRow } from '../src/physics/player';
import { SOLID_TILE_INDEXES } from '../src/physics/tiles';

/**
 * What this can and cannot check.
 *
 * It checks the two RULES the Arcade layer is built from — the set of colliding tile
 * indexes, and the arithmetic either side of the body — and it checks the block bump end
 * to end from the signal Arcade hands us. It does not construct a body, a layer or a
 * step: Phaser reads `navigator`, then `window`, then a canvas while its module body
 * runs, so it cannot be imported at all under Vitest's node environment, and the project
 * has no DOM environment installed. (Measured, not assumed: shimming `navigator` alone
 * gets as far as `window.cordova`.) Shimming far enough to stand up an Arcade World and a
 * TilemapLayer means the thing under test is the shim. Everything that needs a real body
 * — that it separates, that it lands flush, that `blocked.down` and `blocked.up` fire
 * when they should — was checked in the browser instead; see the commit message.
 */
describe('the collision layer collides on exactly the solid tiles', () => {
  it('accepts every code isSolid accepts and no other', () => {
    const codes = Array.from({ length: 256 }, (_, code) => code);
    expect(codes.filter((code) => SOLID_TILE_INDEXES.includes(code))).toEqual(
      codes.filter(isSolid),
    );
  });
});

describe('the frame-to-second conversion', () => {
  // Every speed in the game is px per FRAME and Arcade integrates in seconds. Getting
  // this constant wrong does not fail anywhere near here: the player simply runs and
  // jumps at the wrong speed, which reads as "the port feels floaty" rather than as a
  // bug. Pinned against the simulation's own rate rather than against the literal 60.
  it('is the simulation rate, so one frame of velocity is one frame of travel', () => {
    expect(PX_PER_FRAME_TO_PX_PER_SECOND).toBe(STEP_HZ);
  });

  // Arcade's step moves the body by `velocity * (1 / fps)`, so a velocity handed over as
  // `v * STEP_HZ` has to come back out of that multiplication as `v` px of travel. Checked
  // over the whole range the player can reach: vx runs to dc.playerSpeed (about 2.6) and
  // vy is clamped to 8 (index.html:1403), in both directions.
  it('survives the round trip through Arcade\'s own delta at every speed the player reaches', () => {
    const delta = 1 / STEP_HZ;
    for (let hundredths = -800; hundredths <= 800; hundredths++) {
      const perFrame = hundredths / 100;
      const travelled = (perFrame * PX_PER_FRAME_TO_PX_PER_SECOND) * delta;
      expect(travelled).toBeCloseTo(perFrame, 10);
    }
  });
});

describe('headTileRow', () => {
  // Arcade leaves the body's top edge exactly on the bottom edge of the tile it hit, and
  // that edge floors to the row BELOW the block. An off-by-one here does not crash or
  // look wrong on screen — the blocks just quietly stop paying out.
  it('names the tile that was hit, not the empty row under it', () => {
    for (let row = 0; row < 40; row++) {
      const separatedTop = (row + 1) * TILE;
      expect(headTileRow(separatedTop)).toBe(row);
    }
  });
});

describe('bumping a block from below', () => {
  // The bump used to be a branch of the hand-rolled Y sweep, which no longer exists: it
  // now runs off `body.blocked.up`, with the row worked out by headTileRow. This drives
  // that composition against the real level-1 blocks, standing the player where Arcade
  // would have left it after separating under each one.
  function underBlock(world: ReturnType<typeof createWorld>, tx: number, ty: number): void {
    const p = world.player;
    p.x = tx * TILE;
    // Where Arcade's separation puts the body's top edge: flush under the block.
    p.y = (ty + 1) * TILE;
  }

  it('pops a star out of every question block in level 1, one per block', () => {
    const world = createWorld(0, 'normal');
    const blocks = world.questionBlocks.map((b) => ({ x: b.x, y: b.y }));
    expect(blocks.length).toBeGreaterThan(0);

    for (const block of blocks) {
      underBlock(world, block.x, block.y);
      bumpBlocksAbove(world, headTileRow(world.player.y));
    }

    expect(world.questionBlocks.every((b) => b.hit)).toBe(true);
    expect(world.stars.length).toBe(blocks.length);
    for (const block of blocks) {
      // One tile ABOVE the block it came out of (index.html:1419).
      expect(world.stars.some((s) => s.x === block.x * TILE && s.y === block.y * TILE - TILE))
        .toBe(true);
      expect(world.map[block.y][block.x]).toBe(TILE_BRICK);
    }
  });

  it('pays out once — a second hit on a spent block gives nothing', () => {
    const world = createWorld(0, 'normal');
    const block = world.questionBlocks[0];
    underBlock(world, block.x, block.y);

    bumpBlocksAbove(world, headTileRow(world.player.y));
    expect(world.stars.length).toBe(1);

    bumpBlocksAbove(world, headTileRow(world.player.y));
    expect(world.stars.length).toBe(1);
  });

  it('takes a rainbow block and freezes the world with the announcement', () => {
    const world = createWorld(0, 'normal');
    const block = world.rainbowBlocks[0];
    expect(block).toBeDefined();
    underBlock(world, block.x, block.y);

    bumpBlocksAbove(world, headTileRow(world.player.y));

    expect(block.hit).toBe(true);
    expect(world.map[block.y][block.x]).toBe(TILE_BRICK);
    expect(world.powerupPopup).not.toBeNull();
  });

  // The row is the whole of the lookup, so the arithmetic that produces it is the thing
  // most likely to silently disable every block in the game. Standing one row lower —
  // what flooring the SNAPPED position would give — must find nothing.
  it('finds nothing a row out, which is what a bad snap would look like', () => {
    const world = createWorld(0, 'normal');
    const block = world.questionBlocks[0];
    underBlock(world, block.x, block.y);

    bumpBlocksAbove(world, Math.floor(world.player.y / TILE));

    expect(block.hit).toBe(false);
    expect(world.stars.length).toBe(0);
  });
});
