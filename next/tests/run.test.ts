import { beforeEach, describe, expect, it } from 'vitest';
import {
  getEnemySpriteInfo, getPlayerSprites, getRescueSprites,
  getSelectedChar, setSelectedChar, setGigiSkin, setDodoSkin,
} from '../src/game/run';
import { DODO_SKINS, GIGI_SKINS } from '../src/data/sprites';
import { LEVELS } from '../src/data/levels';

beforeEach(() => {
  setSelectedChar('gigi');
  setGigiSkin(0);
  setDodoSkin(0);
});

describe('character and skin selection', () => {
  it('defaults to Gigi, with Dodo as the rescue NPC', () => {
    expect(getSelectedChar()).toBe('gigi');
    expect(getPlayerSprites()).toEqual({
      stand: GIGI_SKINS[0].stand,
      run: GIGI_SKINS[0].run,
      jump: GIGI_SKINS[0].jump,
      palette: GIGI_SKINS[0].palette,
    });
    expect(getRescueSprites().name).toBe('Dodo');
  });

  it('selecting Dodo swaps both the player and rescue sprite sets', () => {
    setSelectedChar('dodo');
    expect(getPlayerSprites()).toEqual({
      stand: DODO_SKINS[0].stand,
      run: DODO_SKINS[0].run,
      jump: DODO_SKINS[0].jump,
      palette: DODO_SKINS[0].palette,
    });
    expect(getRescueSprites().name).toBe('Gigi');
  });

  it('an out-of-range skin index falls back to skin 0, not a crash', () => {
    setGigiSkin(99);
    expect(getPlayerSprites().palette).toBe(GIGI_SKINS[0].palette);

    setSelectedChar('dodo');
    setDodoSkin(-1);
    expect(getPlayerSprites().palette).toBe(DODO_SKINS[0].palette);
  });
});

describe('getEnemySpriteInfo', () => {
  it('resolves a real sprite and palette for every type any level actually spawns', () => {
    const types = new Set(LEVELS.flatMap((level) => level.enemyDefs.map((def) => def.type)));
    expect(types.size).toBeGreaterThan(0);
    for (const type of types) {
      const info = getEnemySpriteInfo(type);
      expect(Array.isArray(info.sprite), `${type}: sprite`).toBe(true);
      expect(Object.keys(info.palette).length, `${type}: palette`).toBeGreaterThan(0);
    }
  });
});
