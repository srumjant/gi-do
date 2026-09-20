import type { Character } from './player';
import {
  BAT_P, BAT_S,
  BOUNCER_P, BOUNCER_S,
  CANNON_P, CANNON_S,
  CAR_P, CAR_S,
  CHICKEN_P, CHICKEN_S,
  DINO_P, DINO_S,
  DODO_SKINS,
  DOLL_P, DOLL_S,
  GHOST_P, GHOST_S,
  GIGI_SKINS,
  ICEBAT_P, ICEBAT_S,
  PENGUIN_P, PENGUIN_S,
  type Palette,
  type SpriteData,
} from '../data/sprites';

/**
 * Run state: which character is selected and which skin of them, plus the sprite
 * lookups that read it. Ported from index.html:848-867 (getEnemySpriteInfo,
 * getPlayerSprites, getRescueSprites) and the selectedChar/gigiSkin/dodoSkin globals
 * declared at index.html:988.
 *
 * data/sprites.ts's header explains why these three were left out of that module:
 * they are behaviour, not data, and two of them read mutable state that has no home
 * in a pure-data file. That state lives here instead, alongside them, following the
 * shape config/difficulty.ts uses for the live game's `selectedDifficulty` global — a
 * module-level variable with a get/set pair, resolved live on every call rather than
 * cached, so changing it mid-run is visible immediately.
 *
 * Phaser-free by design: this is game state (what the kids picked), not rendering.
 * tests/world.test.ts enforces that nothing under src/game imports Phaser.
 */

let selectedChar: Character = 'gigi';
let gigiSkin = 0;
let dodoSkin = 0;

export function getSelectedChar(): Character {
  return selectedChar;
}

export function setSelectedChar(char: Character): void {
  selectedChar = char;
}

export function getGigiSkin(): number {
  return gigiSkin;
}

export function setGigiSkin(skin: number): void {
  gigiSkin = skin;
}

export function getDodoSkin(): number {
  return dodoSkin;
}

export function setDodoSkin(skin: number): void {
  dodoSkin = skin;
}

export interface EnemySpriteInfo {
  sprite: SpriteData;
  palette: Palette;
}

/**
 * Port of index.html:848-857.
 *
 * `dino` has no case of its own — it reaches DINO_S/DINO_P through the `default`
 * branch below, exactly as the live game does. That is deliberate: do not add a
 * `case 'dino':` to make it explicit, it would just be the same mapping written a
 * second time.
 *
 * The same default branch also catches every type this switch does not name — still
 * DINO_S/DINO_P. That is a *different* decision from `spawnEnemy` in enemy.ts, which
 * returns `undefined` for a type its simulation does not implement (ghost, bat,
 * cannon, bouncer) so its caller can skip spawning it rather than create a half-
 * simulated enemy. The two must not be unified into one mapping: this function
 * answers "what does that enemy look like on screen", and always has an answer;
 * `spawnEnemy` answers "should this exist in the simulation at all", and sometimes
 * the answer is no. Defaulting here is not a substitute for the `undefined` there.
 */
export function getEnemySpriteInfo(type: string): EnemySpriteInfo {
  switch (type) {
    case 'car': return { sprite: CAR_S, palette: CAR_P };
    case 'doll': return { sprite: DOLL_S, palette: DOLL_P };
    case 'ghost': return { sprite: GHOST_S, palette: GHOST_P };
    case 'bat': return { sprite: BAT_S, palette: BAT_P };
    case 'cannon': return { sprite: CANNON_S, palette: CANNON_P };
    case 'bouncer': return { sprite: BOUNCER_S, palette: BOUNCER_P };
    case 'penguin': return { sprite: PENGUIN_S, palette: PENGUIN_P };
    case 'icebat': return { sprite: ICEBAT_S, palette: ICEBAT_P };
    case 'chicken': return { sprite: CHICKEN_S, palette: CHICKEN_P };
    default: return { sprite: DINO_S, palette: DINO_P };
  }
}

export interface PlayerSprites {
  stand: SpriteData;
  run: SpriteData;
  jump: SpriteData;
  palette: Palette;
}

/**
 * Port of index.html:858-862.
 *
 * `|| DODO_SKINS[0]` / `|| GIGI_SKINS[0]` are real fallbacks, not defensive
 * leftovers: an out-of-range skin index — a save from before a skin existed, or
 * simply never having picked one — falls back to skin 0 rather than indexing past
 * the end of the array and reading `.stand` off `undefined`.
 */
export function getPlayerSprites(): PlayerSprites {
  if (selectedChar === 'dodo') {
    const sk = DODO_SKINS[dodoSkin] || DODO_SKINS[0];
    return { stand: sk.stand, run: sk.run, jump: sk.jump, palette: sk.palette };
  }
  const sk = GIGI_SKINS[gigiSkin] || GIGI_SKINS[0];
  return { stand: sk.stand, run: sk.run, jump: sk.jump, palette: sk.palette };
}

export interface RescueSprites {
  sprite: SpriteData;
  jump: SpriteData;
  palette: Palette;
  name: string;
}

/**
 * Port of index.html:863-867. The kidnapped sibling is always the OTHER character
 * from the one selected — playing as Gigi, the cage holds Dodo, and vice versa —
 * with the same out-of-range-skin fallback as getPlayerSprites above.
 */
export function getRescueSprites(): RescueSprites {
  if (selectedChar === 'dodo') {
    const sk = GIGI_SKINS[gigiSkin] || GIGI_SKINS[0];
    return { sprite: sk.stand, jump: sk.jump, palette: sk.palette, name: 'Gigi' };
  }
  const sk = DODO_SKINS[dodoSkin] || DODO_SKINS[0];
  return { sprite: sk.stand, jump: sk.jump, palette: sk.palette, name: 'Dodo' };
}
