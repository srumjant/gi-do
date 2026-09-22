import { TILE } from '../config/constants';
import type { DifficultyRecord } from '../config/difficulty';
import { LEVELS, type Level, type TileMap } from '../data/levels';
import { BOSS_IDLE } from '../data/sprites';
import { playerHit } from './player';
import { findGroundY, rectOverlap } from './tiles';
import type { BossState, World } from './types';

/** The boss draws — and collides — at four times its sprite grid (index.html:1198). */
export const BOSS_SCALE = 4;

/**
 * Whether this level is the one with the boss on it.
 *
 * The live test is `idx === LEVELS.length-1` (index.html:1195), against the level INDEX.
 * A World deliberately does not carry its own index — that decision is recorded all over
 * this port, most visibly in the `music-level` cue, which raises no argument because the
 * World cannot supply one — so the identity of the record is used instead. `createWorld`
 * assigns `world.level = LEVELS[levelIndex]`, so the two tests agree exactly, and a World
 * built on a fabricated level (no test does this today) correctly gets no boss.
 */
export function isFinalLevel(level: Level): boolean {
  return level === LEVELS[LEVELS.length - 1];
}

/**
 * Port of index.html:1197-1208 — the boss, built by `initLevel` on the final level and
 * nowhere else.
 *
 * Positioned six tiles LEFT of the rescue and standing on whatever `findGroundY` finds in
 * that column, which on level 6 is the platform at [147,14,4] rather than the floor. That
 * `y` is the only one the boss will ever have: nothing integrates it and nothing collides
 * it (see BossState in types.ts).
 *
 * HP IS THE DIFFICULTY DIAL. There is no `bossHp` field on any difficulty record; the
 * live line reads `dc.enemySpeed` and steps it through four thresholds
 * (index.html:1202) — 0.3 -> 5, 0.6 -> 7, 1.0 -> 10, 1.4 -> 14 for the four records this
 * port has. Written below as the live ternary chain rather than a table, because the
 * thresholds are `<=` boundaries on a continuum and not a lookup: a difficulty added
 * later with an `enemySpeed` of 0.8 would get 10, and a table keyed by difficulty name
 * would silently have nothing to say about it.
 *
 * The shoot interval is `dc.enemyShootInterval * 1.2` — a fifth slower than the cannon
 * fires on the same difficulty, so the two shooters do not sound like one another.
 */
export function spawnBoss(map: TileMap, dc: DifficultyRecord, level: Level): BossState {
  const bTX = level.rescuePos[0] - 6;
  const bGY = findGroundY(map, bTX);
  const h = BOSS_IDLE.length * BOSS_SCALE;
  const w = BOSS_IDLE[0].length * BOSS_SCALE;
  const hp = dc.enemySpeed <= 0.4 ? 5 : dc.enemySpeed <= 0.7 ? 7 : dc.enemySpeed <= 1.0 ? 10 : 14;
  return {
    x: bTX * TILE,
    y: bGY - h,
    vx: 0,
    w,
    h,
    hp,
    maxHp: hp,
    alive: true,
    shootTimer: 0,
    shootInterval: dc.enemyShootInterval * 1.2,
    chargeTimer: 0,
    charging: false,
    chargeVx: 0,
    hurtTimer: 0,
    phase: 0,
    facing: -1,
    frame: 0,
    frameTimer: 0,
    roarTimer: 0,
    roarCooldown: 0,
  };
}

/**
 * Port of the whole boss fight, index.html:1559-1626, run once per step from `stepWorld`
 * between the enemy-projectile pass and the rescue check — exactly where the live source
 * has it.
 *
 * Returns immediately when there is no boss (every level but the last) or the boss is
 * already down, which is the live `if(boss&&boss.alive)` guard. That guard is checked
 * ONCE, at the top, and everything below it runs on the frame the boss dies — see the
 * arrow pass at the bottom for what that actually permits.
 *
 * The movement is not a physics step and nothing here pretends otherwise: `y` is never
 * touched, the tile map is never consulted, and the only thing that stops the boss
 * walking out of the arena is the clamp. See BossState in types.ts, and Plan 7's
 * "explicitly NOT bodied" list, which names the boss.
 *
 * The live source's `spawnParticles`, `triggerShake` and `playTone` calls are
 * presentation, screen shake and sound: the first two this port does not have, and the
 * third goes on `world.sounds` as a cue.
 */
export function stepBoss(world: World): void {
  const b = world.boss;
  if (!b || !b.alive) return;
  const { player: p, dc, level: lvl } = world;

  // index.html:1561. `> 12`, so the flip is every THIRTEEN frames — slower than an
  // enemy's fifteen-frame cycle reads, because the boss is four times the size and a
  // quicker cycle on a 72px sprite looks like a twitch.
  b.frameTimer++;
  if (b.frameTimer > 12) {
    b.frame = 1 - b.frame;
    b.frameTimer = 0;
  }
  if (b.hurtTimer > 0) b.hurtTimer--;

  // index.html:1564. Note this compares the player against the boss's LEFT EDGE while
  // the shot direction below compares against its CENTRE — two different tests on the
  // same frame, which is the live source's own asymmetry and not a simplification to
  // make here. Standing inside the boss's left half aims its fireballs away from you
  // while it faces you.
  b.facing = p.x < b.x ? -1 : 1;

  // Fireballs (index.html:1566-1573). TWO per volley, and they are not a spread in the
  // sense the name suggests: both have a CONSTANT vy that nothing ever accelerates, so
  // they travel as two straight lines diverging forever rather than as two arcs. Item 4
  // of the bug-compatibility contract; see EnemyProjectile in types.ts.
  //
  // The two differ in every number: the flatter one is faster (2.5 against 2) and lives
  // longer (120 frames against 100). They are spawned from the same point, 10px to the
  // firing side of the boss's centre, at half its height.
  b.shootTimer++;
  if (b.shootTimer >= b.shootInterval) {
    b.shootTimer = 0;
    const dir = p.x > b.x + b.w / 2 ? 1 : -1;
    const ox = b.x + b.w / 2 + dir * 10;
    const oy = b.y + b.h / 2;
    world.enemyProjectiles.push({ x: ox, y: oy, vx: dir * 2.5, vy: -1, life: 120 });
    world.enemyProjectiles.push({ x: ox, y: oy, vx: dir * 2, vy: -2, life: 100 });
    world.sounds.push('boss-fire'); // index.html:1572
  }

  // index.html:1575-1576. A roar freezes the boss where it stands and the cooldown only
  // starts counting once the roar is over — the `else if` is what staggers them, and
  // writing it as two independent countdowns would let a second roar land 70 frames
  // early.
  if (b.roarTimer > 0) {
    b.roarTimer--;
    b.vx = 0;
  } else if (b.roarCooldown > 0) {
    b.roarCooldown--;
  }

  // Pacing and charging (index.html:1578-1595), skipped entirely while roaring.
  if (b.roarTimer <= 0) {
    // The first of TWO increments of this same field per charging frame. The second is
    // inside the charging branch below, which means a charge that tests `> 60` really
    // ends after about thirty frames. Both are written out here, separately, exactly as
    // the live source has them: folded into one they would look correct and the charge
    // would last twice as long.
    b.chargeTimer++;
    if (!b.charging && b.chargeTimer > 180) {
      b.charging = true;
      b.chargeTimer = 0;
      // Aimed once, at the moment of commitment, and never re-aimed while it runs —
      // which is what makes sidestepping a charge work at all.
      b.chargeVx = (p.x > b.x ? 1 : -1) * 3 * dc.enemySpeed;
      world.sounds.push('boss-charge'); // index.html:1583
    }
    if (b.charging) {
      b.x += b.chargeVx;
      b.chargeTimer++;
      if (b.chargeTimer > 60) {
        b.charging = false;
        b.chargeTimer = 0;
        b.vx = 0;
      }
    } else {
      // A slow shuffle toward the player at a tenth of the charge speed. `vx` is
      // assigned and added in the same breath; nothing else ever integrates it.
      const paceDir = p.x > b.x + b.w / 2 ? 1 : -1;
      b.vx = paceDir * 0.3 * dc.enemySpeed;
      b.x += b.vx;
    }
  }

  // The arena (index.html:1597-1598): ten tiles wide, hung off the rescue's column, and
  // the ONLY thing keeping the boss anywhere near the fight. A charge that would carry it
  // past either edge simply stops dead against the clamp — there is no bounce and no turn.
  const bMinX = (lvl.rescuePos[0] - 8) * TILE;
  const bMaxX = (lvl.rescuePos[0] + 2) * TILE;
  b.x = Math.max(bMinX, Math.min(b.x, bMaxX));

  // Player contact (index.html:1599-1617). Same +2/-4 inset box the enemy check uses,
  // and the same `p.invincible<=0` gate over the WHOLE thing: mid-blink after a cape
  // absorbed a hit, you can neither stomp the boss nor be hurt by it.
  //
  // `dc.stompHitbox || 1` WITHOUT the big head's extra 1.5x, unlike the enemy check
  // (enemy.ts) which compounds the two. That is the live line, not an omission: the boss
  // branch reads `dc.stompHitbox||1` and stops there (index.html:1601), so a big head
  // makes every enemy easier to land on and does nothing whatsoever to the boss.
  if (p.invincible <= 0 && rectOverlap(
    { x: p.x + 2, y: p.y, w: p.w - 4, h: p.h },
    { x: b.x, y: b.y, w: b.w, h: b.h },
  )) {
    const shm = dc.stompHitbox || 1;
    if (p.vy > 0 && p.y + p.h - 4 < b.y + (b.h * shm) / 2) {
      b.hp--;
      b.hurtTimer = 20;
      // MINUS SEVEN, not the -5 an ordinary enemy gives (enemy.ts, index.html:1545).
      // Stomping the boss throws you noticeably higher than stomping a doll does, which
      // is most of what makes the fight readable: the bounce tells you the hit landed.
      p.vy = -7;
      world.sounds.push('stomp'); // index.html:1605
      world.score += Math.round(100 * dc.scoreMultiplier);

      // The roar (index.html:1608-1612), at EXACTLY two HP values — `floor(maxHp*0.5)`
      // and `floor(maxHp*0.25)` — rather than at or below them. Equality, not a
      // threshold crossing: land on 5 of 10 and the boss roars, and there is no path
      // that skips a value, since HP only ever falls by one.
      //
      // On maxHp 5 those two floors are 2 and 1, on 7 they are 3 and 1, on 10 they are
      // 5 and 2, on 14 they are 7 and 3 — so every difficulty gets exactly two roars,
      // and the cooldown is there to stop a double when a value is hit twice, which it
      // cannot be.
      if (b.hp > 0 && b.roarCooldown <= 0
        && (b.hp === Math.floor(b.maxHp * 0.5) || b.hp === Math.floor(b.maxHp * 0.25))) {
        b.roarTimer = 50;
        b.roarCooldown = 120;
        // A roar CANCELS a charge in progress rather than queueing behind it.
        b.charging = false;
        world.sounds.push('boss-roar'); // index.html:1610
      }
      if (b.hp <= 0) defeatBoss(world, b);
    } else {
      // index.html:1615. Side or rising contact, straight into the shared hit path — so
      // the cape absorbs it and the invincibility window opens, exactly as for an enemy.
      // Unlike enemy.ts's version there is no `return` here: the live source has none,
      // and the arrow pass below still runs on the frame the boss touched you.
      playerHit(world);
    }
  }

  // Arrows (index.html:1618-1625), and the asymmetry that makes the fight feel authored:
  //
  //   - A CHICKEN RAY DOES NOT DAMAGE THE BOSS. It bounces off with a cluck and an
  //     8-frame flash and is spent for nothing (index.html:1620). The one weapon that
  //     trivialises an ordinary enemy — one ray turns it into a chicken — is the one
  //     weapon the boss ignores.
  //   - An ordinary arrow takes a hit point, for the same 100 points a stomp pays.
  //
  // The live `return` inside the chicken branch ends only that arrow's forEach callback,
  // so it is a `continue` here, exactly as stepArrows in world.ts renders the same shape.
  //
  // Note what is NOT guarded: `b.alive`. It was tested once, at the top of the function,
  // and a stomp above may have set it false since. So an arrow arriving on the very frame
  // a stomp killed the boss still lands, still drops HP below zero, and still pays the
  // 1000-point defeat bonus a second time. Vanishingly unlikely and faithfully preserved
  // — adding the guard would be fixing the original, which this port does not do.
  for (const a of world.arrows) {
    if (a.life <= 0) continue;
    if (!rectOverlap({ x: a.x, y: a.y, w: 12, h: 4 }, { x: b.x, y: b.y, w: b.w, h: b.h })) {
      continue;
    }
    if (a.isChicken) {
      a.life = 0;
      b.hurtTimer = 8;
      world.sounds.push('cluck'); // index.html:1620
      continue;
    }
    a.life = 0;
    b.hp--;
    b.hurtTimer = 15;
    world.sounds.push('stomp'); // index.html:1622
    world.score += Math.round(100 * dc.scoreMultiplier);
    if (b.hp <= 0) defeatBoss(world, b);
  }
}

/**
 * The killing blow (index.html:1613 and :1624, which are the same line written twice).
 *
 * `bossDefeated` is what the rescue check reads, and it is set here rather than derived
 * from `alive` because the two have different lifetimes — see World.bossDefeated in
 * types.ts.
 *
 * A thousand points at the difficulty's multiplier, rounded at the award site like every
 * other award in this port (see stepStars in world.ts for why that ordering is
 * load-bearing), and the win fanfare — the same `sfxWin` the rescue itself plays a few
 * seconds later.
 */
function defeatBoss(world: World, b: BossState): void {
  b.alive = false;
  world.bossDefeated = true;
  world.score += Math.round(1000 * world.dc.scoreMultiplier);
  world.sounds.push('win');
}
