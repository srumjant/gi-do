import { ENEMY_SCALE, GRAVITY, TILE } from '../config/constants';
import type { DifficultyRecord } from '../config/difficulty';
import type { EnemyDef, TileMap } from '../data/levels';
import {
  BAT_S, BOUNCER_S, CAR_S, DINO_S, DOLL_S, ICEBAT_S, PENGUIN_S, type SpriteData,
} from '../data/sprites';
import { playerHit } from './player';
import { findGroundY, getTile, isSolid, rectOverlap } from './tiles';
import type { EnemyState, World } from './types';

/**
 * Ground patrollers (index.html:1212-1222, 1524-1547) — doll, car, dino, penguin —
 * plus the two other types level 1 actually spawns: bat/icebat (sine-wave flight) and
 * bouncer (hops). Ghost (homes on the player) and cannon (shoots) remain streamed
 * types this slice does not implement. Their pending defs are still consumed by the
 * spawn window in world.ts exactly where the live game would spawn them (so later
 * defs still line up frame-for-frame) — this map is just how `spawnEnemy` recognises
 * "not this slice's problem" and returns undefined instead of pushing an enemy that
 * would then sit there unanimated and unreactive. A half-simulated enemy is worse
 * than a missing one.
 *
 * Sizes come from the actual sprite grids (index.html:670's spriteW/spriteH: cols/rows
 * times ENEMY_SCALE — ported here as plain arithmetic since `getEnemySpriteInfo`
 * itself was deliberately left out of sprites.ts as behaviour, not data), not hardcoded
 * pixel constants, so a size here moves with the art exactly as the live one does.
 */
const ENEMY_SPRITES: Partial<Record<string, SpriteData>> = {
  doll: DOLL_S,
  car: CAR_S,
  dino: DINO_S,
  penguin: PENGUIN_S,
  bat: BAT_S,
  icebat: ICEBAT_S,
  bouncer: BOUNCER_S,
};

/**
 * The one Math.random() call in this slice's simulation (the bat/icebat sineOffset
 * below). An injectable source rather than a call to the global directly, so the
 * golden trace suite can point it at the exact same value the live driver's sandboxed
 * Math.random already resolves to (tests/helpers/liveGame.ts stubs it to a constant
 * 0.5) and have both sides draw the identical number. Deliberately NOT a seeded PRNG:
 * the live stub is a constant, not a sequence, so matching it only ever needs a
 * constant back, never a reproducible sequence of different ones.
 */
let randomSource: () => number = Math.random;

/** Test seam for `randomSource` above — production code never calls this. */
export function setRandom(fn: () => number): void {
  randomSource = fn;
}

/**
 * Port of index.html:1212-1222, now covering every type level 1 spawns (doll, car,
 * dino, bat, bouncer — penguin/icebat besides, for levels this slice does not reach
 * yet). Returns undefined for every other streamed type (ghost, cannon) so the caller
 * (`spawnEnemiesInView` in world.ts) can skip it.
 */
export function spawnEnemy(
  map: TileMap,
  dc: DifficultyRecord,
  def: EnemyDef,
): EnemyState | undefined {
  const sprite = ENEMY_SPRITES[def.type];
  if (!sprite) return undefined;

  const h = sprite.length * ENEMY_SCALE;
  const w = sprite[0].length * ENEMY_SCALE;
  const gy = findGroundY(map, def.x);
  // Every type here defaults to -0.8*enemySpeed (index.html:1215); penguin is the one
  // override baked into the default rather than applied after, since nothing else
  // about the base object changes for it. bat/icebat/bouncer below still read like the
  // live game's own POST-construction overrides (index.html:1217, 1219), because each
  // changes more than just vx.
  const vx = def.type === 'penguin' ? -0.6 * dc.enemySpeed : -0.8 * dc.enemySpeed;

  const e: EnemyState = {
    type: def.type, x: def.x * TILE, y: gy - h, vx, vy: 0, w, h, alive: true,
    frame: 0, frameTimer: 0, squashTimer: 0,
    noGravity: false, originY: 0, sineOffset: 0, bounceTimer: 0,
  };

  // index.html:1217 — a fixed-height flyer, not a physics body: no gravity, and its y
  // is rewritten from scratch every frame (stepEnemy below) from `originY` — set here,
  // once, 60px above where it would otherwise have stood on the ground — plus a sine
  // of the SHARED animFrame clock, offset per-instance by `sineOffset` so multiple bats
  // on screen don't move in lockstep. `icebat` shares this branch too: it does not
  // appear in level 1, but costs nothing extra to support here since it is the exact
  // same live branch.
  if (def.type === 'bat' || def.type === 'icebat') {
    e.y = gy - h - 60;
    e.originY = e.y;
    e.vx = -1.2 * dc.enemySpeed;
    e.noGravity = true;
    e.sineOffset = randomSource() * Math.PI * 2;
  } else if (def.type === 'bouncer') {
    // index.html:1219 — starts at rest (vy stays 0, the base object's default, until
    // gravity below first touches it) with the hop countdown at zero; stepEnemy fires
    // the first hop once it clears 40.
    e.vx = -1.0 * dc.enemySpeed;
    e.bounceTimer = 0;
  }

  return e;
}

/**
 * Port of the per-enemy step at index.html:1524-1547: gravity + floor snap (skipped
 * for a noGravity flyer), the per-type movement branch, the frame flip, the stomp, and
 * side/rising contact (playerHit — death, since there is no cape in this slice).
 * ghost and cannon still never reach the per-type branch below — `spawnEnemy` above
 * never creates either — so, as before, there is no branch for them here at all.
 *
 * Mutates `enemy` in place, `world.player.vy` on a kill, and `world` itself (`dead`,
 * `lives`, `stateTimer`, via playerHit) on a hit — exactly like `stepPlayer` mutates
 * `world.player` and `world.dead`.
 */
export function stepEnemy(world: World, e: EnemyState): void {
  // index.html:1525 — the squash countdown runs even for a dead enemy (set to 30, or
  // 45 with big-head — out of scope — on the stomp below), so a stomped enemy keeps
  // rendering, flattened, for half a second rather than vanishing the instant it dies.
  // Nothing else below runs, so a dead enemy still simply stops where it died. The
  // live source's very next line, `if(e.stunTimer>0){e.stunTimer--;return;}`
  // (index.html's fart-stun), is out of scope — no field for it exists on this port's
  // EnemyState, so there is nothing to reproduce there.
  if (!e.alive) {
    if (e.squashTimer > 0) e.squashTimer--;
    return;
  }

  const map = world.map;
  const p = world.player;
  const dc = world.dc;

  // Gravity + floor snap (index.html:1526-1528), skipped entirely for a noGravity
  // flyer (bat/icebat here; ghost too, live, but this slice never spawns one) — it
  // writes its own y every frame instead, in its own branch below.
  if (!e.noGravity) {
    e.vy += GRAVITY;
    if (e.vy > 8) e.vy = 8;
    e.y += e.vy;
    const eF = e.y + e.h;
    if (isSolid(getTile(map, e.x + e.w / 2, eF)) || isSolid(getTile(map, e.x + 2, eF))
        || isSolid(getTile(map, e.x + e.w - 2, eF))) {
      e.y = Math.floor(eF / TILE) * TILE - e.h;
      e.vy = 0;
    }
  }

  if (e.type === 'bat' || e.type === 'icebat') {
    // index.html:1533 — x drifts at the constant vx spawnEnemy gave it; y is
    // overwritten from scratch every frame off `world.animFrame` (not a per-enemy
    // timer — every bat reads the same shared clock and differs only by its own
    // sineOffset) rather than integrated, so nothing here ever drifts numerically.
    // Turns only at the WORLD's edges, never at a wall or a ledge — there is no tile
    // read in this branch at all.
    e.x += e.vx;
    e.y = e.originY + Math.sin(world.animFrame * 0.06 + e.sineOffset) * 30;
    if (e.x < 0 || e.x > world.level.width * TILE) e.vx *= -1;
  } else if (e.type === 'bouncer') {
    // index.html:1537 — hops rather than walks. Sits until `bounceTimer` clears 40
    // while resting (vy===0 — the gravity block above already resolved that for this
    // frame), then fires a new hop: a fixed vertical kick (dc.bouncerJumpForce) and a
    // fresh horizontal aim at whichever side the PLAYER is currently on, re-decided on
    // every hop rather than fixed at spawn. Uses gravity like the ground patrollers
    // (no noGravity here), and turns at a wall but — unlike the ground patrol below —
    // never at a ledge, so it can hop straight into a pit. That is live behaviour, not
    // a bug this port should guard against.
    e.bounceTimer++;
    if (e.bounceTimer > 40 && e.vy === 0) {
      e.vy = dc.bouncerJumpForce;
      e.bounceTimer = 0;
      e.vx = (p.x > e.x ? 1.5 : -1.5) * dc.enemySpeed;
    }
    e.x += e.vx;
    const ef = e.vx > 0 ? e.x + e.w : e.x;
    if (isSolid(getTile(map, ef, e.y + e.h / 2))) e.vx *= -1;
  } else {
    // Ground patrol (index.html:1546-1547): doll, car, dino, penguin. No horizontal
    // tile resolution at all, only a direction flip. `ef`/`ef2` are computed once,
    // from the direction of travel AFTER `e.x` has already moved, and reused for both
    // checks — so a wall-flip and a ledge-flip on the same frame can cancel each other
    // out, exactly as the live game's own logic does; that is reproduced rather than
    // smoothed over. Unlike the player's wall collision, there is no position
    // correction here: the enemy can end up one frame's `vx` deep into a wall tile
    // before the flip takes effect, exactly as live.
    e.x += e.vx;
    const ef2 = e.y + e.h + 2;
    const ef = e.vx > 0 ? e.x + e.w : e.x;
    if (isSolid(getTile(map, ef, e.y + e.h / 2))) e.vx *= -1; // wall
    const gA = getTile(map, ef, ef2);
    if (!isSolid(gA) && isSolid(getTile(map, e.x + e.w / 2, ef2))) e.vx *= -1; // ledge
  }

  // Frame flip (index.html:1540), after the movement branches above — the live
  // source's flip runs after ALL of its per-type branches, patroller or not, so this
  // is placed the same way relative to the three this port has.
  e.frameTimer++;
  if (e.frameTimer > 15) {
    e.frame = 1 - e.frame;
    e.frameTimer = 0;
  }

  // Stomp (index.html:1541-1543). The live box also shrinks/grows for big-head and
  // gates on invincibility; neither exists on this port's PlayerState, which has the
  // same effect as both always being "off" — shm collapses to plain `dc.stompHitbox ||
  // 1` and the overlap box is the plain +2/-4 inset. This is NOT the tile-collision box
  // from player.ts: that one insets y by 1-3px too; this one does not.
  const shm = dc.stompHitbox || 1;
  if (rectOverlap(
    { x: p.x + 2, y: p.y, w: p.w - 4, h: p.h },
    { x: e.x, y: e.y, w: e.w, h: e.h },
  )) {
    if (p.vy > 0 && p.y + p.h - 4 < e.y + (e.h * shm) / 2) {
      e.alive = false;
      e.squashTimer = 30; // index.html:1545. Big-head's 45 (:1546) is out of scope.
      p.vy = -5;
    } else {
      // Side or rising contact (index.html:1547's `else{playerHit();return;}`). No
      // cape in this slice, so this goes straight to death — see player.ts's
      // playerHit/playerDie. The live `return` only exits THIS enemy's own
      // `enemies.forEach` callback (there is nothing left in it anyway); it does not
      // stop the live forEach from stepping the rest of `enemies`, nor the camera
      // lerp after it, on the same frame — both already happen unconditionally here
      // too, since neither stepEnemies' loop nor stepCamera's call in world.ts checks
      // world.dead mid-frame. Only the NEXT frame's top-of-stepWorld check freezes
      // everything. Mirrored exactly: no early return is added to stepEnemies below.
      playerHit(world);
      return;
    }
  }
}
