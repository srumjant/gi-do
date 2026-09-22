/**
 * Turning key state into presses: the rising edges the simulation is driven by, and the
 * rule that keeps a key held over from the screen before from counting as one.
 *
 * No Phaser here, deliberately — a Phaser `Key` satisfies `ReadableKey` structurally, so
 * `createKeyboardInput` hands its Keys straight in, and everything below can be tested
 * without a browser or a canvas. Which matters, because what is below is precisely the
 * code that opened every run with the player jumping on its own.
 */

/** The three fields of a Phaser `Key` this module reads. The real Key satisfies it. */
export interface ReadableKey {
  isDown: boolean;
  /** 2 is the right-hand copy of a modifier key (see `isRightDown`). */
  location: number;
  /** The last DOM event the key saw — undefined until it has seen one. */
  originalEvent?: KeyboardEvent;
}

/** What one key, or one set of keys meaning the same thing, is doing this step. */
export interface KeyRead {
  down: boolean;
  /** Went down this step, by a press made while this scene was running. */
  pressed: boolean;
}

/** One bound key, plus the single step of memory its rising edge is computed from. */
export interface TrackedKey {
  /** Reads the key and advances that memory: call exactly once per fixed step. */
  poll(): KeyRead;
}

/**
 * Was this key already being held down before the scene that bound it existed?
 *
 * The problem it solves: confirming the character screen with Space starts SliceScene
 * while Space is still down, and the level then began with the player jumping on its own.
 * The live game does not have this bug — its `keys` map is a pair of window listeners
 * living outside every screen (index.html:1075-1080), and its `justPressed[e.code]` is set
 * only `if(!keys[e.code])`, so a key held across a screen change is simply already down
 * and produces no press. Phaser's `Key` objects, by contrast, belong to a scene's keyboard
 * plugin: the new scene makes its own, they start up, and they know nothing of what the
 * hand is doing until an event arrives.
 *
 * Which is why seeding the previous step's input state at scene start does NOT fix it,
 * obvious though that fix looks. At `create()` time the fresh Key reports `isDown ===
 * false` however hard the key is being held, so there is no held state to seed FROM. What
 * actually happens is that the operating system's auto-repeat sends another `keydown` half
 * a second later; Phaser's Key, which thinks the key is up, treats that as the key going
 * down (`Key.onDown` flips `isDown` whenever it is false); and the rising edge — held now,
 * not held last step — fires. Hence a jump at the start of every run, and hence a held
 * Space on the difficulty screen skipping the character screen half a second later.
 *
 * The one thing that distinguishes that from a real press is the browser's own `repeat`
 * flag. A press a child actually makes always begins with a `keydown` whose `repeat` is
 * false; only a key that was ALREADY down can have its first observed event be a repeat.
 * So: an edge whose event is a repeat is not a press.
 *
 * Asked at the edge and nowhere else, because `originalEvent` is simply the last event the
 * Key saw: for a key held legitimately since a real press it turns into a repeat event
 * too, half a second in, and by then there is no edge left to suppress.
 */
export function isCarriedHold(key: ReadableKey | undefined): boolean {
  return key?.originalEvent?.repeat === true;
}

export function isDown(key: ReadableKey | undefined): boolean {
  return key !== undefined && key.isDown;
}

/**
 * `location` 2 is the right-hand copy of a modifier key. The live game names `ShiftRight`
 * and `ControlRight` specifically and the left ones do nothing; Phaser's key codes do not
 * distinguish the two sides, so the side is checked here instead — see createKeyboardInput.
 */
export function isRightDown(key: ReadableKey | undefined): boolean {
  return isDown(key) && key!.location === 2;
}

export function trackKey(
  key: ReadableKey | undefined,
  held: (key: ReadableKey | undefined) => boolean = isDown,
): TrackedKey {
  // Seeded from the key ITSELF rather than from `false`, which is the gamepad's whole
  // answer to the carried-hold problem above.
  //
  // For a Phaser Key this changes nothing and cannot: a Key made moments ago in `create()`
  // reports `isDown === false` however hard the key is being held, which is precisely why
  // `isCarriedHold` has to exist for the keyboard. For a pad button it is the entire fix —
  // `navigator.getGamepads()` answers what is held right now, so a button still down from
  // the screen before starts out already down here and produces no edge. See
  // `createPadSource` in gamepad.ts.
  let wasDown = held(key);
  return {
    poll(): KeyRead {
      const down = held(key);
      const pressed = down && !wasDown && !isCarriedHold(key);
      wasDown = down;
      return { down, pressed };
    },
  };
}

/** The keys that mean one thing, read together. */
export function pollAll(keys: TrackedKey[]): KeyRead {
  // Every key is polled, not short-circuited: each keeps its own previous step, and one
  // left unread would compare the step after this against the step before it.
  const reads = keys.map((key) => key.poll());
  return {
    down: reads.some((read) => read.down),
    pressed: reads.some((read) => read.pressed),
  };
}
