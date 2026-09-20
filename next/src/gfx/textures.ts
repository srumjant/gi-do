import Phaser from 'phaser';
import { ENEMY_SCALE } from '../config/constants';
import { CLOUD_P, CLOUD_S, DODO_SKINS, GIGI_SKINS, type Skin } from '../data/sprites';
import type { Character } from '../game/player';
import { getEnemySpriteInfo } from '../game/run';
import { rasterise } from './rasterise';

/**
 * Registers every sprite this plan draws as a named Phaser texture, once, at boot.
 * Unlike the live game's spriteCache (index.html:609-654), which memoises a canvas
 * per (sprite, palette, scale, flip) key because its one call site re-rasterises on
 * every frame a sprite might be drawn, nothing here runs per-frame or even per-level:
 * `rasterise` runs exactly once per name, right here, and Phaser's texture manager
 * holds the result for the life of the game. There is no repeated work to memoise,
 * so there is no cache to build.
 *
 * Registers the player (both characters, every skin, all three poses), enemies and
 * clouds — see the per-category functions below for scale and naming. The rescue
 * NPC draws these same player textures, just for the other character (getRescueSprites
 * in game/run.ts always returns the opposite skin set), so it gets no registration of
 * its own. HUD items (star, heart, bow, cape/super) are not registered: nothing
 * draws them yet, and a texture nobody binds is just dead memory.
 *
 * Touches Phaser (a live TextureManager) and a real canvas (via rasterise), so unlike
 * rasterise.ts's pure half, this is not unit tested. It gets verified in the browser
 * once something calls it and draws from the result.
 */
export function registerTextures(scene: Phaser.Scene): void {
  registerPlayerTextures(scene);
  registerEnemyTextures(scene);
  registerCloudTextures(scene);
}

/** Player and rescue-NPC sprites draw at this scale (index.html:1838). */
const PLAYER_SCALE = 2;

const POSES = ['stand', 'run', 'jump'] as const;
type Pose = typeof POSES[number];

const SKINS_BY_CHARACTER: Record<Character, readonly Skin[]> = {
  gigi: GIGI_SKINS,
  dodo: DODO_SKINS,
};

/** `player-<character>-<skinIndex>-<pose>`, e.g. `player-gigi-0-stand`. */
export function playerTextureKey(character: Character, skinIndex: number, pose: Pose): string {
  return `player-${character}-${skinIndex}-${pose}`;
}

function registerPlayerTextures(scene: Phaser.Scene): void {
  (Object.keys(SKINS_BY_CHARACTER) as Character[]).forEach((character) => {
    SKINS_BY_CHARACTER[character].forEach((skin, skinIndex) => {
      for (const pose of POSES) {
        scene.textures.addCanvas(
          playerTextureKey(character, skinIndex, pose),
          rasterise(skin[pose], skin.palette, PLAYER_SCALE),
        );
      }
    });
  });
}

/**
 * Every enemy type getEnemySpriteInfo (game/run.ts) can resolve: the nine named
 * cases plus 'dino', which reaches its sprite through that function's default
 * branch rather than a case of its own. Streamed types this slice's simulation does
 * not spawn yet — ghost, bat, cannon, bouncer (see enemy.ts) — still get a texture
 * here: the art already exists in data/sprites.ts, and there's no reason the GPU
 * side should wait for the simulation to catch up.
 */
const ENEMY_TYPES = [
  'car', 'doll', 'dino', 'ghost', 'bat', 'cannon', 'bouncer', 'penguin', 'icebat', 'chicken',
];

/** `enemy-<type>`, e.g. `enemy-car`. */
export function enemyTextureKey(type: string): string {
  return `enemy-${type}`;
}

function registerEnemyTextures(scene: Phaser.Scene): void {
  for (const type of ENEMY_TYPES) {
    const { sprite, palette } = getEnemySpriteInfo(type);
    scene.textures.addCanvas(enemyTextureKey(type), rasterise(sprite, palette, ENEMY_SCALE));
  }
}

/**
 * Clouds draw at one of two scales, picked per-cloud by `cx % 3`
 * (index.html:1676: `cx%3?6:5`). Both are registered here; which one a given cloud
 * uses is a rendering decision for later, not a reason to skip either texture now.
 */
const CLOUD_SCALES = [5, 6];

/** `cloud-<scale>`, e.g. `cloud-5`. */
export function cloudTextureKey(scale: number): string {
  return `cloud-${scale}`;
}

function registerCloudTextures(scene: Phaser.Scene): void {
  for (const scale of CLOUD_SCALES) {
    scene.textures.addCanvas(cloudTextureKey(scale), rasterise(CLOUD_S, CLOUD_P, scale));
  }
}
