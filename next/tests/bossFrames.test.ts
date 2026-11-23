import { describe, expect, it } from 'vitest';
import * as sprites from '../src/data/sprites';
import type { SpriteData } from '../src/data/sprites';
import { BOSS_EYES, eyesShut, silhouette, SNOWMAN_P, SNOWMAN_S, undies } from '../src/gfx/bossFrames';

const sprite = (name: string) => (sprites as unknown as Record<string, SpriteData>)[name];
const cells = (s: SpriteData) => s.flatMap((row, y) => row.map((v, x) => ({ y, x, v })));

describe('the bosses\' pictures made by rule', () => {
  it('finds every boss\'s eyes where the table says', () => {
    for (const [name, eyes] of Object.entries(BOSS_EYES)) {
      const s = sprite(name);
      expect({ name, there: Boolean(s) }).toEqual({ name, there: true });
      const found = cells(s).filter((c) => c.y >= eyes.rows[0] && c.y <= eyes.rows[1] && c.v === eyes.indices[0]);
      expect({ name, eyes: found.length > 0 }).toEqual({ name, eyes: true });
    }
  });

  it('shuts the eyes into a dash and changes nothing outside the eyes\' rows', () => {
    for (const [name, eyes] of Object.entries(BOSS_EYES)) {
      const s = sprite(name);
      const shut = eyesShut(s, eyes);
      const [pupil, ...whites] = eyes.indices;
      for (const c of cells(s)) {
        const now = shut[c.y][c.x];
        const inRows = c.y >= eyes.rows[0] && c.y <= eyes.rows[1];
        if (!inRows) {
          expect({ name, at: [c.y, c.x], v: now }).toEqual({ name, at: [c.y, c.x], v: c.v });
          continue;
        }
        // No white of the eye, glint or iris is left; every pupil is part of a dash two wide.
        expect({ name, at: [c.y, c.x], white: whites.includes(now) }).toEqual({ name, at: [c.y, c.x], white: false });
        if (now === pupil) {
          const dash = shut[c.y][c.x - 1] === pupil || shut[c.y][c.x + 1] === pupil;
          expect({ name, at: [c.y, c.x], dash }).toEqual({ name, at: [c.y, c.x], dash: true });
        }
      }
      expect({ name, pupils: shut.flat().filter((v) => v === pupil).length > 0 }).toEqual({ name, pupils: true });
    }
  });

  it('makes a one-colour copy of the same shape', () => {
    const s = sprite('QUEEN_S');
    const flat = silhouette(s);
    expect(cells(flat).map((c) => c.v !== 0)).toEqual(cells(s).map((c) => c.v !== 0));
    expect(new Set(flat.flat().filter((v) => v !== 0))).toEqual(new Set([1]));
  });

  it('strips Toomas to spotted underpants', () => {
    const body = sprite('TOOMAS_BODY_S');
    const bare = undies(body);
    expect(bare.slice(8, 14).flat().filter((v) => v === 3 || v === 14)).toEqual([]);
    const pants = bare.slice(14, 17).flat().filter((v) => v !== 0 && v !== 5);
    expect(new Set(pants)).toEqual(new Set([14, 10]));
    expect(bare.length).toBe(body.length);
  });

  it('draws the snowman in its own colours', () => {
    for (const v of SNOWMAN_S.flat()) if (v !== 0) expect(v in SNOWMAN_P).toBe(true);
    for (const row of SNOWMAN_S) expect(row.length).toBe(SNOWMAN_S[0].length);
  });
});
