/**
 * The learn tower's voice: the browser's speech synthesis, always in Estonian, whatever the
 * UI language, because the letters and words are Estonian. Phaser has no speech of its own.
 * The rules are the September plan's (docs/plans/2026-09-20-learn-path-refinement.md, §3).
 *
 * No voice, or no speech at all, is silence and nothing worse: the HUD always shows the
 * target, so the game stays fully playable.
 */

/** The part of a SpeechSynthesisVoice the pick reads. */
export interface VoiceLike {
  lang: string;
  name: string;
}

/**
 * Estonian, then Finnish and Italian, which both say Estonian vowels closely enough to learn
 * from (and Italian is very widely installed), then whatever the system has.
 */
const VOICE_PREFS = ['et', 'fi', 'it'];

/** Slower and brighter than the default, for a small child. */
export const VOICE_RATE = 0.8;
export const VOICE_PITCH = 1.1;

/** The first voice in a language VOICE_PREFS names, in that order; else the first voice; else null. */
export function pickVoiceFrom<V extends VoiceLike>(voices: readonly V[] | null | undefined): V | null {
  if (!voices || voices.length === 0) return null;
  for (const want of VOICE_PREFS) {
    const hit = voices.find((v) => v.lang.toLowerCase().startsWith(want));
    if (hit) return hit;
  }
  return voices[0];
}

let voice: SpeechSynthesisVoice | null = null;

/** The browser's speech synthesis, or null where there is none. Looked up per call, never at import. */
function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

/**
 * Picks the voice, and picks again whenever the browser's list changes: Chrome fills it in
 * after the page loads, so the first pick often sees none. Called once, at boot (main.ts).
 */
export function installVoice(): void {
  const s = synth();
  if (!s) return;
  const pick = (): void => { voice = pickVoiceFrom(s.getVoices()); };
  pick();
  s.addEventListener('voiceschanged', pick);
}

/**
 * Says `text`. 'now' cuts off whatever is being said or waiting, as a target said again
 * should; 'after' waits its turn, so the next storey's target never talks over a cheer.
 */
export function speak(text: string, when: 'now' | 'after'): void {
  const s = synth();
  if (!s) return;
  try {
    if (when === 'now') s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    // With no voice picked, Estonian still, and the browser chooses.
    u.lang = voice?.lang ?? 'et-EE';
    u.rate = VOICE_RATE;
    u.pitch = VOICE_PITCH;
    s.speak(u);
  } catch {
    // Speech is never worth breaking a frame over.
  }
}
