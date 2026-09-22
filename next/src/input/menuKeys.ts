import Phaser from 'phaser';

/**
 * The keys a menu reads, as opposed to the keys the game reads.
 *
 * `createKeyboardInput` next door produces an `InputState` per fixed simulation step,
 * with held flags and hand-rolled rising edges, because that is what the physics wants.
 * A menu wants none of it: there is no simulation, nothing is held, and every key press
 * is one event. So this is a separate, much smaller thing rather than a variation on
 * that one.
 *
 * The live game accepts arrows or WASD on every menu (index.html:1332-1343 reads
 * `ArrowLeft||KeyA` and so on), Space or Enter to confirm (:1334) and Escape to go back
 * (`handleBack`, :1259-1272). All of them are here; a scene ignores the ones it has no
 * use for.
 */
export interface MenuKeys {
  left: Phaser.Input.Keyboard.Key | undefined;
  altLeft: Phaser.Input.Keyboard.Key | undefined;
  right: Phaser.Input.Keyboard.Key | undefined;
  altRight: Phaser.Input.Keyboard.Key | undefined;
  up: Phaser.Input.Keyboard.Key | undefined;
  altUp: Phaser.Input.Keyboard.Key | undefined;
  down: Phaser.Input.Keyboard.Key | undefined;
  altDown: Phaser.Input.Keyboard.Key | undefined;
  confirm: Phaser.Input.Keyboard.Key | undefined;
  enter: Phaser.Input.Keyboard.Key | undefined;
  back: Phaser.Input.Keyboard.Key | undefined;
}

export function bindMenuKeys(scene: Phaser.Scene): MenuKeys {
  const kb = scene.input.keyboard;
  const { LEFT, RIGHT, UP, DOWN, A, D, W, S, SPACE, ENTER, ESC } = Phaser.Input.Keyboard.KeyCodes;
  return {
    left: kb?.addKey(LEFT),
    altLeft: kb?.addKey(A),
    right: kb?.addKey(RIGHT),
    altRight: kb?.addKey(D),
    up: kb?.addKey(UP),
    altUp: kb?.addKey(W),
    down: kb?.addKey(DOWN),
    altDown: kb?.addKey(S),
    confirm: kb?.addKey(SPACE),
    enter: kb?.addKey(ENTER),
    back: kb?.addKey(ESC),
  };
}

/**
 * True on the frame a key went down, and only that frame.
 *
 * This is the live game's `justPressed`, which its listener (index.html:1077) sets only
 * `if(!keys[e.code])` — so holding an arrow moves a menu cursor ONCE, not once per
 * auto-repeat the operating system sends. Phaser's `Key` applies the same guard before
 * it arms `JustDown`, so the two agree without either having to know about the other.
 *
 * `JustDown` is consumed by reading it, which is why nothing below reads a key twice.
 * (`createKeyboardInput` avoids it for the opposite reason: the game scene runs a
 * variable number of fixed steps per rendered frame, so a consumed-on-read edge could
 * land on the wrong one. A menu runs exactly once per rendered frame and has no such
 * problem.)
 */
export function justDown(key: Phaser.Input.Keyboard.Key | undefined): boolean {
  return key !== undefined && Phaser.Input.Keyboard.JustDown(key);
}

/** Either spelling of a direction, or of confirm. */
export function pressedAny(...keys: (Phaser.Input.Keyboard.Key | undefined)[]): boolean {
  // Every key is polled, not short-circuited: JustDown is consumed on read, and a key
  // left unread stays armed and fires on some later frame the child did not press it.
  return keys.map(justDown).some(Boolean);
}
