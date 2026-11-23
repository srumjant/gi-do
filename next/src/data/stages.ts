import { LEVELS, LEVEL_NAME_KEYS, type Level, type Villain } from './levels';
import { DINO_CANYON_2 } from './levels2/dinoCanyon2';
import { DOLL_GARDEN_2 } from './levels2/dollGarden2';
import { JAALOSS } from './levels2/jaaloss';
import { JARV } from './levels2/jarv';
import { KANJON } from './levels2/kanjon';
import { KATEDRAAL } from './levels2/katedraal';
import { MANGULOSSI } from './levels2/mangulossi';
import { NUKUAED } from './levels2/nukuaed';
import { NUKUMAJA } from './levels2/nukumaja';
import { PIAZZA } from './levels2/piazza';
import { RAEKODA } from './levels2/raekoda';
import { SAALID } from './levels2/saalid';
import { TALVEMAA } from './levels2/talvemaa';
import { TORNID } from './levels2/tornid';
import { TROONISAAL } from './levels2/troonisaal';
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
 * not yet reworked plays its classic level alone. Every theme is reworked now, so the run ends on
 * Troonisaal and the T-Rex's new fight; the classic Toy Castle and its fight (game/boss.ts) are
 * left for the tests that pin them to the original game.
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
  5: [
    { level: MANGULOSSI, nameKey: LEVEL_NAME_KEYS[5] },
    { level: SAALID, nameKey: 'level_6_2' },
    { level: TROONISAAL, nameKey: 'level_6_3' },
  ],
});

/**
 * Who snatches the sibling in the cutscene before `stage`: its villain, the one who runs off
 * with them at the end of the theme's first two levels and is fought at the end of its third.
 * Null on a classic level, which keeps the original game's kidnapper (game/run.ts's
 * getKidnapper).
 */
export function snatcher(stage: Stage): Villain | null {
  return stage.level.villain ?? null;
}
