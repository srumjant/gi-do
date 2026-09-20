import { describe, expect, it } from 'vitest';
import { loadLegacySection } from './helpers/legacy';
import { DIFFICULTY_CONFIG } from '../src/config/difficulty';
import { LEVELS } from '../src/data/levels';
import { findGroundY, getTile, isSolid, rectOverlap } from '../src/game/tiles';

const legacy = loadLegacySection({
  from: '//  LEVELS',
  to: '//  GAME STATE',
  expose: ['LEVELS'],
});

const map = LEVELS[0].generate(DIFFICULTY_CONFIG.normal);

describe('isSolid matches the live game', () => {
  // The live rule is an explicit list of four codes (index.html:1138), not "non-zero".
  it.each([[0, false], [1, true], [2, true], [3, true], [4, false], [5, true], [6, false]])(
    'tile %i solid = %s', (code, expected) => {
      expect(isSolid(code)).toBe(expected);
    },
  );
});

describe('getTile matches the live game', () => {
  it('reads by pixel coordinate, flooring to the tile grid', () => {
    // Bottom two rows of every level are ground.
    const groundY = (LEVELS[0].height - 1) * 16;
    expect(getTile(map, 32, groundY)).toBe(1);
    expect(getTile(map, 47, groundY)).toBe(1); // same tile, right edge
    expect(getTile(map, 48, groundY)).toBe(1); // next tile
  });

  // index.html:1137 returns 0 outside the map, NOT a solid value. Nothing in the tile
  // layer stops the player leaving sideways — an explicit `if (p.x < 0) p.x = 0` clamp
  // does, on the left only. Walk off the right-hand end and you fall into the void and
  // die to the pit check, which is the live behaviour and is preserved.
  it('reads empty outside the map, on every side', () => {
    expect(getTile(map, -8, 0)).toBe(0);
    expect(getTile(map, LEVELS[0].width * 16 + 8, 0)).toBe(0);
    expect(getTile(map, 32, -8)).toBe(0);
    expect(getTile(map, 32, LEVELS[0].height * 16 + 8)).toBe(0);
  });

  it('agrees with the live implementation across a dense sample of the level', () => {
    const live = legacy.LEVELS[0].generate(DIFFICULTY_CONFIG.normal);
    for (let ty = 0; ty < LEVELS[0].height; ty++) {
      for (let tx = 0; tx < LEVELS[0].width; tx++) {
        expect(getTile(map, tx * 16 + 8, ty * 16 + 8)).toBe(live[ty][tx]);
      }
    }
  });
});

// findGroundY is not exercised by the live-game comparison above (it lives past the
// `//  GAME STATE` banner, outside the slice loadLegacySection reads here), so it is
// checked directly against level 1's known generated geometry instead.
describe('findGroundY matches the live game', () => {
  it('returns the ground row for a column with nothing above it', () => {
    // Tile x=0 in level 1 has no platform, question block or gap over it — the first
    // solid tile scanning down from the top is the ground itself.
    const groundRow = LEVELS[0].height - 2;
    expect(findGroundY(map, 0)).toBe(groundRow * 16);
  });

  it('scans downward and stops at a platform above the ground, not the floor', () => {
    // Level 1's generate() stamps a platform at row 19, tiles x 10-14
    // (addPlats([[10,19,5], ...])), well above the ground rows (height-2, height-1).
    // findGroundY must return the platform — reproducing the live scan-from-the-top
    // behaviour rather than "fixing" it to find the floor.
    expect(findGroundY(map, 10)).toBe(19 * 16);
  });
});

describe('rectOverlap matches the live game', () => {
  it('is true for overlapping rectangles', () => {
    expect(rectOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
  });

  // index.html:1139 uses strict < / >, so rectangles that merely touch do not overlap.
  it('is false for rectangles that only touch at an edge', () => {
    expect(rectOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false); // touch on x
    expect(rectOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 10, w: 10, h: 10 })).toBe(false); // touch on y
  });

  it('is false for fully separate rectangles', () => {
    expect(rectOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 50, y: 50, w: 10, h: 10 })).toBe(false);
  });
});
