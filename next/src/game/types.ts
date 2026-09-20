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
   * Set by a bow pickup (index.html:1447) and, from the chicken ray, by the rainbow
   * block's silly power-up. Read by the firing branch (index.html:1383), which consults
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
   * Frames until the bow can fire again (index.html:1160, 1382, 1388). Decremented once
   * per player step, set to 15 by a shot — a quarter of a second between arrows, whether
   * the shot was an arrow or a chicken ray. It is decremented BEFORE the fire check reads
   * it, so a cooldown of exactly 1 is already 0 by the time that check runs and the
   * fifteenth frame after a shot can fire again, not the sixteenth.
   */
  arrowCooldown: number;
  /**
   * Set by a super pickup (index.html:1448). The live `initLevel` seeds this from
   * `dc.startWithCape` (index.html:1169) rather than the plain `false` createPlayer
   * gives it — that spawn state, and everything the cape then DOES (absorbing a hit,
   * the invincibility window, the pit save), is Task 6 of this plan. Only the pickup
   * that grants it is ported here.
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
   * genuinely separate: the firing path (index.html:1383-1387, player.ts's fireArrow)
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
   * True for a flyer that writes its own `y` every frame instead of falling — bat and
   * icebat (ghost too, live, but this slice never spawns one). stepEnemy's
   * gravity/floor-snap block is skipped entirely while this is true (index.html:1526's
   * `if(!e.noGravity){...}`). False for every ground patroller, exactly like the live
   * source, which only ever ADDS this field for the types that need it.
   */
  noGravity: boolean;
  /**
   * The fixed height a bat/icebat's sine flight is centred on — set once at spawn,
   * 60px above where it would otherwise have stood on the ground (index.html:1217),
   * and never touched again; stepEnemy reads it fresh every frame rather than
   * integrating position, so nothing here ever drifts. Inert (0) for every other type.
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
   * (index.html:1219, 1537). Inert (0) for every other type.
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
   * Already been turned into a chicken (index.html:1497-1498). The live game adds this
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
}

/**
 * One arrow in flight (index.html:1385) — fired by the bow, or, when any chicken ray
 * charge is left, the same object with `isChicken` set. There is no vy and no gravity:
 * an arrow flies dead straight at `vx` until it runs out of `life`, hits a solid tile,
 * or hits an enemy.
 *
 * Its two collision shapes are DIFFERENT and both deliberate (index.html:1495-1496):
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
   * Remaining lives, seeded from `dc.lives` (createWorld) and decremented by
   * `playerDie` on every death — pit or contact alike (index.html:1647's `lives--`).
   * A plain `number`, not an integer count: `dc.lives` is `Infinity` on super_easy
   * (difficulty.ts), and `Infinity - 1 === Infinity` in IEEE-754, so infinite lives
   * really do stay infinite under repeated decrement. That is the live game's own
   * untyped behaviour, reproduced deliberately, not a bug to fix.
   */
  lives: number;
  /**
   * Counts down from 90 while `dead` (index.html:1348's `stateTimer--`), independent
   * of `frame`/`animFrame`. While `dead`, `stepWorld`'s dead branch is the sole reader.
   * `checkRescue` also sets it to 200 on a win (index.html:1631), matching the live
   * `stateTimer=200` a level-complete assigns — but nothing in this slice counts it
   * down from THAT branch; see `won` below for why.
   */
  stateTimer: number;
  /**
   * Set once `stateTimer` runs out with no lives left (index.html:1348's
   * `else{gameState='gameover';...}`). This slice has no game-over SCREEN — no title
   * transition, no further countdown, nothing a child would ever see — so this is
   * simply a terminal marker: once true, `stepWorld`'s dead branch returns
   * immediately every frame after, freezing the world forever, same as a bare `dead`
   * alone did before respawn existed.
   */
  gameOver: boolean;
  /**
   * Set by `checkRescue` (world.ts) once the player overlaps the rescue box
   * (index.html:1631's `gameState='levelcomplete'`). A terminal marker, same idea as
   * `gameOver` above rather than a mirror of `dead`: the live `levelcomplete` state
   * itself counts `stateTimer` down and then either advances to the next level or, on
   * the last one, to a 'win' screen (index.html:1350) — level advancement is out of
   * scope for this plan, so none of that is reproduced here. Once true, `stepWorld`
   * returns immediately every frame after, freezing the world exactly like `dead`
   * does, just with no respawn (or anything else) waiting on the other side of it.
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
   * and is reproduced rather than assumed away. The cat COMPANION this pickup spawns
   * is a later task; only the pickup itself exists here.
   */
  catPickup: Pickup | null;
  /**
   * index.html:1188. Empty at level build; filled by bumping a question block from
   * below (player.ts's bumpBlocksAbove), one star per block, one tile ABOVE the block
   * that paid out. Stepped and collected by world.ts's stepStars.
   */
  stars: Star[];
  /**
   * index.html:984, 1179. Arrows and chicken rays currently in flight, in firing order.
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
