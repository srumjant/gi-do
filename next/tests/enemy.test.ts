// Port of the streaming enemy spawn (index.html:1212-1222, 1358) and the per-enemy step
// (index.html:1524-1547), now covering EVERY type the six levels spawn: the ground
// patrollers (doll, car, dino, penguin), the flyers (bat, icebat and, as of this task,
// ghost), the bouncer and the cannon. Nothing in the level data is skipped any more.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { driveLiveGame } from './helpers/liveGame';
import { testEnemyMove, testMove } from './helpers/testMove';
import { chickenify, isGroundPatrol, spawnEnemy, stepEnemy } from '../src/game/enemy';
import { setRandom } from '../src/game/random';
import {
  createWorld, spawnEnemiesInView, stepArrows, stepEnemies, stepEnemyProjectiles, stepWorld,
} from '../src/game/world';
import { createPlayer } from '../src/game/player';
import { findGroundY, getTile, isSolid } from '../src/game/tiles';
import { LEVELS, makeGround, TILE_GROUND } from '../src/data/levels';
import { emptyInput, type InputState } from '../src/input/actions';
import { TILE } from '../src/config/constants';
import type { EnemyState, World } from '../src/game/types';

function held(overrides: Partial<InputState>): InputState {
  return { ...emptyInput(), ...overrides };
}

/**
 * Is this enemy standing on solid floor — feet on a solid tile, and no part of it inside
 * one? The behavioural form of "it did not fall off and it did not sink in", asked of the
 * state the mover left behind rather than of a coordinate. Exactly one pixel below the
 * feet, because a body separated flush has its feet ON the boundary and the tile the
 * boundary itself floors into is the empty one above the floor.
 */
function standsOnGround(map: number[][], e: EnemyState): boolean {
  if (!isSolid(getTile(map, e.x + e.w / 2, e.y + e.h + 1))) return false;
  for (const x of [e.x, e.x + e.w / 2, e.x + e.w - 0.01]) {
    for (const y of [e.y, e.y + e.h / 2, e.y + e.h - 0.01]) {
      if (isSolid(getTile(map, x, y))) return false;
    }
  }
  return true;
}

describe('spawnEnemy', () => {
  afterEach(() => setRandom(Math.random)); // never leak a stub into an unrelated test

  // Every type the level data names is built now — ghost and cannon were the last two —
  // so the only thing left on the skip path is a type nothing has ever heard of. It is
  // kept because an enemy def is plain data with a plain `string` type: a typo in
  // levels.ts must cost that one enemy, not the level. See enemy.ts's ENEMY_SPRITES.
  it('builds every type the levels name, and skips one it does not know', () => {
    const world = createWorld(0, 'normal');
    const SPAWNABLE = [
      'doll', 'car', 'dino', 'penguin', 'ghost', 'bat', 'icebat', 'cannon', 'bouncer',
    ];
    for (const type of SPAWNABLE) {
      expect(spawnEnemy(world.map, world.dc, { type, x: 10 }), type).toBeDefined();
    }
    // Read off the real level records rather than trusting the list above: if a level
    // ever gains a type this map has no sprite for, that enemy would silently stop
    // existing, which is exactly how ghost and cannon went missing for four levels.
    const inLevels = new Set(LEVELS.flatMap((l) => l.enemyDefs.map((d) => d.type)));
    for (const type of inLevels) {
      expect(SPAWNABLE, `${type} is in the level data but not spawnable`).toContain(type);
    }

    expect(spawnEnemy(world.map, world.dc, { type: 'wyvern', x: 10 })).toBeUndefined();
  });

  it('spawns a ghost 40px up, motionless, gravity-free and with no sine offset of its own', () => {
    const world = createWorld(0, 'normal');
    const ghost = spawnEnemy(world.map, world.dc, { type: 'ghost', x: 10 })!;

    // Column 10 on level 0 is the platform at [10,19,5], so findGroundY is row 19
    // (gy=304): y = 304 - h(16.2) - 40 = 247.8. FORTY, not the bat's sixty.
    expect(ghost).toMatchObject({
      type: 'ghost', x: 10 * TILE, y: 247.8, w: 14.4, h: 16.2, vy: 0,
      alive: true, noGravity: true, originY: 247.8, noStomp: false,
    });
    // vx is 0 at spawn and is FACING, not movement, from the first step on — see the
    // ghost tests further down, which pin that it never moves the thing.
    expect(ghost.vx).toBe(0);
    // No sineOffset, unlike a bat: every ghost drifts on the same phase of the same
    // clock. This is the live line (index.html:1216 sets no offset), so it must stay 0
    // even though the field exists on every enemy.
    expect(ghost.sineOffset).toBe(0);
  });

  it('spawns a cannon standing on the ground, unstompable, with a randomised first shot', () => {
    const world = createWorld(0, 'normal');
    setRandom(() => 0.5); // the live driver's own stubbed Math.random
    const cannon = spawnEnemy(world.map, world.dc, { type: 'cannon', x: 10 })!;

    expect(cannon).toMatchObject({
      type: 'cannon', x: 10 * TILE, y: 304 - 14.4, w: 14.4, h: 14.4, vx: 0, vy: 0,
      alive: true, noStomp: true,
      // NOT a flyer: it falls and floor-snaps every frame like a doll (index.html:1527
      // has no exception for it), it just never gains any x.
      noGravity: false,
    });
    // 60 + floor(0.5*60) — one to two seconds before the first shot.
    expect(cannon.shootTimer).toBe(90);
    // The difficulty's own rate, flat. The boss takes the same number times 1.2.
    expect(cannon.shootInterval).toBe(world.dc.enemyShootInterval);
    expect(cannon.shootInterval).toBe(90);
  });

  // The whole reason the first timer is drawn at random: level 2 has two cannons and
  // level 4 has five, all sharing one interval. Give them a fixed start and every cannon
  // in a level fires on the same frame for the whole level — one dodgeable wall of
  // fireballs instead of a scattering, and the same noise five times at once.
  it('gives a row of cannons different first shots, spread across exactly one second', () => {
    const world = createWorld(0, 'normal');
    const draws = [0, 0.25, 0.5, 0.75, 0.999];
    let i = 0;
    setRandom(() => draws[i++]);

    const row = [26, 73, 103, 134, 136].map(
      (x) => spawnEnemy(world.map, world.dc, { type: 'cannon', x })!, // level 4's own columns
    );
    const timers = row.map((c) => c.shootTimer);

    expect(timers).toEqual([60, 75, 90, 105, 119]);
    expect(new Set(timers).size).toBe(row.length); // no two of them in lockstep
    for (const t of timers) {
      expect(t).toBeGreaterThanOrEqual(60); // never sooner than a second
      expect(t).toBeLessThan(120); // never later than two
    }
    // And they all reload to the same rate afterwards — the spread is in the START only.
    expect(new Set(row.map((c) => c.shootInterval))).toEqual(new Set([90]));
  });

  it('spawns a bat 60px above the ground, sized off the sprite, sine-offset from the injected random source', () => {
    const world = createWorld(0, 'normal');
    setRandom(() => 0.5); // the live driver's own stubbed Math.random (tests/helpers/liveGame.ts)
    const bat = spawnEnemy(world.map, world.dc, { type: 'bat', x: 48 })!;

    // Column 48 is flat ground on level 0's real map (no platform covers it — see the
    // level's own addPlats list), so findGroundY there is the plain ground row (23),
    // i.e. gy=368: originY = 368 - h(10.8) - 60 = 297.2.
    expect(bat).toMatchObject({
      type: 'bat', x: 48 * TILE, y: 297.2, w: 12.6, h: 10.8, vx: -1.2, vy: 0,
      alive: true, noGravity: true, originY: 297.2, sineOffset: Math.PI, bounceTimer: 0,
    });
  });

  it('spawns an icebat identically to a bat, just with its own sprite size', () => {
    const world = createWorld(0, 'normal');
    setRandom(() => 0.5);
    const icebat = spawnEnemy(world.map, world.dc, { type: 'icebat', x: 48 })!;

    // ICEBAT_S is the same 6x7 grid as BAT_S, so this is the exact same box and
    // origin — icebat does not appear in level 1, but shares bat's branch verbatim.
    expect(icebat).toMatchObject({
      type: 'icebat', x: 48 * TILE, y: 297.2, w: 12.6, h: 10.8, vx: -1.2, vy: 0,
      alive: true, noGravity: true, originY: 297.2, sineOffset: Math.PI, bounceTimer: 0,
    });
  });

  it('spawns a bouncer resting on the ground under it, gravity-bound, hop timer at zero', () => {
    const world = createWorld(0, 'normal');
    // Column 73 sits under the real platform at columns 70-74, row 17 (level 0's own
    // addPlats) — a ledge spawn, same idea as car@40's in the window test below —
    // so gy=272: y = 272 - h(14.4) = 257.6.
    const bouncer = spawnEnemy(world.map, world.dc, { type: 'bouncer', x: 73 })!;

    expect(bouncer).toMatchObject({
      type: 'bouncer', x: 73 * TILE, y: 257.6, w: 12.6, h: 14.4, vx: -1.0, vy: 0,
      alive: true, noGravity: false, bounceTimer: 0,
    });
  });
});

describe('spawnEnemiesInView', () => {
  it('spawns exactly the three in-window patrollers at frame 0, sized and angled off the sprite data', () => {
    const world = createWorld(0, 'normal');
    spawnEnemiesInView(world);

    expect(world.enemies.map((e) => e.type)).toEqual(['doll', 'doll', 'car']);

    const [doll15, doll28, car40] = world.enemies;
    expect(doll15).toMatchObject({
      x: 15 * TILE, y: 351.8, w: 14.4, h: 16.2, vx: -0.8, vy: 0, alive: true,
    });
    expect(doll28).toMatchObject({
      x: 28 * TILE, y: 351.8, w: 14.4, h: 16.2, vx: -0.8, vy: 0, alive: true,
    });
    // car@40 sits on the platform at tile row 19 (findGroundY scans from the top and
    // hits the platform before the ground further down) — a ledge spawn, not a bug.
    expect(car40).toMatchObject({
      x: 40 * TILE, y: 293.2, w: 21.6, h: 10.8, vx: -0.8, vy: 0, alive: true,
    });

    // bat@48 is outside the window (crT=41) — it should be untouched, still pending.
    const bat48 = world.pending.find((d) => d.type === 'bat' && d.x === 48)!;
    expect(bat48.spawned).toBe(false);
    expect(world.pending.filter((d) => d.spawned)).toHaveLength(3);
  });

  it('spawns every def in a mid-level window, bat and bouncer included', () => {
    const world = createWorld(0, 'normal');
    // Window [42,84]: bat@48, dino@55, doll@65, bouncer@73, car@80 (level 0's defs) —
    // every one of these five is a type this slice implements after this task (see
    // enemy.ts's ENEMY_SPRITES), so all five spawn now, not just the ground
    // patrollers among them.
    world.camera.x = 700;
    spawnEnemiesInView(world);

    const inWindow = world.pending.filter((d) => d.x >= 42 && d.x <= 84);
    expect(inWindow.every((d) => d.spawned)).toBe(true);
    expect(world.enemies.map((e) => e.type).sort()).toEqual(
      ['bat', 'bouncer', 'car', 'dino', 'doll'],
    );
  });

  it('never spawns the same def twice', () => {
    const world = createWorld(0, 'normal');
    spawnEnemiesInView(world);
    spawnEnemiesInView(world);
    expect(world.enemies).toHaveLength(3);
  });
});

// The ground patrollers are on Arcade bodies from plan 7, task 3, so `stepEnemy` no longer
// moves one itself: it is handed an `EnemyMove` exactly as `stepPlayer` is handed a
// `PlayerMove`. `testEnemyMove` (tests/helpers/testMove.ts) is what these inject — read its
// header, which says plainly that it is NOT Arcade. So the assertions below are about what
// the enemy DID (it came to rest, it turned, it stayed on its platform) and never about
// where exactly it ended up, which is Arcade's answer and is checked in a browser.
//
// The bat, the icebat and the bouncer are still moved by hand inside `stepEnemy`, on
// purpose (see EnemyMove in enemy.ts), which is why their tests pass no mover at all.
describe('stepEnemy', () => {
  afterEach(() => setRandom(Math.random));

  it('falls under gravity, comes to rest on the ground, and then stays there', () => {
    const world = createWorld(0, 'normal');
    world.map = makeGround(30, 20); // flat ground, rows 18-19 — no platforms to complicate the fall
    const enemy = spawnEnemy(world.map, world.dc, { type: 'doll', x: 10 })!;
    enemy.y -= 64; // lift it well above its natural ground-contact spawn point
    const droppedFrom = enemy.y;

    for (let i = 0; i < 30; i++) stepEnemy(world, enemy, testEnemyMove);

    expect(enemy.y).toBeGreaterThan(droppedFrom); // it came down
    expect(enemy.vy).toBe(0); // and stopped: the fall is over, not merely slow
    expect(standsOnGround(world.map, enemy)).toBe(true);

    const restedAt = enemy.y;
    stepEnemy(world, enemy, testEnemyMove); // idempotent once grounded: no sink, no bounce
    expect(enemy.y).toBe(restedAt);
    expect(enemy.vy).toBe(0);
  });

  it('patrols leftward at a steady vx while the ground underneath is flat', () => {
    const world = createWorld(0, 'normal');
    world.map = makeGround(30, 20);
    const enemy = spawnEnemy(world.map, world.dc, { type: 'doll', x: 10 })!;

    let previousX = enemy.x;
    for (let i = 1; i <= 10; i++) {
      stepEnemy(world, enemy, testEnemyMove);
      expect(enemy.x).toBeLessThan(previousX); // still going left, every single step
      expect(enemy.vx).toBe(-0.8); // and at the speed spawnEnemy gave it, undiminished
      expect(enemy.vy).toBe(0); // resting on flat ground the whole time
      expect(standsOnGround(world.map, enemy)).toBe(true);
      previousX = enemy.x;
    }
  });

  it('turns around at a wall instead of walking through it', () => {
    const WALL_TX = 5;
    const world = createWorld(0, 'normal');
    const map = makeGround(20, 10);
    for (let ty = 0; ty < map.length; ty++) map[ty][WALL_TX] = TILE_GROUND;
    world.map = map;

    const enemy = spawnEnemy(map, world.dc, { type: 'doll', x: 10 })!; // right of the wall, heading left

    let minX = enemy.x;
    for (let i = 0; i < 100; i++) {
      stepEnemy(world, enemy, testEnemyMove);
      minX = Math.min(minX, enemy.x);
    }

    expect(enemy.vx).toBe(0.8); // turned away from the wall, at the same speed
    // CHANGED FROM THE LIVE GAME, deliberately. index.html has no position correction on
    // an enemy wall hit — only the vx flip — so a live doll ends up as much as one frame's
    // `vx` INSIDE the wall tile before it turns, and visibly sinks into it. A separated
    // body stops flush, so the enemy never overlaps the wall at all. Same defect the
    // player's own wall snap had, fixed the same way. See enemy.ts's ground-patrol branch.
    expect(minX).toBeGreaterThanOrEqual((WALL_TX + 1) * TILE);
  });

  it('turns around at a ledge rather than walking off it', () => {
    const LEDGE_TX = 10; // solid ground for x >= 10, open air (a cliff) for x < 10
    const world = createWorld(0, 'normal');
    const map = makeGround(20, 10);
    for (let ty = 0; ty < map.length; ty++) {
      for (let x = 0; x < LEDGE_TX; x++) map[ty][x] = 0;
    }
    world.map = map;

    const enemy = spawnEnemy(map, world.dc, { type: 'doll', x: 12 })!; // heading left, toward the drop

    for (let i = 0; i < 80; i++) {
      stepEnemy(world, enemy, testEnemyMove);
      // Checked EVERY step, not just at the end: an enemy that walked off, fell and was
      // then caught by something would pass a check made only afterwards.
      expect(standsOnGround(map, enemy)).toBe(true);
    }

    expect(enemy.vx).toBeGreaterThan(0); // turned away from the drop
    expect(enemy.alive).toBe(true); // never fell
    expect(enemy.vy).toBe(0); // still grounded, never airborne
  });

  // The plan's own wording for what this task has to be able to say, and the thing the
  // ledge probe exists for. A platform in mid-air with a drop at both ends: no walls
  // anywhere, so every one of these turns is the second rule — the tile ahead-and-below is
  // empty while the tile below-centre is solid — and nothing else.
  it('patrols a platform and turns at both ends without falling off', () => {
    const FROM_TX = 5;
    const TO_TX = 14; // solid columns 5..14 at rows 8-9, open air everywhere else
    const world = createWorld(0, 'normal');
    const map: number[][] = Array.from({ length: 10 }, () => Array(20).fill(0));
    for (let ty = 8; ty < 10; ty++) {
      for (let tx = FROM_TX; tx <= TO_TX; tx++) map[ty][tx] = TILE_GROUND;
    }
    world.map = map;

    const enemy = spawnEnemy(map, world.dc, { type: 'doll', x: 10 })!; // mid-platform, heading left
    const restedAt = enemy.y;

    let turns = 0;
    let wentLeft = false;
    let wentRight = false;
    let vx = enemy.vx;
    // Long enough for at least four turns: the platform is 160px wide and the patrol
    // covers 0.8 of it a step, so one traverse is about 180 steps.
    for (let i = 0; i < 1000; i++) {
      stepEnemy(world, enemy, testEnemyMove);
      if (enemy.vx !== vx) turns++;
      vx = enemy.vx;
      if (enemy.vx < 0) wentLeft = true;
      if (enemy.vx > 0) wentRight = true;
      expect(standsOnGround(map, enemy)).toBe(true);
      expect(enemy.y).toBe(restedAt); // never left the floor: no hop, no sink, no fall
    }

    expect(wentLeft).toBe(true);
    expect(wentRight).toBe(true);
    expect(turns).toBeGreaterThanOrEqual(4); // both ends, more than once each
    expect(Math.abs(enemy.vx)).toBe(0.8); // and the patrol speed survived every turn
  });

  // The case most likely to be missed, and the reason `isGroundPatrol` is asked of the
  // type rather than kept as a list of what spawns: a bat has no body, because nothing
  // ever asks it to move. A chicken ray rewrites it into a ground patroller in MID-AIR,
  // and from that step on it is asked — which is exactly when physics/enemy.ts gives it
  // one. What this can check without a browser is the simulation half: the branch it falls
  // into flips, gravity starts applying to it, and it lands and walks.
  it('a chicken ray turns a bat into a ground patroller, which falls, lands and walks', () => {
    const world = createWorld(0, 'normal');
    world.map = makeGround(30, 20);
    const bat = spawnEnemy(world.map, world.dc, { type: 'bat', x: 10 })!;

    expect(isGroundPatrol(bat)).toBe(false); // a flyer: never asked to move, never bodied
    expect(bat.noGravity).toBe(true);
    const flyingAt = bat.y;

    setRandom(() => 0.9); // `> .5` — the coin flip in chickenify sends it rightward
    chickenify(bat);

    expect(isGroundPatrol(bat)).toBe(true); // from this step on it is asked, so it is bodied
    expect(bat.noGravity).toBe(false);
    expect(bat.w).toBe(14.4); // and at the chicken's size, not the bat's 12.6
    expect(bat.h).toBe(12.6);

    for (let i = 0; i < 60; i++) stepEnemy(world, bat, testEnemyMove);

    expect(bat.y).toBeGreaterThan(flyingAt); // it dropped out of the air
    expect(bat.vy).toBe(0); // and landed rather than still falling
    expect(standsOnGround(world.map, bat)).toBe(true);

    const landedAt = bat.x;
    for (let i = 0; i < 10; i++) stepEnemy(world, bat, testEnemyMove);
    expect(bat.x).toBeGreaterThan(landedAt); // walking, and rightward, as the flip decided
    expect(bat.vx).toBe(1.5); // chickenify's FLAT 1.5, with no dc.enemySpeed in it
    expect(standsOnGround(world.map, bat)).toBe(true);
  });

  it('bat/icebat ignore walls entirely and flip only at the world edges', () => {
    const world = createWorld(0, 'normal');
    const map = makeGround(10, 10);
    for (let ty = 0; ty < map.length; ty++) map[ty][3] = TILE_GROUND; // a wall a ground patroller would turn at
    world.map = map;
    const bat = spawnEnemy(map, world.dc, { type: 'bat', x: 5 })!; // x=80, heading left (default vx=-1.2)

    let flippedAtX: number | null = null;
    for (let i = 0; i < 80 && flippedAtX === null; i++) {
      stepEnemy(world, bat);
      if (bat.vx > 0) flippedAtX = bat.x;
    }

    // It does eventually turn — but only once x itself goes negative, past the
    // world's own left edge (index.html:1533's `e.x<0`), having sailed straight
    // through the wall at column 3 (x=48) around frame 27 completely untouched.
    // There is no tile read anywhere in this branch to have caught it there.
    expect(flippedAtX).not.toBeNull();
    expect(flippedAtX!).toBeLessThan(0);
    expect(flippedAtX!).toBeGreaterThan(-1.2); // caught within one frame's travel of 0
  });

  it('bouncer turns around at a wall, same as a ground patroller', () => {
    const WALL_TX = 5;
    const world = createWorld(0, 'normal');
    const map = makeGround(20, 10);
    for (let ty = 0; ty < map.length; ty++) map[ty][WALL_TX] = TILE_GROUND;
    world.map = map;
    // world.player stays at its default spawn (x=32, from createPlayer) for both this
    // test and the ledge one below — well left of both the wall (x=80) and the drop
    // (x=160), so `p.x>e.x` reads false throughout and every re-aimed hop keeps
    // pointing the bouncer leftward, into whichever of the two it is testing.
    const bouncer = spawnEnemy(map, world.dc, { type: 'bouncer', x: 10 })!; // heading left (default vx)

    let minX = bouncer.x;
    for (let i = 0; i < 150; i++) {
      stepEnemy(world, bouncer);
      minX = Math.min(minX, bouncer.x);
    }

    expect(bouncer.vx).toBeGreaterThan(0); // turned away from the wall
    expect(minX).toBeGreaterThan(WALL_TX * TILE);
  });

  it('bouncer hops off a ledge into a pit instead of turning around', () => {
    const LEDGE_TX = 10; // solid ground for x >= 10, open air (a cliff) for x < 10
    const world = createWorld(0, 'normal');
    const map = makeGround(20, 10);
    for (let ty = 0; ty < map.length; ty++) {
      for (let x = 0; x < LEDGE_TX; x++) map[ty][x] = 0;
    }
    world.map = map;
    const bouncer = spawnEnemy(map, world.dc, { type: 'bouncer', x: 12 })!; // heading left, toward the drop
    const groundY = bouncer.y;

    for (let i = 0; i < 150; i++) stepEnemy(world, bouncer);

    // Unlike the ground patroller above, the bouncer's own movement branch never
    // reads a ledge probe at all — it hops straight off the edge and keeps falling,
    // never turning around and never getting snapped back to a floor that, on this
    // side of the ledge, does not exist. That is live behaviour (index.html:1537 has
    // no ledge check for this type), not a bug to guard against.
    expect(bouncer.vx).toBeLessThan(0); // never turned around
    expect(bouncer.alive).toBe(true); // falling is not itself death in this slice
    expect(bouncer.y).toBeGreaterThan(groundY + 100); // well past the ground, still falling
  });

  describe('stomp', () => {
    function stompSetup(): { world: World; enemy: EnemyState } {
      const world = createWorld(0, 'normal');
      world.map = makeGround(20, 20); // ground far below; both actors float clear of it
      const enemy: EnemyState = {
        type: 'doll', x: 100, y: 150, vx: -0.8, vy: 0, w: 14.4, h: 16.2, alive: true,
        frame: 0, frameTimer: 0, squashTimer: 0,
        noGravity: false, originY: 0, sineOffset: 0, bounceTimer: 0, stunTimer: 0,
        shootTimer: 0, shootInterval: 0, noStomp: false,
      isChicken: false,
      };
      world.player = createPlayer(LEVELS[0], world.dc, 'gigi'); // w=16, h=24
      world.player.x = 98;
      // Enemy gravity runs before the stomp check even on this first step, so its y by
      // the time the check happens is 150 + GRAVITY, i.e. 150.4 — this places the
      // player's bottom 2px into the enemy's top half at that point.
      world.player.y = 152.4 - world.player.h;
      return { world, enemy };
    }

    it('is killed by a falling player overlapping its top half, which bounces the player up', () => {
      const { world, enemy } = stompSetup();
      world.player.vy = 3; // falling

      stepEnemy(world, enemy);

      expect(enemy.alive).toBe(false);
      expect(world.player.vy).toBe(-5);
      expect(enemy.squashTimer).toBe(30); // index.html:1545 — starts the squash countdown
    });

    it('is NOT killed by a rising player, even while overlapping the same box', () => {
      const { world, enemy } = stompSetup();
      world.player.vy = -3; // rising

      stepEnemy(world, enemy);

      expect(enemy.alive).toBe(true);
      // Side/rising contact calls playerHit, and this world is at normal difficulty with
      // no cape, so that is a death — but playerDie only touches world.dead/lives/
      // stateTimer, never player.vy, so vy stays exactly what it was going in. (With a
      // cape it WOULD be touched: the absorb branch sets vy to -4.)
      expect(world.player.vy).toBe(-3);
      expect(world.dead).toBe(true);
      expect(enemy.squashTimer).toBe(0); // never stomped, so never started counting down
    });

    it('keeps counting down and rendering (alive:false) for 30 frames after the kill, then holds at 0', () => {
      const { world, enemy } = stompSetup();
      world.player.vy = 3; // falling
      stepEnemy(world, enemy); // the kill itself
      expect(enemy.alive).toBe(false);
      expect(enemy.squashTimer).toBe(30);

      const seen: number[] = [enemy.squashTimer];
      for (let i = 0; i < 40; i++) {
        stepEnemy(world, enemy);
        seen.push(enemy.squashTimer);
      }

      // Strictly one-per-frame down to 0, then flat — never negative, never a second
      // countdown from a "kill" the dead-enemy early return cannot trigger again.
      expect(seen).toEqual([
        30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11,
        10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ]);
      expect(enemy.alive).toBe(false); // still dead — nothing revives it
    });
  });

  it('a dead enemy does not move, fall, patrol, or get killed again', () => {
    const world = createWorld(0, 'normal');
    world.map = makeGround(20, 20);
    const enemy: EnemyState = {
      type: 'doll', x: 100, y: 150, vx: -0.8, vy: 2, w: 14.4, h: 16.2, alive: false,
      // squashTimer already expired: this is testing that a long-dead enemy stays
      // fully inert, not the countdown itself (see the 'stomp' tests above for that).
      frame: 0, frameTimer: 0, squashTimer: 0,
      noGravity: false, originY: 0, sineOffset: 0, bounceTimer: 0, stunTimer: 0,
      shootTimer: 0, shootInterval: 0, noStomp: false,
      isChicken: false,
    };
    world.player = createPlayer(LEVELS[0], world.dc, 'gigi');
    world.player.x = 98;
    world.player.y = 140;
    world.player.vy = 3; // would stomp a live enemy at this position
    const before = { ...enemy };

    for (let i = 0; i < 10; i++) stepEnemy(world, enemy);

    expect(enemy).toEqual(before);
  });
});

// index.html:1530-1532. A ghost has two states and a distance decides which: inside
// `dc.ghostAggroRange` it homes, outside it hangs on a sine. Everything here is port-side
// arithmetic the live comparison at the bottom of this file also pins frame for frame;
// these say WHAT the numbers mean, which a trace cannot.
describe('the ghost', () => {
  /** A ghost on flat ground, and a player put wherever the test wants one. */
  function ghostWorld(difficulty: 'super_easy' | 'normal' | 'hard' = 'normal') {
    const world = createWorld(0, difficulty);
    world.map = makeGround(60, 20);
    world.player = createPlayer(LEVELS[0], world.dc, 'gigi');
    const ghost = spawnEnemy(world.map, world.dc, { type: 'ghost', x: 30 })!;
    world.enemies.push(ghost);
    return { world, ghost };
  }

  it('homes on the player when inside the aggro range, sideways faster than downwards', () => {
    const { world, ghost } = ghostWorld();
    // Exactly diagonal, 100px each way: dist 141.42, comfortably inside normal's 200.
    world.player.x = ghost.x + 100;
    world.player.y = ghost.y + 100;
    const from = { x: ghost.x, y: ghost.y };

    stepEnemy(world, ghost);

    const dx = ghost.x - from.x;
    const dy = ghost.y - from.y;
    expect(dx).toBeGreaterThan(0); // toward the player on both axes
    expect(dy).toBeGreaterThan(0);
    // 0.7 against 0.5 on the same unit vector — the ghost CUTS THE PLAYER OFF rather than
    // diving onto them, and a child running away from one is caught before it drops.
    // Asserted as the ratio, not as two magic numbers, so it survives dc.enemySpeed.
    expect(dx / dy).toBeCloseTo(0.7 / 0.5, 10);
    expect(dx).toBeCloseTo((100 / Math.SQRT2 / 100) * 0.7 * world.dc.enemySpeed, 10);
  });

  it('drifts on a sine about originY, and does not move sideways at all, when out of range', () => {
    const { world, ghost } = ghostWorld();
    // 400px away: outside every difficulty's range, normal's 200 included.
    world.player.x = ghost.x + 400;
    world.player.y = ghost.y;
    const parkedAt = ghost.x;

    const ys: number[] = [];
    for (let f = 0; f < 200; f++) {
      world.animFrame = f;
      stepEnemy(world, ghost);
      ys.push(ghost.y);
      // The whole claim about `vx`: it is FACING, never movement. It is rewritten ±0.1
      // every single frame and the ghost's x never changes by so much as an ulp, because
      // nothing integrates it — not this branch, not gravity, and not a mover, since a
      // ghost is never a ground patroller and so never gets an Arcade body.
      expect(Math.abs(ghost.vx)).toBe(0.1);
      expect(ghost.x).toBe(parkedAt);
    }

    // A real wave about originY, amplitude 15 — not the bat's 30 — on the 0.04 clock.
    expect(Math.max(...ys)).toBeCloseTo(ghost.originY + 15, 1);
    expect(Math.min(...ys)).toBeCloseTo(ghost.originY - 15, 1);
  });

  it('turns to face the player, which is the only thing its vx is for', () => {
    const { world, ghost } = ghostWorld();
    world.player.x = ghost.x + 400; // out of range, so only the facing line runs
    world.player.y = ghost.y;

    stepEnemy(world, ghost);
    expect(ghost.vx).toBe(0.1); // > 0, which is what the draw code flips on

    world.player.x = ghost.x - 400;
    stepEnemy(world, ghost);
    expect(ghost.vx).toBe(-0.1);
  });

  // The boundary itself, read off the real difficulty records rather than a constant, so
  // this fails loudly if the table ever moves. All four records carry the field and the
  // type requires it, so there is no fallback anywhere and none is written.
  it('switches branch exactly at dc.ghostAggroRange, which every difficulty carries', () => {
    for (const difficulty of ['super_easy', 'normal', 'hard'] as const) {
      const { world, ghost } = ghostWorld(difficulty);
      const range = world.dc.ghostAggroRange;
      expect(typeof range, difficulty).toBe('number');

      // Purely horizontal, one pixel inside: `dist < range` is strict, so `range - 1`
      // homes and `range` itself does not.
      world.player.y = ghost.y;
      world.player.x = ghost.x + range - 1;
      const parkedAt = ghost.x;
      stepEnemy(world, ghost);
      expect(ghost.x, `${difficulty} should home at ${range - 1}px`).toBeGreaterThan(parkedAt);

      ghost.x = parkedAt;
      world.player.x = ghost.x + range;
      stepEnemy(world, ghost);
      expect(ghost.x, `${difficulty} should drift at ${range}px`).toBe(parkedAt);
    }
  });

  it('homes straight through a wall, because nothing about it reads the tile map', () => {
    const { world, ghost } = ghostWorld();
    const wallTx = Math.floor(ghost.x / TILE) + 3;
    for (let ty = 0; ty < world.map.length; ty++) world.map[ty][wallTx] = TILE_GROUND;
    world.player.x = ghost.x + 120; // beyond the wall, inside the range
    world.player.y = ghost.y;

    for (let f = 0; f < 120; f++) stepEnemy(world, ghost);

    // It crossed the solid column without turning, stopping or being pushed out. That is
    // the point of a ghost and it is why it must never be handed to a mover.
    expect(ghost.x).toBeGreaterThan((wallTx + 1) * TILE);
  });

  it('is killed by a stomp and by an arrow like anything else', () => {
    const { world, ghost } = ghostWorld();
    world.player.x = ghost.x - 400; // out of range: it stays put while the arrow arrives
    world.arrows.push({ x: ghost.x + 2, y: ghost.y + 2, vx: 0, life: 60, isChicken: false });

    stepArrows(world);

    expect(ghost.alive).toBe(false);
    expect(ghost.noStomp).toBe(false); // nothing but a cannon is unstompable
  });
});

// index.html:1534-1535 and :1218. The cannon is three things: a countdown, a flat
// fireball, and `noStomp`.
describe('the cannon', () => {
  function cannonWorld(difficulty: 'super_easy' | 'normal' | 'hard' = 'normal') {
    const world = createWorld(0, difficulty);
    world.map = makeGround(60, 20);
    world.player = createPlayer(LEVELS[0], world.dc, 'gigi');
    setRandom(() => 0.5); // shootTimer = 90
    const cannon = spawnEnemy(world.map, world.dc, { type: 'cannon', x: 30 })!;
    setRandom(Math.random);
    world.enemies.push(cannon);
    return { world, cannon };
  }

  it('counts down and fires on the frame the timer reaches zero, then reloads', () => {
    const { world, cannon } = cannonWorld();
    world.player.x = cannon.x + 300; // to the right

    for (let f = 0; f < 89; f++) stepEnemy(world, cannon);
    expect(cannon.shootTimer).toBe(1);
    expect(world.enemyProjectiles).toHaveLength(0); // nothing yet, on any of those 89

    stepEnemy(world, cannon); // the 90th
    expect(world.enemyProjectiles).toHaveLength(1);
    // Reloaded to the interval, not topped up by it: a cannon that fell behind never
    // fires twice to catch up.
    expect(cannon.shootTimer).toBe(cannon.shootInterval);

    for (let f = 0; f < 90; f++) stepEnemy(world, cannon);
    expect(world.enemyProjectiles).toHaveLength(2); // and again, one interval later
  });

  it('fires a FLAT fireball, aimed at whichever side the player is on', () => {
    const { world, cannon } = cannonWorld();
    world.player.x = cannon.x + 300;
    for (let f = 0; f < 90; f++) stepEnemy(world, cannon);

    expect(world.enemyProjectiles[0]).toEqual({
      x: cannon.x + cannon.w / 2 + 8,
      y: cannon.y + cannon.h / 2 - 3,
      vx: 2.5 * world.dc.enemySpeed,
      // THE NUMBER THAT MATTERS. The boss's two leave at -1 and -2 and rise for their
      // whole life; this one is dead flat, and nothing in stepEnemyProjectiles ever
      // accelerates any of them. Same list, same pass, different numbers.
      vy: 0,
      life: 120,
      type: 'fireball',
    });

    // And it flies flat: y unchanged after fifty frames of the real projectile pass.
    const shot = world.enemyProjectiles[0];
    const firedAt = shot.y;
    world.player.x = -1000; // out of the way, so the hit check cannot end the flight
    for (let f = 0; f < 50; f++) stepEnemyProjectiles(world);
    expect(shot.y).toBe(firedAt);
    expect(shot.x).toBeCloseTo(cannon.x + cannon.w / 2 + 8 + 50 * 2.5 * world.dc.enemySpeed, 6);
  });

  it('aims left when the player is left', () => {
    const { world, cannon } = cannonWorld();
    world.player.x = cannon.x - 300;
    for (let f = 0; f < 90; f++) stepEnemy(world, cannon);

    const shot = world.enemyProjectiles[0];
    expect(shot.vx).toBe(-2.5 * world.dc.enemySpeed);
    expect(shot.x).toBe(cannon.x + cannon.w / 2 - 8); // out of the muzzle on that side too
  });

  it('makes its own noise, not the boss\'s', () => {
    const { world, cannon } = cannonWorld();
    world.player.x = cannon.x + 300;
    for (let f = 0; f < 90; f++) stepEnemy(world, cannon);
    expect(world.sounds).toEqual(['cannon-fire']);
  });

  // THE LANDMINE. `!e.noStomp` was left out of this port while nothing spawned a cannon,
  // on the correct reasoning that the gate was dead code — and it stopped being correct
  // the moment spawnEnemy learned to build one. Without it a child kills a cannon by
  // jumping on it, which the original does not allow.
  it('cannot be stomped: a jump onto its head hurts the player instead', () => {
    const { world, cannon } = cannonWorld();
    // Placed in mid-air with the player's feet just inside its top half — the exact
    // geometry the doll stomp test above uses, so the only difference is `noStomp`.
    cannon.noGravity = true; // hold it still; the stomp box is what is under test
    cannon.x = 100;
    cannon.y = 150;
    world.player.x = 98;
    world.player.y = 150 - world.player.h + 2;
    world.player.vy = 3; // falling, which is the other half of the stomp condition

    stepEnemy(world, cannon);

    expect(cannon.alive).toBe(true); // survived
    expect(cannon.squashTimer).toBe(0); // and was not even flattened
    expect(world.player.vy).toBe(3); // no bounce: the stomp branch never ran
    expect(world.dead).toBe(true); // it hit the player instead, which is the whole point
    expect(world.score).toBe(0); // and paid nothing

    // Same setup with the flag cleared kills it, so the test above is about `noStomp`
    // and not about the geometry.
    const other = cannonWorld();
    other.cannon.noGravity = true;
    other.cannon.noStomp = false;
    other.cannon.x = 100;
    other.cannon.y = 150;
    other.world.player.x = 98;
    other.world.player.y = 150 - other.world.player.h + 2;
    other.world.player.vy = 3;
    stepEnemy(other.world, other.cannon);
    expect(other.cannon.alive).toBe(false);
    expect(other.world.dead).toBe(false);
  });

  it('is killed by an arrow, which is the only way to be rid of one', () => {
    const { world, cannon } = cannonWorld();
    world.arrows.push({ x: cannon.x + 2, y: cannon.y + 2, vx: 0, life: 60, isChicken: false });

    stepArrows(world);

    expect(cannon.alive).toBe(false);
    expect(world.score).toBe(Math.round(200 * world.dc.scoreMultiplier));
  });

  // index.html:1508's `e.noStomp=false`, which this port left out for the same reason it
  // left out the gate. A chicken ray is the one thing that makes a cannon stompable: it
  // stops being a cannon.
  it('becomes stompable once a chicken ray has turned it into a bird', () => {
    const { world, cannon } = cannonWorld();
    world.arrows.push({ x: cannon.x + 2, y: cannon.y + 2, vx: 0, life: 60, isChicken: true });

    stepArrows(world);

    expect(cannon.alive).toBe(true);
    expect(cannon.type).toBe('chicken');
    expect(cannon.noStomp).toBe(false);
    expect(isGroundPatrol(cannon)).toBe(true); // and it walks now, so it is bodied

    cannon.noGravity = true;
    cannon.x = 100;
    cannon.y = 150;
    world.player.x = 98;
    world.player.y = 150 - world.player.h + 2;
    world.player.vy = 3;
    stepEnemy(world, cannon);

    expect(cannon.alive).toBe(false);
    expect(world.dead).toBe(false);
  });

  // The regression guard for `isGroundPatrol`. A cannon never moves, so calling it a
  // ground patroller looks harmless — but that question decides who runs the gravity
  // INTEGRATION and the floor snap, and the cannon has to run its own, exactly as live.
  // Get it wrong and the cannon's vy climbs to the clamp of 8 and stays there, spent by
  // nothing, for the whole level.
  it('falls, lands and keeps its vy at zero without any mover at all', () => {
    const { world, cannon } = cannonWorld();
    expect(isGroundPatrol(cannon)).toBe(false);
    cannon.y -= 64; // lift it well clear of the floor
    const droppedFrom = cannon.y;

    for (let f = 0; f < 60; f++) stepEnemy(world, cannon); // NO mover passed

    expect(cannon.y).toBeGreaterThan(droppedFrom); // it came down under its own gravity
    expect(cannon.vy).toBe(0); // and landed, rather than free-falling at the clamp
    expect(standsOnGround(world.map, cannon)).toBe(true);
    expect(cannon.x).toBe(30 * TILE); // and never moved sideways by a pixel
  });
});

describe('stepEnemies', () => {
  it('steps every enemy in world.enemies, not just the first', () => {
    const world = createWorld(0, 'normal');
    world.map = makeGround(30, 20);
    world.enemies.push(
      spawnEnemy(world.map, world.dc, { type: 'doll', x: 10 })!,
      spawnEnemy(world.map, world.dc, { type: 'car', x: 20 })!,
    );
    const [before1, before2] = world.enemies.map((e) => e.x);

    stepEnemies(world, testEnemyMove);

    // Both moved, and both leftward: the mover reached the second enemy as well as the
    // first. How far is testEnemyMove's business, not this test's.
    expect(world.enemies[0].x).toBeLessThan(before1);
    expect(world.enemies[1].x).toBeLessThan(before2);
  });

  // The mover is optional exactly as `PlayerMove` is, and the honest consequence of
  // leaving it out is that a ground patroller does not move. Pinned, because the
  // alternative — a silent second physics engine for whoever forgets to pass one — is
  // precisely what the seam exists to prevent.
  it('leaves a ground patroller exactly where it found it when handed no mover', () => {
    const world = createWorld(0, 'normal');
    world.map = makeGround(30, 20);
    world.enemies.push(spawnEnemy(world.map, world.dc, { type: 'doll', x: 10 })!);
    const before = { ...world.enemies[0] };

    for (let i = 0; i < 10; i++) stepEnemies(world);

    expect(world.enemies[0].x).toBe(before.x);
    expect(world.enemies[0].y).toBe(before.y);
  });
});

describe('stepWorld wiring', () => {
  it('spawns and steps enemies as part of the ordinary per-frame update', () => {
    const world = createWorld(0, 'normal');
    expect(world.enemies).toHaveLength(0);

    stepWorld(world, held({}), testMove, testEnemyMove);
    expect(world.enemies.length).toBeGreaterThan(0);

    const xBefore = world.enemies[0].x;
    stepWorld(world, held({}), testMove, testEnemyMove);
    expect(world.enemies[0].x).not.toBe(xBefore); // stepEnemies actually ran, mover and all
  });
});

// THESE COMPARISONS CHANGED WITH PLAN 7, TASK 3, and the note they used to carry said so
// in advance: they survived task 2 because Arcade had taken the player and nothing else,
// so the enemies were still the hand-rolled port of index.html, line for line, and
// comparing them against the original was still comparing like with like. That expired
// the moment the ground patrols got bodies of their own. Read again rather than patched,
// as that note asked, and split in two:
//
//   - RETIRED: every x/y/vx/vy comparison of a GROUND PATROLLER. The shipped answer to
//     where a doll ends up is Arcade's; the tests below cannot run Arcade, and comparing
//     `testEnemyMove` against index.html would be pinning a test helper to the original
//     while the code that ships goes unchecked. Worse than nothing, because it would look
//     like coverage. What that costs is real and is written down in PLAYTEST.md.
//   - KEPT, and still exact: the bat, the icebat and the bouncer, which are deliberately
//     NOT bodied (see EnemyMove in enemy.ts) and are still the hand-rolled port — so the
//     sine flight and the hop are still pinned frame for frame to the original. And, for
//     every type, the things that were never physics in the first place: WHICH enemies
//     stream in, in what order, on which frame, and the walk-cycle counter, all of which
//     are pure arithmetic over the camera and the frame number.
//
// The player's own x/y/vx/vy went the same way in task 2. It is driven here by `testMove`
// (tests/helpers/testMove.ts), which exists to get it onto the ground and out of the way.
describe('enemies vs. the live game', () => {
  it('streams in exactly the enemies the real update() does, when it does, and animates them the same', () => {
    const FRAMES = 90;
    const script = () => ({ left: false, right: false, jump: false, fire: false });
    const live = driveLiveGame({
      level: 0, difficulty: 'normal', character: 'gigi', frames: FRAMES, input: script,
    });

    const world = createWorld(0, 'normal');
    const port: EnemyState[][] = [];
    for (let i = 0; i < FRAMES; i++) {
      stepWorld(world, held(script()), testMove, testEnemyMove);
      port.push(world.enemies.map((e) => ({ ...e })));
    }

    // This window (camera never leaves 0 — the player holds still at spawn) only ever
    // streams in doll@15, doll@28 and car@40, all ground patrollers this port
    // implements, so the two arrays line up by index without needing to key by type
    // and spawn column — see enemy.ts's ENEMY_SPRITES map for which types those are.
    //
    // The spawn schedule is worth pinning on its own: `spawnEnemiesInView` reads the
    // camera, and the camera reads the player, so a frame's difference here would mean
    // the port had drifted somewhere upstream of the enemies entirely.
    for (let f = 0; f < FRAMES; f++) {
      expect(port[f].map((e) => e.type)).toEqual(live[f].enemies.map((e) => e.type));
      for (let i = 0; i < port[f].length; i++) {
        expect(port[f][i].alive).toBe(live[f].enemies[i].alive);
        expect(port[f][i].frame).toBe(live[f].enemies[i].frame);
        expect(port[f][i].frameTimer).toBe(live[f].enemies[i].frameTimer);
        expect(port[f][i].squashTimer).toBe(live[f].enemies[i].squashTimer);
      }
    }

    // Sanity: the player holds still for all 90 frames here, so nothing is ever
    // stomped — this window's job is the patrol frame flip, not the squash countdown.
    // 90 frames at a 15-frame threshold is enough to see doll@15 actually flip, more
    // than once, or this proves nothing about
    // `e.frameTimer++;if(e.frameTimer>15){e.frame=1-e.frame;...}`.
    const doll15Frames = port.map((frame) => frame[0]?.frame).filter((f) => f !== undefined);
    expect(new Set(doll15Frames).size).toBeGreaterThan(1);
    // And sanity of the other kind, now that positions are no longer compared: the
    // patrollers did move. Without this the loop above would pass over frozen enemies.
    expect(port[FRAMES - 1][0].x).toBeLessThan(port[0][0].x);
  });
});

describe('bat and bouncer vs. the live game', () => {
  afterEach(() => setRandom(Math.random));

  // A hold-right script reaching bat@48 or bouncer@73 would have to survive doll@15
  // first (it kills a hold-right script by contact around frame 60 — see
  // trace.test.ts's own comment on this exact problem), long before the camera's
  // spawn window even reaches column 42. Choreographing a script around it is a
  // detour with nothing to do with bats or bouncers, so this instead forces the
  // camera straight to x=700 before the first frame — precisely the same trick
  // enemy.test.ts's own "spawns every def in a mid-level window" test above uses on
  // world.camera.x, just on the live side too, via the new DriveOptions.beforeRun
  // hook (tests/helpers/liveGame.ts): `getCamera()` returns the live script's actual
  // `camera` object, not a copy, so setting `.x` on it moves the real thing.
  //
  // At camera.x=700 the spawn window is [42,84] (see that same test's own comment for
  // the arithmetic), which streams in car@40, bat@48, dino@55, doll@65, bouncer@73
  // and car@80 all on frame 0. The player never moves (held input is empty
  // throughout — this trace is not about the player), so the camera then lerps
  // straight back toward it every following frame, exactly as stepCamera/the live
  // lerp both do unprompted; that retreat is what later brings doll@28 (~frame 4) and
  // doll@15 (~frame 8) into the window too, from the far side. All eight enemies —
  // every type level 1 spawns, now — end up in play without a single scripted input.
  it('matches frame by frame once the camera brings them into the spawn window, with no script at all', () => {
    const FRAMES = 200; // comfortably short of frame 250, where doll@15 reaches the
    // stationary player by contact (measured against this exact scenario) — this
    // trace is about the bat and the bouncer, not that death, which trace.test.ts and
    // world.test.ts already cover on their own terms.
    const script = () => ({ left: false, right: false, jump: false, fire: false });
    setRandom(() => 0.5); // matches the live driver's own stubbed Math.random exactly

    const live = driveLiveGame({
      level: 0, difficulty: 'normal', character: 'gigi', frames: FRAMES, input: script,
      beforeRun: (d) => { d.getCamera().x = 700; },
    });

    const world = createWorld(0, 'normal');
    world.camera.x = 700;
    const port: typeof live = [];
    for (let f = 0; f < FRAMES; f++) {
      stepWorld(world, held(script()), testMove, testEnemyMove);
      const p = world.player;
      port.push({
        x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: p.onGround,
        frame: p.frame, frameTimer: p.frameTimer, animFrame: world.animFrame,
        camera: { x: world.camera.x, y: world.camera.y },
        enemies: world.enemies.map((e) => ({
          type: e.type, x: e.x, y: e.y, vx: e.vx, vy: e.vy, alive: e.alive,
          frame: e.frame, frameTimer: e.frameTimer, squashTimer: e.squashTimer,
        })),
        score: world.score,
      });
    }

    // Which types still have their POSITIONS compared, and it is the whole of this
    // test's remaining physics claim: bat, icebat and bouncer are deliberately not on
    // Arcade bodies (EnemyMove in enemy.ts), so they are still the hand-rolled port of
    // index.html and still comparable to it, line for line. The ground patrollers beside
    // them in this window — car@40, dino@55, doll@65, doll@28, doll@15, car@80 — are
    // Arcade's now, and only their spawn schedule and animation are compared. See the
    // note above the previous describe.
    const HAND_ROLLED = new Set(['bat', 'icebat', 'bouncer']);

    for (let f = 0; f < FRAMES; f++) {
      // The player's own x/y/vx/vy/onGround and the camera that follows them used to be
      // compared here too, and retired with plan 7 — see the note above this describe.
      // The player holds still at spawn (x=32) throughout either way, 600px west of the
      // nearest thing this window streams in, so nothing it does reaches these enemies.
      expect(port[f].enemies.map((e) => e.type)).toEqual(live[f].enemies.map((e) => e.type));
      for (let i = 0; i < port[f].enemies.length; i++) {
        expect(port[f].enemies[i].alive).toBe(live[f].enemies[i].alive);
        expect(port[f].enemies[i].frame).toBe(live[f].enemies[i].frame);
        expect(port[f].enemies[i].frameTimer).toBe(live[f].enemies[i].frameTimer);
        expect(port[f].enemies[i].squashTimer).toBe(live[f].enemies[i].squashTimer);
        if (!HAND_ROLLED.has(port[f].enemies[i].type)) continue;
        expect(port[f].enemies[i].x).toBe(live[f].enemies[i].x);
        expect(port[f].enemies[i].y).toBe(live[f].enemies[i].y);
        expect(port[f].enemies[i].vx).toBe(live[f].enemies[i].vx);
        // enemy vy is deliberately NOT compared: a noGravity flyer (bat/icebat) never
        // has its vy touched on the live side (index.html's gravity block, the only
        // place that ever assigns it, is skipped entirely for one), so it stays
        // `undefined` there forever — while this port's EnemyState always carries a
        // real number (0) for a field a type does not use, same as every other
        // ground patroller already does for fields it does not need either. A
        // representational difference between an ad-hoc live object and a uniformly
        // shaped one, not a physics difference; verified directly (not assumed) while
        // building this test.
      }
    }

    // Both of those types were actually in this window, or the loop above skipped every
    // position comparison it has left and the `continue` reads as coverage it is not.
    const compared = new Set(
      port.flatMap((f) => f.enemies.map((e) => e.type)).filter((t) => HAND_ROLLED.has(t)),
    );
    expect(compared).toEqual(new Set(['bat', 'bouncer']));

    // Sanity: both new behaviours actually happened here, or the equality checks
    // above prove nothing about them specifically.
    const batYs = port.flatMap((f) => f.enemies.filter((e) => e.type === 'bat').map((e) => e.y));
    expect(batYs.length).toBe(FRAMES); // bat@48 was in view from frame 0 onward
    expect(Math.max(...batYs) - Math.min(...batYs)).toBeGreaterThan(50); // a real sine sweep, not a held constant
    const bouncerVys = port.flatMap((f) => f.enemies.filter((e) => e.type === 'bouncer').map((e) => e.vy));
    expect(bouncerVys.some((vy) => vy < 0)).toBe(true); // it hopped at least once
    expect(bouncerVys.some((vy) => vy === 0)).toBe(true); // and rested between hops, too
    expect(world.dead).toBe(false); // see the FRAMES budget comment above
  });
});

// index.html:1542's `const shm=(dc.stompHitbox||1)*(p.bigHeadTimer>0?1.5:1)`. The two
// factors COMPOUND, and neither the fallback nor the multiplication can be seen from
// the traces this suite drives: `stompHitbox` exists on super_easy alone
// (difficulty.ts), and reaching it from a trace would mean walking a super_easy player
// into an enemy at an exact sub-pixel height, which no input script arranges. So this
// is port-side only, and deliberately so; the big head's OTHER two effects (the widened
// box and the 45-frame squash) are pinned against the live game in trace.test.ts, where
// normal difficulty can reach them.
describe('the big-head stomp multiplier compounds with dc.stompHitbox', () => {
  /**
   * One fixed geometry, three difficulties-and-timers. The player is placed so that its
   * stomp line (`p.y+p.h-4`, i.e. 170) falls in the narrow band that only the LARGEST
   * of the three reaches — the enemy's own box ends at 166.6 — while the overlap box
   * itself is satisfied in every case, so the only thing that varies is `shm`:
   *
   *   normal     + big head -> 1 * 1.5 = 1.5 -> line must clear 150.4 + 12.15 = 162.55
   *   super_easy no big head -> 2.0       -> ... 150.4 + 16.20 = 166.60
   *   super_easy + big head  -> 2.0 * 1.5 = 3.0 -> ... 150.4 + 24.30 = 174.70
   */
  function setup(difficulty: 'normal' | 'super_easy', bigHead: boolean) {
    const world = createWorld(0, difficulty);
    world.map = makeGround(20, 20); // ground far below; both actors float clear of it
    const enemy: EnemyState = {
      type: 'doll', x: 100, y: 150, vx: -0.8, vy: 0, w: 14.4, h: 16.2, alive: true,
      frame: 0, frameTimer: 0, squashTimer: 0,
      noGravity: false, originY: 0, sineOffset: 0, bounceTimer: 0, stunTimer: 0,
      shootTimer: 0, shootInterval: 0, noStomp: false,
      isChicken: false,
    };
    world.player = createPlayer(LEVELS[0], world.dc, 'gigi'); // w=16, h=24
    world.player.x = 98; // overlaps horizontally with AND without the 8px big-head widening
    world.player.y = 150; // stomp line at 170, between the 2.0 and 3.0 thresholds
    world.player.vy = 3; // falling — the stomp branch needs it
    if (bigHead) world.player.bigHeadTimer = 1200;
    return { world, enemy };
  }

  it('needs BOTH factors to reach this enemy — neither one alone is enough', () => {
    // 1.5 alone (big head at normal): too short — this is a hit, not a stomp.
    const a = setup('normal', true);
    // Read off the real records, so this fails loudly if the difficulty table ever
    // moves rather than quietly testing arithmetic against a stale assumption. normal
    // having NO stompHitbox at all is the whole reason the `||1` fallback is load-bearing.
    expect(a.world.dc.stompHitbox).toBeUndefined();
    stepEnemy(a.world, a.enemy);
    expect(a.enemy.alive).toBe(true);
    expect(a.world.dead).toBe(true);

    // 2.0 alone (super_easy, no big head): also too short, by 3.4px. super_easy is the
    // one difficulty whose players spawn already wearing a cape (`startWithCape`), so
    // the hit this case takes is ABSORBED rather than fatal — the point of the case is
    // that the enemy survives, and it still does. The cape is spent for super_easy's
    // own 120-frame window, which is `dc.invincibleTime`, NOT the 60 a pit save gives.
    const b = setup('super_easy', false);
    expect(b.world.dc.stompHitbox).toBe(2);
    stepEnemy(b.world, b.enemy);
    expect(b.enemy.alive).toBe(true);
    expect(b.world.dead).toBe(false);
    expect(b.world.player.hasCape).toBe(false);
    expect(b.world.player.invincible).toBe(120);

    // 2.0 * 1.5: reaches. If the two were added, or if either replaced the other, this
    // would be 3.5, 2.0 or 1.5 — and only the first of those also lands here, so the
    // 45-frame squash below is what separates a compounded 3.0 from a mistaken sum.
    const c = setup('super_easy', true);
    stepEnemy(c.world, c.enemy);
    expect(c.enemy.alive).toBe(false);
    expect(c.world.dead).toBe(false);
    expect(c.world.player.vy).toBe(-5);
    expect(c.enemy.squashTimer).toBe(45); // index.html:1546, not :1545's 30
    // super_easy's 0.5 multiplier, rounded at the award site like every other award.
    expect(c.world.score).toBe(Math.round(200 * c.world.dc.scoreMultiplier));
  });
});

// ============================================================================
// GHOST AND CANNON vs. THE LIVE GAME, frame for frame.
//
// This works where the ground patrollers' equivalent no longer can (see the note above
// the previous comparison): neither type was handed to Arcade. A ghost writes `x` and `y`
// outright and passes through walls; a cannon never moves at all. Both are still the
// hand-rolled port of index.html, so "close enough" is neither required nor accepted here
// — every field is compared exactly, and so is every fireball in the air.
//
// Two setups, because the ghost has two branches and no one run reaches both:
//
//   1. The player left at spawn, 900px from the ghost — the DRIFT branch, plus the
//      cannon's whole countdown-fire-reload cycle.
//   2. The player pinned 160px from the ghost — the HOMING branch.
//
// Both make the player INVINCIBLE every frame, on both sides. That is not a fudge: it
// gates only the stomp and the contact hit (index.html:1544), touches nothing either of
// these two enemies does, and removes the only thing that would otherwise end these
// traces early — a patroller wandering into a stationary player and killing them. Level
// 2's own defs put a dino within about 150 frames of the spawn point, which is less than
// two cannon cycles.
// ============================================================================
describe('ghost and cannon vs. the live game', () => {
  afterEach(() => setRandom(Math.random));

  const LEVEL = 1; // "level 2" on screen: cannon@29 and ghost@58, both in one spawn window
  const STILL = () => ({ left: false, right: false, jump: false, fire: false });
  /** Big enough that nothing can count it down inside a trace. */
  const IMMORTAL = 100000;

  interface EnemyRow {
    type: string; x: number; y: number; vx: number; vy: number; alive: boolean;
    frame: number; frameTimer: number; squashTimer: number;
    shootTimer: unknown; shootInterval: unknown;
  }
  interface Frame {
    enemies: EnemyRow[];
    shots: Array<{ x: number; y: number; vx: number; vy: number; life: number }>;
  }

  /**
   * The two fields the live object only ever ADDS to a cannon. Every other live enemy
   * reads `undefined` for them while this port carries a real 0 — the same
   * representational difference the bat's `vy` has (see the previous comparison) — so
   * they are normalised to `undefined` for anything but a cannon, and compared exactly
   * for a cannon, which is the only type that has them at all.
   */
  function shootFields(e: { type: string; shootTimer: number; shootInterval: number }) {
    if (e.type !== 'cannon') return { shootTimer: undefined, shootInterval: undefined };
    return { shootTimer: e.shootTimer, shootInterval: e.shootInterval };
  }

  function pinPlayer(p: { x: number; y: number; vx: number; vy: number; invincible: number },
    pin?: { x: number; y: number }): void {
    if (pin) {
      p.x = pin.x;
      p.y = pin.y;
      p.vx = 0;
      p.vy = 0;
    }
    p.invincible = IMMORTAL;
  }

  function drivePort(world: World, frames: number, pin?: { x: number; y: number }): Frame[] {
    const out: Frame[] = [];
    // Before the first step as well as after every one, mirroring the live side's
    // `beforeRun` + `onFrame` pair exactly. Pin only afterwards and frame 0 would have
    // the two players in different places, which — for a ghost — is a different branch.
    pinPlayer(world.player, pin);
    for (let f = 0; f < frames; f++) {
      stepWorld(world, held({}), testMove, testEnemyMove);
      pinPlayer(world.player, pin);
      out.push({
        enemies: world.enemies.map((e) => ({
          type: e.type, x: e.x, y: e.y, vx: e.vx, vy: e.vy, alive: e.alive,
          frame: e.frame, frameTimer: e.frameTimer, squashTimer: e.squashTimer,
          ...shootFields(e),
        })),
        shots: world.enemyProjectiles.map(
          (s) => ({ x: s.x, y: s.y, vx: s.vx, vy: s.vy, life: s.life }),
        ),
      });
    }
    return out;
  }

  function driveLive(frames: number, cameraX: number, pin?: { x: number; y: number }): Frame[] {
    const out: Frame[] = [];
    driveLiveGame({
      level: LEVEL,
      difficulty: 'normal',
      character: 'gigi',
      frames,
      input: STILL,
      beforeRun: (d) => {
        d.getCamera().x = cameraX;
        pinPlayer(d.getPlayer() as unknown as Parameters<typeof pinPlayer>[0], pin);
      },
      onFrame: (d) => {
        pinPlayer(d.getPlayer() as unknown as Parameters<typeof pinPlayer>[0], pin);
        out.push({
          enemies: d.getEnemies().map((e) => ({
            type: e.type, x: e.x, y: e.y, vx: e.vx, vy: e.vy, alive: !!e.alive,
            frame: e.frame, frameTimer: e.frameTimer, squashTimer: e.squashTimer,
            shootTimer: e.shootTimer, shootInterval: e.shootInterval,
          })),
          shots: d.getEnemyProjectiles(),
        });
      },
    });
    return out;
  }

  /** The types both sides still move by hand, and so the only ones positionally compared. */
  const HAND_ROLLED = new Set(['ghost', 'bat', 'icebat', 'cannon', 'bouncer']);

  function compare(port: Frame[], live: Frame[]): void {
    expect(port.length).toBe(live.length);
    for (let f = 0; f < port.length; f++) {
      expect(port[f].enemies.map((e) => e.type), `types diverged on frame ${f}`)
        .toEqual(live[f].enemies.map((e) => e.type));
      // Every fireball in the air, every field of it, every frame — the cannon's shot is
      // as much a part of this port as the cannon.
      expect(port[f].shots, `fireballs diverged on frame ${f}`).toEqual(live[f].shots);
      for (let i = 0; i < port[f].enemies.length; i++) {
        const a = port[f].enemies[i];
        const b = live[f].enemies[i];
        expect(a.alive, `alive diverged on frame ${f}`).toBe(b.alive);
        expect(a.frame, `frame diverged on frame ${f}`).toBe(b.frame);
        expect(a.frameTimer, `frameTimer diverged on frame ${f}`).toBe(b.frameTimer);
        expect(a.squashTimer, `squashTimer diverged on frame ${f}`).toBe(b.squashTimer);
        expect(a.shootTimer, `${a.type} shootTimer diverged on frame ${f}`).toBe(b.shootTimer);
        expect(a.shootInterval, `${a.type} shootInterval on frame ${f}`).toBe(b.shootInterval);
        if (!HAND_ROLLED.has(a.type)) continue;
        expect(a.x, `${a.type} x diverged on frame ${f}`).toBe(b.x);
        expect(a.y, `${a.type} y diverged on frame ${f}`).toBe(b.y);
        expect(a.vx, `${a.type} vx diverged on frame ${f}`).toBe(b.vx);
      }
    }
  }

  it('a drifting ghost and a firing cannon match exactly, fireballs included', () => {
    const FRAMES = 260; // two full cannon cycles: it fires on frame 90 and again on 180
    const CAMERA_X = 400; // window [24,66] — cannon@29 and ghost@58 both spawn on frame 0
    setRandom(() => 0.5); // matches the live driver's own stubbed Math.random exactly

    const live = driveLive(FRAMES, CAMERA_X);
    const world = createWorld(LEVEL, 'normal');
    world.camera.x = CAMERA_X;
    const port = drivePort(world, FRAMES);

    compare(port, live);

    // The `continue` above must not be reading as coverage it is not: both types were
    // really in this window.
    const seen = new Set(port.flatMap((f) => f.enemies.map((e) => e.type)));
    expect(seen.has('ghost')).toBe(true);
    expect(seen.has('cannon')).toBe(true);

    // And both behaviours really happened, or the equalities prove nothing about them.
    const ghosts = port.flatMap((f) => f.enemies.filter((e) => e.type === 'ghost'));
    expect(new Set(ghosts.map((g) => g.x)).size).toBe(1); // DRIFTED: never moved sideways
    const ghostYs = ghosts.map((g) => g.y);
    expect(Math.max(...ghostYs) - Math.min(...ghostYs)).toBeGreaterThan(25); // a real sine
    expect(new Set(ghosts.map((g) => Math.sign(g.vx)))).toEqual(new Set([-1])); // faced west
    expect(port.filter((f) => f.shots.length > 0).length).toBeGreaterThan(100); // it fired
  });

  it('a homing ghost matches exactly, chasing a player it can see', () => {
    const FRAMES = 200;
    const CAMERA_X = 400;
    const PIN_TILE = 48; // ghost@58 is 160px east of this, inside normal's 200px range
    setRandom(() => 0.5);

    const world = createWorld(LEVEL, 'normal');
    const pin = {
      x: PIN_TILE * TILE,
      y: findGroundY(world.map, PIN_TILE) - world.player.h,
    };

    const live = driveLive(FRAMES, CAMERA_X, pin);
    world.camera.x = CAMERA_X;
    const port = drivePort(world, FRAMES, pin);

    compare(port, live);

    // It really chased, rather than hanging on its sine.
    const ghosts = port.flatMap((f) => f.enemies.filter((e) => e.type === 'ghost'));
    expect(ghosts.length).toBeGreaterThan(0);
    expect(ghosts[ghosts.length - 1].x).toBeLessThan(ghosts[0].x - 50); // came west
    expect(new Set(ghosts.map((g) => Math.sign(g.vx)))).toEqual(new Set([-1]));
  });
});

/**
 * The cannon's shot is a bare `playTone` inside `update()` (index.html:1535), like the
 * boss's three — no named `sfx*` function for tests/sfx.test.ts to load and call. So the
 * port's copy is checked the one way left, exactly as boss.test.ts checks the fight's
 * three: the call it was transcribed from has to still be in index.html, spelled like
 * this. That the numbers are NOT the boss's is the trap this guards.
 */
describe('the cannon tone is the live game\'s', () => {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const source = fs.readFileSync(path.resolve(here, '../../index.html'), 'utf8');

  it('is still spelled that way (index.html:1535)', () => {
    expect(source).toContain("playTone(150,.1,'sawtooth',.08,300)");
  });

  it('is not the boss\'s fireball, which is the same wave sliding the other way', () => {
    expect(source).toContain("playTone(150,.2,'sawtooth',.08,80)"); // index.html:1572
  });
});
