// The clock the timed screens between the levels count on — see src/game/frameClock.ts.
import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../src/config/constants';
import { createFrameClock } from '../src/game/frameClock';

describe('createFrameClock', () => {
  it('counts one frame per STEP_MS however the deltas are chopped up', () => {
    // 60 frames' worth of time, delivered as 60Hz frames, as 120Hz frames, and in one
    // awkward lump that divides evenly into neither.
    const evenly = createFrameClock();
    for (let i = 0; i < 60; i++) evenly.advance(STEP_MS);

    const doubled = createFrameClock();
    for (let i = 0; i < 120; i++) doubled.advance(STEP_MS / 2);

    const ragged = createFrameClock();
    for (let i = 0; i < 100; i++) ragged.advance(10);

    expect([evenly.advance(0), doubled.advance(0), ragged.advance(0)]).toEqual([60, 60, 60]);
  });

  it('a backgrounded tab pauses a cutscene rather than skipping it to the end', () => {
    const clock = createFrameClock();
    // Half a minute away from the tab, handed over in one delta. Without the clamp this
    // would be 1800 frames and every screen in the run loop would exit on the spot.
    expect(clock.advance(30_000)).toBe(5);
  });
});
