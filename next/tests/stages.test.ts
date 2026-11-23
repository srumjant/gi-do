import { describe, expect, it } from 'vitest';
import { LEVELS, LEVEL_NAME_KEYS } from '../src/data/levels';
import { buildStages, STAGES } from '../src/data/stages';

const named = (name: string) => ({ ...LEVELS[0], name });

describe('the run order', () => {
  it('is the six classic levels when no theme has a list of its own', () => {
    expect(buildStages({}).map((s) => [s.theme, s.level])).toEqual(LEVELS.map((l, i) => [i, l]));
  });

  it('plays a theme\'s own list in place of its classic level', () => {
    const a = named('A');
    const b = named('B');
    const stages = buildStages({ 1: [{ level: a, nameKey: 'x' }, { level: b, nameKey: 'y' }] });
    expect(stages.map((s) => s.level.name)).toEqual([
      'Doll Garden', 'A', 'B', 'Tallinn Old Town', 'Palermo Piazza', 'Winter Wonderland', 'Toy Castle',
    ]);
    expect(stages[2]).toEqual({ theme: 1, level: b, nameKey: 'y' });
  });

  it('names every classic stage by its classic key, and ends on the T-Rex', () => {
    for (const s of STAGES) if (LEVELS.includes(s.level)) expect(s.nameKey).toBe(LEVEL_NAME_KEYS[s.theme]);
    // Every theme is reworked (2026-11-23): the run ends on Troonisaal and the T-Rex's new fight.
    const last = STAGES[STAGES.length - 1].level;
    expect(last.ending).toBe('boss');
    expect(last.course?.boss?.kind).toBe('tRex');
    expect(STAGES.some((s) => LEVELS.includes(s.level))).toBe(false);
  });
});
