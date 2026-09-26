import { LEARN_LETTERS, LEARN_SYLLABLES, LEARN_WORDS } from './content';

/**
 * The learn tower's voice is the owner's own, recorded a clip at a time with the recorder
 * (record.html, src/tools/recorder.ts): a clip per letter, said as its sound, per syllable, per
 * word, and per cheer. Longer lines are clips played back to back (speech.ts): "kass. K." is
 * the word and then the letter. This is the one list the game and the recorder both read, and a
 * clip's key is its file's name everywhere (assets/voice/<key>.wav).
 */
export type VoiceGroup = 'letter' | 'syllable' | 'word' | 'cheer';

export interface VoiceClip {
  key: string;
  group: VoiceGroup;
  /** What to say, as the recorder shows it. */
  say: string;
}

/**
 * The cheers, in Estonian like everything the voice says: one for each gate, in this order,
 * and the last for the star, so each tower ends on its biggest. The result screen shows the
 * same five as text, in the UI language (config/i18n.ts's `learn_cheers`).
 */
export const LEARN_CHEERS: readonly string[] = ['Tubli!', 'Väga hea!', 'Super!', 'Suurepärane!', 'Fantastiline!'];

/** The four Estonian vowels, spelled out: a key is a file name, so it stays plain ASCII. */
const SPELLED: Readonly<Record<string, string>> = { Ä: 'a-umlaut', Ö: 'o-umlaut', Ü: 'u-umlaut', Õ: 'o-tilde' };

function slug(item: string): string {
  return [...item].map((ch) => SPELLED[ch] ?? ch.toLowerCase()).join('');
}

export function letterClip(letter: string): string {
  return `letter-${slug(letter)}`;
}

export function syllableClip(syllable: string): string {
  return `syllable-${slug(syllable)}`;
}

export function wordClip(word: string): string {
  return `word-${slug(word)}`;
}

/** Cheer `index`, counted from 0 as the gates are; the files count from 1. */
export function cheerClip(index: number): string {
  return `cheer-${index + 1}`;
}

export const VOICE_CLIPS: readonly VoiceClip[] = [
  ...LEARN_LETTERS.map((say) => ({ key: letterClip(say), group: 'letter' as const, say })),
  ...LEARN_SYLLABLES.map((say) => ({ key: syllableClip(say), group: 'syllable' as const, say })),
  ...LEARN_WORDS.map((say) => ({ key: wordClip(say), group: 'word' as const, say })),
  ...LEARN_CHEERS.map((say, i) => ({ key: cheerClip(i), group: 'cheer' as const, say })),
];
