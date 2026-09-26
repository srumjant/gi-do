import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hush, installVoice, pickVoiceFrom, speak, VOICE_PITCH, VOICE_RATE, type VoiceLike } from '../src/audio/voice';

const V = (lang: string): VoiceLike => ({ lang, name: `test-${lang}` });

// The September plan's eight cases (docs/plans/2026-09-20-learn-path-refinement-implementation.md, Task 6).
describe('the voice pick', () => {
  it('prefers Estonian above all', () => {
    expect(pickVoiceFrom([V('it-IT'), V('fi-FI'), V('et-EE')])?.lang).toBe('et-EE');
  });

  it('falls back to Finnish when there is no Estonian', () => {
    expect(pickVoiceFrom([V('en-US'), V('it-IT'), V('fi-FI')])?.lang).toBe('fi-FI');
  });

  it('falls back to Italian when there is no Estonian or Finnish', () => {
    expect(pickVoiceFrom([V('en-US'), V('it-IT')])?.lang).toBe('it-IT');
  });

  it('falls back to the first voice otherwise', () => {
    expect(pickVoiceFrom([V('en-US'), V('de-DE')])?.lang).toBe('en-US');
  });

  it('handles bare language codes', () => {
    expect(pickVoiceFrom([V('en'), V('et')])?.lang).toBe('et');
  });

  it('ignores case', () => {
    expect(pickVoiceFrom([V('ET-ee')])?.lang).toBe('ET-ee');
  });

  it('is null with no voices', () => {
    expect(pickVoiceFrom([])).toBeNull();
  });

  it('is null with no voice list at all', () => {
    expect(pickVoiceFrom(undefined)).toBeNull();
  });
});

/** The part of speechSynthesis the voice uses, recording what it was asked. */
class FakeSynth {
  voices: VoiceLike[] = [];
  calls: string[] = [];
  spoken: FakeUtterance[] = [];
  private readonly changed: Array<() => void> = [];

  getVoices(): VoiceLike[] { return this.voices; }
  addEventListener(type: string, listener: () => void): void {
    if (type === 'voiceschanged') this.changed.push(listener);
  }
  cancel(): void { this.calls.push('cancel'); }
  speak(u: FakeUtterance): void {
    this.calls.push(`speak ${u.text}`);
    this.spoken.push(u);
  }
  /** What the browser does when its voice list fills in after the page has loaded. */
  install(voices: VoiceLike[]): void {
    this.voices = voices;
    for (const listener of this.changed) listener();
  }
}

class FakeUtterance {
  voice: VoiceLike | null = null;
  lang = '';
  rate = 1;
  pitch = 1;
  constructor(readonly text: string) {}
}

describe('speaking', () => {
  let synth: FakeSynth;

  beforeEach(() => {
    synth = new FakeSynth();
    vi.stubGlobal('window', { speechSynthesis: synth });
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    installVoice();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('cuts off what is being said to say something now', () => {
    speak('A', 'now');
    expect(synth.calls).toEqual(['cancel', 'speak A']);
  });

  it('waits its turn to say something after', () => {
    speak('Tubli!', 'now');
    speak('K', 'after');
    expect(synth.calls).toEqual(['cancel', 'speak Tubli!', 'speak K']);
  });

  it('speaks slower and brighter, for a small child', () => {
    speak('A', 'now');
    expect(synth.spoken[0].rate).toBe(VOICE_RATE);
    expect(synth.spoken[0].pitch).toBe(VOICE_PITCH);
    expect([VOICE_RATE, VOICE_PITCH]).toEqual([0.8, 1.1]);
  });

  it('asks for Estonian when no voice is installed', () => {
    speak('A', 'now');
    expect(synth.spoken[0].voice).toBeNull();
    expect(synth.spoken[0].lang).toBe('et-EE');
  });

  it('picks again when the voice list fills in', () => {
    synth.install([V('en-US'), V('fi-FI')]);
    speak('A', 'now');
    expect(synth.spoken[0].voice?.lang).toBe('fi-FI');
    expect(synth.spoken[0].lang).toBe('fi-FI');
  });

  it('hushes: stops what is being said, and what is waiting', () => {
    hush();
    expect(synth.calls).toEqual(['cancel']);
  });

  it('is silent, and does not throw, where there is no speech at all', () => {
    vi.stubGlobal('window', {});
    expect(() => speak('A', 'now')).not.toThrow();
    expect(() => hush()).not.toThrow();
    expect(synth.calls).toEqual([]);
  });
});
