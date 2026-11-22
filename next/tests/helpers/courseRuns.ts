import { testEnemyMove, testMove } from './testMove';
import { TILE } from '../../src/config/constants';
import { DIFFICULTY_CONFIG, type DifficultyKey } from '../../src/config/difficulty';
import type { Level } from '../../src/data/levels';
import { createPlayer, stepMotion, type Character } from '../../src/game/player';
import { createWorld, stepWorld } from '../../src/game/world';
import type { World } from '../../src/game/types';
import { emptyInput, type InputState } from '../../src/input/actions';

/** A world on `level` with every enemy already used up, so a test sees only its own piece. */
export function quietWorld(level: Level, difficulty: DifficultyKey = 'super_easy', character: Character = 'gigi'): World {
  const world = createWorld(0, difficulty, character, undefined, level);
  for (const d of world.pending) d.spawned = true;
  return world;
}

export function step(world: World, input: Partial<InputState> = {}, times = 1): void {
  for (let i = 0; i < times; i++) stepWorld(world, { ...emptyInput(), ...input }, testMove, testEnemyMove);
}

/** Stand the player on the floor whose top is tile row `floorRow`, at column `tx`. */
export function standAt(world: World, tx: number, floorRow: number): void {
  const p = world.player;
  p.x = tx * TILE;
  p.y = floorRow * TILE - p.h;
  p.vx = 0;
  p.vy = 0;
  p.onGround = true;
}

/** How high a held jump lifts the feet, in pixels, on a difficulty (and with a fart). */
export function jumpRise(difficulty: DifficultyKey, fart = false): number {
  const dc = DIFFICULTY_CONFIG[difficulty];
  const p = createPlayer({ playerStart: [0, 0] } as Level, dc, 'gigi');
  p.onGround = true;
  p.fartTimer = fart ? 900 : 0;
  const input = { ...emptyInput(), jump: true, jumpPressed: true };
  let y = 0;
  let top = 0;
  stepMotion(p, input, dc, { push: () => 0 });
  p.onGround = false;
  for (let i = 0; i < 200 && p.vy < 0; i++) {
    y += p.vy;
    top = Math.min(top, y);
    stepMotion(p, { ...input, jumpPressed: false }, dc, { push: () => 0 });
  }
  return -top;
}

/** The y an arrow flies at for a player whose top is `playerY` (player.ts's fireArrow). */
export function arrowY(playerY: number, h: number): number {
  return playerY + h / 2 - 2;
}
