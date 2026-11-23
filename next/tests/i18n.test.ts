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
 * The `fullscreen_*` keys are the full-screen button's tooltip, which the live game gives as
 * a hardcoded English "Fullscreen" (index.html:52).
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
  'fullscreen_on', 'fullscreen_off',
  'level_1_2', 'level_2_2', 'level_1_3', 'level_2_3', 'level_3_2', 'level_3_3', 'level_4_2', 'level_4_3', 'level_5_2', 'level_5_3', 'level_6_2', 'level_6_3', 'villain_dollQueen', 'villain_dollQueen_par', 'villain_pterodactyl', 'villain_pterodactyl_par', 'villain_vanaToomas', 'villain_vanaToomas_par', 'villain_pizzaChef', 'villain_pizzaChef_par', 'villain_yeti', 'villain_yeti_par', 'villain_tRex', 'villain_tRex_par', 'world_1', 'world_2', 'world_3', 'world_4', 'world_5', 'world_6', 'story_wants', 'story_now_me', 'story_sent_me', 'story_took', 'story_follow', 'story_save', 'story_world', 'story_hooray', 'story_trex_tiny', 'prompt_start', 'prompt_choose', 'prompt_next', 'prompt_retry', 'prompt_play_again', 'prompt_learn_menu', 'prompt_learn_result', 'controls_touch', 'follow_them', 'next_level',
  'skin_ninja', 'skin_cinderella',
  'boss_intro_dollQueen', 'boss_intro_pterodactyl', 'boss_intro_vanaToomas', 'boss_intro_pizzaChef', 'boss_intro_yeti', 'boss_intro_tRex', 'boss_shrug_dollQueen', 'boss_shrug_pterodactyl', 'boss_shrug_vanaToomas', 'boss_shrug_pizzaChef', 'boss_shrug_yeti', 'boss_shrug_tRex', 'boss_hit_1', 'boss_hit_2', 'boss_hit_3', 'boss_last', 'boss_laugh', 'hint_target', 'hint_fart', 'hint_bighead', 'hint_chicken', 'hint_head', 'hint_jump_over', 'boss_beaten_dollQueen', 'boss_beaten_pterodactyl', 'boss_beaten_vanaToomas', 'boss_beaten_pizzaChef', 'boss_beaten_yeti', 'boss_beaten_tRex',
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
