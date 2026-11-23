import type { Skin, SpriteData } from '../data/sprites';

/**
 * The hero's frames (docs/superpowers/specs/2026-11-23-ninja-and-cinderella-skins-design.md,
 * Animations): the three every skin is drawn in, and three more made from them by rule, so
 * every skin, and any added later, blinks, winces and shoots without a new drawing.
 */
export const HERO_FRAMES = ['stand', 'run', 'jump', 'blink', 'ouch', 'shoot'] as const;
export type HeroFrame = typeof HERO_FRAMES[number];

/** Every hero drawing colours its eyes with palette index 3 and its skin with 4. */
export const EYE = 3;
export const SKIN = 4;
/** And row 9 is the arms, in every skin of both heroes (tests/heroFrames.test.ts holds them to it). */
export const ARM_ROW = 9;

function closeEyes(sprite: SpriteData): SpriteData {
  return sprite.map((row) => row.map((v) => (v === EYE ? SKIN : v)));
}

/** The front arm one pixel longer. Sprites face right, so the front is the right. */
function armOut(sprite: SpriteData): SpriteData {
  return sprite.map((row, y) => {
    const out = row.slice();
    if (y !== ARM_ROW) return out;
    const last = row.reduce((at, v, x) => (v !== 0 ? x : at), -1);
    if (last >= 0 && last + 1 < row.length) out[last + 1] = row[last];
    return out;
  });
}

/** One frame of a skin, drawn or made. */
export function heroSprite(skin: Skin, frame: HeroFrame): SpriteData {
  switch (frame) {
    case 'stand':
    case 'run':
    case 'jump':
      return skin[frame];
    case 'blink':
      return closeEyes(skin.stand);
    case 'ouch':
      // Arms flung up and eyes screwed shut.
      return closeEyes(skin.jump);
    case 'shoot':
      return armOut(skin.stand);
  }
}
