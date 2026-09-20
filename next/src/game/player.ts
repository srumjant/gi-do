import { GRAVITY, TILE } from '../config/constants';
import { TILE_BRICK, type Level } from '../data/levels';
import { GIGI_SKINS, DODO_SKINS } from '../data/sprites';
import type { InputState } from '../input/actions';
import { random } from './random';
import { getTile, isSolid } from './tiles';
import type { PlayerState, PowerupType, World } from './types';

export type Character = 'gigi' | 'dodo';

/**
 * Port of index.html:1363 — engine constants, not tunable per difficulty. Exported so
 * tests can check the deceleration rate without duplicating the literal.
 */
export const GRND_ACCEL = 0.6;
export const AIR_ACCEL = 0.4;
export const GRND_DECEL = 0.72;
export const AIR_DECEL = 0.92;

/**
 * Port of the player construction at index.html:1166-1171, sizing from the character's
 * stand frame rather than a hardcoded constant. `spriteW(s,sc) = s[0].length*sc`,
 * `spriteH(s,sc) = s.length*sc` (index.html:670), called with sc=2; the hitbox then
 * insets each dimension by 4 (index.html:1167). Only the classic (index 0) skin is
 * ported — skin selection is a later plan.
 */
export function createPlayer(level: Level, character: Character): PlayerState {
  const stand = character === 'dodo' ? DODO_SKINS[0].stand : GIGI_SKINS[0].stand;
  const pw = stand[0].length * 2;
  const ph = stand.length * 2;
  return {
    x: level.playerStart[0] * TILE,
    y: level.playerStart[1] * TILE,
    vx: 0,
    vy: 0,
    w: pw - 4,
    h: ph - 4,
    onGround: false,
    facing: 1,
    coyoteTime: 0,
    jumpBuffer: 0,
    frame: 0,
    frameTimer: 0,
    // index.html:1169's `hasBow:false, bowCharges:0`. Both are level state, not run
    // state: every respawn goes through initLevel, so dying really does cost you the
    // bow you picked up — unlike `score`, one field over on the World, which does not
    // reset. See respawnLevel in world.ts.
    hasBow: false,
    bowCharges: 0,
    // index.html:1169 is `hasCape:dc.startWithCape`, not a flat false — true on
    // super_easy, which is the only difficulty where the player spawns already wearing
    // one. Seeding it from the difficulty record belongs with the cape's own behaviour
    // (Task 6 of this plan); what the pickup grants is all that reads it today, and no
    // trace runs anything but `normal`, where the live value is false either way.
    hasCape: false,
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
 * The live function's trailing `sfxPickup();sfxWin();padRumble(...)` is sound and
 * haptics, which src/game/ does not own.
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
}

/**
 * Port of index.html:1418-1420 — what a head-first collision does to the two blocks it
 * could have landed on. Called from the head-hit branch of the Y sweep below, AFTER
 * that branch has already snapped `p.y` and zeroed `p.vy`.
 *
 * `hY` is the head's position BEFORE that snap, and it is what `hy` is floored from.
 * The snap moves the player down to the bottom edge of the tile that was hit, so
 * flooring the snapped `p.y` instead would name the tile row BELOW the block and the
 * lookup would miss. Same for `pL2`/`pR2`: the live source computes them once for the
 * whole Y sweep and reuses them here, and they are unaffected by the snap (which only
 * touches `y`), so passing them in rather than recomputing from `p.x` is the same
 * thing, just explicit.
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
 * The live source's `spawnParticles(...)` and `sfxBlock()` are presentation and sound,
 * which src/game/ does not own.
 */
function bumpBlocksAbove(world: World, pL2: number, pR2: number, hY: number): void {
  const h1 = Math.floor(pL2 / TILE);
  const h2 = Math.floor(pR2 / TILE);
  const hy = Math.floor(hY / TILE);

  for (const hx of [h1, h2]) {
    const qb = world.questionBlocks.find((q) => q.x === hx && q.y === hy && !q.hit);
    if (qb) {
      qb.hit = true;
      world.map[qb.y][qb.x] = TILE_BRICK;
      // One tile ABOVE the block, not at it — `qb.y*TILE - TILE` — and rising at -2,
      // which world.ts's stepStars then ramps toward zero and leaves hanging there.
      world.stars.push({ x: qb.x * TILE, y: qb.y * TILE - TILE, vy: -2, collected: false });
    }
  }
  for (const hx of [h1, h2]) {
    const rb = world.rainbowBlocks.find((q) => q.x === hx && q.y === hy && !q.hit);
    if (rb) {
      rb.hit = true;
      world.map[rb.y][rb.x] = TILE_BRICK;
      // Not a quiet state change: this freezes the entire game for 120 frames. See
      // giveRandomSillyPowerup above and the gate at the top of stepWorld.
      giveRandomSillyPowerup(world);
    }
  }
}

/**
 * Port of index.html:1361-1423. Mutates `world.player` (and `world.dead`) in place, in
 * exactly the source's order — every step here is load-bearing; see the comments below
 * and the task notes on the jump buffer, apex hang, and the two collision insets.
 *
 * Out of scope, and simply absent below: shooting, landing dust particles, the fart
 * trail's own particles, the cape branch of pit death, sound, and score. Enemy collision
 * is simulated (enemy.ts's stepEnemy), but calls into this file's `playerHit` rather
 * than living here — there is no enemy-collision branch in THIS function because the
 * live game's own equivalent isn't in `update`'s player block either; it is in the
 * enemies loop, ported alongside the enemies themselves.
 */
export function stepPlayer(world: World, input: InputState): void {
  // index.html:1348 — the live update() checks its dead-state branch, and returns,
  // before it ever reaches player movement. Reproduced by returning immediately: once
  // dead, nothing below runs again, so position and velocity freeze on the death frame.
  if (world.dead) return;

  const p = world.player;
  const dc = world.dc;
  const level = world.level;

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

  // Coyote time — allows jumping a few frames after leaving a ledge (index.html:1372-1373).
  if (p.onGround) {
    p.coyoteTime = 6;
  } else if (p.coyoteTime > 0) {
    p.coyoteTime--;
  }

  // Jump buffer — press jump slightly before landing (index.html:1374-1377). Set to 8,
  // then decremented in this SAME step, so it already reads 7 by the time anything
  // checks it this frame. Do not reorder these two lines.
  const jumpKey = input.jump;
  const jumpJust = input.jumpPressed;
  if (jumpJust) p.jumpBuffer = 8;
  if (p.jumpBuffer > 0) p.jumpBuffer--;

  // Execute jump: (coyote time OR on ground) AND (just pressed OR still buffered)
  // (index.html:1378-1383). The fart multiplies the force IN PLACE — 1.5x a jumpForce
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
  }

  // Variable jump height — release early for a short hop (index.html:1384-1386). The
  // clamp target is negative (jumpForce is negative), and only applies while vy is
  // still below (more negative than) it.
  if (!jumpKey && p.vy < dc.jumpForce * 0.4) {
    p.vy = dc.jumpForce * 0.4;
  }

  // Gravity: apex hang (reduced gravity near the jump peak) + faster fall
  // (index.html:1393-1394). `vy > 0` is tested BEFORE `isApex` — apex hang applies only
  // while RISING; a slow FALL takes the 1.2 branch even though |vy| < 1.5.
  const isApex = Math.abs(p.vy) < 1.5 && !p.onGround;
  const gMul = p.vy > 0 ? 1.2 : (isApex ? 0.6 : 1.0);
  p.vy += GRAVITY * gMul;
  if (p.vy > 8) p.vy = 8;

  // X movement + resolution (index.html:1395-1398). Probes are inset by 2px and taken
  // at three points: top, bottom, and the vertical midpoint.
  p.x += p.vx;
  const pL = p.x + 2;
  const pR = p.x + p.w - 2;
  const pT = p.y + 1;
  const pB = p.y + p.h - 1;
  const pMidY = pT + (pB - pT) / 2;
  if (p.vx > 0) {
    if (isSolid(getTile(world.map, pR, pT)) || isSolid(getTile(world.map, pR, pB))
        || isSolid(getTile(world.map, pR, pMidY))) {
      // The `+1` is real — this is not a mirror of the left side's `+ TILE - 2` below.
      p.x = Math.floor(pR / TILE) * TILE - p.w + 1;
      p.vx = 0;
    }
  } else if (p.vx < 0) {
    if (isSolid(getTile(world.map, pL, pT)) || isSolid(getTile(world.map, pL, pB))
        || isSolid(getTile(world.map, pL, pMidY))) {
      p.x = Math.floor(pL / TILE) * TILE + TILE - 2;
      p.vx = 0;
    }
  }

  // Y movement + resolution (index.html:1399-1411). `onGround` is reset to false
  // immediately and unconditionally, before the floor check below — reproduced even
  // though it makes the live source's own `wasAirborne` always true (that variable
  // only gated dust particles, which are out of scope). Probes here are inset by 3px
  // and taken at two points, not three.
  p.y += p.vy;
  p.onGround = false;
  const pL2 = p.x + 3;
  const pR2 = p.x + p.w - 3;
  if (p.vy > 0) {
    const fY = p.y + p.h;
    if (isSolid(getTile(world.map, pL2, fY)) || isSolid(getTile(world.map, pR2, fY))) {
      p.y = Math.floor(fY / TILE) * TILE - p.h;
      p.vy = 0;
      p.onGround = true;
    }
  } else if (p.vy < 0) {
    const hY = p.y;
    if (isSolid(getTile(world.map, pL2, hY)) || isSolid(getTile(world.map, pR2, hY))) {
      p.y = Math.floor(hY / TILE) * TILE + TILE;
      p.vy = 0;
      // index.html:1418-1420, inside this same branch and after this same snap — the
      // pre-snap `hY` is passed on deliberately; see bumpBlocksAbove.
      bumpBlocksAbove(world, pL2, pR2, hY);
    }
  }

  // Left clamp only — there is no right-hand bound (index.html:1412).
  if (p.x < 0) p.x = 0;

  // Pit death (index.html:1413, 1423). The cape-saves-the-pit branch is out of scope,
  // so every pit fall here takes the live `else{playerDie();}` path. Setting
  // world.dead (inside playerDie) is what makes the next call (and every call after
  // that, until a respawn clears it) return at the top, freezing the player where it
  // fell. The live source's own `return` right after this (index.html:1423) skips its
  // walk-cycle block below on the death frame itself — reproduced here the same way,
  // rather than letting the animation update once more on the frame the player dies.
  if (p.y > level.height * TILE + 32) {
    playerDie(world);
    return;
  }

  // Smooth animation — walk cycle speed matches player speed (index.html:1424-1429).
  // Runs at the END of the player block, after collision resolution, so it reacts to
  // this frame's already-resolved onGround/vx rather than last frame's.
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

  // Power-up timers (index.html:1432-1433), after the walk cycle and therefore after
  // this frame's jump has already read `fartTimer` and this frame's stomp check has
  // not yet read `bigHeadTimer` (that happens in stepEnemy, later in the step). The
  // live `if(p.invincible>0)p.invincible--;` sits between the animation and these two;
  // there is no invincibility on this port yet, so nothing stands in for it.
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
}

/**
 * Port of index.html:1646. The live function's first branch spends the cape for a
 * bounce plus temporary invincibility; there is no cape in this slice (`PlayerState`
 * has no `hasCape`/`invincible` field, and none is added here — invincibility frames
 * arrive with the cape, in a later plan), so every call here falls straight through
 * to the live function's only remaining path. When the cape does arrive, its branch
 * belongs in front of the call below, exactly where the live function has it.
 */
export function playerHit(world: World): void {
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
}
