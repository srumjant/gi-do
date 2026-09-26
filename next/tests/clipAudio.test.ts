import { describe, expect, it } from 'vitest';
import { CLIP_RATE, encodeWav, resample, TARGET_PEAK, trimAndLevel } from '../src/tools/clipAudio';

const RATE = 48000;

/** Silence, then `seconds` of a 440Hz tone at `amplitude`, then silence, each `gap` seconds. */
function burst(amplitude: number, seconds = 0.5, gap = 0.5): Float32Array {
  const silent = Math.round(gap * RATE);
  const loud = Math.round(seconds * RATE);
  const out = new Float32Array(silent + loud + silent);
  for (let i = 0; i < loud; i++) out[silent + i] = amplitude * Math.sin((2 * Math.PI * 440 * i) / RATE);
  return out;
}

describe('a recorded clip, trimmed and levelled', () => {
  it('is nothing when nothing was said', () => {
    expect(trimAndLevel(new Float32Array(RATE), RATE)).toBeNull();
    expect(trimAndLevel(burst(0.005), RATE)).toBeNull();
  });

  it('keeps the sound, with a moment either side, and drops the silence around it', () => {
    const clip = trimAndLevel(burst(0.3), RATE);
    expect(clip).not.toBeNull();
    const seconds = (clip?.length ?? 0) / RATE;
    // Half a second of tone, 0.04s before it and 0.12s after, give or take a wave's edge.
    expect(seconds).toBeGreaterThan(0.6);
    expect(seconds).toBeLessThan(0.7);
  });

  it('brings every clip to the same peak, quiet or loud', () => {
    for (const amplitude of [0.05, 0.3, 0.95]) {
      const clip = trimAndLevel(burst(amplitude), RATE) ?? new Float32Array();
      const peak = clip.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
      expect(peak).toBeCloseTo(TARGET_PEAK, 5);
    }
  });
});

describe('resampling', () => {
  it('scales the length by the ratio of the rates', () => {
    expect(resample(new Float32Array(48000), 48000, CLIP_RATE)).toHaveLength(CLIP_RATE);
  });

  it('keeps a steady level steady', () => {
    const out = resample(new Float32Array(4800).fill(0.5), 48000, CLIP_RATE);
    expect(out.every((s) => Math.abs(s - 0.5) < 1e-6)).toBe(true);
  });
});

describe('the WAV file', () => {
  it('is 16-bit mono PCM at the rate given, with the samples after a 44-byte header', () => {
    const view = new DataView(encodeWav(new Float32Array([0, 1, -1, 0.5]), CLIP_RATE));
    const text = (at: number, n: number) => String.fromCharCode(...Array.from({ length: n }, (_, i) => view.getUint8(at + i)));
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 4)).toBe('WAVE');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(CLIP_RATE);
    expect(view.getUint16(34, true)).toBe(16);
    expect(text(36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(8);
    expect([0, 1, 2, 3].map((i) => view.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32767, 16383]);
  });
});
