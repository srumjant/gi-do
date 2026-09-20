// Port of index.html:1361-1423 (player movement) plus the construction at
// index.html:1166-1171. Pinned to level 0 ("Doll Garden") and 'normal' difficulty
// throughout, per the task: gap positions shift with difficulty, so nothing here
// hardcodes a tile-x for the gap — tests either derive it by walking the real
// generated map, or (for the wall test, where no real wall exists at player height)
// build one into a copy of that map.
import { describe, expect, it } from 'vitest';
import { driveLiveGame } from './helpers/liveGame';
import { createPlayer, stepPlayer, GRND_DECEL } from '../src/game/player';
import { createWorld, stepWorld } from '../src/game/world';
import { emptyInput, type InputState } from '../src/input/actions';
import { LEVELS, TILE_GROUND } from '../src/data/levels';
import { GIGI_SKINS, DODO_SKINS } from '../src/data/sprites';
import { TILE, GRAVITY } from '../src/config/constants';
import type { World } from '../src/game/types';

function held(overrides: Partial<InputState>): InputState {
  return { ...emptyInput(), ...overrides };
}

function makeWorld(character: 'gigi' | 'dodo' = 'gigi'): World {
  return createWorld(0, 'normal', character);
}

describe('createPlayer', () => {
  it('sizes gigi from the ported sprite data, not a hardcoded constant', () => {
    const p = createPlayer(LEVELS[0], 'gigi');
    const stand = GIGI_SKINS[0].stand;
    expect(p.w).toBe(stand[0].length * 2 - 4);
    expect(p.h).toBe(stand.length * 2 - 4);
    expect(p.w).toBe(16);
    expect(p.h).toBe(24);
  });

  it('sizes dodo from the ported sprite data, not a hardcoded constant', () => {
    const p = createPlayer(LEVELS[0], 'dodo');
    const stand = DODO_SKINS[0].stand;
    expect(p.w).toBe(stand[0].length * 2 - 4);
    expect(p.h).toBe(stand.length * 2 - 4);
    expect(p.w).toBe(16);
    expect(p.h).toBe(20);
  });

  it('starts airborne at the level\'s playerStart, in pixels', () => {
    const level = LEVELS[0];
    const p = createPlayer(level, 'gigi');
    expect(p.x).toBe(level.playerStart[0] * TILE);
    expect(p.y).toBe(level.playerStart[1] * TILE);
    expect(p.vx).toBe(0);
    expect(p.vy).toBe(0);
    expect(p.onGround).toBe(false);
    expect(p.facing).toBe(1);
    expect(p.coyoteTime).toBe(0);
    expect(p.jumpBuffer).toBe(0);
  });
});

describe('horizontal movement', () => {
  it('accelerates to dc.playerSpeed and no further', () => {
    const world = makeWorld();
    const seen: number[] = [];
    for (let i = 0; i < 30; i++) {
      stepPlayer(world, held({ right: true }));
      seen.push(world.player.vx);
    }
    expect(seen.every((v) => v <= world.dc.playerSpeed)).toBe(true);
    expect(world.player.vx).toBe(world.dc.playerSpeed);
  });

  it('decelerates multiplicatively and snaps to exactly 0', () => {
    const world = makeWorld();
    // Holding right from spawn caps vx well before it lands (confirmed against the
    // live game while developing this port); 10 frames lands it on the ground with
    // vx already at the cap, so deceleration below is the grounded rate (0.72).
    for (let i = 0; i < 10; i++) stepPlayer(world, held({ right: true }));
    expect(world.player.onGround).toBe(true);
    expect(world.player.vx).toBe(world.dc.playerSpeed);

    const before = world.player.vx;
    stepPlayer(world, emptyInput());
    expect(world.player.vx).toBeCloseTo(before * GRND_DECEL, 10);

    for (let i = 0; i < 30; i++) stepPlayer(world, emptyInput());
    expect(world.player.vx).toBe(0);
  });
});

describe('jump', () => {
  function landedWorld(): World {
    const world = makeWorld();
    for (let i = 0; i < 10; i++) stepPlayer(world, emptyInput());
    expect(world.player.onGround).toBe(true); // sanity: the setup itself landed
    return world;
  }

  it('opens at dc.jumpForce + 0.4 (jump force plus one frame of gravity) and leaves the ground', () => {
    const world = landedWorld();
    stepPlayer(world, held({ jump: true, jumpPressed: true }));
    expect(world.player.onGround).toBe(false);
    expect(world.player.vy).toBeCloseTo(world.dc.jumpForce + GRAVITY, 10);
  });

  it('releasing early cuts the rise to dc.jumpForce * 0.4', () => {
    const world = landedWorld();
    stepPlayer(world, held({ jump: true, jumpPressed: true }));
    // Released on the very next frame. The cut lands at jumpForce*0.4 mid-frame, and
    // that same frame's gravity still applies on top of it — isApex is false here
    // because |jumpForce*0.4| (3.0) is not under the 1.5 apex threshold.
    stepPlayer(world, emptyInput());
    expect(world.player.vy).toBeCloseTo(world.dc.jumpForce * 0.4 + GRAVITY, 10);
  });
});

describe('coyote time', () => {
  // Walks right off the real gap in level 1's generated map, so onGround flips
  // true -> false because the ground disappeared underfoot, not because of a jump
  // (a jump zeroes coyoteTime itself, which would defeat this test).
  function walkOffLedge(): World {
    const world = makeWorld();
    let wasGrounded = false;
    for (let i = 0; i < 200; i++) {
      stepPlayer(world, held({ right: true }));
      if (wasGrounded && !world.player.onGround) return world;
      wasGrounded = world.player.onGround;
    }
    throw new Error('never walked off a ledge within 200 frames');
  }

  it('a jump within coyote time after walking off a ledge still fires', () => {
    const world = walkOffLedge();
    expect(world.player.coyoteTime).toBeGreaterThan(0);
    const vyBefore = world.player.vy;
    stepPlayer(world, held({ right: true, jump: true, jumpPressed: true }));
    expect(world.player.vy).toBeLessThan(vyBefore); // overwritten by a jump, not just gravity
    expect(world.player.vy).toBeCloseTo(world.dc.jumpForce + GRAVITY, 10);
  });

  it('a jump after coyote time has expired does NOT fire', () => {
    const world = walkOffLedge();
    // coyoteTime is set to 6 on the leave frame, then decremented (and checked AFTER
    // the decrement) on every airborne frame since: 6,5,4,3,2,1,0 over frames
    // 0..6 after leaving. 5 filler frames land on "1"; the 6th (the jump attempt
    // itself) decrements it to 0 before canJump is checked, so it just misses.
    for (let i = 0; i < 5; i++) stepPlayer(world, held({ right: true }));
    expect(world.player.coyoteTime).toBe(1);
    const vyBefore = world.player.vy;
    stepPlayer(world, held({ right: true, jump: true, jumpPressed: true }));
    expect(world.player.coyoteTime).toBe(0);
    expect(world.player.vy).toBeGreaterThan(vyBefore); // gravity only, no jump happened
  });
});

describe('jump buffer', () => {
  function framesToLand(): number {
    const world = makeWorld();
    for (let calls = 1; calls <= 60; calls++) {
      stepPlayer(world, emptyInput());
      if (world.player.onGround) return calls;
    }
    throw new Error('never landed within 60 frames');
  }

  // Held continuously from pressCall onward (not tapped-and-released): confirmed
  // against the live game while developing this port that a buffered jump tapped and
  // released well before landing still "fires", but the variable-jump-height cut
  // (index.html:1386) applies in the very same frame, since it only looks at whether
  // the button is CURRENTLY held — it has no idea the jump came from the buffer. That
  // is real live-game behaviour, not a porting bug, but it would muddy this test, so
  // this holds the button down through landing to isolate the buffer itself.
  it('a jump pressed while falling fires on landing (the buffer), within 8 frames', () => {
    const landingCall = framesToLand();
    const world = makeWorld();
    // The buffer is set to 8 and immediately decremented the same frame it is
    // pressed (see player.ts), and onGround only becomes visible to the buffer check
    // one frame after the floor is actually hit — so the latest press that still
    // carries through to landing is 5 frames before the landing call, not 8.
    const pressCall = landingCall - 5;
    for (let call = 1; call <= landingCall; call++) {
      stepPlayer(world, held({ jump: call >= pressCall, jumpPressed: call === pressCall }));
    }
    expect(world.player.onGround).toBe(true); // landed as expected

    stepPlayer(world, held({ jump: true })); // still held: first grounded frame, buffer fires
    expect(world.player.onGround).toBe(false);
    expect(world.player.vy).toBeCloseTo(world.dc.jumpForce + GRAVITY, 10);
  });

  it('pressed one frame earlier than that, the buffer has already run out', () => {
    const landingCall = framesToLand();
    const world = makeWorld();
    const pressCall = landingCall - 6;
    for (let call = 1; call <= landingCall; call++) {
      stepPlayer(world, held({ jump: call >= pressCall, jumpPressed: call === pressCall }));
    }
    expect(world.player.onGround).toBe(true);

    stepPlayer(world, held({ jump: true }));
    expect(world.player.onGround).toBe(true); // no rebound: the buffer had expired
  });
});

describe('wall collision', () => {
  // No real level has a vertical wall at player height: makeGround only writes the
  // bottom two rows and addPlats writes a single row, so nothing stacks into something
  // the player could run into. One is injected — into the live game as well as the
  // port, so this is a real comparison rather than a test of the port against itself.
  const WALL_TX = 6; // ahead of spawn (tile 2), well short of the tile-20 gap
  const buildWall = (map: number[][]): void => {
    for (let ty = 0; ty < map.length; ty++) map[ty][WALL_TX] = TILE_GROUND;
  };

  it('holds the player against the wall exactly as the live game does', () => {
    const FRAMES = 45;
    const live = driveLiveGame({
      level: 0, difficulty: 'normal', character: 'gigi', frames: FRAMES,
      input: () => ({ left: false, right: true, jump: false }),
      mutateMap: buildWall,
    });

    const world = makeWorld();
    world.map = world.map.map((row) => row.slice());
    buildWall(world.map);

    const port = [];
    for (let i = 0; i < FRAMES; i++) {
      // The live update() does a whole frame every call — camera lerp and enemy
      // spawn/step included, not just player movement — and driveLiveGame's Sample now
      // carries camera and enemies too. stepWorld (rather than stepPlayer alone) is
      // what keeps the port side comparable to that frame for frame: doll@15, doll@28
      // and car@40 (level 0's enemyDefs) all spawn during this run, but stay far from
      // the player, who never leaves the wall's neighbourhood near spawn, so they do
      // not perturb the player physics this test is actually about.
      stepWorld(world, held({ right: true }));
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

    expect(port).toEqual(live);
  });

  // Holding right against a wall does NOT settle at rest. The snap leaves the player
  // one pixel clear (the +1 at index.html:1397), so the next frame's 0.6 of
  // acceleration does not quite reach the wall, and the frame after that does — giving
  // a two-frame cycle where x alternates by 0.6px and vx alternates 0 / 0.6. Verified
  // against the live game, which jitters identically. It is preserved, not fixed.
  it('oscillates against the wall rather than coming to rest', () => {
    const world = makeWorld();
    world.map = world.map.map((row) => row.slice());
    buildWall(world.map);

    for (let i = 0; i < 30; i++) stepPlayer(world, held({ right: true }));

    const snapped = WALL_TX * TILE - world.player.w + 1;
    const xs = new Set<number>();
    const vxs = new Set<number>();
    for (let i = 0; i < 12; i++) {
      stepPlayer(world, held({ right: true }));
      xs.add(world.player.x);
      vxs.add(world.player.vx);
      // Whatever the phase, the player never penetrates the wall.
      expect(world.player.x + world.player.w - 2).toBeLessThan(WALL_TX * TILE);
    }
    expect([...xs].sort((a, b) => a - b)).toEqual([snapped, snapped + 0.6]);
    expect([...vxs].sort((a, b) => a - b)).toEqual([0, 0.6]);
  });
});

describe('left clamp', () => {
  it('the player cannot go left of x = 0', () => {
    const world = makeWorld();
    for (let i = 0; i < 40; i++) stepPlayer(world, held({ left: true }));
    expect(world.player.x).toBe(0);
    for (let i = 0; i < 10; i++) stepPlayer(world, held({ left: true }));
    expect(world.player.x).toBe(0); // stays clamped, never negative
  });
});

describe('pit death', () => {
  it('falling past the pit threshold sets world.dead and then freezes position and velocity', () => {
    const world = makeWorld();
    let died = false;
    for (let i = 0; i < 400; i++) {
      stepPlayer(world, held({ right: true }));
      if (world.dead) { died = true; break; }
    }
    expect(died).toBe(true);
    expect(world.player.y).toBeGreaterThan(world.level.height * TILE + 32);

    const frozen = {
      x: world.player.x, y: world.player.y, vx: world.player.vx, vy: world.player.vy,
    };
    for (let i = 0; i < 15; i++) stepPlayer(world, held({ right: true }));
    expect(world.player.x).toBe(frozen.x);
    expect(world.player.y).toBe(frozen.y);
    expect(world.player.vx).toBe(frozen.vx);
    expect(world.player.vy).toBe(frozen.vy);
    expect(world.dead).toBe(true);
  });
});
