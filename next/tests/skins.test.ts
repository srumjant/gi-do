import { describe, expect, it } from 'vitest';
import { TRANSLATIONS } from '../src/config/i18n';
import { DODO_SKINS, GIGI_SKINS, type Skin } from '../src/data/sprites';

const POSES = ['stand', 'run', 'jump'] as const;
const CHARACTERS: [string, Skin[]][] = [['gigi', GIGI_SKINS], ['dodo', DODO_SKINS]];

describe('the skins', () => {
  for (const [who, skins] of CHARACTERS) {
    it(`${who}: every skin draws every pose on the classic skin's grid`, () => {
      const h = skins[0].stand.length;
      const w = skins[0].stand[0].length;
      for (const skin of skins) {
        for (const pose of POSES) {
          const grid = skin[pose];
          expect({ skin: skin.name, pose, h: grid.length }).toEqual({ skin: skin.name, pose, h });
          for (const row of grid) expect({ skin: skin.name, pose, w: row.length }).toEqual({ skin: skin.name, pose, w });
        }
      }
    });

    it(`${who}: every colour a skin draws with is in its palette`, () => {
      for (const skin of skins) {
        for (const pose of POSES) {
          for (const v of skin[pose].flat()) {
            if (v !== 0) expect({ skin: skin.name, pose, v, there: v in skin.palette }).toEqual({ skin: skin.name, pose, v, there: true });
          }
        }
      }
    });
  }

  it('has a Ninja for Gigi and a Cinderella for Dodo', () => {
    expect(GIGI_SKINS.map((s) => s.name)).toContain('Ninja');
    expect(DODO_SKINS.map((s) => s.name)).toContain('Cinderella');
    expect(TRANSLATIONS.skin_cinderella).toMatchObject({ et: 'TUHKATRIINU', en: 'CINDERELLA' });
  });

  it('names every translated skin in capitals, in both languages', () => {
    for (const skin of [...GIGI_SKINS, ...DODO_SKINS]) {
      if (!skin.nameKey) continue;
      const entry = TRANSLATIONS[skin.nameKey];
      expect({ key: skin.nameKey, there: Boolean(entry) }).toEqual({ key: skin.nameKey, there: true });
      for (const text of [entry.et, entry.en] as string[]) expect(text).toBe(text.toUpperCase());
    }
  });
});
