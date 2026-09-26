import { describe, expect, it } from 'vitest';
import { STEP_HZ, TILE } from '../src/config/constants';
import { createClimb, stepClimb } from '../src/game/learn/climb';
import type { LearnMode } from '../src/game/learn/content';
import { LEARN_CHEERS, REPEAT_GAP } from '../src/game/learn/speech';
import { starBox } from '../src/game/learn/tower';
import type { Climb } from '../src/game/learn/types';
import { emptyInput } from '../src/input/actions';
import { answerOf, held, idle, run, standUnder, wrongOf } from './helpers/climbs';
import { seeded } from './helpers/seeded';
import { towerMove } from './helpers/towerMove';

const climb = (mode: LearnMode = 'letters'): Climb => createClimb(mode, [], 'gigi', seeded(3));
const target = (c: Climb, s: number): string => c.layout.storeys[s].target;
/** What the voice was asked to say, and empties the list, as the scene does. */
const heard = (c: Climb) => c.speech.splice(0);

describe('the voice', () => {
  it('says what to find when a tower starts', () => {
    const c = climb();
    expect(heard(c)).toEqual([{ text: target(c, 0), when: 'now' }]);
  });

  it('says a syllable as a syllable, not as two letters', () => {
    const c = climb('syllables');
    expect(heard(c)).toEqual([{ text: target(c, 0).toLowerCase(), when: 'now' }]);
  });

  it('says the word and then the letter in words mode', () => {
    const c = climb('words');
    const word = c.layout.word ?? '';
    expect(heard(c)).toEqual([{ text: `${word.toLowerCase()}. ${target(c, 0)}.`, when: 'now' }]);
  });

  it('says the letter and a cheer for a right answer', () => {
    const c = climb();
    heard(c);
    standUnder(c, 0, answerOf(c, 0));
    run(c, 40, held, () => c.gates[0].solved);
    expect(heard(c)).toEqual([{ text: `${target(c, 0)}. ${LEARN_CHEERS[0]}`, when: 'now' }]);
  });

  it('says the target again for a wrong one', () => {
    const c = climb();
    heard(c);
    standUnder(c, 0, wrongOf(c, 0));
    run(c, 40, held, () => c.gates[0].mistakes === 1);
    expect(heard(c)).toEqual([{ text: target(c, 0), when: 'now' }]);
  });

  it('says the next target on landing in the new storey, after the cheer, and once', () => {
    const c = climb();
    standUnder(c, 0, answerOf(c, 0));
    run(c, 40, held, () => c.gates[0].solved);
    heard(c);
    run(c, 150, idle, () => c.storey === 1 && c.player.onGround);
    run(c, 30, idle, () => false);
    expect(heard(c)).toEqual([{ text: target(c, 1), when: 'after' }]);
  });

  it('says the target on reaching the letter floor, unless it spoke in the last four seconds', () => {
    expect(REPEAT_GAP).toBe(4 * STEP_HZ);
    const arrive = (quietFor: number): Climb => {
      const c = climb();
      standUnder(c, 0, answerOf(c, 0));
      c.lastGround = -1; // as if the hero had just come up from the plank below
      c.lastSpokeAt = c.steps + 1 - quietFor;
      heard(c);
      stepClimb(c, idle(), towerMove(c.layout.map));
      return c;
    };
    const spoke = arrive(REPEAT_GAP);
    expect(heard(spoke)).toEqual([{ text: target(spoke, 0), when: 'now' }]);
    expect(heard(arrive(REPEAT_GAP - 1))).toEqual([]);
  });

  it('does not say it again on landing back on the letter floor after a jump', () => {
    const c = climb();
    standUnder(c, 0, answerOf(c, 0));
    c.lastSpokeAt = -REPEAT_GAP;
    const move = towerMove(c.layout.map);
    // A tap: up a little and down again onto the same floor, reaching no block.
    stepClimb(c, { ...emptyInput(), jump: true, jumpPressed: true }, move);
    heard(c);
    expect(run(c, 60, idle, () => c.player.onGround)).toBe(true);
    expect(c.player.y + c.player.h).toBe(c.layout.storeys[0].letterFloorRow * TILE);
    expect(heard(c)).toEqual([]);
  });

  it('says the target when X is pressed', () => {
    const c = climb();
    heard(c);
    stepClimb(c, { ...emptyInput(), firePressed: true }, towerMove(c.layout.map));
    expect(heard(c)).toEqual([{ text: target(c, 0), when: 'now' }]);
  });

  it('has nothing to say to X on the roof', () => {
    const c = climb();
    c.storey = c.layout.storeys.length;
    heard(c);
    stepClimb(c, { ...emptyInput(), firePressed: true }, towerMove(c.layout.map));
    expect(heard(c)).toEqual([]);
  });

  it('cheers at the star, with the one cheer no gate used', () => {
    const c = climb();
    c.gates.forEach((g) => { g.solved = true; g.armed = false; });
    c.storey = c.layout.storeys.length;
    const star = starBox(c.layout);
    c.player.x = star.x;
    c.player.y = star.y + star.h - c.player.h;
    c.player.onGround = true;
    heard(c);
    stepClimb(c, idle(), towerMove(c.layout.map));
    expect(heard(c)).toEqual([{ text: LEARN_CHEERS[c.layout.storeys.length], when: 'now' }]);
    expect(new Set(LEARN_CHEERS).size).toBe(c.layout.storeys.length + 1);
  });
});
