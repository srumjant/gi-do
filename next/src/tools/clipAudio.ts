/**
 * The voice recorder's sound work, kept apart from the page so it can be tested: a recording
 * is trimmed to what was said, brought to one level, resampled, and written as a WAV file.
 * WAV plays in every browser Phaser supports, and at this rate a clip is 25-35 KB.
 */

/** Mono 16-bit PCM at 22.05 kHz: plenty for a voice, and small. */
export const CLIP_RATE = 22050;
/** Every clip's loudest sample is brought to this, about -1 dB, so none is louder than another. */
export const TARGET_PEAK = 0.89;
/** A sample counts as speech at this share of the clip's own peak. */
const SPEECH_SHARE = 0.1;
/** A recording whose loudest sample is below this heard nothing. */
const SILENCE_PEAK = 0.01;
/** How much is kept either side of the speech, so its first and last sounds are not clipped. */
const PAD_BEFORE_S = 0.04;
const PAD_AFTER_S = 0.12;

/** What was said, with a moment either side and the silence around it gone, at TARGET_PEAK; null for silence. */
export function trimAndLevel(samples: Float32Array, rate: number): Float32Array | null {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  if (peak < SILENCE_PEAK) return null;
  const threshold = peak * SPEECH_SHARE;
  const first = samples.findIndex((s) => Math.abs(s) >= threshold);
  let last = samples.length - 1;
  while (last > first && Math.abs(samples[last]) < threshold) last--;
  const start = Math.max(0, first - Math.round(PAD_BEFORE_S * rate));
  const end = Math.min(samples.length, last + 1 + Math.round(PAD_AFTER_S * rate));
  const gain = TARGET_PEAK / peak;
  return samples.slice(start, end).map((s) => s * gain);
}

/**
 * From one sample rate to another. Each output sample averages the input samples it covers,
 * which also keeps a downsampled voice from whistling (a plain pick-every-nth would alias).
 */
export function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples;
  const ratio = from / to;
  const out = new Float32Array(Math.max(1, Math.round(samples.length / ratio)));
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.max(a + 1, Math.min(samples.length, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = a; j < b; j++) sum += samples[j] ?? 0;
    out[i] = sum / (b - a);
  }
  return out;
}

/** A mono 16-bit PCM WAV file of `samples` at `rate`. */
export function encodeWav(samples: Float32Array, rate: number): ArrayBuffer {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (at: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, view.byteLength - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true); // the format chunk's size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // bytes per second
  view.setUint16(32, 2, true); // bytes per sample
  view.setUint16(34, 16, true); // bits per sample
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.trunc(Math.max(-1, Math.min(1, s)) * 0x7fff), true));
  return view.buffer;
}
