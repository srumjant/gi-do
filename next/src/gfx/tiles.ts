import Phaser from 'phaser';
import { TILE } from '../config/constants';
import { isSolid, TILE_BRICK, TILE_GROUND, TILE_QUESTION, TILE_RAINBOW } from '../data/levels';
import type { BlockState, World } from '../game/types';

/**
 * Question and rainbow blocks (tiles 3 and 5) have no level-specific colour in the
 * level data, unlike ground and brick — these are fixed, matching the live game's own
 * hardcoded fills (index.html:1692-1693).
 */
export const QUESTION_FILL = 0xffcc00;
export const QUESTION_STROKE = 0xcc8800;
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
 * One question (tile 3) or rainbow (tile 5) block as the DRAWING side holds it: where
 * it is, the glyph sitting on it, and whether the picture has already turned it into a
 * plain brick. Level 0 has six question blocks and one rainbow block (its `addQBlocks`
 * and `addRainbowBlock` calls in data/levels.ts); every level has exactly one rainbow
 * block and its own number of question blocks. Nothing here assumes either count —
 * both lists are built by scanning the map for whatever it actually holds.
 *
 * `spent` is a COPY of the simulation's own `hit` flag (game/types.ts's BlockState),
 * not a reference to the block carrying it, and it has to be: `respawnLevel` (world.ts)
 * rebuilds both simulation lists from a freshly generated map, so a reference held here
 * would be pointing at a discarded object from the first death on. Keeping a copy is
 * also what tells `updateBumpedBlocks` below on which frames the picture changed, which
 * is the whole reason the bricks need not be repainted on all the other ones.
 */
export interface BlockView {
  readonly tx: number;
  readonly ty: number;
  /** The '?' or '!' drawn on the block, hidden for as long as the block is spent. */
  readonly glyph: Phaser.GameObjects.Text;
  spent: boolean;
}

/**
 * Draws every tile except the rainbow block's animated fill — ground, brick and
 * question, including the question block's '?' glyph — once into a single Graphics
 * object, and returns the question blocks it drew so `updateBumpedBlocks` below can
 * paint over the ones the player bumps. Nothing else it draws ever changes after the
 * level loads (unlike the rainbow block below), so unlike `updateRainbowBlocks` this is
 * called exactly once, in `create()`, and never touched again.
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
export function drawStaticTiles(scene: Phaser.Scene, world: World): BlockView[] {
  const graphics = scene.add.graphics();
  const { level, map } = world;
  const groundColor = Phaser.Display.Color.HexStringToColor(level.groundColor).color;
  const groundTopColor = Phaser.Display.Color.HexStringToColor(level.groundTop || '#2d8a2d').color;
  const brickColor = Phaser.Display.Color.HexStringToColor(level.brickColor).color;
  const questionBlocks: BlockView[] = [];

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
          drawBrick(graphics, dx, dy, brickColor);
          break;
        case TILE_QUESTION: {
          graphics.fillStyle(QUESTION_FILL).fillRect(dx, dy, TILE, TILE);
          graphics.lineStyle(1, QUESTION_STROKE).strokeRect(dx + 0.5, dy + 0.5, TILE - 1, TILE - 1);
          const glyph = scene.add.text(dx + TILE / 2, dy + TILE / 2, '?', QUESTION_FONT);
          glyph.setOrigin(0.5, 0.5);
          questionBlocks.push({ tx, ty, glyph, spent: false });
          break;
        }
        default:
          break;
      }
    }
  }
  return questionBlocks;
}

/**
 * One brick: fill, border and mortar (index.html:1691). Pulled out of the static pass
 * above because `updateBumpedBlocks` needs the very same brick — a block turned into
 * one by a bump has to be indistinguishable from a tile that was a brick all along,
 * and two copies of these five calls would sooner or later stop being one brick.
 */
export function drawBrick(
  graphics: Phaser.GameObjects.Graphics,
  dx: number,
  dy: number,
  brickColor: number,
): void {
  graphics.fillStyle(brickColor).fillRect(dx, dy, TILE, TILE);
  graphics.lineStyle(1, 0x000000, BRICK_BORDER_ALPHA)
    .strokeRect(dx + 0.5, dy + 0.5, TILE - 1, TILE - 1);
  graphics.fillStyle(0x000000, BRICK_MORTAR_ALPHA)
    .fillRect(dx + 7, dy, 1, TILE)
    .fillRect(dx, dy + 7, TILE, 1);
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
): { blocks: BlockView[]; graphics: Phaser.GameObjects.Graphics } {
  const graphics = scene.add.graphics();
  const blocks: BlockView[] = [];

  for (let ty = 0; ty < world.map.length; ty++) {
    const row = world.map[ty];
    for (let tx = 0; tx < row.length; tx++) {
      if (row[tx] !== TILE_RAINBOW) continue;
      const glyph = scene.add.text(tx * TILE + TILE / 2, ty * TILE + TILE / 2, '!', RAINBOW_FONT);
      glyph.setOrigin(0.5, 0.5);
      blocks.push({ tx, ty, glyph, spent: false });
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
 *
 * A spent block drops out of this pass entirely rather than being painted over
 * afterwards. The live game reaches its rainbow branch only for a cell that still
 * holds tile 5, and a bump rewrites the cell to 2 (player.ts's bumpBlocksAbove), so
 * from that frame on there is nothing here to draw. Leave it in and the cycling square
 * would go on repainting itself over the brick `updateBumpedBlocks` puts there, once a
 * frame, for the rest of the life.
 */
export function updateRainbowBlocks(
  graphics: Phaser.GameObjects.Graphics,
  blocks: readonly BlockView[],
  animFrame: number,
): void {
  graphics.clear();
  for (const { tx, ty, spent } of blocks) {
    if (spent) continue;
    const hueDegrees = (animFrame * 3 + tx * 20) % 360;
    const color = Phaser.Display.Color.HSLToColor(hueDegrees / 360, 1, 0.65).color;
    const dx = tx * TILE;
    const dy = ty * TILE;
    graphics.fillStyle(color).fillRect(dx, dy, TILE, TILE);
    graphics.lineStyle(1, RAINBOW_STROKE).strokeRect(dx + 0.5, dy + 0.5, TILE - 1, TILE - 1);
  }
}

/**
 * Turns the blocks the player has bumped from below into plain bricks, and turns them
 * back into blocks when a respawn restores them.
 *
 * Bumping a question or rainbow block sets its `hit` flag and rewrites its map cell to
 * tile 2 (player.ts's bumpBlocksAbove, index.html:1418-1420). The live game repaints
 * every visible tile every frame, so it just draws the new cell — a brick — from the
 * next frame on. This port draws the map ONCE (`drawStaticTiles` above), which is what
 * makes a 120x25 map affordable, so the change has to be applied by hand: the
 * `graphics` passed here is an overlay holding nothing but the bumped bricks, cleared
 * and redrawn only on the frames a block's `hit` disagrees with the view's own `spent`
 * copy of it — seven cells at most, a handful of times in a life, never per frame.
 *
 * That overlay has to be created AFTER the static tiles and the rainbow Graphics. All
 * three sit at depth 0, where Phaser draws in creation order, and the brick has to land
 * on top of the gold square the static pass already drew for a question block.
 *
 * Both directions matter, which is why the overlay is rebuilt from the spent blocks
 * rather than having one brick appended per bump: `respawnLevel` (world.ts) regenerates
 * the map and rebuilds both block lists from it, so every `hit` goes back to false and
 * every question and rainbow block has to look like itself again.
 */
export function updateBumpedBlocks(
  graphics: Phaser.GameObjects.Graphics,
  world: World,
  questionBlocks: readonly BlockView[],
  rainbowBlocks: readonly BlockView[],
): void {
  const questionChanged = syncSpent(questionBlocks, world.questionBlocks);
  const rainbowChanged = syncSpent(rainbowBlocks, world.rainbowBlocks);
  if (!questionChanged && !rainbowChanged) return;

  graphics.clear();
  const brickColor = Phaser.Display.Color.HexStringToColor(world.level.brickColor).color;
  drawSpentBricks(graphics, questionBlocks, brickColor);
  drawSpentBricks(graphics, rainbowBlocks, brickColor);
}

/**
 * Copies the simulation's `hit` flags onto one list of blocks, hides or shows each
 * block's glyph to match, and reports whether anything moved — the signal
 * `updateBumpedBlocks` repaints on.
 *
 * Blocks are paired by tile position rather than by list index. The two lists are built
 * by scanning the same map in the same order and so do line up today, but a respawn
 * replaces the simulation's list with a new one built from a new map, and the position
 * is the thing that genuinely identifies a block across that.
 */
function syncSpent(views: readonly BlockView[], states: readonly BlockState[]): boolean {
  let changed = false;
  for (const view of views) {
    const state = states.find((block) => block.x === view.tx && block.y === view.ty);
    const spent = state !== undefined && state.hit;
    if (spent === view.spent) continue;
    view.spent = spent;
    view.glyph.setVisible(!spent);
    changed = true;
  }
  return changed;
}

/** The bricks for whichever of these blocks are spent right now. */
function drawSpentBricks(
  graphics: Phaser.GameObjects.Graphics,
  blocks: readonly BlockView[],
  brickColor: number,
): void {
  for (const { tx, ty, spent } of blocks) {
    if (spent) drawBrick(graphics, tx * TILE, ty * TILE, brickColor);
  }
}
