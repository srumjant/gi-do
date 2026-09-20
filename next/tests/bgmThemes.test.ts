import { describe, expect, it } from 'vitest';
import { loadLegacySection } from './helpers/legacy';
import { LEVELS } from '../src/data/levels';
import {
  BGM_THEMES, BGM_TITLE, BGM_WIN, BGM_GAMEOVER, BGM_INTRO,
} from '../src/data/bgmThemes';

const legacy = loadLegacySection({
  from: '//  BACKGROUND MUSIC',
  to: '//  CONSTANTS & HELPERS',
  prelude: 'let audioCtx = null; function ensureAudio(){}',
  expose: ['BGM_THEMES', 'BGM_TITLE', 'BGM_WIN', 'BGM_GAMEOVER', 'BGM_INTRO'],
});

describe('BGM themes match the live game', () => {
  it('has the same number of themes', () => {
    expect(BGM_THEMES.length).toBe(legacy.BGM_THEMES.length);
  });

  BGM_THEMES.forEach((_, i) => {
    it(`theme ${i} is identical`, () => {
      expect(BGM_THEMES[i]).toEqual(legacy.BGM_THEMES[i]);
    });
  });

  it('has the same named indices', () => {
    expect(BGM_TITLE).toBe(legacy.BGM_TITLE);
    expect(BGM_WIN).toBe(legacy.BGM_WIN);
    expect(BGM_GAMEOVER).toBe(legacy.BGM_GAMEOVER);
    expect(BGM_INTRO).toBe(legacy.BGM_INTRO);
  });

  it('gives every level a theme', () => {
    LEVELS.forEach((_, i) => {
      expect(BGM_THEMES[i], `level ${i} has no theme`).toBeDefined();
    });
  });

  it('gives every theme a usable tempo and at least one note', () => {
    for (const theme of BGM_THEMES) {
      expect(theme.bpm).toBeGreaterThan(0);
      expect(theme.notes.length).toBeGreaterThan(0);
    }
  });
});
