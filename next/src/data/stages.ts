import { LEVELS, LEVEL_NAME_KEYS, type Level } from './levels';
import { DINO_CANYON_2 } from './levels2/dinoCanyon2';
import { DOLL_GARDEN_2 } from './levels2/dollGarden2';
import { JAALOSS } from './levels2/jaaloss';
import { JARV } from './levels2/jarv';
import { KANJON } from './levels2/kanjon';
import { KATEDRAAL } from './levels2/katedraal';
import { NUKUAED } from './levels2/nukuaed';
import { NUKUMAJA } from './levels2/nukumaja';
import { PIAZZA } from './levels2/piazza';
import { RAEKODA } from './levels2/raekoda';
import { TALVEMAA } from './levels2/talvemaa';
import { TORNID } from './levels2/tornid';
import { TURG } from './levels2/turg';
import { VANALINN } from './levels2/vanalinn';
import { VULKAAN } from './levels2/vulkaan';

/** One level of the run: which theme it belongs to, the level itself, and its name's key. */
export interface Stage {
  /** 0-5. Whose hills, music, kidnapper and colours: the classic level's index. */
  theme: number;
  level: Level;
  nameKey: string;
}

/** One of a theme's levels, and the key of its name. */
export interface LevelEntry {
  level: Level;
  nameKey: string;
}

/**
 * The run, theme by theme. A theme with a list of its own plays that list in place of its
 * classic level (docs/superpowers/specs/2026-11-22-three-levels-and-a-boss-design.md); a theme
 * not yet reworked plays its classic level alone. Toy Castle keeps its classic level last,
 * because that is the boss and the boss is the end (game/boss.ts's isFinalLevel).
 */
export function buildStages(themes: Partial<Record<number, readonly LevelEntry[]>>): Stage[] {
  return LEVELS.flatMap((level, theme) => {
    const listed = themes[theme];
    if (!listed) return [{ theme, level, nameKey: LEVEL_NAME_KEYS[theme] }];
    return listed.map((entry) => ({ theme, level: entry.level, nameKey: entry.nameKey }));
  });
}

export const STAGES: readonly Stage[] = buildStages({
  0: [
    { level: NUKUAED, nameKey: LEVEL_NAME_KEYS[0] },
    { level: DOLL_GARDEN_2, nameKey: 'level_1_2' },
    { level: NUKUMAJA, nameKey: 'level_1_3' },
  ],
  1: [
    { level: KANJON, nameKey: LEVEL_NAME_KEYS[1] },
    { level: DINO_CANYON_2, nameKey: 'level_2_2' },
    { level: VULKAAN, nameKey: 'level_2_3' },
  ],
  2: [
    { level: VANALINN, nameKey: LEVEL_NAME_KEYS[2] },
    { level: TORNID, nameKey: 'level_3_2' },
    { level: RAEKODA, nameKey: 'level_3_3' },
  ],
  3: [
    { level: PIAZZA, nameKey: LEVEL_NAME_KEYS[3] },
    { level: TURG, nameKey: 'level_4_2' },
    { level: KATEDRAAL, nameKey: 'level_4_3' },
  ],
  4: [
    { level: TALVEMAA, nameKey: LEVEL_NAME_KEYS[4] },
    { level: JARV, nameKey: 'level_5_2' },
    { level: JAALOSS, nameKey: 'level_5_3' },
  ],
});
