import { describe, expect, it } from 'vitest';
import { LEVELS, LEVEL_NAME_KEYS } from '../src/data/levels';
import { buildStages, STAGES } from '../src/data/stages';

const named = (name: string) => ({ ...LEVELS[0], name });

describe('the run order', () => {
  it('is the six classic levels when no theme has a second one', () => {
    expect(buildStages({}).map((s) => [s.theme, s.level])).toEqual(LEVELS.map((l, i) => [i, l]));
  });

  it('plays a theme\'s second level right after its classic one', () => {
    const second = { level: named('Doll Garden II'), nameKey: 'level_1_2' };
    const stages = buildStages({ 0: second });
    expect(stages.map((s) => s.level.name)).toEqual([
      'Doll Garden', 'Doll Garden II', 'Dinosaur Canyon', 'Tallinn Old Town',
      'Palermo Piazza', 'Winter Wonderland', 'Toy Castle',
    ]);
    expect(stages[1]).toEqual({ theme: 0, level: second.level, nameKey: 'level_1_2' });
  });

  it('puts Toy Castle\'s second level before the boss, so the boss stays the finale', () => {
    const stages = buildStages({ 5: { level: named('Toy Castle II'), nameKey: 'level_6_2' } });
    expect(stages.slice(-2).map((s) => s.level.name)).toEqual(['Toy Castle II', 'Toy Castle']);
  });

  it('names every classic stage by its classic key, and ends on the boss', () => {
    for (const s of STAGES) if (LEVELS.includes(s.level)) expect(s.nameKey).toBe(LEVEL_NAME_KEYS[s.theme]);
    expect(STAGES[STAGES.length - 1].level).toBe(LEVELS[LEVELS.length - 1]);
  });
});
