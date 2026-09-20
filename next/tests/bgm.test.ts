import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext } from './helpers/fakeAudio';
import { setAudioContext } from '../src/audio/context';
import { startBGM, stopBGM, getCurrentTheme } from '../src/audio/bgm';
import { BGM_TITLE } from '../src/data/bgmThemes';

let fake: FakeAudioContext;

beforeEach(() => {
  vi.useFakeTimers();
  fake = new FakeAudioContext();
  setAudioContext(fake as unknown as AudioContext);
});

afterEach(() => {
  stopBGM();
  vi.useRealTimers();
});

describe('BGM scheduler', () => {
  it('schedules notes ahead of the clock, not on it', () => {
    startBGM(0);
    expect(fake.oscillators.length).toBeGreaterThan(0);
    // Every note is placed in the future — that is the point of a lookahead scheduler.
    for (const osc of fake.oscillators) {
      expect(osc.started).not.toBeNull();
      expect(osc.started!).toBeGreaterThanOrEqual(fake.currentTime);
    }
  });

  it('schedules a bounded window rather than the whole song', () => {
    startBGM(0);
    const horizon = Math.max(...fake.oscillators.map((o) => o.started ?? 0));
    // The window is 400ms plus at most one step. The slowest theme steps every
    // 800ms, so 2s is a safe ceiling for any theme — while a whole track runs ~37s,
    // which is what this test exists to rule out.
    expect(horizon).toBeLessThan(fake.currentTime + 2);
  });

  it('schedules more notes as the clock advances', () => {
    startBGM(0);
    const first = fake.oscillators.length;
    fake.advance(0.5);
    vi.advanceTimersByTime(200);
    expect(fake.oscillators.length).toBeGreaterThan(first);
  });

  it('reports which theme is playing', () => {
    startBGM(BGM_TITLE);
    expect(getCurrentTheme()).toBe(BGM_TITLE);
  });

  it('stops scheduling after stopBGM', () => {
    startBGM(0);
    stopBGM();
    const atStop = fake.oscillators.length;
    fake.advance(1);
    vi.advanceTimersByTime(1000);
    expect(fake.oscillators.length).toBe(atStop);
    expect(getCurrentTheme()).toBe(-1);
  });

  // Switching level mid-window must not leave the previous theme's timer alive and
  // scheduling notes underneath the new one. Exactly one scheduler is ever pending.
  it('does not leave the old theme scheduling when switched', () => {
    startBGM(0);
    expect(vi.getTimerCount()).toBe(1);
    startBGM(1);
    expect(getCurrentTheme()).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('does nothing without an audio context', () => {
    setAudioContext(null);
    expect(() => startBGM(0)).not.toThrow();
    vi.advanceTimersByTime(500);
    expect(fake.oscillators.length).toBe(0);
  });
});
