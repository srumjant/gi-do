import { afterEach, describe, expect, it } from 'vitest';
import { DIFFICULTY_CONFIG, DIFF_KEYS } from '../src/config/difficulty';
import { getLang, setLang, TRANSLATIONS, TStr } from '../src/config/i18n';
import {
  characterAt,
  characterName,
  clampIndex,
  difficultyAt,
  difficultyLines,
  enemySpeedKey,
  scoreText,
  siblingOf,
  wrapIndex,
} from '../src/game/menu';
import { CHARACTERS, skinsOf } from '../src/game/run';

// The screens are drawing and are checked by eye; this covers the part underneath them
// that can be wrong without looking wrong. Every assertion runs over the WHOLE set of
// options rather than spot-checking one — the failure this guards against is a record
// the menu forgets about or describes with someone else's numbers, and one test per
// difficulty would be the shape most likely to miss exactly that.

afterEach(() => setLang('et'));

describe('a cursor position maps to a choice', () => {
  it('covers every difficulty, in order', () => {
    expect(DIFF_KEYS.map((_, i) => difficultyAt(i))).toEqual(DIFF_KEYS);
  });

  it('covers every character, in the order the screen draws them', () => {
    expect(CHARACTERS.map((_, i) => characterAt(i))).toEqual(['gigi', 'dodo']);
  });

  // Out of range cannot happen through clampIndex; it returning `undefined` if it ever
  // did would put a menu one property access away from crashing.
  it('falls back to the first option rather than off the end', () => {
    expect(difficultyAt(DIFF_KEYS.length)).toBe(DIFF_KEYS[0]);
    expect(difficultyAt(-1)).toBe(DIFF_KEYS[0]);
    expect(characterAt(2)).toBe('gigi');
  });

  it('pairs each character with the other as the one to rescue', () => {
    for (const character of CHARACTERS) {
      expect(siblingOf(character)).not.toBe(character);
      expect(siblingOf(siblingOf(character))).toBe(character);
    }
    expect(characterName(siblingOf('gigi'))).toBe('Dodo');
    expect(characterName(siblingOf('dodo'))).toBe('Gigi');
  });
});

describe('the two ways a cursor moves', () => {
  // index.html:1327-1328. Walk the whole row both ways and past both ends.
  it('clamps at both ends of the difficulty row', () => {
    const last = DIFF_KEYS.length - 1;
    let i = 0;
    for (let step = 0; step <= last + 2; step++) i = clampIndex(i, 1, DIFF_KEYS.length);
    expect(i).toBe(last);
    for (let step = 0; step <= last + 2; step++) i = clampIndex(i, -1, DIFF_KEYS.length);
    expect(i).toBe(0);
  });

  // index.html:1335-1338. Every character's skin list, round in both directions.
  it('wraps round every character skin list', () => {
    for (const character of CHARACTERS) {
      const count = skinsOf(character).length;
      expect(count).toBeGreaterThan(0);
      let up = 0;
      for (let step = 0; step < count; step++) up = wrapIndex(up, 1, count);
      expect(up).toBe(0);
      expect(wrapIndex(0, -1, count)).toBe(count - 1);
      expect(wrapIndex(count - 1, 1, count)).toBe(0);
    }
  });
});

describe('a difficulty card describes its own record', () => {
  // The point of the whole module: the screen reads DIFFICULTY_CONFIG, so changing a
  // record changes what the menu promises. A hardcoded summary would pass a test that
  // was also hardcoded, so every expectation below is derived from the record.
  it('prints each record\'s own numbers', () => {
    for (const key of DIFF_KEYS) {
      const cfg = DIFFICULTY_CONFIG[key];
      const lines = difficultyLines(key);
      expect(lines[0], key).toBe(`${cfg.lives === Infinity ? '∞' : cfg.lives} ${TStr('lives')}`);
      expect(lines[1], key).toBe(`${cfg.bowCharges} ${TStr('arrows')}`);
      expect(lines.at(-1), key).toBe(scoreText(cfg.scoreMultiplier));
    }
    // And the numbers really are per-card. The four records carry four different arrow
    // counts and four different multipliers, so a screen wired to one shared record —
    // the failure mode this whole module exists to prevent — would repeat itself here.
    const arrows = DIFF_KEYS.map((key) => difficultyLines(key)[1]);
    const scores = DIFF_KEYS.map((key) => difficultyLines(key).at(-1));
    expect(new Set(arrows).size).toBe(DIFF_KEYS.length);
    expect(new Set(scores).size).toBe(DIFF_KEYS.length);
  });

  // Six lines only where there is a sixth thing to say, and super_easy is the only
  // record with an enemySkipChance (config/difficulty.ts's header: four fields exist on
  // that record alone).
  it('adds the fewer-enemies line to exactly the records that skip enemies', () => {
    for (const key of DIFF_KEYS) {
      const skips = 'enemySkipChance' in DIFFICULTY_CONFIG[key];
      expect(difficultyLines(key).includes(TStr('fewer_enemies')), key).toBe(skips);
      expect(difficultyLines(key).length, key).toBe(skips ? 6 : 5);
    }
  });

  // index.html:2134's three-way cape line, asserted from the flags rather than by name.
  it('says which kind of cape, if any, each record starts you with', () => {
    for (const key of DIFF_KEYS) {
      const cfg = DIFFICULTY_CONFIG[key];
      const expected = cfg.startWithCape
        ? ('capeSavesPit' in cfg ? TStr('cape_pit') : TStr('cape_start'))
        : TStr('no_cape');
      expect(difficultyLines(key)[2], key).toBe(expected);
    }
  });

  // The bands are inclusive upper bounds, so each record must land in one of its own —
  // four records, four distinct words. A band boundary moved by a hundredth would put
  // two records in the same band and this is what would notice.
  it('gives every record a speed band of its own', () => {
    const words = DIFF_KEYS.map((key) => enemySpeedKey(DIFFICULTY_CONFIG[key].enemySpeed));
    expect(new Set(words).size).toBe(DIFF_KEYS.length);
    expect(words).toEqual(['very_slow', 'slow', 'normal_speed', 'fast']);
    // The boundaries themselves, which the records sit exactly on.
    expect(enemySpeedKey(0.3)).toBe('very_slow');
    expect(enemySpeedKey(0.7)).toBe('slow');
    expect(enemySpeedKey(1.0)).toBe('normal_speed');
    expect(enemySpeedKey(1.01)).toBe('fast');
  });

  // index.html:2139. 1.0 is spelled out because `${1.0}` is '1', not '1.0'.
  it('marks a bonus multiplier and spells the plain one out', () => {
    expect(scoreText(0.5)).toBe('0.5x');
    expect(scoreText(1)).toBe('1x');
    expect(scoreText(1.5)).toBe('1.5x!');
  });

  // Every key the card reaches for exists in both languages, and nothing on a card
  // comes back as a raw key. TStr returns the key itself when it misses, which is a
  // silent failure on screen — 'fewer_enemies' where 'Vähem vaenlasi' should be.
  it('translates every line in both languages', () => {
    for (const lang of ['et', 'en'] as const) {
      setLang(lang);
      expect(getLang()).toBe(lang);
      for (const key of DIFF_KEYS) {
        for (const line of difficultyLines(key)) {
          expect(line.length, `${lang}/${key}`).toBeGreaterThan(0);
          expect(Object.keys(TRANSLATIONS), `${lang}/${key}: ${line}`).not.toContain(line.trim());
        }
      }
    }
  });
});
