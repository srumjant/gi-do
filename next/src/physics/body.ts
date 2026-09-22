// A TYPE import, exactly as in physics/player.ts and physics/tiles.ts next door, and for
// the same reason: everything below hangs off objects the scene hands us, so nothing here
// needs a Phaser VALUE and the import erases at compile time. That is what keeps
// PX_PER_FRAME_TO_PX_PER_SECOND reachable from tests/physics.test.ts, because
// `import Phaser from 'phaser'` throws outright under Vitest's node environment.
import type Phaser from 'phaser';
import { STEP_HZ } from '../config/constants';

/**
 * The whole unit mismatch between this port and Arcade, in one number.
 *
 * Every speed in the game is PER FRAME — `GRAVITY` is 0.4 px a frame, `dc.jumpForce` is
 * -7.5 px a frame, `dc.playerSpeed` is 2.6, an enemy patrols at 0.8 — because index.html
 * integrates straight off its own frame loop and this port carries the same arithmetic.
 * Arcade integrates in SECONDS: `position += velocity * delta`, with `delta` in seconds.
 * The simulation runs at exactly STEP_HZ, so one frame is 1/STEP_HZ of a second and a
 * velocity of `v` px a frame is `v * STEP_HZ` px a second.
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
 * One Arcade step, for ONE body, with every other body in the world left exactly where it
 * was. Every mover in src/physics/ moves its body through here and through nothing else.
 *
 * **Why this exists.** `physics.world.singleStep()` is not a step of one body; it is a step
 * of the WORLD. It walks `world.bodies` and integrates and separates every one of them
 * (Phaser's World.update, and World.step under it). While the player was the only body in
 * the port that did not matter, and `createPlayerMove` could simply call it. It stopped
 * being true the moment the ground patrols got bodies of their own: the player's own step
 * would have moved all eight enemies as a side effect, and then each enemy's step would
 * have moved the player and all the other enemies again — nine integrations per body per
 * frame instead of one, which is the 120Hz double-speed bug back again and multiplied.
 *
 * **How.** A body in this port RESTS DISABLED. `body.enable` is the flag Arcade already
 * checks before it touches a body at all — in `World.update`, in `World.step`, in
 * `World.postUpdate`, and at the top of `collideSpriteVsTilemapLayer`, so a resting body's
 * collider costs an early return and nothing more. Switching exactly one body on for
 * exactly the duration of one `singleStep` therefore steps exactly that body. The cost is
 * one `singleStep` per bodied entity per simulation step rather than one for the lot, and
 * what that buys back is that the simulation's own order is untouched: `stepPlayer` still
 * resolves the player before `stepEnemies` runs, and each enemy still resolves before the
 * next one's stomp box is tested, exactly as index.html's `enemies.forEach` does.
 *
 * What did NOT change, and must not: Arcade is still stepped once per FIXED SIMULATION
 * step and never once per rendered frame (`customUpdate: true` in main.ts, and
 * SliceScene's accumulator). That is the rule that keeps the game from running at double
 * speed on a 120Hz screen, and every body still integrates exactly once per fixed step.
 */
export function stepBodyAlone(
  world: Phaser.Physics.Arcade.World,
  body: Phaser.Physics.Arcade.Body,
): void {
  body.enable = true;
  world.singleStep();
  body.enable = false;
}
