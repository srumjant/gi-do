// Named input scripts for the golden trace suite (Plan 2, Task 7): each a
// `(frame) => FrameInput` plus a frame count, pinned to level 0 ("Doll Garden"),
// 'normal' difficulty, 'gigi' — the same combination trace.test.ts drives against the
// live game.
//
// Every script here is a PLAYER-focused trace and is meant to be run with enemies
// suppressed (`suppressEnemies: true` on the live side, `world.pending`/`world.enemies`
// cleared on the port side — see trace.test.ts). Level 0's doll@15 only turns around at
// a wall or a ledge, and there is neither between the map's left edge and the first gap
// at tile 20, so it patrols that ENTIRE stretch — it is not avoidable by picking a
// script that "stays clear" of it. Contact damage (`playerHit`) is deliberately out of
// the slice, so without suppression the live game dies there (frame 59 running right,
// frame 240 standing still — both inside any of these windows) while the port walks
// through it untouched, and every frame after that would be comparing a scope boundary
// instead of the physics under test.
//
// Two kinds of geometry are derived here rather than hardcoded, once, at module load:
//  - TILE POSITIONS, by scanning the actual generated map (none needed direct scanning
//    below beyond what player.test.ts already established — level 0's real gap and
//    platform columns — see the comments on PLATFORM_LANDING).
//  - PHYSICS-DEPENDENT FRAME TIMINGS (when the player leaves a ledge, when it lands),
//    by running the same pure simulation this suite validates, exactly as
//    player.test.ts's own `walkOffLedge()` / `framesToLand()` helpers do. Reusing the
//    port's own step functions to time a script does not beg the question: if the
//    port's timing were wrong, the resulting script would simply diverge from the live
//    game at whatever frame that wrongness shows up — which is exactly what this suite
//    exists to catch, not something a derivation at module load could hide.
import { createWorld, stepWorld } from '../../src/game/world';
import type { World } from '../../src/game/types';
import type { FrameInput } from './liveGame';

export interface InputScript {
  input: (frame: number) => FrameInput;
  frames: number;
}

const LEVEL = 0;
const DIFFICULTY = 'normal' as const;
const CHARACTER = 'gigi' as const;

function hold(overrides: Partial<FrameInput>): FrameInput {
  return { left: false, right: false, jump: false, ...overrides };
}

/** A fresh world, enemies suppressed exactly as trace.test.ts sets one up for a player-focused run. */
function referenceWorld(): World {
  const world = createWorld(LEVEL, DIFFICULTY, CHARACTER);
  world.pending.length = 0;
  world.enemies.length = 0;
  return world;
}

/**
 * Steps `world` with a plain FrameInput, deriving `jumpPressed` from the rising edge —
 * the same rule the real harness (trace.test.ts, driveLiveGame) uses. `prevJump` is the
 * previous frame's held `jump`, threaded by the caller.
 */
function step(world: World, input: FrameInput, prevJump: boolean): void {
  stepWorld(world, {
    left: input.left, right: input.right, jump: input.jump,
    jumpPressed: input.jump && !prevJump,
  });
}

// ---------------------------------------------------------------------------
// Derived timings. Each is computed once, against a reference world, by driving the
// port's own stepWorld — never against the live game (these are inputs the trace test
// then drives against BOTH sides; deriving them from the live game would make the
// script itself depend on the thing being validated).
// ---------------------------------------------------------------------------

/**
 * The 0-indexed frame whose INPUT causes the player to leave solid ground, running
 * right continuously from spawn on the real (unmutated) level-0/normal map — the same
 * transition player.test.ts's `walkOffLedge()` helper detects. Verified once, live, at
 * 116. Used by both `walkOffLedge` (which just keeps running) and `coyoteJump` (which
 * needs to know when the ledge disappeared to time the jump relative to it).
 */
const LEAVE_LEDGE_1_FRAME = (() => {
  const world = referenceWorld();
  let wasGrounded = false;
  for (let f = 0; f < 400; f++) {
    step(world, hold({ right: true }), false);
    if (wasGrounded && !world.player.onGround) return f;
    wasGrounded = world.player.onGround;
  }
  throw new Error('never left the ground within 400 frames running right from spawn');
})();

/**
 * The 0-indexed frame whose INPUT is the landing call — the call after which onGround
 * first reads true — falling straight down from spawn with no input at all (gravity
 * settle). Also records the resting Y, which PLATFORM_LANDING below uses to tell a
 * platform landing apart from an ordinary ground landing.
 */
const STAND_STILL_LANDING = (() => {
  const world = referenceWorld();
  for (let f = 0; f < 200; f++) {
    step(world, hold({}), false);
    if (world.player.onGround) return { frame: f, y: world.player.y };
  }
  throw new Error('never landed within 200 frames standing still');
})();
const LAND_FRAME = STAND_STILL_LANDING.frame;
const BASE_GROUND_Y = STAND_STILL_LANDING.y;

/**
 * The 0-indexed frame whose INPUT first brings vx to the difficulty's speed cap while
 * grounded, running right continuously from spawn. Used to time `runningJump`'s jump
 * so the script demonstrably carries a CAPPED horizontal speed through the arc, rather
 * than an arbitrary partway-there value.
 */
const SPEED_CAP_FRAME = (() => {
  const world = referenceWorld();
  const cap = world.dc.playerSpeed;
  for (let f = 0; f < 100; f++) {
    step(world, hold({ right: true }), false);
    if (world.player.onGround && world.player.vx === cap) return f;
  }
  throw new Error('never reached the speed cap grounded within 100 frames running right');
})();

/**
 * Searches for the fewest "run right" frames that, followed by a held jump (right
 * still held), land the player somewhere OTHER than the base two-row ground — i.e. on
 * a raised platform, resolved by the very same downward-Y branch in player.ts a
 * base-ground landing uses, just against a different tile underneath. This is real
 * geometry, not injected: level 0's addPlats puts a 5-tile platform at columns 10-14,
 * row 19 (4 tiles / 64px above the ground) — inside the ~68px apex a held jump from a
 * standing start reaches (confirmed empirically below, not assumed) — and it sits
 * entirely before the first gap at tile 20, so reaching it never risks a pit.
 *
 * The search itself is what makes this "derived from the map" rather than a hardcoded
 * frame: it does not know in advance which start lands cleanly, only how to recognise
 * one once it sees it (a resting Y that isn't the ground's).
 */
const PLATFORM_LANDING = (() => {
  for (let start = 1; start <= 80; start++) {
    const world = referenceWorld();
    let prevJump = false;
    for (let f = 0; f < start; f++) {
      step(world, hold({ right: true }), prevJump);
      prevJump = false;
    }
    if (world.dead) continue; // this start already fell in a pit before it could jump — not a candidate
    for (let f = 0; f < 150; f++) {
      const held = hold({ right: true, jump: true });
      step(world, held, prevJump);
      prevJump = held.jump;
      if (world.dead) break;
      if (world.player.onGround && f > 2) {
        if (Math.abs(world.player.y - BASE_GROUND_Y) > 1) {
          return { jumpStartFrame: start, landFrame: start + f };
        }
        break; // landed back on the base ground — a later jump might clear it instead
      }
    }
    // Either landed on the base ground or ran out of arc budget without landing at
    // all — either way, not a platform landing. Try jumping a little later.
  }
  throw new Error('no platform landing found for any jump-start frame in [1,80]');
})();

/**
 * Where the walk cycle's own script (below) starts holding right: the frame after
 * LAND_FRAME, i.e. grounded, at rest, with no residual input. Running right
 * continuously from spawn instead (as walkOffLedge/runRight/etc. all do) reaches the
 * speed cap while still AIRBORNE — confirmed empirically: air accel (0.4/frame) alone
 * covers 0 to the cap in about 7 frames, landing takes 9 — so the walk cycle's own
 * vx-dependent branch, which only ever runs while onGround, would never see anything
 * but the already-capped rate. Settling first, with no input, then starting to hold
 * right only once grounded, makes the ENTIRE grounded acceleration ramp (0.6/frame)
 * play out where the walk cycle can actually react to it.
 */
const WALK_CYCLE_HOLD_START = LAND_FRAME + 1;
/**
 * Held long enough (70 frames) for vx to run the full grounded ramp to the speed cap
 * (4 frames: 0.6, 1.2, 1.8, 2.4, then capped at 2.5) and then sit AT the cap for
 * dozens more — long enough to see `frame` toggle repeatedly at walkSpeed's fastest
 * rate (5, i.e. every 6th frame), not just take that value once.
 */
const WALK_CYCLE_RELEASE = WALK_CYCLE_HOLD_START + 70;

// ---------------------------------------------------------------------------
// Scripts.
// ---------------------------------------------------------------------------

export const SCRIPTS: Record<string, InputScript> = {
  /** Gravity settle, nothing else: falls from spawn onto the ground and stays there. */
  standStill: {
    input: () => hold({}),
    frames: 60,
  },

  /** Acceleration to dc.playerSpeed and holding the cap. Stops at frame 60 — the
   * first gap is at tile 20 (x=320) and this never gets past x≈176. */
  runRight: {
    input: () => hold({ right: true }),
    frames: 60,
  },

  /** Multiplicative decel and the 0.12 snap to exactly 0, after 30 frames of running
   * right (well clear of the gap: x≈100 when it releases). */
  runAndStop: {
    input: (f) => hold({ right: f < 30 }),
    frames: 60,
  },

  /** Full jump arc, apex hang, and landing — held the whole time so the
   * variable-height cut never engages. Jump presses the frame after landing confirms
   * grounded (pressing on the landing frame itself is too early: onGround is only
   * updated for the NEXT frame's check). */
  singleJump: {
    input: (f) => hold({ jump: f >= LAND_FRAME + 1 }),
    frames: 70,
  },

  /** The variable jump height cut: tapped for exactly one frame, then released. */
  shortHop: {
    input: (f) => hold({ jump: f === LAND_FRAME + 1 }),
    frames: 50,
  },

  /** Horizontal carry through a jump arc: waits for vx to actually reach the speed
   * cap while grounded, then jumps holding right, landing back on the base ground
   * (not a platform — that is landOnPlatform's job) well before any gap. */
  runningJump: {
    input: (f) => hold({ right: true, jump: f >= SPEED_CAP_FRAME + 1 }),
    frames: 70,
  },

  /**
   * Falling off the real gap at tile 20, running right the whole way, through to a
   * real pit death and its freeze. Bounded, not hoped: dies at frame 136 (measured),
   * so 160 frames leaves it frozen for 24 frames — comfortably inside the live game's
   * 90-frame respawn window (which would otherwise reset the live player back to the
   * level start while the port stays frozen, diverging for a reason that has nothing
   * to do with the physics under test). trace.test.ts asserts this bound directly
   * from the trace rather than trusting this comment.
   */
  walkOffLedge: {
    input: () => hold({ right: true }),
    frames: 160,
  },

  /**
   * Jump 3 frames after leaving the ledge at tile 20 — inside the 6-frame coyote
   * window (coyoteTime reads 4 the instant this fires: comfortably not a boundary
   * case, which is what player.test.ts's synthetic-map unit tests already cover in
   * isolation). Clears the real 3-tile gap and lands on the real platform at columns
   * 25-27 — so this doubles as a second, differently-timed downward-Y-onto-a-platform
   * case alongside landOnPlatform, purely because that is what real level 0 geometry
   * does here, not because it was arranged to.
   */
  coyoteJump: {
    input: (f) => hold({ right: true, jump: f >= LEAVE_LEDGE_1_FRAME + 3 }),
    frames: 170,
  },

  /**
   * The same jump on the LAST frame the coyote window still allows, which makes this
   * the script that pins the window's width rather than merely using it.
   *
   * The counter is set to 6 on each grounded frame and decremented once per airborne
   * frame BEFORE the jump check reads it, so the first airborne frame sees 5 and the
   * sixth sees 0 — meaning +5 is the last press that fires and +6 is the first that
   * does not. coyoteJump above sits at +3, comfortably inside, so a window that
   * silently narrowed by one frame would not change its outcome at all: mutating the 6
   * to a 5 left the entire trace suite green. That is drift a child would feel as
   * "jumping off edges got harder" while every comparison stayed passing, so the
   * boundary gets its own script.
   *
   * Note this is a different guarantee from player.test.ts's coyote unit tests, which
   * compare the port against itself. This one compares it against the live game, so it
   * also catches the window being retuned there.
   */
  coyoteJumpLatest: {
    input: (f) => hold({ right: true, jump: f >= LEAVE_LEDGE_1_FRAME + 5 }),
    frames: 170,
  },

  /**
   * Jump pressed while still falling from spawn, 5 frames before landing (the latest
   * press that still carries through the buffer — see player.test.ts's own jump
   * buffer tests for the boundary case), held continuously afterward so only the one
   * buffered press ever fires.
   */
  bufferedJump: {
    input: (f) => hold({ jump: f >= LAND_FRAME - 5 }),
    frames: 70,
  },

  /**
   * Downward Y resolution onto a raised tile: the real platform at columns 10-14, row
   * 19 (see PLATFORM_LANDING above for how the jump-start frame is found rather than
   * assumed). Distinct from coyoteJump's platform landing — this one never leaves the
   * ground on the near side of any gap.
   */
  landOnPlatform: {
    input: (f) => hold({ right: true, jump: f >= PLATFORM_LANDING.jumpStartFrame }),
    frames: PLATFORM_LANDING.landFrame + 20,
  },

  /**
   * Exercises the walk cycle itself (index.html:1424-1429) — none of the scripts
   * above was built with `p.frame`/`p.frameTimer` in mind. Settles to the ground
   * with no input (WALK_CYCLE_HOLD_START above), then holds right through the
   * ENTIRE grounded acceleration ramp and on to the speed cap, holds there long
   * enough for several walk-cycle toggles at the fastest rate, then releases and
   * decelerates all the way through the |vx|>0.3 threshold to a dead stop.
   *
   * Confirmed empirically: walkSpeed — `max(4, round(12-|vx|*3))` — takes six distinct
   * values across the run (10, 8, 7, 5 while accelerating up to and holding the cap;
   * 7, 8, 9, 10, 11 again while decelerating back down — two of those, 9 and 11,
   * appear ONLY during deceleration), and `frame` itself toggles 14 separate times.
   * Never approaches the first gap (x tops out at 209, against a gap at 320) and never
   * dies. Also confirmed to earn its place rather than just look busy: mutating the
   * 0.3 threshold to 0.4, and separately the walk-cycle formula's 12 to 11, each turns
   * this script (among others) red in trace.test.ts.
   */
  walkCycle: {
    input: (f) => hold({
      right: f >= WALK_CYCLE_HOLD_START && f < WALK_CYCLE_RELEASE,
    }),
    frames: WALK_CYCLE_RELEASE + 70,
  },

  /**
   * 600 frames, to catch slow numerical drift. A single held direction cannot run
   * this long without either resting against the left clamp the whole time (right
   * held is fine — see runRight/runAndStop above staying nowhere near the gap even at
   * the speed cap for 60 frames, but 600 frames of it walks straight into the pit) or
   * saying nothing new after the first cycle. Instead this oscillates right/left/jump
   * on a 60-frame cycle, repeated 10 times: 20 frames right (accelerate up to the
   * cap), 20 left (decelerate, reverse, accelerate the other way), a 5-frame gap
   * (multiplicative decel through zero), 10 frames jumping while still holding
   * neither direction change, then a second 5-frame gap before the cycle repeats.
   * Verified to never reach the first gap (x stays under 155) and never die.
   */
  longRun: {
    input: (f) => {
      const phase = f % 60;
      return hold({
        right: phase < 20,
        left: phase >= 20 && phase < 40,
        jump: phase >= 45 && phase < 55,
      });
    },
    frames: 600,
  },
};

/**
 * NOT one of the player-focused SCRIPTS above, and deliberately not enemy-suppressed:
 * this is Task 7's enemy trace (Step 6), meant to run with enemies enabled on both
 * sides. Runs right and jumps starting frame 48 — held continuously, so the bounce
 * off the stomp itself is not cut short by the variable-jump-height release — which
 * lands the player on top of doll@15 while falling, stomping it around frame 61
 * (verified against both implementations: player x/y/vx/vy/onGround, camera, and
 * every enemy field match exactly for all 100 frames — see trace.test.ts). Never
 * approaches the first gap (player.x stays under 280 throughout), so doll@28 and
 * car@40 — both already spawned at frame 0 too — are only ever passed near, never
 * touched.
 */
export const STOMP_SCRIPT: InputScript = {
  input: (f) => hold({ right: true, jump: f >= 48 }),
  frames: 100,
};
