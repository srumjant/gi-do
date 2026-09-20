import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext } from './helpers/fakeAudio';
import { setAudioContext } from '../src/audio/context';
import * as sfx from '../src/audio/sfx';

let fake: FakeAudioContext;

beforeEach(() => {
  vi.useFakeTimers();
  fake = new FakeAudioContext();
  setAudioContext(fake as unknown as AudioContext);
});

afterEach(() => {
  vi.useRealTimers();
});

const NAMES = [
  'sfxJump', 'sfxStomp', 'sfxCoin', 'sfxHurt', 'sfxBlock', 'sfxShoot',
  'sfxPickup', 'sfxFart', 'sfxBoing', 'sfxCluck', 'sfxWin',
] as const;

describe('sound effects', () => {
  it('exports all eleven', () => {
    for (const name of NAMES) {
      expect(typeof sfx[name], name).toBe('function');
    }
  });

  for (const name of NAMES) {
    it(`${name} makes a sound`, () => {
      sfx[name]();
      vi.runAllTimers();
      expect(fake.oscillators.length, `${name} produced no oscillator`).toBeGreaterThan(0);
    });
  }

  it('chains multi-note effects over time rather than all at once', () => {
    sfx.sfxCoin();
    const immediate = fake.oscillators.length;
    vi.runAllTimers();
    expect(fake.oscillators.length).toBeGreaterThan(immediate);
  });

  it('stays silent without an audio context', () => {
    setAudioContext(null);
    for (const name of NAMES) {
      expect(() => { sfx[name](); }, name).not.toThrow();
    }
    vi.runAllTimers();
    expect(fake.oscillators.length).toBe(0);
  });
});
