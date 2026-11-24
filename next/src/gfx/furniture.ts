import Phaser from 'phaser';
import { TILE } from '../config/constants';
import type { Furniture, FurnitureKind, Level } from '../data/levels';
import { BATHTUB_TEXTURE, spriteScale, TOILET_TEXTURE } from './textures';

/**
 * The home world's furniture (docs/superpowers/specs/2026-11-24-home-world-design.md): a
 * picture per piece, over the level's tiles (depth 0, the course's at 1) and under anything
 * that moves. Each is drawn once into a texture per kind and size; the toilet and the bathtub are
 * Härra Kaka's bathroom's, at their own size.
 */
export const DEPTH_FURNITURE = 2;

const WOOD = 0xa8714a;
const WOOD_DARK = 0x7a4a2a;
const WHITE = 0xf4f4f8;
const SHADE = 0xc8ccd8;
const LINE = 0x7a8090;
const TOY_COLOURS = [0xff5a5a, 0x5ab0ff, 0xffd23f, 0x6ad06a, 0xc07aff];

type Draw = (g: Phaser.GameObjects.Graphics, W: number, H: number, w: number, h: number) => void;

const DRAW: Record<Exclude<FurnitureKind, 'toilet' | 'bathtub'>, Draw> = {
  // A headboard at the left, the mattress's top level with the top of the bottom row (the
  // springs under it), a blue blanket, a pillow, a low footboard.
  bed: (g, W, H) => {
    const top = H - TILE;
    g.fillStyle(WOOD_DARK).fillRect(0, 0, 8, H);
    g.fillStyle(WOOD).fillRect(2, 2, 4, H - 4);
    g.fillStyle(WOOD_DARK).fillRect(W - 6, top - 6, 6, H - top + 6);
    g.fillStyle(WHITE).fillRect(8, top, W - 14, 5);
    g.fillStyle(0x5b8fe0).fillRect(22, top, W - 28, 6);
    g.fillStyle(0x8fb8ff).fillRect(22, top, W - 28, 1);
    g.fillStyle(WOOD_DARK).fillRect(8, top + 6, W - 14, 6);
    // The dark under the bed, so the springs it stands on do not show between its legs.
    g.fillStyle(0x3a2a1a).fillRect(8, top + 12, W - 14, 4);
    g.fillStyle(0x5a3a22).fillRect(10, H - 4, 3, 4).fillRect(W - 10, H - 4, 3, 4);
    g.fillStyle(0xfff6e0).fillRoundedRect(10, top - 6, 12, 7, 3);
  },
  // A morning sky with the sun in it, white bars, pink curtains.
  window: (g, W, H) => {
    g.fillStyle(0xffffff).fillRect(0, 0, W, H);
    g.fillStyle(0x9fd8ff).fillRect(3, 3, W - 6, H - 6);
    g.fillStyle(0xffe14a).fillCircle(W * 0.68, H * 0.38, Math.min(W, H) * 0.16);
    g.fillStyle(0xffffff).fillRect(W / 2 - 1, 0, 2, H).fillRect(0, H / 2 - 1, W, 2);
    g.fillStyle(0xff8fb0).fillRect(0, 0, 5, H).fillRect(W - 5, 0, 5, H);
  },
  // An open door into the next room.
  door: (g, W, H) => {
    g.fillStyle(0xffffff).fillRect(0, 0, W, H);
    g.fillStyle(0x5a3a22).fillRect(3, 3, W - 6, H - 3);
    g.fillStyle(WOOD).fillRect(3, 3, 7, H - 3);
    g.fillStyle(0xffd23f).fillCircle(8, H / 2, 1.5);
  },
  // Toy blocks, a tile each, in turn red, blue, yellow, green, purple, a white square on each.
  toyBlocks: (g, _W, _H, w, h) => {
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const c = TOY_COLOURS[(tx + ty * 2) % TOY_COLOURS.length];
        const x = tx * TILE;
        const y = ty * TILE;
        g.fillStyle(c).fillRect(x, y, TILE, TILE);
        g.fillStyle(0xffffff, 0.35).fillRect(x, y, TILE, 2).fillRect(x, y, 2, TILE);
        g.fillStyle(0x000000, 0.2).fillRect(x, y + TILE - 2, TILE, 2).fillRect(x + TILE - 2, y, 2, TILE);
        g.fillStyle(0xffffff).fillRect(x + 5, y + 5, 6, 6);
        g.fillStyle(c).fillRect(x + 7, y + 7, 2, 2);
      }
    }
  },
  // A green box step with a handle hole.
  stool: (g, W, H) => {
    g.fillStyle(0x6ad06a).fillRect(0, 0, W, H);
    g.fillStyle(0x9ff09f).fillRect(0, 0, W, 3);
    g.fillStyle(0x3a9a3a).fillRect(0, H - 3, W, 3);
    g.fillStyle(0x3a9a3a).fillRoundedRect(W / 2 - 6, H / 2 - 2, 12, 5, 2);
  },
  // White cupboards under the counter's top, a door every two tiles.
  counter: (g, W, H) => {
    g.fillStyle(WHITE).fillRect(0, 0, W, H);
    g.fillStyle(SHADE).fillRect(0, H - 3, W, 3);
    for (let x = 0; x + 2 * TILE <= W; x += 2 * TILE) {
      g.lineStyle(1, LINE).strokeRect(x + 2, 3, 2 * TILE - 4, H - 8);
      g.fillStyle(LINE).fillRect(x + TILE - 1, H / 2 - 3, 2, 6);
    }
  },
  // A long mirror with a silver edge and a few shines.
  mirror: (g, W, H) => {
    g.fillStyle(SHADE).fillRect(0, 0, W, H);
    g.fillStyle(0xcfefff).fillRect(2, 2, W - 4, H - 4);
    g.lineStyle(2, 0xffffff, 0.7);
    for (let x = 12; x < W - 14; x += 44) g.lineBetween(x, H - 5, x + 10, 5);
  },
  // A white basin on the counter.
  basin: (g, W, H) => {
    g.fillStyle(WHITE).fillRoundedRect(1, H - 10, W - 2, 10, { tl: 2, tr: 2, bl: 6, br: 6 });
    g.fillStyle(SHADE).fillRect(4, H - 9, W - 8, 2);
  },
  // One big red rubber boot, mud on it: its leg at the left, its foot along the bottom, on a
  // muddy doormat that fills the rest, so the blocks it stands for do not show.
  boots: (g, W, H) => {
    g.fillStyle(0x6a4a2a).fillRoundedRect(0, 0, W, H, 2);
    g.fillStyle(0x5a3a22);
    for (let y = 3; y < H; y += 4) g.fillRect(1, y, W - 2, 1);
    const leg = Math.max(8, Math.round(W * 0.55));
    g.fillStyle(0xd83a3a).fillRect(1, 0, leg, H - 2).fillRoundedRect(1, H - 10, W - 2, 8, { tl: 0, tr: 4, bl: 0, br: 2 });
    g.fillStyle(0x3a2a1a).fillRect(1, H - 3, W - 2, 3);
    g.fillStyle(0xff7a7a).fillRect(3, 2, 2, H - 8);
    g.fillStyle(0x7a5230).fillCircle(W * 0.3, H - 6, 2.5).fillCircle(W * 0.7, H - 5, 2).fillCircle(leg * 0.5, H * 0.45, 2);
  },
  // A wicker laundry basket, clothes heaped in it.
  basket: (g, W, H) => {
    g.fillStyle(0xff8fb0).fillCircle(W * 0.3, 7, 6);
    g.fillStyle(0x5ab0ff).fillCircle(W * 0.6, 6, 6);
    g.fillStyle(0xffd23f).fillCircle(W * 0.8, 8, 4);
    g.fillStyle(0xc8935a).fillRoundedRect(2, 8, W - 4, H - 8, { tl: 2, tr: 2, bl: 5, br: 5 });
    g.fillStyle(0x8a5a3a);
    for (let y = 12; y < H - 2; y += 5) g.fillRect(4, y, W - 8, 1);
  },
  // Machines three tiles high stacked from the floor (a washer, a dryer on it), laundry on top.
  washer: (g, W, H) => {
    const unit = 3 * TILE;
    const n = Math.floor(H / unit);
    const pile = H - n * unit;
    for (let i = 0; i < n; i++) {
      const y = pile + i * unit;
      g.fillStyle(WHITE).fillRect(0, y, W, unit);
      g.lineStyle(1, LINE).strokeRect(0.5, y + 0.5, W - 1, unit - 1);
      g.fillStyle(SHADE).fillRect(2, y + 2, W - 4, 7);
      g.fillStyle(0x5ab0ff).fillCircle(W - 8, y + 5.5, 2);
      g.fillStyle(LINE).fillCircle(W / 2, y + 28, 15);
      g.fillStyle(0x9fd8ff).fillCircle(W / 2, y + 28, 12);
      g.fillStyle(0xffffff, 0.7).fillEllipse(W / 2 - 4, y + 23, 6, 4);
    }
    if (pile > 0) {
      // A basket of laundry on top, over the whole of the blocks it stands for.
      g.fillStyle(0xc8935a).fillRect(0, 0, W, pile);
      g.fillStyle(0x8a5a3a);
      for (let y = 3; y < pile; y += 4) g.fillRect(1, y, W - 2, 1);
      g.fillStyle(0xff8fb0).fillCircle(W * 0.3, pile - 5, Math.min(7, pile));
      g.fillStyle(0x6ad06a).fillCircle(W * 0.55, pile - 6, Math.min(8, pile));
      g.fillStyle(0xffd23f).fillCircle(W * 0.78, pile - 4, Math.min(6, pile));
    }
  },
  // A wooden shelf (its bottom row is the blocks to stand on), brackets, bottles along it.
  shelf: (g, W, H) => {
    const top = H - TILE;
    // The whole of the blocks' row, so none of them shows: a thick plank, its shadowed underside.
    g.fillStyle(WOOD).fillRect(0, top, W, TILE);
    g.fillStyle(0xc98f5e).fillRect(0, top, W, 2);
    g.fillStyle(WOOD_DARK).fillRect(0, top + TILE - 4, W, 4);
    for (let x = 8; x < W; x += 48) g.fillStyle(0x5a3a22).fillTriangle(x, top + 8, x + 8, top + 12, x, top + 16);
    const colours = [0xff8fb0, 0x6ad06a, 0x5ab0ff, 0xffd23f, 0xc07aff];
    for (let i = 0, x = 10; x + 8 < W && top >= 12; i++, x += 26) {
      const h = 9 + (i % 3) * 2;
      g.fillStyle(colours[i % colours.length]).fillRoundedRect(x, top - h, 8, h, 2);
      g.fillStyle(0xffffff).fillRect(x + 2, top - h - 3, 4, 3);
    }
  },
  // A towel on a rail.
  towel: (g, W, H) => {
    g.fillStyle(LINE).fillRect(0, 2, W, 3);
    g.fillStyle(0xff8fb0).fillRect(3, 5, W - 6, H - 6);
    g.fillStyle(0xffffff).fillRect(3, H - 8, W - 6, 2).fillRect(3, H - 4, W - 6, 1);
  },
  // The evening: a dark blue sky, the moon, stars, curtains.
  nightWindow: (g, W, H) => {
    g.fillStyle(0xffffff).fillRect(0, 0, W, H);
    g.fillStyle(0x1f2a5a).fillRect(3, 3, W - 6, H - 6);
    g.fillStyle(0xfff3b0).fillCircle(W * 0.66, H * 0.36, Math.min(W, H) * 0.14);
    g.fillStyle(0x1f2a5a).fillCircle(W * 0.66 + 4, H * 0.36 - 2, Math.min(W, H) * 0.12);
    g.fillStyle(0xffffff).fillRect(W * 0.25, H * 0.3, 2, 2).fillRect(W * 0.4, H * 0.68, 2, 2).fillRect(W * 0.78, H * 0.75, 1, 1);
    g.fillStyle(0xffffff).fillRect(W / 2 - 1, 0, 2, H).fillRect(0, H / 2 - 1, W, 2);
    g.fillStyle(0x8f7ad0).fillRect(0, 0, 5, H).fillRect(W - 5, 0, 5, H);
  },
  // An end of the bathtub, over the blocks of its rim: white enamel, a blue line along the top.
  tubEnd: (g, W, H) => {
    g.fillStyle(0xf4f4f8).fillRoundedRect(0, 0, W, H, { tl: 6, tr: 6, bl: 2, br: 2 });
    g.fillStyle(0x7ec8f0).fillRect(2, 2, W - 4, 2);
    g.fillStyle(0xc8ccd8).fillRect(0, H - 4, W, 4);
    g.fillStyle(0xd4a83a).fillRect(W / 2 - 3, H - 3, 6, 3);
  },
};

function textureFor(scene: Phaser.Scene, f: Furniture): string {
  if (f.kind === 'toilet') return TOILET_TEXTURE;
  if (f.kind === 'bathtub') return BATHTUB_TEXTURE;
  const key = `furniture-${f.kind}-${f.w}x${f.h}`;
  if (scene.textures.exists(key)) return key;
  const W = f.w * TILE;
  const H = f.h * TILE;
  const g = scene.make.graphics({}, false);
  DRAW[f.kind](g, W, H, f.w, f.h);
  g.generateTexture(key, W, H);
  g.destroy();
  return key;
}

/** Every piece of the level's furniture, standing on its bottom row. Static: drawn once. */
export function drawFurniture(scene: Phaser.Scene, level: Level): Phaser.GameObjects.Image[] {
  return (level.furniture ?? []).map((f) => {
    const image = scene.add
      .image(f.x * TILE, (f.y + 1) * TILE, textureFor(scene, f))
      .setOrigin(0, 1)
      .setDepth(DEPTH_FURNITURE);
    // The toilet and the bathtub are palette sprites, baked at the render scale.
    if (f.kind === 'toilet' || f.kind === 'bathtub') image.setScale(spriteScale(image));
    return image;
  });
}
