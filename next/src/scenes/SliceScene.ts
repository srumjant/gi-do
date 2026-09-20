import Phaser from 'phaser';
import { BASE_H, BASE_W, STEP_MS, TILE, VIEW_H, VIEW_W, ZOOM } from '../config/constants';
import { TILE_BRICK, TILE_GROUND, TILE_QUESTION, TILE_RAINBOW } from '../data/levels';
import { getDodoSkin, getGigiSkin, getSelectedChar } from '../game/run';
import { createWorld, stepWorld } from '../game/world';
import type { EnemyState, World } from '../game/types';
import { enemyTextureKey, playerTextureKey, registerTextures } from '../gfx/textures';
import type { InputState } from '../input/actions';
import { createKeyboardInput, type KeyboardInput } from '../input/keyboard';

/**
 * Question and rainbow blocks (tiles 3 and 5) have no level-specific colour in the
 * level data, unlike ground and brick — these are fixed, readable placeholders.
 */
const QUESTION_COLOR = 0xffcc00;
const RAINBOW_COLOR = 0xff33cc;

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
 * The vertical slice: the first Phaser-facing code in this port, and the validation
 * gate for the whole migration. Driven by the pure simulation in src/game/ and drawn
 * with the kids' actual pixel art now that Plan 3 has a texture pipeline — still no
 * felt shading (deferred), no parallax yet, no HUD, no sound. It exists to answer one
 * question (does the port feel the same as the live game?), so every hour spent
 * making it prettier is an hour not spent on that.
 *
 * The scene is deliberately thin: build the tile map and the player image once in
 * `create()`, advance the simulation at a fixed rate in `update()`, and copy
 * simulation state onto Phaser objects in `syncSprites()`. It never mutates `world`
 * except by calling `stepWorld`, and it never drives the camera itself — Phaser's
 * camera is only ever told where the simulation's camera already is.
 */
export class SliceScene extends Phaser.Scene {
  private world!: World;
  private controls!: KeyboardInput;
  private playerImage!: Phaser.GameObjects.Image;
  private readonly enemyImages: Phaser.GameObjects.Image[] = [];
  private accumulator = 0;

  constructor() {
    super('Slice');
  }

  create(): void {
    this.world = createWorld(0, 'normal');

    registerTextures(this);

    this.drawTileMap(this.world);

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
    return this.add.image(enemy.x, enemy.y, enemyTextureKey(enemy.type)).setOrigin(0, 0);
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

  /**
   * Draws the level's tile grid once as filled rectangles into a single Graphics
   * object. Ground and brick use the level's own colours; question and rainbow blocks
   * have no level-specific colour in the data, so they get the fixed placeholders
   * above instead. Empty (0) and the unused code 4 draw nothing.
   */
  private drawTileMap(world: World): void {
    const graphics = this.add.graphics();
    const groundColor = Phaser.Display.Color.HexStringToColor(world.level.groundColor).color;
    const brickColor = Phaser.Display.Color.HexStringToColor(world.level.brickColor).color;

    for (let ty = 0; ty < world.map.length; ty++) {
      const row = world.map[ty];
      for (let tx = 0; tx < row.length; tx++) {
        const color = tileColor(row[tx], groundColor, brickColor);
        if (color === undefined) continue;
        graphics.fillStyle(color).fillRect(tx * TILE, ty * TILE, TILE, TILE);
      }
    }
  }
}

function tileColor(tile: number, groundColor: number, brickColor: number): number | undefined {
  switch (tile) {
    case TILE_GROUND: return groundColor;
    case TILE_BRICK: return brickColor;
    case TILE_QUESTION: return QUESTION_COLOR;
    case TILE_RAINBOW: return RAINBOW_COLOR;
    default: return undefined;
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
