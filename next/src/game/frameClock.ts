import { STEP_HZ } from '../config/constants';

/**
 * A frame counter that counts at exactly 60Hz however fast the display refreshes.
 *
 * Every timed thing in the live game is a raw frame count advanced once per
 * `requestAnimationFrame`: the between-level cutscene changes phase at `betweenTimer` 130
 * and 220 and leaves at 480 (index.html:1351, :2308-2368), the game-over screen waits 180
 * (:1349) and the win screen 300 (:1352). On a 120Hz laptop all of those arrive twice as
 * fast — the same bug SliceScene's accumulator exists to fix for the simulation, and the one
 * deliberate break from bug-compatibility in the whole migration.
 *
 * A cutscene is the one place where that bug is actually WATCHED, so the screens between the
 * levels count frames through this rather than adding one per rendered frame, and they run
 * for eight seconds on every machine.
 *
 * Pure, and not a Phaser thing: a scene hands it `delta` and gets back the frame number the
 * live game would be on. Which also makes these screens drivable from a browser console by
 * hand, which is how they get looked at.
 */
export interface FrameClock {
  /**
   * Adds `deltaMs` of real time and returns the whole frames elapsed since the clock was
   * made — the live `betweenTimer` / `stateTimer` equivalent. Returns the same number again
   * until enough time has passed for another frame, so it is safe to call with 0.
   */
  advance(deltaMs: number): number;
}

/**
 * The ceiling on how many frames one call can advance, and the same one SliceScene's
 * accumulator uses, for a reason that matters more here: a backgrounded tab hands the next
 * frame a delta of everything it missed, and without a ceiling half a minute away would
 * arrive as eighteen hundred frames — every screen in the run loop past its exit before it
 * had drawn once. With it, a tab-out pauses a cutscene rather than skipping it.
 */
const MAX_FRAMES_PER_CALL = 5;

const MS_PER_SECOND = 1000;

/**
 * A nanosecond of slack on the frame boundary, and it is arithmetic rather than fudge.
 *
 * A frame is 1000/60 ms, which no binary float holds exactly: sixty of them summed comes to
 * 999.9999999999991, so a full second of perfect 60Hz deltas lands a hair SHORT of frame 60
 * and the cutscene would be one frame behind for no reason anybody could ever see. A
 * millionth of a millisecond is nine orders of magnitude smaller than the frame it is
 * rounding to and eight smaller than any delta a browser reports, so it can only ever close
 * this gap and never open a spurious frame.
 */
const BOUNDARY_SLACK_MS = 1e-6;

export function createFrameClock(): FrameClock {
  let frames = 0;
  let elapsed = 0;
  return {
    advance(deltaMs: number): number {
      elapsed += Math.max(0, deltaMs);
      let stepped = 0;
      // Compared by multiplying rather than by subtracting a frame's length off a running
      // accumulator: the subtraction drifts, and a hundred ragged ten-millisecond deltas —
      // a full second — came to fifty-nine frames instead of sixty. Both sides here are
      // whole milliseconds against whole frames, which is exact for every delta that is a
      // whole number of milliseconds, and `BOUNDARY_SLACK_MS` covers the ones that are not.
      while (
        stepped < MAX_FRAMES_PER_CALL
        && (frames + 1) * MS_PER_SECOND <= (elapsed + BOUNDARY_SLACK_MS) * STEP_HZ
      ) {
        frames++;
        stepped++;
      }
      // Hit the ceiling, so the time that did not become frames is dropped rather than
      // banked: banking it would only fast-forward the next few calls instead.
      if (stepped === MAX_FRAMES_PER_CALL) elapsed = (frames * MS_PER_SECOND) / STEP_HZ;
      return frames;
    },
  };
}
