import { describe, expect, it } from 'vitest';
import { TILE } from '../src/config/constants';
import { LEARN_WORDS, pickTargets, type LearnMode } from '../src/game/learn/content';
import {
  buildTower, GAPS, INSIDE, LETTER_ROOM, MAP_COLS, plankLengths, RISE, START_COL, storeyView,
  T_BRICK, T_LETTER, T_PLANK, T_STONE, type TowerLayout, VIEW_H, WALL,
} from '../src/game/learn/tower';
import { seeded } from './helpers/seeded';

const MODES: LearnMode[] = ['letters', 'syllables', 'words'];
const BUILT = MODES.flatMap((mode) => Array.from({ length: 100 }, (_, i) => {
  const rand = seeded(i + 1);
  const { targets, word } = pickTargets(mode, [], rand);
  return { name: `${mode} seed ${i + 1}`, layout: buildTower(mode, targets, word, rand) };
}));

/** Runs `check` on every built tower and collects its complaints, named by tower. */
function problems(check: (t: TowerLayout) => string[]): string[] {
  return BUILT.flatMap(({ name, layout }) => check(layout).map((p) => `${name}: ${p}`));
}

describe('a learn tower', () => {
  it('rises three tiles every hop', () => {
    expect(problems((t) => t.storeys.flatMap((st, s) => {
      const out = st.planks.flatMap((p, k) =>
        p.row === st.floorRow - RISE * (k + 1) ? [] : [`storey ${s} plank ${k}`]);
      if (st.letterFloorRow !== st.floorRow - RISE * (st.planks.length + 1)) out.push(`storey ${s} letter floor`);
      return out;
    }))).toEqual([]);
  });

  it('puts gaps of 2, 3, 4, 4 tiles between planks, and never lets planks overlap', () => {
    expect(problems((t) => t.storeys.flatMap((st, s) => st.planks.slice(1).flatMap((b, k) => {
      const a = st.planks[k];
      const gap = b.col > a.col ? b.col - (a.col + a.width) : a.col - (b.col + b.width);
      return gap === GAPS[s] ? [] : [`storey ${s} gap ${k} is ${gap}`];
    })))).toEqual([]);
  });

  it("takes each plank's length from its storey's set", () => {
    expect(problems((t) => t.storeys.flatMap((st, s) => st.planks.flatMap((p, k) =>
      plankLengths(s).includes(p.width) ? [] : [`storey ${s} plank ${k} is ${p.width} wide`])))).toEqual([]);
    expect(plankLengths(0)).toEqual([6, 5]);
    expect(plankLengths(1)).toEqual([5, 4, 3]);
    expect(plankLengths(2)).toEqual([4, 3, 2]);
    expect(plankLengths(3)).toEqual([4, 3, 2]);
  });

  it('keeps planks inside the walls', () => {
    expect(problems((t) => t.storeys.flatMap((st, s) => st.planks.flatMap((p, k) =>
      p.col >= 0 && p.col + p.width <= INSIDE ? [] : [`storey ${s} plank ${k}`])))).toEqual([]);
  });

  it('starts each storey a short walk from where you arrive', () => {
    expect(problems((t) => t.storeys.flatMap((st, s) => {
      const expected = s === 0 ? START_COL : centreOfAnswer(t, s - 1);
      if (st.arrivalCol !== expected) return [`storey ${s} arrival ${st.arrivalCol} vs ${expected}`];
      const p = st.planks[0];
      const walk = p.col > st.arrivalCol ? p.col - st.arrivalCol : st.arrivalCol - (p.col + p.width - 1);
      return walk >= 2 && walk <= 6 ? [] : [`storey ${s} first plank ${walk} tiles away`];
    }))).toEqual([]);
  });

  it('makes the first storey short and every tower have a long climb', () => {
    expect(problems((t) => {
      const counts = t.storeys.map((st) => st.planks.length);
      const out: string[] = [];
      if (counts[0] < 1 || counts[0] > 2) out.push(`first storey has ${counts[0]}`);
      if (counts.some((n) => n < 1 || n > 5)) out.push(`counts ${counts}`);
      if (!counts.slice(1).some((n) => n >= 4)) out.push(`no long climb in ${counts}`);
      return out;
    })).toEqual([]);
  });

  it('lays the letter floor across the whole tower', () => {
    expect(problems((t) => t.storeys.flatMap((st, s) =>
      range(WALL, WALL + INSIDE).every((c) => t.map[st.letterFloorRow][c] === T_PLANK) ? [] : [`storey ${s}`]))).toEqual([]);
  });

  it('builds a solid brick ceiling with the letters set into it', () => {
    expect(problems((t) => t.storeys.flatMap((st, s) => st.ceilingRows.flatMap((row) =>
      range(0, INSIDE).flatMap((c) => {
        const inBlock = st.blocks.some((b) => c >= b.col && c < b.col + b.width);
        const want = inBlock ? T_LETTER : T_BRICK;
        return t.map[row][c + WALL] === want ? [] : [`storey ${s} row ${row} col ${c}`];
      }))))).toEqual([]);
  });

  it('hangs the letters five tiles above the letter floor', () => {
    expect(problems((t) => t.storeys.flatMap((st, s) =>
      st.ceilingRows[1] + 1 === st.letterFloorRow - LETTER_ROOM ? [] : [`storey ${s}`]))).toEqual([]);
  });

  it('gives each gate three different options and one right answer', () => {
    expect(problems((t) => t.storeys.flatMap((st, s) => {
      const letters = st.blocks.map((b) => b.letter);
      const right = st.blocks.filter((b) => b.correct);
      return new Set(letters).size === 3 && right.length === 1 && right[0].letter === st.target ? [] : [`storey ${s}`];
    }))).toEqual([]);
  });

  it('spells a word from the list in words mode', () => {
    for (const { layout } of BUILT.filter((b) => b.layout.mode === 'words')) {
      expect(LEARN_WORDS).toContain(layout.word);
      expect(layout.storeys.map((st) => st.target).join('')).toBe(layout.word);
    }
  });

  it('stacks each storey on the one below, and the roof on the last', () => {
    expect(problems((t) => {
      const out = t.storeys.slice(1).flatMap((st, k) =>
        st.floorRow === t.storeys[k].ceilingRows[0] ? [] : [`storey ${k + 1}`]);
      if (t.roofRow !== t.storeys[t.storeys.length - 1].ceilingRows[0]) out.push('roof');
      return out;
    })).toEqual([]);
  });

  it('stands its walls from the base to above the roof', () => {
    expect(problems((t) => range(t.roofRow, t.rows).flatMap((r) =>
      [0, 1, MAP_COLS - 2, MAP_COLS - 1].every((c) => t.map[r][c] === T_STONE) ? [] : [`row ${r}`]))).toEqual([]);
  });

  it('fits a storey of one or two planks on screen, and scrolls the longer ones', () => {
    expect(problems((t) => t.storeys.flatMap((st, s) => {
      const fits = storeyView(t, s).height <= VIEW_H;
      return fits === (st.planks.length <= 2) ? [] : [`storey ${s} with ${st.planks.length} planks`];
    }))).toEqual([]);
  });

  it('puts the star on the roof', () => {
    for (const { layout } of BUILT) {
      expect(layout.star.row).toBe(layout.roofRow);
      expect(storeyView(layout, layout.storeys.length).y).toBeLessThan(layout.roofRow * TILE);
    }
  });
});

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from }, (_, i) => from + i);
}

function centreOfAnswer(t: TowerLayout, s: number): number {
  const b = t.storeys[s].blocks.find((x) => x.correct) ?? t.storeys[s].blocks[0];
  return b.col + Math.floor(b.width / 2);
}
