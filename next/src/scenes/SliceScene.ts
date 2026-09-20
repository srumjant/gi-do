import Phaser from 'phaser';
import { STEP_MS, TILE, ZOOM } from '../config/constants';
import { TILE_BRICK, TILE_GROUND, TILE_QUESTION, TILE_RAINBOW } from '../data/levels';
import { createWorld, stepWorld } from '../game/world';
import type { EnemyState, World } from '../game/types';
import type { InputState } from '../input/actions';
import { createKeyboardInput, type KeyboardInput } from '../input/keyboard';

/**
 * Question and rainbow blocks (tiles 3 and 5) have no level-specific colour in the
 * level data, unlike ground and brick — these are fixed, readable placeholders.
 */
const QUESTION_COLOR = 0xffcc00;
const RAINBOW_COLOR = 0xff33cc;

/** Flat placeholder colours standing in for the player and enemy sprites. */
const PLAYER_COLOR = 0xffffff;
const ENEMY_COLOR = 0xff0000;

/**
 * The vertical slice: the first Phaser-facing code in this port, and the validation
 * gate for the whole migration. Coloured rectangles driven by the pure simulation in
 * src/game/ — no sprites, no felt, no parallax, no HUD, no sound. It exists to answer
 * one question (does the port feel the same as the live game?), so every hour spent
 * making it prettier is an hour not spent on that.
 *
 * The scene is deliberately thin: build the tile map and the player rectangle once in
 * `create()`, advance the simulation at a fixed rate in `update()`, and copy
 * simulation state onto Phaser objects in `syncSprites()`. It never mutates `world`
 * except by calling `stepWorld`, and it never drives the camera itself — Phaser's
 * camera is only ever told where the simulation's camera already is.
 */
export class SliceScene extends Phaser.Scene {
  private world!: World;
  private controls!: KeyboardInput;
  private playerRect!: Phaser.GameObjects.Rectangle;
  private readonly enemyRects: Phaser.GameObjects.Rectangle[] = [];
  private accumulator = 0;

  constructor() {
    super('Slice');
  }

  create(): void {
    this.world = createWorld(0, 'normal');

    this.drawTileMap(this.world);

    this.playerRect = this.add
      .rectangle(
        this.world.player.x,
        this.world.player.y,
        this.world.player.w,
        this.world.player.h,
        PLAYER_COLOR,
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
   * Copies simulation state onto the rectangles, and tells Phaser's camera where the
   * simulation's camera already is. `world.camera` is simulation state — enemy
   * spawning reads it, and it is compared frame by frame against the live game in the
   * test suite — so this scene follows it rather than driving it: no `startFollow`,
   * ever. Two cameras with different following behaviour would silently disagree, and
   * the one the tests check would not be the one on screen.
   *
   * `Math.round` matches the live game, which rounds only at draw time
   * (index.html:1686) while keeping the camera sub-pixel in logic.
   */
  private syncSprites(): void {
    const { player, enemies, camera } = this.world;

    this.playerRect.x = player.x;
    this.playerRect.y = player.y;

    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      const rect = this.enemyRects[i] ?? this.createEnemyRect(enemy);
      this.enemyRects[i] = rect;
      rect.x = enemy.x;
      rect.y = enemy.y;
      rect.visible = enemy.alive;
    }

    this.cameras.main.setScroll(Math.round(camera.x), Math.round(camera.y));
  }

  /**
   * `world.enemies` starts empty and grows as the camera streams the level in — three
   * enemies already exist after the very first simulation step (doll@15, doll@28 and
   * car@40 all fall inside the 640px-wide spawn window at camera x=0), and more stream
   * in later. Rectangles are created lazily, one per new array slot, rather than
   * assuming any fixed count up front.
   */
  private createEnemyRect(enemy: EnemyState): Phaser.GameObjects.Rectangle {
    return this.add
      .rectangle(enemy.x, enemy.y, enemy.w, enemy.h, ENEMY_COLOR)
      .setOrigin(0, 0);
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
