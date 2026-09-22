import { beforeEach, describe, expect, it } from 'vitest';
import {
  finishLevel, getCurrentLevel, getEnemySpriteInfo, getKidnapper, getPlayerSprites,
  getRescueSprites, getRunTotals, getSelectedChar, isLastLevel, setSelectedChar,
  setGigiSkin, setDodoSkin, startRun,
} from '../src/game/run';
import { createWorld, stepWorld } from '../src/game/world';
import { playerDie } from '../src/game/player';
import { emptyInput } from '../src/input/actions';
import { DIFFICULTY_CONFIG, setDifficulty } from '../src/config/difficulty';
import { DODO_SKINS, GIGI_SKINS, KIDNAPPERS } from '../src/data/sprites';
import { LEVELS } from '../src/data/levels';

beforeEach(() => {
  setSelectedChar('gigi');
  setGigiSkin(0);
  setDodoSkin(0);
  setDifficulty('normal');
  startRun();
});

describe('character and skin selection', () => {
  it('defaults to Gigi, with Dodo as the rescue NPC', () => {
    expect(getSelectedChar()).toBe('gigi');
    expect(getPlayerSprites()).toEqual({
      stand: GIGI_SKINS[0].stand,
      run: GIGI_SKINS[0].run,
      jump: GIGI_SKINS[0].jump,
      palette: GIGI_SKINS[0].palette,
    });
    expect(getRescueSprites().name).toBe('Dodo');
  });

  it('selecting Dodo swaps both the player and rescue sprite sets', () => {
    setSelectedChar('dodo');
    expect(getPlayerSprites()).toEqual({
      stand: DODO_SKINS[0].stand,
      run: DODO_SKINS[0].run,
      jump: DODO_SKINS[0].jump,
      palette: DODO_SKINS[0].palette,
    });
    expect(getRescueSprites().name).toBe('Gigi');
  });

  it('an out-of-range skin index falls back to skin 0, not a crash', () => {
    setGigiSkin(99);
    expect(getPlayerSprites().palette).toBe(GIGI_SKINS[0].palette);

    setSelectedChar('dodo');
    setDodoSkin(-1);
    expect(getPlayerSprites().palette).toBe(DODO_SKINS[0].palette);
  });
});

/**
 * The run loop, as two tables.
 *
 * Nothing here draws. The between-level cutscene, the rescue overlay and the win screen are
 * pictures and are checked in a browser like every other picture in this port; what IS
 * testable, and what a child would notice immediately if it were wrong, is the bookkeeping
 * underneath — which state follows which, when a level advances rather than ending the
 * game, and whether the points and lives a level was played with survive the World being
 * thrown away and rebuilt for the next one.
 *
 * Deliberately two whole journeys rather than a test per transition: the failure mode this
 * is guarding against is not "state X does the wrong thing", it is "the run drifts by one
 * somewhere", which only a whole run can show.
 */
describe('the run loop', () => {
  it('advances level by level, carries the score and lives across each rebuild, and wins after the last', () => {
    // Loses a life on levels 2 and 4, scores a hundred on every level, and walks the whole
    // run to its end. Each entry is what the level was ENTERED with, plus what finishing it
    // decided — so a level's row is the proof that the previous level's numbers arrived.
    const played: Array<Record<string, unknown>> = [];
    let world = createWorld(getCurrentLevel(), 'normal', 'gigi', getRunTotals());

    for (;;) {
      const level = getCurrentLevel();
      played.push({ level, livesIn: world.lives, scoreIn: world.score });

      world.score += 100;
      if (level === 1 || level === 3) playerDie(world);

      const outcome = finishLevel({ lives: world.lives, score: world.score });
      played[played.length - 1].outcome = outcome;
      if (outcome === 'game-won') break;
      world = createWorld(getCurrentLevel(), 'normal', 'gigi', getRunTotals());
    }

    expect(played).toEqual([
      { level: 0, livesIn: 3, scoreIn: 0, outcome: 'next-level' },
      { level: 1, livesIn: 3, scoreIn: 100, outcome: 'next-level' },
      { level: 2, livesIn: 2, scoreIn: 200, outcome: 'next-level' },
      { level: 3, livesIn: 2, scoreIn: 300, outcome: 'next-level' },
      { level: 4, livesIn: 1, scoreIn: 400, outcome: 'next-level' },
      { level: 5, livesIn: 1, scoreIn: 500, outcome: 'game-won' },
    ]);
    // The run has walked off the end of the table, which is what 'game-won' means. Nothing
    // resets it: the next `startRun` does that.
    expect(getCurrentLevel()).toBe(LEVELS.length);
  });

  it('spends a life per death and ends the run on the death that leaves none', () => {
    // The other half of the loop, and the only half the simulation decides for itself:
    // `stepWorld`'s dead branch counts the 90-frame respawn down and then either rebuilds
    // the level or gives up (index.html:1348). Three lives on normal, so the third death is
    // the one that ends it.
    const world = createWorld(0, 'normal', 'gigi');
    world.score = 750;
    const deaths: Array<Record<string, unknown>> = [];

    for (let i = 0; i < 3; i++) {
      playerDie(world);
      for (let frame = 0; frame < 90; frame++) stepWorld(world, emptyInput());
      deaths.push({ lives: world.lives, dead: world.dead, gameOver: world.gameOver });
    }

    expect(deaths).toEqual([
      // Respawned: `dead` cleared, the level rebuilt underneath, the run still going.
      { lives: 2, dead: false, gameOver: false },
      { lives: 1, dead: false, gameOver: false },
      // Out of lives. `dead` stays true — the world is not rebuilt, it is left where the
      // death put it for the scene to read the score off and leave.
      { lives: 0, dead: true, gameOver: true },
    ]);
    // A death is not a new game: the points survive all three of them (index.html's
    // `initLevel` never assigns `score`).
    expect(world.score).toBe(750);
  });

  it('starts a run at level zero with the difficulty\'s own lives and nothing scored', () => {
    setDifficulty('super_easy');
    startRun();
    expect(getCurrentLevel()).toBe(0);
    // Infinity is a real setting on the gentlest difficulty, not a debug state.
    expect(getRunTotals()).toEqual({ lives: DIFFICULTY_CONFIG.super_easy.lives, score: 0 });

    setDifficulty('hard');
    startRun();
    expect(getRunTotals()).toEqual({ lives: DIFFICULTY_CONFIG.hard.lives, score: 0 });
  });

  it('knows which level is the last one', () => {
    const answers = LEVELS.map((_, index) => isLastLevel(index));
    expect(answers).toEqual([false, false, false, false, false, true]);
  });
});

describe('getKidnapper', () => {
  it('gives every level a villain, and wraps rather than running off the end', () => {
    const perLevel = LEVELS.map((_, index) => getKidnapper(index));
    expect(perLevel).toEqual(KIDNAPPERS.slice(0, LEVELS.length));
    // The live modulo (index.html:825), which nothing reaches today — six levels, six
    // entries — and which is kept precisely so a seventh level does not crash a cutscene.
    expect(getKidnapper(KIDNAPPERS.length)).toBe(KIDNAPPERS[0]);
  });
});

describe('getEnemySpriteInfo', () => {
  it('resolves a real sprite and palette for every type any level actually spawns', () => {
    const types = new Set(LEVELS.flatMap((level) => level.enemyDefs.map((def) => def.type)));
    expect(types.size).toBeGreaterThan(0);
    for (const type of types) {
      const info = getEnemySpriteInfo(type);
      expect(Array.isArray(info.sprite), `${type}: sprite`).toBe(true);
      expect(Object.keys(info.palette).length, `${type}: palette`).toBeGreaterThan(0);
    }
  });
});
