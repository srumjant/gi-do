// A TYPE import, exactly as in physics/player.ts and physics/tiles.ts next door, and for
// the same reason: everything below hangs off objects the scene hands us, so nothing here
// needs a Phaser VALUE and the import erases at compile time.
import type Phaser from 'phaser';
import type { EnemyMove } from '../game/enemy';
import type { EnemyState, World } from '../game/types';
import { PX_PER_FRAME_TO_PX_PER_SECOND, stepBodyAlone } from './body';

/** A patroller's body and the collider that separates it, kept together so both can go. */
interface HeldBody {
  readonly body: Phaser.Physics.Arcade.Body;
  readonly collider: Phaser.Physics.Arcade.Collider;
}

/**
 * The enemies' Arcade bodies: the mover the simulation is handed, and the sweep that
 * throws away the bodies of enemies that are no longer in the world.
 */
export interface EnemyBodies {
  readonly move: EnemyMove;
  /**
   * Drops the body of every enemy that has left `world.enemies`. Called once per fixed
   * simulation step, after the step — see the reap below for why that is not optional.
   */
  readonly reap: () => void;
}

/**
 * Puts the ground patrols on Arcade bodies, and hands back the `move` that `stepEnemy`
 * calls in place of the `e.y += e.vy`, floor snap, `e.x += e.vx` and wall probe it used to
 * run itself (index.html:1527-1528, :1538).
 *
 * **A body is a separator, not a home**, exactly as it is for the player (physics/player.ts
 * says the same thing at more length). `world.enemies` stays the single source of truth;
 * every step writes `e.x/e.y/e.vx/e.vy` into the body, takes one Arcade step, and reads
 * back what came out. `e.vx` is the one thing NOT read back — see EnemyMove in game/enemy.ts
 * for why, since it is the whole reason the wall reversal is a returned flag rather than a
 * velocity.
 *
 * **The lifecycle is the real work here, and it is the part the player did not have.**
 * The player is one object that lives as long as the scene: `createPlayerMove` builds its
 * body once and never thinks about it again. Enemies stream in as the camera advances
 * (`spawnEnemiesInView` in world.ts), change type in mid-air when a chicken ray hits them
 * (`chickenify`), and are thrown away wholesale on a death (`respawnLevel` assigns a fresh
 * empty `world.enemies`). So:
 *
 *   - **Bodies are acquired lazily, on the first step an enemy is asked to take.** Nothing
 *     here has a list of which types get bodies, and nothing needs one: `stepEnemy` calls
 *     `move` only from its ground-patrol branch, so being asked to move IS the definition
 *     of needing a body. A bat is never asked and never gets one. A bat that a chicken ray
 *     converts is asked on the very next step — `chickenify` clears `noGravity`, rewrites
 *     the type and resizes it, all before `stepEnemies` reaches it in the same frame — and
 *     acquires one then, at its new chicken size, with no special case anywhere.
 *   - **Bodies are dropped by `reap`,** which is the other half and is not optional. A body
 *     whose enemy has gone is not inert: Arcade still holds it, still steps it, and still
 *     separates it against the level. Leave them behind and every death adds another set of
 *     invisible colliders to a level the children are still playing in.
 *
 * Keyed by the EnemyState object itself rather than by an id, because the simulation has no
 * ids and does not need any: `respawnLevel` builds brand-new state objects, so old keys can
 * never collide with new ones, and a `Map` holding a reference to an enemy the world has
 * dropped is exactly the thing `reap` exists to find.
 */
export function createEnemyBodies(
  scene: Phaser.Scene,
  world: World,
  collisionLayer: Phaser.Tilemaps.TilemapLayer,
): EnemyBodies {
  const physics = scene.physics;
  const held = new Map<EnemyState, HeldBody>();

  function acquire(e: EnemyState): Phaser.Physics.Arcade.Body {
    const existing = held.get(e);
    if (existing) return existing.body;

    // A STANDALONE body, for the same two reasons the player's is one (physics/player.ts):
    // a body with a Game Object re-reads its position FROM that object every step, which
    // would make the drawn image an input to the physics instead of an output of it; and
    // an enemy is drawn by an image that swaps texture with its walk frame and is squashed
    // flat when stomped (SliceScene's syncEnemyImage), none of which is the hitbox.
    //
    // The size is the enemy's own `w`/`h`, derived in spawnEnemy from the sprite grid at
    // ENEMY_SCALE — so the body IS the hitbox the stomp box and the arrows are tested
    // against, and `body.position` is `e.x, e.y` with no offset to remember. Fractional
    // sizes (a doll is 14.4 x 16.2) are fine: Arcade separates on the real edges.
    const body = physics.add.body(e.x, e.y, e.w, e.h);
    body.allowGravity = false;
    // `collideWorldBounds` stays OFF, which is the opposite of the player's. The live
    // left clamp is the player's alone (index.html:1422); an enemy walked off the left
    // edge of the world walks off it, and a ground patroller with no tile underneath keeps
    // falling. Nothing in level 1 arranges that, and it is not this task's job to invent a
    // rule the original does not have.
    const collider = physics.add.collider(body, collisionLayer);
    // `physics.add.body` hands the body to the world, and the world switches it on. Off
    // again, immediately — see stepBodyAlone in physics/body.ts. Until its own step, this
    // body must not be moved by anyone else's.
    body.enable = false;
    held.set(e, { body, collider });
    return body;
  }

  const move: EnemyMove = (_w, e) => {
    const body = acquire(e);

    // A chicken ray rewrites the size of whatever it hits (`chickenify`), so a doll can
    // become a 14.4 x 12.6 bird with a body still shaped like a doll. An enemy CONVERTED
    // from a bat acquires its body above already at the right size; one converted from a
    // ground patroller has to be resized here. `false` keeps the offset alone, as with the
    // player: there is no Game Object for Arcade to centre the box inside.
    if (body.width !== e.w || body.height !== e.h) {
      body.setSize(e.w, e.h, false);
    }

    body.position.set(e.x, e.y);
    body.velocity.set(
      e.vx * PX_PER_FRAME_TO_PX_PER_SECOND,
      e.vy * PX_PER_FRAME_TO_PX_PER_SECOND,
    );

    stepBodyAlone(physics.world, body);

    e.x = body.x;
    e.y = body.y;
    // `vy` is read back and `vx` is not, and that asymmetry is the contract — EnemyMove in
    // game/enemy.ts. Arcade zeroes the velocity on whatever axis it separated, and zeroing
    // `vy` on a landing is precisely what the live floor snap did, while zeroing `vx`
    // against a wall would leave the patrol with nothing to reverse.
    e.vy = body.velocity.y / PX_PER_FRAME_TO_PX_PER_SECOND;

    return { left: body.blocked.left, right: body.blocked.right };
  };

  const reap = (): void => {
    if (held.size === 0) return;
    const alive = new Set(world.enemies);
    for (const [e, entry] of held) {
      if (alive.has(e)) continue;
      physics.world.removeCollider(entry.collider);
      physics.world.remove(entry.body);
      held.delete(e);
    }
  };

  return { move, reap };
}
