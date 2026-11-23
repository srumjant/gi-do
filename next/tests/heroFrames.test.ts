import { describe, expect, it } from 'vitest';
import { DODO_SKINS, GIGI_SKINS } from '../src/data/sprites';
import { ARM_ROW, EYE, HERO_FRAMES, heroSprite, SKIN } from '../src/game/heroFrames';

const ALL = [...GIGI_SKINS, ...DODO_SKINS];
const lastFilled = (row: number[]) => row.reduce((at, v, x) => (v !== 0 ? x : at), -1);

describe('the hero frames made by rule', () => {
  it('rests on what every skin is drawn with: eyes in 3, skin in 4, arms in row 9 with room in front', () => {
    for (const skin of ALL) {
      const eyes = skin.stand.flat().filter((v) => v === EYE).length;
      expect({ skin: skin.name, eyes }).toEqual({ skin: skin.name, eyes: 2 });
      expect({ skin: skin.name, skinColour: SKIN in skin.palette }).toEqual({ skin: skin.name, skinColour: true });
      const arms = skin.stand[ARM_ROW];
      const last = lastFilled(arms);
      // The arm row is the body's widest above the waist, and there is a free pixel in front.
      expect({ skin: skin.name, room: last >= 0 && last + 1 < arms.length && arms[last + 1] === 0 })
        .toEqual({ skin: skin.name, room: true });
    }
  });

  it('blinks: the standing frame with the eyes shut and nothing else changed', () => {
    for (const skin of ALL) {
      const blink = heroSprite(skin, 'blink');
      expect(blink.flat()).not.toContain(EYE);
      const changed = blink.flat().filter((v, i) => v !== skin.stand.flat()[i]).length;
      expect({ skin: skin.name, changed }).toEqual({ skin: skin.name, changed: 2 });
    }
  });

  it('winces: the jumping frame, arms up, eyes shut', () => {
    for (const skin of ALL) {
      const ouch = heroSprite(skin, 'ouch');
      expect(ouch.flat()).not.toContain(EYE);
      expect(ouch.map((row) => row.map((v) => (v === SKIN ? 0 : v))))
        .toEqual(skin.jump.map((row) => row.map((v) => (v === SKIN || v === EYE ? 0 : v))));
    }
  });

  it('shoots: the standing frame with the front arm one pixel longer', () => {
    for (const skin of ALL) {
      const shoot = heroSprite(skin, 'shoot');
      const arms = skin.stand[ARM_ROW];
      const last = lastFilled(arms);
      expect(shoot[ARM_ROW][last + 1]).toBe(arms[last]);
      const changed = shoot.flat().filter((v, i) => v !== skin.stand.flat()[i]).length;
      expect(changed).toBe(1);
    }
  });

  it('keeps every frame on the skin\'s grid and in its palette, and leaves the drawings alone', () => {
    for (const skin of ALL) {
      const before = JSON.stringify(skin);
      for (const frame of HERO_FRAMES) {
        const sprite = heroSprite(skin, frame);
        expect(sprite.length).toBe(skin.stand.length);
        for (const row of sprite) expect(row.length).toBe(skin.stand[0].length);
        for (const v of sprite.flat()) if (v !== 0) expect(v in skin.palette).toBe(true);
      }
      expect(JSON.stringify(skin)).toBe(before);
    }
  });
});
