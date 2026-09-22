// A TYPE import, exactly as in physics/tiles.ts next door, and for the same reason:
// everything below hangs off objects the scene hands us (`scene.physics.add.body`,
// `world.singleStep`, `body.velocity`), so nothing here needs a Phaser VALUE and the
// import erases at compile time. That is what keeps the two pure helpers at the top of
// this file — the unit conversion and the head-bump row — reachable from
// tests/physics.test.ts, because `import Phaser from 'phaser'` throws outright under
// Vitest's node environment (Phaser reads `navigator`, then `window`, then a canvas,
// while its module body runs; shimming that far means the shim is what is under test).
import type Phaser from 'phaser';
import { STEP_HZ, TILE } from '../config/constants';
import { bumpBlocksAbove, type PlayerMove } from '../game/player';
import type { World } from '../game/types';

/**
 * The whole unit mismatch between this port and Arcade, in one number.
 *
 * Every speed in the game is PER FRAME — `GRAVITY` is 0.4 px a frame, `dc.jumpForce` is
 * -7.5 px a frame, `dc.playerSpeed` is 2.6 — because index.html integrates straight off
 * its own frame loop and this port carries the same arithmetic. Arcade integrates in
 * SECONDS: `position += velocity * delta`, with `delta` in seconds. The simulation runs
 * at exactly STEP_HZ, so one frame is 1/STEP_HZ of a second and a velocity of `v` px a
 * frame is `v * STEP_HZ` px a second.
 *
 * Multiplying in and dividing back out costs at most one ulp a step, which is around
 * 1e-14 px over a whole jump — far below the point where anything can see it. The
 * alternative, setting Arcade's own clock to one step per second so that its "seconds"
 * ARE our frames and the conversion disappears, was considered and rejected: it makes
 * `body.velocity` mean something no Phaser reader would expect, and it would mislead
 * whoever adds the next body.
 */
export const PX_PER_FRAME_TO_PX_PER_SECOND = STEP_HZ;

/**
 * Which tile row a head-first hit landed on, given the body's top edge AFTER Arcade has
 * separated it.
 *
 * The live game reads the block row off the head's position BEFORE the snap
 * (index.html:1417-1418: `hY` is captured, then `p.y` is moved down to the tile's bottom
 * edge, and `hy` is floored from the OLD value). Arcade has no equivalent: separation has
 * already happened by the time we see the body, and `ProcessTileSeparationY` leaves
 * `body.y` exactly on the tile's bottom edge — an exact multiple of TILE, since the
 * collision layer sits at the origin at scale 1. That edge floors to the row BELOW the
 * block, so the block is one row up.
 *
 * Kept as a named function with its own test rather than inlined, because an off-by-one
 * here does not crash or even look wrong: the blocks simply stop paying out.
 */
export function headTileRow(bodyTop: number): number {
  return Math.floor(bodyTop / TILE) - 1;
}

/**
 * Puts the player on an Arcade body and hands back the `move` that `stepPlayer` calls in
 * place of the hand-rolled X and Y sweeps it used to run (index.html:1404-1422).
 *
 * **The body is a separator, not a home.** `world.player` stays the single source of
 * truth for everything — position included. Every step pushes `p.x/p.y/p.vx/p.vy` INTO
 * the body, takes one Arcade step, and reads the resolved values back out. That is one
 * assignment more than strictly necessary, and it buys the property that makes the rest
 * of the port keep working: anything that writes the player's position or velocity
 * outside this function is picked up automatically. The cape's pit rescue teleports `p.y`
 * and sets `p.vy = -10` (player.ts); `playerHit` kicks `p.vy` to -4 (enemy contact);
 * `respawnLevel` throws the whole `PlayerState` away and builds a new one at the level's
 * start. None of those know a body exists, and none of them has to.
 *
 * **World gravity is off and `vy` is integrated by hand.** The apex hang applies 0.6
 * gravity while rising and 1.2 while falling (index.html:1400-1403), which is a per-frame
 * multiplier; Arcade's gravity is a constant and cannot express it. `stepPlayer` still
 * runs that arithmetic and this function only carries the answer across. `allowGravity`
 * is turned off as well as the world's gravity being zero — belt and braces, and it says
 * out loud that the absence is deliberate rather than a value nobody got round to setting.
 *
 * **`onGround` comes from `blocked.down`, and it has to.** Phaser 4 sets `touching.*` in
 * the body-versus-body separator (`SeparateY`) and `blocked.*` in the tile separator
 * (`ProcessTileSeparationY`) — a body standing on a TILEMAP therefore has `touching.down`
 * false forever. Reading `touching.down` here would leave `onGround` permanently false,
 * which is not a subtle breakage: coyote time would never arm, the jump buffer would
 * never fire, and the player could not jump at all. `blocked.down` also covers the world
 * bounds, which is the right answer for the same reason.
 *
 * **The left clamp is Arcade's.** index.html:1422's `if(p.x<0)p.x=0` becomes a
 * left-edge-only world bound. The other three edges are explicitly off: there is no
 * right-hand bound in the live game, no ceiling, and above all no floor — the pit is a
 * `y` threshold that the player has to be able to fall through (index.html:1423, still
 * hand-written in `stepPlayer`).
 */
export function createPlayerMove(
  scene: Phaser.Scene,
  world: World,
  collisionLayer: Phaser.Tilemaps.TilemapLayer,
): PlayerMove {
  const physics = scene.physics;
  const p = world.player;

  // Before the body: `Body#customBoundsRectangle` is captured from `world.bounds` when
  // the body is built. `setBounds` mutates that same Rectangle rather than replacing it,
  // so the order does not strictly matter — but a body built against bounds that are
  // still the canvas's 640x400 default is a trap waiting for the day that changes.
  physics.world.setBounds(
    0,
    0,
    world.level.width * TILE,
    world.level.height * TILE,
    // left, right, up, down. Left alone — see the note above.
    true,
    false,
    false,
    false,
  );

  // A STANDALONE body: no Game Object, no sprite, nothing drawn. Phaser 4 supports this
  // (`Body#isBody` is checked all the way down the collide path, including
  // `collideSpriteVsTilemapLayer`), and it is the right shape here for two reasons. A
  // body with a Game Object re-reads its position FROM that object every step
  // (`Body#preUpdate` -> `updateFromGameObject`), which would make the drawn image an
  // input to the physics instead of an output of it; and the player is drawn by three
  // different images depending on the frame and whether a big head is running
  // (SliceScene's syncPlayer), none of which is the hitbox.
  //
  // The size is the player's own `w`/`h` — 16x24 for Gigi, 16x20 for Dodo, derived in
  // createPlayer from the character's stand sprite (player.ts) — so the body IS the
  // hitbox and `body.position` is `p.x, p.y` with no offset to remember. The sprite is
  // 2px larger on every side; that inset lives in SliceScene's PLAYER_DRAW_INSET, where
  // the drawing is, and deliberately does not appear here.
  const body = physics.add.body(p.x, p.y, p.w, p.h);
  body.allowGravity = false;
  body.setCollideWorldBounds(true);

  // The layer built in physics/tiles.ts, and the only thing the player collides with.
  // Registered as a persistent collider rather than a per-step `physics.collide` call so
  // that it runs INSIDE the Arcade step, between the body moving and the step ending —
  // which is where separation has to happen.
  physics.add.collider(body, collisionLayer);

  return (w: World): void => {
    const player = w.player;

    // A respawn replaces `world.player` wholesale. Same character, so the same size in
    // practice — but the body is the hitbox, and a hitbox that silently kept a previous
    // character's height would be a genuinely horrible bug to find.
    if (body.width !== player.w || body.height !== player.h) {
      body.setSize(player.w, player.h, false);
    }

    body.position.set(player.x, player.y);
    body.velocity.set(
      player.vx * PX_PER_FRAME_TO_PX_PER_SECOND,
      player.vy * PX_PER_FRAME_TO_PX_PER_SECOND,
    );

    // Exactly one Arcade step, with Arcade's own fixed delta. `singleStep` is
    // `update(0, oneFrameInMs)` followed by `postUpdate`, so the body integrates once,
    // the colliders run once, and the accumulated time comes back out to zero — see the
    // fixed-step note in SliceScene.update, which is the whole reason this is called from
    // here rather than left to run itself once per RENDERED frame.
    physics.world.singleStep();

    player.x = body.x;
    player.y = body.y;
    // Arcade only ever zeroes these (bounce, drag and acceleration are all off), so this
    // is reading back the separation, not a new velocity.
    player.vx = body.velocity.x / PX_PER_FRAME_TO_PX_PER_SECOND;
    player.vy = body.velocity.y / PX_PER_FRAME_TO_PX_PER_SECOND;
    player.onGround = body.blocked.down;

    // The head-first block bump (index.html:1417-1420). It used to be a branch of the
    // hand-rolled Y sweep; with Arcade doing the separating, `blocked.up` is the
    // equivalent signal — the tile separator sets it only when the body was RISING
    // (`TileCheckY` tests `deltaY() < 0`), so this cannot fire on a landing or on a
    // sideways scrape. `player.x` is assigned above first, on purpose: bumpBlocksAbove
    // reads the two probe columns off the already-separated x, exactly as the live
    // source reads them off its already-swept x.
    if (body.blocked.up) {
      bumpBlocksAbove(w, headTileRow(body.y));
    }
  };
}
