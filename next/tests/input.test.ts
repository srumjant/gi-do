import { describe, expect, it } from 'vitest';
import { isCarriedHold, pollAll, trackKey, type ReadableKey } from '../src/input/edges';

/**
 * A stand-in for a Phaser Key, driven the way Phaser drives the real one: `isDown` flips
 * on a keydown the Key sees, and `originalEvent` is the last event it saw. A keydown the
 * operating system sent because the key is being HELD carries `repeat: true` — which is
 * the only evidence that a key Phaser has just noticed was already down.
 */
function fakeKey(): ReadableKey {
  return { isDown: false, location: 0 };
}

function event(repeat: boolean): KeyboardEvent {
  return { repeat } as KeyboardEvent;
}

/** A press the player made. */
function press(key: ReadableKey): void {
  key.isDown = true;
  key.originalEvent = event(false);
}

/** The operating system's auto-repeat, for a key that has been held for half a second. */
function autoRepeat(key: ReadableKey): void {
  key.isDown = true;
  key.originalEvent = event(true);
}

function release(key: ReadableKey): void {
  key.isDown = false;
  key.originalEvent = event(false);
}

describe('rising edges', () => {
  it('ignores a key held over from the screen before until it is released and pressed again', () => {
    // The story this encodes: the character screen is confirmed with Space, SliceScene
    // starts while Space is still down, and the level used to open with the player
    // jumping on its own half a second later. See isCarriedHold.
    const key = fakeKey();
    const tracked = trackKey(key);
    const pressed: boolean[] = [];

    // The scene starts. Phaser's brand new Key has seen no event, so it reads as up
    // however hard the key is being held — there is nothing here to seed from.
    pressed.push(tracked.poll().pressed);
    // The operating system's first auto-repeat. THIS is the frame the player used to jump.
    autoRepeat(key);
    pressed.push(tracked.poll().pressed);
    pressed.push(tracked.poll().pressed);
    // Let go, and press it properly.
    release(key);
    pressed.push(tracked.poll().pressed);
    press(key);
    pressed.push(tracked.poll().pressed);
    // One step long, however long it is held.
    pressed.push(tracked.poll().pressed);

    expect(pressed).toEqual([false, false, false, false, true, false]);
  });

  it('reports the key as held throughout, carried over or not', () => {
    const key = fakeKey();
    const tracked = trackKey(key);

    expect(tracked.poll().down).toBe(false);
    autoRepeat(key);
    // Suppressing the PRESS does not mean pretending the key is up: the variable jump
    // height reads the held flag, and it should say what the hand is doing.
    expect(tracked.poll().down).toBe(true);
    release(key);
    expect(tracked.poll().down).toBe(false);
  });

  it('makes no second press when a real press starts repeating', () => {
    const key = fakeKey();
    const tracked = trackKey(key);

    press(key);
    expect(tracked.poll()).toEqual({ down: true, pressed: true });
    autoRepeat(key);
    expect(tracked.poll()).toEqual({ down: true, pressed: false });
  });

  it('treats the keys that mean one thing as one key, each with its own edge', () => {
    // Space, ArrowUp and W all jump; the live game ORs their `justPressed` flags
    // (index.html:1377), so pressing a second one while the first is held is a press.
    const space = fakeKey();
    const up = fakeKey();
    const jump = [trackKey(space), trackKey(up)];

    expect(pollAll(jump)).toEqual({ down: false, pressed: false });
    press(space);
    expect(pollAll(jump)).toEqual({ down: true, pressed: true });
    expect(pollAll(jump)).toEqual({ down: true, pressed: false });
    press(up);
    expect(pollAll(jump)).toEqual({ down: true, pressed: true });
    release(space);
    expect(pollAll(jump)).toEqual({ down: true, pressed: false });
  });

  it('calls a hold carried over only when the event that started it was a repeat', () => {
    const fresh = fakeKey();
    const pressed = fakeKey();
    press(pressed);
    const repeated = fakeKey();
    autoRepeat(repeated);

    expect([
      isCarriedHold(undefined),
      isCarriedHold(fresh), // bound, but no event seen yet
      isCarriedHold(pressed),
      isCarriedHold(repeated),
    ]).toEqual([false, false, false, true]);
  });
});
