import { beforeEach, describe, expect, it } from 'vitest';
import { loadLegacySection } from './helpers/legacy';
import {
  TRANSLATIONS, LANG_KEYS, T, TDiff, getLang, setLang, setGlyphResolver,
} from '../src/config/i18n';

const legacy = loadLegacySection({
  from: '//  LANGUAGE / TRANSLATIONS',
  to: '//  SOUND ENGINE',
  prelude: 'function padGlyph(action){ return "[" + action + "]"; }',
  expose: ['TRANSLATIONS', 'LANG_KEYS'],
});

describe('translations match the live game', () => {
  beforeEach(() => {
    setLang('et');
    setGlyphResolver((action) => action);
  });

  it('has the same languages', () => {
    expect(LANG_KEYS).toEqual(legacy.LANG_KEYS);
  });

  it('has the same keys', () => {
    expect(Object.keys(TRANSLATIONS).sort())
      .toEqual(Object.keys(legacy.TRANSLATIONS).sort());
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
    expect(T('score')).toBe(legacy.TRANSLATIONS.score.et);
  });

  it('follows the selected language', () => {
    setLang('en');
    expect(getLang()).toBe('en');
    expect(T('score')).toBe(legacy.TRANSLATIONS.score.en);
  });

  it('falls back to the key when it is unknown', () => {
    expect(T('no_such_key')).toBe('no_such_key');
  });

  // Commit 8354ea0: glyph substitution must not run on a phrase array, because
  // indexOf('{') on an array compares whole elements and silently misbehaves.
  it('returns phrase arrays untouched', () => {
    const phrases = T('dino_phrases');
    expect(Array.isArray(phrases)).toBe(true);
    expect(phrases).toEqual(legacy.TRANSLATIONS.dino_phrases.et);
  });

  // The live game substitutes by ACTION, not by letter: {A} resolves through
  // padGlyph('confirm'), because the glyph depends on the connected pad.
  it('substitutes gamepad placeholders by their action name', () => {
    setGlyphResolver((action) => `[${action}]`);
    const raw = legacy.TRANSLATIONS.press_start.et as string;
    expect(raw).toContain('{A}');
    expect(T('press_start')).toBe(raw.replace('{A}', '[confirm]'));
  });

  it('leaves strings without a placeholder alone', () => {
    setGlyphResolver(() => 'SHOULD NOT APPEAR');
    expect(T('score')).toBe(legacy.TRANSLATIONS.score.et);
  });
});

describe('TDiff()', () => {
  // lang is module state, so reset it rather than inheriting whatever the last
  // describe block left behind.
  beforeEach(() => setLang('et'));

  it('returns the live game\'s label for every difficulty', () => {
    for (const key of ['super_easy', 'easy', 'normal', 'hard']) {
      expect(TDiff(key)).toBe(legacy.TRANSLATIONS[key].et);
    }
  });

  it('follows the selected language', () => {
    setLang('en');
    expect(TDiff('normal')).toBe(legacy.TRANSLATIONS.normal.en);
  });
});
