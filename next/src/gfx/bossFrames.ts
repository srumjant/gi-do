import type { Palette, SpriteData } from '../data/sprites';

/**
 * The bosses' extra pictures, made by rule from their own drawings (docs/superpowers/specs/
 * 2026-11-23-boss-show-design.md): eyes shut, the one-colour copies the show lays over a boss
 * for its flash and its anger, Vana Toomas in his underpants, and the Yeti's snowman. Pure, so
 * tested without Phaser; gfx/textures.ts bakes them.
 */

/** Where a sprite's eyes are: the palette indices they are drawn in, within these rows. */
export interface EyeSpec {
  indices: readonly number[];
  rows: readonly [number, number];
}

/**
 * Every boss body sprite that has eyes, by its name in data/sprites.ts. The rows keep the rule
 * off the same colours lower down: Toomas's shoes, the Queen's dress, the T-Rex's nostril.
 */
export const BOSS_EYES: Readonly<Record<string, EyeSpec>> = {
  // A dark eye and its white glint.
  QUEEN_S: { indices: [6, 7], rows: [3, 5] },
  PTERO_UP_S: { indices: [4], rows: [4, 6] },
  PTERO_DOWN_S: { indices: [4], rows: [4, 6] },
  TOOMAS_BODY_S: { indices: [6], rows: [3, 5] },
  CHEF_S: { indices: [4], rows: [6, 8] },
  CHEF_BARE_S: { indices: [4], rows: [6, 8] },
  CHEF_CHICKEN_S: { indices: [6], rows: [3, 5] },
  // The pupil, and the white of the eye above it.
  YETI_S: { indices: [5, 4], rows: [4, 5] },
  YETI_ROAR_S: { indices: [5, 4], rows: [4, 5] },
  // A yellow eye and its pupil.
  BOSS_IDLE: { indices: [6, 5], rows: [3, 3] },
  BOSS_WALK: { indices: [6, 5], rows: [3, 3] },
  BOSS_CHARGE: { indices: [6, 5], rows: [3, 3] },
  BOSS_ROAR: { indices: [6, 5], rows: [3, 3] },
  // Härra Kaka: a pupil in each big white eye.
  POO_S: { indices: [5, 4], rows: [6, 9] },
};

/**
 * The eyes shut: a closed eye in pixel art is a short dark dash. The whites, glints and irises
 * are painted with the colour around them (the most common neighbour that is no eye), and each
 * pupil (the first index) becomes a dash two wide, with the eye pixel beside it if it has one, or
 * else the pixel toward the middle of the sprite.
 */
export function eyesShut(sprite: SpriteData, eyes: EyeSpec): SpriteData {
  const pupil = eyes.indices[0];
  const inRows = (y: number): boolean => y >= eyes.rows[0] && y <= eyes.rows[1];
  const isEye = (y: number, x: number): boolean => inRows(y) && eyes.indices.includes(sprite[y]?.[x] ?? 0);
  // Painted from the edge of the eye inward, a pass at a time, so a big eye (Härra Kaka's) fills
  // too: each eye pixel takes the most common colour around it that is no longer eye.
  const out = sprite.map((row) => row.slice());
  const open = new Set<string>();
  sprite.forEach((row, y) => row.forEach((_, x) => { if (isEye(y, x)) open.add(`${y},${x}`); }));
  while (open.size > 0) {
    const painted: Array<[number, number, number]> = [];
    for (const cell of open) {
      const [y, x] = cell.split(',').map(Number);
      const counts = new Map<number, number>();
      for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        if (open.has(`${y + dy},${x + dx}`)) continue;
        const n = out[y + dy]?.[x + dx] ?? 0;
        if (n === 0) continue;
        counts.set(n, (counts.get(n) ?? 0) + 1);
      }
      let best = 0;
      let most = 0;
      for (const [n, c] of counts) if (c > most) [best, most] = [n, c];
      if (best !== 0) painted.push([y, x, best]);
    }
    if (painted.length === 0) break;
    for (const [y, x, v] of painted) {
      out[y][x] = v;
      open.delete(`${y},${x}`);
    }
  }
  const middle = (sprite[0].length - 1) / 2;
  sprite.forEach((row, y) => row.forEach((v, x) => {
    if (!inRows(y) || v !== pupil) return;
    out[y][x] = pupil;
    const beside = [x - 1, x + 1].find((nx) => isEye(y, nx) && row[nx] !== pupil);
    const nx = beside ?? (x < middle ? x + 1 : x - 1);
    if ((row[nx] ?? 0) !== 0) out[y][nx] = pupil;
  }));
  return out;
}

/** The sprite's shape in one colour, index 1: for the white flash and the red of anger. */
export function silhouette(sprite: SpriteData): SpriteData {
  return sprite.map((row) => row.map((v) => (v === 0 ? 0 : 1)));
}

export const WHITE_P: Palette = { 1: '#ffffff' };
export const RED_P: Palette = { 1: '#ff2a2a' };

/** Toomas's palette: 1 skin, 3 and 14 his spotted shirt, 4 his shorts, 7 his belt, 10 red, 14 white. */
const TOOMAS_SKIN = 1;
const TOOMAS_SHIRT = [3, 14];
const TOOMAS_SHORTS = 4;
const TOOMAS_BELT = 7;
const TOOMAS_WHITE = 14;
const TOOMAS_RED = 10;
/** His shirt's rows, and his belt's and shorts' (data/sprites.ts's TOOMAS_BODY_S). */
const SHIRT_ROWS: readonly [number, number] = [8, 13];
const SHORTS_ROWS: readonly [number, number] = [14, 16];

/**
 * Toomas beaten: no armour, no shirt, and his shorts white underpants with red spots. The
 * defeat the owner's child will remember.
 */
export function undies(body: SpriteData): SpriteData {
  return body.map((row, y) => row.map((v, x) => {
    if (y >= SHIRT_ROWS[0] && y <= SHIRT_ROWS[1] && TOOMAS_SHIRT.includes(v)) return TOOMAS_SKIN;
    if (y >= SHORTS_ROWS[0] && y <= SHORTS_ROWS[1] && (v === TOOMAS_SHORTS || v === TOOMAS_BELT)) {
      return (x + y) % 3 === 0 ? TOOMAS_RED : TOOMAS_WHITE;
    }
    return v;
  }));
}

/** The little snowman the Yeti turns into: top hat, coal eyes, a carrot, a red scarf. */
export const SNOWMAN_S: SpriteData = [
  [0, 0, 0, 0, 5, 5, 5, 5, 0, 0, 0, 0],
  [0, 0, 0, 0, 5, 5, 5, 5, 0, 0, 0, 0],
  [0, 0, 0, 5, 5, 5, 5, 5, 5, 0, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
  [0, 0, 1, 1, 2, 1, 1, 2, 1, 1, 0, 0],
  [0, 0, 1, 1, 1, 1, 3, 3, 3, 1, 0, 0],
  [0, 0, 6, 1, 1, 1, 1, 1, 1, 6, 0, 0],
  [0, 0, 0, 4, 4, 4, 4, 4, 4, 0, 0, 0],
  [0, 0, 1, 1, 4, 1, 1, 1, 1, 1, 0, 0],
  [0, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 0],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 0],
  [0, 6, 1, 1, 1, 1, 1, 1, 1, 1, 6, 0],
  [0, 0, 6, 1, 1, 1, 1, 1, 1, 6, 0, 0],
  [0, 0, 0, 6, 6, 6, 6, 6, 6, 0, 0, 0],
];
export const SNOWMAN_P: Palette = {
  1: '#ffffff', 2: '#222233', 3: '#ff8c1a', 4: '#d03030', 5: '#2a2a3a', 6: '#c8dcf0',
};
