import Phaser from 'phaser';
import { BASE_H, BASE_W, STEP_MS, VIEW_H, VIEW_W, ZOOM } from '../config/constants';
import type { DifficultyKey } from '../config/difficulty';
import { TStr } from '../config/i18n';
import { PARALLAX, type ParallaxLayer } from '../data/parallax';
import type { SpriteData } from '../data/sprites';
import type { Character, PlayerMove } from '../game/player';
import { getDodoSkin, getGigiSkin, getPlayerSprites, getSelectedChar } from '../game/run';
import { createWorld, stepWorld } from '../game/world';
import type { EnemyState, World } from '../game/types';
import { cloudPosition, cloudScale, drawRidges, drawSky } from '../gfx/parallax';
import {
  type BlockView,
  createRainbowBlocks,
  drawStaticTiles,
  updateBumpedBlocks,
  updateRainbowBlocks,
} from '../gfx/tiles';
import {
  ARROW_TEXTURE,
  BIG_HEAD_SCALE,
  bigHeadRows,
  BOW_TEXTURE,
  CAPE_TEXTURE,
  CAT_SCRATCH_TEXTURE,
  CAT_TEXTURE,
  CHICKEN_ARROW_TEXTURE,
  cloudTextureKey,
  enemyTextureKey,
  playerBodyTextureKey,
  playerHeadTextureKey,
  PLAYER_SCALE,
  playerTextureKey,
  registerTextures,
  STAR_TEXTURE,
  SUPER_TEXTURE,
} from '../gfx/textures';
import type { InputState } from '../input/actions';
import { createKeyboardInput, type KeyboardInput } from '../input/keyboard';
import { createPlayerMove } from '../physics/player';
import { createCollisionLayer, syncCollisionLayer } from '../physics/tiles';
import { HUD_SCENE_KEY, type HudData } from './HudScene';

/**
 * Half the difference between the canvas and the zoomed view. See setScroll below —
 * the correction for Phaser zooming about the camera centre rather than its top-left.
 */
const CAMERA_PIVOT_X = (BASE_W - VIEW_W) / 2;
const CAMERA_PIVOT_Y = (BASE_H - VIEW_H) / 2;

/**
 * The sprite draws 2px larger than the hitbox on every side (index.html:1848:
 * `drawSprite(spr,p.x-2,p.y-2,ps.palette,2,p.facing<0)`, because the hitbox itself is
 * inset from the sprite by `w = spriteW - 4`, `h = spriteH - 4`, player.ts:35-36). Not
 * cosmetic — get this wrong and the art sits 2px off the hitbox, which reads as a
 * collision bug.
 */
const PLAYER_DRAW_INSET = 2;

/** `player.frame`: 0 stand, 1 run, 2 jump (types.ts, index.html:1424-1429). */
const PLAYER_POSES = ['stand', 'run', 'jump'] as const;

/** Cloud alpha (index.html:1681: `ctx.globalAlpha=0.75`). */
const CLOUD_ALPHA = 0.75;

/**
 * The live game's draw order (index.html:1697-1848), as Phaser depths.
 *
 * Phaser renders by depth first and by creation order only to break ties, and almost
 * everything below is created LAZILY — the first frame a star exists, an arrow is
 * fired, an enemy streams in. Creation order is therefore nothing like draw order: a
 * star knocked out of a block halfway through the level would be created after the
 * player and, on insertion order alone, would hang in FRONT of them. Naming the bands
 * explicitly is what keeps the pickups behind the cat, the cat behind the enemies,
 * and the cape behind the player whatever order the simulation produces them in.
 *
 * The background (sky, hills, clouds, tiles, the `?` and `!` glyphs) is left at the
 * default depth 0 and so stays underneath all of it.
 */
const DEPTH_PICKUP_GLOW = 10;
const DEPTH_PICKUP = 11;
const DEPTH_CAT = 12;
const DEPTH_ENEMY = 13;
const DEPTH_ARROW = 14;
/** The trail is drawn after its arrow (index.html:1832-1833), so it sits on top. */
const DEPTH_ARROW_TRAIL = 15;
const DEPTH_CAPE = 16;
const DEPTH_PLAYER = 17;

/** The four pickup glows (index.html:1699, 1704, 1709-1710, 1717), as colour + alpha. */
const STAR_GLOW = { color: 0xffdd00, alpha: 0.2 };
const BOW_GLOW = { color: 0xffc832, alpha: 0.18 };
const SUPER_GLOW = { color: 0xff6400, alpha: 0.18 };
const SUPER_INNER_GLOW = { color: 0xffc832, alpha: 0.1 };
const CAT_GLOW = { color: 0x6464b4, alpha: 0.2 };

/** The two arrow trails (index.html:1832-1833). */
const CHICKEN_TRAIL = { color: 0xffff64, alpha: 0.3 };
const ARROW_TRAIL = { color: 0xffc864, alpha: 0.4 };

/**
 * index.html:1726's `bold 7px monospace` in `#aabbcc`. Origin (0, 1) rather than
 * (0, 0) because the live `fillText` places the text's BASELINE at `cat.y-4`, not its
 * top — anchoring the bottom is the closest Phaser equivalent that does not depend on
 * canvas font metrics Phaser's text renderer does not share (same reasoning as the
 * `?` glyph in gfx/tiles.ts).
 */
const MEOW_FONT = { fontFamily: 'monospace', fontSize: '7px', fontStyle: 'bold', color: '#aabbcc' };

/** One cloud's fixed tile position plus the Image drawing it. */
interface CloudView {
  readonly tx: number;
  readonly ty: number;
  readonly image: Phaser.GameObjects.Image;
}

/**
 * The vertical slice: the first Phaser-facing code in this port, and the validation
 * gate for the whole migration. Driven by the pure simulation in src/game/ and drawn
 * with the kids' actual pixel art, the real tile grid, and a scrolling parallax sky
 * now that Plan 3 has a texture pipeline — still no felt shading (deferred), no HUD,
 * no sound. It exists to answer one question (does the port feel the same as the
 * live game?), so every hour spent making it prettier is an hour not spent on that.
 *
 * The scene is deliberately thin: build the background, the tile map and the player
 * image once in `create()`, advance the simulation at a fixed rate in `update()`, and
 * copy simulation state onto Phaser objects in `syncSprites()`. It never mutates
 * `world` except by calling `stepWorld`, and it never drives the camera itself —
 * Phaser's camera is only ever told where the simulation's camera already is.
 */
export class SliceScene extends Phaser.Scene {
  private world!: World;
  private controls!: KeyboardInput;
  private playerImage!: Phaser.GameObjects.Image;
  /** The two halves the player splits into while a big head is running. */
  private headImage!: Phaser.GameObjects.Image;
  private bodyImage!: Phaser.GameObjects.Image;
  private capeImage!: Phaser.GameObjects.Image;
  private readonly enemyImages: Phaser.GameObjects.Image[] = [];
  private readonly starImages: Phaser.GameObjects.Image[] = [];
  private readonly bowImages: Phaser.GameObjects.Image[] = [];
  private readonly superImages: Phaser.GameObjects.Image[] = [];
  private readonly arrowImages: Phaser.GameObjects.Image[] = [];
  /** At most one of each exists at a time, so none of these needs a pool. */
  private catPickupImage!: Phaser.GameObjects.Image;
  private catImage!: Phaser.GameObjects.Image;
  private catScratchImage!: Phaser.GameObjects.Image;
  private meowText!: Phaser.GameObjects.Text;
  /** The pickup haloes and the arrow trails: shapes, not sprites, redrawn each frame. */
  private glowGraphics!: Phaser.GameObjects.Graphics;
  private arrowTrailGraphics!: Phaser.GameObjects.Graphics;
  /** The two kinds of block that can be bumped from below, and the bricks they become. */
  private questionBlocks: BlockView[] = [];
  private rainbowBlocks: BlockView[] = [];
  private rainbowGraphics!: Phaser.GameObjects.Graphics;
  private bumpedGraphics!: Phaser.GameObjects.Graphics;
  /**
   * The same tiles again, as geometry Arcade can separate against rather than as a
   * picture — invisible, and drawing nothing. See src/physics/tiles.ts.
   */
  private collisionLayer!: Phaser.Tilemaps.TilemapLayer;
  /**
   * The player's Arcade body, as the one function the simulation is allowed to see of
   * it: move, separate, report back. See src/physics/player.ts.
   */
  private movePlayer!: PlayerMove;
  private hillsGraphics: Phaser.GameObjects.Graphics | undefined;
  private parallaxLayers: readonly ParallaxLayer[] = [];
  private clouds: CloudView[] = [];
  private accumulator = 0;

  constructor() {
    super('Slice');
  }

  create(): void {
    const levelIndex = 0;
    // Named rather than inlined into createWorld because the HUD needs the same two
    // values to label itself, and a HUD that said 'Normal' over a world built on some
    // other record would be worse than no HUD at all. A difficulty SCREEN is a later
    // task in this plan; until it exists, this is where the choice is made.
    const difficulty: DifficultyKey = 'normal';
    this.world = createWorld(levelIndex, difficulty);

    registerTextures(this);

    this.createParallax(levelIndex);

    this.questionBlocks = drawStaticTiles(this, this.world);
    const rainbow = createRainbowBlocks(this, this.world);
    this.rainbowBlocks = rainbow.blocks;
    this.rainbowGraphics = rainbow.graphics;
    // Created after both of those on purpose — see updateBumpedBlocks in gfx/tiles.ts.
    // Every tile layer sits at depth 0, where creation order alone decides what covers
    // what, and a bumped block's brick has to cover the block that was drawn there.
    this.bumpedGraphics = this.add.graphics();
    // Built from the very same `world.map` those three just drew, and kept in step with
    // it by `syncCollisionLayer` in update() below. The player stands on it; the enemies
    // still move themselves, for now.
    this.collisionLayer = createCollisionLayer(this, this.world);
    this.movePlayer = createPlayerMove(this, this.world, this.collisionLayer);

    this.glowGraphics = this.add.graphics().setDepth(DEPTH_PICKUP_GLOW);
    this.arrowTrailGraphics = this.add.graphics().setDepth(DEPTH_ARROW_TRAIL);

    this.catPickupImage = this.hiddenImage(CAT_TEXTURE, DEPTH_PICKUP);
    this.catImage = this.hiddenImage(CAT_TEXTURE, DEPTH_CAT);
    this.catScratchImage = this.hiddenImage(CAT_SCRATCH_TEXTURE, DEPTH_CAT);
    // Resolved once: the port has no language switch yet, so unlike the live game's
    // per-frame `T('meow')` there is nothing to re-read (same as gfx/tiles.ts's glyphs).
    this.meowText = this.add
      .text(0, 0, TStr('meow'), MEOW_FONT)
      .setOrigin(0, 1)
      .setDepth(DEPTH_CAT)
      .setVisible(false);

    const { player } = this.world;
    this.capeImage = this.hiddenImage(CAPE_TEXTURE, DEPTH_CAPE);
    this.playerImage = this.add
      .image(
        player.x - PLAYER_DRAW_INSET,
        player.y - PLAYER_DRAW_INSET,
        resolvePlayerTextureKey(player.frame),
      )
      .setOrigin(0, 0)
      .setDepth(DEPTH_PLAYER);
    this.bodyImage = this.hiddenImage(playerBodyTextureKey(...currentSkin(), 'stand'), DEPTH_PLAYER);
    this.headImage = this.hiddenImage(playerHeadTextureKey(...currentSkin(), 'stand'), DEPTH_PLAYER);

    this.cameras.main.setZoom(ZOOM);

    this.controls = createKeyboardInput(this);

    // The numbers, on a scene of their own, running alongside this one. `launch` rather
    // than `start`: this scene keeps running. It draws on top because main.ts lists it
    // after this one and Phaser renders scenes in that order — launching does not
    // reorder them — and it escapes the `setZoom` above because a scene's camera is its
    // own. `world` goes across as a live reference; the HUD only ever reads it.
    this.scene.launch(HUD_SCENE_KEY, {
      world: this.world,
      levelIndex,
      difficulty,
    } satisfies HudData);
  }

  /**
   * A world image that starts hidden and is positioned by `syncSprites` on the first
   * frame the thing it draws exists. The texture passed is only a starting point for
   * the ones that later swap it (the player's halves, an arrow slot that changes
   * between an arrow and a chicken).
   */
  private hiddenImage(texture: string, depth: number): Phaser.GameObjects.Image {
    return this.add.image(0, 0, texture).setOrigin(0, 0).setDepth(depth).setVisible(false);
  }

  /**
   * The image for slot `index` of a pool, created on first use. Every image in a
   * given pool draws the same kind of thing, so a slot is not tied to a particular
   * star or arrow — `hideSurplus` below parks whatever the simulation is not using
   * this frame, and a shorter list next frame (a respawn empties them all) simply
   * leaves more of the pool hidden.
   */
  private pooledImage(
    pool: Phaser.GameObjects.Image[],
    index: number,
    texture: string,
    depth: number,
  ): Phaser.GameObjects.Image {
    const existing = pool[index];
    if (existing) return existing;
    const image = this.hiddenImage(texture, depth);
    pool[index] = image;
    return image;
  }

  /**
   * Builds the sky, the parallax hill layers, and the clouds — everything
   * `drawParallax` and the live game's cloud block draw BEFORE the world's own
   * `ctx.scale(ZOOM)` (index.html:1044-1072, 1681-1682), i.e. unzoomed and independent of
   * camera scroll. `PARALLAX[levelIndex]` mirrors the live game's own guard
   * (`if(!pd)return`, index.html:1045): the one level this slice runs (0) has an
   * entry, but a level that did not would simply get no sky, hills or clouds rather
   * than a crash — `hillsGraphics` stays undefined and `clouds` stays empty, both
   * read defensively in `syncSprites` below.
   */
  private createParallax(levelIndex: number): void {
    const parallax = PARALLAX[levelIndex];
    if (!parallax) return;

    const sky = this.add.graphics();
    this.setupFixedLayer(sky);
    drawSky(sky, this.world.level.bg, parallax.bg2);

    const hills = this.add.graphics();
    this.setupFixedLayer(hills);
    this.hillsGraphics = hills;
    this.parallaxLayers = parallax.layers;

    this.clouds = this.world.level.clouds.map(([tx, ty]) => {
      const image = this.add
        .image(0, 0, cloudTextureKey(cloudScale(tx)))
        .setOrigin(0, 0)
        .setAlpha(CLOUD_ALPHA);
      this.setupFixedLayer(image);
      return { tx, ty, image };
    });
  }

  /**
   * Puts a Graphics or Image on the fixed background layer (sky, hills, clouds). All
   * three render through the SAME shared main camera as the world (tiles, player,
   * enemies) — there is no second camera — but must not scroll or zoom with it,
   * matching the live game drawing them before its own `ctx.scale(ZOOM)`
   * (index.html:1044-1072, 1681-1682). `scrollFactor(0)` handles the scroll half. The
   * other half is zoom: Phaser zooms every object about the camera's CENTRE —
   * including scrollFactor(0) ones — while the live drawing is unzoomed and
   * top-left-anchored, so positioning at (CAMERA_PIVOT_X, CAMERA_PIVOT_Y) and scaling
   * by 1/ZOOM cancels the shared camera's zoom back out. After this,
   * `positionFixedLayer(obj, 0, 0)` — its position immediately below — lands on the
   * same screen pixel the live canvas's raw (0, 0) would.
   */
  private setupFixedLayer(obj: Phaser.GameObjects.Graphics | Phaser.GameObjects.Image): void {
    obj.setScale(1 / ZOOM).setScrollFactor(0);
    this.positionFixedLayer(obj, 0, 0);
  }

  /**
   * Moves a fixed-background-layer object (`setupFixedLayer` above) so that the
   * given RAW, unzoomed pixel coordinate — exactly the live formulas in
   * gfx/parallax.ts, unchanged — lands on the same screen pixel the live canvas
   * would put it on. The sky and hills Graphics only ever need this once, at (0, 0):
   * their own drawn path already covers the full raw coordinate range on its own.
   * Each cloud Image needs it called again every frame, with that cloud's current
   * `cloudPosition`, since an Image — unlike a Graphics path — has only the one
   * position to carry its drift.
   */
  private positionFixedLayer(
    obj: Phaser.GameObjects.Graphics | Phaser.GameObjects.Image,
    rawX: number,
    rawY: number,
  ): void {
    obj.setPosition(rawX / ZOOM + CAMERA_PIVOT_X, rawY / ZOOM + CAMERA_PIVOT_Y);
  }

  /**
   * The fixed step, and the one place in this port where Arcade's clock is set.
   *
   * The accumulator is the single deliberate break from bug-compatibility in the whole
   * migration: index.html runs its simulation straight off `requestAnimationFrame`, so on
   * a 120Hz screen the live game runs at double speed. This runs STEP_MS's worth of
   * simulation per STEP_MS of real time whatever the display does.
   *
   * Arcade has to be inside that loop or the fix is undone for the player alone. Left to
   * itself it steps once per RENDERED frame (it listens to the scene's UPDATE event), so
   * on that same 120Hz screen the player would move twice for every one step everything
   * else took — exactly the bug, reintroduced for exactly one entity, and found by a
   * child on a fast laptop rather than by a test. So `customUpdate: true` in main.ts
   * unhooks it, and `createPlayerMove` calls `physics.world.singleStep()` from inside
   * `stepWorld` -> `stepPlayer`, once per iteration of this loop, with Arcade's own fixed
   * delta.
   *
   * Driving it from in there rather than from out here buys one more thing worth having:
   * the frames the simulation does NOT run — dead, won, or frozen behind a power-up
   * announcement — do not step Arcade either, so a frozen world really is frozen instead
   * of leaving the player coasting behind the popup.
   */
  update(_time: number, delta: number): void {
    // Clamp so a backgrounded tab does not produce a hundred catch-up steps at once.
    this.accumulator = Math.min(this.accumulator + delta, STEP_MS * 5);
    while (this.accumulator >= STEP_MS) {
      stepWorld(this.world, this.readInput(), this.movePlayer);
      // INSIDE the loop, not after it. A bumped block and a respawn both rewrite
      // `world.map`, and the collision layer is a copy of that map rather than a view of
      // it — and the player now separates against the layer rather than reading the map.
      // Left outside, a map change made by one fixed step would not reach the geometry
      // until after every other step in this rendered frame had already collided against
      // the stale copy. Nothing in the current tile vocabulary can show that (3, 5 and 2
      // are all solid, so a bump changes no collision), which is exactly why it is worth
      // being explicit before something can.
      syncCollisionLayer(this.collisionLayer, this.world);
      this.accumulator -= STEP_MS;
    }
    this.syncSprites();
  }

  private readInput(): InputState {
    return this.controls.read();
  }

  /**
   * Copies simulation state onto every image the world draws — pickups, the cat,
   * arrows, the player, the enemies — and tells Phaser's camera where the
   * simulation's camera already is. The per-entity passes are split into the methods
   * below in the live game's own draw order (index.html:1697-1848); the order they
   * run in here does not decide what covers what, though: that is the depth bands at
   * the top of this file.
   *
   * `world.camera` is simulation state —
   * enemy spawning reads it, and it is compared frame by frame against the live game
   * in the test suite — so this scene follows it rather than driving it: no
   * `startFollow`, ever. Two cameras with different following behaviour would
   * silently disagree, and the one the tests check would not be the one on screen.
   *
   * `Math.round` matches the live game, which rounds only at draw time
   * (index.html:1686) while keeping the camera sub-pixel in logic.
   */
  private syncSprites(): void {
    const { enemies, camera, animFrame } = this.world;

    this.syncPickups();
    this.syncCat();
    this.syncArrows();
    this.syncPlayer();

    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      const image = this.enemyImages[i] ?? this.createEnemyImage(enemy);
      this.enemyImages[i] = image;
      this.syncEnemyImage(image, enemy, animFrame);
    }
    // `world.enemies` only ever grows WITHIN a level, but a respawn replaces it with
    // an empty array (world.ts's respawnLevel) — and without this, every enemy from
    // the failed attempt stayed painted where it was, frozen, for the rest of the run.
    hideSurplus(this.enemyImages, enemies.length);

    // Parallax: the ridge and clouds scroll at their own rate from world.camera.x,
    // independent of the world's own camera (see the fixed-layer helpers above). The
    // sky is static and was drawn once in create().
    if (this.hillsGraphics) {
      drawRidges(this.hillsGraphics, this.parallaxLayers, camera.x);
    }
    for (const cloud of this.clouds) {
      const pos = cloudPosition(cloud.tx, cloud.ty, camera.x, animFrame);
      this.positionFixedLayer(cloud.image, pos.x, pos.y);
    }

    // The only two tiles the static pass in create() cannot draw for good — see
    // gfx/tiles.ts. A block bumped from below becomes a plain brick until a respawn
    // brings it back, and the rainbow blocks cycle their hue every frame. Everything
    // else the tile grid draws was drawn once, in create(), and is left alone.
    //
    // The bumped pass runs first so that a block spent this frame is already out of the
    // rainbow list by the time the animated pass below walks it.
    updateBumpedBlocks(this.bumpedGraphics, this.world, this.questionBlocks, this.rainbowBlocks);
    updateRainbowBlocks(this.rainbowGraphics, this.rainbowBlocks, animFrame);

    // Phaser zooms about the camera's CENTRE; the live game zooms about the top-left
    // (`ctx.scale(ZOOM); ctx.translate(-camera.x, -camera.y)`, index.html:1686). Same
    // visible size either way — 426.7 x 266.7 — but Phaser's view sits half the
    // difference down and to the right, so the simulation's camera position has to be
    // biased back by that much for the two to show the same region. Measured in the
    // browser: without this the view started at world (106.7, 199.7) while the
    // simulation said (0, 133.3), which put the player off-screen to the left.
    this.cameras.main.setScroll(
      Math.round(camera.x) - CAMERA_PIVOT_X,
      Math.round(camera.y) - CAMERA_PIVOT_Y,
    );
  }

  /**
   * Stars and the three pickups (index.html:1697-1721). All four bob on a sine of
   * `animFrame`, and no two use the same one: the star's is shared by every star
   * (amplitude 3, no phase term, so they rise and fall together), while the bow,
   * super and cat each add `x * 0.1` to the phase so two of them on screen drift
   * apart. Amplitudes are 3, 4, 5 and 4 respectively, and the star alone draws at
   * scale 1.5 — these are four separate expressions in the live source, not one
   * expression with parameters, and they are kept separate here for the same reason.
   *
   * A collected pickup draws nothing at all, halo included: the live game's `return`
   * is above the glow, not between it and the sprite.
   *
   * The haloes are the `ctx.arc` fills those same lines paint under each sprite. The
   * live game's sparkle PARTICLES are not here — the port has no particle system yet
   * (particles are pure presentation and live outside the simulation), so the pickups
   * glow and bob but do not give off sparks.
   */
  private syncPickups(): void {
    const { stars, bowPickups, superPickups, catPickup, animFrame } = this.world;
    const glow = this.glowGraphics;
    glow.clear();

    const starBob = Math.sin(animFrame * 0.12) * 3;
    const starRadius = 8 + Math.sin(animFrame * 0.15) * 3;
    for (let i = 0; i < stars.length; i++) {
      const star = stars[i];
      const image = this.pooledImage(this.starImages, i, STAR_TEXTURE, DEPTH_PICKUP);
      image.setVisible(!star.collected);
      if (star.collected) continue;
      image.setPosition(star.x, star.y + starBob);
      fillCircle(glow, STAR_GLOW, star.x + 5, star.y + 5 + starBob, starRadius);
    }
    hideSurplus(this.starImages, stars.length);

    const bowRadius = 16 + Math.sin(animFrame * 0.1) * 3;
    for (let i = 0; i < bowPickups.length; i++) {
      const bow = bowPickups[i];
      const image = this.pooledImage(this.bowImages, i, BOW_TEXTURE, DEPTH_PICKUP);
      image.setVisible(!bow.collected);
      if (bow.collected) continue;
      const bob = Math.sin(animFrame * 0.08 + bow.x * 0.1) * 4;
      image.setPosition(bow.x, bow.y + bob);
      fillCircle(glow, BOW_GLOW, bow.x + 8, bow.y + 8 + bob, bowRadius);
    }
    hideSurplus(this.bowImages, bowPickups.length);

    const superRadius = 18 + Math.sin(animFrame * 0.09) * 4;
    for (let i = 0; i < superPickups.length; i++) {
      const cape = superPickups[i];
      const image = this.pooledImage(this.superImages, i, SUPER_TEXTURE, DEPTH_PICKUP);
      image.setVisible(!cape.collected);
      if (cape.collected) continue;
      const bob = Math.sin(animFrame * 0.07 + cape.x * 0.1) * 5;
      image.setPosition(cape.x, cape.y + bob);
      // Two circles, the inner one at 60% of the outer's radius (index.html:1709-1710).
      fillCircle(glow, SUPER_GLOW, cape.x + 8, cape.y + 8 + bob, superRadius);
      fillCircle(glow, SUPER_INNER_GLOW, cape.x + 8, cape.y + 8 + bob, superRadius * 0.6);
    }
    hideSurplus(this.superImages, superPickups.length);

    const showCatPickup = catPickup !== null && !catPickup.collected;
    this.catPickupImage.setVisible(showCatPickup);
    if (catPickup && showCatPickup) {
      const bob = Math.sin(animFrame * 0.08 + catPickup.x * 0.1) * 4;
      this.catPickupImage.setPosition(catPickup.x, catPickup.y + bob);
      // The one halo that is not centred on the sprite's own middle: +12 in y, not +8
      // (index.html:1717), which puts it around the cat's body rather than its ears.
      const radius = 20 + Math.sin(animFrame * 0.1) * 3;
      fillCircle(glow, CAT_GLOW, catPickup.x + 8, catPickup.y + 12 + bob, radius);
    }
  }

  /**
   * The cat companion, its "Mjäu!" and its claw mark (index.html:1723-1730).
   *
   * The cat does not bob: it is already bouncing, in the simulation. It does flip,
   * on `facing < 0` — the player's convention, not the enemies' — and `facing` is the
   * direction of its last bounce REVERSAL rather than of its current travel, so it
   * spends whole swings pointing the way it came (see CatState in game/types.ts).
   *
   * The claw mark appears only for the first ten frames of the thirty-frame scratch
   * cooldown (`scratchTimer > 20`), and at a fixed -5/-5 from the victim's centre
   * rather than centred on it.
   */
  private syncCat(): void {
    const { cat, animFrame } = this.world;
    if (!cat) {
      this.catImage.setVisible(false);
      this.catScratchImage.setVisible(false);
      this.meowText.setVisible(false);
      return;
    }

    this.catImage.setVisible(true).setPosition(cat.x, cat.y).setFlipX(cat.facing < 0);

    // Forty frames of meowing out of every two hundred (index.html:1726).
    this.meowText.setVisible(animFrame % 200 < 40).setPosition(cat.x, cat.y - 4);

    const scratching = cat.scratchTimer > 20 && cat.scratchTarget !== null;
    this.catScratchImage.setVisible(scratching);
    if (cat.scratchTarget && scratching) {
      this.catScratchImage.setPosition(cat.scratchTarget.x - 5, cat.scratchTarget.y - 5);
    }
  }

  /**
   * Arrows and chicken rays (index.html:1831-1834). One pool for both: the same slot
   * draws an arrow one frame and a chicken the next as the list shifts, so the
   * texture is set per frame rather than at creation.
   *
   * The two differ in more than the sprite. The chicken is lifted 4px
   * (`a.y-4`), draws at 1.5 to the arrow's 2, and trails a 4x3 yellow smear at y;
   * the arrow trails a 6x2 orange one at y+1. Both trails sit BEHIND the direction of
   * travel, which is why the x offset flips with `a.vx` — and the two offsets are not
   * mirror images of each other (`-4`/`+12` against `-6`/`+14`), because the sprite's
   * own width differs on each side.
   */
  private syncArrows(): void {
    const { arrows } = this.world;
    const trails = this.arrowTrailGraphics;
    trails.clear();

    for (let i = 0; i < arrows.length; i++) {
      const arrow = arrows[i];
      const texture = arrow.isChicken ? CHICKEN_ARROW_TEXTURE : ARROW_TEXTURE;
      const image = this.pooledImage(this.arrowImages, i, texture, DEPTH_ARROW);
      image.setTexture(texture).setVisible(true).setFlipX(arrow.vx < 0);

      if (arrow.isChicken) {
        image.setPosition(arrow.x, arrow.y - 4);
        const x = arrow.vx > 0 ? arrow.x - 4 : arrow.x + 12;
        fillRect(trails, CHICKEN_TRAIL, x, arrow.y, 4, 3);
      } else {
        image.setPosition(arrow.x, arrow.y);
        const x = arrow.vx > 0 ? arrow.x - 6 : arrow.x + 14;
        fillRect(trails, ARROW_TRAIL, x, arrow.y + 1, 6, 2);
      }
    }
    hideSurplus(this.arrowImages, arrows.length);
  }

  /**
   * The player, their cape and their big head (index.html:1838-1848).
   *
   * All three are inside ONE gate: `p.invincible<=0||Math.floor(animFrame/3)%2===0`.
   * While the window a cape bought is running, the player does not flash a different
   * colour — they are simply not drawn, for three frames out of every six, cape and
   * all.
   *
   * The big head is not the player scaled up. It is the sprite cut in half: the top
   * `bigHeadRows` rows drawn at BIG_HEAD_SCALE, the rest still at PLAYER_SCALE, with
   * the body dropped by the head's original height so its feet stay put and the head
   * centred over it and lifted clear. Those two halves are pre-baked textures — see
   * registerPlayerTextures in gfx/textures.ts for why they are not sliced here.
   */
  private syncPlayer(): void {
    const { player, animFrame } = this.world;
    const drawn = player.invincible <= 0 || Math.floor(animFrame / 3) % 2 === 0;
    const bigHead = player.bigHeadTimer > 0;
    const flip = player.facing < 0;

    // The cape hangs off the BACK, so its x offset swaps with facing — and the two
    // offsets are measured from opposite edges (index.html:1839).
    this.capeImage.setVisible(drawn && player.hasCape);
    if (drawn && player.hasCape) {
      const x = player.facing > 0 ? player.x - 8 : player.x + player.w - 4;
      const wobble = Math.sin(animFrame * 0.15) * 2;
      this.capeImage.setPosition(x, player.y + 6 + wobble).setFlipX(flip);
    }

    this.playerImage.setTexture(resolvePlayerTextureKey(player.frame));
    this.playerImage.setPosition(player.x - PLAYER_DRAW_INSET, player.y - PLAYER_DRAW_INSET);
    // Sprites face right by default; flip to face left (index.html:1848: `p.facing<0`).
    this.playerImage.setFlipX(flip);
    this.playerImage.setVisible(drawn && !bigHead);

    this.bodyImage.setVisible(drawn && bigHead);
    this.headImage.setVisible(drawn && bigHead);
    if (!bigHead) return;

    const [character, skinIndex] = currentSkin();
    const pose = PLAYER_POSES[player.frame];
    const sprite = resolvePlayerSprite(player.frame);
    const headRows = bigHeadRows(sprite);
    const columns = sprite[0].length;

    const bodyX = player.x - PLAYER_DRAW_INSET;
    const bodyY = player.y - PLAYER_DRAW_INSET + headRows * PLAYER_SCALE;
    this.bodyImage
      .setTexture(playerBodyTextureKey(character, skinIndex, pose))
      .setPosition(bodyX, bodyY)
      .setFlipX(flip);

    this.headImage
      .setTexture(playerHeadTextureKey(character, skinIndex, pose))
      .setPosition(
        bodyX + (columns * PLAYER_SCALE - columns * BIG_HEAD_SCALE) / 2,
        bodyY - headRows * BIG_HEAD_SCALE,
      )
      .setFlipX(flip);
  }

  /**
   * `world.enemies` starts empty and grows as the camera streams the level in — three
   * enemies already exist after the very first simulation step (doll@15, doll@28 and
   * car@40 all fall inside the 640px-wide spawn window at camera x=0), and more stream
   * in later. Images are created lazily, one per new array slot, rather than assuming
   * any fixed count up front. Whatever state it is created in is overwritten
   * immediately by `syncEnemyImage` right below, in the same pass.
   */
  private createEnemyImage(enemy: EnemyState): Phaser.GameObjects.Image {
    return this.add
      .image(enemy.x, enemy.y, enemyTextureKey(enemy.type))
      .setOrigin(0, 0)
      .setDepth(DEPTH_ENEMY);
  }

  /**
   * Port of the enemy branch of index.html:1759-1763. `fl = e.vx>0` — enemy sprites
   * face left by default (the opposite of the player's convention above), so the
   * flip is on moving RIGHT, not left. Ghost transparency
   * (`.6+Math.sin(animFrame*.08)*.2`, index.html:1761) is skipped: `spawnEnemy`
   * (game/enemy.ts) never creates a 'ghost' in this slice, so there is none to apply
   * it to.
   */
  private syncEnemyImage(image: Phaser.GameObjects.Image, enemy: EnemyState, animFrame: number): void {
    // Re-resolved every frame, not set once at creation, because an enemy's TYPE can
    // change under it: a chicken ray rewrites `e.type` to 'chicken' (game/enemy.ts's
    // chickenify), and the live game looks the sprite up by type on every frame it
    // draws (index.html:1760's `getEnemySpriteInfo(e.type)`). Fix the texture at
    // creation instead and a converted doll goes on being a doll for ever.
    image.setTexture(enemyTextureKey(enemy.type));
    image.setFlipX(enemy.vx > 0);

    if (!enemy.alive) {
      if (enemy.squashTimer <= 0) {
        image.setVisible(false);
        return;
      }
      // Squashed: flattened to 30% height, dropped so the flattened image still sits
      // on the ground it died on, fading out over the same half-second the squash
      // timer counts down from (index.html:1762). `setOrigin(0,0)` (set at creation)
      // makes `y` the sprite's top edge, so scaling Y down from there is the same
      // squash-toward-the-top the live canvas gets from
      // `ctx.translate(e.x,e.y+e.h*.7);ctx.scale(1,.3)`.
      image.setVisible(true);
      image.setPosition(enemy.x, enemy.y + enemy.h * 0.7);
      image.setScale(1, 0.3);
      image.setAlpha(enemy.squashTimer / 30);
      return;
    }

    // Alive: a per-enemy vertical wobble driven by the free-running animFrame counter
    // plus its own x, so enemies bob out of sync with each other (index.html:1763).
    // This is draw-time-only, same as the live game — it is never stored in the
    // simulation.
    const wobble = Math.sin(animFrame * 0.15 + enemy.x);
    image.setVisible(true);
    image.setScale(1, 1);
    image.setAlpha(1);
    image.setPosition(enemy.x, enemy.y + wobble);
  }
}

/**
 * Resolves the texture key for the player's current pose, mirroring the character
 * and skin lookup `getPlayerSprites` itself does (game/run.ts:116-123) rather than
 * calling it: that function returns resolved sprite/palette data for the canvas
 * pipeline, but every combination it could return was already rasterised once, at
 * boot, by `registerTextures` — so this only needs the same character/skin lookup to
 * pick the matching pre-baked key, not the sprite data behind it.
 */
function resolvePlayerTextureKey(frame: number): string {
  return playerTextureKey(...currentSkin(), PLAYER_POSES[frame]);
}

/** Who is being played and in which skin — the lookup the keys above are built from. */
function currentSkin(): [Character, number] {
  const character = getSelectedChar();
  return [character, character === 'dodo' ? getDodoSkin() : getGigiSkin()];
}

/**
 * The sprite GRID behind the current pose, which the big head needs as well as the
 * texture: its two halves are placed from the sprite's row and column counts
 * (index.html:1842-1845), and those are a property of the art, not of the texture
 * key. Written as the live game's own three-way pick (index.html:1838) rather than
 * indexing an array, so it allocates nothing on a frame.
 */
function resolvePlayerSprite(frame: number): SpriteData {
  const sprites = getPlayerSprites();
  if (frame === 0) return sprites.stand;
  if (frame === 1) return sprites.run;
  return sprites.jump;
}

/** Parks every image in a pool from `used` onwards — see `pooledImage`. */
function hideSurplus(pool: readonly Phaser.GameObjects.Image[], used: number): void {
  for (let i = used; i < pool.length; i++) pool[i].setVisible(false);
}

interface Tint {
  readonly color: number;
  readonly alpha: number;
}

/** `ctx.fillStyle='rgba(...)'; ctx.arc(...); ctx.fill()`, as Graphics takes it. */
function fillCircle(g: Phaser.GameObjects.Graphics, tint: Tint, x: number, y: number, r: number): void {
  g.fillStyle(tint.color, tint.alpha).fillCircle(x, y, r);
}

/** `ctx.fillStyle='rgba(...)'; ctx.fillRect(...)`, as Graphics takes it. */
function fillRect(
  g: Phaser.GameObjects.Graphics,
  tint: Tint,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  g.fillStyle(tint.color, tint.alpha).fillRect(x, y, w, h);
}
