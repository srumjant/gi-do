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

/**
 * The one field the port leaves out on purpose. The live super_easy record has
 * `capeSavesPit`, the only difficulty whose cape saves you from a pit; in the port every cape
 * does (the owner's call, game/player.ts), so no record needs to say so. An unlisted
 * difference still fails the comparison, which is the point.
 */
const PORT_DROPS = ['capeSavesPit'];

function liveRecord(key: string): Record<string, unknown> {
  const record = { ...legacy.DIFFICULTY_CONFIG[key] };
  for (const field of PORT_DROPS) delete record[field];
  return record;
}

describe('difficulty config matches the live game', () => {
  beforeEach(() => setDifficulty('normal'));

  it('has the same keys in the same order', () => {
    expect(DIFF_KEYS).toEqual(legacy.DIFF_KEYS);
  });

  it('has identical records for every difficulty', () => {
    for (const key of legacy.DIFF_KEYS) {
      expect(DIFFICULTY_CONFIG[key as keyof typeof DIFFICULTY_CONFIG]).toEqual(liveRecord(key));
    }
  });

  it('defaults to normal', () => {
    expect(getDifficulty()).toBe('normal');
    expect(DC()).toEqual(liveRecord('normal'));
  });

  // Bug-compatibility item 9: DC() resolves live, so a difficulty change mid-run
  // retunes the level in progress. Do not cache the record at level start.
  it('resolves live rather than snapshotting', () => {
    const before = DC();
    setDifficulty('hard');
    expect(DC()).not.toBe(before);
    expect(DC()).toEqual(liveRecord('hard'));
  });
});
