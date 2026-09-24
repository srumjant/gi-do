import type Phaser from 'phaser';
import { TILE } from '../config/constants';
import { T_BRICK, T_EMPTY, T_LETTER, T_PLANK, T_STONE } from '../game/learn/tower';

/** The tower's tileset: one 16px frame per tile code, frame 0 unused (Phaser's empty is -1). */
export const LEARN_TILES_KEY = 'learn-tiles';
const FRAMES = 5;

const BRICK = '#c07a44';
const STONE = '#a3a3ba';
const WOOD = '#b5773a';
const WOOD_LIGHT = '#d99a58';
const WOOD_DARK = '#7a4a20';
const GOLD = '#ffcc00';
const GOLD_EDGE = '#cc8800';

/**
 * Draws the tileset and the letter-block textures once, into canvases, and registers them
 * as textures. Idempotent: a restarted tower reuses them.
 */
export function registerLearnTiles(scene: Phaser.Scene): void {
  if (!scene.textures.exists(LEARN_TILES_KEY)) {
    scene.textures.addCanvas(LEARN_TILES_KEY, tilesetCanvas());
  }
  for (const width of [2, 3]) {
    const key = blockTextureKey(width);
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, blockCanvas(width));
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

function tilesetCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TILE * FRAMES;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  drawBrick(ctx, T_BRICK * TILE);
  drawStone(ctx, T_STONE * TILE);
  drawPlank(ctx, T_PLANK * TILE);
  // Under the block pictures (see blockCanvas); shows only if a picture is hidden.
  ctx.fillStyle = GOLD;
  ctx.fillRect(T_LETTER * TILE, 0, TILE, TILE);
  return canvas;
}

/** The adventure's brick (gfx/tiles.ts): fill, a darker lower-right edge, a mortar cross. */
function drawBrick(ctx: CanvasRenderingContext2D, x: number): void {
  ctx.fillStyle = BRICK;
  ctx.fillRect(x, 0, TILE, TILE);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(x, TILE - 1, TILE, 1);
  ctx.fillRect(x + TILE - 1, 0, 1, TILE);
  ctx.fillStyle = 'rgba(0,0,0,0.133)';
  ctx.fillRect(x + 7, 0, 1, TILE);
  ctx.fillRect(x, 7, TILE, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x, 0, TILE, 1);
}

/** Wall stone: two courses, offset joints, a lit top edge. */
function drawStone(ctx: CanvasRenderingContext2D, x: number): void {
  ctx.fillStyle = STONE;
  ctx.fillRect(x, 0, TILE, TILE);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(x, 7, TILE, 1);
  ctx.fillRect(x, 15, TILE, 1);
  ctx.fillRect(x + 7, 0, 1, 7);
  ctx.fillRect(x + 2, 8, 1, 7);
  ctx.fillRect(x + 12, 8, 1, 7);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x, 0, TILE, 1);
}

/**
 * A plank: a 7px board at the top of the tile and nothing below it, so it reads as thin —
 * something you can jump up through — next to the solid brick.
 */
function drawPlank(ctx: CanvasRenderingContext2D, x: number): void {
  ctx.fillStyle = WOOD;
  ctx.fillRect(x, 0, TILE, 7);
  ctx.fillStyle = WOOD_LIGHT;
  ctx.fillRect(x, 0, TILE, 2);
  ctx.fillStyle = WOOD_DARK;
  ctx.fillRect(x, 6, TILE, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x + 11, 2, 1, 4);
}

/** One letter block in the `?` block's gold, drawn whole so it reads as one block, not four. */
function blockCanvas(width: number): HTMLCanvasElement {
  const w = width * TILE;
  const h = 2 * TILE;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(2, 2, w - 4, 2);
  ctx.fillRect(2, 2, 2, h - 4);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(2, h - 4, w - 4, 2);
  ctx.fillRect(w - 4, 2, 2, h - 4);
  ctx.strokeStyle = GOLD_EDGE;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  return canvas;
}
