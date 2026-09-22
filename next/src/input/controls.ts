import Phaser from 'phaser';
import type { InputState } from './actions';
import { pollAll, trackKey } from './edges';
import { createPadSource } from './gamepad';
import { createKeyboardInput } from './keyboard';

/**
 * What a level is driven by: the keyboard and the controller, read as one thing.
 *
 * The seam this hangs off already existed — `InputState` is the one value a fixed
 * simulation step is handed, and `createKeyboardInput` was the one thing that produced it.
 * This adds a second producer of the same value and ORs them, rather than teaching the
 * simulation about a second kind of input. `stepWorld` still cannot tell whether a child
 * is on a keyboard or a pad, and never should.
 */
export interface Controls {
  read(): InputState;
}

/**
 * The pad's half, in the play mapping (gamepad.ts's `buttonCode`).
 *
 * Which pad codes land in which group is decided by the live game's own key groups and
 * nothing else — the pad synthesises key codes, so it inherits every key's meaning:
 *
 *   - jump is `Space || ArrowUp || KeyW` (index.html:1376-1377), so button 0 jumps AND SO
 *     DOES D-PAD UP, and so does pushing the stick up. That is live behaviour, not a
 *     convenience added here.
 *   - fire is `KeyX || KeyZ || ShiftRight || ControlRight` (:1392), and buttons 1 and 2
 *     both synthesise `KeyX`, so either of them shoots.
 *   - left and right are `ArrowLeft || KeyA` and `ArrowRight || KeyD` (:1365-1367), which
 *     the d-pad and the stick both reach.
 *
 * `ArrowDown` is deliberately absent: the live game reads it on no gameplay key at all.
 */
function createPadInput(): Controls {
  const pad = createPadSource('play');
  const left = [trackKey(pad.key('ArrowLeft'))];
  const right = [trackKey(pad.key('ArrowRight'))];
  const jump = [trackKey(pad.key('Space')), trackKey(pad.key('ArrowUp'))];
  const fire = [trackKey(pad.key('KeyX'))];

  return {
    read(): InputState {
      // First, so that every tracked key below reads the same instant's hardware.
      pad.refresh();
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

/**
 * Both sources, read once per fixed simulation step, ORed field by field.
 *
 * Both are read every step whatever the other says — no short-circuit anywhere near this.
 * Each tracked key, on either side, keeps its own previous step, and one left unread would
 * compare the step after this one against the step before it. It is the same rule
 * `pollAll` states for the keys within a group, one level up.
 */
export function createControls(scene: Phaser.Scene): Controls {
  const keyboard = createKeyboardInput(scene);
  const pad = createPadInput();
  return {
    read(): InputState {
      const k = keyboard.read();
      const p = pad.read();
      return {
        left: k.left || p.left,
        right: k.right || p.right,
        jump: k.jump || p.jump,
        jumpPressed: k.jumpPressed || p.jumpPressed,
        firePressed: k.firePressed || p.firePressed,
      };
    },
  };
}
