import { beforeEach, describe, expect, it } from 'vitest';
import { FakeAudioContext } from './helpers/fakeAudio';
import { setAudioContext, getAudioContext } from '../src/audio/context';
import { playBGMNote, playPercNote, playTone } from '../src/audio/synth';

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

  it('does nothing and does not throw when there is no audio context', () => {
    setAudioContext(null);
    expect(() => playTone(440, 0.2, 'square', 0.1)).not.toThrow();
    expect(getAudioContext()).toBeNull();
  });
});

describe('playBGMNote', () => {
  // Moved from describe('playTone'): this asserts playBGMNote's rest-note guard, not
  // playTone's behaviour. playTone(0, ...) does NOT rest — it makes a 0Hz oscillator.
  it('treats frequency 0 as a rest and makes no sound', () => {
    playBGMNote('square', 0, 1, 0.2, 0.1);
    expect(fake.oscillators.length).toBe(0);
  });

  // index.html:429-438: a flat pitch (no ramp) under a five-segment gain envelope —
  // attack, a held body at 85%, a decay to 50%, then release — plus the 10ms tail on
  // the stop time that (as with playTone) lets the release ramp finish before teardown.
  it('schedules the five-segment envelope from index.html:429-438', () => {
    const at = 5;
    const dur = 0.4;
    const vol = 0.2;
    playBGMNote('triangle', 440, at, dur, vol);

    expect(fake.oscillators.length).toBe(1);
    const osc = fake.oscillators[0];
    expect(osc.type).toBe('triangle');
    expect(osc.frequency.calls).toEqual([
      { param: 'frequency', method: 'setValueAtTime', value: 440, time: at },
    ]);

    expect(fake.gains.length).toBe(1);
    const gain = fake.gains[0];
    expect(gain.gain.calls).toEqual([
      { param: 'gain', method: 'setValueAtTime', value: 0, time: at },
      { param: 'gain', method: 'linearRampToValueAtTime', value: vol, time: at + 0.012 },
      { param: 'gain', method: 'setValueAtTime', value: vol * 0.85, time: at + dur * 0.3 },
      { param: 'gain', method: 'linearRampToValueAtTime', value: vol * 0.5, time: at + dur * 0.7 },
      { param: 'gain', method: 'linearRampToValueAtTime', value: 0, time: at + dur },
    ]);

    expect(osc.connectedTo).toContain(gain);
    expect(gain.connectedTo).toContain(fake.destination);
    expect(osc.started).toBe(at);
    expect(osc.stopped).toBe(at + dur + 0.01);
  });

  it('does nothing and does not throw when there is no audio context', () => {
    setAudioContext(null);
    expect(() => playBGMNote('square', 440, 1, 0.2, 0.1)).not.toThrow();
  });
});

describe('playPercNote', () => {
  // index.html:440-456. type 1 is a kick, type 2 a hi-hat, and 0 is silence.
  it('type 0 is silence: creates nothing', () => {
    playPercNote(0, 5, 0.5);
    expect(fake.oscillators.length).toBe(0);
    expect(fake.gains.length).toBe(0);
  });

  it('type 1 is a kick: one sine oscillator, 120Hz ramped to 40Hz over 80ms', () => {
    const at = 5;
    const vol = 0.6;
    playPercNote(1, at, vol);

    expect(fake.oscillators.length).toBe(1);
    const osc = fake.oscillators[0];
    expect(osc.type).toBe('sine');
    expect(osc.frequency.calls).toEqual([
      { param: 'frequency', method: 'setValueAtTime', value: 120, time: at },
      { param: 'frequency', method: 'linearRampToValueAtTime', value: 40, time: at + 0.08 },
    ]);

    expect(fake.gains.length).toBe(1);
    const gain = fake.gains[0];
    expect(gain.gain.calls).toEqual([
      { param: 'gain', method: 'setValueAtTime', value: vol * 0.7, time: at },
      { param: 'gain', method: 'linearRampToValueAtTime', value: 0, time: at + 0.1 },
    ]);

    expect(osc.connectedTo).toContain(gain);
    expect(gain.connectedTo).toContain(fake.destination);
    expect(osc.started).toBe(at);
    expect(osc.stopped).toBe(at + 0.12);
  });

  it('type 2 is a hi-hat: two square oscillators at 800Hz and 1283Hz sharing one gain', () => {
    const at = 5;
    const vol = 0.6;
    playPercNote(2, at, vol);

    expect(fake.oscillators.length).toBe(2);
    const [osc1, osc2] = fake.oscillators;
    expect(osc1.type).toBe('square');
    expect(osc2.type).toBe('square');
    expect(osc1.frequency.calls).toEqual([
      { param: 'frequency', method: 'setValueAtTime', value: 800, time: at },
    ]);
    expect(osc2.frequency.calls).toEqual([
      { param: 'frequency', method: 'setValueAtTime', value: 1283, time: at },
    ]);

    // One shared gain, not two: both oscillators connect to the same node.
    expect(fake.gains.length).toBe(1);
    const gain = fake.gains[0];
    expect(gain.gain.calls).toEqual([
      { param: 'gain', method: 'setValueAtTime', value: vol * 0.25, time: at },
      { param: 'gain', method: 'linearRampToValueAtTime', value: 0, time: at + 0.04 },
    ]);
    expect(osc1.connectedTo).toContain(gain);
    expect(osc2.connectedTo).toContain(gain);
    expect(gain.connectedTo).toContain(fake.destination);

    expect(osc1.started).toBe(at);
    expect(osc2.started).toBe(at);
    expect(osc1.stopped).toBe(at + 0.05);
    expect(osc2.stopped).toBe(at + 0.05);
  });

  it('does nothing and does not throw when there is no audio context', () => {
    setAudioContext(null);
    expect(() => playPercNote(1, 5, 0.5)).not.toThrow();
    expect(fake.oscillators.length).toBe(0);
  });
});
