import {
  DIFFICULTY_CONFIG,
  DIFF_KEYS,
  type DifficultyKey,
  type DifficultyRecord,
} from '../config/difficulty';
import { TStr } from '../config/i18n';
import type { Character } from './player';
import { CHARACTERS } from './run';

/**
 * What the two choice screens DECIDE, with none of what they draw.
 *
 * The difficulty screen and the character screen are almost entirely paint — boxes,
 * star fields, a sprite — but underneath the paint each one answers a question that has
 * a right and a wrong answer: which record does cursor position 2 mean, which of the
 * four lines on a card exist for THIS difficulty, what does 0.6 enemy speed read as in
 * words. Those are the parts that can be wrong without looking wrong, so they live
 * here, as pure functions with no Phaser and no canvas, and the scenes call them.
 *
 * Everything below is ported from the two live draw functions and the input handling
 * that drives them: `drawDifficulty` (index.html:2121-2149) with its state dispatch at
 * :1331-1336, and `drawSelect` (:2151-2168) with its dispatch at :1337-1346.
 */

/**
 * Left/right on a row that STOPS at its ends — the live difficulty cursor
 * (index.html:1332-1333: `Math.max(0, diffIndex-1)` / `Math.min(len-1, diffIndex+1)`).
 * It does not wrap, and that is deliberate on a row of four cards laid out left to
 * right: wrapping from Hard straight back to Super Easy would move the highlight the
 * full width of the screen in the direction the child did not press.
 */
export function clampIndex(index: number, delta: number, length: number): number {
  return Math.min(length - 1, Math.max(0, index + delta));
}

/**
 * Up/down on a list that WRAPS — the live skin cursor (index.html:1340-1343:
 * `(gigiSkin-1+GIGI_SKINS.length)%GIGI_SKINS.length`). Two skins per character today,
 * so up and down do the same thing; the wrap is what makes a two-item list feel like a
 * toggle rather than a list with a dead end.
 *
 * `delta` is ±1, as every call site uses it; the `+ length` covers exactly that one
 * step below zero and no more.
 */
export function wrapIndex(index: number, delta: number, length: number): number {
  return (index + delta + length) % length;
}

/**
 * The difficulty a cursor position means (index.html:1334's
 * `selectedDifficulty = DIFF_KEYS[diffIndex]`). Out of range falls back to the first
 * key rather than returning `undefined` — `clampIndex` should make that impossible, and
 * a menu is not the place to find out it did not.
 */
export function difficultyAt(index: number): DifficultyKey {
  return DIFF_KEYS[index] ?? DIFF_KEYS[0];
}

/**
 * The character a cursor position means (index.html:1344's
 * `selectedChar = selectIndex===0 ? 'gigi' : 'dodo'`).
 */
export function characterAt(index: number): Character {
  return CHARACTERS[index] ?? CHARACTERS[0];
}

/**
 * The one in the cage. Playing as Gigi you are rescuing Dodo and the other way round —
 * the rule `getRescueSprites` (game/run.ts) applies to sprites, applied here to the
 * name the character screen prints under its hint (index.html:2166).
 */
export function siblingOf(character: Character): Character {
  return character === 'gigi' ? 'dodo' : 'gigi';
}

/**
 * A character's name as the screen spells it. NOT translated, and not an oversight:
 * the live game writes the literals 'GIGI' and 'DODO' on the portraits
 * (index.html:2158, 2163) and 'Dodo' / 'Gigi' in the rescue line (:2166). They are the
 * children's own names for them and read the same in both languages.
 */
export function characterName(character: Character): string {
  return character === 'gigi' ? 'Gigi' : 'Dodo';
}

/**
 * How fast the enemies are, in words (index.html:2135). Four bands over a multiplier,
 * and the boundaries are inclusive upper bounds — `<=0.3` catches super_easy's 0.3
 * exactly, `<=1.0` catches normal's 1.0 exactly — so each of the four records lands in
 * a band of its own with nothing left over. Returns a translation KEY, not a string:
 * the caller translates, so nothing here has to know which language is on.
 */
export function enemySpeedKey(enemySpeed: number): string {
  if (enemySpeed <= 0.3) return 'very_slow';
  if (enemySpeed <= 0.7) return 'slow';
  if (enemySpeed <= 1.0) return 'normal_speed';
  return 'fast';
}

/**
 * The score multiplier as the card prints it (index.html:2138). Below 1 is a plain
 * '0.5x', above 1 earns the exclamation mark, and exactly 1 is the literal '1x' rather
 * than the number formatted — which matters, because `1.0` formats as '1' in
 * JavaScript and the live game spells that case out by hand instead of relying on it.
 */
export function scoreText(multiplier: number): string {
  if (multiplier < 1) return `${multiplier}x`;
  if (multiplier > 1) return `${multiplier}x!`;
  return '1x';
}

/**
 * Everything one difficulty card says about itself, in order, already translated.
 *
 * Read off the REAL record every time. The live game does the same — `cfg.bowCharges`,
 * `cfg.lives`, `cfg.enemySpeed` (index.html:2132-2139) — and it is the only thing
 * keeping the screen honest: a hardcoded summary would go on claiming four arrows long
 * after someone had changed `easy.bowCharges` to three, and the child would be told a
 * lie by the menu that chose the setting.
 *
 * Five lines, or six on `super_easy`, which is the only record carrying an
 * `enemySkipChance` and so the only one with a 'fewer enemies' line. The live layout
 * looks conditional — it writes the score at `y + (cfg.enemySkipChance ? 120 : 102)` —
 * but the offsets are 30, 48, 66, 84, 102, 120, which is just eighteen pixels a line
 * from y+30. So the ONLY thing the skip line changes is how many lines there are, and
 * a plain ordered list reproduces the live screen exactly. The scene steps 18px per
 * entry and needs no conditional of its own.
 */
export function difficultyLines(key: DifficultyKey): string[] {
  const cfg: DifficultyRecord = DIFFICULTY_CONFIG[key];
  const lines = [
    // index.html:2132. `∞` rather than the number, because `Infinity` prints as
    // 'Infinity' and super_easy really does have infinite lives.
    `${cfg.lives === Infinity ? '∞' : cfg.lives} ${TStr('lives')}`,
    `${cfg.bowCharges} ${TStr('arrows')}`,
    // index.html:2134. Three states, not two: no cape, a cape you start with, and a
    // cape that also catches you over a pit — the last of which is super_easy alone.
    cfg.startWithCape
      ? (cfg.capeSavesPit ? TStr('cape_pit') : TStr('cape_start'))
      : TStr('no_cape'),
    // index.html:2136. `enemies_label` carries its own trailing space and colon, so
    // this really is a bare concatenation (same shape as the HUD's score label).
    TStr('enemies_label') + TStr(enemySpeedKey(cfg.enemySpeed)),
  ];
  if (cfg.enemySkipChance) lines.push(TStr('fewer_enemies'));
  lines.push(scoreText(cfg.scoreMultiplier));
  return lines;
}
