import Phaser from 'phaser';
import { BASE_H, BASE_W, TILE } from '../config/constants';
import type { ParallaxLayer } from '../data/parallax';

/**
 * Phaser 4's Graphics has no quadratic-curve primitive — checked its typings:
 * moveTo/lineTo/arc/fillPoints/strokePoints, no `curveTo` of any kind — so the live
 * game's `quadraticCurveTo` chain (index.html:1044-1072) is approximated below with a
 * dense line path instead: each hill-to-hill segment is sampled at this many points
 * along its quadratic Bezier and joined with `lineTo`. 8 points per segment reads as
 * a curve, not a polyline, at this pixel scale; matching the canvas curve exactly was
 * not attempted.
 */
const CURVE_SAMPLES = 8;

interface Point {
  x: number;
  y: number;
}

function quadraticPoint(p0: Point, control: Point, p1: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * control.x + t * t * p1.x,
    y: mt * mt * p0.y + 2 * mt * t * control.y + t * t * p1.y,
  };
}

/**
 * Draws the sky gradient once: top stop is the level's own `bg`, bottom stop is the
 * parallax entry's `bg2` (index.html:1046-1050, `bg2||lvl.bg`). Never changes during a
 * level, unlike `drawRidges` below, so unlike that this is never called again after
 * `create()`.
 */
export function drawSky(graphics: Phaser.GameObjects.Graphics, levelBg: string, bg2: string): void {
  const top = Phaser.Display.Color.HexStringToColor(levelBg).color;
  const bottom = Phaser.Display.Color.HexStringToColor(bg2 || levelBg).color;
  graphics.clear();
  graphics.fillGradientStyle(top, top, bottom, bottom).fillRect(0, 0, BASE_W, BASE_H);
}

/**
 * Redraws every layer's ridge from the current camera position — port of
 * `drawParallax`'s layer loop (index.html:1053-1072). Called every frame: both the
 * ridge's scroll position and its per-point sine wobble depend on `cameraX`, which
 * moves every frame the player does, so unlike the sky above this cannot be drawn
 * once and left alone.
 *
 * Layers are drawn in array order, i.e. back to front (see `ParallaxLayer`'s own doc
 * comment), same as the live game's `pd.layers.forEach`.
 */
export function drawRidges(
  graphics: Phaser.GameObjects.Graphics,
  layers: readonly ParallaxLayer[],
  cameraX: number,
): void {
  graphics.clear();
  for (const layer of layers) drawRidge(graphics, layer, cameraX);
}

function drawRidge(graphics: Phaser.GameObjects.Graphics, layer: ParallaxLayer, cameraX: number): void {
  // The scroll offset carries a further 0.5 on top of the layer's own speed
  // (index.html:1061: `(scrollX*0.5)%hillW`) — `layer.speed` alone is not the
  // on-screen scroll rate.
  const scrollX = cameraX * layer.speed;
  const baseY = BASE_H * layer.y;
  const hillCount = layer.hills.length;
  const hillW = BASE_W / (hillCount - 1);
  const shift = (scrollX * 0.5) % hillW;

  // `i` runs 0..hillCount inclusive: the extra point at i===hillCount wraps back to
  // hills[0] (`i%hillCount`), closing the ridge so it tiles seamlessly as it scrolls.
  const peakAt = (i: number): Point => ({
    x: i * hillW - shift,
    y: baseY - layer.hills[i % hillCount] * BASE_H + Math.sin(i * 1.3 + scrollX * 0.002) * 8,
  });

  graphics.fillStyle(Phaser.Display.Color.HexStringToColor(layer.color).color);
  graphics.beginPath();
  // The live path opens with `ctx.moveTo(0,BASE_H)` right after `beginPath()`
  // (index.html:1057) — but the loop's very next step, i===0, immediately does
  // ANOTHER `moveTo`, which only relocates the pen. Two moveTo calls in a row draw
  // nothing, so that first one has no visual effect at all, and is skipped here.
  let prev = peakAt(0);
  graphics.moveTo(prev.x, prev.y);
  for (let i = 1; i <= hillCount; i++) {
    const cur = peakAt(i);
    // Control point: midway in x, 5px above (smaller y) whichever endpoint is
    // higher on screen (index.html:1066-1068).
    const control: Point = { x: (prev.x + cur.x) / 2, y: Math.min(prev.y, cur.y) - 5 };
    for (let s = 1; s <= CURVE_SAMPLES; s++) {
      const pt = quadraticPoint(prev, control, cur, s / CURVE_SAMPLES);
      graphics.lineTo(pt.x, pt.y);
    }
    prev = cur;
  }
  // Closes the ridge down to the bottom of the screen and back to its own start
  // (index.html:1071).
  graphics.lineTo(BASE_W + 50, BASE_H);
  graphics.lineTo(-50, BASE_H);
  graphics.closePath();
  graphics.fillPath();
}

/**
 * Port of the live game's cloud drift (index.html:1681): a slow 0.15x parallax
 * scroll plus independent sine drift on both axes, layered on top of the cloud's own
 * fixed tile position. Returned in the same raw, unzoomed pixel space `drawRidges`
 * above draws in — converting that into a Phaser position is SliceScene's job (see
 * its fixed-background-layer helpers), same as it is for the ridge's raw coordinates.
 */
export function cloudPosition(tx: number, ty: number, cameraX: number, animFrame: number): Point {
  return {
    x: tx * TILE - cameraX * 0.15 + Math.sin(animFrame * 0.003 + tx) * 10,
    y: ty * TILE + Math.sin(animFrame * 0.006 + ty) * 4,
  };
}

/** `cx%3?6:5` (index.html:1682): two-thirds of clouds draw at scale 6, the rest at 5. */
export function cloudScale(tx: number): number {
  return tx % 3 ? 6 : 5;
}
