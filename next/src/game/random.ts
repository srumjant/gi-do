/**
 * The simulation's one source of randomness.
 *
 * The live game calls `Math.random()` directly from three places this port simulates:
 * a bat/icebat's `sineOffset` at spawn (index.html:1217), the `enemySkipChance` roll in
 * the streaming spawn window (index.html:1359), and the silly power-up's type draw
 * (index.html:1150). All three route through here instead, so the golden trace suite can
 * point the port at the exact value the live driver's sandboxed `Math.random` already
 * resolves to (tests/helpers/liveGame.ts stubs it to a constant 0.5) and have both sides
 * draw the identical number.
 *
 * Deliberately NOT a seeded PRNG. The live stub is a constant, not a sequence, so
 * matching it only ever needs a constant back — a reproducible sequence of DIFFERENT
 * numbers would be a different function than the one under test, not a better one.
 *
 * Production leaves this at `Math.random`, so nothing about the shipped game changes by
 * having the seam here rather than at the three call sites.
 */
let randomSource: () => number = Math.random;

/** The seam itself. Call this anywhere the live source calls `Math.random()`. */
export function random(): number {
  return randomSource();
}

/** Test seam for `randomSource` above — production code never calls this. */
export function setRandom(fn: () => number): void {
  randomSource = fn;
}
