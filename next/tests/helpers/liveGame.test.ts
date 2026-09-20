import { describe, expect, it } from 'vitest';
import { driveLiveGame } from './liveGame';

describe('live game driver', () => {
  it('runs a level and returns one sample per frame', () => {
    const trace = driveLiveGame({
      level: 0,
      difficulty: 'normal',
      character: 'gigi',
      frames: 20,
      input: () => ({ left: false, right: true, jump: false }),
    });
    expect(trace.length).toBe(20);
    expect(trace[0]).toHaveProperty('x');
    expect(trace[0]).toHaveProperty('vy');
  });

  it('accelerates right up to the difficulty speed cap', () => {
    const trace = driveLiveGame({
      level: 0, difficulty: 'normal', character: 'gigi', frames: 30,
      input: () => ({ left: false, right: true, jump: false }),
    });
    expect(trace[29].vx).toBeCloseTo(2.5, 5); // DIFFICULTY_CONFIG.normal.playerSpeed
    expect(trace[29].x).toBeGreaterThan(trace[0].x);
  });

  it('is deterministic — the same script twice gives the same trace', () => {
    const script = {
      level: 0, difficulty: 'normal' as const, character: 'gigi' as const, frames: 60,
      input: (f: number) => ({ left: false, right: true, jump: f >= 20 && f < 30 }),
    };
    expect(driveLiveGame(script)).toEqual(driveLiveGame(script));
  });

  it('jumps when told to, and comes back down', () => {
    const trace = driveLiveGame({
      level: 0, difficulty: 'normal', character: 'gigi', frames: 60,
      input: (f) => ({ left: false, right: false, jump: f >= 10 && f < 25 }),
    });
    const apex = Math.min(...trace.map((s) => s.y));
    expect(apex).toBeLessThan(trace[0].y);            // it went up
    expect(trace[59].y).toBeGreaterThan(apex);        // and came back down
    expect(trace[59].onGround).toBe(true);
  });
});
