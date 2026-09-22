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
  /**
   * Rising edge of the fire keys (index.html:1392). There is no held `fire` beside it,
   * on purpose: the live game reads the fire keys through `justPressed` and NEVER
   * through `keys`, so holding the button down fires exactly one arrow. Jump is the
   * other way round — it needs both, because the variable-height cut reads the HELD
   * state — which is why that one has two fields here and this one has a single field.
   */
  firePressed: boolean;
}

export function emptyInput(): InputState {
  return { left: false, right: false, jump: false, jumpPressed: false, firePressed: false };
}
