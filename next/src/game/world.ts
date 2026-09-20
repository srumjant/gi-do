import { TILE, VIEW_H, VIEW_W } from '../config/constants';
import { DIFFICULTY_CONFIG, type DifficultyKey } from '../config/difficulty';
import { LEVELS } from '../data/levels';
import type { InputState } from '../input/actions';
import { createPlayer, stepPlayer, type Character } from './player';
import type { World } from './types';

/**
 * Port of the state built by `initLevel` (index.html, around the level-generation
 * block) that this port actually simulates: the map, the player, and the pending
 * enemy queue. `camera` starts at the origin exactly as the live `camera={x:0,y:0}`
 * does; `pending` mirrors the live `pendingEnemies` array (level.enemyDefs, each with
 * a `spawned` flag that starts false).
 */
export function createWorld(
  levelIndex: number,
  difficulty: DifficultyKey,
  character: Character = 'gigi',
): World {
  const level = LEVELS[levelIndex];
  const dc = DIFFICULTY_CONFIG[difficulty];
  return {
    level,
    map: level.generate(dc),
    dc,
    player: createPlayer(level, character),
    enemies: [],
    frame: 0,
    dead: false,
    camera: { x: 0, y: 0 },
    pending: level.enemyDefs.map((d) => ({ type: d.type, x: d.x, spawned: false })),
  };
}

/**
 * One simulation tick, called at exactly STEP_HZ regardless of display refresh.
 *
 * The order is the live game's and it matters. The spawn window runs FIRST, against the
 * camera as it was left by the previous frame (index.html:1358, near the top of the
 * playing branch), and the camera lerps LAST (index.html:1634, near the bottom). Doing
 * the camera first would shift every enemy's spawn frame by one and the enemy traces
 * would drift apart for a reason that looks nothing like the cause.
 */
export function stepWorld(world: World, input: InputState): void {
  spawnEnemiesInView(world); // Task 5 — stub as a no-op for Task 4
  stepPlayer(world, input);
  stepEnemies(world); // Task 5 — stub as a no-op for Task 4
  stepCamera(world);
  world.frame++;
}

/**
 * Exponential lerp toward the player, clamped to the level, with a snap inside half a
 * pixel so it does not creep forever. index.html:1634-1640.
 */
export function stepCamera(world: World): void {
  const { player: p, level: lvl, camera } = world;
  const targetX = Math.max(0, Math.min(p.x - VIEW_W / 2 + p.w / 2, lvl.width * TILE - VIEW_W));
  const targetY = Math.max(0, Math.min(p.y - VIEW_H / 2, lvl.height * TILE - VIEW_H));
  camera.x += (targetX - camera.x) * 0.12;
  camera.y += (targetY - camera.y) * 0.12;
  if (Math.abs(camera.x - targetX) < 0.5) camera.x = targetX;
  if (Math.abs(camera.y - targetY) < 0.5) camera.y = targetY;
}

/**
 * Streaming enemy spawn (index.html:1358). Stubbed as a no-op for Task 4; kept as a
 * real, named, exported function (rather than left out entirely) so `stepWorld`'s call
 * order is already final and Task 5 does not need to touch this file's control flow,
 * only this function's body. Task 5 replaces this stub.
 */
export function spawnEnemiesInView(_world: World): void {}

/**
 * Per-enemy AI step (index.html:1524-1547). Stubbed as a no-op for Task 4; see
 * `spawnEnemiesInView` above for why the stub is a real exported function rather than
 * an inline no-op at the call site. Task 5 replaces this stub.
 */
export function stepEnemies(_world: World): void {}
