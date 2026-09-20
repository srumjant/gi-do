import { BGM_THEMES } from '../data/bgmThemes';
import { ensureAudio } from './context';
import { playBGMNote, playPercNote } from './synth';

/** How far ahead of the audio clock notes are placed. */
const LOOKAHEAD_S = 0.4;
/** How often the scheduler wakes to refill that window. */
const TICK_MS = 120;
/** Note length as a fraction of the step, so consecutive steps do not run together. */
const NOTE_DUTY = 0.85;
/** Bass rings a little longer than the melody, harmony a little shorter. */
const BASS_STRETCH = 1.1;
const HARM_STRETCH = 0.7;
/** Percussion is mixed at a fixed level rather than per theme. */
const PERC_VOL = 0.06;

let currentTheme = -1;
let noteIndex = 0;
let nextNoteTime = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

export function getCurrentTheme(): number {
  return currentTheme;
}

export function stopBGM(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  currentTheme = -1;
}

export function startBGM(themeIndex: number): void {
  stopBGM();

  const theme = BGM_THEMES[themeIndex];
  if (!theme) return;

  const ctx = ensureAudio();
  if (!ctx) return;

  currentTheme = themeIndex;
  noteIndex = 0;
  nextNoteTime = ctx.currentTime + 0.1;

  const interval = 60 / theme.bpm;

  /**
   * A lookahead scheduler, not a setTimeout-per-note loop. Notes are placed at
   * absolute AudioContext times inside a 400ms window, and setTimeout only wakes
   * this function to refill that window — so jitter in the timer never becomes
   * jitter in the music.
   */
  // A const arrow function, not a `function` declaration: TypeScript only keeps
  // `ctx`'s narrowed (non-null) type inside a closure for function EXPRESSIONS.
  // A hoisted function declaration would widen it back to `AudioContext | null`
  // here, forcing a non-null assertion this scheduler has no other need for.
  const scheduleNotes = (): void => {
    // Stale guard. Starting a different theme leaves this closure's timer pending;
    // returning WITHOUT re-arming lets the old scheduler die instead of playing
    // underneath the new one.
    if (currentTheme !== themeIndex) return;

    try {
      while (nextNoteTime < ctx.currentTime + LOOKAHEAD_S) {
        const i = noteIndex;
        const at = nextNoteTime;
        const dur = interval * NOTE_DUTY;

        // Each part is read modulo its OWN length, so melody, bass, harmony and
        // percussion loop at different periods and the track stops sounding like
        // one short loop.
        playBGMNote(theme.wave, theme.notes[i % theme.notes.length], at, dur, theme.vol);
        playBGMNote(theme.bass, theme.bassN[i % theme.bassN.length],
                    at, dur * BASS_STRETCH, theme.bassVol);
        playBGMNote(theme.harm, theme.harmN[i % theme.harmN.length],
                    at, dur * HARM_STRETCH, theme.harmVol);
        playPercNote(theme.perc[i % theme.perc.length], at, PERC_VOL);

        nextNoteTime += interval;
        noteIndex++;
      }
    } catch {
      // A failing audio stack must never take a frame down with it.
    }

    timer = setTimeout(scheduleNotes, TICK_MS);
  };

  scheduleNotes();
}
