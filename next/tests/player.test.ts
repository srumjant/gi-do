// Port of index.html:1361-1423 (player movement) plus the construction at
// index.html:1166-1171. Pinned to level 0 ("Doll Garden") and 'normal' difficulty
// throughout, per the task: gap positions shift with difficulty, so nothing here
// hardcodes a tile-x for the gap — tests derive it by walking the real generated map.
//
// WHAT IS AND IS NOT TESTED HERE, since plan 7 put the player on an Arcade body.
//
// Everything below is `stepPlayer`'s own arithmetic: acceleration and deceleration, the
// jump force, the variable-height cut, coyote time, the jump buffer, the pit threshold,
// the walk cycle, the ammunition, the power-up timers and the popup freeze. None of it
// is Arcade's and none of it changed. What DID change is the four lines in the middle of
// that function — the X sweep, the Y sweep, the left clamp and the block bump — which
// are now injected as a `PlayerMove` and, in the shipping game, are a real Arcade body
// against a real tilemap layer.
//
// Arcade cannot be constructed under Vitest (tests/physics.test.ts says why), so the
// tests that need the player to actually get somewhere inject `testMove` instead — plain
// integration and trivial AABB resolution, deliberately NOT Arcade, deliberately not the
// old hand-rolled sweep either. Read tests/helpers/testMove.ts before trusting any
// position in this file: a resolved position here is that helper's answer, not the
// game's. The three tests that asserted the hand-rolled sweep's own results — two about
// the wall, one about the left clamp — are retired below rather than re-pointed at it.
import { afterEach, describe, expect, it } from 'vitest';
import {
  createPlayer, giveRandomSillyPowerup, playerSize, stepMotion, stepPlayer, stepWalkCycle,
  GRND_DECEL,
} from '../src/game/player';
import { testMove } from './helpers/testMove';
import { setRandom } from '../src/game/random';
import { createWorld, respawnLevel, stepWorld } from '../src/game/world';
import { emptyInput, type InputState } from '../src/input/actions';
import { LEVELS } from '../src/data/levels';
import { GIGI_SKINS, DODO_SKINS } from '../src/data/sprites';
import { TILE, GRAVITY } from '../src/config/constants';
import { DIFFICULTY_CONFIG, DIFF_KEYS } from '../src/config/difficulty';
import { findGroundY } from '../src/game/tiles';
import type { PlayerState, SoundCue, World } from '../src/game/types';

function held(overrides: Partial<InputState>): InputState {
  return { ...emptyInput(), ...overrides };
}

function makeWorld(character: 'gigi' | 'dodo' = 'gigi'): World {
  return createWorld(0, 'normal', character);
}

describe('createPlayer', () => {
  const NORMAL = DIFFICULTY_CONFIG.normal;

  it('sizes gigi from the ported sprite data, not a hardcoded constant', () => {
    const p = createPlayer(LEVELS[0], NORMAL, 'gigi');
    const stand = GIGI_SKINS[0].stand;
    expect(p.w).toBe(stand[0].length * 2 - 4);
    expect(p.h).toBe(stand.length * 2 - 4);
    expect(p.w).toBe(16);
    expect(p.h).toBe(24);
  });

  it('sizes dodo from the ported sprite data, not a hardcoded constant', () => {
    const p = createPlayer(LEVELS[0], NORMAL, 'dodo');
    const stand = DODO_SKINS[0].stand;
    expect(p.w).toBe(stand[0].length * 2 - 4);
    expect(p.h).toBe(stand.length * 2 - 4);
    expect(p.w).toBe(16);
    expect(p.h).toBe(20);
  });

  it('starts airborne at the level\'s playerStart, in pixels', () => {
    const level = LEVELS[0];
    const p = createPlayer(level, NORMAL, 'gigi');
    expect(p.x).toBe(level.playerStart[0] * TILE);
    expect(p.y).toBe(level.playerStart[1] * TILE);
    expect(p.vx).toBe(0);
    expect(p.vy).toBe(0);
    expect(p.onGround).toBe(false);
    expect(p.facing).toBe(1);
    expect(p.coyoteTime).toBe(0);
    expect(p.jumpBuffer).toBe(0);
    expect(p.invincible).toBe(0);
  });

  // index.html:1169's `hasCape:dc.startWithCape` — the one field in the whole literal
  // that varies, and the reason createPlayer takes a difficulty record at all. No frame
  // trace at `normal` can tell a correct `dc.startWithCape` from a hardcoded `false`,
  // so this reads the real records rather than restating the table: whichever
  // difficulties set the flag, the player must spawn with a cape on exactly those.
  it('seeds hasCape from the difficulty record, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      const dc = DIFFICULTY_CONFIG[key];
      expect(createPlayer(LEVELS[0], dc, 'gigi').hasCape, key).toBe(dc.startWithCape);
    }
    // ...and that is not a vacuous agreement between two constants: exactly one of the
    // four records actually turns it on, so the loop above sees both answers.
    expect(DIFF_KEYS.filter((k) => DIFFICULTY_CONFIG[k].startWithCape)).toEqual(['super_easy']);
  });
});

describe('horizontal movement', () => {
  it('accelerates to dc.playerSpeed and no further', () => {
    const world = makeWorld();
    const seen: number[] = [];
    for (let i = 0; i < 30; i++) {
      stepPlayer(world, held({ right: true }), testMove);
      seen.push(world.player.vx);
    }
    expect(seen.every((v) => v <= world.dc.playerSpeed)).toBe(true);
    expect(world.player.vx).toBe(world.dc.playerSpeed);
  });

  it('decelerates multiplicatively and snaps to exactly 0', () => {
    const world = makeWorld();
    // Holding right from spawn caps vx well before it lands (confirmed against the
    // live game while developing this port); 10 frames lands it on the ground with
    // vx already at the cap, so deceleration below is the grounded rate (0.72). The
    // landing is all `testMove` contributes — which rate applies, and the snap to
    // exactly zero, are stepPlayer's.
    for (let i = 0; i < 10; i++) stepPlayer(world, held({ right: true }), testMove);
    expect(world.player.onGround).toBe(true);
    expect(world.player.vx).toBe(world.dc.playerSpeed);

    const before = world.player.vx;
    stepPlayer(world, emptyInput(), testMove);
    expect(world.player.vx).toBeCloseTo(before * GRND_DECEL, 10);

    for (let i = 0; i < 30; i++) stepPlayer(world, emptyInput(), testMove);
    expect(world.player.vx).toBe(0);
  });
});

describe('jump', () => {
  function landedWorld(): World {
    const world = makeWorld();
    for (let i = 0; i < 10; i++) stepPlayer(world, emptyInput(), testMove);
    expect(world.player.onGround).toBe(true); // sanity: the setup itself landed
    return world;
  }

  it('opens at dc.jumpForce + 0.4 (jump force plus one frame of gravity) and leaves the ground', () => {
    const world = landedWorld();
    stepPlayer(world, held({ jump: true, jumpPressed: true }), testMove);
    expect(world.player.onGround).toBe(false);
    expect(world.player.vy).toBeCloseTo(world.dc.jumpForce + GRAVITY, 10);
  });

  it('releasing early cuts the rise to dc.jumpForce * 0.4', () => {
    const world = landedWorld();
    stepPlayer(world, held({ jump: true, jumpPressed: true }), testMove);
    // Released on the very next frame. The cut lands at jumpForce*0.4 mid-frame, and
    // that same frame's gravity still applies on top of it — isApex is false here
    // because |jumpForce*0.4| (3.0) is not under the 1.5 apex threshold.
    stepPlayer(world, emptyInput(), testMove);
    expect(world.player.vy).toBeCloseTo(world.dc.jumpForce * 0.4 + GRAVITY, 10);
  });
});

describe('coyote time', () => {
  // Walks right off the real gap in level 1's generated map, so onGround flips
  // true -> false because the ground disappeared underfoot, not because of a jump
  // (a jump zeroes coyoteTime itself, which would defeat this test).
  //
  // WHICH frame the ground runs out under the player is the mover's business, and the
  // three implementations disagree by a frame or two: the live game's floor probes are
  // inset 3px from each edge, so three pixels of overhang had already fallen (frame 116
  // holding right from spawn); Arcade grounds a body on any overlap at all, so a
  // one-pixel toe-hold holds; `testMove` sits between them and leaves at 117. None of
  // that is what this tests. Coyote time is a counter in `stepPlayer` — armed to 6 while
  // grounded, decremented once an airborne frame, read before the jump — and it behaves
  // the same however the ledge was left.
  function walkOffLedge(): World {
    const world = makeWorld();
    let wasGrounded = false;
    for (let i = 0; i < 200; i++) {
      stepPlayer(world, held({ right: true }), testMove);
      if (wasGrounded && !world.player.onGround) return world;
      wasGrounded = world.player.onGround;
    }
    throw new Error('never walked off a ledge within 200 frames');
  }

  it('a jump within coyote time after walking off a ledge still fires', () => {
    const world = walkOffLedge();
    expect(world.player.coyoteTime).toBeGreaterThan(0);
    const vyBefore = world.player.vy;
    stepPlayer(world, held({ right: true, jump: true, jumpPressed: true }), testMove);
    expect(world.player.vy).toBeLessThan(vyBefore); // overwritten by a jump, not just gravity
    expect(world.player.vy).toBeCloseTo(world.dc.jumpForce + GRAVITY, 10);
  });

  it('a jump after coyote time has expired does NOT fire', () => {
    const world = walkOffLedge();
    // coyoteTime is set to 6 on the leave frame, then decremented (and checked AFTER
    // the decrement) on every airborne frame since: 6,5,4,3,2,1,0 over frames
    // 0..6 after leaving. 5 filler frames land on "1"; the 6th (the jump attempt
    // itself) decrements it to 0 before canJump is checked, so it just misses.
    for (let i = 0; i < 5; i++) stepPlayer(world, held({ right: true }), testMove);
    expect(world.player.coyoteTime).toBe(1);
    const vyBefore = world.player.vy;
    stepPlayer(world, held({ right: true, jump: true, jumpPressed: true }), testMove);
    expect(world.player.coyoteTime).toBe(0);
    expect(world.player.vy).toBeGreaterThan(vyBefore); // gravity only, no jump happened
  });
});

describe('jump buffer', () => {
  function framesToLand(): number {
    const world = makeWorld();
    for (let calls = 1; calls <= 60; calls++) {
      stepPlayer(world, emptyInput(), testMove);
      if (world.player.onGround) return calls;
    }
    throw new Error('never landed within 60 frames');
  }

  // Held continuously from pressCall onward (not tapped-and-released): confirmed
  // against the live game while developing this port that a buffered jump tapped and
  // released well before landing still "fires", but the variable-jump-height cut
  // (index.html:1388) applies in the very same frame, since it only looks at whether
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
      stepPlayer(world, held({ jump: call >= pressCall, jumpPressed: call === pressCall }), testMove);
    }
    expect(world.player.onGround).toBe(true); // landed as expected

    stepPlayer(world, held({ jump: true }), testMove); // still held: first grounded frame, buffer fires
    expect(world.player.onGround).toBe(false);
    expect(world.player.vy).toBeCloseTo(world.dc.jumpForce + GRAVITY, 10);
  });

  it('pressed one frame earlier than that, the buffer has already run out', () => {
    const landingCall = framesToLand();
    const world = makeWorld();
    const pressCall = landingCall - 6;
    for (let call = 1; call <= landingCall; call++) {
      stepPlayer(world, held({ jump: call >= pressCall, jumpPressed: call === pressCall }), testMove);
    }
    expect(world.player.onGround).toBe(true);

    stepPlayer(world, held({ jump: true }), testMove);
    expect(world.player.onGround).toBe(true); // no rebound: the buffer had expired
  });
});

// RETIRED with plan 7: the wall, and the left clamp below it.
//
// Two tests lived here and both asserted the hand-rolled sweep's own arithmetic, which
// Arcade does not reproduce and is not meant to. Neither is re-pointed at `testMove`,
// because a position resolved by a test helper is a fact about the test helper. What
// they knew is worth keeping, so here it is, with the live lines it came from:
//
//   - THE SETUP. No real level has a vertical wall at player height — `makeGround` writes
//     the bottom two rows and `addPlats` writes a single row, so nothing stacks into
//     anything the player could run into. Both tests built one: column 6 of level 1,
//     floor to ceiling, ahead of spawn at column 2 and well short of the gap at column
//     20. The same trick still works if the question ever needs asking again, and
//     `driveLiveGame`'s `mutateMap` puts the same wall into the original.
//
//   - WHAT THE ORIGINAL DID. Holding right into that wall never came to rest. The
//     rightward snap is `Math.floor(pR/TILE)*TILE - p.w + 1` (index.html:1406), and that
//     `+1` leaves a one-pixel gap, so the next frame's 0.6 of acceleration does not quite
//     reach the wall and the frame after that does: a two-frame cycle, x alternating
//     81 <-> 81.6 and vx alternating 0 <-> 0.6, forever. Measured on both sides; the port
//     reproduced it exactly, on purpose, for as long as it was bug-compatible.
//
//   - WHAT ARCADE DOES INSTEAD. It separates against the body's real edges, with no `+1`
//     and no inset probes, so the player stops flush and stays stopped. A defect fixed
//     rather than a behaviour ported — and still a change the children can feel.
//
//   - THE LEFT CLAMP, index.html:1422's `if(p.x<0)p.x=0`, is now a left-edge world bound
//     (src/physics/player.ts sets left only: the live game has no right bound, no ceiling
//     and above all no floor, since the pit needs the player to fall through). One
//     difference worth knowing: pinned at x=0 the live game leaves `vx` NEGATIVE, and
//     Arcade zeroes it. Nothing downstream has been found to care, but that is where to
//     look if the left edge ever feels sticky.
//
// Both are checked in a browser now, against the real body — see the commit for plan 7,
// task 2, and PLAYTEST.md's list of what Arcade changed.

describe('pit death', () => {
  // The threshold is `p.y > level.height*TILE + 32` (index.html:1423), hand-written in
  // stepPlayer and untouched by Arcade — which is exactly why the world has no floor
  // bound: the player has to be able to fall out of it. What gets the player over the
  // edge of the real gap at column 20 is `testMove`; what happens once it is past the
  // threshold is the code under test.
  it('falling past the pit threshold sets world.dead and then freezes position and velocity', () => {
    const world = makeWorld();
    let died = false;
    for (let i = 0; i < 400; i++) {
      stepPlayer(world, held({ right: true }), testMove);
      if (world.dead) { died = true; break; }
    }
    expect(died).toBe(true);
    expect(world.player.y).toBeGreaterThan(world.level.height * TILE + 32);

    const frozen = {
      x: world.player.x, y: world.player.y, vx: world.player.vx, vy: world.player.vy,
    };
    for (let i = 0; i < 15; i++) stepPlayer(world, held({ right: true }), testMove);
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
    // rather than walks.
    //
    // Column 67: base ground, no platform above it, clear of all four gaps (20-22,
    // 45-46, 75-77, 98-99 at normal's gapWidth of 1.0), clear of the bow at 70 and the
    // cat at 50, and between doll@65 and bouncer@73 — both of which patrol away from it
    // on a platform row, not this one.
    //
    // It used to be column 45, which is INSIDE the second gap (`addGaps` carves [45,2]).
    // `findGroundY` has no solid tile to find in that column and falls through to its
    // `(height-2)*TILE` fallback — the same number the real ground's top happens to be —
    // so the teleport looked like it was standing on ground and was in fact hanging over
    // a hole. It passed anyway, because the live sweep probed 2px inside the player's
    // edges: falling between the lips of a two-column gap it touched nothing, kept
    // drifting right, and satisfied "the 121st frame moves again" while dropping. Found
    // when this test was re-pointed at a mover that separates on the real edges and
    // caught the player on the lip instead. A wrong premise, green for two whole plans.
    const START_TILE = 67;
    world.player.x = START_TILE * TILE;
    world.player.y = findGroundY(world.map, START_TILE) - world.player.h;
    world.player.onGround = true;
    for (let i = 0; i < 10; i++) stepWorld(world, held({ right: true }), testMove);
    expect(world.dead).toBe(false);
    expect(world.enemies.length).toBeGreaterThan(0);
    expect(world.camera.x).toBeGreaterThan(0);

    giveRandomSillyPowerup(world);
    const frozen = snapshot(world);
    const animAtGrant = world.animFrame;
    const xAtGrant = world.player.x;

    // 119 frames of held input that would otherwise walk, spawn and scroll.
    for (let i = 0; i < 119; i++) stepWorld(world, held({ right: true }), testMove);
    expect(snapshot(world)).toBe(frozen);
    // animFrame keeps counting through the freeze — it is incremented ABOVE the gate,
    // which is why the drawn scene behind the popup still animates.
    expect(world.animFrame).toBe(animAtGrant + 119);
    expect(world.powerupPopup).toEqual({ type: 'bighead', timer: 1, maxTimer: 120 });

    // The 120th frame is the last frozen one; it is also the one that clears the popup.
    stepWorld(world, held({ right: true }), testMove);
    expect(world.powerupPopup).toBeNull();
    expect(snapshot(world)).toBe(frozen);

    // ...and the 121st moves again.
    stepWorld(world, held({ right: true }), testMove);
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

// Port of index.html:1390-1398. The trace suite shoots a real bow at a real enemy and a
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

describe('the movement learn mode shares', () => {
  const LEARN = {
    playerSpeed: DIFFICULTY_CONFIG.super_easy.playerSpeed,
    jumpForce: DIFFICULTY_CONFIG.super_easy.jumpForce,
  };
  const jumpHeld = (f: number): InputState => held({ jump: true, jumpPressed: f === 0 });
  const jumpTapped = (f: number): InputState => held({ jump: f === 0, jumpPressed: f === 0 });

  function standing(): PlayerState {
    const { w, h } = playerSize('gigi');
    return {
      x: 0, y: -h, vx: 0, vy: 0, w, h, onGround: true, facing: 1,
      coyoteTime: 0, jumpBuffer: 0, frame: 0, frameTimer: 0, invincible: 0,
      hasBow: false, bowCharges: 0, arrowCooldown: 0, hasCape: false,
      fartTimer: 0, bigHeadTimer: 0, chickenRayCharges: 0,
    };
  }

  // Integrates y by hand with no floor: only the top of the arc matters here.
  function riseOf(input: (f: number) => InputState, options = {}): { rise: number; sounds: SoundCue[] } {
    const p = standing();
    const startY = p.y;
    const sounds: SoundCue[] = [];
    let top = p.y;
    for (let f = 0; f < 200; f++) {
      stepMotion(p, input(f), LEARN, sounds, options);
      p.y += p.vy;
      p.onGround = false;
      top = Math.min(top, p.y);
      if (p.vy > 0) break;
    }
    return { rise: startY - top, sounds };
  }

  it('rises 98.4px on a held jump at the learn numbers', () => {
    expect(riseOf(jumpHeld).rise).toBeCloseTo(98.4, 6);
  });

  it('cuts a tapped jump to a 24.2px hop', () => {
    expect(riseOf(jumpTapped).rise).toBeCloseTo(24.2, 6);
  });

  it('keeps a tapped jump at full height while noJumpCut is set', () => {
    expect(riseOf(jumpTapped, { noJumpCut: true }).rise).toBeCloseTo(98.4, 6);
  });

  it('raises the jump sound on the step the jump starts', () => {
    expect(riseOf(jumpHeld).sounds).toEqual(['jump']);
  });

  it('shows the jump pose in the air and the stand pose at rest', () => {
    const p = standing();
    p.onGround = false;
    stepWalkCycle(p);
    expect(p.frame).toBe(2);
    p.onGround = true;
    p.vx = 0;
    stepWalkCycle(p);
    expect(p.frame).toBe(0);
  });

  it('sizes a character exactly as createPlayer does', () => {
    for (const character of ['gigi', 'dodo'] as const) {
      const p = createPlayer(LEVELS[0], DIFFICULTY_CONFIG.normal, character);
      expect(playerSize(character)).toEqual({ w: p.w, h: p.h });
    }
  });
});
