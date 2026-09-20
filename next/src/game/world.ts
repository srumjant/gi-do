import { BASE_W, TILE, VIEW_H, VIEW_W } from '../config/constants';
import { DIFFICULTY_CONFIG, type DifficultyKey, type DifficultyRecord } from '../config/difficulty';
import { LEVELS, TILE_QUESTION, TILE_RAINBOW, type Level, type TileMap } from '../data/levels';
import { BOW_S, CAT_S, SUPER_S } from '../data/sprites';
import type { InputState } from '../input/actions';
import { chickenify, spawnEnemy, stepEnemy } from './enemy';
import { createPlayer, stepPlayer, type Character } from './player';
import { random } from './random';
import { getRescueSprites } from './run';
import { findGroundY, getTile, isSolid, rectOverlap } from './tiles';
import type { Arrow, BlockState, Pickup, Star, World } from './types';

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
  stars: Star[];
  arrows: Arrow[];
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
    // the live guard is real and kept. The `cat=null` on the line above it belongs to
    // the companion, which is a later task.
    catPickup: level.catPosition == null ? null : {
      x: level.catPosition * TILE,
      y: findGroundY(map, level.catPosition) - CAT_S.length * 2,
      collected: false,
    },
    stars: [],
    // index.html:1188's `arrows=[]`, on the same line as `stars=[]`. In this bundle for
    // the same reason the stars are: a respawn has to throw away whatever was in flight.
    arrows: [],
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
 */
export function createWorld(
  levelIndex: number,
  difficulty: DifficultyKey,
  character: Character = 'gigi',
): World {
  const level = LEVELS[levelIndex];
  const dc = DIFFICULTY_CONFIG[difficulty];
  const map = level.generate(dc);
  return {
    level,
    map,
    dc,
    player: createPlayer(level, character),
    enemies: [],
    frame: 0,
    animFrame: 0,
    dead: false,
    camera: { x: 0, y: 0 },
    pending: level.enemyDefs.map((d) => ({ type: d.type, x: d.x, spawned: false })),
    lives: dc.lives,
    stateTimer: 0,
    gameOver: false,
    won: false,
    character,
    // A run starts at zero (index.html:1347's `score=0`, beside `lives=DC().lives`
    // above). Nothing else ever zeroes it — see the field's own comment in types.ts.
    score: 0,
    // index.html:1188's `powerupPopup=null`, alongside the collections buildLevelState
    // owns. Kept out of that bundle because it is not a spawn table — but for the same
    // reason the bundle exists, respawnLevel below must clear it too.
    powerupPopup: null,
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
  world.player = createPlayer(world.level, world.character);
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
}

/**
 * One simulation tick, called at exactly STEP_HZ regardless of display refresh.
 *
 * The order is the live game's and it matters. The spawn window runs FIRST, against the
 * camera as it was left by the previous frame (index.html:1358, near the top of the
 * playing branch), and the camera lerps LAST (index.html:1634, near the bottom). Doing
 * the camera first would shift every enemy's spawn frame by one and the enemy traces
 * would drift apart for a reason that looks nothing like the cause.
 */
export function stepWorld(world: World, input: InputState): void {
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
    // Terminal: this slice has no game-over screen for it to lead anywhere, so once
    // set, every later frame just re-enters here and returns, forever.
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

  // Already won: nothing plays, forever — index.html's 'levelcomplete' state counts
  // its own stateTimer down and advances to the next level (or a 'win' screen on the
  // last one), but level advancement is out of scope for this plan, so there is
  // nothing on the other side of this to return to. A plain terminal marker, same
  // idea as `gameOver` above.
  if (world.won) {
    world.frame++;
    return;
  }

  spawnEnemiesInView(world);
  stepPlayer(world, input);

  // A PIT death happens inside the player block, which returns right there
  // (index.html:1423) — a direct return from update() itself — so enemies, the
  // rescue check and the camera are all skipped for the rest of that frame too. The
  // spawn pass above has already run, which is also what the live game does.
  //
  // A CONTACT death is different, and this `if` is checked only ONCE, before
  // stepEnemies runs, deliberately: the live equivalent (index.html:1547's
  // `playerHit();return;`) sits inside `enemies.forEach`, so that `return` only ends
  // ITS OWN enemy's turn — the live forEach still steps every enemy after it, and
  // `update()` still runs its rescue check and camera lerp afterward, all on the very
  // same frame the player died (index.html has no gameState guard in front of either).
  // Checking `world.dead` again between stepEnemies and stepCamera (or inside
  // stepEnemies' loop) would freeze one frame earlier than the live game does and
  // desync the trace. So: one check, all three calls inside it, exactly like this.
  if (!world.dead) {
    // index.html:1447-1448, :1504-1517 and :1519 — all three sit between the player
    // block and the enemies loop, in this order, with the cat companion (a later task)
    // between the first two. Inside the `!world.dead` guard because a PIT death returns
    // from the live update() at index.html:1423, above all of this: you do not sweep up
    // the pickups you happen to be falling through on the frame you die.
    //
    // Arrows fly BEFORE the enemies move, which is what makes the arrow trace's timing
    // what it is: an arrow tests this frame's own position against last frame's enemy
    // positions, and an enemy turned into a chicken here is then stepped as a chicken,
    // falling and walking, in the very same frame.
    collectPickups(world);
    stepArrows(world);
    stepStars(world);
    stepEnemies(world);
    checkRescue(world);
    stepCamera(world);
  }

  world.frame++;
}

/**
 * Port of index.html:1447-1448 — the bow and super pickups. The cat's own overlap
 * check sits between them in the live source (index.html:1450) and is deliberately
 * absent: it spawns the cat companion, which is a later task in this plan.
 *
 * The pickup hitboxes are FLAT LITERALS, 16x16 for both, and they match neither
 * sprite: BOW_S and SUPER_S are 8x8 grids drawn at scale 2, so 16 wide happens to
 * agree while the cat's is 16x22 against a 20x26 drawn sprite. Do not derive one from
 * the other in either direction — the spawn `y` above genuinely uses the sprite
 * height, and this genuinely does not.
 *
 * `bowCharges` comes off the difficulty record, not a constant (see PlayerState).
 * Neither pickup awards score; only stars, stomps, kills and the rescue do.
 */
export function collectPickups(world: World): void {
  const p = world.player;
  const box = { x: p.x, y: p.y, w: p.w, h: p.h };
  for (const b of world.bowPickups) {
    if (!b.collected && rectOverlap(box, { x: b.x, y: b.y, w: 16, h: 16 })) {
      b.collected = true;
      p.hasBow = true;
      p.bowCharges = world.dc.bowCharges;
    }
  }
  for (const s of world.superPickups) {
    if (!s.collected && rectOverlap(box, { x: s.x, y: s.y, w: 16, h: 16 })) {
      s.collected = true;
      p.hasCape = true;
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
        continue; // the live `return` — this enemy only; see the note above
      }
      e.alive = false;
      e.squashTimer = 30;
      a.life = 0;
      world.score += Math.round(200 * world.dc.scoreMultiplier);
    }
  }
  // index.html:1517. A fresh array, exactly as the live line assigns one, so anything
  // holding the old one (nothing does) would see the same thing the live game's would.
  world.arrows = world.arrows.filter((a) => a.life > 0);
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
  // index.html:1630's `!boss||bossDefeated`. No boss exists in this slice's World (a
  // boss fight is a later plan), which is exactly the live condition when there is no
  // boss on the level at all — always true here, ported as a named constant rather
  // than silently dropped, so that later plan has an obvious place to wire the real
  // condition back in instead of having to rediscover this check from scratch.
  const canRescue = true;
  if (canRescue && rectOverlap(
    { x: p.x, y: p.y, w: p.w, h: p.h },
    { x: rX, y: rY, w: 16, h: rDH },
  )) {
    world.won = true;
    world.stateTimer = 200; // index.html:1631. No level-advance in this slice — won is terminal.
    // Also index.html:1631, and only reachable now that `score` exists. Same
    // round-at-the-award-site shape as every other award; see stepStars.
    world.score += Math.round(500 * world.dc.scoreMultiplier);
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

/** Per-enemy step (index.html:1524-1547). See enemy.ts for gravity, patrol, the stomp and contact damage. */
export function stepEnemies(world: World): void {
  for (const enemy of world.enemies) stepEnemy(world, enemy);
}
