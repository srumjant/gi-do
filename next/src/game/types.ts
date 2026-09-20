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
   * Set by a bow pickup (index.html:1447) and — later, from the chicken ray — by the
   * rainbow block's silly power-up. Nothing READS it yet: firing is a later task, and
   * it is the firing branch (index.html:1392) that consults it alongside `bowCharges`.
   */
  hasBow: boolean;
  /**
   * Arrows left. Seeded from `dc.bowCharges` on pickup, NOT from a constant — it runs
   * from 8 on super_easy down to 2 on hard (difficulty.ts), so the same pickup is
   * worth four times as much to a small child as to a grown-up.
   */
  bowCharges: number;
  /**
   * Set by a super pickup (index.html:1448). The live `initLevel` seeds this from
   * `dc.startWithCape` (index.html:1169) rather than the plain `false` createPlayer
   * gives it — that spawn state, and everything the cape then DOES (absorbing a hit,
   * the invincibility window, the pit save), is Task 6 of this plan. Only the pickup
   * that grants it is ported here.
   */
  hasCape: boolean;
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
 * A question (tile 3) or rainbow (tile 5) block, in TILE coordinates — NOT pixels.
 * Both lists are re-derived from the map by scanning it at level build (index.html:1189),
 * which is what makes a respawn restore every block that was bumped. Bumping them is a
 * later task in this plan; this slice only builds the lists.
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
   * Counts down from 30 (45 with big-head, out of scope) after a stomp, so a squashed
   * enemy keeps rendering — flattened — for half a second instead of vanishing the
   * instant it dies (index.html:1215, 1525, 1545).
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
   * Drawn once at spawn from enemy.ts's injectable random, not Math.random() directly
   * — see that module's own comment for why. Inert (0) for every other type.
   */
  sineOffset: number;
  /**
   * Frames since a bouncer's last hop (or since it spawned, for the first one);
   * stepEnemy fires a new hop once this clears 40 while the bouncer is resting
   * (index.html:1219, 1537). Inert (0) for every other type.
   */
  bounceTimer: number;
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
   * index.html:1188. Empty at level build and stays empty in this slice: stars are
   * created by bumping a question block from below, which is a later task. The
   * movement and collection of one are ported here (world.ts's stepStars) because
   * that is where the live game runs them.
   */
  stars: Star[];
  /** index.html:1189-1190. Scanned off the freshly generated map, in tile coordinates. */
  questionBlocks: BlockState[];
  /** index.html:1189, 1191. Same scan, tile code 5. */
  rainbowBlocks: BlockState[];
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
