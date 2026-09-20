import type { TileMap, Level } from '../data/levels';
import type { DifficultyRecord } from '../config/difficulty';

/**
 * Plain data, no methods, no Phaser. Everything in src/game/ operates on these so the
 * same code can run inside a Phaser scene and inside a Node VM next to the live game.
 */
export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  onGround: boolean;
  facing: 1 | -1;
  coyoteTime: number;
  jumpBuffer: number;
}

export interface EnemyState {
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  alive: boolean;
}

export interface World {
  level: Level;
  map: TileMap;
  dc: DifficultyRecord;
  player: PlayerState;
  enemies: EnemyState[];
  /** Frames since the level started. Everything here is frame-counted, not seconds. */
  frame: number;
  /**
   * Set once the player has fallen into a pit (index.html's `playerDie` -> `gameState
   * = 'dead'`). The live `update()` checks its own dead-state branch before it ever
   * reaches player movement, so once true, nothing about the player moves again this
   * run. `stepPlayer` reproduces that by returning immediately when this is set.
   */
  dead: boolean;
  /**
   * Simulation state, not presentation state. Enemies do not exist until the camera
   * reaches them (index.html:1358), so where the camera is decides when an enemy spawns
   * and therefore what an enemy trace looks like. The scene reads this to scroll; it
   * does not own it.
   */
  camera: { x: number; y: number };
  /** Enemy definitions not yet streamed in. Drained by the spawn window each step. */
  pending: PendingEnemy[];
}

export interface PendingEnemy {
  type: string;
  /** Tile column, from the level's enemyDefs. */
  x: number;
  spawned: boolean;
}

/** An axis-aligned box, as the live game's rectOverlap takes them. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
