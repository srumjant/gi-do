import { describe, expect, it } from 'vitest';
import { findLocks } from './helpers/reach';
import { DIFF_KEYS } from '../src/config/difficulty';
import { LEVELS } from '../src/data/levels';
import { STAGES } from '../src/data/stages';

/**
 * Nowhere a hero can get to in a level is a dead end: from every spot they can reach, with any
 * power run out, they can still get to the end (helpers/reach.ts). Found by the owner
 * (2026-11-23): stepping off the top of Nukumaja's stairs before shooting the target left you
 * on the floor between a sheer wall and the shut gate, for good.
 */
describe('no dead ends', () => {
  for (const { level } of STAGES.filter((s) => !LEVELS.includes(s.level))) {
    it(`leaves no dead end in ${level.name}, on any difficulty`, () => {
      for (const key of DIFF_KEYS) {
        const { locks, finishable } = findLocks(level, key);
        expect({ key, finishable, locks }).toEqual({ key, finishable: true, locks: [] });
      }
    });
  }
});
