import { ENEMY_SCALE, GRAVITY, TILE } from '../config/constants';
import type { DifficultyRecord } from '../config/difficulty';
import type { EnemyDef, TileMap } from '../data/levels';
import {
  BAT_S, BOUNCER_S, CAR_S, CHICKEN_S, DINO_S, DOLL_S, ICEBAT_S, PENGUIN_S, type SpriteData,
} from '../data/sprites';
import { playerHit } from './player';
import { random } from './random';
import { findGroundY, getTile, isSolid, rectOverlap } from './tiles';
import type { EnemyState, World } from './types';

/**
 * Which side of a ground patroller Arcade had to push it off, on the step it just took.
 * Both false is the ordinary case: it walked, and nothing was in the way.
 */
export interface EnemyBlocked {
  readonly left: boolean;
  readonly right: boolean;
}

/**
 * What moves a ground-patrol enemy, injected into `stepEnemy` below — the enemies' half of
 * `PlayerMove` (player.ts), and injected for exactly the same reasons.
 *
 * It replaces, for doll / car / dino / penguin / chicken only, the parts of
 * index.html:1527-1528 and :1538 that touch position: the `e.y += e.vy` integration, the
 * three-probe floor snap, the `e.x += e.vx` integration and the wall test. Its contract is
 * the whole of what those did:
 *
 *   - integrate `e.x` from `e.vx` and `e.y` from `e.vy`;
 *   - separate the enemy out of any solid tile it ended up inside;
 *   - zero `e.vy` when it was the VERTICAL axis that was blocked (which is what the live
 *     floor snap did, and what keeps a standing enemy standing);
 *   - LEAVE `e.vx` ALONE, and report which side was blocked instead.
 *
 * That last one is the one surprise, and it is not an oversight. Arcade zeroes the
 * velocity on whatever axis it separated (`ProcessTileSeparationX`), which is right for
 * the player — it re-accelerates from the keys every frame — and wrong for an enemy, whose
 * `vx` IS its patrol: `-0.8 * dc.enemySpeed`, assigned once at spawn and thereafter only
 * ever sign-flipped. Read a separated `vx` back and a doll walking into a wall would stop
 * dead, `-1 * 0` being 0. So the patrol keeps its own `vx`, and the wall reversal is
 * driven from the flags this returns. It also means the patrol speed stays the exact
 * number spawnEnemy assigned rather than drifting by an ulp a frame through the
 * px-per-frame/px-per-second conversion.
 *
 * NOT used by bat, icebat or bouncer, which is deliberate and is the spec's own split.
 * A bat writes its `y` from a sine every frame and has `noGravity` set, so there is no
 * integration for a body to own; the bouncer hops, ignores ledges and is meant to sail
 * into pits. Neither reaches this.
 *
 * OPTIONAL for the same reason `PlayerMove` is: most of the suite does not care how an
 * enemy got where it is, and Arcade cannot be constructed under Vitest at all. Left out,
 * a ground patroller simply does not move — which is honest, and visibly wrong the moment
 * a test depends on movement, rather than quietly running a second physics engine that
 * nothing ships. tests/helpers/testMove.ts has the stand-in the tests inject, and its
 * header says what that does and does not prove.
 */
export type EnemyMove = (world: World, e: EnemyState) => EnemyBlocked;

/**
 * Does this enemy fall through to the ground-patrol branch of `stepEnemy` below — the live
 * source's final `else` (index.html:1538-1539)?
 *
 * Asked rather than listed, and asked of the type rather than of a flag, because that is
 * how the live `if/else if/else` chain decides it: everything that is not one of the
 * types with a branch of its own is a ground patroller. This port has three such branches
 * (bat, icebat, bouncer) where the live source has five — ghost and cannon are streamed
 * types `spawnEnemy` never creates, so they cannot arrive here — which leaves doll, car,
 * dino, penguin and `chicken`.
 *
 * `chicken` is why this is worth a named function. Nothing spawns one: a chicken is
 * whatever a chicken ray hit (`chickenify` below), and a hit BAT becomes a ground
 * patroller in mid-air, on the frame it is converted. Answering from the live rule rather
 * than from a list of spawnable types is what makes that case need no special handling at
 * all — including in physics/enemy.ts, which gives an enemy its Arcade body the first time
 * it is asked to move one.
 */
export function isGroundPatrol(e: EnemyState): boolean {
  return e.type !== 'bat' && e.type !== 'icebat' && e.type !== 'bouncer';
}

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
    noGravity: false, originY: 0, sineOffset: 0, bounceTimer: 0, stunTimer: 0,
    isChicken: false,
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
    e.sineOffset = random() * Math.PI * 2;
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
 * Port of index.html:1507-1509 — what a chicken ray does to whatever it hits. Called
 * from world.ts's stepArrows, which owns the arrow pass the live source has this inside.
 *
 * This REWRITES the enemy in place rather than replacing it: same object, same slot in
 * `world.enemies`, new everything else. The three flags are the interesting part —
 *
 *   - `noGravity` going false is what turns a BAT into a ground animal. A bat writes its
 *     own `y` every frame off a sine and never falls; clear the flag and stepEnemy's
 *     gravity block starts running again, so the converted bird drops out of the air,
 *     lands on the floor, and patrols it like a doll. Its `originY` and `sineOffset` are
 *     left behind untouched and simply stop being read, exactly as they are on the live
 *     object.
 *   - `stunTimer` is ZEROED, so a chicken ray also cures a fart stun. That is a real
 *     behaviour change, not housekeeping: a stunned enemy is frozen and harmless
 *     (stepEnemy returns above everything), and this hands it back its legs.
 *   - The live source also clears `noStomp` here. This port has no such field — only
 *     cannon sets it (index.html:1218) and spawnEnemy above never creates one — so
 *     "always off" already IS the post-conversion state and there is nothing to write.
 *
 * `type` becomes 'chicken', which no branch of stepEnemy names, so the converted enemy
 * falls into the ground-patrol `else` — which is precisely what the live game does with
 * it too. Size comes from the chicken sprite grid at ENEMY_SCALE, the same arithmetic
 * spawnEnemy uses, so an 8x7 grid at 1.8 makes a 14.4 x 12.6 bird whatever the enemy
 * used to be.
 *
 * The direction is a fresh coin flip — `Math.random() > .5 ? 1 : -1`, times a FLAT 1.5
 * with no `dc.enemySpeed` anywhere in it, unlike every speed spawnEnemy assigns. Drawn
 * through random.ts's seam like the other two simulation draws; note the trace harness's
 * constant 0.5 makes `0.5 > 0.5` FALSE, so a stubbed chicken always walks left.
 */
export function chickenify(e: EnemyState): void {
  e.isChicken = true;
  e.type = 'chicken';
  e.vx = (random() > 0.5 ? 1 : -1) * 1.5;
  e.noGravity = false;
  e.stunTimer = 0;
  e.w = CHICKEN_S[0].length * ENEMY_SCALE;
  e.h = CHICKEN_S.length * ENEMY_SCALE;
}

/**
 * Port of the per-enemy step at index.html:1524-1547: gravity + floor snap (skipped
 * for a noGravity flyer), the per-type movement branch, the frame flip, the stomp, and
 * side/rising contact (playerHit — a death, or the cape being spent instead).
 * ghost and cannon still never reach the per-type branch below — `spawnEnemy` above
 * never creates either — so, as before, there is no branch for them here at all.
 *
 * Mutates `enemy` in place, `world.player.vy` on a kill, and, via playerHit, either the
 * player (`hasCape`, `invincible`, `vy`) or `world` itself (`dead`, `lives`,
 * `stateTimer`) on a hit — exactly like `stepPlayer` mutates `world.player` and
 * `world.dead`.
 *
 * `move` is what actually moves a GROUND PATROLLER and separates it out of the tiles —
 * Arcade, in the browser (physics/enemy.ts). It reaches only the last branch below; the
 * bat, the icebat and the bouncer are still moved by hand, deliberately. See EnemyMove at
 * the top of this file.
 *
 * The stomp and the contact damage at the bottom are untouched by any of that. They read
 * `rectOverlap` over player and enemy state that has already been resolved, which is
 * exactly what they read before, and turning them into Arcade overlap callbacks would put
 * the game's most safety-critical interaction at risk for nothing.
 */
export function stepEnemy(world: World, e: EnemyState, move?: EnemyMove): void {
  // index.html:1525 — the squash countdown runs even for a dead enemy (set to 30, or 45
  // when a big head did the stomping — see the stomp below), so a stomped enemy keeps
  // rendering, flattened, for half a second rather than vanishing the instant it dies.
  // Nothing else below runs, so a dead enemy still simply stops where it died.
  if (!e.alive) {
    if (e.squashTimer > 0) e.squashTimer--;
    return;
  }

  // Fart stun (index.html:1526). A stunned enemy is frozen WHOLE: no gravity, no floor
  // snap, no movement branch, no frame flip — and, the part that actually changes play,
  // no stomp box and no contact damage either, because this `return` is above all of
  // them. You can walk straight through a stunned enemy unharmed. The counter itself is
  // topped up by stepPlayer's stink cloud (player.ts), 120 frames at a time, EVERY frame
  // the player stands within 50px — so a second of loitering buys minutes of paralysis.
  // Unbounded and cumulative on purpose; that is what the live game does.
  if (e.stunTimer > 0) {
    e.stunTimer--;
    return;
  }

  const map = world.map;
  const p = world.player;
  const dc = world.dc;

  // Gravity (index.html:1527-1528), skipped entirely for a noGravity flyer (bat/icebat
  // here; ghost too, live, but this slice never spawns one) — it writes its own y every
  // frame instead, in its own branch below.
  //
  // The ACCELERATION is everyone's; the INTEGRATION and the three-probe floor snap under
  // it are the bouncer's alone now. A ground patroller is an Arcade body from this task
  // on, and `move` below does both for it — see EnemyMove at the top of this file. The
  // acceleration stays here rather than becoming Arcade's `body.gravity` for the same
  // reason the player's does (main.ts): the world's gravity is zero, and a body that
  // brought its own would be a second place the number lives.
  if (!e.noGravity) {
    e.vy += GRAVITY;
    if (e.vy > 8) e.vy = 8;
    if (!isGroundPatrol(e)) {
      e.y += e.vy;
      const eF = e.y + e.h;
      if (isSolid(getTile(map, e.x + e.w / 2, eF)) || isSolid(getTile(map, e.x + 2, eF))
          || isSolid(getTile(map, e.x + e.w - 2, eF))) {
        e.y = Math.floor(eF / TILE) * TILE - e.h;
        e.vy = 0;
      }
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
    // index.html:1536-1537 — hops rather than walks. Sits until `bounceTimer` clears 40
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
    // Ground patrol (index.html:1538-1539): doll, car, dino, penguin — and 'chicken',
    // which has no branch of its own here for the same reason it has none in the live
    // source, so a converted enemy patrols the floor like a doll.
    //
    // Arcade moves it and separates it (`move`, and physics/enemy.ts behind that); the two
    // direction flips stay here, hand-written, because only one of them has an Arcade
    // equivalent:
    //
    //   - THE WALL. `blocked.left`/`blocked.right` is the answer, and it has to be. The
    //     live test — is the tile under the leading edge solid? — cannot survive
    //     separation: Arcade puts the body FLUSH against the wall, and a leftward
    //     patroller's leading edge is then exactly on the tile boundary, which `getTile`
    //     floors into the empty column it was just pushed out of. The probe would never
    //     fire again and the enemy would grind against the wall for the rest of the level.
    //     (Rightward it would still fire, since the right edge is exclusive — an asymmetry
    //     worth knowing about before anyone tries to keep the old probe.)
    //   - THE LEDGE, which has no Arcade equivalent at all and is the whole reason enemies
    //     stay on their platforms: the tile ahead-and-below is empty while the tile
    //     below-centre is solid, so there is floor underfoot but none to walk onto.
    //
    // `ef`/`ef2` are computed once, from the direction of travel BEFORE either flip, and
    // `ef` is reused for both checks — so a wall-flip and a ledge-flip on the same frame
    // can cancel each other out, exactly as the live game's own single `ef` does; that is
    // reproduced rather than smoothed over.
    //
    // Changed, and worth saying out loud: the live enemy has no position correction at a
    // wall, so it walks up to one frame's `vx` INTO the wall tile before the flip takes
    // effect and visibly sinks into it. Arcade stops it flush. Same defect the player's
    // own wall snap had, fixed the same way, and a real difference from index.html.
    const blocked = move?.(world, e);
    const ef2 = e.y + e.h + 2;
    const ef = e.vx > 0 ? e.x + e.w : e.x;
    if (blocked && (e.vx > 0 ? blocked.right : blocked.left)) e.vx *= -1; // wall
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

  // Stomp (index.html:1542-1546). Two big-head adjustments, and they are not the same
  // adjustment twice:
  //
  //   - `shm` scales how far DOWN the enemy the stomp still counts, and the two factors
  //     COMPOUND: `(dc.stompHitbox||1) * 1.5`. super_easy's stompHitbox of 2.0 becomes
  //     3.0, i.e. the whole enemy and half again below it. The `|| 1` fallback is
  //     load-bearing — stompHitbox exists on super_easy alone (difficulty.ts).
  //   - `bhx` widens the OVERLAP box by 8px on each side (`-bhx` on x, `+bhx*2` on w)
  //     and leaves the height alone. That cuts both ways: a big head is easier to stomp
  //     WITH and easier to get hit WITH, since the same wider box feeds the `else`
  //     branch below.
  //
  // `p.invincible<=0` gates the WHOLE check, not just the damage branch: a player in
  // the window after a cape absorbed a hit cannot be hurt by an enemy, and cannot
  // stomp one either — walking through a doll mid-blink kills neither of you.
  //
  // The live source's `!e.noStomp` gate on the stomp branch is still absent: noStomp
  // is set by cannon alone (index.html:1218), a type spawnEnemy never creates, so
  // omitting it has the same effect as it always being off.
  //
  // This is NOT the tile-collision box from player.ts: that one insets y by 1-3px too;
  // this one does not.
  const shm = (dc.stompHitbox || 1) * (p.bigHeadTimer > 0 ? 1.5 : 1);
  const bhx = p.bigHeadTimer > 0 ? 8 : 0;
  if (p.invincible <= 0 && rectOverlap(
    { x: p.x + 2 - bhx, y: p.y, w: p.w - 4 + bhx * 2, h: p.h },
    { x: e.x, y: e.y, w: e.w, h: e.h },
  )) {
    if (p.vy > 0 && p.y + p.h - 4 < e.y + (e.h * shm) / 2) {
      e.alive = false;
      e.squashTimer = 30; // index.html:1545
      p.vy = -5;
      // Also index.html:1545, in this position, and only portable now that `score`
      // exists on the World at all. Rounded at the award site, never accumulated —
      // see world.ts's stepStars for why that distinction is load-bearing.
      world.score += Math.round(200 * dc.scoreMultiplier);
      // index.html:1546 — written AFTER the 30 above, overwriting it, exactly as the
      // live source does rather than as a ternary on the assignment. Same result, but
      // this is the shape that stays obviously faithful if either number ever moves.
      if (p.bigHeadTimer > 0) e.squashTimer = 45;
    } else {
      // Side or rising contact (index.html:1547's `else{playerHit();return;}`). With
      // a cape on this is survived rather than fatal, and the survivor is invincible
      // for a while afterwards — see player.ts's playerHit. The `return` below fires
      // either way, so an enemy that is merely bumped into still ends its own turn
      // here without moving again. The live `return` only exits THIS enemy's own
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
