import Phaser from 'phaser';
import { TILE } from '../config/constants';
import { isSolid, TILE_BRICK, TILE_GROUND, TILE_QUESTION, TILE_RAINBOW } from '../data/levels';
import type { World } from '../game/types';

/**
 * Question and rainbow blocks (tiles 3 and 5) have no level-specific colour in the
 * level data, unlike ground and brick — these are fixed, matching the live game's own
 * hardcoded fills (index.html:1692-1693).
 */
const QUESTION_FILL = 0xffcc00;
const QUESTION_STROKE = 0xcc8800;
const RAINBOW_STROKE = 0xffffff;

/**
 * `'#00000033'` / `'#00000022'` (index.html:1691) as Graphics alpha — Graphics takes
 * colour and alpha as separate arguments rather than an 8-digit hex string.
 */
const BRICK_BORDER_ALPHA = 0x33 / 0xff;
const BRICK_MORTAR_ALPHA = 0x22 / 0xff;

const GROUND_TOP_HEIGHT = 3;

const QUESTION_FONT = { fontFamily: 'monospace', fontSize: '10px', color: '#cc8800' };
const RAINBOW_FONT = { fontFamily: 'monospace', fontSize: '11px', fontStyle: 'bold', color: '#ffffff' };

/**
 * One rainbow-block tile position. Level 0 has exactly one (data/levels.ts's single
 * `addRainbowBlock` call for it), and every other level also has exactly one, but
 * nothing here assumes a fixed count — `createRainbowBlocks` below finds however many
 * the map actually has.
 */
export interface RainbowBlock {
  readonly tx: number;
  readonly ty: number;
}

/**
 * Draws every tile except the rainbow block's animated fill — ground, brick and
 * question, including the question block's '?' glyph — once into a single Graphics
 * object, and returns it. None of this ever changes after the level loads (unlike
 * the rainbow block below), so unlike `updateRainbowBlocks` this is called exactly
 * once, in `create()`, and never touched again.
 *
 * Port of the tile 1/2/3 branches of the live tile loop (index.html:1690-1692). Two
 * things are easy to miss porting this: the ground's top strip only draws where the
 * tile above is NOT solid — the grass edge, which is why a buried ground tile has no
 * green line through it — and the brick's `'#00000022'` fill is a 1px cross through
 * the tile's centre (mortar lines), not a border; the border is the `'#00000033'`
 * stroke drawn right before it.
 *
 * The glyph is a `Phaser.GameObjects.Text` per block rather than baked into a tile
 * texture — level 0 has only 6 of them, so a Text per glyph is the cheaper build here,
 * and it is centred on the tile rather than reproducing the canvas's baseline-relative
 * `fillText(dx+4, dy+12)` coordinate, which assumes canvas font metrics Phaser's text
 * renderer does not share.
 */
export function drawStaticTiles(scene: Phaser.Scene, world: World): Phaser.GameObjects.Graphics {
  const graphics = scene.add.graphics();
  const { level, map } = world;
  const groundColor = Phaser.Display.Color.HexStringToColor(level.groundColor).color;
  const groundTopColor = Phaser.Display.Color.HexStringToColor(level.groundTop || '#2d8a2d').color;
  const brickColor = Phaser.Display.Color.HexStringToColor(level.brickColor).color;

  for (let ty = 0; ty < map.length; ty++) {
    const row = map[ty];
    for (let tx = 0; tx < row.length; tx++) {
      const dx = tx * TILE;
      const dy = ty * TILE;
      switch (row[tx]) {
        case TILE_GROUND:
          graphics.fillStyle(groundColor).fillRect(dx, dy, TILE, TILE);
          if (ty > 0 && !isSolid(map[ty - 1][tx])) {
            graphics.fillStyle(groundTopColor).fillRect(dx, dy, TILE, GROUND_TOP_HEIGHT);
          }
          break;
        case TILE_BRICK:
          graphics.fillStyle(brickColor).fillRect(dx, dy, TILE, TILE);
          graphics.lineStyle(1, 0x000000, BRICK_BORDER_ALPHA)
            .strokeRect(dx + 0.5, dy + 0.5, TILE - 1, TILE - 1);
          graphics.fillStyle(0x000000, BRICK_MORTAR_ALPHA)
            .fillRect(dx + 7, dy, 1, TILE)
            .fillRect(dx, dy + 7, TILE, 1);
          break;
        case TILE_QUESTION:
          graphics.fillStyle(QUESTION_FILL).fillRect(dx, dy, TILE, TILE);
          graphics.lineStyle(1, QUESTION_STROKE).strokeRect(dx + 0.5, dy + 0.5, TILE - 1, TILE - 1);
          scene.add.text(dx + TILE / 2, dy + TILE / 2, '?', QUESTION_FONT).setOrigin(0.5, 0.5);
          break;
        default:
          break;
      }
    }
  }
  return graphics;
}

/**
 * Finds every rainbow-block tile in the map and creates its animated square (one
 * shared, initially empty Graphics — `updateRainbowBlocks` below draws into it every
 * frame) plus its static '!' glyph: one `Phaser.GameObjects.Text` per block, created
 * (and so layered) after the Graphics, so it always sits on top of the square
 * whatever colour that square animates to this frame.
 */
export function createRainbowBlocks(
  scene: Phaser.Scene,
  world: World,
): { blocks: RainbowBlock[]; graphics: Phaser.GameObjects.Graphics } {
  const graphics = scene.add.graphics();
  const blocks: RainbowBlock[] = [];

  for (let ty = 0; ty < world.map.length; ty++) {
    const row = world.map[ty];
    for (let tx = 0; tx < row.length; tx++) {
      if (row[tx] !== TILE_RAINBOW) continue;
      blocks.push({ tx, ty });
      scene.add
        .text(tx * TILE + TILE / 2, ty * TILE + TILE / 2, '!', RAINBOW_FONT)
        .setOrigin(0.5, 0.5);
    }
  }
  return { blocks, graphics };
}

/**
 * Redraws every rainbow block's fill and border for this frame. Unlike everything
 * `drawStaticTiles` draws, this cannot be drawn once and left alone: the hue cycles
 * with `animFrame` and is offset per column (index.html:1693:
 * `hsl(${(animFrame*3+tx*20)%360},100%,65%)`), so it is called every frame from the
 * scene's update loop. The '!' glyph text created above is untouched here — its
 * colour is always white, animated or not.
 */
export function updateRainbowBlocks(
  graphics: Phaser.GameObjects.Graphics,
  blocks: readonly RainbowBlock[],
  animFrame: number,
): void {
  graphics.clear();
  for (const { tx, ty } of blocks) {
    const hueDegrees = (animFrame * 3 + tx * 20) % 360;
    const color = Phaser.Display.Color.HSLToColor(hueDegrees / 360, 1, 0.65).color;
    const dx = tx * TILE;
    const dy = ty * TILE;
    graphics.fillStyle(color).fillRect(dx, dy, TILE, TILE);
    graphics.lineStyle(1, RAINBOW_STROKE).strokeRect(dx + 0.5, dy + 0.5, TILE - 1, TILE - 1);
  }
}
