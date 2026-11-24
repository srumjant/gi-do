import { afterEach, describe, expect, it } from 'vitest';
import { DIFFICULTY_CONFIG, setDifficulty } from '../src/config/difficulty';
import { DEMOS } from '../src/data/demos';
import { OHTU } from '../src/data/levels2/ohtu';
import { STAGES } from '../src/data/stages';
import { mapOpensOn, stageAt, worldLevels, worldOf } from '../src/game/levelPick';
import {
  finishLevel, getCurrentStage, getPlayMode, getRunTotals, inDemo, isLastLevel, pickedStage,
  setPlayMode, startDemo, startPicked, startRun,
} from '../src/game/run';

/** Pick a level (docs/superpowers/specs/2026-11-24-level-pick-design.md). */

afterEach(() => {
  startRun();
  setPlayMode('story');
});

describe('a level picked on the map', () => {
  it("plays that stage on its own, with the difficulty's lives and no score", () => {
    setDifficulty('easy');
    startPicked(7);
    expect(getCurrentStage()).toBe(STAGES[7]);
    expect(pickedStage()).toBe(7);
    expect(inDemo()).toBe(true);
    expect(getRunTotals()).toEqual({ lives: DIFFICULTY_CONFIG.easy.lives, score: 0 });
    expect(isLastLevel(0)).toBe(true);
  });

  it('is won by finishing it, and still knows which it was', () => {
    startPicked(3);
    expect(finishLevel({ lives: 2, score: 50 })).toBe('game-won');
    expect(pickedStage()).toBe(3);
  });

  it('is forgotten by a new story and by ?boss=poo', () => {
    startPicked(5);
    startRun();
    expect(pickedStage()).toBeNull();
    expect(inDemo()).toBe(false);
    startPicked(5);
    startDemo(DEMOS.poo);
    expect(pickedStage()).toBeNull();
  });

  it("keeps to the run's stages", () => {
    startPicked(999);
    expect(pickedStage()).toBe(STAGES.length - 1);
    startPicked(-4);
    expect(pickedStage()).toBe(0);
  });

  it('remembers which mode the mode screen chose', () => {
    expect(getPlayMode()).toBe('story');
    setPlayMode('pick');
    expect(getPlayMode()).toBe('pick');
  });
});

describe('the level map', () => {
  it("has seven worlds of three levels: every stage once, in the run's order", () => {
    const levels = worldLevels();
    expect(levels).toHaveLength(7);
    expect(levels.every((l) => l.length === 3)).toBe(true);
    expect(levels.flat()).toEqual(STAGES.map((_, i) => i));
  });

  it('means one stage by a world and a card, both ways round', () => {
    worldLevels().forEach((levels, world) => levels.forEach((stage, card) => {
      expect(stageAt(world, card)).toBe(stage);
      expect(worldOf(stage)).toBe(world);
    }));
    expect(STAGES[stageAt(6, 2)].level).toBe(OHTU);
  });

  it('keeps a world or a card past the ends to the ends', () => {
    expect(stageAt(-1, -1)).toBe(0);
    expect(stageAt(99, 99)).toBe(STAGES.length - 1);
  });

  it('ends every world on its fight', () => {
    for (const levels of worldLevels()) expect(STAGES[levels[levels.length - 1]].level.ending).toBe('boss');
  });

  it('opens on the first world, or on the world just played', () => {
    expect(mapOpensOn(null)).toBe(0);
    expect(mapOpensOn(7)).toBe(2);
    expect(mapOpensOn(STAGES.length - 1)).toBe(6);
  });
});
