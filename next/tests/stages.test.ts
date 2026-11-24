import { describe, expect, it } from 'vitest';
import { HOME_THEME, LEVELS, LEVEL_NAME_KEYS } from '../src/data/levels';
import { buildStages, snatcher, STAGES } from '../src/data/stages';

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

  it('names every classic stage by its classic key, and ends on Härra Kaka at home', () => {
    for (const s of STAGES) if (LEVELS.includes(s.level)) expect(s.nameKey).toBe(LEVEL_NAME_KEYS[s.theme]);
    // Every theme is reworked (2026-11-23), and after the T-Rex comes the home world
    // (2026-11-24): the run ends on Härra Kaka's fight.
    const last = STAGES[STAGES.length - 1].level;
    expect(last.ending).toBe('boss');
    expect(last.course?.boss?.kind).toBe('poo');
    expect(STAGES.some((s) => LEVELS.includes(s.level))).toBe(false);
  });

  it('has each theme snatched into by its own villain, the one its last level ends with', () => {
    // Every theme is reworked (2026-11-23): the cutscene before a theme's first level shows
    // that theme's villain taking the sibling, not the original game's kidnapper.
    const themes = [...new Set(STAGES.map((s) => s.theme))];
    for (const theme of themes) {
      const stages = STAGES.filter((s) => s.theme === theme);
      const boss = stages[stages.length - 1].level.course?.boss?.kind;
      expect({ theme, villain: snatcher(stages[0]) }).toEqual({ theme, villain: boss });
    }
  });

  it('has no villain for a classic level, which keeps the original kidnapper', () => {
    expect(snatcher({ theme: 0, level: LEVELS[0], nameKey: 'level_1' })).toBeNull();
  });
});

describe('a theme past the classic six', () => {
  it('is played after them, in its own order', () => {
    const a = named('A');
    const b = named('B');
    const stages = buildStages({ [HOME_THEME]: [{ level: a, nameKey: 'x' }, { level: b, nameKey: 'y' }] });
    expect(stages.slice(-2)).toEqual([
      { theme: HOME_THEME, level: a, nameKey: 'x' },
      { theme: HOME_THEME, level: b, nameKey: 'y' },
    ]);
    expect(stages.slice(0, -2).map((s) => s.level)).toEqual(LEVELS);
  });

  it('is the first theme with no classic level', () => {
    expect(HOME_THEME).toBe(LEVELS.length);
  });
});
