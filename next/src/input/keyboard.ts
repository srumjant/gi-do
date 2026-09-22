import Phaser from 'phaser';
import type { InputState } from './actions';
import { isRightDown, pollAll, trackKey } from './edges';

const { LEFT, RIGHT, UP, SPACE, A, D, W, X, Z, SHIFT, CTRL } = Phaser.Input.Keyboard.KeyCodes;

/** What `createKeyboardInput` hands back: a per-step read of the bound keys. */
export interface KeyboardInput {
  read(): InputState;
}

/**
 * Reads a Phaser scene's keyboard and produces an `InputState`. This is the only
 * Phaser-aware input code in the port — `src/game/` never sees a key.
 *
 * Binds the same keys the live game accepts (index.html:1365-1377, 1392): left is
 * ArrowLeft or A, right is ArrowRight or D, jump is Space, ArrowUp or W, and fire is
 * X, Z, RIGHT Shift or RIGHT Ctrl.
 *
 * `jumpPressed` and `firePressed` are rising edges — true only on the step the button
 * went down. Phaser's `JustDown` helper is consumed on read and tied to Phaser's
 * rendered frame; the scene runs a variable number of fixed simulation steps per
 * rendered frame (see SliceScene's accumulator), so `JustDown` could fire on the wrong
 * step, more than once, or not at all, depending on how many steps land in a frame.
 * Comparing this step's held state to the previous step's instead guarantees the edge
 * lands on exactly one simulation step, because `read()` is called once per fixed
 * step rather than once per rendered frame. One mechanism, used twice — a second way
 * of detecting a press would be a second way for it to land on the wrong step.
 *
 * That comparison is made per KEY and the results ORed, which is how the live game reads
 * it too: `justPressed['Space']||justPressed['ArrowUp']||justPressed['KeyW']`
 * (index.html:1377), with the held flag beside it the same OR over `keys` (:1376).
 *
 * An edge has to survive one more test, `isCarriedHold` in edges.ts: a key already held
 * when this scene started must not read as a press. That is not a nicety — it is why the
 * level used to open with the player jumping by itself, having been started by a Space
 * that was still down. The argument is in that file.
 *
 * Fire is the only edge the simulation gets for the four fire keys: the live game
 * consults them through `justPressed` alone, never `keys`, so leaning on the button
 * fires one arrow and no more (see InputState.firePressed).
 *
 * The two modifier keys are the awkward ones. The live game names `ShiftRight` and
 * `ControlRight` specifically — the LEFT ones do nothing — but Phaser's key codes do
 * not distinguish the two sides of a modifier, so the side is checked separately
 * through the Key's own `location` (2 = right), which Phaser copies off the browser's
 * KeyboardEvent. Binding SHIFT/CTRL without that check would make left Shift fire, and
 * left Shift is exactly what a child rests a hand on.
 */
export function createKeyboardInput(scene: Phaser.Scene): KeyboardInput {
  const kb = scene.input.keyboard;
  const left = [trackKey(kb?.addKey(LEFT)), trackKey(kb?.addKey(A))];
  const right = [trackKey(kb?.addKey(RIGHT)), trackKey(kb?.addKey(D))];
  const jump = [trackKey(kb?.addKey(SPACE)), trackKey(kb?.addKey(UP)), trackKey(kb?.addKey(W))];
  const fire = [
    trackKey(kb?.addKey(X)),
    trackKey(kb?.addKey(Z)),
    trackKey(kb?.addKey(SHIFT), isRightDown),
    trackKey(kb?.addKey(CTRL), isRightDown),
  ];

  return {
    read(): InputState {
      const jumpRead = pollAll(jump);
      return {
        left: pollAll(left).down,
        right: pollAll(right).down,
        jump: jumpRead.down,
        jumpPressed: jumpRead.pressed,
        firePressed: pollAll(fire).pressed,
      };
    },
  };
}
