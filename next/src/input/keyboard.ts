import Phaser from 'phaser';
import type { InputState } from './actions';

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
  const left = kb?.addKey(LEFT);
  const altLeft = kb?.addKey(A);
  const right = kb?.addKey(RIGHT);
  const altRight = kb?.addKey(D);
  const jumpSpace = kb?.addKey(SPACE);
  const jumpUp = kb?.addKey(UP);
  const jumpW = kb?.addKey(W);
  const fireX = kb?.addKey(X);
  const fireZ = kb?.addKey(Z);
  const fireShift = kb?.addKey(SHIFT);
  const fireCtrl = kb?.addKey(CTRL);

  let wasJumpHeld = false;
  let wasFireHeld = false;

  return {
    read(): InputState {
      const leftHeld = isDown(left) || isDown(altLeft);
      const rightHeld = isDown(right) || isDown(altRight);
      const jumpHeld = isDown(jumpSpace) || isDown(jumpUp) || isDown(jumpW);
      const jumpPressed = jumpHeld && !wasJumpHeld;
      wasJumpHeld = jumpHeld;
      const fireHeld = isDown(fireX) || isDown(fireZ)
        || isRightDown(fireShift) || isRightDown(fireCtrl);
      const firePressed = fireHeld && !wasFireHeld;
      wasFireHeld = fireHeld;
      return { left: leftHeld, right: rightHeld, jump: jumpHeld, jumpPressed, firePressed };
    },
  };
}

function isDown(key: Phaser.Input.Keyboard.Key | undefined): boolean {
  return key !== undefined && key.isDown;
}

/** `location` 2 is the right-hand copy of a modifier key; see createKeyboardInput. */
function isRightDown(key: Phaser.Input.Keyboard.Key | undefined): boolean {
  return isDown(key) && key!.location === 2;
}
