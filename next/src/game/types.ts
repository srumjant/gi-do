import type { TileMap, Level } from '../data/levels';
import type { DifficultyRecord } from '../config/difficulty';

/**
 * Plain data, no methods, no Phaser. Everything in src/game/ operates on these so the
 * same code can run inside a Phaser scene and inside a Node VM next to the live game.
 */
export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  onGround: boolean;
  facing: 1 | -1;
  coyoteTime: number;
  jumpBuffer: number;
  /** Which walk-cycle frame to draw: 0 stand, 1 run, 2 jump (index.html:1168, 1424-1429). */
  frame: number;
  /** Counts up toward the walk cycle's speed-scaled threshold (index.html:1168, 1426-1427). */
  frameTimer: number;
  /**
   * Frames of invincibility left (index.html:1168, 1430). Only the cape ever sets it,
   * and the two ways it can are NOT the same number: absorbing a contact hit gives
   * `dc.invincibleTime || 60` (index.html:1646) while surviving a pit gives a
   * hardcoded 60 (index.html:1423). On super_easy — the one difficulty that carries
   * `invincibleTime` at all, and the one difficulty where a pit is survivable — those
   * are 120 and 60 respectively.
   *
   * Decremented once per player step, between the walk cycle and the power-up timers
   * (index.html:1430), and read as `p.invincible <= 0` by the enemy contact check
   * (index.html:1544, enemy.ts) and by the draw code's blink (index.html:1838).
   *
   * Where the decrement sits relative to the two writers is what fixes the window's
   * width. A contact hit is resolved in the enemies pass, AFTER this frame's decrement
   * has already run; a pit save returns out of the player step ABOVE it. So neither
   * write is spent on the frame it happens, and a window of 60 covers the next 59
   * frames' contact checks, with the 60th frame after the hit vulnerable again.
   */
  invincible: number;
  /**
   * Set by a bow pickup (index.html:1447) and, from the chicken ray, by the rainbow
   * block's silly power-up. Read by the firing branch (index.html:1392), which consults
   * it alongside `bowCharges` — and cleared there, by the same branch, once both kinds
   * of charge are spent.
   */
  hasBow: boolean;
  /**
   * Arrows left. Seeded from `dc.bowCharges` on pickup, NOT from a constant — it runs
   * from 8 on super_easy down to 2 on hard (difficulty.ts), so the same pickup is
   * worth four times as much to a small child as to a grown-up.
   */
  bowCharges: number;
  /**
   * Frames until the bow can fire again (index.html:1169, 1391, 1397). Decremented once
   * per player step, set to 15 by a shot — a quarter of a second between arrows, whether
   * the shot was an arrow or a chicken ray. It is decremented BEFORE the fire check reads
   * it, so a cooldown of exactly 1 is already 0 by the time that check runs and the
   * fifteenth frame after a shot can fire again, not the sixteenth.
   */
  arrowCooldown: number;
  /**
   * Set by a super pickup (index.html:1448), and seeded at spawn from
   * `dc.startWithCape` (index.html:1169) — true on super_easy alone, so that is the
   * one difficulty where the player is already wearing one before touching anything.
   *
   * Spent, never worn out: the first hit of any kind takes it. A contact hit is
   * absorbed for a bounce and an invincibility window (index.html:1646, playerHit),
   * and a pit fall is absorbed too, by teleporting back above the floor of the world
   * (index.html:1423, stepPlayer) — on every difficulty, where the live game allows it on
   * super_easy alone. Both clear it, so the second hit — of either kind — kills.
   */
  hasCape: boolean;
  /**
   * Frames of fart jump left (index.html:1171, 1432). Granted 900 — fifteen seconds —
   * by the `fart` branch of `giveRandomSillyPowerup`. While it runs, the jump force is
   * multiplied by 1.5 (player.ts) and every living enemy within 50px is stunned for a
   * further 120 frames EVERY FRAME (see EnemyState.stunTimer below).
   */
  fartTimer: number;
  /**
   * Frames of big head left (index.html:1171, 1433). Granted 1200 — twenty seconds — by
   * the `bighead` branch. While it runs, the stomp reach multiplier gains a 1.5x factor
   * ON TOP of `dc.stompHitbox`, the player/enemy overlap box grows 8px on each side, and
   * a stomp flattens for 45 frames instead of 30 (enemy.ts).
   */
  bigHeadTimer: number;
  /**
   * Chicken rays left (index.html:1171). Granted 8 — a flat constant, NOT `dc.bowCharges`
   * like the bow pickup — by the `chicken` branch, which also sets `hasBow`. The two are
   * genuinely separate: the firing path (index.html:1392-1396, player.ts's fireArrow)
   * fires when EITHER `hasBow && bowCharges > 0` OR `chickenRayCharges > 0`, picks
   * chicken over arrow whenever any chicken charge is left, and only clears `hasBow`
   * once BOTH are spent. Do not collapse them into one flag.
   */
  chickenRayCharges: number;
}

/**
 * A bow, super or cat pickup: one fixed spot on the map, takeable once. `x`/`y` are
 * PIXELS (the spawn sites multiply the level record's tile column by TILE), unlike
 * BlockState below, which stays in tiles.
 */
export interface Pickup {
  x: number;
  y: number;
  collected: boolean;
}

/** A star popped out of a question block (index.html:1419). Pixels, like Pickup. */
export interface Star {
  x: number;
  y: number;
  /**
   * Starts at -2 (rising) and ramps toward zero at +0.1 a frame, where it STOPS: the
   * live update clamps `if(s.vy>0)s.vy=0` and then the whole block is guarded by
   * `if(s.vy)`, so a star that reaches exactly 0 never moves again. A one-way ramp,
   * not a bounce — see world.ts's stepStars.
   */
  vy: number;
  collected: boolean;
}

/**
 * The cat companion (index.html:995, 1452) — `null` until the cat pickup is walked over
 * and `null` again three scratches later. It is not a player, not an enemy and not a
 * physics body: nothing in the game collides with it, it never touches the tile map, and
 * it cannot be hurt. See world.ts's stepCat for the movement, which is stranger than it
 * looks.
 */
export interface CatState {
  x: number;
  y: number;
  /**
   * Written once, by the spawn literal, and never read or assigned again anywhere in the
   * live source — the cat's horizontal motion is `bounceDir * 2.5` applied straight to
   * `x`. Carried anyway so the field set stays the live object's, exactly like
   * PowerupPopup.maxTimer.
   */
  vx: number;
  /**
   * The bounce arc's vertical speed. The cat has its OWN gravity, a flat 0.35, and its
   * own jump force, -5.5 — neither is the world's GRAVITY (0.4) nor the player's
   * `dc.jumpForce`, and neither scales with difficulty.
   */
  vy: number;
  /**
   * Drawing flip. Only the two bounce-reversal branches ever write it, so it is the
   * direction of the last REVERSAL rather than of the current travel: it stays 1 for the
   * whole first swing out to the right and only becomes -1 once the cat has crossed
   * `playerCenterX + 60` and turned back.
   */
  facing: 1 | -1;
  /** Which of the two cat frames to draw, flipped every 9th frame (index.html:1478). */
  frame: number;
  /** Counts up to 8 and resets; `> 8` not `>= 8`, so the flip is every 9 frames. */
  frameTimer: number;
  /**
   * Frames until the next scratch is allowed, from 30. Decremented with
   * `Math.max(0, ... - 1)` at the TOP of the cat pass, before the guard that reads it,
   * so a scratch on frame N permits the next on frame N+30 — thirty frames apart, not
   * thirty-one.
   */
  scratchTimer: number;
  /**
   * Where the last scratch landed (the victim's centre), for the claw sprite the draw
   * code puts there while `scratchTimer > 20` (index.html:1728-1729). Presentation-only,
   * carried because it is part of the live object and a trace compares the whole shape.
   */
  scratchTarget: { x: number; y: number } | null;
  /**
   * Scratches left, from 3. Reaching 0 does NOT remove the cat on the spot: the removal
   * lives in the `else if` AFTER the whole cat block (index.html:1498-1500), so the frame
   * the cat spends its last scratch it is still there, still drawn, still bouncing, and
   * only the NEXT frame finds `hitsLeft > 0` false and nulls it.
   */
  hitsLeft: number;
  /** Which way the side-to-side bounce is currently travelling: +1 right, -1 left. */
  bounceDir: 1 | -1;
  /**
   * The height the current arc falls back to. Assigned TWICE per frame (index.html:1471
   * and :1477) — once inside the takeoff branch, then again unconditionally at the
   * bottom — and the second write is the load-bearing one: it re-aims the landing at the
   * player's CURRENT feet every frame, which is what lets the cat follow a player who is
   * climbing. Without it the cat keeps landing wherever it took off from.
   */
  baseY: number;
  /**
   * There is no rest state. Landing sets this true, and the very next frame's takeoff
   * branch consumes it and launches again, so the cat bounces continuously from the
   * moment it spawns until it is gone.
   */
  onGround: boolean;
}

/** Which silly power-up the rainbow block handed out (index.html:1149). */
export type PowerupType = 'fart' | 'bighead' | 'chicken';

/**
 * The silly power-up announcement (index.html:1154). Presentation, except that it is
 * NOT: index.html:1276 — the second line of `update()`, right after `animFrame++` and
 * above every other state check — freezes the ENTIRE game while it exists:
 *
 *   if(powerupPopup){powerupPopup.timer--;if(powerupPopup.timer<=0)powerupPopup=null;clearJP();return;}
 *
 * So a rainbow block does not just grant a power-up, it stops the world for 120 frames
 * — two whole seconds in which the player, the enemies and the camera are all frozen
 * while `animFrame` keeps counting. `maxTimer` is only ever read by the drawing code (it
 * scales the pop-in), but it is carried here rather than dropped so the field set stays
 * the live object's.
 */
export interface PowerupPopup {
  type: PowerupType;
  timer: number;
  maxTimer: number;
}

/**
 * A question (tile 3) or rainbow (tile 5) block, in TILE coordinates — NOT pixels.
 * Both lists are re-derived from the map by scanning it at level build (index.html:1189),
 * which is what makes a respawn restore every block that was bumped. `hit` is what stops
 * a second bump paying out (player.ts's bumpBlocksAbove); the map cell itself is
 * rewritten to 2 at the same time, which is a cosmetic change only — 2, 3 and 5 are all
 * solid, so collision never notices.
 */
export interface BlockState {
  x: number;
  y: number;
  hit: boolean;
}

export interface EnemyState {
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  alive: boolean;
  /** Which patrol frame to draw, flipped every 15 frames (index.html:1215, 1540). */
  frame: number;
  /** Counts up toward the 15-frame flip threshold (index.html:1215, 1540). */
  frameTimer: number;
  /**
   * Counts down from 30 after a stomp — 45 if a big head did the stomping
   * (index.html:1546) — so a squashed enemy keeps rendering, flattened, for half a
   * second instead of vanishing the instant it dies (index.html:1215, 1525, 1545).
   */
  squashTimer: number;
  /**
   * True for a flyer that writes its own `y` every frame instead of falling — bat,
   * icebat and ghost. stepEnemy's gravity/floor-snap block is skipped entirely while
   * this is true (index.html:1527's `if(!e.noGravity){...}`). False for every ground
   * patroller AND for the cannon, which never moves but is still gravity-bound and
   * still floor-snapped every frame, exactly like the live source — which only ever
   * ADDS this field for the types that need it.
   */
  noGravity: boolean;
  /**
   * The fixed height a sine-flying enemy hangs at — set once at spawn and never touched
   * again; stepEnemy reads it fresh every frame rather than integrating position, so
   * nothing here ever drifts. Inert (0) for every type that does not fly.
   *
   * Two types set it, at two different heights: a bat/icebat 60px above where it would
   * otherwise have stood (index.html:1217) and a ghost 40px (index.html:1216). A ghost
   * only returns to it when the player is OUT of aggro range; inside it, `y` is written
   * by the homing instead and `originY` is simply not read.
   */
  originY: number;
  /**
   * A bat/icebat's per-instance phase on the shared sine clock (index.html:1217's
   * `Math.random()*Math.PI*2`), so two bats on screen at once don't move in lockstep.
   * Drawn once at spawn from random.ts's injectable seam, not Math.random() directly
   * — see that module's own comment for why. Inert (0) for every other type.
   */
  sineOffset: number;
  /**
   * Frames since a bouncer's last hop (or since it spawned, for the first one);
   * stepEnemy fires a new hop once this clears 40 while the bouncer is resting
   * (index.html:1219, 1536). Inert (0) for every other type.
   */
  bounceTimer: number;
  /**
   * Frames of fart stun left (index.html:1442, 1526). While positive, stepEnemy freezes
   * the enemy COMPLETELY and returns before its stomp box and contact damage are ever
   * evaluated — a stunned enemy is harmless as well as motionless.
   *
   * Unbounded and cumulative by design: the live stink cloud adds 120 to it on EVERY
   * frame the player is within 50px (`e.stunTimer=(e.stunTimer||0)+120`), so a second
   * spent standing next to an enemy leaves it paralysed for minutes. The live `||0`
   * guard exists because the field is added lazily there; here it is always present and
   * starts at 0, so player.ts adds to it directly.
   */
  stunTimer: number;
  /**
   * Already been turned into a chicken (index.html:1506-1507). The live game adds this
   * field only at the moment of conversion, so every un-hit enemy reads `undefined`
   * there and this port's uniform `false` is the same test; `chickenify` in enemy.ts is
   * the only thing that ever sets it.
   *
   * It is what makes a second chicken ray LETHAL rather than wasted: the conversion
   * branch is guarded by `a.isChicken && !e.isChicken`, so a chicken arrow that hits an
   * already-converted chicken falls through to the ordinary kill branch below it. One
   * ray turns an enemy into a chicken, the next one kills the chicken.
   */
  isChicken: boolean;
  /**
   * Frames until a cannon's next shot (index.html:1218, 1534). Inert (0) for every
   * other type.
   *
   * It counts DOWN to zero and is then reloaded to `shootInterval` — the opposite of
   * the boss's field of the same name, which counts UP to it (BossState below). Two
   * shooters, two directions; do not fold them together.
   *
   * It starts RANDOMISED, at `60 + floor(random()*60)`, so a row of cannons placed a
   * few tiles apart does not fire in lockstep even though every one of them shares the
   * same interval. Drawn through random.ts's seam, like the bat's sineOffset.
   */
  shootTimer: number;
  /**
   * What a cannon reloads `shootTimer` to — `dc.enemyShootInterval` flat, unlike the
   * boss's `* 1.2` (index.html:1218 against :1204). Inert (0) for every other type.
   */
  shootInterval: number;
  /**
   * Cannot be killed by jumping on it (index.html:1218, 1545). Set by the CANNON alone:
   * it is the one enemy in the game a child cannot stomp, and a jump onto its head is
   * an ordinary contact hit instead — which is what makes it a hazard to shoot round
   * rather than a step to bounce off.
   *
   * Cleared by `chickenify` (index.html:1508), so a chicken ray is the one thing that
   * makes a cannon stompable: it stops being a cannon.
   */
  noStomp: boolean;
}

/**
 * One arrow in flight (index.html:1394) — fired by the bow, or, when any chicken ray
 * charge is left, the same object with `isChicken` set. There is no vy and no gravity:
 * an arrow flies dead straight at `vx` until it runs out of `life`, hits a solid tile,
 * or hits an enemy.
 *
 * Its two collision shapes are DIFFERENT and both deliberate (index.html:1504-1505):
 * tiles are probed at two bare points, `x` and `x + 10`, while enemies are tested
 * against a 12x4 rectangle. Neither is derived from the other, and neither is the
 * drawn sprite's size. See world.ts's stepArrows.
 */
export interface Arrow {
  x: number;
  y: number;
  vx: number;
  /**
   * Frames left, from 60 — one second of flight, about 360px at the fixed speed of 6.
   * Also the kill switch: a tile hit or an enemy hit sets it straight to 0, and
   * world.ts's stepArrows filters out everything that is not still above zero at the
   * end of the pass.
   */
  life: number;
  /** A chicken ray rather than an arrow. Converts on the first hit instead of killing. */
  isChicken: boolean;
}

/**
 * Something an ENEMY fired at the player (index.html:993, 1535, 1570-1571) — the boss's
 * two fireballs and the cannon's single flat one. One list, one pass, both shooters;
 * see world.ts's stepEnemyProjectiles.
 *
 * `vy` IS NEVER ACCELERATED. There is no gravity anywhere in the pass — `ep.y += ep.vy`
 * and nothing else — so a projectile launched at `vy: -1` rises at exactly one pixel a
 * frame until it expires. That is what makes the boss's two-fireball "spread" two
 * straight lines rather than an arc, and it is item 4 of the spec's bug-compatibility
 * contract: preserved deliberately, not an arc someone forgot to finish.
 *
 * It is also why these must never be handed to Arcade (Plan 7 says so explicitly): a
 * body in a world with gravity would drop, the spread would become the arc the original
 * never had, and the cannon's dead-flat shot would sag into the floor.
 */
export interface EnemyProjectile {
  x: number;
  y: number;
  vx: number;
  /** Constant for the whole flight. See the note above — nothing ever adds to it. */
  vy: number;
  /**
   * Frames left, and the kill switch as well: a tile hit, a hit on the player or an
   * arrow flying through it all set this straight to 0, and the pass filters out
   * everything not still above zero at the end of it.
   *
   * The boss fires two at once with DIFFERENT lifetimes — 120 for the flatter one, 100
   * for the steeper (index.html:1570-1571) — so the pair does not vanish together. The
   * cannon's one shot lives 120 (index.html:1535).
   */
  life: number;
  /**
   * Write-only in the live game, and carried anyway. The cannon tags its shot
   * `type:'fireball'` (index.html:1535) and the boss tags neither of its two; nothing
   * anywhere reads the field, and the draw code renders FIREBALL_S for everything in
   * the list regardless (index.html:1828). Kept so the field set stays the live
   * object's, exactly like CatState.vx and PowerupPopup.maxTimer — and the cannon,
   * now ported, really does set it, on a field that still nothing reads.
   */
  type?: string;
}

/**
 * The boss of the final level (index.html:991, 1197-1208, 1559-1626). One per run, and
 * only on the last level — `initLevel` builds it when `idx === LEVELS.length-1` and sets
 * `boss = null` otherwise.
 *
 * IT IS NOT A PHYSICS BODY, and this is item 1 of the spec's bug-compatibility contract.
 * There is no gravity on it, no tile collision, and `y` is written once at spawn and
 * never again — it hangs at whatever height `findGroundY` put it, and a charge that
 * carries it over a hole carries it straight across thin air. Its `x` is not separated
 * against anything either; it is simply CLAMPED to a ten-tile window around the rescue
 * (index.html:1597-1598). Do not give it an Arcade body: Plan 7's "explicitly NOT
 * bodied" list names it for exactly this reason.
 *
 * HP scales with difficulty through `dc.enemySpeed` thresholds rather than a field of
 * its own — 5 / 7 / 10 / 14 from super_easy to hard (index.html:1202) — so the same
 * fight is a handful of stomps for a small child and a long haul for a grown-up.
 */
export interface BossState {
  x: number;
  /**
   * Written once, by the spawn literal, and never integrated. See the note above: the
   * whole fight happens on one horizontal line.
   */
  y: number;
  /**
   * Pacing speed. Assigned every frame the boss paces and zeroed when it roars or
   * finishes a charge — but nothing ever adds it to `x`: the pacing branch does
   * `b.vx = paceDir*0.3*enemySpeed; b.x += b.vx` in one breath (index.html:1592-1593)
   * and the charge moves by `chargeVx` instead. So this is a record of the last pacing
   * step rather than a velocity that is integrated, and the DRAW code is its only other
   * reader: `Math.abs(boss.vx) > 0.1` is half of what picks the walk frame
   * (index.html:1789).
   */
  vx: number;
  w: number;
  h: number;
  /** Counts down to zero, from `maxHp`. Reaching zero is the end of the game. */
  hp: number;
  /** 5 / 7 / 10 / 14 by difficulty (index.html:1202). Also the health bar's divisor. */
  maxHp: number;
  /**
   * Cleared by the killing blow. NOT the same thing as `World.bossDefeated`, which is
   * set at the same moment and then outlives it: `alive` gates the fight and the health
   * bar, `bossDefeated` gates the RESCUE and never goes false again.
   */
  alive: boolean;
  /** Counts UP to `shootInterval`, then fires and resets (index.html:1566-1568). */
  shootTimer: number;
  /**
   * `dc.enemyShootInterval * 1.2` (index.html:1204) — a fifth slower than the cannon's
   * on the same difficulty, so the boss is the more deliberate of the two shooters.
   */
  shootInterval: number;
  /**
   * Doubles as the pacing clock and the charge clock, which is why the charge is HALF as
   * long as it reads. It is incremented once per frame at the top of the movement block
   * (index.html:1579) and then a SECOND time inside the charging branch (:1588), so a
   * charge that tests `> 60` actually ends after about 30 frames. Faithfully reproduced
   * in boss.ts — the two increments are written out separately there rather than folded
   * into one, so that it stays obvious this is the original and not an off-by-one.
   */
  chargeTimer: number;
  charging: boolean;
  /**
   * The charge's speed and direction, fixed at the moment the charge starts and not
   * re-aimed while it runs: `(p.x > b.x ? 1 : -1) * 3 * dc.enemySpeed`. Sidestepping a
   * committed charge is therefore the whole defensive skill of the fight.
   */
  chargeVx: number;
  /**
   * Frames of hurt flash left. Three different values write it, and they are three
   * different lengths on purpose: 20 for a stomp (index.html:1604), 15 for an arrow
   * (:1621) and 8 for a chicken ray that did no damage at all (:1620). Drawing only —
   * `hurtTimer % 4 < 2` picks the flashing frames (:1772).
   */
  hurtTimer: number;
  /**
   * Written once, by the spawn literal, and never read or assigned again anywhere in the
   * live source. Carried for the same reason CatState.vx is: the field set stays the
   * live object's.
   */
  phase: number;
  /** Drawing flip, re-aimed at the player every frame (index.html:1564). */
  facing: 1 | -1;
  /** Which of the two frames to draw, flipped every 13th frame (index.html:1561). */
  frame: number;
  /** Counts up to 12 and resets; `> 12` not `>= 12`, so the flip is every 13 frames. */
  frameTimer: number;
  /**
   * Frames of roar left, from 50. While it runs the boss stands still — the movement
   * block is skipped entirely and `vx` is pinned to 0 (index.html:1575) — so a roar is a
   * free window to get a hit in, not a threat.
   */
  roarTimer: number;
  /**
   * Frames until another roar is allowed, from 120. Counted down only on the frames the
   * boss is NOT roaring (index.html:1576's `else if`), so the 120 starts after the 50.
   */
  roarCooldown: number;
}

/**
 * One thing the world just did that makes a noise, pushed at exactly the point the live
 * game calls the matching `sfx*()` — see `World.sounds` below for why it is a value in a
 * list rather than a call.
 *
 * Every name is the live sound it stands for, except the last two, which are music rather
 * than an effect. They are here because the live source puts them on the same line as the
 * effect: the rescue is `sfxWin();stopBGM();` (index.html:1631) and a death is
 * `sfxHurt();stopBGM();` (:1647), and `initLevel` — which a respawn IS — ends on
 * `startBGM(idx)` (:1209). Splitting them out would mean a second mechanism watching for
 * the same three moments.
 *
 *   - `cape` is index.html:1423 and :1646, a bare `playTone(400,.15,'sawtooth',.12,200)`
 *     rather than a named effect, in both the pit save and the contact hit a cape absorbs.
 *     Identical arguments in both places, so one cue covers both.
 *   - `cat-arrive` (:1454) and `cat-vanish` (:1494) are bare `playTone` calls too. They are
 *     easy to miss when grepping for `sfx`, and the port went without them until they were
 *     found; see audio/sfx.ts.
 *   - `boss-fire` (:1572), `boss-charge` (:1583) and `boss-roar` (:1610) are the same trap
 *     a third time, and the biggest instance of it: the whole boss fight makes bare
 *     `playTone` calls and not one named effect, so a search for `sfx` finds a silent boss
 *     and reports the sound work finished. `boss-roar` is two tones, the second scheduled
 *     150ms behind the first. Named in audio/sfx.ts for the same reason the cape and the
 *     cat were.
 *   - `cannon-fire` (:1535) is the last bare `playTone` in anything this port simulates.
 *     It is NOT `boss-fire`: both are a 150Hz sawtooth at 0.08, but the cannon's is half
 *     as long and slides UP to 300 where the boss's slides down to 80 — a spit rather
 *     than a belch. Folding the two into one cue would make a level of cannons sound
 *     like a room of bosses.
 *   - `wrong` is learn mode's wrong letter (index.html:2743), a bare
 *     `playTone(150,.15,'triangle',.08,100)` in the live learn update. Low and soft: a
 *     wrong answer costs nothing.
 *   - `music-level` is the level's own theme, restarted by a respawn. Which theme that is
 *     is the SCENE's business — a World does not know its own level index — so the cue
 *     carries no argument and the scene supplies it.
 */
export type SoundCue =
  | 'jump'
  | 'fart'
  | 'shoot'
  | 'cluck'
  | 'block'
  | 'pickup'
  | 'coin'
  | 'stomp'
  | 'boing'
  | 'hurt'
  | 'win'
  | 'cape'
  | 'cat-arrive'
  | 'cat-vanish'
  | 'boss-fire'
  | 'boss-charge'
  | 'boss-roar'
  | 'cannon-fire'
  | 'wrong'
  | 'music-level'
  | 'music-stop';

/**
 * The cues that are sound effects: every SoundCue but the music's two, so a name is all they
 * need. The learn tower raises only these, and plays them without a level index.
 */
export type EffectCue = Exclude<SoundCue, 'music-level' | 'music-stop'>;

/**
 * One buzz of a controller's motors, raised by the world exactly where the live game calls
 * `padRumble` — see `World.rumbles` below for why haptics gets a list of its own rather
 * than riding `sounds`.
 *
 * The three fields are `playEffect`'s own: two motor magnitudes in [0,1] and a duration in
 * MILLISECONDS. Milliseconds, in a file where everything else is counted in frames,
 * because the Gamepad API is the only consumer and it takes milliseconds — the conversion
 * from frames lives in `shakeToRumble` (input/gamepad.ts), on the far side of the cue.
 */
export interface RumbleCue {
  strong: number;
  weak: number;
  dur: number;
}

/**
 * index.html's `padRumble(0,0.35,80)`: a short buzz on the light motor only, which is what
 * every pickup in the live game does — the bow (:1447), the cape (:1448), the cat (:1453),
 * a star (:1521) and a rainbow block's silly power-up (:1155). Identical arguments at all
 * five, so one constant covers them.
 *
 * Here rather than in input/gamepad.ts because src/game/ raises it, and src/game/ is not
 * allowed to know that a controller exists.
 */
export const PICKUP_RUMBLE: RumbleCue = { strong: 0, weak: 0.35, dur: 80 };

export interface World {
  level: Level;
  map: TileMap;
  dc: DifficultyRecord;
  player: PlayerState;
  enemies: EnemyState[];
  /** Frames since the level started. Everything here is frame-counted, not seconds. */
  frame: number;
  /**
   * Free-running frame counter, incremented first thing every step — even while dead
   * — exactly like the live game's top-level `animFrame++` at the very first line of
   * `update()` (index.html:1275). Nothing in this slice reads it yet (it drives sine
   * motion for enemy types this slice does not implement, and a fart-trail interval
   * that is also out of scope), but it has to advance on the same frame the live game's
   * does, so a later trace that does depend on it starts from an identical count.
   */
  animFrame: number;
  /**
   * Set by `playerDie` on any death — a pit fall or, now, enemy contact
   * (index.html's `playerDie` -> `gameState = 'dead'`). The live `update()` checks
   * its own dead-state branch before it ever reaches player movement, so once true,
   * nothing about the player, the enemies or the camera moves again THAT FRAME
   * (mid-frame contact deaths are the one exception — see enemy.ts's stepEnemy).
   * `stepPlayer` reproduces the freeze by returning immediately when this is set.
   * Not permanent: `stepWorld`'s dead branch counts `stateTimer` down and, with
   * `lives` left, clears this back to `false` via `respawnLevel`.
   */
  dead: boolean;
  /**
   * Simulation state, not presentation state. Enemies do not exist until the camera
   * reaches them (index.html:1358), so where the camera is decides when an enemy spawns
   * and therefore what an enemy trace looks like. The scene reads this to scroll; it
   * does not own it.
   */
  camera: { x: number; y: number };
  /** Enemy definitions not yet streamed in. Drained by the spawn window each step. */
  pending: PendingEnemy[];
  /**
   * Remaining lives, seeded from `dc.lives` on a fresh run or from what the last level
   * ended with on a continuing one (`createWorld`'s `start` argument), and decremented by
   * `playerDie` on every death — pit or contact alike (index.html:1647's `lives--`).
   * A plain `number`, not an integer count: `dc.lives` is `Infinity` on super_easy
   * (difficulty.ts), and `Infinity - 1 === Infinity` in IEEE-754, so infinite lives
   * really do stay infinite under repeated decrement. That is the live game's own
   * untyped behaviour, reproduced deliberately, not a bug to fix.
   */
  lives: number;
  /**
   * The frozen world's clock, independent of `frame`/`animFrame`, and shared by the two
   * states that freeze it. It counts down from 90 while `dead` (index.html:1348's
   * `stateTimer--`) and from the 200 `checkRescue` sets while `won` (:1631, counted down by
   * :1350) — one field for both because the live game has one global for both, and the two
   * are never running at once.
   */
  stateTimer: number;
  /**
   * Set once `stateTimer` runs out with no lives left (index.html:1348's
   * `else{gameState='gameover';...}`). The live game moves to its `gameover` STATE at that
   * moment; here the scene holding this World reads the flag and starts GameOverScene
   * (SliceScene's `leaveIfRunOver`). Until it does — and it does on the very next frame —
   * `stepWorld`'s dead branch returns immediately, so the world stays exactly as the death
   * left it rather than counting anything further down.
   */
  gameOver: boolean;
  /**
   * Set by `checkRescue` (world.ts) once the player overlaps the rescue box
   * (index.html:1631's `gameState='levelcomplete'`), along with `stateTimer = 200`.
   *
   * Not terminal, and no longer a mirror of `gameOver`: `stepWorld`'s `won` branch freezes
   * everything but keeps counting `stateTimer` down, exactly as the live `levelcomplete`
   * state does, and when it reaches zero the scene advances the run — the next level, or
   * the win screen if this was the last one (index.html:1350; game/run.ts's `finishLevel`).
   * What this flag means is "this level is over and was WON", not "the game has stopped".
   */
  won: boolean;
  /**
   * Which character's sprite sizes the player (createPlayer's `character` argument),
   * kept so a respawn can rebuild an equivalent player without the caller supplying
   * it again — the live game reads the same thing off its own `selectedChar` global,
   * which a respawn's `initLevel` call never touches either.
   */
  character: 'gigi' | 'dodo';
  /**
   * Run score. Lives on the World rather than the player because it SURVIVES DEATH:
   * the live game's `score=0` appears only where a run begins (index.html:1347, and
   * the debug level jump at :1307), never on the respawn path — which is a bare
   * `initLevel(currentLevel)` at index.html:1348. `respawnLevel` therefore leaves this
   * alone, deliberately, the same way it leaves `lives` alone and unlike everything
   * else it rebuilds.
   *
   * Every award is rounded AT THE AWARD SITE — `Math.round(100 * dc.scoreMultiplier)`,
   * not a running total rounded at the end. On easy (multiplier 0.75) that is 75 a
   * star; accumulate first and round later and the totals drift apart within a level.
   */
  score: number;
  /** index.html:1180. Positions derived in world.ts's buildLevelState, never hardcoded. */
  bowPickups: Pickup[];
  /** index.html:1181. Same derivation — and the same enemySkipChance surprise. */
  superPickups: Pickup[];
  /**
   * index.html:1183-1187. `null` for a level with no `catPosition`; every level record
   * this port carries has one, so it is never null today, but the live guard is real
   * and is reproduced rather than assumed away. Walking over it spawns `cat` below —
   * through a 16x22 hitbox, not the 16x16 the bow and super use (world.ts's
   * collectPickups).
   */
  catPickup: Pickup | null;
  /**
   * index.html:995, 1183. The cat companion, `null` except between the pickup and its
   * third scratch. Cleared by `initLevel` like every other level collection, on the line
   * directly above the one that rebuilds `catPickup`, so a death takes the cat away and
   * hands the pickup back in the same breath. See CatState above and world.ts's stepCat.
   */
  cat: CatState | null;
  /**
   * index.html:1188. Empty at level build; filled by bumping a question block from
   * below (player.ts's bumpBlocksAbove), one star per block, one tile ABOVE the block
   * that paid out. Stepped and collected by world.ts's stepStars.
   */
  stars: Star[];
  /**
   * index.html:993, 1188. Arrows and chicken rays currently in flight, in firing order.
   * Emptied by `initLevel` like every other level collection, which is why a respawn
   * throws away whatever was mid-air — along with the bow that fired it.
   *
   * The live game REPLACES this array every frame (`arrows=arrows.filter(...)`), so
   * spent arrows leave the list at the end of the arrow pass rather than at the moment
   * they are spent. world.ts's stepArrows keeps that ordering exactly: an arrow that
   * has already hit something still sits in the list, with `life` 0, for the rest of
   * its own pass.
   */
  arrows: Arrow[];
  /**
   * index.html:993, 1188. Fireballs in flight, in firing order — the boss's today, the
   * cannon's when that type lands. Emptied by `initLevel` exactly like `arrows`, so a
   * death clears the air as well as resetting the boss.
   *
   * REPLACED every step rather than spliced, like `arrows` (see stepEnemyProjectiles in
   * world.ts), so a projectile that has already hit something still sits in the list,
   * with `life` 0, for the rest of its own pass.
   */
  enemyProjectiles: EnemyProjectile[];
  /**
   * index.html:991, 1197-1208. The final level's boss, and `null` on every other level —
   * which is also what makes `checkRescue`'s `!boss || bossDefeated` a no-op for the
   * first five levels and a real gate for the sixth.
   *
   * Rebuilt by `buildLevelState` at every level build, so a death hands the boss its
   * health back along with the question blocks. Not a bug to fix: `initLevel` IS the
   * respawn path and it rebuilds the boss unconditionally (index.html:1196-1208).
   */
  boss: BossState | null;
  /**
   * index.html:991, 1196. Set by the killing blow (:1613 or :1624) and cleared only by a
   * level build. It outlives `boss.alive`, which is the point of having both: the fight
   * reads `alive`, the RESCUE reads this, and the celebration banner reads this too — so
   * the sibling stays out of reach until the boss goes down, and then stays reachable
   * even though the boss is no longer being stepped.
   */
  bossDefeated: boolean;
  /** index.html:1189-1190. Scanned off the freshly generated map, in tile coordinates. */
  questionBlocks: BlockState[];
  /** index.html:1189, 1191. Same scan, tile code 5. */
  rainbowBlocks: BlockState[];
  /**
   * index.html:994, 1154, 1188. `null` except for the 120 frames after a silly power-up
   * is granted, during which `stepWorld` returns early and NOTHING moves — see
   * PowerupPopup above, and the gate at the top of stepWorld. Cleared by `initLevel`
   * (index.html:1188), so respawnLevel clears it too.
   *
   * `giveRandomSillyPowerup` (player.ts) is its only writer, and a rainbow block taken
   * from underneath is that function's only caller — so this is the one and only thing
   * in the game that can stop the world.
   */
  powerupPopup: PowerupPopup | null;
  /**
   * What this step sounded like: the cues the simulation raised, in the order it raised
   * them, for whoever is holding a pair of speakers to play.
   *
   * THE SOUND IS NOT PLAYED HERE, and that is the point. `ensureAudio()` touches `window`,
   * which is an unresolved identifier in the node environment the whole test suite runs
   * in, so a single `import` of the audio stack anywhere under src/game/ would take the
   * simulation off the headless test bench it was built to sit on. A cue is a value; a
   * value costs src/game/ nothing and can be asserted on. Where index.html has an
   * untestable side effect (`sfxStomp()` deep inside a loop, reachable only by a browser
   * with a speaker), this port has `expect(world.sounds).toContain('stomp')`.
   *
   * `stepWorld` EMPTIES this at the top of every step, so it only ever holds the cues of
   * the step just taken and a driver that never reads it cannot leak. The scene reads and
   * clears it after each step — inside the fixed-step loop, not after it, so a rendered
   * frame that takes three steps plays all three steps' sounds rather than only the last
   * one's. A frozen step (dead, won, or behind a power-up announcement) is still a step
   * and is still emptied, which is what stops a death banking up cues that would fire in a
   * burst when play resumes.
   */
  sounds: SoundCue[];
  /**
   * What the step just did that a controller should be felt to do — same arrangement as
   * `sounds` above, same emptying at the top of every step, drained by the scene inside
   * the fixed-step loop.
   *
   * ## Why this is not just another `SoundCue`
   *
   * It is tempting, because today every rumble the live game raises happens to sit beside
   * a `pickup` or a `coin` — all five of them — so the scene could buzz off the sound list
   * and this field could not exist. Three reasons it does anyway:
   *
   *   1. A sound cue is a NAME and a rumble is three NUMBERS. Widening `SoundCue` to carry
   *      parameters would change what every existing push means.
   *   2. The coincidence is a coincidence. The live game calls `sfxPickup()` without a
   *      rumble too (index.html:1269, backing out of a menu), so "a pickup noise implies a
   *      buzz" is a fact about five call sites, not a rule.
   *   3. Screen shake is coming, and its rumbles are per-event — `shakeToRumble(3,8)` for a
   *      stomp against `shakeToRumble(8,20)` for the boss going down (index.html:1545,
   *      :1613). A channel that carries numbers can say that; a cue name cannot.
   *
   * And the device is a different device. `sounds` is drained by src/audio/; routing a
   * motor through there would put the gamepad inside the sound engine.
   */
  rumbles: RumbleCue[];
}

export interface PendingEnemy {
  type: string;
  /** Tile column, from the level's enemyDefs. */
  x: number;
  spawned: boolean;
}

/** An axis-aligned box, as the live game's rectOverlap takes them. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
