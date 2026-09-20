import { BASE_W, TILE, VIEW_H, VIEW_W } from '../config/constants';
import { DIFFICULTY_CONFIG, type DifficultyKey } from '../config/difficulty';
import { LEVELS } from '../data/levels';
import type { InputState } from '../input/actions';
import { spawnEnemy, stepEnemy } from './enemy';
import { createPlayer, stepPlayer, type Character } from './player';
import { getRescueSprites } from './run';
import { findGroundY, rectOverlap } from './tiles';
import type { World } from './types';

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
  return {
    level,
    map: level.generate(dc),
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
  };
}

/**
 * Port of `initLevel(currentLevel)` (index.html:1163-1209), called from `stepWorld`'s
 * dead branch once the 90-frame respawn countdown reaches zero with lives still left.
 * Rebuilds exactly the five things `createWorld` builds for a fresh game — map,
 * player, enemies, pending queue, camera — and clears `dead` so play resumes next
 * frame. Deliberately does NOT touch `lives` (or the live game's `score`, out of
 * scope here): index.html:1163's `initLevel` never assigns either, which is precisely
 * why a respawn is not a new game. `stateTimer` is also left alone — meaningless
 * until the next death sets it fresh, exactly as on the live side.
 */
export function respawnLevel(world: World): void {
  world.map = world.level.generate(world.dc);
  world.player = createPlayer(world.level, world.character);
  world.enemies = [];
  world.pending = world.level.enemyDefs.map((d) => ({ type: d.type, x: d.x, spawned: false }));
  world.camera = { x: 0, y: 0 };
  world.dead = false;
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
    stepEnemies(world);
    checkRescue(world);
    stepCamera(world);
  }

  world.frame++;
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
    if (world.dc.enemySkipChance && Math.random() < world.dc.enemySkipChance) continue;
    const enemy = spawnEnemy(world.map, world.dc, d);
    if (enemy) world.enemies.push(enemy);
  }
}

/** Per-enemy step (index.html:1524-1547). See enemy.ts for gravity, patrol, the stomp and contact damage. */
export function stepEnemies(world: World): void {
  for (const enemy of world.enemies) stepEnemy(world, enemy);
}
