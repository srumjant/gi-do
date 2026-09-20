import Phaser from 'phaser';
import type { InputState } from './actions';

const { LEFT, RIGHT, UP, SPACE, A, D, W } = Phaser.Input.Keyboard.KeyCodes;

/** What `createKeyboardInput` hands back: a per-step read of the bound keys. */
export interface KeyboardInput {
  read(): InputState;
}

/**
 * Reads a Phaser scene's keyboard and produces an `InputState`. This is the only
 * Phaser-aware input code in the port — `src/game/` never sees a key.
 *
 * Binds the same keys the live game accepts (index.html:1361-1377): left is ArrowLeft
 * or A, right is ArrowRight or D, jump is Space, ArrowUp or W.
 *
 * `jumpPressed` is the rising edge of the jump keys — true only on the step the button
 * went down. Phaser's `JustDown` helper is consumed on read and tied to Phaser's
 * rendered frame; the scene runs a variable number of fixed simulation steps per
 * rendered frame (see SliceScene's accumulator), so `JustDown` could fire on the wrong
 * step, more than once, or not at all, depending on how many steps land in a frame.
 * Comparing this step's held state to the previous step's instead guarantees the edge
 * lands on exactly one simulation step, because `read()` is called once per fixed
 * step rather than once per rendered frame.
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

  let wasJumpHeld = false;

  return {
    read(): InputState {
      const leftHeld = isDown(left) || isDown(altLeft);
      const rightHeld = isDown(right) || isDown(altRight);
      const jumpHeld = isDown(jumpSpace) || isDown(jumpUp) || isDown(jumpW);
      const jumpPressed = jumpHeld && !wasJumpHeld;
      wasJumpHeld = jumpHeld;
      return { left: leftHeld, right: rightHeld, jump: jumpHeld, jumpPressed };
    },
  };
}

function isDown(key: Phaser.Input.Keyboard.Key | undefined): boolean {
  return key !== undefined && key.isDown;
}
