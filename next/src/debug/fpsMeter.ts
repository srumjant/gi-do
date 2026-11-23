import Phaser from 'phaser';
import { getAudioContext } from '../audio/context';

/**
 * `?fps` on the address: a readout in the corner for checking the game on a slow device, such
 * as a TV's own browser (2026-11-23: "glitchy and slow, music plays delayed"). It shows
 * frames per second, whether the device draws with WebGL or falls back to the slower Canvas,
 * and how late the device itself plays sound (the audio context's own delays, which the game
 * cannot shorten). Phaser's own measures throughout: `game.loop.actualFps`, the renderer type.
 */
export function installFpsMeter(game: Phaser.Game): void {
  if (!new URLSearchParams(window.location.search).has('fps')) return;
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:4px;top:4px;z-index:9999;padding:2px 6px;'
    + 'font:bold 14px monospace;color:#7f7;background:rgba(0,0,0,0.6);pointer-events:none';
  document.body.appendChild(el);
  window.setInterval(() => {
    const renderer = game.renderer?.type === Phaser.WEBGL ? 'WEBGL' : 'CANVAS';
    const ctx = getAudioContext();
    const delay = ctx ? Math.round(((ctx.baseLatency ?? 0) + (ctx.outputLatency ?? 0)) * 1000) : null;
    el.textContent = `${Math.round(game.loop.actualFps)} FPS • ${renderer}`
      + (delay === null ? '' : ` • HELI ${delay} MS`);
  }, 500);
}
