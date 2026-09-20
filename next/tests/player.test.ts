// Port of index.html:1361-1423 (player movement) plus the construction at
// index.html:1166-1171. Pinned to level 0 ("Doll Garden") and 'normal' difficulty
// throughout, per the task: gap positions shift with difficulty, so nothing here
// hardcodes a tile-x for the gap — tests either derive it by walking the real
// generated map, or (for the wall test, where no real wall exists at player height)
// build one into a copy of that map.
import { afterEach, describe, expect, it } from 'vitest';
import { driveLiveGame } from './helpers/liveGame';
import {
  createPlayer, giveRandomSillyPowerup, stepPlayer, GRND_DECEL,
} from '../src/game/player';
import { setRandom } from '../src/game/random';
import { createWorld, respawnLevel, stepWorld } from '../src/game/world';
import { emptyInput, type InputState } from '../src/input/actions';
import { LEVELS, TILE_GROUND } from '../src/data/levels';
import { GIGI_SKINS, DODO_SKINS } from '../src/data/sprites';
import { TILE, GRAVITY } from '../src/config/constants';
import { findGroundY } from '../src/game/tiles';
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
      input: () => ({ left: false, right: true, jump: false, fire: false }),
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

// Port of index.html:1148-1156. The one place in this plan where unit tests genuinely
// earn their keep: the trace harness stubs Math.random to a constant 0.5, and
// `Math.floor(0.5*3)` is 1, so the live game's own draw ALWAYS lands on `bighead` —
// and nothing calls this function until the rainbow block does (the next task), so a
// trace cannot reach it at all yet. Pinning the injected value is the only way to see
// the other two branches. One test per branch, asserting the state that branch sets;
// what each power-up then DOES is covered against the live game in trace.test.ts.
describe('giveRandomSillyPowerup', () => {
  afterEach(() => setRandom(Math.random)); // never leak a stub into an unrelated test

  /**
   * `types[Math.floor(r*3)]`, so r<1/3 picks fart, r<2/3 bighead, else chicken. These
   * are the midpoints of the three thirds, not boundary values: this is testing which
   * branch does what, not how the index is computed.
   */
  const PICKS = { fart: 1 / 6, bighead: 0.5, chicken: 5 / 6 };

  it('fart sets a 900-frame timer and nothing else', () => {
    const world = makeWorld();
    setRandom(() => PICKS.fart);
    giveRandomSillyPowerup(world);

    expect(world.player.fartTimer).toBe(900);
    expect(world.player.bigHeadTimer).toBe(0);
    expect(world.player.chickenRayCharges).toBe(0);
    expect(world.player.hasBow).toBe(false);
    expect(world.powerupPopup).toEqual({ type: 'fart', timer: 120, maxTimer: 120 });
  });

  it('bighead sets a 1200-frame timer and nothing else — the only branch a trace could reach', () => {
    const world = makeWorld();
    // Also exactly what the live game draws under the trace harness's constant 0.5.
    setRandom(() => PICKS.bighead);
    giveRandomSillyPowerup(world);

    expect(world.player.bigHeadTimer).toBe(1200);
    expect(world.player.fartTimer).toBe(0);
    expect(world.player.chickenRayCharges).toBe(0);
    expect(world.player.hasBow).toBe(false);
    expect(world.powerupPopup).toEqual({ type: 'bighead', timer: 120, maxTimer: 120 });
  });

  it('chicken sets EIGHT ray charges and hasBow as well — two fields, not one flag', () => {
    const world = makeWorld();
    setRandom(() => PICKS.chicken);
    giveRandomSillyPowerup(world);

    expect(world.player.chickenRayCharges).toBe(8);
    // hasBow too: the chicken ray rides the bow's firing path (index.html:1392-1396)
    // rather than having one of its own, so both are consulted. And the 8 is a flat
    // literal, NOT dc.bowCharges — which is 3 at normal, so this would fail if the
    // difficulty record had been used by mistake.
    expect(world.player.hasBow).toBe(true);
    expect(world.dc.bowCharges).toBe(3);
    // ...and it does not touch bowCharges itself, so a chicken ray on its own leaves
    // hasBow true with zero arrows behind it.
    expect(world.player.bowCharges).toBe(0);
    expect(world.player.fartTimer).toBe(0);
    expect(world.player.bigHeadTimer).toBe(0);
    expect(world.powerupPopup).toEqual({ type: 'chicken', timer: 120, maxTimer: 120 });
  });
});

// index.html:1276 — the second line of update(), right after `animFrame++` and above
// every other state check. This is the reason `powerupPopup` is simulation state and
// not HUD state: while it exists, update() returns immediately and NOTHING moves.
// Unreachable in play until the rainbow block calls giveRandomSillyPowerup, so no
// trace can cover it; pinned here instead.
describe('the power-up popup freezes the whole world', () => {
  afterEach(() => setRandom(Math.random));

  function snapshot(world: World): string {
    return JSON.stringify({
      player: world.player, enemies: world.enemies, camera: world.camera,
    });
  }

  it('stops the player, the enemies and the camera for exactly 120 frames, but not animFrame', () => {
    setRandom(() => 0.5); // a bat streams in below and draws its sineOffset from this
    const world = makeWorld();
    // "Nothing moves" has to be a claim about three moving things, not about an empty
    // world — so: enemies streamed in, and a camera actually mid-lerp. The camera only
    // leaves 0 once the player passes VIEW_W/2 - p.w/2 (~205px), and doll@15 kills a
    // hold-right player at frame 60 while it is still short of that, so this teleports
    // rather than walks — the same trick trace.test.ts's pickup and rescue traces use.
    // Column 45 is clear ground well past doll@15, doll@28 and car@40, all three of
    // which spawn behind it and walk away from it.
    const START_TILE = 45;
    world.player.x = START_TILE * TILE;
    world.player.y = findGroundY(world.map, START_TILE) - world.player.h;
    world.player.onGround = true;
    for (let i = 0; i < 10; i++) stepWorld(world, held({ right: true }));
    expect(world.dead).toBe(false);
    expect(world.enemies.length).toBeGreaterThan(0);
    expect(world.camera.x).toBeGreaterThan(0);

    giveRandomSillyPowerup(world);
    const frozen = snapshot(world);
    const animAtGrant = world.animFrame;
    const xAtGrant = world.player.x;

    // 119 frames of held input that would otherwise walk, spawn and scroll.
    for (let i = 0; i < 119; i++) stepWorld(world, held({ right: true }));
    expect(snapshot(world)).toBe(frozen);
    // animFrame keeps counting through the freeze — it is incremented ABOVE the gate,
    // which is why the drawn scene behind the popup still animates.
    expect(world.animFrame).toBe(animAtGrant + 119);
    expect(world.powerupPopup).toEqual({ type: 'bighead', timer: 1, maxTimer: 120 });

    // The 120th frame is the last frozen one; it is also the one that clears the popup.
    stepWorld(world, held({ right: true }));
    expect(world.powerupPopup).toBeNull();
    expect(snapshot(world)).toBe(frozen);

    // ...and the 121st moves again.
    stepWorld(world, held({ right: true }));
    expect(world.player.x).toBeGreaterThan(xAtGrant);
  });

  it('is thrown away by a respawn, so a death mid-announcement does not freeze the rebuilt level', () => {
    const world = makeWorld();
    setRandom(() => 0.5);
    giveRandomSillyPowerup(world);
    respawnLevel(world);
    expect(world.powerupPopup).toBeNull();
  });
});

// Port of index.html:1381-1389. The trace suite shoots a real bow at a real enemy and a
// real chicken ray at a real bat (trace.test.ts), which is where the firing is actually
// validated. What no trace can show is the END of the ammunition — the bow trace spends
// two of three charges and the ray trace one of eight, and shooting either counter dry
// against the live game would need a script four cooldowns long with nothing happening in
// between. So the last shot is pinned here instead.
describe('running out of ammunition', () => {
  it('spends the rays before the arrows, and only drops the bow once both are gone', () => {
    const world = makeWorld();
    const p = world.player;
    p.hasBow = true;
    p.bowCharges = 1;
    p.chickenRayCharges = 1;

    // One ray, one arrow, and the ray goes first even though the bow is loaded.
    stepPlayer(world, held({ firePressed: true }));
    expect(world.arrows).toHaveLength(1);
    expect(world.arrows[0].isChicken).toBe(true);
    expect(p.chickenRayCharges).toBe(0);
    expect(p.bowCharges).toBe(1); // the ray did not touch it
    expect(p.hasBow).toBe(true); // ...so the bow stays

    // 15 frames later the arrow goes, and with both counters at zero the bow goes too.
    for (let i = 0; i < 15; i++) stepPlayer(world, held({ firePressed: true }));
    expect(world.arrows).toHaveLength(2);
    expect(world.arrows[1].isChicken).toBe(false);
    expect(p.bowCharges).toBe(0);
    expect(p.hasBow).toBe(false);

    // And an empty bow fires nothing, however long the button is held.
    for (let i = 0; i < 60; i++) stepPlayer(world, held({ firePressed: true }));
    expect(world.arrows).toHaveLength(2);
  });
});
