import { describe, expect, it } from 'vitest';
import { quietWorld, standAt, step } from './helpers/courseRuns';
import { TILE } from '../src/config/constants';
import { DIFFICULTY_CONFIG, type DifficultyKey } from '../src/config/difficulty';
import { courseLevel } from '../src/data/course';
import {
  BLOCK_RELOAD, fireSpeed, neededTool, roarFrames, roarInterval, TREX_HP, TREX_HURT_FRAMES,
  TREX_MAX_ZOMBIES, walkSpeed, type TRexState,
} from '../src/game/bosses/tRex';
import type { World } from '../src/game/types';

/** A throne room in miniature: a door, the block's target, the T-Rex, the cage on a dais. */
function room(): string[] {
  const rows = Array.from({ length: 25 }, () => '.'.repeat(32));
  const set = (x: number, y: number, ch: string) => { rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1); };
  rows[23] = '#'.repeat(32);
  rows[24] = '#'.repeat(32);
  set(1, 20, 'P');
  for (let y = 6; y <= 16; y++) set(3, y, 'B');
  for (let y = 17; y <= 22; y++) set(3, y, ':');
  set(5, 22, '1');
  set(18, 22, 'Q');
  for (let x = 26; x <= 30; x++) { set(x, 21, '#'); set(x, 22, '#'); }
  set(28, 20, 'R');
  for (let y = 6; y <= 22; y++) set(31, y, 'B');
  return rows;
}
const ROOM = courseLevel({ name: 'throne room', theme: 5, ending: 'boss', boss: 'tRex', sections: [room()] });

const zombies = (world: World) => world.enemies.filter((e) => e.alive && e.zombie);

/** In the room, him awake, the hero safe unless a test says, at round `round`. */
function inRoom(round = 0, difficulty: DifficultyKey = 'super_easy'): { world: World; b: TRexState } {
  const world = quietWorld(ROOM, difficulty);
  standAt(world, 7, 23);
  world.player.invincible = 99999;
  step(world);
  const b = world.courseBoss as TRexState;
  b.round = round;
  b.hp = TREX_HP - round;
  b.roarTimer = 99999;
  return { world, b };
}

function landOn(world: World, b: TRexState): void {
  const p = world.player;
  p.x = b.x + b.w / 2 - p.w / 2;
  p.y = b.y - p.h + 3;
  p.vy = 4;
  p.onGround = false;
  step(world);
}

function walkInto(world: World, b: TRexState): void {
  const p = world.player;
  p.x = b.x - p.w + 3;
  p.y = b.floorY - p.h;
  p.vy = 0;
  p.onGround = true;
  step(world, { right: true });
}

/** Shoot the block's target from just in front of it. */
function shootTarget(world: World, b: TRexState): void {
  world.arrows.push({ x: b.target.x - 8, y: b.target.y + b.target.h - 14, vx: 6, life: 60, isChicken: false });
}

describe('the T-Rex', () => {
  it('waits until the hero is in the room, walks, and stops in the middle to roar, breathing fire at them', () => {
    const world = quietWorld(ROOM);
    standAt(world, 2, 23);
    step(world);
    const b = world.courseBoss as TRexState;
    expect(b.phase).toBe('asleep');
    standAt(world, 8, 23);
    world.player.invincible = 99999;
    step(world);
    expect(b.phase).toBe('walking');
    b.roarTimer = 1;
    for (let i = 0; i < 600 && b.phase !== 'roaring'; i++) step(world);
    expect(b.phase).toBe('roaring');
    expect(b.x).toBe(b.roarX);
    expect(b.facing).toBe(-1);
    const [fire] = world.enemyProjectiles;
    expect(fire.vx).toBeLessThan(0);
    step(world, {}, roarFrames(world.dc));
    expect(b.phase).toBe('walking');
  });

  it('never hurts by touch: walked into, he pushes the hero off; landed on, he throws them off', () => {
    const { world, b } = inRoom();
    const p = world.player;
    p.invincible = 0;
    p.hasCape = false;
    walkInto(world, b);
    expect(world.dead).toBe(false);
    expect(p.x + p.w).toBeLessThanOrEqual(b.x);
    landOn(world, b);
    expect(world.dead).toBe(false);
    expect(p.vy).toBeLessThan(0);
    expect(Math.abs(p.vx)).toBeGreaterThan(0);
    expect(b.hp).toBe(TREX_HP);
  });

  it('asks for the bow first: the target drops the block, and on his head it is a hit', () => {
    const { world, b } = inRoom(0);
    expect(neededTool(b)).toBe('bow');
    b.x = b.roarX;
    b.phase = 'roaring';
    b.timer = 9999;
    shootTarget(world, b);
    for (let i = 0; i < 120 && b.hp === TREX_HP; i++) step(world);
    expect(b.hp).toBe(TREX_HP - 1);
    expect(b.phase).toBe('hurt');
  });

  it('smashes the block on the floor when he is not under it, and lowers a new one', () => {
    const { world, b } = inRoom(0);
    b.x = b.patrol[1];
    b.phase = 'roaring';
    b.timer = 9999;
    shootTarget(world, b);
    for (let i = 0; i < 120 && b.block.state !== 'gone'; i++) step(world);
    expect(b.block.state).toBe('gone');
    expect(b.hp).toBe(TREX_HP);
    step(world, {}, BLOCK_RELOAD);
    expect(b.block.state).toBe('hanging');
  });

  it('then the fart: only a jump on his head with the fart on lands hard enough', () => {
    const { world, b } = inRoom(1);
    expect(neededTool(b)).toBe('fart');
    landOn(world, b);
    expect(b.hp).toBe(TREX_HP - 1);
    world.player.bigHeadTimer = 900;
    walkInto(world, b);
    expect(b.hp).toBe(TREX_HP - 1);
    world.player.fartTimer = 900;
    world.player.bigHeadTimer = 0;
    landOn(world, b);
    expect(b.hp).toBe(TREX_HP - 2);
  });

  it('then the big head: it smashes his crown, and nothing else will', () => {
    const { world, b } = inRoom(2);
    expect(neededTool(b)).toBe('bighead');
    world.player.fartTimer = 900;
    landOn(world, b);
    world.arrows.push({ x: b.x - 8, y: b.y + 40, vx: 6, life: 60, isChicken: true });
    step(world);
    expect(b.hp).toBe(TREX_HP - 2);
    world.player.fartTimer = 0;
    world.player.bigHeadTimer = 900;
    walkInto(world, b);
    expect(b.hp).toBe(TREX_HP - 3);
    expect(b.fx.some((f) => f.kind === 'crown')).toBe(true);
  });

  it('then the chicken ray: he calls two little zombie dinos, and with them chickens a ray shrinks him', () => {
    const { world, b } = inRoom(2);
    world.player.bigHeadTimer = 900;
    walkInto(world, b);
    world.player.bigHeadTimer = 0;
    standAt(world, 12, 23);
    step(world, {}, TREX_HURT_FRAMES);
    expect(neededTool(b)).toBe('chicken');
    expect(zombies(world).length).toBeGreaterThan(0);
    expect(zombies(world).length).toBeLessThanOrEqual(TREX_MAX_ZOMBIES);
    for (const z of zombies(world)) expect(z.type).toBe('dino');
    // With a dino standing, he bats the ray away.
    world.arrows.push({ x: b.x - 8, y: b.y + 40, vx: 6, life: 60, isChicken: true });
    step(world);
    expect(b.hp).toBe(1);
    for (const z of zombies(world)) {
      world.arrows.push({ x: z.x - 8, y: z.y + 4, vx: 6, life: 60, isChicken: true });
      step(world);
    }
    expect(zombies(world)).toHaveLength(0);
    world.enemyProjectiles.push({ x: 100, y: 100, vx: 0, vy: 0, life: 300, type: 'fireball' });
    world.arrows.push({ x: b.x - 8, y: b.y + 40, vx: 6, life: 60, isChicken: true });
    step(world);
    expect(b.phase).toBe('defeated');
    expect(world.enemyProjectiles).toHaveLength(0);
    standAt(world, ROOM.rescuePos[0], 21);
    step(world);
    expect(world.won).toBe(true);
  });

  it('keeps the cage shut while he stands', () => {
    const { world } = inRoom();
    standAt(world, ROOM.rescuePos[0], 21);
    step(world);
    expect(world.won).toBe(false);
  });

  it('does not take the next tool\'s hit while he staggers', () => {
    const { world, b } = inRoom(1);
    world.player.fartTimer = 900;
    landOn(world, b);
    expect(b.phase).toBe('hurt');
    world.player.bigHeadTimer = 900;
    walkInto(world, b);
    expect(b.hp).toBe(TREX_HP - 2);
  });

  it('is slower and kinder on Super Easy than on Hard', () => {
    const se = DIFFICULTY_CONFIG.super_easy;
    const hard = DIFFICULTY_CONFIG.hard;
    expect(walkSpeed(se, 0)).toBeLessThan(walkSpeed(hard, 0));
    expect(roarInterval(se, 0)).toBeGreaterThan(roarInterval(hard, 0));
    expect(fireSpeed(se)).toBeLessThan(fireSpeed(hard));
    expect(roarFrames(se)).toBeGreaterThan(roarFrames(hard));
    expect(TILE).toBe(16);
  });
});
