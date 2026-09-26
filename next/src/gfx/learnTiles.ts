import type Phaser from 'phaser';
import { TILE } from '../config/constants';
import { T_BRICK, T_EMPTY, T_LETTER, T_PLANK, T_STONE } from '../game/learn/tower';
import { drawBrick, QUESTION_FILL, QUESTION_STROKE } from './tiles';

/** The tower's tileset: one 16px frame per tile code, frame 0 unused (Phaser's empty is -1). */
export const LEARN_TILES_TEXTURE = 'learn-tiles';
/** A frame per tile code, T_EMPTY's included, so a code is its own frame number. */
const FRAMES = T_LETTER + 1;

/** The first world's brick (data/levels.ts, Doll Garden): the tower is built of the adventure's own. */
const BRICK = 0xcc8844;
const STONE = 0xa3a3ba;
const WOOD = 0xb5773a;
const WOOD_LIGHT = 0xd99a58;
const WOOD_DARK = 0x7a4a20;

/**
 * Bakes the tileset and the letter-block pictures into textures, once. Idempotent: a restarted
 * tower reuses them.
 */
export function registerLearnTiles(scene: Phaser.Scene): void {
  bake(scene, LEARN_TILES_TEXTURE, TILE * FRAMES, TILE, (g) => {
    drawBrick(g, T_BRICK * TILE, 0, BRICK);
    drawStone(g, T_STONE * TILE);
    drawPlank(g, T_PLANK * TILE);
    // Under the block pictures (see drawBlock); shows only if a picture is hidden.
    g.fillStyle(QUESTION_FILL).fillRect(T_LETTER * TILE, 0, TILE, TILE);
  });
  for (const width of [2, 3]) {
    bake(scene, blockTextureKey(width), width * TILE, 2 * TILE, (g) => drawBlock(g, width));
  }
}

/** A letter block's picture, `width` tiles wide and the ceiling's two tiles tall. */
export function blockTextureKey(width: number): string {
  return `learn-block-${width}`;
}

/** The tower's map in Phaser's terms: empty is -1 there, because 0 is a real tile index. */
export function toPhaserData(map: readonly number[][]): number[][] {
  return map.map((row) => row.map((code) => (code === T_EMPTY ? -1 : code)));
}

/**
 * Draws into a throwaway Graphics and bakes it into a texture. The guard is not only for the
 * console: generateTexture draws OVER a texture that already has the key, without clearing
 * it, so a second bake would darken every translucent edge.
 */
function bake(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({}, false);
  draw(g);
  g.generateTexture(key, width, height);
  g.destroy();
}

/** Wall stone: two courses, offset joints, a lit top edge. */
function drawStone(g: Phaser.GameObjects.Graphics, x: number): void {
  g.fillStyle(STONE).fillRect(x, 0, TILE, TILE);
  g.fillStyle(0x000000, 0.2)
    .fillRect(x, 7, TILE, 1)
    .fillRect(x, 15, TILE, 1)
    .fillRect(x + 7, 0, 1, 7)
    .fillRect(x + 2, 8, 1, 7)
    .fillRect(x + 12, 8, 1, 7);
  g.fillStyle(0xffffff, 0.14).fillRect(x, 0, TILE, 1);
}

/**
 * A plank: a 7px board at the top of the tile and nothing below it, so it reads as thin —
 * something you can jump up through — next to the solid brick.
 */
function drawPlank(g: Phaser.GameObjects.Graphics, x: number): void {
  g.fillStyle(WOOD).fillRect(x, 0, TILE, 7);
  g.fillStyle(WOOD_LIGHT).fillRect(x, 0, TILE, 2);
  g.fillStyle(WOOD_DARK).fillRect(x, 6, TILE, 1);
  g.fillStyle(0x000000, 0.25).fillRect(x + 11, 2, 1, 4);
}

/** One letter block in the `?` block's own gold and edge, drawn whole so it reads as one block, not four. */
function drawBlock(g: Phaser.GameObjects.Graphics, width: number): void {
  const w = width * TILE;
  const h = 2 * TILE;
  g.fillStyle(QUESTION_FILL).fillRect(0, 0, w, h);
  g.fillStyle(0xffffff, 0.35).fillRect(2, 2, w - 4, 2).fillRect(2, 2, 2, h - 4);
  g.fillStyle(0x000000, 0.15).fillRect(2, h - 4, w - 4, 2).fillRect(w - 4, 2, 2, h - 4);
  g.lineStyle(2, QUESTION_STROKE).strokeRect(1, 1, w - 2, h - 2);
}
