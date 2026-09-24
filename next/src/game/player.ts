import { GRAVITY, TILE } from '../config/constants';
import type { DifficultyRecord } from '../config/difficulty';
import { TILE_BRICK, type Level } from '../data/levels';
import { GIGI_SKINS, DODO_SKINS } from '../data/sprites';
import type { InputState } from '../input/actions';
import { random } from './random';
import { PICKUP_RUMBLE, type PlayerState, type PowerupType, type SoundCue, type World } from './types';

export type Character = 'gigi' | 'dodo';

/**
 * What moves the player, injected into `stepPlayer` below.
 *
 * It replaces index.html:1404-1422 — the X sweep, the Y sweep and the left clamp, the
 * four things this port now hands to Phaser's Arcade Physics. Its contract is the whole
 * of what those lines did: integrate `p.x`/`p.y` from `p.vx`/`p.vy`, separate the player
 * out of any solid tile it ended up inside, zero the velocity on the axis that was
 * blocked, set `p.onGround`, keep the player out of negative `x`, and bump a `?` or
 * rainbow block taken from underneath. The one implementation is `createPlayerMove` in
 * physics/player.ts.
 *
 * It is INJECTED rather than imported because src/game/ still holds the no-Phaser rule
 * everywhere it possibly can (see the plan's "what stays pure"): the simulation does not
 * get to know that a tilemap, a body or a Phaser scene exists. It is OPTIONAL because the
 * great majority of the test suite does not care how the player got where it is and still
 * has to be able to drive the simulation, and Arcade cannot be constructed under Vitest at
 * all. Left out, the player simply does not move — which is honest, and visibly wrong the
 * moment a test actually depends on movement, rather than quietly running a second physics
 * engine that nothing ships.
 */
export type PlayerMove = (world: World) => void;

/**
 * Port of index.html:1362 — engine constants, not tunable per difficulty. Exported so
 * tests can check the deceleration rate without duplicating the literal.
 */
export const GRND_ACCEL = 0.6;
export const AIR_ACCEL = 0.4;
export const GRND_DECEL = 0.72;
export const AIR_DECEL = 0.92;

/**
 * The hitbox of a character: the stand sprite at scale 2, inset by 4 each way
 * (index.html:670, :1167) — 16x24 for Gigi, 16x20 for Dodo. `createPlayer` and learn
 * mode's climber both size from here, so the two are the same body.
 */
export function playerSize(character: Character): { w: number; h: number } {
  const stand = character === 'dodo' ? DODO_SKINS[0].stand : GIGI_SKINS[0].stand;
  return { w: stand[0].length * 2 - 4, h: stand.length * 2 - 4 };
}

/**
 * Port of the player construction at index.html:1166-1171, sizing from the character's
 * stand frame rather than a hardcoded constant. `spriteW(s,sc) = s[0].length*sc`,
 * `spriteH(s,sc) = s.length*sc` (index.html:670), called with sc=2; the hitbox then
 * insets each dimension by 4 (index.html:1167). Only the classic (index 0) skin is
 * ported — skin selection is a later plan.
 *
 * `dc` is here for one field: `hasCape:dc.startWithCape` (index.html:1169). Every
 * other value in the live literal is a constant, so this is the only reason the
 * difficulty record has to reach the player at all — and it is not optional, since
 * super_easy spawns the player already wearing a cape and therefore already able to
 * absorb the first hit of the level, on every respawn as well as at the start.
 */
export function createPlayer(level: Level, dc: DifficultyRecord, character: Character): PlayerState {
  const { w, h } = playerSize(character);
  return {
    x: level.playerStart[0] * TILE,
    y: level.playerStart[1] * TILE,
    vx: 0,
    vy: 0,
    w,
    h,
    onGround: false,
    facing: 1,
    coyoteTime: 0,
    jumpBuffer: 0,
    frame: 0,
    frameTimer: 0,
    // index.html:1168's `invincible:0`. Level state, and there is no path that carries
    // it across a death: a respawn rebuilds the player through here, so the window a
    // cape bought is gone along with everything else.
    invincible: 0,
    // index.html:1169's `hasBow:false, bowCharges:0`. Both are level state, not run
    // state: every respawn goes through initLevel, so dying really does cost you the
    // bow you picked up — unlike `score`, one field over on the World, which does not
    // reset. See respawnLevel in world.ts.
    hasBow: false,
    bowCharges: 0,
    // index.html:1169's `arrowCooldown:0`. Level state like the bow itself.
    arrowCooldown: 0,
    // index.html:1169's `hasCape:dc.startWithCape`, not a flat false — true on
    // super_easy and nowhere else, which is the only difficulty where the player
    // spawns already wearing one. It is why the `dc` parameter exists.
    hasCape: dc.startWithCape,
    // index.html:1171's `fartTimer:0, bigHeadTimer:0, chickenRayCharges:0`. Level state
    // like the bow, not run state: every respawn goes through initLevel, so dying
    // cancels a silly power-up mid-countdown. Only giveRandomSillyPowerup below ever
    // makes any of them non-zero.
    fartTimer: 0,
    bigHeadTimer: 0,
    chickenRayCharges: 0,
  };
}

/**
 * Port of index.html:1148-1156 — what a rainbow block pays out. One of three effects,
 * picked uniformly at random, plus the announcement that freezes the whole game while
 * it shows.
 *
 * Its one caller is `bumpBlocksAbove` below — a rainbow block (tile 5) taken from
 * underneath. Nothing else grants a silly power-up.
 *
 * Three things about the draw and the branches are worth stating out loud:
 *
 *   - The type is picked with `Math.random()` via random.ts's seam, exactly as the two
 *     other simulation draws are. Under the trace harness's constant 0.5 stub,
 *     `Math.floor(0.5*3)` is 1, so the live game always lands on `bighead` — which is
 *     why the other two branches are covered by direct unit tests pinning the injected
 *     value instead of by a trace.
 *   - `chicken` sets `hasBow` TOO, and its charge count is a flat 8, not `dc.bowCharges`.
 *     The chicken ray rides the bow's firing path (index.html:1392-1396) rather than
 *     having one of its own, so both fields are genuinely consulted; see PlayerState.
 *   - The popup is not decoration. index.html:1276 returns out of `update()` for as
 *     long as it exists, so granting a power-up stops the world for 120 frames. See
 *     PowerupPopup in types.ts and the gate at the top of stepWorld.
 *
 * All three of the live function's last line land here as values rather than as calls:
 * `sfxPickup();sfxWin();` as two sound cues and `padRumble(...)` as one rumble cue. The
 * devices stay outside — see World.sounds and World.rumbles in types.ts.
 */
export function giveRandomSillyPowerup(world: World): void {
  const types: PowerupType[] = ['fart', 'bighead', 'chicken'];
  const type = types[Math.floor(random() * types.length)];
  if (type === 'fart') {
    world.player.fartTimer = 900;
  } else if (type === 'bighead') {
    world.player.bigHeadTimer = 1200;
  } else {
    world.player.chickenRayCharges = 8;
    world.player.hasBow = true;
  }
  world.powerupPopup = { type, timer: 120, maxTimer: 120 };
  // index.html:1155, in this order: the pickup chime and then the win fanfare, both at
  // once, which is what makes a rainbow block sound like more than a pickup. They are
  // raised on the frame the world FREEZES, and the freeze lasts 120 frames — so these two
  // play over a still picture, exactly as they do live.
  world.sounds.push('pickup', 'win');
  // And the `padRumble(0,0.35,80)` that closes the same line — the ordinary pickup buzz,
  // not a bigger one, however loud the two sounds are together. See World.rumbles.
  world.rumbles.push(PICKUP_RUMBLE);
}

/**
 * Port of index.html:1418-1420 — what a head-first collision does to the two blocks it
 * could have landed on. Called by the Arcade mover (physics/player.ts) on the step the
 * body was blocked from above, which is the equivalent of the live source's head-hit
 * branch: both fire after the player has already been snapped back down under the tile
 * and had its upward velocity taken away.
 *
 * `headTileY` is the block's tile ROW. The live source floors it from the head's
 * position BEFORE the snap (`hY`, index.html:1417-1418); Arcade has already separated
 * the body by the time anyone can look, so the caller works the row out from where the
 * body ended up instead — see `headTileRow` in physics/player.ts, which is where that
 * arithmetic lives and is tested. What must not happen, either way, is flooring the
 * SNAPPED position: that names the row below the block and every lookup here misses.
 *
 * The two probe columns are read off `p.x` here rather than passed in. The live source
 * computes them once for the whole Y sweep and reuses them (`pL2`, `pR2`), but they are
 * a function of `p.x` alone and the snap only ever touches `y`, so deriving them is the
 * same two numbers — and it keeps the 3px inset, which is part of the bump RULE, in the
 * same place as the rest of the rule.
 *
 * Two columns and two lists, four sweeps in total, in exactly this order:
 *
 *   - BOTH columns are probed, not just one. `h1` and `h2` are the tile columns of the
 *     player's two Y-sweep probes — 10px apart for a 16px hitbox, so they name two
 *     different columns whenever the player straddles a tile boundary, which is most of
 *     the time. Two blocks side by side in the same row would therefore BOTH pop off
 *     one jump. When `h1 === h2` the second pass finds nothing anyway, because `!q.hit`
 *     was already flipped by the first. (Level 1 has no two blocks adjacent in a row,
 *     so nothing there can actually show the double pop.)
 *   - The two LISTS are swept separately, question blocks first. A `?` and a rainbow in
 *     adjacent columns both fire, and the star is created before the power-up freezes
 *     the world. Collapsing them into a single pass over both lists would reverse that
 *     for the column-2 rainbow / column-1 question case.
 *
 * Both tile codes are replaced with 2 (brick). 3 and 5 are already solid — so is 2 —
 * which makes the map edit invisible to collision and total to the block lists: the
 * `hit` flag is what stops a second bump, and the tile code is what stops it LOOKING
 * like a prize. Both are rebuilt from a freshly generated map by `respawnLevel`
 * (world.ts), so dying restores every block bumped before the death.
 *
 * The live source's `spawnParticles(...)` is presentation, which src/game/ does not own.
 * Its `sfxBlock()` is raised as a cue, once per block that actually pays out — so two
 * blocks popped by one jump really do knock twice.
 */
export function bumpBlocksAbove(world: World, headTileY: number): void {
  const p = world.player;
  const h1 = Math.floor((p.x + 3) / TILE);
  const h2 = Math.floor((p.x + p.w - 3) / TILE);
  const hy = headTileY;

  for (const hx of [h1, h2]) {
    const qb = world.questionBlocks.find((q) => q.x === hx && q.y === hy && !q.hit);
    if (qb) {
      qb.hit = true;
      world.map[qb.y][qb.x] = TILE_BRICK;
      // One tile ABOVE the block, not at it — `qb.y*TILE - TILE` — and rising at -2,
      // which world.ts's stepStars then ramps toward zero and leaves hanging there.
      world.stars.push({ x: qb.x * TILE, y: qb.y * TILE - TILE, vy: -2, collected: false });
      world.sounds.push('block'); // index.html:1419
    }
  }
  for (const hx of [h1, h2]) {
    const rb = world.rainbowBlocks.find((q) => q.x === hx && q.y === hy && !q.hit);
    if (rb) {
      rb.hit = true;
      world.map[rb.y][rb.x] = TILE_BRICK;
      // BEFORE the grant, exactly as index.html:1420 orders them, so the three cues come
      // out block-pickup-win rather than pickup-win-block: the knock is the block being
      // hit, the other two are the prize coming out of it.
      world.sounds.push('block');
      // Not a quiet state change: this freezes the entire game for 120 frames. See
      // giveRandomSillyPowerup above and the gate at the top of stepWorld.
      giveRandomSillyPowerup(world);
    }
  }
}

/**
 * Port of index.html:1390-1398 — the bow, and the chicken ray that rides the same
 * trigger. Called from `stepPlayer` right after `stepMotion` — one step later than the
 * live source, which fires the arrow before gravity rather than after; the values it
 * reads are exactly the same either way. See the call site.
 *
 * Five things here are easy to get subtly wrong:
 *
 *   - The trigger is `justPressed`, NEVER `keys`. The live game reads the four fire
 *     keys (KeyX, KeyZ, ShiftRight, ControlRight) through its `justPressed` map alone,
 *     so a held button fires exactly one arrow and then nothing until it is released
 *     and pressed again. That rising edge is `input.firePressed`, computed by the
 *     caller the same way `jumpPressed` is (input/keyboard.ts) — one mechanism, not two.
 *   - The COOLDOWN is decremented immediately above the check that reads it, so a
 *     cooldown of 1 is already 0 by the time the check runs. 15 is therefore 15 frames
 *     between shots, not 16.
 *   - The chicken ray WINS whenever any charge is left, even with a full bow in hand:
 *     `isChicken` is `chickenRayCharges > 0`, tested before anything spends a charge,
 *     so the rays go first and the arrows wait. And the two counters are spent from
 *     separately — a chicken shot costs no bow charge.
 *   - `hasBow` is cleared only once BOTH counters are empty, which is what lets the
 *     rainbow block's `chicken` grant set `hasBow` without a single bow charge behind it
 *     (giveRandomSillyPowerup above) and still keep the bow on screen while rays remain.
 *   - The arrow's spawn `x` is NOT symmetric: `p.x + p.w` facing right (the player's
 *     right edge) but `p.x - 12` facing left, a hardcoded 12 that happens to equal the
 *     arrow's collision width and not the player's. Reproduced as written.
 *
 * The live function's `sfxCluck()` / `sfxShoot()` are raised as cues on the same branch
 * that spends the charge (index.html:1395) — see World.sounds in types.ts.
 */
function fireArrow(world: World, input: InputState): void {
  const p = world.player;
  if (p.arrowCooldown > 0) p.arrowCooldown--;
  const armed = (p.hasBow && p.bowCharges > 0) || p.chickenRayCharges > 0;
  if (!armed || !input.firePressed || p.arrowCooldown > 0) return;

  const isChicken = p.chickenRayCharges > 0;
  world.arrows.push({
    x: p.facing > 0 ? p.x + p.w : p.x - 12,
    y: p.y + p.h / 2 - 2,
    vx: p.facing * 6,
    life: 60,
    isChicken,
  });
  if (isChicken) {
    p.chickenRayCharges--;
    world.sounds.push('cluck'); // index.html:1395 — a ray clucks, an arrow twangs
  } else {
    p.bowCharges--;
    world.sounds.push('shoot');
  }
  if (p.bowCharges <= 0 && p.chickenRayCharges <= 0) p.hasBow = false;
  p.arrowCooldown = 15;
}

/**
 * The two fields of a difficulty record that movement reads. Narrower than
 * `DifficultyRecord` so learn mode can move a player without inventing lives, a gap width
 * or a bow.
 */
export type MotionRecord = Pick<DifficultyRecord, 'playerSpeed' | 'jumpForce'>;

export interface MotionOptions {
  /**
   * Skip the variable-height cut this step. Learn mode sets it while a letter block's
   * spring carries the player up through the ceiling: a child who taps rather than holds
   * would otherwise rise 24px instead of 98px and be left under an open trapdoor. The
   * adventure never sets it.
   */
  noJumpCut?: boolean;
}

/**
 * The movement half of the player step (index.html:1362-1388 and 1400-1403): running,
 * coyote time, the jump buffer, the jump, the variable-height cut, and gravity with its
 * apex hang. Shared by `stepPlayer` below and learn mode's climb (game/learn/climb.ts),
 * so a jump is the same jump in both.
 *
 * Mutates `p`, and pushes 'jump' or 'fart' onto `sounds` on the step a jump starts.
 * Moves nothing: position is the mover's job, and runs after this.
 */
export function stepMotion(
  p: PlayerState,
  input: InputState,
  dc: MotionRecord,
  sounds: SoundCue[],
  options: MotionOptions = {},
): void {
  // Player movement — smooth acceleration with air control (index.html:1362-1370).
  const accel = p.onGround ? GRND_ACCEL : AIR_ACCEL;
  const decel = p.onGround ? GRND_DECEL : AIR_DECEL;
  if (input.left) {
    p.vx = Math.max(p.vx - accel, -dc.playerSpeed);
    p.facing = -1;
  } else if (input.right) {
    p.vx = Math.min(p.vx + accel, dc.playerSpeed);
    p.facing = 1;
  } else {
    p.vx *= decel;
    if (Math.abs(p.vx) < 0.12) p.vx = 0;
  }

  // Coyote time — allows jumping a few frames after leaving a ledge (index.html:1373-1374).
  if (p.onGround) {
    p.coyoteTime = 6;
  } else if (p.coyoteTime > 0) {
    p.coyoteTime--;
  }

  // Jump buffer — press jump slightly before landing (index.html:1375-1379). Set to 8,
  // then decremented in this SAME step, so it already reads 7 by the time anything
  // checks it this frame. Do not reorder these two lines.
  const jumpKey = input.jump;
  const jumpJust = input.jumpPressed;
  if (jumpJust) p.jumpBuffer = 8;
  if (p.jumpBuffer > 0) p.jumpBuffer--;

  // Execute jump: (coyote time OR on ground) AND (just pressed OR still buffered)
  // (index.html:1380-1386). The fart multiplies the force IN PLACE — 1.5x a jumpForce
  // that is already negative, so -7.5 becomes -11.25 at normal. It is applied here, at
  // the assignment, and nowhere else: the variable-height clamp just below still
  // measures against the UNMULTIPLIED `dc.jumpForce * 0.4`, so releasing the key early
  // cuts a fart jump back to exactly the same short hop as a plain one.
  const canJump = p.onGround || p.coyoteTime > 0;
  if (canJump && p.jumpBuffer > 0) {
    p.vy = p.fartTimer > 0 ? dc.jumpForce * 1.5 : dc.jumpForce;
    p.onGround = false;
    p.coyoteTime = 0;
    p.jumpBuffer = 0;
    // index.html:1384-1385. Reads the same `fartTimer` the force above just read, one
    // line later and before the timer is decremented at the bottom of stepPlayer, so a
    // jump that got the 1.5x always gets the fart too. The live branch also spawns five
    // green particles; those are presentation and are not ported.
    sounds.push(p.fartTimer > 0 ? 'fart' : 'jump');
  }

  // Variable jump height — release early for a short hop (index.html:1387-1388). The
  // clamp target is negative (jumpForce is negative), and only applies while vy is
  // still below (more negative than) it. Skipped while `noJumpCut` is set.
  if (!options.noJumpCut && !jumpKey && p.vy < dc.jumpForce * 0.4) {
    p.vy = dc.jumpForce * 0.4;
  }

  // Gravity: apex hang (reduced gravity near the jump peak) + faster fall
  // (index.html:1400-1403). `vy > 0` is tested BEFORE `isApex` — apex hang applies only
  // while RISING; a slow FALL takes the 1.2 branch even though |vy| < 1.5.
  const isApex = Math.abs(p.vy) < 1.5 && !p.onGround;
  const gMul = p.vy > 0 ? 1.2 : (isApex ? 0.6 : 1.0);
  p.vy += GRAVITY * gMul;
  if (p.vy > 8) p.vy = 8;
}

/**
 * The walk cycle (index.html:1424-1429). Runs at the END of a step, after collision, so it
 * reacts to this step's resolved `onGround` and `vx` rather than last step's. Shared with
 * learn mode's climb.
 */
export function stepWalkCycle(p: PlayerState): void {
  if (!p.onGround) {
    p.frame = 2;
  } else if (Math.abs(p.vx) > 0.3) {
    const walkSpeed = Math.max(4, Math.round(12 - Math.abs(p.vx) * 3));
    p.frameTimer++;
    if (p.frameTimer > walkSpeed) {
      p.frame = p.frame === 0 ? 1 : 0;
      p.frameTimer = 0;
    }
  } else {
    p.frame = 0;
  }
}

/**
 * Port of index.html:1361-1423. Mutates `world.player` (and `world.dead`) in place, in
 * the source's order, except that the arrow fires after gravity rather than before it
 * (the same values either way; see the call site) — every step here is load-bearing;
 * see the comments below and the task notes on the jump buffer, apex hang, and the two
 * collision insets.
 *
 * Out of scope, and simply absent below: landing dust particles, the fart trail's own
 * particles, sound, and score. Enemy collision is simulated (enemy.ts's stepEnemy), but
 * calls into this file's `playerHit` rather than living here — there is no
 * enemy-collision branch in THIS function because the live game's own equivalent isn't
 * in `update`'s player block either; it is in the enemies loop, ported alongside the
 * enemies themselves.
 *
 * RETURNS whether the rest of the frame should still run. The live pit branch's
 * `return` (index.html:1423) is a return from `update()` ITSELF, not from some player
 * sub-function, so a pit frame skips the pickups, the cat, the arrows, the enemies, the
 * rescue check and the camera lerp — and it does that whether the player DIED there or
 * was SAVED by a cape. `world.dead` alone cannot tell stepWorld which happened, because
 * a cape save takes that same `return` while leaving the player alive, so the answer is
 * reported here instead.
 *
 * `move` is the only part of the live player block this function no longer does itself:
 * the X sweep, the Y sweep, the left clamp and the head-first block bump, which are
 * Arcade's from this plan on. See PlayerMove above and the call site below.
 */
export function stepPlayer(world: World, input: InputState, move?: PlayerMove): boolean {
  // index.html:1348 — the live update() checks its dead-state branch, and returns,
  // before it ever reaches player movement. Reproduced by returning immediately: once
  // dead, nothing below runs again, so position and velocity freeze on the death frame.
  if (world.dead) return false;

  const p = world.player;
  const dc = world.dc;
  const level = world.level;

  // Running, coyote time, the jump buffer, the jump, the variable-height cut and gravity
  // (index.html:1362-1388 and 1400-1403) — shared with learn mode, see stepMotion above.
  stepMotion(p, input, dc, world.sounds);

  // Shooting (index.html:1390-1398). The live source has it between the variable-height
  // cut and gravity; here it runs after gravity, which reads exactly the same values:
  // gravity only changes `vy`, and an arrow reads the player's x, y, size and facing. So an
  // arrow fired mid-jump still leaves from where the player was at the top of the frame.
  fireArrow(world, input);

  // Movement and collision (index.html:1404-1422): the X sweep, the Y sweep, the left
  // clamp and the block bump, all four of them now Arcade's — see PlayerMove at the top
  // of this file and physics/player.ts. It sits here, between gravity above and the pit
  // below, because that is exactly where the live source moves the player; every line on
  // either side of it reads state this has already resolved.
  //
  // What went away, and is worth knowing was deliberate rather than lost:
  //
  //   - The 2px X probes and the 3px Y probes (index.html:1405, 1409). Arcade separates
  //     against the body's real edges, so an inset would be a second, competing hitbox.
  //     The 3px pair survives in bumpBlocksAbove, where it decides which COLUMNS a head
  //     hit can pop, which is a rule about blocks rather than about collision.
  //   - The `+1` in the rightward snap (index.html:1406). It left a 1px gap between the
  //     player and the wall, so holding right against one oscillated on a two-frame
  //     cycle forever: step in, snap out, step in. Arcade puts the body flush and it
  //     stops. That is a defect fixed, not a behaviour ported.
  //   - `p.onGround = false` before the floor check (index.html:1408). The mover assigns
  //     `onGround` outright from the body, so there is nothing to clear first.
  move?.(world);

  // The pit (index.html:1423), and the cape that can survive it.
  //
  // The `return` is OUTSIDE the branch and fires whether the player was saved or
  // killed, so nothing below this line runs on a pit frame either way — not the walk
  // cycle, not the invincibility decrement, not the power-up timers. That is what
  // keeps the 60 below a full 60 rather than a 59. And it is a return from the live
  // `update()` itself, so it also ends the whole frame: hence the `false` returned
  // here, which is what stops stepWorld running the enemies and the camera after a
  // SAVE, the same way `world.dead` already stopped them after a death.
  //
  // Four things in the save branch are easy to get subtly wrong:
  //
  //   - `capeSavesPit` is a super_easy-only field (difficulty.ts) and is read for
  //     truthiness, not compared — on every other difficulty it is simply absent and
  //     the pit kills. The live source reads it off a FRESH `DC()` here rather than
  //     the `dc` it captured at the top of update(); `world.dc` is the same record for
  //     the whole run, so this is the same read, just without the indirection.
  //   - The invincibility is a HARDCODED 60, NOT `dc.invincibleTime || 60` like the
  //     contact hit in playerHit below. On super_easy — the only difficulty that can
  //     reach this branch at all — invincibleTime is 120, so the two paths genuinely
  //     hand out different windows: 120 for a hit absorbed, 60 for a pit survived.
  //   - It is a RESCUE, not a bounce. `p.y` is teleported to `lvl.height*TILE - 32`,
  //     two tiles above the bottom of the world, which is well above wherever the
  //     player actually fell from — and it is assigned AFTER the condition above has
  //     already read the old `p.y`. `vy:-10` then throws it upward from there, harder
  //     than any jump on any difficulty.
  //   - The cape is spent. A second pit fall in the same life kills.
  //
  // Setting world.dead (inside playerDie) is what makes the next call (and every call
  // after that, until a respawn clears it) return at the top, freezing the player
  // where it fell. The live source's `spawnParticles`/`playTone` in the save branch
  // are presentation and sound, which src/game/ does not own.
  if (p.y > level.height * TILE + 32) {
    if (world.dc.capeSavesPit && p.hasCape) {
      p.hasCape = false;
      p.invincible = 60;
      p.vy = -10;
      p.y = level.height * TILE - 32;
      // index.html:1423's `playTone(400,.15,'sawtooth',.12,200)` — a bare tone rather
      // than one of the eleven named effects, which is how it stayed unported when this
      // file was first written. The same four-hundred-hertz slide plays when a cape
      // absorbs a contact hit (playerHit below), so one cue covers both.
      world.sounds.push('cape');
    } else {
      playerDie(world);
    }
    return false;
  }

  // The walk cycle (index.html:1424-1429), after collision — see stepWalkCycle above.
  stepWalkCycle(p);

  // Invincibility (index.html:1430), between the animation above and the power-up
  // timers below — and, crucially, well before the enemies pass that can SET it. A
  // cape absorbing a contact hit therefore never loses a frame to this: the enemy
  // check runs later in the same step, after the decrement has already gone by.
  if (p.invincible > 0) p.invincible--;

  // Power-up timers (index.html:1432-1433), after the walk cycle and therefore after
  // this frame's jump has already read `fartTimer` and this frame's stomp check has
  // not yet read `bigHeadTimer` (that happens in stepEnemy, later in the step).
  if (p.fartTimer > 0) p.fartTimer--;
  if (p.bigHeadTimer > 0) p.bigHeadTimer--;

  // Fart stink cloud (index.html:1439-1443). Every LIVING enemy whose centre is within
  // 50px of the player's centre gets 120 more frames of stun — added, not assigned, and
  // re-added every single frame the player stays in range. Two seconds of loitering is
  // four minutes of paralysis. Unbounded on purpose: this is the live behaviour.
  //
  // Note the order against the decrement above: a fart timer of exactly 1 is spent to 0
  // first and stuns nobody on its final frame. And note the distance is measured
  // centre-to-centre with a real `Math.sqrt`, not a squared comparison — keep it, so the
  // floating-point result is bit-for-bit the live game's.
  //
  // The live `(e.stunTimer||0)+120` guard is for a field it adds lazily; this port's
  // EnemyState always has one, starting at 0, so a plain `+=` is the same arithmetic.
  if (p.fartTimer > 0) {
    for (const e of world.enemies) {
      if (!e.alive) continue;
      const edx = e.x + e.w / 2 - (p.x + p.w / 2);
      const edy = e.y + e.h / 2 - (p.y + p.h / 2);
      if (Math.sqrt(edx * edx + edy * edy) < 50) e.stunTimer += 120;
    }
  }

  // Reached the bottom of the live player block without falling in a pit, so the rest
  // of update() still has a frame to run.
  return true;
}

/**
 * Port of index.html:1646 — what a cape is FOR. Called from the contact branch of the
 * enemy pass (enemy.ts), and by nothing else in this port; the live game also calls it
 * from the enemy-projectile and boss passes, neither of which exists here yet.
 *
 * With a cape on, the hit is absorbed: the cape is spent, the player is kicked up at
 * -4 (a nudge, not a jump — every difficulty's jumpForce is at least -7.2), and an
 * invincibility window opens. Without one, it is a death.
 *
 * `dc.invincibleTime || 60` is the fallback pattern the difficulty records force:
 * `invincibleTime` exists on super_easy alone, where it is 120 (difficulty.ts). Note
 * the live source computes `iTime` BEFORE testing `hasCape`, so it is read on the
 * death path too and simply thrown away — harmless, and not worth reproducing as a
 * dead read, but it is why the live line looks the way it does.
 *
 * This window is NOT the same as the pit save's, which hardcodes 60 (stepPlayer,
 * above). Do not factor the two together.
 *
 * The live function's `spawnParticles`/`triggerShake` are presentation and screen shake,
 * neither of which src/game/ owns. Its `playTone(400,.15,'sawtooth',.12,200)` is the
 * `cape` cue — the same tone the pit save plays, and the only feedback a child gets that
 * the cape is what just saved them.
 */
export function playerHit(world: World): void {
  const p = world.player;
  if (p.hasCape) {
    p.hasCape = false;
    p.invincible = world.dc.invincibleTime || 60;
    p.vy = -4;
    world.sounds.push('cape'); // index.html:1646
    return;
  }
  playerDie(world);
}

/**
 * Port of index.html:1647. Decrements `lives` — an ordinary `number` field that is
 * `Infinity` on super_easy (difficulty.ts), so this can leave it `Infinity`, exactly
 * like the live game's own untyped `lives--`; that is not a bug to fix. Freezes the
 * world (`dead`) and opens the 90-frame respawn countdown that `stepWorld`'s dead
 * branch counts down and, eventually, acts on.
 */
export function playerDie(world: World): void {
  world.lives--;
  world.dead = true;
  world.stateTimer = 90;
  // index.html:1647's `sfxHurt();stopBGM();`, in that order. The music stays off for the
  // whole ninety-frame countdown and comes back with the level itself — `respawnLevel`
  // (world.ts) raises `music-level` on the step it rebuilds. So a death is followed by a
  // real silence, and that silence is the game's loudest signal that something went wrong.
  world.sounds.push('hurt', 'music-stop');
}
