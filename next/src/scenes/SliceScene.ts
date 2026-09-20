import Phaser from 'phaser';
import { BASE_H, BASE_W, STEP_MS, VIEW_H, VIEW_W, ZOOM } from '../config/constants';
import { PARALLAX, type ParallaxLayer } from '../data/parallax';
import { getDodoSkin, getGigiSkin, getSelectedChar } from '../game/run';
import { createWorld, stepWorld } from '../game/world';
import type { EnemyState, World } from '../game/types';
import { cloudPosition, cloudScale, drawRidges, drawSky } from '../gfx/parallax';
import { createRainbowBlocks, drawStaticTiles, updateRainbowBlocks, type RainbowBlock } from '../gfx/tiles';
import { cloudTextureKey, enemyTextureKey, playerTextureKey, registerTextures } from '../gfx/textures';
import type { InputState } from '../input/actions';
import { createKeyboardInput, type KeyboardInput } from '../input/keyboard';

/**
 * Half the difference between the canvas and the zoomed view. See setScroll below —
 * the correction for Phaser zooming about the camera centre rather than its top-left.
 */
const CAMERA_PIVOT_X = (BASE_W - VIEW_W) / 2;
const CAMERA_PIVOT_Y = (BASE_H - VIEW_H) / 2;

/**
 * The sprite draws 2px larger than the hitbox on every side (index.html:1838:
 * `drawSprite(spr,p.x-2,p.y-2,ps.palette,2,p.facing<0)`, because the hitbox itself is
 * inset from the sprite by `w = spriteW - 4`, `h = spriteH - 4`, player.ts:35-36). Not
 * cosmetic — get this wrong and the art sits 2px off the hitbox, which reads as a
 * collision bug.
 */
const PLAYER_DRAW_INSET = 2;

/** `player.frame`: 0 stand, 1 run, 2 jump (types.ts, index.html:1424-1429). */
const PLAYER_POSES = ['stand', 'run', 'jump'] as const;

/**
 * EXPERIMENT — an externally drawn car, on trial. Remove this block, `preload()`, and
 * the two `isCar` branches in createEnemyImage/syncEnemyImage to revert.
 *
 * The six "walking" frames from a supplied sheet, cut out and scaled down. Measured,
 * not guessed: in every frame the car body occupies x 25-78, y 2-30 of the 80x34 cell,
 * because the frames were right-aligned on the front bumper rather than on their
 * bounding box (the dust cloud varies in width and would have made the car jitter).
 *
 * The art faces RIGHT. Every other enemy sprite in this game faces LEFT, so this one
 * alone flips on moving left rather than right.
 *
 * Nothing here touches the simulation: the hitbox is still the one derived from the
 * original CAR_S grid, so the frame-by-frame comparison against the live game is
 * unaffected. Only the picture changed.
 */
const CAR_SHEET = {
  key: 'carWalk',
  file: 'car-walk.png',
  frameWidth: 80,
  frameHeight: 34,
  frames: 6,
  /** Simulation frames per animation frame. The live car toggles 2 poses every 15. */
  framesPerStep: 6,
  /** Where the car body sits inside a cell, measured across all six frames. */
  bodyX: 25,
  bodyY: 2,
  bodyW: 54,
} as const;

/** Cloud alpha (index.html:1676: `ctx.globalAlpha=0.75`). */
const CLOUD_ALPHA = 0.75;

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
  private readonly enemyImages: Phaser.GameObjects.Image[] = [];
  private rainbowBlocks: RainbowBlock[] = [];
  private rainbowGraphics!: Phaser.GameObjects.Graphics;
  private hillsGraphics: Phaser.GameObjects.Graphics | undefined;
  private parallaxLayers: readonly ParallaxLayer[] = [];
  private clouds: CloudView[] = [];
  private accumulator = 0;

  constructor() {
    super('Slice');
  }

  preload(): void {
    // Vite serves next/public at the base path; Phaser needs the full URL.
    this.load.spritesheet(CAR_SHEET.key, `${import.meta.env.BASE_URL}${CAR_SHEET.file}`, {
      frameWidth: CAR_SHEET.frameWidth,
      frameHeight: CAR_SHEET.frameHeight,
    });
  }

  create(): void {
    const levelIndex = 0;
    this.world = createWorld(levelIndex, 'normal');

    registerTextures(this);

    this.createParallax(levelIndex);

    drawStaticTiles(this, this.world);
    const rainbow = createRainbowBlocks(this, this.world);
    this.rainbowBlocks = rainbow.blocks;
    this.rainbowGraphics = rainbow.graphics;

    const { player } = this.world;
    this.playerImage = this.add
      .image(
        player.x - PLAYER_DRAW_INSET,
        player.y - PLAYER_DRAW_INSET,
        resolvePlayerTextureKey(player.frame),
      )
      .setOrigin(0, 0);

    this.cameras.main.setZoom(ZOOM);

    this.controls = createKeyboardInput(this);
  }

  /**
   * Builds the sky, the parallax hill layers, and the clouds — everything
   * `drawParallax` and the live game's cloud block draw BEFORE the world's own
   * `ctx.scale(ZOOM)` (index.html:1044-1072, 1676), i.e. unzoomed and independent of
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
   * (index.html:1044-1072, 1676). `scrollFactor(0)` handles the scroll half. The
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

  update(_time: number, delta: number): void {
    // Clamp so a backgrounded tab does not produce a hundred catch-up steps at once.
    this.accumulator = Math.min(this.accumulator + delta, STEP_MS * 5);
    while (this.accumulator >= STEP_MS) {
      stepWorld(this.world, this.readInput());
      this.accumulator -= STEP_MS;
    }
    this.syncSprites();
  }

  private readInput(): InputState {
    return this.controls.read();
  }

  /**
   * Copies simulation state onto the player/enemy images, and tells Phaser's camera
   * where the simulation's camera already is. `world.camera` is simulation state —
   * enemy spawning reads it, and it is compared frame by frame against the live game
   * in the test suite — so this scene follows it rather than driving it: no
   * `startFollow`, ever. Two cameras with different following behaviour would
   * silently disagree, and the one the tests check would not be the one on screen.
   *
   * `Math.round` matches the live game, which rounds only at draw time
   * (index.html:1686) while keeping the camera sub-pixel in logic.
   */
  private syncSprites(): void {
    const { player, enemies, camera, animFrame } = this.world;

    this.playerImage.setTexture(resolvePlayerTextureKey(player.frame));
    this.playerImage.setPosition(player.x - PLAYER_DRAW_INSET, player.y - PLAYER_DRAW_INSET);
    // Sprites face right by default; flip to face left (index.html:1838: `p.facing<0`).
    this.playerImage.setFlipX(player.facing < 0);
    // index.html:1838 — `p.invincible<=0||Math.floor(animFrame/3)%2===0`, an
    // invincibility blink. This slice's PlayerState has no `invincible` field yet
    // (nothing sets it), so it is hardcoded to 0 here, which makes the left side of
    // the `||` always true and the blink permanently inert. The expression itself is
    // wired up so that plumbing a real `invincible` field through later only means
    // changing this one constant, not this line.
    const invincible = 0;
    this.playerImage.setVisible(invincible <= 0 || Math.floor(animFrame / 3) % 2 === 0);

    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      const image = this.enemyImages[i] ?? this.createEnemyImage(enemy);
      this.enemyImages[i] = image;
      this.syncEnemyImage(image, enemy, animFrame);
    }

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

    // The only tile that animates — see gfx/tiles.ts. Everything else the tile grid
    // draws was drawn once, in create(), and is left alone.
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
   * `world.enemies` starts empty and grows as the camera streams the level in — three
   * enemies already exist after the very first simulation step (doll@15, doll@28 and
   * car@40 all fall inside the 640px-wide spawn window at camera x=0), and more stream
   * in later. Images are created lazily, one per new array slot, rather than assuming
   * any fixed count up front. Whatever state it is created in is overwritten
   * immediately by `syncEnemyImage` right below, in the same pass.
   */
  private createEnemyImage(enemy: EnemyState): Phaser.GameObjects.Image {
    if (enemy.type === 'car') {
      // Sized so the CAR BODY matches the hitbox width; the rest of the cell is the
      // dust trail, which is meant to spill outside it.
      const scale = enemy.w / CAR_SHEET.bodyW;
      return this.add
        .image(enemy.x, enemy.y, CAR_SHEET.key, 0)
        .setOrigin(0, 0)
        .setDisplaySize(CAR_SHEET.frameWidth * scale, CAR_SHEET.frameHeight * scale);
    }
    return this.add.image(enemy.x, enemy.y, enemyTextureKey(enemy.type)).setOrigin(0, 0);
  }

  /**
   * Places the experimental car so its body lands on the hitbox rather than the cell
   * corner. Flipping mirrors the cell, so the body's inset is measured from the other
   * side when it faces left.
   */
  private syncCarImage(image: Phaser.GameObjects.Image, enemy: EnemyState, wobble: number): void {
    const scale = enemy.w / CAR_SHEET.bodyW;
    const facingLeft = enemy.vx < 0;
    const insetLeft = facingLeft
      ? CAR_SHEET.frameWidth - (CAR_SHEET.bodyX + CAR_SHEET.bodyW)
      : CAR_SHEET.bodyX;

    image.setFlipX(facingLeft);
    image.setDisplaySize(CAR_SHEET.frameWidth * scale, CAR_SHEET.frameHeight * scale);
    image.setPosition(enemy.x - insetLeft * scale, enemy.y + wobble - CAR_SHEET.bodyY * scale);
  }

  /**
   * Port of the enemy branch of index.html:1761-1763. `fl = e.vx>0` — enemy sprites
   * face left by default (the opposite of the player's convention above), so the
   * flip is on moving RIGHT, not left. Ghost transparency
   * (`.6+Math.sin(animFrame*.08)*.2`, index.html:1761) is skipped: `spawnEnemy`
   * (game/enemy.ts) never creates a 'ghost' in this slice, so there is none to apply
   * it to.
   */
  private syncEnemyImage(image: Phaser.GameObjects.Image, enemy: EnemyState, animFrame: number): void {
    // EXPERIMENT: the car is on trial with externally drawn art. It faces right, unlike
    // every other enemy sprite, and its cell is larger than its hitbox — so it gets its
    // own placement and its own six-frame cycle, both handled below.
    const isCar = enemy.type === 'car';

    image.setFlipX(isCar ? enemy.vx < 0 : enemy.vx > 0);

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
    image.setAlpha(1);

    if (isCar) {
      // Six frames off one shared clock. Richer than the live game's two-pose toggle —
      // deliberately, since the point of the trial is to see the animation.
      image.setFrame(Math.floor(animFrame / CAR_SHEET.framesPerStep) % CAR_SHEET.frames);
      this.syncCarImage(image, enemy, wobble);
      return;
    }

    image.setScale(1, 1);
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
  const character = getSelectedChar();
  const skinIndex = character === 'dodo' ? getDodoSkin() : getGigiSkin();
  return playerTextureKey(character, skinIndex, PLAYER_POSES[frame]);
}
