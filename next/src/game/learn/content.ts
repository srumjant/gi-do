import { random } from '../random';

/** Which learn exercise a tower asks. */
export type LearnMode = 'letters' | 'syllables' | 'words';

/** The three exercises, in the learn menu's order. */
export const LEARN_MODES: readonly LearnMode[] = ['letters', 'syllables', 'words'];

/** A random source in [0, 1). Defaults to game/random.ts's seam; tests pass their own. */
export type Rand = () => number;

/** index.html:2466-2468, unchanged. tests/learnContent.test.ts compares them with the live file. */
export const LEARN_LETTERS: readonly string[] = ['A', 'E', 'I', 'O', 'U', 'M', 'N', 'S', 'K', 'T', 'L', 'P', 'R', 'J', 'V', 'H', 'Ä', 'Ö', 'Ü', 'Õ'];
export const LEARN_SYLLABLES: readonly string[] = ['MA', 'PA', 'SA', 'KA', 'TA', 'LA', 'NA', 'ME', 'SE', 'KE', 'TE', 'LE', 'MI', 'SI', 'KI', 'TI', 'MO', 'KO', 'TO', 'MU', 'KU', 'TU', 'LU'];
export const LEARN_WORDS: readonly string[] = ['KASS', 'KOER', 'MAJA', 'PALL', 'KALA', 'LUMI', 'AUTO', 'MUNA', 'PAAT', 'SUUR'];

/** One tower asks four questions. Every word in LEARN_WORDS has four letters, a letter per gate. */
export const GATES_PER_TOWER = 4;

export function pickFrom<T>(items: readonly T[], rand: Rand): T {
  return items[Math.floor(rand() * items.length)];
}

export function shuffled<T>(items: readonly T[], rand: Rand): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface TowerTargets {
  /** One per gate, bottom to top. */
  targets: string[];
  /** The word being spelled, in words mode; null otherwise. */
  word: string | null;
}

/**
 * A tower's four questions, avoiding what this round has already asked (`used`, which this
 * appends to) and never repeating one inside a tower. In words mode the four are the
 * letters of one word, and it is the word that is not repeated. The tower that uses up the
 * pool ends the round: `used` is emptied and keeps only that tower's own questions, so
 * they are not asked again until the round after.
 */
export function pickTargets(mode: LearnMode, used: string[], rand: Rand = random): TowerTargets {
  if (mode === 'words') {
    const fresh = LEARN_WORDS.filter((w) => !used.includes(w));
    const word = pickFrom(fresh.length > 0 ? fresh : LEARN_WORDS, rand);
    if (fresh.length <= 1) used.length = 0;
    used.push(word);
    return { targets: word.split(''), word };
  }
  const pool = mode === 'letters' ? LEARN_LETTERS : LEARN_SYLLABLES;
  const targets: string[] = [];
  for (let i = 0; i < GATES_PER_TOWER; i++) {
    const fresh = pool.filter((x) => !used.includes(x) && !targets.includes(x));
    targets.push(pickFrom(fresh.length > 0 ? fresh : pool.filter((x) => !targets.includes(x)), rand));
  }
  if (pool.every((x) => used.includes(x) || targets.includes(x))) used.length = 0;
  used.push(...targets);
  return { targets, word: null };
}

/** Where a gate's wrong answers come from: syllables for syllables, letters for letters AND words. */
export function distractorPool(mode: LearnMode): readonly string[] {
  return mode === 'syllables' ? LEARN_SYLLABLES : LEARN_LETTERS;
}

/** A gate's three blocks: the target and two different distractors, shuffled. */
export function pickOptions(target: string, mode: LearnMode, rand: Rand = random): string[] {
  const others = shuffled(distractorPool(mode).filter((x) => x !== target), rand).slice(0, 2);
  return shuffled([target, ...others], rand);
}
