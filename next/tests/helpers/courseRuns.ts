import { testEnemyMove, testMove } from './testMove';
import { TILE } from '../../src/config/constants';
import { DIFFICULTY_CONFIG, type DifficultyKey } from '../../src/config/difficulty';
import { TILE_LAVA, TILE_SPRING, TILE_WATER, type Level } from '../../src/data/levels';
import { createPlayer, playerSize, stepMotion, type Character } from '../../src/game/player';
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

/** Both heroes: Gigi is 24 tall, Dodo 20, so arrows fly at different heights. */
export const HEROES: Character[] = ['gigi', 'dodo'];

/** The lowest an arrow flies, from the floor at row `floorRow`, in a held jump (or standing). */
export function arrowRange(key: DifficultyKey, hero: Character, floorRow: number, fart = false) {
  const { h } = playerSize(hero);
  const standing = arrowY(floorRow * TILE - h, h);
  return { standing, highest: standing - jumpRise(key, fart) };
}

/** Whether an arrow at height `y` (4 tall) meets a box. */
export function hits(box: { y: number; h: number }, y: number): boolean {
  return y < box.y + box.h && y + 4 > box.y;
}

export function reachesTower(level: Level, key: DifficultyKey, fromSpring: boolean, towerTopRow = 16): boolean {
  const world = quietWorld(level, key);
  const spring = world.map[23].lastIndexOf(TILE_SPRING);
  if (fromSpring) standAt(world, spring - 3, 23);
  else standAt(world, spring + 1, 23);
  for (let i = 0; i < 240; i++) {
    const p = world.player;
    if (world.won) return true;
    step(world, { right: true, jump: !fromSpring, jumpPressed: !fromSpring && p.onGround });
    if (!fromSpring) world.map[23] = world.map[23].map((c) => (c === TILE_SPRING ? 1 : c));
    if (p.onGround && p.y + p.h <= towerTopRow * TILE) return true;
  }
  return world.won;
}

/** Run right, jumping at every wall or gap ahead, until column `untilX` or `frames` run out. */
export function runRight(world: ReturnType<typeof quietWorld>, untilX: number, frames = 900): boolean {
  let holding = 0;
  for (let i = 0; i < frames && !world.dead; i++) {
    const p = world.player;
    const tx = Math.floor((p.x + p.w / 2) / TILE);
    const rows = [Math.floor((p.y + 2) / TILE), Math.floor((p.y + p.h - 2) / TILE)];
    const wall = rows.some((r) => (world.map[r]?.[tx + 1] ?? 0) !== 0);
    const open = (c: number | undefined) => c === 0 || c === TILE_LAVA || c === TILE_WATER;
    const gap = open(world.map[23][tx + 1]) || open(world.map[23][tx + 2]);
    const start = p.onGround && holding === 0 && (wall || gap);
    if (start) holding = 20;
    step(world, { right: true, jump: holding > 0, jumpPressed: start });
    if (holding > 0) holding--;
    world.player.hasCape = false;
    if (p.x / TILE >= untilX) return true;
  }
  return false;
}

/** From standing at `tx` on the floor at `floorRow`, does a held jump end up on `topRow` or higher? */
export function climbs(level: Level, key: DifficultyKey, tx: number, floorRow: number, topRow: number, fart: boolean): boolean {
  const world = quietWorld(level, key);
  world.course!.stations.forEach((s) => { s.cooldown = 99999; });
  standAt(world, tx, floorRow);
  for (let i = 0; i < 240; i++) {
    const p = world.player;
    if (fart) p.fartTimer = 900;
    step(world, { right: true, jump: true, jumpPressed: p.onGround });
    if (p.onGround && p.y + p.h <= topRow * TILE) return true;
  }
  return false;
}
