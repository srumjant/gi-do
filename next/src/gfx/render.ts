import type Phaser from 'phaser';
import { BASE_H, BASE_W } from '../config/constants';

/**
 * How many canvas pixels draw one layout pixel.
 *
 * Everything is laid out in BASE_W x BASE_H, as the live game's canvas is. Drawn into a canvas
 * that size, the browser then blows the whole picture up to fill the window, and text comes out
 * as a few blocky pixels per letter. So the canvas is RENDER_SCALE times bigger and every
 * camera zooms by the same factor: the layout does not move, and text and drawn shapes get as
 * many real pixels as the screen can show. Pixel art stays crisp at any scale (`pixelArt`).
 *
 * Twice the layout on an ordinary screen, and about the screen's own density on a sharper one:
 * four times on a Mac's 2x display. Capped at four, where a canvas already outgrows most
 * windows.
 */
export const RENDER_SCALE = Math.min(4, Math.max(2, Math.ceil(2 * (globalThis.devicePixelRatio ?? 1))));

/**
 * A screen-space scene's camera, fitted to the bigger canvas: zoomed by RENDER_SCALE and
 * centred on the layout, so it shows exactly BASE_W x BASE_H of it. Every scene that is not a
 * scrolling world calls this in `create()`.
 */
export function fitScreenCamera(scene: Phaser.Scene): void {
  scene.cameras.main.setZoom(RENDER_SCALE).centerOn(BASE_W / 2, BASE_H / 2);
}
