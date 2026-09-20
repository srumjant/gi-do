/**
 * What the game can be told to do, independent of how. The live game synthesises fake
 * KeyboardEvent codes from three sources and clears them by hand on every early return;
 * this replaces that with one value rebuilt per step.
 */
export interface InputState {
  /** Held this step. */
  left: boolean;
  right: boolean;
  jump: boolean;
  /** Rising edge — true only on the step the button went down. */
  jumpPressed: boolean;
}

export function emptyInput(): InputState {
  return { left: false, right: false, jump: false, jumpPressed: false };
}
