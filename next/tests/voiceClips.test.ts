import { describe, expect, it } from 'vitest';
import { GATES_PER_TOWER, LEARN_LETTERS, LEARN_SYLLABLES, LEARN_WORDS } from '../src/game/learn/content';
import {
  cheerClip, LEARN_CHEERS, letterClip, syllableClip, VOICE_CLIPS, wordClip,
} from '../src/game/learn/voiceClips';

describe('the voice clips', () => {
  it('has one clip for every letter, syllable, word and cheer, in that order', () => {
    expect(VOICE_CLIPS.map((clip) => clip.key)).toEqual([
      ...LEARN_LETTERS.map(letterClip),
      ...LEARN_SYLLABLES.map(syllableClip),
      ...LEARN_WORDS.map(wordClip),
      ...LEARN_CHEERS.map((_, i) => cheerClip(i)),
    ]);
    expect(VOICE_CLIPS).toHaveLength(58);
  });

  it('gives every clip a key of its own, safe as a file name', () => {
    const keys = VOICE_CLIPS.map((clip) => clip.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z0-9-]+$/);
  });

  it('spells the four Estonian vowels out', () => {
    expect(['Ä', 'Ö', 'Ü', 'Õ'].map(letterClip))
      .toEqual(['letter-a-umlaut', 'letter-o-umlaut', 'letter-u-umlaut', 'letter-o-tilde']);
  });

  it('has a cheer for each gate and one more for the star', () => {
    expect(LEARN_CHEERS).toHaveLength(GATES_PER_TOWER + 1);
  });
});
