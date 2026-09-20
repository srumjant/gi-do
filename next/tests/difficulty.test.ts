import { beforeEach, describe, expect, it } from 'vitest';
import { loadLegacySection } from './helpers/legacy';
import {
  DIFFICULTY_CONFIG, DIFF_KEYS, DC, getDifficulty, setDifficulty,
} from '../src/config/difficulty';

const legacy = loadLegacySection({
  from: '//  DIFFICULTY CONFIGURATION',
  to: '//  LANGUAGE / TRANSLATIONS',
  expose: ['DIFFICULTY_CONFIG', 'DIFF_KEYS'],
});

describe('difficulty config matches the live game', () => {
  beforeEach(() => setDifficulty('normal'));

  it('has the same keys in the same order', () => {
    expect(DIFF_KEYS).toEqual(legacy.DIFF_KEYS);
  });

  it('has identical records for every difficulty', () => {
    for (const key of legacy.DIFF_KEYS) {
      expect(DIFFICULTY_CONFIG[key as keyof typeof DIFFICULTY_CONFIG])
        .toEqual(legacy.DIFFICULTY_CONFIG[key]);
    }
  });

  it('defaults to normal', () => {
    expect(getDifficulty()).toBe('normal');
    expect(DC()).toEqual(legacy.DIFFICULTY_CONFIG.normal);
  });

  // Bug-compatibility item 9: DC() resolves live, so a difficulty change mid-run
  // retunes the level in progress. Do not cache the record at level start.
  it('resolves live rather than snapshotting', () => {
    const before = DC();
    setDifficulty('hard');
    expect(DC()).not.toBe(before);
    expect(DC()).toEqual(legacy.DIFFICULTY_CONFIG.hard);
  });
});
