import { GRAVITY, TILE } from '../config/constants';
import type { Level } from '../data/levels';
import { GIGI_SKINS, DODO_SKINS } from '../data/sprites';
import type { InputState } from '../input/actions';
import { getTile, isSolid } from './tiles';
import type { PlayerState, World } from './types';

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
  };
}

/**
 * Port of index.html:1361-1423. Mutates `world.player` (and `world.dead`) in place, in
 * exactly the source's order — every step here is load-bearing; see the comments below
 * and the task notes on the jump buffer, apex hang, and the two collision insets.
 *
 * Out of scope, and simply absent below: shooting, fart/big-head power-ups, landing
 * dust particles, question/rainbow block bumps, the cape branch of pit death, sound,
 * and score. Enemies are not simulated at all (no enemy stepping exists yet), so there
 * is no enemy-collision branch to reproduce here either.
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
  // (index.html:1378-1383). The live branch also picks a 1.5x force while a fart timer
  // is running; fart power-ups are out of scope, so this always takes the plain
  // dc.jumpForce path.
  const canJump = p.onGround || p.coyoteTime > 0;
  if (canJump && p.jumpBuffer > 0) {
    p.vy = dc.jumpForce;
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
    }
  }

  // Left clamp only — there is no right-hand bound (index.html:1412).
  if (p.x < 0) p.x = 0;

  // Pit death (index.html:1413). The cape-saves-the-pit branch is out of scope, so
  // every pit fall here is fatal. Setting world.dead is what makes the next call (and
  // every call after that) return at the top, freezing the player where it fell. The
  // live source's own `return` right after this (index.html:1413) skips its walk-cycle
  // block below on the death frame itself — reproduced here the same way, rather than
  // letting the animation update once more on the frame the player dies.
  if (p.y > level.height * TILE + 32) {
    world.dead = true;
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
}
