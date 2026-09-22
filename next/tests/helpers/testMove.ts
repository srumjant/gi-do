// A `PlayerMove` for tests. NOT Arcade, and it proves NOTHING about collision.
//
// What the port actually ships is `createPlayerMove` (src/physics/player.ts): a real
// Arcade body, separated against a real tilemap layer. That cannot be constructed under
// Vitest at all — Phaser reads `navigator`, then `window`, then a canvas while its module
// body runs (see tests/physics.test.ts's own note), so importing it here throws before a
// single assertion runs. Without SOME mover injected, `stepPlayer` leaves the player
// exactly where it found it, and every test about what happens AFTER the player is
// somewhere — landing, walking off a ledge, falling into a pit — has nothing to say.
//
// So this exists to get the player from one place to another, and for no other reason.
// It is the most obvious thing that works: integrate, push out of any solid tile it ended
// up inside, zero the velocity on the blocked axis, set `onGround`. That is the SHAPE of
// what the live game did (index.html:1404-1422) but deliberately not the DETAIL of it —
// no 2px X probes, no 3px Y probes, no `+1` in the rightward snap — and it is not the
// detail of what Arcade does either, which puts the body flush and grounds it on any
// overlap at all.
//
// Read that as the warning it is:
//
//   - A test that asserts a POSITION resolved by this helper is asserting what this
//     helper does. There is one shipped answer to "where does the player end up against
//     a wall, a ledge or a block", it is Arcade's, and it is checked in a browser — see
//     the commit for plan 7, task 2, and PLAYTEST.md.
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
