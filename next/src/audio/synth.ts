import type { OscillatorKind } from '../data/bgmThemes';
import { ensureAudio, getAudioContext } from './context';

/**
 * One oscillator straight to the destination, with a three-segment gain envelope.
 * The envelope is not decoration: starting at full gain makes a square wave click.
 *
 * @param slideTo optional frequency to ramp towards across the note
 */
export function playTone(
  freq: number,
  dur: number,
  type: OscillatorKind,
  vol: number,
  slideTo?: number,
): void {
  // ensureAudio, not getAudioContext: the live game creates the context lazily from
  // inside playTone (index.html:300), because a browser will not open one before a
  // user gesture. An already-set context (including an injected double) comes back
  // unchanged.
  const ctx = ensureAudio();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.linearRampToValueAtTime(slideTo, now + dur);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.008);
    gain.gain.linearRampToValueAtTime(vol * 0.6, now + dur * 0.6);
    gain.gain.linearRampToValueAtTime(0, now + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    // The extra 10ms lets the release ramp reach zero before teardown.
    osc.stop(now + dur + 0.01);
  } catch {
    // Audio is never worth breaking a frame over.
  }
}

/**
 * Melody, bass or harmony note, scheduled at an ABSOLUTE AudioContext time rather
 * than "now" — that is what lets the BGM scheduler place notes ahead of the clock.
 */
export function playBGMNote(
  type: OscillatorKind,
  freq: number,
  at: number,
  dur: number,
  vol: number,
): void {
  if (!freq) return; // a rest
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);

    // Four segments: attack, a held body at 85%, a decay to 50%, then release.
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(vol, at + 0.012);
    gain.gain.setValueAtTime(vol * 0.85, at + dur * 0.3);
    gain.gain.linearRampToValueAtTime(vol * 0.5, at + dur * 0.7);
    gain.gain.linearRampToValueAtTime(0, at + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + dur + 0.01);
  } catch {
    // ignore
  }
}

/** Percussion. 1 is a kick, 2 a hi-hat. 0 is silence. */
export function playPercNote(type: number, at: number, vol: number): void {
  if (type === 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (type === 1) {
      // Kick: a sine pitched down from 120Hz to 40Hz in 80ms.
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, at);
      osc.frequency.linearRampToValueAtTime(40, at + 0.08);
      gain.gain.setValueAtTime(vol * 0.7, at);
      gain.gain.linearRampToValueAtTime(0, at + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.12);
    } else {
      // Hi-hat: two detuned squares standing in for noise.
      const osc2 = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(800, at);
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(1283, at);
      gain.gain.setValueAtTime(vol * 0.25, at);
      gain.gain.linearRampToValueAtTime(0, at + 0.04);
      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc2.start(at);
      osc.stop(at + 0.05);
      osc2.stop(at + 0.05);
    }
  } catch {
    // ignore
  }
}
