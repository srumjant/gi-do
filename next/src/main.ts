import Phaser from 'phaser';

// Authoring resolution. The Scale manager upscales; nothing is authored in device pixels.
export const BASE_W = 640;
export const BASE_H = 400;

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: BASE_W,
  height: BASE_H,
  backgroundColor: '#10131a',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [],
});
