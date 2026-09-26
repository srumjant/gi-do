import Phaser from 'phaser';
import { ENEMY_SCALE } from '../config/constants';
import {
  ARROW_P, ARROW_S,
  BOSS_CHARGE, BOSS_IDLE, BOSS_P, BOSS_ROAR, BOSS_WALK,
  BOW_P, BOW_S,
  CAPE_P, CAPE_S,
  CAT_P, CAT_S,
  CAT_SCRATCH_P, CAT_SCRATCH_S,
  CHICKEN_P, CHICKEN_S,
  CLOUD_P, CLOUD_S,
  FIREBALL_P, FIREBALL_S,
  HEART_P, HEART_S,
  KIDNAPPERS,
  type Palette,
  type SpriteData,
  STAR_P, STAR_S,
  SUPER_P, SUPER_S,
} from '../data/sprites';
import type { Character } from '../game/player';
import { CHARACTERS, getEnemySpriteInfo, skinsOf } from '../game/run';
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
 * Registers the player (both characters, every skin, all three poses, plus each
 * pose's two big-head halves), enemies, clouds and the loose items the world draws —
 * see the per-category functions below for scale and naming. The rescue NPC draws
 * these same player textures, just for the other character (getRescueSprites in
 * game/run.ts always returns the opposite skin set), so it gets no registration of
 * its own. What the HUD draws is NOT in here — see `registerHudTextures` at the
 * bottom of this file, which HudScene calls for itself.
 *
 * Touches Phaser (a live TextureManager) and a real canvas (via rasterise), so unlike
 * rasterise.ts's pure half, this is not unit tested. It gets verified in the browser
 * once something calls it and draws from the result.
 */
export function registerTextures(scene: Phaser.Scene): void {
  registerPlayerTextures(scene);
  registerEnemyTextures(scene);
  registerBossTextures(scene);
  registerCloudTextures(scene);
  registerItemTextures(scene);
}

/**
 * Rasterise a sprite into a named texture, unless that name is already taken.
 *
 * Every registration in this file goes through here, and the guard is not belt and braces:
 * `SliceScene.create()` now runs once PER LEVEL rather than once per page load, so every
 * `register*` call below is reached six times in a full run. Phaser's TextureManager is
 * per-game and holds what it is given for the life of the game, so the second call has
 * nothing to do — and `addCanvas` on a key in use does not merely no-op, it logs an error
 * and returns null, which is six screenfuls of red on a run through to the end.
 */
function addSprite(
  scene: Phaser.Scene,
  key: string,
  sprite: SpriteData,
  palette: Palette,
  scale: number,
): void {
  if (scene.textures.exists(key)) return;
  scene.textures.addCanvas(key, rasterise(sprite, palette, scale));
}

/** Player and rescue-NPC sprites draw at this scale (index.html:1848). */
export const PLAYER_SCALE = 2;

/**
 * The scale the TOP HALF of the player draws at while a big head is running
 * (index.html:1843's `headScale=5`). The bottom half stays at PLAYER_SCALE, which is
 * the whole trick: it is not one sprite scaled up, it is two sprites at different
 * scales stacked back into one body. See `bigHeadRows` below.
 */
export const BIG_HEAD_SCALE = 5;

/** `player.frame`: 0 stand, 1 run, 2 jump (game/types.ts, index.html:1424-1429). */
export const PLAYER_POSES = ['stand', 'run', 'jump'] as const;
export type Pose = typeof PLAYER_POSES[number];

/** `player-<character>-<skinIndex>-<pose>`, e.g. `player-gigi-0-stand`. */
export function playerTextureKey(character: Character, skinIndex: number, pose: Pose): string {
  return `player-${character}-${skinIndex}-${pose}`;
}

/** The big head's top half: the same pose, first `bigHeadRows` rows, at BIG_HEAD_SCALE. */
export function playerHeadTextureKey(character: Character, skinIndex: number, pose: Pose): string {
  return `${playerTextureKey(character, skinIndex, pose)}-head`;
}

/** The big head's bottom half: the rest of the pose, still at PLAYER_SCALE. */
export function playerBodyTextureKey(character: Character, skinIndex: number, pose: Pose): string {
  return `${playerTextureKey(character, skinIndex, pose)}-body`;
}

/**
 * How many rows of a sprite the big head takes (index.html:1842's
 * `Math.floor(spr.length*0.5)`) — 7 of Gigi's 14, 6 of Dodo's 12. The scene needs
 * this number as well as the textures, to place the two halves, so the split rule
 * lives here rather than being written out twice.
 */
export function bigHeadRows(sprite: SpriteData): number {
  return Math.floor(sprite.length * 0.5);
}

/**
 * Both halves of every pose are baked HERE, at boot, and not sliced per frame.
 *
 * The live game slices the sprite fresh on every big-head frame
 * (index.html:1842's two `spr.slice(...)` calls) and gets away with it because its
 * sprite cache is keyed by the sprite's CONTENT — `spriteBits(d)` joins the grid into
 * a string (index.html:618-620) — so two arrays with the same rows in them hit the
 * same entry however many times they are re-allocated. Its WeakMap memo is only a
 * shortcut for that serialisation, and its comment says as much: "Fresh arrays miss
 * and pay exactly what they always paid". Nothing here is keyed at all: there are
 * only named textures, registered once. Slicing per frame would therefore mean
 * rasterising per frame, so the split is done once, up front, and the frame loop just
 * picks a key.
 */
function registerPlayerTextures(scene: Phaser.Scene): void {
  CHARACTERS.forEach((character) => {
    skinsOf(character).forEach((skin, skinIndex) => {
      for (const pose of PLAYER_POSES) {
        const sprite = skin[pose];
        const headRows = bigHeadRows(sprite);
        const key = playerTextureKey(character, skinIndex, pose);
        addSprite(scene, key, sprite, skin.palette, PLAYER_SCALE);
        const head = playerHeadTextureKey(character, skinIndex, pose);
        addSprite(scene, head, sprite.slice(0, headRows), skin.palette, BIG_HEAD_SCALE);
        const body = playerBodyTextureKey(character, skinIndex, pose);
        addSprite(scene, body, sprite.slice(headRows), skin.palette, PLAYER_SCALE);
      }
    });
  });
}

/**
 * Every enemy type getEnemySpriteInfo (game/run.ts) can resolve: the nine named
 * cases plus 'dino', which reaches its sprite through that function's default
 * branch rather than a case of its own. Every one of them is spawned by the simulation
 * now — ghost and cannon were the last two to land — but the list was complete before
 * that was true, on the grounds that the art already existed in data/sprites.ts and
 * there was no reason the GPU side should wait for the simulation to catch up. That
 * turned out to be the right call: neither of them needed a texture change.
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
    addSprite(scene, enemyTextureKey(type), sprite, palette, ENEMY_SCALE);
  }
}

/**
 * The boss's four poses (index.html:1774-1791). It draws at 4 — bigger than anything else
 * in the world, twice the player's scale and more than twice an enemy's — which is the
 * whole reason it reads as a boss and not as a large doll.
 *
 * All four are registered on every level, not just the last one. They cost one rasterise
 * apiece at boot and the alternative is a registration that depends on which level is
 * starting, which is exactly the kind of conditional setup that fails quietly the first
 * time something else reaches for the texture.
 */
const BOSS_POSES = {
  idle: BOSS_IDLE,
  walk: BOSS_WALK,
  charge: BOSS_CHARGE,
  roar: BOSS_ROAR,
} as const;

export type BossPose = keyof typeof BOSS_POSES;

/** The scale the boss draws at (index.html:1793's `drawSprite(bossSpr,...,4,bfl)`). */
export const BOSS_SCALE = 4;

/** `boss-<pose>`, e.g. `boss-roar`. */
export function bossTextureKey(pose: BossPose): string {
  return `boss-${pose}`;
}

function registerBossTextures(scene: Phaser.Scene): void {
  for (const pose of Object.keys(BOSS_POSES) as BossPose[]) {
    addSprite(scene, bossTextureKey(pose), BOSS_POSES[pose], BOSS_P, BOSS_SCALE);
  }
}

/**
 * Clouds draw at one of two scales, picked per-cloud by `cx % 3`
 * (index.html:1682: `cx%3?6:5`). Both are registered here; which one a given cloud
 * uses is a rendering decision for later, not a reason to skip either texture now.
 */
const CLOUD_SCALES = [5, 6];

/** `cloud-<scale>`, e.g. `cloud-5`. */
export function cloudTextureKey(scale: number): string {
  return `cloud-${scale}`;
}

function registerCloudTextures(scene: Phaser.Scene): void {
  for (const scale of CLOUD_SCALES) {
    addSprite(scene, cloudTextureKey(scale), CLOUD_S, CLOUD_P, scale);
  }
}

/** A star popped out of a question block. 1.5, not 2 (index.html:1700). */
export const STAR_TEXTURE = 'star';
/** The bow pickup (index.html:1705). */
export const BOW_TEXTURE = 'bow';
/** The super (cape) pickup (index.html:1711). */
export const SUPER_TEXTURE = 'super';
/**
 * Shared by the cat pickup (index.html:1718) and the cat companion it turns into
 * (index.html:1724) — the same sprite at the same scale, so the same texture. The
 * companion faces with setFlipX; the pickup never flips.
 */
export const CAT_TEXTURE = 'cat';
/** The claw mark the cat leaves on whatever it scratched (index.html:1729). */
export const CAT_SCRATCH_TEXTURE = 'cat-scratch';
/** An arrow in flight (index.html:1833). */
export const ARROW_TEXTURE = 'arrow';
/**
 * A chicken RAY in flight (index.html:1832) — the chicken sprite at 1.5, which is a
 * different scale from the 1.8 an enemy turned INTO a chicken renders at, so it needs
 * a texture of its own rather than borrowing `enemy-chicken`.
 */
export const CHICKEN_ARROW_TEXTURE = 'chicken-arrow';
/** The cape, drawn behind the player while `hasCape` (index.html:1839). */
export const CAPE_TEXTURE = 'cape';
/**
 * A fireball in flight (index.html:1828) — the boss's and the cannon's alike. Both
 * shooters' shots draw this one sprite at this one scale: the live draw code renders
 * FIREBALL_S for every entry in `enemyProjectiles` without ever looking at the `type`
 * tag the cannon sets on its own (see EnemyProjectile in game/types.ts).
 */
export const FIREBALL_TEXTURE = 'fireball';

/**
 * Everything the world draws that is not a player, an enemy or a cloud: the pickups,
 * the star, the cat and its claw mark, the two kinds of projectile, and the cape.
 * Each is one fixed sprite at one fixed scale — none of them animate, flip aside —
 * so one texture apiece covers every frame they will ever be drawn on.
 */
const ITEM_TEXTURES: readonly [string, SpriteData, Palette, number][] = [
  [STAR_TEXTURE, STAR_S, STAR_P, 1.5],
  [BOW_TEXTURE, BOW_S, BOW_P, 2],
  [SUPER_TEXTURE, SUPER_S, SUPER_P, 2],
  [CAT_TEXTURE, CAT_S, CAT_P, 2],
  [CAT_SCRATCH_TEXTURE, CAT_SCRATCH_S, CAT_SCRATCH_P, 2],
  [ARROW_TEXTURE, ARROW_S, ARROW_P, 2],
  [CHICKEN_ARROW_TEXTURE, CHICKEN_S, CHICKEN_P, 1.5],
  [CAPE_TEXTURE, CAPE_S, CAPE_P, 2],
  [FIREBALL_TEXTURE, FIREBALL_S, FIREBALL_P, 2],
];

function registerItemTextures(scene: Phaser.Scene): void {
  for (const [key, sprite, palette, scale] of ITEM_TEXTURES) {
    addSprite(scene, key, sprite, palette, scale);
  }
}

/**
 * A life, as a heart (index.html:1855-1856). Scale 2, and that number belongs to this
 * draw site and nowhere else: the win screen draws the very same HEART_S at 1.5
 * (index.html:2458), so a shared `heart` texture would be wrong for one of them.
 */
export const HUD_HEART_TEXTURE = 'hud-heart';
/** The cat companion's remaining-scratches icon (index.html:1860). */
export const HUD_CAT_TEXTURE = 'hud-cat';
/** The cape you are wearing (index.html:1861) — SUPER_S, the pickup's own sprite. */
export const HUD_SUPER_TEXTURE = 'hud-super';
/** The bow you are carrying (index.html:1862). */
export const HUD_BOW_TEXTURE = 'hud-bow';

/**
 * The HUD's own four sprites, at the HUD's own scales.
 *
 * Three of them — cat, super and bow — are sprites `ITEM_TEXTURES` above ALREADY
 * registers, and they are registered a second time here rather than reused, because
 * the HUD draws them at 1.5 where the world draws them at 2. Scale is per draw site,
 * not per sprite; sharing `cat` between the pickup lying on a platform and the icon
 * in the corner would silently resize one of them. Only the heart is new: nothing
 * outside the HUD draws one yet.
 */
const HUD_TEXTURES: readonly [string, SpriteData, Palette, number][] = [
  [HUD_HEART_TEXTURE, HEART_S, HEART_P, 2],
  [HUD_CAT_TEXTURE, CAT_S, CAT_P, 1.5],
  [HUD_SUPER_TEXTURE, SUPER_S, SUPER_P, 1.5],
  [HUD_BOW_TEXTURE, BOW_S, BOW_P, 1.5],
];

/**
 * Called by HudScene rather than from `registerTextures` above, so the HUD scene owns
 * everything it needs to draw and does not depend on the game scene having booted
 * first. Phaser's TextureManager is per-GAME, not per-scene, so which scene registers
 * a texture only decides the ordering, never who can see it.
 */
export function registerHudTextures(scene: Phaser.Scene): void {
  for (const [key, sprite, palette, scale] of HUD_TEXTURES) {
    addSprite(scene, key, sprite, palette, scale);
  }
}

/**
 * The small Gigi under the highlighted difficulty card (index.html:2142's `sc=2`).
 * Nominally the same number as PLAYER_SCALE, and kept separate all the same: they are
 * two draw sites that happen to agree today, and the menu has no business moving if
 * someone retunes how big the player draws in the world.
 */
export const MENU_PREVIEW_SCALE = 2;
/** The two big portraits on the character screen (index.html:2158, 2163: scale 4). */
export const MENU_PORTRAIT_SCALE = 4;

const MENU_SCALES = [MENU_PREVIEW_SCALE, MENU_PORTRAIT_SCALE];

/** `menu-<character>-<skinIndex>-<scale>`, e.g. `menu-dodo-1-4`. */
export function menuPlayerTextureKey(
  character: Character,
  skinIndex: number,
  scale: number,
): string {
  return `menu-${character}-${skinIndex}-${scale}`;
}

/**
 * Standing portraits of both characters in every skin, at the two sizes the choice
 * screens draw them. Only the `stand` pose: the menus never animate anybody.
 *
 * Registered here rather than reused from `registerPlayerTextures` for the same reason
 * the HUD's four are — scale belongs to the draw site, and the character screen draws
 * at 4 where the world draws at 2 — and because the menus must not depend on the game
 * scene having booted first. They run BEFORE it now, so they could not borrow its
 * textures even if the scales agreed.
 *
 * This was the first registration in the port that could really be reached twice — both
 * menu scenes call it, and backing out of the character screen re-runs the difficulty
 * screen's `create`. `addSprite`'s guard now covers every registration in the file, for the
 * same reason grown larger: a level scene that restarts per level re-runs all of them.
 */
export function registerMenuTextures(scene: Phaser.Scene): void {
  for (const character of CHARACTERS) {
    skinsOf(character).forEach((skin, skinIndex) => {
      for (const scale of MENU_SCALES) {
        const key = menuPlayerTextureKey(character, skinIndex, scale);
        addSprite(scene, key, skin.stand, skin.palette, scale);
      }
    });
  }
}

/** One pose of the player art, at one draw site's scale. */
export type PoseAtScale = readonly [Pose, number];

/** `pose-<character>-<skinIndex>-<pose>-<scale>`, e.g. `pose-gigi-0-stand-3`. */
export function scaledPlayerTextureKey(
  character: Character,
  skinIndex: number,
  pose: Pose,
  scale: number,
): string {
  return `pose-${character}-${skinIndex}-${pose}-${scale}`;
}

/**
 * Player art at whatever scale the caller draws it, for the screens between the levels.
 *
 * The three families above each bake one fixed set of scales, because their callers each
 * have one: the world draws at 2, the HUD at 1.5, the menus at 2 and 4. The cutscenes do
 * not — the between-level scene draws a hero and a sibling at 3 and a snatched sibling at 2
 * (index.html:2310-2311, :2326, :2333) and the win screen draws both at 4 (:2457) — so
 * rather than a fourth hard-coded list and a fifth after it, the caller declares the
 * (pose, scale) pairs IT draws and gets exactly those.
 *
 * Which keeps the rule Plan 1 set and this file has followed since — scale belongs to the
 * draw site, not to the sprite — while letting the draw site say so directly. `menu*` above
 * is the older, narrower version of this same idea and could be folded in one day; it is
 * left alone here because two working screens read it and this is not their task.
 */
export function registerScaledPlayerTextures(
  scene: Phaser.Scene,
  pairs: readonly PoseAtScale[],
): void {
  for (const character of CHARACTERS) {
    skinsOf(character).forEach((skin, skinIndex) => {
      for (const [pose, scale] of pairs) {
        const key = scaledPlayerTextureKey(character, skinIndex, pose, scale);
        addSprite(scene, key, skin[pose], skin.palette, scale);
      }
    });
  }
}

/**
 * The villain of the between-level cutscene draws at 4 (index.html:2325, :2332) — bigger
 * than any enemy in the world does, which is the point of it.
 */
export const KIDNAPPER_SCALE = 4;

/** `kidnapper-<index>`, indexed into KIDNAPPERS rather than by level. */
export function kidnapperTextureKey(index: number): string {
  return `kidnapper-${index}`;
}

/**
 * Every kidnapper, at the one scale the cutscene draws them.
 *
 * Keyed by position in `KIDNAPPERS` and not by level, because the table is shorter than
 * the run in principle (`getKidnapper` in game/run.ts wraps) and because two of its six
 * entries are the same dino — keying by level would bake that sprite twice for no reason.
 */
export function registerKidnapperTextures(scene: Phaser.Scene): void {
  KIDNAPPERS.forEach((kidnapper, index) => {
    addSprite(scene, kidnapperTextureKey(index), kidnapper.s, kidnapper.p, KIDNAPPER_SCALE);
  });
}

/**
 * The five hearts bobbing across the win screen (index.html:2458), at 1.5 — the same
 * sprite as the HUD's lives at a different size, so, per this file's rule, a texture of
 * its own rather than the HUD's.
 */
export const WIN_HEART_TEXTURE = 'win-heart';

export function registerWinHeartTexture(scene: Phaser.Scene): void {
  addSprite(scene, WIN_HEART_TEXTURE, HEART_S, HEART_P, 1.5);
}

/**
 * The scale the title screen's cast draws at (index.html:1948-1954) — 2, where the same
 * creatures draw at 1.8 in a level (ENEMY_SCALE). Not a rounding of it and not worth
 * unifying: the title is a poster, and the art is a touch larger on a poster.
 */
export const TITLE_SCALE = 2;

/**
 * The seven creatures loitering along the bottom of the title screen, in the order the live
 * game draws them (index.html:1948-1954): a doll and a bouncer on the left with a ghost
 * hovering over them, and a car, a cannon, a bat and a dinosaur on the right.
 *
 * Named as enemy TYPES rather than as sprites, so the art comes from `getEnemySpriteInfo` —
 * the same lookup the level uses. A doll on the title screen that stopped matching the doll
 * in the level would be a small lie told on the first screen of the game.
 */
const TITLE_CAST = ['doll', 'bouncer', 'ghost', 'car', 'cannon', 'bat', 'dino'] as const;

export type TitleCastMember = typeof TITLE_CAST[number];

/** The clouds across the top of the title (index.html:1940) draw at 6, as the biggest do. */
export const TITLE_CLOUD_SCALE = 6;

/** `title-<type>`, e.g. `title-bat`. */
export function titleTextureKey(type: TitleCastMember): string {
  return `title-${type}`;
}

/**
 * Everything the title screen draws that is not a person: its seven creatures at their own
 * scale, and the cloud, which it shares with the level at the scale both draw it.
 *
 * The two people are not here — they come from `registerScaledPlayerTextures`, because the
 * title draws whichever Dodo skin was last chosen (index.html:1945) and the skins are that
 * function's business.
 */
export function registerTitleTextures(scene: Phaser.Scene): void {
  addSprite(scene, cloudTextureKey(TITLE_CLOUD_SCALE), CLOUD_S, CLOUD_P, TITLE_CLOUD_SCALE);
  for (const type of TITLE_CAST) {
    const { sprite, palette } = getEnemySpriteInfo(type);
    addSprite(scene, titleTextureKey(type), sprite, palette, TITLE_SCALE);
  }
}
