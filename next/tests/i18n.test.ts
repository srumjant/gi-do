import { beforeEach, describe, expect, it } from 'vitest';
import { loadLegacySection } from './helpers/legacy';
import {
  TRANSLATIONS, LANG_KEYS, T, TDiff, capitals, getLang, setLang, setGlyphResolver,
} from '../src/config/i18n';

const legacy = loadLegacySection({
  from: '//  LANGUAGE / TRANSLATIONS',
  to: '//  SOUND ENGINE',
  prelude: 'function padGlyph(action){ return "[" + action + "]"; }',
  expose: ['TRANSLATIONS', 'LANG_KEYS'],
});

/**
 * The strings this port has and the live game does not, named here so that the parity check
 * below stays a parity check.
 *
 * The `learn_*` keys are learn mode's own words. The live game hardcodes them in Estonian
 * inside drawLearn, drawLearnMenu and drawLearnResult rather than keeping them in
 * TRANSLATIONS, so the port's versions are new keys with both languages.
 *
 * An unlisted extra key fails the same assertion a missing live key does, which is the point
 * — the list is a short, deliberate exception, not a hole.
 */
const PORT_ONLY_KEYS = [
  'learn_title', 'learn_choose',
  'learn_letters', 'learn_letters_d',
  'learn_syllables', 'learn_syllables_d',
  'learn_words', 'learn_words_d',
  'learn_menu_hint',
  'learn_find_letter', 'learn_find_syllable', 'learn_find_letters',
  'learn_speak', 'learn_cheers', 'learn_found', 'learn_result_hint',
];

describe('translations match the live game', () => {
  beforeEach(() => {
    setLang('et');
    setGlyphResolver((action) => action);
  });

  it('has the same languages', () => {
    expect(LANG_KEYS).toEqual(legacy.LANG_KEYS);
  });

  it('has the same keys, bar the port-only ones', () => {
    expect(Object.keys(TRANSLATIONS).filter((key) => !PORT_ONLY_KEYS.includes(key)).sort())
      .toEqual(Object.keys(legacy.TRANSLATIONS).sort());
  });

  it('has every port-only key it claims to have', () => {
    expect(PORT_ONLY_KEYS.filter((key) => !TRANSLATIONS[key])).toEqual([]);
  });

  it('has identical values for every key', () => {
    for (const key of Object.keys(legacy.TRANSLATIONS)) {
      expect(TRANSLATIONS[key]).toEqual(legacy.TRANSLATIONS[key]);
    }
  });
});

describe('T()', () => {
  beforeEach(() => {
    setLang('et');
    setGlyphResolver((action) => action);
  });

  it('returns the Estonian string by default', () => {
    expect(T('score')).toBe(capitals(legacy.TRANSLATIONS.score.et as string));
  });

  it('follows the selected language', () => {
    setLang('en');
    expect(getLang()).toBe('en');
    expect(T('score')).toBe(capitals(legacy.TRANSLATIONS.score.en as string));
  });

  it('falls back to the key when it is unknown', () => {
    expect(T('no_such_key')).toBe('no_such_key');
  });

  // Commit 8354ea0: glyph substitution must not run on a phrase array, because
  // indexOf('{') on an array compares whole elements and silently misbehaves.
  it('returns phrase arrays with no placeholder substituted', () => {
    const phrases = T('dino_phrases');
    expect(Array.isArray(phrases)).toBe(true);
    expect(phrases).toEqual((legacy.TRANSLATIONS.dino_phrases.et as string[]).map(capitals));
  });

  // The live game substitutes by ACTION, not by letter: {A} resolves through
  // padGlyph('confirm'), because the glyph depends on the connected pad.
  it('substitutes gamepad placeholders by their action name', () => {
    setGlyphResolver((action) => `[${action}]`);
    const raw = legacy.TRANSLATIONS.press_start.et as string;
    expect(raw).toContain('{A}');
    expect(T('press_start')).toBe(capitals(raw.replace('{A}', '[confirm]')));
  });

  it('leaves strings without a placeholder alone', () => {
    setGlyphResolver(() => 'SHOULD NOT APPEAR');
    expect(T('score')).toBe(capitals(legacy.TRANSLATIONS.score.et as string));
  });

  // The owner's call, for children who read capital letters first: the table keeps the live
  // game's spelling (the parity tests above), and T shows all of it in capitals.
  it('shows every string in capitals, in both languages', () => {
    for (const language of LANG_KEYS) {
      setLang(language);
      for (const key of Object.keys(TRANSLATIONS)) {
        const shown = T(key);
        for (const text of typeof shown === 'string' ? [shown] : shown) {
          expect(text, `${language} ${key}`).not.toMatch(/\p{Ll}/u);
        }
      }
    }
  });
});

describe('TDiff()', () => {
  // lang is module state, so reset it rather than inheriting whatever the last
  // describe block left behind.
  beforeEach(() => setLang('et'));

  it('returns the live game\'s label for every difficulty', () => {
    for (const key of ['super_easy', 'easy', 'normal', 'hard']) {
      expect(TDiff(key)).toBe(capitals(legacy.TRANSLATIONS[key].et as string));
    }
  });

  it('follows the selected language', () => {
    setLang('en');
    expect(TDiff('normal')).toBe(capitals(legacy.TRANSLATIONS.normal.en as string));
  });
});
