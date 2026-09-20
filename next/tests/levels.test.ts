import { describe, expect, it } from 'vitest';
import { loadLegacySection } from './helpers/legacy';
import { DIFFICULTY_CONFIG, DIFF_KEYS } from '../src/config/difficulty';
import { LEVELS, makeGround, addPlats, addGaps } from '../src/data/levels';

const legacy = loadLegacySection({
  from: '//  LEVELS',
  to: '//  GAME STATE',
  expose: ['LEVELS', 'makeGround', 'addPlats', 'addGaps'],
});

describe('level metadata matches the live game', () => {
  it('has the same number of levels', () => {
    expect(LEVELS.length).toBe(legacy.LEVELS.length);
  });

  LEVELS.forEach((_, i) => {
    it(`level ${i} has identical metadata`, () => {
      const mine = LEVELS[i];
      const theirs = legacy.LEVELS[i];
      expect(mine.name).toBe(theirs.name);
      expect(mine.width).toBe(theirs.width);
      expect(mine.height).toBe(theirs.height);
      expect(mine.bg).toBe(theirs.bg);
      expect(mine.groundColor).toBe(theirs.groundColor);
      expect(mine.brickColor).toBe(theirs.brickColor);
      expect(mine.groundTop).toBe(theirs.groundTop);
      expect(mine.playerStart).toEqual(theirs.playerStart);
      expect(mine.rescuePos).toEqual(theirs.rescuePos);
      expect(mine.enemyDefs).toEqual(theirs.enemyDefs);
      expect(mine.bowPositions).toEqual(theirs.bowPositions);
      expect(mine.superPositions).toEqual(theirs.superPositions);
      expect(mine.catPosition).toBe(theirs.catPosition);
      expect(mine.clouds).toEqual(theirs.clouds);
    });
  });
});

// Geometry depends on difficulty: addGaps scales gap width by dc.gapWidth at
// generation time, so the map is not a static asset. Every combination is checked.
describe('generated geometry matches the live game', () => {
  for (const diff of DIFF_KEYS) {
    LEVELS.forEach((_, i) => {
      it(`level ${i} on ${diff} generates an identical map`, () => {
        const dc = DIFFICULTY_CONFIG[diff];
        expect(LEVELS[i].generate(dc)).toEqual(legacy.LEVELS[i].generate(dc));
      });
    });
  }
});

describe('generate() is pure', () => {
  it('returns a fresh map each call, not a shared one', () => {
    const dc = DIFFICULTY_CONFIG.normal;
    const a = LEVELS[0].generate(dc);
    const b = LEVELS[0].generate(dc);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
    a[0][0] = 9;
    expect(b[0][0]).not.toBe(9);
  });
});

describe('builders match the live game', () => {
  it('makeGround produces the same array', () => {
    expect(makeGround(20, 10)).toEqual(legacy.makeGround(20, 10));
  });

  it('addPlats stamps the same tiles', () => {
    const mine = makeGround(20, 10);
    const theirs = legacy.makeGround(20, 10);
    addPlats(mine, [[3, 5, 4], [10, 7, 2]]);
    legacy.addPlats(theirs, [[3, 5, 4], [10, 7, 2]]);
    expect(mine).toEqual(theirs);
  });

  it('addGaps scales the gap by difficulty', () => {
    const narrow = makeGround(30, 10);
    const wide = makeGround(30, 10);
    addGaps(narrow, [[10, 3]], 10, DIFFICULTY_CONFIG.super_easy.gapWidth);
    addGaps(wide, [[10, 3]], 10, DIFFICULTY_CONFIG.hard.gapWidth);
    expect(narrow).not.toEqual(wide);
  });
});
