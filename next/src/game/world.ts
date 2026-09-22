import { BASE_W, TILE, VIEW_H, VIEW_W } from '../config/constants';
import { DIFFICULTY_CONFIG, type DifficultyKey, type DifficultyRecord } from '../config/difficulty';
import { LEVELS, TILE_QUESTION, TILE_RAINBOW, type Level, type TileMap } from '../data/levels';
import { BOW_S, CAT_S, SUPER_S } from '../data/sprites';
import type { InputState } from '../input/actions';
import { isFinalLevel, spawnBoss, stepBoss } from './boss';
import { chickenify, spawnEnemy, stepEnemy, type EnemyMove } from './enemy';
import { createPlayer, playerHit, stepPlayer, type Character, type PlayerMove } from './player';
import { random } from './random';
import { getRescueSprites, type RunTotals } from './run';
import { findGroundY, getTile, isSolid, rectOverlap } from './tiles';
import type {
  Arrow, BlockState, BossState, CatState, EnemyProjectile, Pickup, Star, World,
} from './types';

/**
 * Everything `initLevel` rebuilds from scratch every time a level starts — including
 * after a death (index.html:1180-1191). Bundled into one builder rather than written
 * out twice because `createWorld` and `respawnLevel` must agree exactly: the whole
 * point of the respawn path is that a bumped block comes back and a collected pickup
 * reappears. Note what is NOT in here — `score` (World, survives death) and `lives`.
 */
interface LevelSpawnState {
  bowPickups: Pickup[];
  superPickups: Pickup[];
  catPickup: Pickup | null;
  cat: CatState | null;
  stars: Star[];
  arrows: Arrow[];
  enemyProjectiles: EnemyProjectile[];
  boss: BossState | null;
  bossDefeated: boolean;
  questionBlocks: BlockState[];
  rainbowBlocks: BlockState[];
}

/**
 * Port of index.html:1173-1191.
 *
 * The pickup columns are NOT simply the level record's `bowPositions` /
 * `superPositions`. `dc.enemySkipChance` — the super_easy-only field whose name says
 * it only makes enemies spawn less often — ALSO injects a pickup every 20 tiles, a
 * super at `i` and a bow at `i+5`, from tile 10 to ten tiles short of the level's
 * right edge. There is no separate flag: the field being truthy is the entire
 * condition, so the two behaviours cannot be separated. Level 1 (width 120) gains ten
 * pickups its record does not list — supers at 10, 30, 50, 70, 90 and bows at 15, 35,
 * 55, 75, 95 — which includes a SECOND bow sitting exactly on top of the record's own
 * bow at 35. Both are collected on the same frame and both set the same charge count,
 * so the duplicate changes nothing in play; it is drawn twice, and it is the live
 * game's, so it stays.
 * Every frame trace in this suite runs at `normal`, which has no `enemySkipChance` at
 * all, so no trace can reach this branch; world.test.ts compares these tables against
 * the live game's own directly instead, across every difficulty and level.
 *
 * The live source's `lvl.bowPositions||[]` guard is dropped: this port's `Level` type
 * requires both arrays, and all six records define them, so the fallback is dead code
 * here rather than a behaviour being discarded.
 *
 * Each pickup's `y` is `findGroundY(column) - spriteH(SPRITE, 2)` — the sprite's own
 * drawn height (`rows * 2`, index.html:670), which is why the three kinds sit at three
 * different heights. It is NOT the collision size: see collectPickups below, where the
 * hitboxes are flat literals that match no sprite.
 */
function buildLevelState(level: Level, dc: DifficultyRecord, map: TileMap): LevelSpawnState {
  let bowPos = level.bowPositions;
  let superPos = level.superPositions;
  // Covered by world.test.ts's "builds identical pickup, star and block tables for
  // every difficulty and level" — no frame trace reaches this branch.
  if (dc.enemySkipChance) {
    const extra: number[] = [];
    for (let i = 10; i < level.width - 10; i += 20) extra.push(i);
    superPos = [...superPos, ...extra];
    bowPos = [...bowPos, ...extra.map((x) => x + 5)];
  }

  const questionBlocks: BlockState[] = [];
  const rainbowBlocks: BlockState[] = [];
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (map[y][x] === TILE_QUESTION) questionBlocks.push({ x, y, hit: false });
      else if (map[y][x] === TILE_RAINBOW) rainbowBlocks.push({ x, y, hit: false });
    }
  }

  return {
    bowPickups: bowPos.map((tx) => ({
      x: tx * TILE, y: findGroundY(map, tx) - BOW_S.length * 2, collected: false,
    })),
    superPickups: superPos.map((tx) => ({
      x: tx * TILE, y: findGroundY(map, tx) - SUPER_S.length * 2, collected: false,
    })),
    // index.html:1183-1187. Always non-null for the six records this port carries, but
    // the live guard is real and kept.
    catPickup: level.catPosition == null ? null : {
      x: level.catPosition * TILE,
      y: findGroundY(map, level.catPosition) - CAT_S.length * 2,
      collected: false,
    },
    // index.html:1183's `cat=null`, the line directly above the pickup it belongs to.
    // In this bundle for exactly the reason the bundle exists: the line above hands the
    // pickup back, so this one has to take the companion away, or a respawn would leave
    // the player with a cat AND a cat to collect.
    cat: null,
    stars: [],
    // index.html:1188's `arrows=[]`, on the same line as `stars=[]`. In this bundle for
    // the same reason the stars are: a respawn has to throw away whatever was in flight.
    arrows: [],
    // index.html:1188's `enemyProjectiles=[]`, on that very same line. A death clears
    // the air of fireballs as well as of arrows.
    enemyProjectiles: [],
    // index.html:1194-1208 — the last thing `initLevel` builds before it starts the
    // music, and in this bundle rather than in `createWorld` alone because `initLevel` IS
    // the respawn path. So dying to the boss hands it its full health back, exactly as it
    // hands back a bumped question block. That is the live behaviour and not a bug to fix.
    boss: isFinalLevel(level) ? spawnBoss(map, dc, level) : null,
    // index.html:1196, immediately above the `if(isFinal)`. Cleared on EVERY level build,
    // including the five with no boss on them at all.
    bossDefeated: false,
    questionBlocks,
    rainbowBlocks,
  };
}

/**
 * Port of the state built by `initLevel` (index.html, around the level-generation
 * block) that this port actually simulates: the map, the player, and the pending
 * enemy queue. `camera` starts at the origin exactly as the live `camera={x:0,y:0}`
 * does; `pending` mirrors the live `pendingEnemies` array (level.enemyDefs, each with
 * a `spawned` flag that starts false).
 *
 * `lives` seeds from `dc.lives` here — the live equivalent (index.html:1307, 1347)
 * sets `lives=DC().lives` on a fresh game, separately from `initLevel` itself, which
 * is exactly why `respawnLevel` below, the port's `initLevel` equivalent, does not
 * touch it. `character` is kept on the world for the same reason `respawnLevel` needs
 * it later: a respawn has to rebuild an equivalent player without the caller passing
 * it again.
 *
 * `start` is how a run that is ALREADY UNDER WAY carries itself into its next level. The
 * live game needs no equivalent: `lives` and `score` are globals there, and
 * `initLevel(currentLevel)` at index.html:1351 — the line the between-level screen exits
 * through — simply does not touch them, so they are still whatever the last level left. A
 * port that rebuilds the World instead has to say so out loud, and this is where it says
 * it. Left out, the defaults below are a FRESH run, which is both what index.html:1347
 * assigns and what every test in the suite wants. See game/run.ts's `finishLevel` for the
 * other end of the same hand-over.
 */
export function createWorld(
  levelIndex: number,
  difficulty: DifficultyKey,
  character: Character = 'gigi',
  start?: RunTotals,
): World {
  const level = LEVELS[levelIndex];
  const dc = DIFFICULTY_CONFIG[difficulty];
  const map = level.generate(dc);
  return {
    level,
    map,
    dc,
    player: createPlayer(level, dc, character),
    enemies: [],
    frame: 0,
    animFrame: 0,
    dead: false,
    camera: { x: 0, y: 0 },
    pending: level.enemyDefs.map((d) => ({ type: d.type, x: d.x, spawned: false })),
    lives: start?.lives ?? dc.lives,
    stateTimer: 0,
    gameOver: false,
    won: false,
    character,
    // A run starts at zero (index.html:1347's `score=0`, beside `lives=DC().lives`
    // above). Nothing else ever zeroes it — see the field's own comment in types.ts.
    score: start?.score ?? 0,
    // index.html:1188's `powerupPopup=null`, alongside the collections buildLevelState
    // owns. Kept out of that bundle because it is not a spawn table — but for the same
    // reason the bundle exists, respawnLevel below must clear it too.
    powerupPopup: null,
    // Empty, and emptied again at the top of every step. See World.sounds in types.ts.
    sounds: [],
    ...buildLevelState(level, dc, map),
  };
}

/**
 * Port of `initLevel(currentLevel)` (index.html:1163-1209), called from `stepWorld`'s
 * dead branch once the 90-frame respawn countdown reaches zero with lives still left.
 * Rebuilds exactly what `createWorld` builds for a fresh game — map, player, enemies,
 * pending queue, camera — plus everything `buildLevelState` owns
 * (pickups back where they started, blocks un-bumped, stars gone), and clears `dead`
 * so play resumes next frame. Deliberately does NOT touch `lives` or `score`:
 * index.html:1163's `initLevel` never assigns either, which is precisely why a respawn
 * is not a new game — you keep the points and the lives counter, you lose the bow.
 * `stateTimer` is also left alone — meaningless until the next death sets it fresh,
 * exactly as on the live side.
 */
export function respawnLevel(world: World): void {
  world.map = world.level.generate(world.dc);
  world.player = createPlayer(world.level, world.dc, world.character);
  world.enemies = [];
  world.pending = world.level.enemyDefs.map((d) => ({ type: d.type, x: d.x, spawned: false }));
  world.camera = { x: 0, y: 0 };
  world.dead = false;
  // index.html:1188. Dying mid-announcement throws the announcement away with everything
  // else; without this the freeze gate below would still be holding the rebuilt level.
  world.powerupPopup = null;
  // Rebuilt from the FRESH map above, exactly as initLevel derives them, so a question
  // block bumped before the death is a question block again after it.
  Object.assign(world, buildLevelState(world.level, world.dc, world.map));
  // index.html:1209 — the LAST line of initLevel, and easy to miss from the respawn end
  // of it. Dying stops the music (playerDie, player.ts), and this is what brings it back
  // ninety frames later. Without it the first death leaves the rest of the run silent.
  // The cue carries no theme number: `world` does not know which level it is, and the
  // scene that does supplies it on the way out. See World.sounds in types.ts.
  world.sounds.push('music-level');
}

/**
 * One simulation tick, called at exactly STEP_HZ regardless of display refresh.
 *
 * The order is the live game's and it matters. The spawn window runs FIRST, against the
 * camera as it was left by the previous frame (index.html:1358, near the top of the
 * playing branch), and the camera lerps LAST (index.html:1634, near the bottom). Doing
 * the camera first would shift every enemy's spawn frame by one and the enemy traces
 * would drift apart for a reason that looks nothing like the cause.
 *
 * `move` is what actually moves the player and separates it out of the tiles — Arcade,
 * in the browser (physics/player.ts). It is passed straight through to `stepPlayer` and
 * this function has no other opinion about it; see PlayerMove in player.ts for why it is
 * injected rather than imported, and why it is optional.
 *
 * `moveEnemy` is the same arrangement for the GROUND PATROLS (physics/enemy.ts), passed
 * straight through to `stepEnemies`. Two seams rather than one because they are two
 * different jobs — one body that outlives the level against a list of bodies that comes and
 * goes — and because a caller that wants a moving player and still enemies, which is most
 * of the test suite, should be able to say so.
 */
export function stepWorld(
  world: World,
  input: InputState,
  move?: PlayerMove,
  moveEnemy?: EnemyMove,
): void {
  // Last step's noises are last step's. Emptied HERE rather than by whoever plays them,
  // so that the invariant holds for every caller: the list holds the cues of the step just
  // taken and nothing older. A headless driver that never reads it (most of the test
  // suite) therefore cannot grow it without bound, and — the part that is actually
  // audible — a frozen step cannot bank cues up behind a death and fire them in a burst
  // when play resumes, because a frozen step still runs this line before it returns.
  world.sounds.length = 0;

  // index.html:1275 — the very first line of update(), before every other state check
  // (including the live game's own dead-state branch), so it advances even while dead,
  // on the title screen, everywhere. Reproduced by incrementing unconditionally, first,
  // ahead of the world.dead early return right below — not folded into world.frame,
  // which counts frames of actual play and is intentionally left alone.
  world.animFrame++;

  // The silly power-up announcement (index.html:1276) — the very next line after
  // `animFrame++` in the live update(), ABOVE the dead check, the pause menu and
  // everything else. While it exists the whole game is frozen: no player, no enemies,
  // no camera, for the full 120 frames. `animFrame` keeps counting (it was already
  // incremented above), which is exactly why the live game's bats keep flapping on the
  // sine clock in the drawn frame behind the popup even though nothing simulates.
  //
  // The live line also calls `clearJP()`. There is no port equivalent and none is
  // needed: `justPressed` is a live global the live update() has to scrub by hand on
  // every early return, whereas this port is handed `jumpPressed` as a rising edge the
  // caller computes per step. Nothing carries over to scrub.
  //
  // Reached by taking a rainbow block from underneath, and by nothing else:
  // `giveRandomSillyPowerup` (player.ts) is the only writer of `powerupPopup`, and
  // `bumpBlocksAbove` is its only caller.
  if (world.powerupPopup) {
    world.powerupPopup.timer--;
    if (world.powerupPopup.timer <= 0) world.powerupPopup = null;
    world.frame++;
    return;
  }

  // Already dead: nothing plays. The live update() returns at index.html:1348, above
  // the playing branch entirely, so the camera and every enemy freeze along with the
  // player rather than carrying on around a corpse — UNLESS the 90-frame respawn
  // countdown (also index.html:1348) has just run out, in which case that same live
  // branch rebuilds the level (or, out of lives, ends the game) before returning.
  if (world.dead) {
    world.frame++;
    // Set and then left alone: the game-over SCREEN is a scene, and the scene that owns
    // this World reads the flag and leaves (SliceScene's `leaveIfRunOver`). Until it does,
    // every later frame re-enters here and returns, so the world stays exactly as the
    // death left it.
    if (world.gameOver) return;
    world.stateTimer--;
    if (world.stateTimer <= 0) {
      if (world.lives > 0) {
        respawnLevel(world);
      } else {
        world.gameOver = true; // index.html:1348's `else{gameState='gameover';...}`
      }
    }
    return;
  }

  // Rescued: the level is over and nothing plays, but the clock the live 'levelcomplete'
  // state runs still runs — index.html:1350 is `stateTimer--`, and when it reaches zero
  // that branch advances the level (or, on the last one, wins the game).
  //
  // The countdown is here because it is there: it is the frozen world's own clock, ticking
  // under the rescue overlay, and the live game counts it in `update()` alongside the
  // `animFrame++` above. The DECISION at the end of it is not here, because it is not this
  // level's business — `world` does not know its own index, and what follows a finished
  // level is the RUN's question. So this counts, and SliceScene acts: see `leaveIfRunOver`
  // there, and `finishLevel` in game/run.ts.
  if (world.won) {
    world.frame++;
    world.stateTimer--;
    return;
  }

  spawnEnemiesInView(world);
  // A PIT frame ends the whole update() right there (index.html:1423) — a direct return
  // from update() itself, not from a sub-function — so enemies, the rescue check and the
  // camera are all skipped for the rest of it. The spawn pass above has already run,
  // which is also what the live game does.
  //
  // That is true whether the pit KILLED the player or a cape SAVED it, which is why
  // this reads stepPlayer's answer rather than `world.dead`: a save takes the same
  // `return` and leaves the player alive, so `world.dead` would wave the rest of the
  // frame through and the camera would lerp one extra time on the rescue frame.
  const playedOn = stepPlayer(world, input, move);

  // A CONTACT death is different, and this `if` is checked only ONCE, before
  // stepEnemies runs, deliberately: the live equivalent (index.html:1547's
  // `playerHit();return;`) sits inside `enemies.forEach`, so that `return` only ends
  // ITS OWN enemy's turn — the live forEach still steps every enemy after it, and
  // `update()` still runs its rescue check and camera lerp afterward, all on the very
  // same frame the player died (index.html has no gameState guard in front of either).
  // Checking for death again between stepEnemies and stepCamera (or inside stepEnemies'
  // loop) would freeze one frame earlier than the live game does and desync the trace.
  // So: one check, all three calls inside it, exactly like this.
  if (playedOn) {
    // index.html:1447-1455, :1456-1501, :1504-1517 and :1519 — all four sit between the
    // player block and the enemies loop, in exactly this order. Inside this guard
    // because a pit frame returns from the live update() at index.html:1423, above all
    // of this: you do not sweep up the pickups you happen to be falling through on the
    // frame you die, and the cat freezes mid-bounce with everything else.
    //
    // The cat runs BEFORE the arrows, which is the only thing that decides who gets the
    // points when both could reach the same enemy on the same frame: the cat's 300
    // beats the arrow's 200, and the arrow then flies through a corpse.
    //
    // Arrows fly BEFORE the enemies move, which is what makes the arrow trace's timing
    // what it is: an arrow tests this frame's own position against last frame's enemy
    // positions, and an enemy turned into a chicken here is then stepped as a chicken,
    // falling and walking, in the very same frame.
    collectPickups(world);
    stepCat(world);
    stepArrows(world);
    stepStars(world);
    stepEnemies(world, moveEnemy);
    // index.html:1550-1556 and :1558-1626, in that order and in that place: after the
    // enemies, before the rescue. The order of these two matters to the fight. The
    // projectile pass moves what is ALREADY in the air, so a fireball the boss fires
    // below travels for the first time on the NEXT step rather than on the one it was
    // born — which is what puts its first position 10px from the boss's centre and not
    // 12.5px, and what stops a volley fired point-blank hitting on its own frame.
    stepEnemyProjectiles(world);
    stepBoss(world);
    checkRescue(world);
    stepCamera(world);
  }

  world.frame++;
}

/**
 * Port of index.html:1447-1455 — all three pickups, in the live source's own order.
 *
 * The pickup hitboxes are FLAT LITERALS and they match no sprite: 16x16 for the bow and
 * the super (8x8 grids drawn at scale 2, so 16 wide happens to agree and 16 tall happens
 * to as well) and 16x22 for the cat, against a 10x13 grid drawn 20x26. Do not derive one
 * from the other in either direction, and do not "unify" the cat's with the other two —
 * the spawn `y` in buildLevelState genuinely uses the sprite height, and this genuinely
 * does not.
 *
 * `bowCharges` comes off the difficulty record, not a constant (see PlayerState).
 * No pickup awards score; only stars, stomps, kills, the cat's scratches and the
 * rescue do.
 */
export function collectPickups(world: World): void {
  const p = world.player;
  const box = { x: p.x, y: p.y, w: p.w, h: p.h };
  for (const b of world.bowPickups) {
    if (!b.collected && rectOverlap(box, { x: b.x, y: b.y, w: 16, h: 16 })) {
      b.collected = true;
      p.hasBow = true;
      p.bowCharges = world.dc.bowCharges;
      world.sounds.push('pickup'); // index.html:1447
    }
  }
  for (const s of world.superPickups) {
    if (!s.collected && rectOverlap(box, { x: s.x, y: s.y, w: 16, h: 16 })) {
      s.collected = true;
      p.hasCape = true;
      world.sounds.push('pickup'); // index.html:1448
    }
  }
  // index.html:1450-1455. The companion spawns 20px LEFT of the player whichever way
  // either of them is facing (it starts `facing: 1`, so it is looking away from where it
  // stands) — and that x is real, it is where the bounce starts from. The other two odd
  // values in the literal are not: `y: p.y` is the player's TOP rather than either of
  // their feet, and `baseY: 0` is nowhere at all, and stepCat below runs later in this
  // very same step and overwrites both before anything can read them. Reproduced exactly
  // as written all the same — the literal is the live object's.
  const c = world.catPickup;
  if (c && !c.collected && rectOverlap(box, { x: c.x, y: c.y, w: 16, h: 22 })) {
    c.collected = true;
    world.cat = {
      x: p.x - 20, y: p.y, vx: 0, vy: 0, facing: 1, frame: 0, frameTimer: 0,
      scratchTimer: 0, scratchTarget: null, hitsLeft: 3, bounceDir: 1,
      baseY: 0, onGround: true,
    };
    // TWO sounds, not one: the ordinary pickup chime (index.html:1453) and then a
    // three-note sine jingle of the cat's own on the line after it (:1454), written as
    // bare `playTone` calls rather than as a named effect — which is exactly why it went
    // missing from the first pass over this file. See audio/sfx.ts's sfxCatArrive.
    world.sounds.push('pickup', 'cat-arrive');
  }
}

/**
 * Port of index.html:1456-1501 — the cat companion, which is a lot odder than "a pet
 * that follows you". Five things here are load-bearing:
 *
 *   - ITS OWN GRAVITY. `vy += 0.35` and a takeoff of `-5.5`, neither of which is the
 *     world's GRAVITY (0.4) or the player's `dc.jumpForce`, and neither of which scales
 *     with difficulty. The cat's hop is the same on super_easy and hard.
 *   - `baseY` IS ASSIGNED TWICE, once in the takeoff branch and once unconditionally at
 *     the bottom. The second write is the whole point: it re-aims the landing at the
 *     player's feet AS THEY ARE NOW, every frame, so the cat climbs with a player going
 *     up stairs. Delete it as a duplicate and the cat sinks into the floor behind them.
 *   - IT NEVER RESTS. Landing sets `onGround`, and the next frame's first branch spends
 *     it on another takeoff. There is no idle pose and no timer between hops.
 *   - IT IGNORES THE MAP COMPLETELY. Its floor is `p.y + p.h - catH` — the PLAYER's
 *     feet — not the ground under it. The cat bounces across a pit at the height of a
 *     player standing on the far side of it, and stands in mid-air whenever the player
 *     is on a platform it is bouncing out past the edge of. There is no tile lookup
 *     anywhere in this function, deliberately.
 *   - SPENDING THE LAST SCRATCH DOES NOT REMOVE IT. `hitsLeft` hitting 0 is caught by
 *     the `else if` on the way IN, on the following frame, so the cat lives out the rest
 *     of the frame it killed on. The early return below is that `else if`.
 *
 * The scratch is measured from `cat.x + 8, cat.y + 8` — a fixed inset that is NOT the
 * centre of a 20x26 sprite — to the enemy's true centre, and 45px reaches it. The
 * 30-frame cooldown is decremented at the top of the pass, before the guard reads it, so
 * scratches land exactly 30 frames apart at best. The guard is re-tested per enemy, so
 * one frame can only ever kill one thing.
 *
 * The live `spawnParticles`/`sfxStomp`/`playTone` calls are presentation and sound.
 */
export function stepCat(world: World): void {
  const cat = world.cat;
  if (!cat) return;
  // index.html:1498-1500's `else if(cat&&cat.hitsLeft<=0){cat=null;}` — the frame AFTER
  // the third scratch, never the frame of it.
  if (cat.hitsLeft <= 0) {
    world.cat = null;
    return;
  }

  const p = world.player;
  const catH = CAT_S.length * 2;
  const playerCenterX = p.x + p.w / 2;
  const bounceRange = 60;
  cat.x += cat.bounceDir * 2.5;
  if (cat.x > playerCenterX + bounceRange) {
    cat.bounceDir = -1;
    cat.facing = -1;
  } else if (cat.x < playerCenterX - bounceRange) {
    cat.bounceDir = 1;
    cat.facing = 1;
  }

  const groundY = p.y + p.h - catH;
  if (cat.onGround) {
    cat.vy = -5.5;
    cat.onGround = false;
    cat.baseY = groundY;
  }
  cat.vy += 0.35;
  cat.y += cat.vy;
  if (cat.y >= cat.baseY) {
    cat.y = cat.baseY;
    cat.vy = 0;
    cat.onGround = true;
  }
  // index.html:1477. The second write. See the note above — this is not the duplicate
  // it looks like.
  cat.baseY = groundY;
  cat.frameTimer++;
  if (cat.frameTimer > 8) {
    cat.frame = 1 - cat.frame;
    cat.frameTimer = 0;
  }

  cat.scratchTimer = Math.max(0, cat.scratchTimer - 1);
  const scratchRange = 45;
  for (const e of world.enemies) {
    if (!e.alive || cat.scratchTimer > 0 || cat.hitsLeft <= 0) continue;
    const edx = e.x + e.w / 2 - (cat.x + 8);
    const edy = e.y + e.h / 2 - (cat.y + 8);
    if (Math.sqrt(edx * edx + edy * edy) < scratchRange) {
      e.alive = false;
      e.squashTimer = 30;
      cat.scratchTimer = 30;
      cat.scratchTarget = { x: e.x + e.w / 2, y: e.y + e.h / 2 };
      cat.hitsLeft--;
      // 300 — the biggest per-enemy award in the game, half again what an arrow pays
      // and three times a stomp. Rounded at the award site like every other one; see
      // stepStars.
      world.score += Math.round(300 * world.dc.scoreMultiplier);
      world.sounds.push('stomp'); // index.html:1490 — a scratch sounds like a stomp
      // index.html:1492-1495, INSIDE the scratch branch: the puff the cat goes out in is
      // played on the frame of the third scratch, not on the frame after it when the cat
      // is actually removed. Another bare `playTone`. Keep it here, under the same `if`.
      if (cat.hitsLeft <= 0) world.sounds.push('cat-vanish');
    }
  }
}

/**
 * Port of index.html:1504-1517 — every arrow and chicken ray in flight, moved, tested
 * against the tiles, tested against the enemies, then swept up.
 *
 * Four details are load-bearing and none of them is tidy:
 *
 *   - TWO DIFFERENT WIDTHS, deliberately. Tiles are probed at two bare POINTS, `a.x`
 *     and `a.x + 10`, both at `a.y`; enemies are tested against a 12x4 RECTANGLE. 10 is
 *     not 12, a point is not a box, and neither number is the drawn sprite's. Do not
 *     unify them.
 *   - The move comes FIRST, so an arrow's very first test is taken one step of `vx`
 *     downrange of where it was fired, never at the muzzle.
 *   - `life = 0` is the only kill switch, for a tile hit and an enemy hit alike, and it
 *     does not remove the arrow immediately — the enemy loop below still runs for a
 *     tile-stopped arrow that frame, and a spent arrow stays in the list until the
 *     filter at the end of the pass. The live source rebuilds the array there
 *     (`arrows=arrows.filter(...)`), so that is where things actually leave.
 *   - The chicken branch's `return` is a CONTINUE, not a BREAK. It sits inside the live
 *     `enemies.forEach` callback, so it ends that ONE enemy's turn and skips the kill
 *     branch for it — which is the entire reason a chicken ray converts instead of
 *     killing — while the loop carries on through the remaining enemies. The arrow is
 *     spent either way (`a.life = 0` on both paths), so in practice nothing later
 *     overlaps it, but the shape is the live one: `continue`, never `break`.
 *
 * What the two branches pay differs too: a conversion is worth 100 points, a kill 200,
 * both rounded at the award site like every other award (see stepStars below). And a
 * chicken ray that hits something ALREADY converted takes the kill branch — see
 * EnemyState.isChicken.
 *
 * The live source's `spawnParticles(...)`, `sfxCluck()` and `sfxStomp()` are presentation
 * and sound, which src/game/ does not own.
 */
export function stepArrows(world: World): void {
  for (const a of world.arrows) {
    a.x += a.vx;
    a.life--;
    if (isSolid(getTile(world.map, a.x, a.y)) || isSolid(getTile(world.map, a.x + 10, a.y))) {
      a.life = 0;
    }
    for (const e of world.enemies) {
      if (!e.alive) continue;
      if (!rectOverlap({ x: a.x, y: a.y, w: 12, h: 4 }, { x: e.x, y: e.y, w: e.w, h: e.h })) {
        continue;
      }
      if (a.isChicken && !e.isChicken) {
        chickenify(e);
        a.life = 0;
        world.score += Math.round(100 * world.dc.scoreMultiplier);
        world.sounds.push('cluck'); // index.html:1511
        continue; // the live `return` — this enemy only; see the note above
      }
      e.alive = false;
      e.squashTimer = 30;
      a.life = 0;
      world.score += Math.round(200 * world.dc.scoreMultiplier);
      world.sounds.push('stomp'); // index.html:1514
    }
  }
  // index.html:1517. A fresh array, exactly as the live line assigns one, so anything
  // holding the old one (nothing does) would see the same thing the live game's would.
  world.arrows = world.arrows.filter((a) => a.life > 0);
}

/**
 * Port of index.html:1550-1556 — everything an ENEMY has fired, moved and resolved in one
 * pass. The mirror image of `stepArrows` above, and deliberately built for BOTH shooters
 * that fill the list rather than only for the one that exists today: the boss's fireballs
 * (game/boss.ts) now, and the cannon's single shot (index.html:1534-1535) when that enemy
 * type is ported. The cannon needs nothing here — it only has to push onto
 * `world.enemyProjectiles`, exactly as the boss does, and this pass will fly it.
 *
 * NO GRAVITY, anywhere. `y` gains `vy` and `vy` gains nothing, so every projectile in
 * this game travels a perfectly straight line for its whole life: the cannon's at
 * `vy: 0` is horizontal, and the boss's pair at -1 and -2 rise forever at a fixed rate.
 * That is item 4 of the spec's bug-compatibility contract, and it is also why these are
 * not Arcade bodies — see EnemyProjectile in types.ts.
 *
 * Three collision shapes, none of them derived from another and none of them the drawn
 * sprite's size (an 8px FIREBALL_S at scale 2):
 *
 *   - Against TILES, two bare points — `x` and `x + 6` — and no y probe at all, so a
 *     fireball passes through a floor or a ceiling and only stops at a wall it meets
 *     head-on.
 *   - Against the PLAYER, the +2/-4 inset box the enemy and boss checks also use,
 *     against a flat 8x8.
 *   - Against an ARROW, the same flat 8x8 against the arrow's own flat 12x4.
 *
 * An arrow shooting a fireball out of the air is worth 50 points — the cheapest award in
 * the game, and the only one that costs the player a projectile to collect. It makes NO
 * sound: the live line has particles and nothing else (index.html:1554), so no cue is
 * raised here. Both are spent, so it is a genuine trade rather than a free parry.
 *
 * A hit on the player goes through the shared `playerHit`, so the cape absorbs it exactly
 * as it absorbs a contact hit. There is no early return after it: the live source has
 * none, so the arrow sub-loop below still runs for that same projectile on the frame it
 * killed you, and every other projectile still moves.
 */
export function stepEnemyProjectiles(world: World): void {
  const p = world.player;
  for (const ep of world.enemyProjectiles) {
    ep.x += ep.vx;
    ep.y += ep.vy;
    ep.life--;
    if (isSolid(getTile(world.map, ep.x, ep.y)) || isSolid(getTile(world.map, ep.x + 6, ep.y))) {
      ep.life = 0;
    }
    if (p.invincible <= 0 && rectOverlap(
      { x: p.x + 2, y: p.y, w: p.w - 4, h: p.h },
      { x: ep.x, y: ep.y, w: 8, h: 8 },
    )) {
      ep.life = 0;
      playerHit(world);
    }
    // No `a.life > 0` guard, unlike the boss's own arrow loop (game/boss.ts), because the
    // live line has none (index.html:1554). `stepArrows` ran earlier this step and threw
    // out everything spent, so every arrow here starts the pass alive — but one that has
    // already knocked out a fireball on THIS pass has `life` 0 and can still knock out a
    // second. Preserved as written.
    for (const a of world.arrows) {
      if (!rectOverlap({ x: a.x, y: a.y, w: 12, h: 4 }, { x: ep.x, y: ep.y, w: 8, h: 8 })) {
        continue;
      }
      ep.life = 0;
      a.life = 0;
      world.score += Math.round(50 * world.dc.scoreMultiplier);
    }
  }
  // index.html:1556, and a fresh array exactly as the live line assigns one — the same
  // shape `stepArrows` ends on, for the same reason.
  world.enemyProjectiles = world.enemyProjectiles.filter((ep) => ep.life > 0);
}

/**
 * Port of index.html:1519-1521. A star's rise is a ONE-WAY RAMP, and the exact shape
 * of it matters:
 *
 *   - It leaves a bumped question block at `vy = -2` and gains +0.1 a frame, so it
 *     drifts up, decelerating, for about twenty frames (0.1 does not accumulate
 *     exactly, so which frame it finally crosses zero on is up to IEEE-754 — the
 *     clamp below is what makes that not matter).
 *   - `if (s.vy > 0) s.vy = 0` clamps it the moment it would start falling. It never
 *     comes back down.
 *   - The whole movement block is guarded by `if (s.vy)` — truthiness, not a null
 *     check — so once that clamp writes exactly 0, every later frame skips the block
 *     entirely and the star is frozen in the air for the rest of the level.
 *
 * Stars are created by bumping a question block from below (player.ts's
 * bumpBlocksAbove), one tile above the block that paid out; the list itself starts
 * empty at every level build.
 */
export function stepStars(world: World): void {
  const p = world.player;
  const box = { x: p.x, y: p.y, w: p.w, h: p.h };
  for (const s of world.stars) {
    if (s.collected) continue;
    if (s.vy) {
      s.vy += 0.1;
      s.y += s.vy;
      if (s.vy > 0) s.vy = 0;
    }
    // 10x10, another flat literal against a 7x7 sprite grid.
    if (rectOverlap(box, { x: s.x, y: s.y, w: 10, h: 10 })) {
      s.collected = true;
      // Rounded HERE, at the award, not accumulated and rounded at the end. The two
      // orders are not the same function: easy's 0.75 multiplier against the 50-point
      // award elsewhere in the live game gives 38 twice (76) rounded per award, and 75
      // rounded once at the end. Keep every award site shaped exactly like this one.
      world.score += Math.round(100 * world.dc.scoreMultiplier);
      world.sounds.push('coin'); // index.html:1521
    }
  }
}

/**
 * Port of the rescue check at index.html:1629-1631, run after the enemies step and
 * before the camera lerp — exactly where the live source has it (see stepWorld's own
 * comment on why that placement, inside the same `!world.dead` guard, matters).
 *
 * The overlap box's HEIGHT comes from the RESCUED character's sprite, not the
 * player's — the other character from whichever the player picked (Gigi is rescued
 * playing as Dodo, and vice versa; `getRescueSprites`, ported in run.ts, already
 * resolves that), at scale 2, same as the live `spriteH(rs.sprite,2)`. Gigi and Dodo
 * are different heights (28 and 24 at that scale), so which one is being rescued
 * genuinely changes this box, unlike its WIDTH, which is a flat, hardcoded 16
 * (index.html:1631's literal `w:16`) independent of either character's actual sprite
 * width — reproduced as a literal here too, not "fixed" to use the sprite.
 *
 * The player's own box here is the FULL hitbox `{x,y,w,h}` — NOT the +2/-4 inset box
 * stepEnemy's stomp check uses. Two different boxes, deliberately, exactly as the
 * live source calls rectOverlap with two different insets in the same update().
 */
export function checkRescue(world: World): void {
  const { player: p, level: lvl, map } = world;
  const rescue = getRescueSprites();
  const rTX = lvl.rescuePos[0];
  const rGY = findGroundY(map, rTX);
  const rDH = rescue.sprite.length * 2;
  const rX = rTX * TILE;
  const rY = rGY - rDH;
  // index.html:1630, and the whole reason the boss exists: until it falls, walking into
  // your sibling does nothing at all. On the five levels with no boss the left half is
  // true and this is a no-op, exactly as it is in the live game.
  //
  // It reads `bossDefeated` rather than `!boss.alive` deliberately. The two are set on the
  // same line and are the same thing in practice, but only one of them survives — see
  // World.bossDefeated in types.ts — and this is the live source's own choice of test.
  const canRescue = !world.boss || world.bossDefeated;
  if (canRescue && rectOverlap(
    { x: p.x, y: p.y, w: p.w, h: p.h },
    { x: rX, y: rY, w: 16, h: rDH },
  )) {
    world.won = true;
    // index.html:1631. Two hundred frames of frozen world under the rescue overlay, counted
    // down by stepWorld's `won` branch above; what happens when it reaches zero is
    // SliceScene's and game/run.ts's business, not this function's.
    world.stateTimer = 200;
    // Also index.html:1631, and only reachable now that `score` exists. Same
    // round-at-the-award-site shape as every other award; see stepStars.
    world.score += Math.round(500 * world.dc.scoreMultiplier);
    // The rest of index.html:1631, in its order: the fanfare, and then silence. The music
    // stays off through the cutscene and only comes back with the next level's own theme
    // (SliceScene's create, index.html:1209) — so the rescue is the quietest moment in
    // the game on purpose.
    world.sounds.push('win', 'music-stop');
  }
}

/**
 * Exponential lerp toward the player, clamped to the level, with a snap inside half a
 * pixel so it does not creep forever. index.html:1634-1640.
 */
export function stepCamera(world: World): void {
  const { player: p, level: lvl, camera } = world;
  const targetX = Math.max(0, Math.min(p.x - VIEW_W / 2 + p.w / 2, lvl.width * TILE - VIEW_W));
  const targetY = Math.max(0, Math.min(p.y - VIEW_H / 2, lvl.height * TILE - VIEW_H));
  camera.x += (targetX - camera.x) * 0.12;
  camera.y += (targetY - camera.y) * 0.12;
  if (Math.abs(camera.x - targetX) < 0.5) camera.x = targetX;
  if (Math.abs(camera.y - targetY) < 0.5) camera.y = targetY;
}

/**
 * Streaming enemy spawn (index.html:1358), run FIRST each step against the camera as
 * the previous step left it. `spawned` is set before the skip check below — exactly
 * the live order — so a def that rolls the skip (super_easy only; enemySkipChance is
 * undefined everywhere else) never gets a second look, and so does a def whose type
 * `spawnEnemy` does not implement (see enemy.ts): either way it is consumed from
 * `pending` right where the live game would have spawned it, so later defs still land
 * on the same frame in both.
 */
export function spawnEnemiesInView(world: World): void {
  const crT = Math.floor((world.camera.x + BASE_W) / TILE) + 1;
  const clT = Math.floor(world.camera.x / TILE) - 1;
  for (const d of world.pending) {
    if (d.spawned || d.x < clT || d.x > crT) continue;
    d.spawned = true;
    // index.html:1359. Through random.ts's seam rather than Math.random() directly, so
    // a super_easy test can pin the roll to the same constant the live driver stubs.
    if (world.dc.enemySkipChance && random() < world.dc.enemySkipChance) continue;
    const enemy = spawnEnemy(world.map, world.dc, d);
    if (enemy) world.enemies.push(enemy);
  }
}

/**
 * Per-enemy step (index.html:1524-1547). See enemy.ts for gravity, patrol, the stomp and
 * contact damage, and EnemyMove there for what `moveEnemy` is and why a ground patroller
 * that is handed none simply stands still.
 */
export function stepEnemies(world: World, moveEnemy?: EnemyMove): void {
  for (const enemy of world.enemies) stepEnemy(world, enemy, moveEnemy);
}
