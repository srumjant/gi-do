// Port of the streaming enemy spawn (index.html:1212-1222, 1358) and the per-enemy step
// (index.html:1524-1547): ground patrollers (doll, car, dino, penguin), plus bat/icebat
// (sine-wave flight) and bouncer (hops) — every type level 1 actually spawns. Ghost and
// cannon are the two streamed types this slice still does not implement; see enemy.ts
// for where they are recognised and skipped rather than half-simulated.
import { afterEach, describe, expect, it } from 'vitest';
import { driveLiveGame } from './helpers/liveGame';
import { testEnemyMove, testMove } from './helpers/testMove';
import { chickenify, isGroundPatrol, spawnEnemy, stepEnemy } from '../src/game/enemy';
import { setRandom } from '../src/game/random';
import { createWorld, spawnEnemiesInView, stepEnemies, stepWorld } from '../src/game/world';
import { createPlayer } from '../src/game/player';
import { getTile, isSolid } from '../src/game/tiles';
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

  it('returns undefined for streamed types this slice still does not implement', () => {
    const world = createWorld(0, 'normal');
    // ghost and cannon are the two types left out after this task (see enemy.ts's
    // ENEMY_SPRITES) — neither appears in level 0's own enemyDefs, so this is the only
    // remaining coverage of the skip path at all; everything level 0 actually streams
    // (doll, car, dino, bat, bouncer) is a real spawn now, exercised below instead.
    expect(spawnEnemy(world.map, world.dc, { type: 'ghost', x: 10 })).toBeUndefined();
    expect(spawnEnemy(world.map, world.dc, { type: 'cannon', x: 10 })).toBeUndefined();
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
