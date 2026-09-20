// Port of the streaming enemy spawn (index.html:1212-1222, 1358) and the per-enemy step
// (index.html:1524-1547), restricted to ground patrollers (doll, car, dino, penguin).
// Ghost, bat/icebat, cannon and bouncer are streamed types this slice does not
// implement; see enemy.ts for where they are recognised and skipped rather than
// half-simulated.
import { describe, expect, it } from 'vitest';
import { driveLiveGame } from './helpers/liveGame';
import { spawnEnemy, stepEnemy } from '../src/game/enemy';
import { createWorld, spawnEnemiesInView, stepEnemies, stepWorld } from '../src/game/world';
import { createPlayer } from '../src/game/player';
import { LEVELS, makeGround, TILE_GROUND } from '../src/data/levels';
import { emptyInput, type InputState } from '../src/input/actions';
import { TILE } from '../src/config/constants';
import type { EnemyState, World } from '../src/game/types';

function held(overrides: Partial<InputState>): InputState {
  return { ...emptyInput(), ...overrides };
}

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

  it('marks streamed types this slice does not implement as spawned, without ever spawning them', () => {
    const world = createWorld(0, 'normal');
    // Window [42,84]: bat@48, dino@55, doll@65, bouncer@73, car@80 (level 0's defs).
    world.camera.x = 700;
    spawnEnemiesInView(world);

    const inWindow = world.pending.filter((d) => d.x >= 42 && d.x <= 84);
    expect(inWindow.every((d) => d.spawned)).toBe(true);
    expect(world.enemies.map((e) => e.type).sort()).toEqual(['car', 'dino', 'doll']);
    expect(world.enemies.some((e) => e.type === 'bat' || e.type === 'bouncer')).toBe(false);
  });

  it('never spawns the same def twice', () => {
    const world = createWorld(0, 'normal');
    spawnEnemiesInView(world);
    spawnEnemiesInView(world);
    expect(world.enemies).toHaveLength(3);
  });
});

describe('stepEnemy', () => {
  it('falls under gravity, snaps to the ground, and then stays there', () => {
    const world = createWorld(0, 'normal');
    world.map = makeGround(30, 20); // flat ground, rows 18-19 — no platforms to complicate the fall
    const enemy = spawnEnemy(world.map, world.dc, { type: 'doll', x: 10 })!;
    const restY = enemy.y;
    enemy.y -= 64; // lift it well above its natural ground-contact spawn point

    for (let i = 0; i < 30; i++) stepEnemy(world, enemy);

    expect(enemy.y).toBe(restY);
    expect(enemy.vy).toBe(0);

    stepEnemy(world, enemy); // idempotent once grounded
    expect(enemy.y).toBe(restY);
    expect(enemy.vy).toBe(0);
  });

  it('patrols leftward at a steady vx while the ground underneath is flat', () => {
    const world = createWorld(0, 'normal');
    world.map = makeGround(30, 20);
    const enemy = spawnEnemy(world.map, world.dc, { type: 'doll', x: 10 })!;

    const startX = enemy.x;
    for (let i = 1; i <= 10; i++) {
      stepEnemy(world, enemy);
      expect(enemy.x).toBeCloseTo(startX - i * 0.8, 10);
      expect(enemy.vx).toBe(-0.8);
      expect(enemy.vy).toBe(0); // resting on flat ground the whole time
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
      stepEnemy(world, enemy);
      minX = Math.min(minX, enemy.x);
    }

    expect(enemy.vx).toBeGreaterThan(0); // turned away from the wall
    // No position correction on an enemy wall hit, unlike the player's (index.html has
    // none — only the vx flip) — it can end up briefly inside the wall tile, but never
    // clear through to the wall's far side.
    expect(minX).toBeGreaterThan(WALL_TX * TILE);
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

    for (let i = 0; i < 80; i++) stepEnemy(world, enemy);

    expect(enemy.vx).toBeGreaterThan(0); // turned away from the drop
    expect(enemy.alive).toBe(true); // never fell
    expect(enemy.vy).toBe(0); // still grounded, never airborne
    expect(enemy.x).toBeGreaterThan(LEDGE_TX * TILE - enemy.w); // never walked past the edge
  });

  describe('stomp', () => {
    function stompSetup(): { world: World; enemy: EnemyState } {
      const world = createWorld(0, 'normal');
      world.map = makeGround(20, 20); // ground far below; both actors float clear of it
      const enemy: EnemyState = {
        type: 'doll', x: 100, y: 150, vx: -0.8, vy: 0, w: 14.4, h: 16.2, alive: true,
        frame: 0, frameTimer: 0, squashTimer: 0,
      };
      world.player = createPlayer(LEVELS[0], 'gigi'); // w=16, h=24
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
      // Side/rising contact now calls playerHit (death, no cape in this slice) — but
      // playerDie only touches world.dead/lives/stateTimer, never player.vy, so vy
      // stays exactly what it was going in.
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
    };
    world.player = createPlayer(LEVELS[0], 'gigi');
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

    stepEnemies(world);

    expect(world.enemies[0].x).toBeCloseTo(before1 - 0.8, 10);
    expect(world.enemies[1].x).toBeCloseTo(before2 - 0.8, 10);
  });
});

describe('stepWorld wiring', () => {
  it('spawns and steps enemies as part of the ordinary per-frame update', () => {
    const world = createWorld(0, 'normal');
    expect(world.enemies).toHaveLength(0);

    stepWorld(world, held({}));
    expect(world.enemies.length).toBeGreaterThan(0);

    const xBefore = world.enemies[0].x;
    stepWorld(world, held({}));
    expect(world.enemies[0].x).not.toBe(xBefore); // stepEnemies actually ran
  });
});

describe('enemies vs. the live game', () => {
  it('spawns and patrols identically to the real update(), while the player holds still', () => {
    const FRAMES = 90;
    const script = () => ({ left: false, right: false, jump: false });
    const live = driveLiveGame({
      level: 0, difficulty: 'normal', character: 'gigi', frames: FRAMES, input: script,
    });

    const world = createWorld(0, 'normal');
    const port: EnemyState[][] = [];
    for (let i = 0; i < FRAMES; i++) {
      stepWorld(world, held(script()));
      port.push(world.enemies.map((e) => ({ ...e })));
    }

    // This window (camera never leaves 0 — the player holds still at spawn) only ever
    // streams in doll@15, doll@28 and car@40, all ground patrollers this port
    // implements, so the two arrays line up by index without needing to key by type
    // and spawn column — see enemy.ts's ENEMY_SPRITES map for which types those are.
    for (let f = 0; f < FRAMES; f++) {
      expect(port[f].map((e) => e.type)).toEqual(live[f].enemies.map((e) => e.type));
      for (let i = 0; i < port[f].length; i++) {
        expect(port[f][i].x).toBeCloseTo(live[f].enemies[i].x, 9);
        expect(port[f][i].y).toBeCloseTo(live[f].enemies[i].y, 9);
        expect(port[f][i].vx).toBeCloseTo(live[f].enemies[i].vx, 9);
        expect(port[f][i].vy).toBeCloseTo(live[f].enemies[i].vy, 9);
        expect(port[f][i].alive).toBe(live[f].enemies[i].alive);
        expect(port[f][i].frame).toBe(live[f].enemies[i].frame);
        expect(port[f][i].frameTimer).toBe(live[f].enemies[i].frameTimer);
        expect(port[f][i].squashTimer).toBe(live[f].enemies[i].squashTimer);
      }
    }

    // Sanity: the player holds still for all 90 frames here, so nothing is ever
    // stomped — this window's job is the patrol frame flip, not the squash countdown
    // (see trace.test.ts's STOMP_SCRIPT trace for that). 90 frames at a 15-frame
    // threshold is enough to see doll@15 actually flip, more than once, or this proves
    // nothing about `e.frameTimer++;if(e.frameTimer>15){e.frame=1-e.frame;...}`.
    const doll15Frames = port.map((frame) => frame[0]?.frame).filter((f) => f !== undefined);
    expect(new Set(doll15Frames).size).toBeGreaterThan(1);
  });
});
