import type { Palette, SpriteData } from '../data/sprites';

/**
 * Every palette colour passes through here before it becomes a cell. For now it is
 * the identity — flat colour only, no felt — but this is the seam the felt shader
 * hooks into once it lands: the live game's `FC(hex)` (index.html:553) sits in
 * exactly this spot, felt-shifting the colour when STYLE_FELT is on and passing it
 * through untouched otherwise (felt is deferred for this plan). Routing every
 * colour through one function now means wiring up felt later touches this one line,
 * not every call site that paints a sprite.
 */
export const colorOf = (hex: string): string => hex;

/** One filled square, in device pixels (`scale` already applied), ready for a
 * canvas 2D context's `fillRect`. */
export interface SpriteCell {
  x: number;
  y: number;
  size: number;
  color: string;
}

/**
 * The pixel grid a sprite rasterises to, without a canvas: overall size plus the
 * non-transparent cells to paint. Pure, so this is what rasterise.test.ts exercises
 * directly; `rasterise` below is a thin, untested wrapper that paints one of these
 * onto a real canvas.
 */
export interface SpritePlan {
  width: number;
  height: number;
  cells: SpriteCell[];
}

/**
 * Port of the flat-style half of the live game's `getCachedSprite`
 * (index.html:621-654): one cell per non-zero grid value, at `(col*scale,
 * row*scale)`, `scale` square, coloured by `colorOf(palette[value])` — everything
 * `getCachedSprite` does when `STYLE_FELT` is off, minus the bevel/grain/shadow
 * passes that only run when it is on, and minus the flip: the live cache bakes the
 * flip into its key, doubling the texture count for every sprite that ever faces
 * left, where Phaser's `setFlipX` mirrors a texture on the GPU for free. There is
 * exactly one plan per (sprite, palette, scale) here — never a left- and a
 * right-facing copy.
 *
 * A grid value of 0 is transparent and produces no cell — the live game's
 * `if(!v)continue`. A grid value with no matching palette entry resolves to
 * `colorOf(undefined)` (`undefined`, while colorOf stays the identity) rather than
 * throwing, the same as the live game silently painting with `fillStyle=undefined`
 * — a bad sprite is a data problem for whoever authored it, not a reason to crash
 * the render.
 */
export function planSprite(sprite: SpriteData, palette: Palette, scale: number): SpritePlan {
  const rows = sprite.length;
  const cols = sprite[0].length;
  const cells: SpriteCell[] = [];
  for (let r = 0; r < rows; r++) {
    const row = sprite[r];
    for (let c = 0; c < cols; c++) {
      const value = row[c];
      if (!value) continue;
      cells.push({ x: c * scale, y: r * scale, size: scale, color: colorOf(palette[value]) });
    }
  }
  return { width: cols * scale, height: rows * scale, cells };
}

/**
 * Paints a `planSprite` plan onto a fresh canvas. The only impure part of this
 * module, and the reason the whole file needs a browser: `document.createElement`
 * does not exist under Vitest's `node` test environment. Not unit tested for that
 * reason — `planSprite` above carries the logic worth testing; this is a thin,
 * mechanical wrapper around it. See rasterise.test.ts.
 */
export function rasterise(sprite: SpriteData, palette: Palette, scale: number): HTMLCanvasElement {
  const plan = planSprite(sprite, palette, scale);
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    for (const cell of plan.cells) {
      ctx.fillStyle = cell.color;
      ctx.fillRect(cell.x, cell.y, cell.size, cell.size);
    }
  }
  return canvas;
}
