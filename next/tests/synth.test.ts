import { beforeEach, describe, expect, it } from 'vitest';
import { FakeAudioContext } from './helpers/fakeAudio';
import { setAudioContext, getAudioContext } from '../src/audio/context';
import { playBGMNote, playTone } from '../src/audio/synth';

let fake: FakeAudioContext;

beforeEach(() => {
  fake = new FakeAudioContext();
  setAudioContext(fake as unknown as AudioContext);
});

describe('playTone', () => {
  it('creates one oscillator and one gain, wired to the destination', () => {
    playTone(440, 0.2, 'square', 0.1);
    expect(fake.oscillators.length).toBe(1);
    expect(fake.gains.length).toBe(1);
    expect(fake.oscillators[0].connectedTo).toContain(fake.gains[0]);
    expect(fake.gains[0].connectedTo).toContain(fake.destination);
  });

  it('uses the requested waveform and frequency', () => {
    playTone(660, 0.2, 'sawtooth', 0.1);
    expect(fake.oscillators[0].type).toBe('sawtooth');
    expect(fake.oscillators[0].frequency.calls[0].value).toBe(660);
  });

  it('starts now and stops just after the requested duration', () => {
    fake.currentTime = 5;
    playTone(440, 0.25, 'square', 0.1);
    expect(fake.oscillators[0].started).toBe(5);
    // index.html:307 stops at now + dur + 0.01 — the extra 10ms lets the release
    // ramp reach zero before the node is torn down, which is what stops the click.
    expect(fake.oscillators[0].stopped).toBeCloseTo(5.26, 5);
  });

  // The envelope exists to stop clicks: gain ramps up from 0 and back down to 0,
  // never jumping. A tone that starts at full volume pops audibly.
  it('ramps the gain up from zero and back to zero', () => {
    playTone(440, 0.2, 'square', 0.1);
    const gain = fake.gains[0].gain.calls;
    expect(gain.length).toBeGreaterThanOrEqual(3);
    expect(gain[0].value).toBe(0);
    expect(gain[gain.length - 1].value).toBe(0);
    expect(Math.max(...gain.map((c) => c.value))).toBeCloseTo(0.1, 5);
  });

  it('slides the frequency when a slide target is given', () => {
    playTone(300, 0.15, 'square', 0.12, 600);
    const freq = fake.oscillators[0].frequency.calls;
    expect(freq.some((c) => c.method === 'linearRampToValueAtTime' && c.value === 600)).toBe(true);
  });

  it('treats frequency 0 as a rest and makes no sound', () => {
    playBGMNote('square', 0, 1, 0.2, 0.1);
    expect(fake.oscillators.length).toBe(0);
  });

  it('does nothing and does not throw when there is no audio context', () => {
    setAudioContext(null);
    expect(() => playTone(440, 0.2, 'square', 0.1)).not.toThrow();
    expect(getAudioContext()).toBeNull();
  });
});
