// A `PlayerMove` and an `EnemyMove` for tests. NOT Arcade, and they prove NOTHING about
// collision.
//
// What the port actually ships is `createPlayerMove` (src/physics/player.ts) and
// `createEnemyBodies` (src/physics/enemy.ts): real Arcade bodies, separated against a real
// tilemap layer. Neither can be constructed under Vitest at all — Phaser reads
// `navigator`, then `window`, then a canvas while its module body runs (see
// tests/physics.test.ts's own note), so importing either here throws before a single
// assertion runs. Without SOME mover injected, `stepPlayer` leaves the player exactly
// where it found it and a ground patroller stands still, and every test about what
// happens AFTER something is somewhere — landing, walking off a ledge, turning at a wall,
// falling into a pit — has nothing to say.
//
// So these exist to get the player and the enemies from one place to another, and for no
// other reason. They are the most obvious thing that works: integrate, push out of any
// solid tile they ended up inside, zero the velocity on the blocked axis, report what was
// hit. That is the SHAPE of what the live game did (index.html:1404-1422 for the player,
// :1527-1528 and :1538 for an enemy) but deliberately not the DETAIL of it — no 2px X
// probes, no 3px Y probes, no `+1` in the rightward snap, no three-probe floor test — and
// it is not the detail of what Arcade does either, which puts the body flush and grounds
// it on any overlap at all.
//
// Read that as the warning it is:
//
//   - A test that asserts a POSITION resolved by one of these helpers is asserting what
//     the helper does. There is one shipped answer to "where does the player, or a doll,
//     end up against a wall, a ledge or a block", it is Arcade's, and it is checked in a
//     browser — see the commits for plan 7, tasks 2 and 3, and PLAYTEST.md.
//   - A test that asserts what `stepPlayer` did to `vx`, `vy`, `coyoteTime`,
//     `jumpBuffer`, `frame`, a power-up timer or `world.dead` is testing hand-written
//     code that Arcade never touched, and this helper is only standing in for the part
//     that moves the body so the code under test can be reached at all.
//
// It also does NOT bump `?` or rainbow blocks from below. The shipped mover does that off
// `body.blocked.up`, and the composition is tested in tests/physics.test.ts against the
// real blocks of level 1.
import { TILE } from '../../src/config/constants';
import { isSolid, type TileMap } from '../../src/data/levels';
import type { EnemyMove } from '../../src/game/enemy';
import type { PlayerMove } from '../../src/game/player';

/** Empty outside the map, on every side — the same answer `getTile` gives. */
function tileAt(map: TileMap, tx: number, ty: number): number {
  return map[ty]?.[tx] ?? 0;
}

/**
 * The half-open tile range a box covers: a box whose right edge lands exactly on a tile
 * boundary does not overlap the tile beyond it.
 */
function range(from: number, size: number): [number, number] {
  return [Math.floor(from / TILE), Math.ceil((from + size) / TILE) - 1];
}

/**
 * The first solid tile the box overlaps, scanning top-left first, or undefined. Which one
 * it picks when several overlap is arbitrary, and stays arbitrary on purpose: no test
 * asserts a position this resolves (see the file header), only that the player got out of
 * the tile and onto the ground.
 */
function solidUnder(
  map: TileMap, x: number, y: number, w: number, h: number,
): { tx: number; ty: number } | undefined {
  const [tx0, tx1] = range(x, w);
  const [ty0, ty1] = range(y, h);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (isSolid(tileAt(map, tx, ty))) return { tx, ty };
    }
  }
  return undefined;
}

/**
 * Plain integration plus trivial AABB tile resolution. See the file header: this is a
 * stand-in for Arcade in tests, not a second physics engine, and nothing that ships ever
 * calls it.
 */
export const testMove: PlayerMove = (world) => {
  const p = world.player;
  const map = world.map;

  p.x += p.vx;
  if (p.x < 0) {
    p.x = 0;
    p.vx = 0;
  }
  const hitX = solidUnder(map, p.x, p.y, p.w, p.h);
  if (hitX) {
    p.x = p.vx > 0 ? hitX.tx * TILE - p.w : (hitX.tx + 1) * TILE;
    p.vx = 0;
  }

  p.y += p.vy;
  p.onGround = false;
  const hitY = solidUnder(map, p.x, p.y, p.w, p.h);
  if (hitY) {
    if (p.vy > 0) {
      p.y = hitY.ty * TILE - p.h;
      p.onGround = true;
    } else {
      p.y = (hitY.ty + 1) * TILE;
    }
    p.vy = 0;
  }
};

/**
 * The same thing again for a ground-patrol enemy, and read it with the same warning: this
 * is a stand-in for Arcade, not a second physics engine, and no test may assert a position
 * it resolved.
 *
 * It honours the one part of `EnemyMove`'s contract that is a RULE rather than a detail —
 * `vx` is left alone and a horizontal block is REPORTED, because the patrol owns its own
 * speed and reverses it itself (see EnemyMove in src/game/enemy.ts). Everything else is
 * the most obvious thing that works: integrate, push out of any solid tile, zero `vy` on a
 * vertical block.
 *
 * What it therefore CAN carry a test for: that an enemy which is moved and separated
 * patrols, reverses at a wall, reverses at a ledge, and does not fall off. What it cannot:
 * where exactly Arcade leaves it, which is checked in a browser and nowhere else.
 */
export const testEnemyMove: EnemyMove = (world, e) => {
  const map = world.map;
  let left = false;
  let right = false;

  e.x += e.vx;
  const hitX = solidUnder(map, e.x, e.y, e.w, e.h);
  if (hitX) {
    if (e.vx > 0) {
      e.x = hitX.tx * TILE - e.w;
      right = true;
    } else {
      e.x = (hitX.tx + 1) * TILE;
      left = true;
    }
  }

  e.y += e.vy;
  const hitY = solidUnder(map, e.x, e.y, e.w, e.h);
  if (hitY) {
    e.y = e.vy > 0 ? hitY.ty * TILE - e.h : (hitY.ty + 1) * TILE;
    e.vy = 0;
  }

  return { left, right };
};
