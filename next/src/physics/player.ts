// A TYPE import, as in physics/tiles.ts: everything here hangs off objects the scene hands
// us, so nothing needs a Phaser VALUE, and headTileRow below stays reachable from
// tests/physics.test.ts (Phaser cannot be imported under Vitest at all).
import type Phaser from 'phaser';
import { TILE } from '../config/constants';
import { bumpBlocksAbove, type PlayerMove } from '../game/player';
import type { PlayerState, World } from '../game/types';
import { PX_PER_FRAME_TO_PX_PER_SECOND, stepBodyAlone } from './body';

/**
 * Which tile row a head-first hit landed on, given the body's top edge AFTER Arcade has
 * separated it.
 *
 * The live game reads the block row off the head's position BEFORE the snap
 * (index.html:1417-1418). Arcade has already separated the body by the time we see it, and
 * `ProcessTileSeparationY` leaves `body.y` exactly on the tile's bottom edge — an exact
 * multiple of TILE, since the layer sits at the origin at scale 1. That edge floors to the
 * row BELOW the block, so the block is one row up.
 *
 * Kept as a named function with its own test, because an off-by-one here does not crash
 * or even look wrong: the blocks simply stop paying out.
 */
export function headTileRow(bodyTop: number): number {
  return Math.floor(bodyTop / TILE) - 1;
}

/** The world's size, and which of its four edges stop the body. */
export interface WorldEdges {
  width: number;
  height: number;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export interface BodyMoverOptions {
  /** The layer the body collides with. The only thing it collides with. */
  layer: Phaser.Tilemaps.TilemapLayer;
  /** World bounds to set; left out, the world's bounds are not touched and not used. */
  edges?: WorldEdges;
  /**
   * Called for every tile Arcade separated the body from during the step, with that tile.
   * Arcade calls it AFTER the separation, so `blocked.*` already says which way.
   */
  onTile?: (tile: Phaser.Tilemaps.Tile) => void;
}

/** What one step found out that the player state cannot hold. */
export interface MoveReport {
  /** Stopped from above this step: a head hit. */
  blockedUp: boolean;
}

export type BodyMover = (p: PlayerState) => MoveReport;

/**
 * Puts a player on an Arcade body and returns the function that moves it one fixed step.
 *
 * **The body is a separator, not a home.** The player state stays the single source of
 * truth: every step pushes `x/y/vx/vy` INTO the body, takes one Arcade step, and reads the
 * resolved values back. Anything that writes the player's position or velocity elsewhere —
 * a respawn, a cape's pit rescue, a learn-mode spring — is picked up automatically.
 *
 * **World gravity is off and `vy` is integrated by hand** (game/player.ts's stepMotion):
 * the apex hang is a per-frame multiplier Arcade's constant gravity cannot express.
 * `allowGravity` is off as well as the world's gravity being zero, to say out loud that
 * the absence is deliberate.
 *
 * **`onGround` comes from `blocked.down`.** Phaser 4 sets `touching.*` only in the
 * body-versus-body separator; a body standing on a TILEMAP has `touching.down` false
 * forever. `blocked.down` also covers world bounds.
 *
 * **A standalone body**, with no Game Object: a body with one re-reads its position from it
 * every step, which would make the drawn image an input to the physics. The body IS the
 * hitbox, so `body.position` is `p.x, p.y` with no offset.
 *
 * **It rests disabled** and is switched on for exactly its own step (physics/body.ts's
 * stepBodyAlone), so no other body in the world moves with it.
 */
export function createBodyMover(
  scene: Phaser.Scene,
  player: PlayerState,
  options: BodyMoverOptions,
): BodyMover {
  const physics = scene.physics;
  const { edges, onTile } = options;

  // Before the body: its custom bounds rectangle is captured from world.bounds when it is
  // built. setBounds mutates that same Rectangle, so the order does not strictly matter —
  // but a body built against the canvas's 640x400 default is a trap for later.
  if (edges) {
    physics.world.setBounds(0, 0, edges.width, edges.height, edges.left, edges.right, edges.up, edges.down);
  }

  const body = physics.add.body(player.x, player.y, player.w, player.h);
  body.allowGravity = false;
  body.setCollideWorldBounds(edges !== undefined);

  // A persistent collider rather than a per-step physics.collide call, so that it runs
  // INSIDE the Arcade step, between the body moving and the step ending.
  physics.add.collider(
    body,
    options.layer,
    onTile ? (_body, tile) => onTile(tile as Phaser.Tilemaps.Tile) : undefined,
  );

  body.enable = false;

  return (p: PlayerState): MoveReport => {
    // A respawn can replace the player wholesale; a hitbox that kept the old size would be
    // a horrible bug to find.
    if (body.width !== p.w || body.height !== p.h) {
      body.setSize(p.w, p.h, false);
    }
    body.position.set(p.x, p.y);
    body.velocity.set(p.vx * PX_PER_FRAME_TO_PX_PER_SECOND, p.vy * PX_PER_FRAME_TO_PX_PER_SECOND);

    stepBodyAlone(physics.world, body);

    p.x = body.x;
    p.y = body.y;
    // Arcade only ever zeroes these (bounce, drag and acceleration are all off), so this is
    // reading back the separation, not a new velocity.
    p.vx = body.velocity.x / PX_PER_FRAME_TO_PX_PER_SECOND;
    p.vy = body.velocity.y / PX_PER_FRAME_TO_PX_PER_SECOND;
    p.onGround = body.blocked.down;
    return { blockedUp: body.blocked.up };
  };
}

/**
 * The adventure's mover: `createBodyMover` with the level's bounds — the left edge only,
 * because the live game clamps `p.x` at 0 (index.html:1422) and has no right edge, no
 * ceiling and, above all, no floor: the pit is a `y` threshold the player must be able to
 * fall through — plus the head-first `?` block bump (index.html:1417-1420).
 *
 * `blocked.up` is set by the tile separator only when the body was RISING, so the bump
 * cannot fire on a landing or a sideways scrape. `player.x` is already written back when
 * bumpBlocksAbove reads its two probe columns, as the live source reads them off its
 * already-swept x.
 */
export function createPlayerMove(
  scene: Phaser.Scene,
  world: World,
  collisionLayer: Phaser.Tilemaps.TilemapLayer,
): PlayerMove {
  const mover = createBodyMover(scene, world.player, {
    layer: collisionLayer,
    edges: {
      width: world.level.width * TILE,
      height: world.level.height * TILE,
      left: true,
      right: false,
      up: false,
      down: false,
    },
  });
  return (w: World): void => {
    if (mover(w.player).blockedUp) {
      bumpBlocksAbove(w, headTileRow(w.player.y));
    }
  };
}
