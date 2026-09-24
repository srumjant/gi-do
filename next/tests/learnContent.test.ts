import { describe, expect, it } from 'vitest';
import {
  distractorPool, GATES_PER_TOWER, LEARN_LETTERS, LEARN_SYLLABLES, LEARN_WORDS, pickOptions,
  pickTargets,
} from '../src/game/learn/content';
import { loadLegacySection } from './helpers/legacy';

// A tiny deterministic source, local to this file (Task 5 adds a shared one).
function seq(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const legacy = loadLegacySection({
  from: '//  LEARN MODE',
  to: '//  CONTROLLER IDENTITY',
  expose: ['LEARN_LETTERS', 'LEARN_SYLLABLES', 'LEARN_WORDS'],
});

describe('the learn pools', () => {
  it("are the live game's, unchanged", () => {
    expect(LEARN_LETTERS).toEqual(legacy.LEARN_LETTERS);
    expect(LEARN_SYLLABLES).toEqual(legacy.LEARN_SYLLABLES);
    expect(LEARN_WORDS).toEqual(legacy.LEARN_WORDS);
  });

  it('hold only words of one letter per gate', () => {
    expect(LEARN_WORDS.every((w) => w.length === GATES_PER_TOWER)).toBe(true);
  });
});

describe("a tower's targets", () => {
  it('are four different letters, remembered for the next tower', () => {
    const used: string[] = [];
    const { targets, word } = pickTargets('letters', used, seq(1));
    expect(word).toBeNull();
    expect(targets).toHaveLength(GATES_PER_TOWER);
    expect(new Set(targets).size).toBe(GATES_PER_TOWER);
    expect(targets.every((t) => LEARN_LETTERS.includes(t))).toBe(true);
    expect(used).toEqual(targets);
  });

  it('avoid what this session has already asked', () => {
    const used = LEARN_SYLLABLES.slice(0, LEARN_SYLLABLES.length - GATES_PER_TOWER);
    const { targets } = pickTargets('syllables', used, seq(2));
    expect(targets.sort()).toEqual(LEARN_SYLLABLES.slice(-GATES_PER_TOWER).sort());
  });

  it('never repeat inside a tower, even once the pool is used up', () => {
    const used = [...LEARN_LETTERS];
    const { targets } = pickTargets('letters', used, seq(3));
    expect(new Set(targets).size).toBe(GATES_PER_TOWER);
    expect(targets.every((t) => LEARN_LETTERS.includes(t))).toBe(true);
  });

  it('spell one word, a letter per gate, in words mode', () => {
    const used: string[] = [];
    const { targets, word } = pickTargets('words', used, seq(4));
    expect(word).not.toBeNull();
    expect(LEARN_WORDS).toContain(word);
    expect(targets.join('')).toBe(word);
    expect(used).toEqual([word]);
  });

  it('start a new round once the pool is used up, still avoiding the tower that used it up', () => {
    const used = LEARN_LETTERS.slice(0, LEARN_LETTERS.length - GATES_PER_TOWER);
    const { targets: last } = pickTargets('letters', used, seq(5));
    expect(used).toEqual(last);
    expect([...last].sort()).toEqual(LEARN_LETTERS.slice(-GATES_PER_TOWER).sort());
    const { targets: next } = pickTargets('letters', used, seq(6));
    expect(next.some((t) => last.includes(t))).toBe(false);
  });

  it('start a new round of words with the last fresh one, and not repeat it next', () => {
    const used = LEARN_WORDS.slice(0, -1);
    const { word } = pickTargets('words', used, seq(7));
    expect(word).toBe(LEARN_WORDS[LEARN_WORDS.length - 1]);
    expect(used).toEqual([word]);
    expect(pickTargets('words', used, seq(8)).word).not.toBe(word);
  });

  it('still pick a word when every word has been spelled', () => {
    const used = [...LEARN_WORDS];
    const { word } = pickTargets('words', used, seq(9));
    expect(LEARN_WORDS).toContain(word);
    expect(used).toEqual([word]);
  });
});

describe("a gate's options", () => {
  it('are three different items with the target exactly once', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const mode of ['letters', 'syllables', 'words'] as const) {
        const target = mode === 'syllables' ? 'MA' : 'K';
        const options = pickOptions(target, mode, seq(seed));
        expect(options).toHaveLength(3);
        expect(new Set(options).size).toBe(3);
        expect(options.filter((o) => o === target)).toHaveLength(1);
        expect(options.every((o) => distractorPool(mode).includes(o))).toBe(true);
      }
    }
  });

  it('come from the syllables for syllables, and from the letters otherwise', () => {
    expect(distractorPool('syllables')).toBe(LEARN_SYLLABLES);
    expect(distractorPool('letters')).toBe(LEARN_LETTERS);
    expect(distractorPool('words')).toBe(LEARN_LETTERS);
  });
});
