import Phaser from 'phaser';
import { isCarriedHold, type TrackedKey, trackKey } from './edges';
import { createPadSource, type PadCode, type PadSource } from './gamepad';

/**
 * The keys a menu reads, as opposed to the keys the game reads.
 *
 * `createControls` next door produces an `InputState` per fixed simulation step, with held
 * flags and hand-rolled rising edges, because that is what the physics wants. A menu wants
 * none of it: there is no simulation, nothing is held, and every key press is one event.
 * So this is a separate, much smaller thing rather than a variation on that one.
 *
 * The live game accepts arrows or WASD on every menu (index.html:1332-1343 reads
 * `ArrowLeft||KeyA` and so on), Space or Enter to confirm (:1334) and Escape to go back
 * (`handleBack`, :1259-1272). All of them are here; a scene ignores the ones it has no
 * use for.
 *
 * ## The controller is in here too
 *
 * A pad button IS a key press in the live game — `pollGamepad` writes into the very same
 * `justPressed` map the keyboard listeners write into (index.html:3119) — so the pad
 * arrives on a menu by contributing to the key it synthesises, not by being a second thing
 * every screen has to remember to ask. Which button reaches which field is therefore
 * decided entirely by the live button map (gamepad.ts's `buttonCode`, index.html:3100-3111)
 * and is worth reading off:
 *
 *   - `confirm` is Space, so button 0 (Ⓐ / ✕) confirms every screen that reads Space —
 *     including the game-over and win screens, which read Space ALONE and therefore do not
 *     take Start. That is live behaviour falling out of the mapping, not a decision made here.
 *   - `enter` is Enter, which only button 9 (Start / OPTIONS) reaches, and only in a menu.
 *   - `back` is Escape, from buttons 1 (Ⓑ / ○) and 8 (Select / SHARE).
 *   - the four directions come from the d-pad and from the left stick past its deadzone.
 *   - `altLeft` and the other WASD spellings get nothing: no pad button synthesises a
 *     letter key, so they stay purely keyboard.
 */
export interface MenuKey {
  /** True on the frame this was pressed, from either source, and only that frame. */
  pressed(): boolean;
}

export interface MenuKeys {
  left: MenuKey;
  altLeft: MenuKey;
  right: MenuKey;
  altRight: MenuKey;
  up: MenuKey;
  altUp: MenuKey;
  down: MenuKey;
  altDown: MenuKey;
  confirm: MenuKey;
  enter: MenuKey;
  back: MenuKey;
}

export function bindMenuKeys(scene: Phaser.Scene): MenuKeys {
  const kb = scene.input.keyboard;
  const { LEFT, RIGHT, UP, DOWN, A, D, W, S, SPACE, ENTER, ESC } = Phaser.Input.Keyboard.KeyCodes;
  // One source per screen, made here: it refreshes as it is built, which is what stops a
  // button held through a screen change from confirming the next screen. See gamepad.ts.
  const pad = createPadSource('menu');
  const bind = (keyCode: number, code?: PadCode): MenuKey =>
    menuKey(kb?.addKey(keyCode), pad, code && trackKey(pad.key(code)));

  return {
    left: bind(LEFT, 'ArrowLeft'),
    altLeft: bind(A),
    right: bind(RIGHT, 'ArrowRight'),
    altRight: bind(D),
    up: bind(UP, 'ArrowUp'),
    altUp: bind(W),
    down: bind(DOWN, 'ArrowDown'),
    altDown: bind(S),
    confirm: bind(SPACE, 'Space'),
    enter: bind(ENTER, 'Enter'),
    back: bind(ESC, 'Escape'),
  };
}

/**
 * One menu key: the keyboard key that spells it, and the pad button that synthesises it.
 *
 * The keyboard half is the live game's `justPressed`, which its listener (index.html:1077)
 * sets only `if(!keys[e.code])` — so holding an arrow moves a menu cursor ONCE, not once
 * per auto-repeat the operating system sends. Phaser's `Key` applies the same guard before
 * it arms `JustDown`, so the two agree without either having to know about the other.
 *
 * With one exception, which is what `isCarriedHold` is doing here: Phaser's guard is per
 * SCENE, because the Key is, while the live game's is per game. A key still held when a
 * screen hands over to the next one is new to the next screen's Keys, and the first
 * auto-repeat then arms `JustDown` on a press nobody made — a held Space on the difficulty
 * screen confirmed the character screen half a second later, all by itself.
 *
 * `JustDown` is consumed by reading it, so it is read first and judged afterwards; a key
 * left unread stays armed. (`createControls` avoids `JustDown` entirely, for the opposite
 * reason: the game scene runs a variable number of fixed steps per rendered frame, so a
 * consumed-on-read edge could land on the wrong one. A menu runs exactly once per rendered
 * frame and has no such problem.)
 *
 * The pad half goes through `trackKey`, the same rising-edge code the simulation uses,
 * because a pad has no events to arm anything with — a press is a button that is down now
 * and was not at the previous read. Which makes `pressed()` once-per-frame-per-field by
 * construction: call it twice in one frame and the second call reports nothing, exactly as
 * a second `JustDown` would.
 *
 * Both halves are evaluated every call, never short-circuited, for the reason `pressedAny`
 * gives below: an unread edge on either side is an edge that fires on some later frame
 * nobody pressed anything.
 */
function menuKey(
  key: Phaser.Input.Keyboard.Key | undefined,
  source: PadSource,
  padKey: TrackedKey | undefined,
): MenuKey {
  return {
    pressed(): boolean {
      const fromKeyboard =
        key !== undefined && Phaser.Input.Keyboard.JustDown(key) && !isCarriedHold(key);
      let fromPad = false;
      if (padKey !== undefined) {
        source.refresh();
        fromPad = padKey.poll().pressed;
      }
      return fromKeyboard || fromPad;
    },
  };
}

/** True on the frame this key went down, and only that frame. */
export function justDown(key: MenuKey | undefined): boolean {
  return key !== undefined && key.pressed();
}

/** Either spelling of a direction, or of confirm. */
export function pressedAny(...keys: (MenuKey | undefined)[]): boolean {
  // Every key is polled, not short-circuited: an edge is consumed by reading it, and a key
  // left unread stays armed and fires on some later frame the child did not press it.
  return keys.map(justDown).some(Boolean);
}
