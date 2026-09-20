import { ENEMY_SCALE, GRAVITY, TILE } from '../config/constants';
import type { DifficultyRecord } from '../config/difficulty';
import type { EnemyDef, TileMap } from '../data/levels';
import { CAR_S, DINO_S, DOLL_S, PENGUIN_S, type SpriteData } from '../data/sprites';
import { findGroundY, getTile, isSolid, rectOverlap } from './tiles';
import type { EnemyState, World } from './types';

/**
 * Ground patrollers only (index.html:1212-1222, 1524-1547): doll, car, dino, penguin.
 * Ghost (homes on the player), bat/icebat (sine-wave flight), cannon (shoots) and
 * bouncer (hops) are streamed types this slice does not implement. Their pending defs
 * are still consumed by the spawn window in world.ts exactly where the live game would
 * spawn them (so later defs still line up frame-for-frame) — this map is just how
 * `spawnEnemy` recognises "not this slice's problem" and returns undefined instead of
 * pushing an enemy that would then sit there unanimated and unreactive. A
 * half-simulated enemy is worse than a missing one.
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
};

/**
 * Port of index.html:1212-1222, restricted to the four ground-patrol types above.
 * `def` is a pending entry (streamed level column + type); returns undefined for every
 * other streamed type so the caller (`spawnEnemiesInView` in world.ts) can skip it.
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
  // override in scope (index.html:1220). doll/car/dino keep the default.
  const vx = def.type === 'penguin' ? -0.6 * dc.enemySpeed : -0.8 * dc.enemySpeed;

  return { type: def.type, x: def.x * TILE, y: gy - h, vx, vy: 0, w, h, alive: true };
}

/**
 * Port of the per-enemy step at index.html:1524-1547, restricted to what "In scope"
 * covers: gravity + floor snap, ground patrol (wall turn, ledge turn), and the stomp.
 * No per-type AI branch is needed here — doll/car/dino/penguin all fall through to the
 * source's trailing `else` (the plain ground-patrol case); ghost/bat/cannon/bouncer
 * never reach this function because `spawnEnemy` above never creates them.
 *
 * Mutates `enemy` in place, and `world.player.vy` on a kill — exactly like `stepPlayer`
 * mutates `world.player`.
 */
export function stepEnemy(world: World, e: EnemyState): void {
  // index.html:1525 — a dead enemy's squashTimer animation is out of scope (no such
  // field on this port's EnemyState); what matters is the early return: nothing below
  // runs, so a dead enemy simply stops where it died.
  if (!e.alive) return;

  const map = world.map;

  // Gravity + floor snap (index.html:1526-1528). Every type in scope uses gravity —
  // noGravity (ghost, bat/icebat) is a different code path this slice never spawns.
  e.vy += GRAVITY;
  if (e.vy > 8) e.vy = 8;
  e.y += e.vy;
  const eF = e.y + e.h;
  if (isSolid(getTile(map, e.x + e.w / 2, eF)) || isSolid(getTile(map, e.x + 2, eF))
      || isSolid(getTile(map, e.x + e.w - 2, eF))) {
    e.y = Math.floor(eF / TILE) * TILE - e.h;
    e.vy = 0;
  }

  // Ground patrol (index.html:1546-1547): no horizontal tile resolution at all, only a
  // direction flip. `ef`/`ef2` are computed once, from the direction of travel BEFORE
  // either check, and reused for both — so a wall-flip and a ledge-flip on the same
  // frame can cancel each other out, exactly as the live game's own logic does; that is
  // reproduced rather than smoothed over. Unlike the player's wall collision, there is
  // no position correction here: the enemy can end up one frame's `vx` deep into a wall
  // tile before the flip takes effect, exactly as live.
  e.x += e.vx;
  const ef2 = e.y + e.h + 2;
  const ef = e.vx > 0 ? e.x + e.w : e.x;
  if (isSolid(getTile(map, ef, e.y + e.h / 2))) e.vx *= -1; // wall
  const gA = getTile(map, ef, ef2);
  if (!isSolid(gA) && isSolid(getTile(map, e.x + e.w / 2, ef2))) e.vx *= -1; // ledge

  // Stomp (index.html:1541-1543). The live box also shrinks/grows for big-head and
  // gates on invincibility; neither exists on this port's PlayerState, which has the
  // same effect as both always being "off" — shm collapses to plain `dc.stompHitbox ||
  // 1` and the overlap box is the plain +2/-4 inset. This is NOT the tile-collision box
  // from player.ts: that one insets y by 1-3px too; this one does not.
  const p = world.player;
  const dc = world.dc;
  const shm = dc.stompHitbox || 1;
  if (rectOverlap(
    { x: p.x + 2, y: p.y, w: p.w - 4, h: p.h },
    { x: e.x, y: e.y, w: e.w, h: e.h },
  )) {
    if (p.vy > 0 && p.y + p.h - 4 < e.y + (e.h * shm) / 2) {
      e.alive = false;
      p.vy = -5;
    }
    // else: side or rising contact. playerHit() (damage/death) is out of scope for this
    // task — a half-implemented player death would be worse than none — so contact
    // that is not a stomp does nothing yet.
  }
}
