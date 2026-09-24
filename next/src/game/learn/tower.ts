import { BASE_H, BASE_W, TILE } from '../../config/constants';
import { random } from '../random';
import type { TileFaces } from '../tiles';
import { GATES_PER_TOWER, type LearnMode, pickFrom, pickOptions, type Rand } from './content';

/** The tower's own tile codes. They are also the frame numbers of its tileset (gfx/learnTiles.ts). */
export const T_EMPTY = 0;
export const T_BRICK = 1;
export const T_STONE = 2;
export const T_PLANK = 3;
export const T_LETTER = 4;

/** Wood can be jumped up through; brick, stone and letter blocks cannot. */
export function towerTileFaces(code: number): TileFaces {
  if (code === T_PLANK) return 'top';
  if (code === T_BRICK || code === T_STONE || code === T_LETTER) return 'all';
  return 'none';
}

/** Columns inside the walls. */
export const INSIDE = 24;
/** Wall thickness, each side. */
export const WALL = 2;
export const MAP_COLS = INSIDE + 2 * WALL;
/** Every hop, in tiles. */
export const RISE = 3;
/** Letter floor to the underside of the letter ceiling. */
export const LETTER_ROOM = 5;
/** Letter ceiling thickness. */
export const CEILING = 2;
/** Rows of brick under the first storey. */
export const BASE_ROWS = 2;
/** Wall rows above the roof. */
export const BATTLEMENTS = 2;
/** Rows of sky above the roof. */
export const ROOF_SKY = 8;
/** The gap between consecutive planks, by storey. */
export const GAPS: readonly number[] = [2, 3, 4, 4];
/** Inside column the hero starts on, beside the tower's door. */
export const START_COL = 4;
/** How far in from either wall the star stands, in tiles. */
export const STAR_INSET = 3;

/** The tower's camera zoom: a one- or two-plank storey fits whole at this zoom. */
export const LEARN_ZOOM = 1.25;
/** The tower's view in world px. Not config/constants.ts's VIEW_W/VIEW_H: the adventure zooms 1.5. */
export const LEARN_VIEW_W = BASE_W / LEARN_ZOOM;
export const LEARN_VIEW_H = BASE_H / LEARN_ZOOM;
/** World px the 48px HUD covers at this zoom (48 / 1.25 = 38.4), rounded up. */
export const HUD_ROOM = 40;

/** A plank: `col` counts inside the walls, `row` is the map row whose top it stands on. */
export interface Plank {
  col: number;
  width: number;
  row: number;
}

/** A letter block set into a letter ceiling. `col` counts inside the walls, as a plank's does. */
export interface Block {
  col: number;
  width: number;
  letter: string;
  correct: boolean;
}

export interface Storey {
  /** The map row whose top is this storey's floor. */
  floorRow: number;
  planks: Plank[];
  letterFloorRow: number;
  /** The letter ceiling: its top row, then its bottom row. */
  ceilingRows: [number, number];
  blocks: Block[];
  target: string;
  /** Inside column the hero arrives on: the door for the first storey, the answer below for the rest. */
  arrivalCol: number;
}

export interface TowerLayout {
  mode: LearnMode;
  word: string | null;
  /** Rows top to bottom, MAP_COLS wide. Gate rules edit it as trapdoors open and shut. */
  map: number[][];
  rows: number;
  storeys: Storey[];
  /** The map row whose top is the roof. */
  roofRow: number;
  /** Feet on top of `row`, at inside column `col`. */
  start: { col: number; row: number };
  /** The star's inside column, standing on the top of `row`. */
  star: { col: number; row: number };
}

/**
 * The star's inside column (it is two tiles wide), STAR_INSET tiles in from the wall on the
 * far side of the roof from `arrivalCol`, where the last spring comes up. So the spring
 * lands you on the roof, clear of the star, and you walk to it, rather than springing
 * straight into it and ending the tower in mid-air.
 */
export function starCol(arrivalCol: number): number {
  return arrivalCol < INSIDE / 2 ? INSIDE - STAR_INSET - 2 : STAR_INSET;
}

/** A storey with `planks` planks, floor to ceiling top, in tiles. */
export function storeyHeight(planks: number): number {
  return RISE * (planks + 1) + LETTER_ROOM + CEILING;
}

/**
 * The plank lengths a storey may use: long (8 minus the gap), medium (7 minus) and short
 * (6 minus). The first storey leaves the short ones out. See the spec's hop rules for what
 * each length guarantees.
 */
export function plankLengths(storey: number): number[] {
  const gap = GAPS[storey];
  return storey === 0 ? [8 - gap, 7 - gap] : [8 - gap, 7 - gap, 6 - gap];
}

/** Where the letter blocks sit, inside the walls: 2 wide for letters, 3 wide for syllables. */
export function blockLayout(mode: LearnMode): { cols: number[]; width: number } {
  return mode === 'syllables' ? { cols: [2, 10, 18], width: 3 } : { cols: [3, 11, 19], width: 2 };
}

/** Plank counts per storey: the first 1 or 2; the others 1 to 5, with at least one 4 or 5. */
export function plankCounts(rand: Rand): number[] {
  const counts = [1 + Math.floor(rand() * 2)];
  for (let s = 1; s < GATES_PER_TOWER; s++) counts.push(1 + Math.floor(rand() * 5));
  if (!counts.slice(1).some((n) => n >= 4)) {
    counts[1 + Math.floor(rand() * (GATES_PER_TOWER - 1))] = 4 + Math.floor(rand() * 2);
  }
  return counts;
}

/**
 * One storey's planks, as inside columns and widths. The first starts 2 to 6 tiles to the
 * side of the arrival column, away from the nearer wall. Each next plank is the storey's gap
 * beyond the last one, carrying on in the same direction while it fits and turning back at
 * a wall. No plank can then overlap the one before it.
 *
 * Every plank fits without clamping. From any arrival column, a walk of at most 6 plus the
 * longest plank stops short of the far wall. A turn-back always has room: both ways are
 * blocked only if a plank, two gaps and two more planks need 26 columns or more, and with
 * these gaps and lengths they need at most 22.
 */
export function placePlanks(storey: number, count: number, arrivalCol: number, rand: Rand): Array<{ col: number; width: number }> {
  const lengths = plankLengths(storey);
  const gap = GAPS[storey];
  let dir = arrivalCol < INSIDE / 2 ? 1 : -1;
  const first = pickFrom(lengths, rand);
  const walk = 2 + Math.floor(rand() * 5);
  const firstCol = dir > 0 ? arrivalCol + walk : arrivalCol - walk - (first - 1);
  const planks = [{ col: firstCol, width: first }];
  for (let k = 1; k < count; k++) {
    const width = pickFrom(lengths, rand);
    const prev = planks[k - 1];
    const beside = (d: number): number => (d > 0 ? prev.col + prev.width + gap : prev.col - gap - width);
    let col = beside(dir);
    if (col < 0 || col > INSIDE - width) {
      dir = -dir;
      col = beside(dir);
    }
    planks.push({ col, width });
  }
  return planks;
}

/**
 * Builds one tower for four targets, bottom-up: the base, four storeys (planks, a letter
 * floor, a letter ceiling), the roof, and the walls. Heights are counted in tiles above the
 * base's top and turned into map rows at the end of the arithmetic, so the map's row 0 is
 * the sky above the roof.
 */
export function buildTower(
  mode: LearnMode,
  targets: readonly string[],
  word: string | null,
  rand: Rand = random,
): TowerLayout {
  const counts = plankCounts(rand);
  const roofHeight = counts.reduce((sum, n) => sum + storeyHeight(n), 0);
  const rows = ROOF_SKY + roofHeight + BASE_ROWS;
  const rowAt = (height: number): number => rows - BASE_ROWS - height;
  const map = Array.from({ length: rows }, () => new Array<number>(MAP_COLS).fill(T_EMPTY));
  const fill = (row: number, col: number, width: number, code: number): void => {
    for (let c = col; c < col + width; c++) map[row][c + WALL] = code;
  };

  for (let r = rows - BASE_ROWS; r < rows; r++) fill(r, 0, INSIDE, T_BRICK);

  const { cols: blockCols, width: blockWidth } = blockLayout(mode);
  const storeys: Storey[] = [];
  let floor = 0;
  let arrivalCol = START_COL;
  for (let s = 0; s < GATES_PER_TOWER; s++) {
    const planks = placePlanks(s, counts[s], arrivalCol, rand)
      .map((p, k) => ({ ...p, row: rowAt(floor + RISE * (k + 1)) }));
    for (const p of planks) fill(p.row, p.col, p.width, T_PLANK);

    const letterFloor = floor + RISE * (counts[s] + 1);
    const letterFloorRow = rowAt(letterFloor);
    fill(letterFloorRow, 0, INSIDE, T_PLANK);

    const ceilingRows: [number, number] = [
      rowAt(letterFloor + LETTER_ROOM + CEILING),
      rowAt(letterFloor + LETTER_ROOM + 1),
    ];
    const options = pickOptions(targets[s], mode, rand);
    const blocks = blockCols.map((col, i) => ({
      col, width: blockWidth, letter: options[i], correct: options[i] === targets[s],
    }));
    for (const row of ceilingRows) {
      fill(row, 0, INSIDE, T_BRICK);
      for (const b of blocks) fill(row, b.col, b.width, T_LETTER);
    }

    storeys.push({ floorRow: rowAt(floor), planks, letterFloorRow, ceilingRows, blocks, target: targets[s], arrivalCol });
    const answer = blocks.find((b) => b.correct) ?? blocks[0];
    arrivalCol = answer.col + Math.floor(answer.width / 2);
    floor += storeyHeight(counts[s]);
  }

  // Walls, from the base to BATTLEMENTS above the roof. The top row keeps only the inner
  // stones, which notches the wall tops.
  const wallTop = rowAt(floor + BATTLEMENTS);
  for (let r = wallTop; r < rows; r++) {
    map[r][1] = T_STONE;
    map[r][MAP_COLS - 2] = T_STONE;
    if (r > wallTop) {
      map[r][0] = T_STONE;
      map[r][MAP_COLS - 1] = T_STONE;
    }
  }

  const roofRow = rowAt(floor);
  return {
    mode, word, map, rows, storeys, roofRow,
    start: { col: START_COL, row: rows - BASE_ROWS },
    // After the loop, arrivalCol is where the last spring comes up onto the roof.
    star: { col: starCol(arrivalCol), row: roofRow },
  };
}

/** A rectangle in world px. */
export interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The camera bounds for storey `s`, or for the roof when `s` is past the last storey: from
 * the ceiling top (plus the room the HUD covers) down to one row below the floor. Always
 * the view's width, centred on the tower, so the camera never scrolls sideways.
 */
export function storeyView(layout: TowerLayout, s: number): ViewRect {
  const x = (MAP_COLS * TILE - LEARN_VIEW_W) / 2;
  if (s >= layout.storeys.length) {
    return { x, y: -HUD_ROOM, width: LEARN_VIEW_W, height: (layout.roofRow + 1) * TILE + HUD_ROOM };
  }
  const st = layout.storeys[s];
  const top = st.ceilingRows[0] * TILE - HUD_ROOM;
  const bottom = (st.floorRow + 1) * TILE;
  return { x, y: top, width: LEARN_VIEW_W, height: bottom - top };
}

/**
 * Where the camera's centre settles in a view, with the hero on its floor: a view that fits
 * is shown from its top (Phaser's clamp pins the top of short bounds); a taller one shows
 * its bottom, where the hero lands.
 */
export function settleCenter(view: ViewRect): { x: number; y: number } {
  return {
    x: view.x + view.width / 2,
    y: view.height <= LEARN_VIEW_H ? view.y + LEARN_VIEW_H / 2 : view.y + view.height - LEARN_VIEW_H / 2,
  };
}

/** The star's box in world px: two tiles square, standing on the roof. */
export function starBox(layout: TowerLayout): { x: number; y: number; w: number; h: number } {
  return {
    x: (layout.star.col + WALL) * TILE,
    y: (layout.star.row - 2) * TILE,
    w: 2 * TILE,
    h: 2 * TILE,
  };
}
