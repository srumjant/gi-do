import { LEVELS, LEVEL_NAME_KEYS, type Level } from './levels';
import { DINO_CANYON_2 } from './levels2/dinoCanyon2';
import { DOLL_GARDEN_2 } from './levels2/dollGarden2';

/** One level of the run: which theme it belongs to, the level itself, and its name's key. */
export interface Stage {
  /** 0-5. Whose hills, music, kidnapper and colours: the classic level's index. */
  theme: number;
  level: Level;
  nameKey: string;
}

/** A theme's second level (docs/superpowers/specs/2026-11-22-extra-levels-design.md). */
export interface SecondLevel {
  level: Level;
  nameKey: string;
}

/**
 * The run: every theme's classic level, then its second one. Toy Castle's second level comes
 * BEFORE its classic one, because the classic Toy Castle has the boss and the boss is the end
 * (game/boss.ts's isFinalLevel). A theme with no second level yet just has the one.
 */
export function buildStages(seconds: Partial<Record<number, SecondLevel>>): Stage[] {
  const last = LEVELS.length - 1;
  return LEVELS.flatMap((level, theme) => {
    const classic: Stage = { theme, level, nameKey: LEVEL_NAME_KEYS[theme] };
    const second = seconds[theme];
    if (!second) return [classic];
    const extra: Stage = { theme, level: second.level, nameKey: second.nameKey };
    return theme === last ? [extra, classic] : [classic, extra];
  });
}

export const STAGES: readonly Stage[] = buildStages({
  0: { level: DOLL_GARDEN_2, nameKey: 'level_1_2' },
  1: { level: DINO_CANYON_2, nameKey: 'level_2_2' },
});
