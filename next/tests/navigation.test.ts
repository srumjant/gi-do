import { describe, expect, it } from 'vitest';
import {
  BACK_TARGET,
  backFrom,
  GAME_STATES,
  type GameState,
  isMenuState,
  isPausable,
  LEARN_STATES,
  MENU_STATES,
  MODE_ADVENTURE,
  MODE_LEARN,
  modeCursorFor,
  PAUSABLE,
} from '../src/game/navigation';
import { SCENE_FOR_STATE } from '../src/scenes/keys';

/**
 * The live game's own `testBackNav` (index.html:3232-3262), ported, plus the three
 * questions this port can ask that the original cannot.
 *
 * Every assertion below runs over the WHOLE state set. That is not a style preference: the
 * bug this table exists to prevent (index.html:1230-1232) left seven of fifteen states
 * working perfectly and the eighth — the one after picking a character — with no way out at
 * all on a controller. A test per state, written by the same hand that wrote the table,
 * would have covered exactly the seven that already worked.
 */

/** Follow back from `state` as far as it goes, and report the states passed through. */
function walkBack(state: GameState): GameState[] {
  const path: GameState[] = [];
  let at: GameState | undefined = state;
  // One step per state at most: a longer walk is a cycle, which the caller asserts against
  // rather than hanging the test run on.
  for (let step = 0; at && step <= GAME_STATES.length; step++) {
    path.push(at);
    at = BACK_TARGET[at];
  }
  return path;
}

describe('every state has a way out', () => {
  // index.html:3236-3240, the assertion the whole table exists for.
  it('covers all sixteen states', () => {
    const stranded = GAME_STATES.filter(
      (s) => s !== 'title' && s !== 'paused' && !BACK_TARGET[s] && !isPausable(s),
    );
    expect(stranded).toEqual([]);
  });

  // The other half of the same statement, said as an equality so that a state SILENTLY
  // acquiring a way out is as visible as one losing it. `title` is the root and `paused` is
  // the menu back closes.
  it('names the two states that are exceptions, and only those two', () => {
    const exceptions = GAME_STATES.filter((s) => !BACK_TARGET[s] && !isPausable(s));
    expect(exceptions).toEqual(['title', 'paused']);
  });

  // index.html:3241-3242.
  it('never sends a state back to itself', () => {
    const selfLoops = Object.entries(BACK_TARGET).filter(([from, to]) => from === to);
    expect(selfLoops).toEqual([]);
  });

  // index.html:3243-3244.
  it('only ever goes back to a real state', () => {
    const unknown = Object.values(BACK_TARGET).filter((to) => GAME_STATES.indexOf(to) < 0);
    expect(unknown).toEqual([]);
  });

  // index.html:3245-3246. A state that is both would pause AND have a quit route, and
  // `backFrom` would silently pick the pause — so the row would be dead code that reads
  // like a promise.
  it('never makes a state both pausable and backable', () => {
    expect(PAUSABLE.filter((s) => BACK_TARGET[s])).toEqual([]);
  });

  /**
   * Not in `testBackNav`, and the one that catches a swapped pair. Every other assertion
   * here passes happily on a table where `difficulty` goes back to `select` and `select`
   * back to `difficulty`: both have targets, neither points at itself, both targets are
   * real states. Only walking the chain notices that back now means "go round in circles".
   */
  it('always leads home, from every state that leads anywhere', () => {
    for (const state of GAME_STATES) {
      if (!BACK_TARGET[state]) continue;
      const path = walkBack(state);
      expect(new Set(path).size, `back from ${state} loops: ${path.join(' -> ')}`)
        .toBe(path.length);
      expect(path[path.length - 1], `back from ${state} ends at a state that is not the root`)
        .toBe('title');
    }
  });
});

describe('the three cases of handleBack, in order', () => {
  // index.html:1262. First, and before the pausable check — `paused` is not in PAUSABLE, but
  // the order is what makes the same button open and close the menu.
  it('resumes when already paused', () => {
    expect(backFrom('paused')).toEqual({ kind: 'resume' });
  });

  // index.html:1263, over every mid-run state rather than over `playing` alone. `dead`,
  // `between` and `levelcomplete` are the three that are easy to forget and are exactly the
  // stretches where a child's hand wanders.
  it('opens the pause menu from every mid-run state', () => {
    for (const state of PAUSABLE) {
      expect(backFrom(state), `back from ${state}`).toEqual({ kind: 'pause' });
    }
  });

  // index.html:1264-1270.
  it('goes to the table\'s target from every state that has one', () => {
    for (const state of GAME_STATES) {
      const target = BACK_TARGET[state];
      if (!target) continue;
      expect(backFrom(state), `back from ${state}`)
        .toEqual({ kind: 'go', target, modeIndex: modeCursorFor(state) });
    }
  });

  // index.html:1267 — pressed, but nowhere to go. True of the root and of nothing else.
  it('does nothing only at the root', () => {
    const nowhere = GAME_STATES.filter((s) => backFrom(s).kind === 'none');
    expect(nowhere).toEqual(['title']);
  });
});

describe('the mode select cursor follows you back', () => {
  // index.html:1268. Leaving the letters must put the cursor back on the letters, or back
  // then confirm — the two most natural buttons there are — drops a child into a level.
  it('lands on learn from every learn state and on adventure from everywhere else', () => {
    for (const state of GAME_STATES) {
      const expected = LEARN_STATES.indexOf(state) >= 0 ? MODE_LEARN : MODE_ADVENTURE;
      expect(modeCursorFor(state), `cursor after leaving ${state}`).toBe(expected);
    }
  });

  it('carries that cursor on the action itself', () => {
    expect(backFrom('learnmenu')).toEqual({
      kind: 'go', target: 'modeselect', modeIndex: MODE_LEARN,
    });
    expect(backFrom('gameover')).toEqual({
      kind: 'go', target: 'modeselect', modeIndex: MODE_ADVENTURE,
    });
  });

  /**
   * `learnsyllables` is in the live `LEARN_STATES` (index.html:1241) and in nothing else in
   * the whole file — never assigned, never drawn, and left out of `testBackNav`'s own list
   * of states. Pinned rather than quietly dropped: the day it becomes real it needs a
   * `BACK_TARGET` row, and this failing is how that gets noticed.
   */
  it('names the one learn state that does not exist', () => {
    const missing = LEARN_STATES.filter((s) => GAME_STATES.indexOf(s as GameState) < 0);
    expect(missing).toEqual(['learnsyllables']);
  });
});

describe('menu states and run states do not blur together', () => {
  // index.html:3253-3255. A live-run state counting as a menu would put cancel on the
  // shoot button mid-level.
  it('counts no mid-run state as a menu', () => {
    expect(PAUSABLE.filter(isMenuState)).toEqual([]);
  });

  // index.html:3256-3260.
  it('counts the title, the pause menu and the learn menu as menus', () => {
    expect(isMenuState('title')).toBe(true);
    expect(isMenuState('paused')).toBe(true);
    expect(isMenuState('learnmenu')).toBe(true);
  });

  it('does not count the learn climb as a menu', () => {
    expect(isMenuState('learnletters')).toBe(false);
  });

  it('lists only real states', () => {
    expect(MENU_STATES.filter((s) => GAME_STATES.indexOf(s) < 0)).toEqual([]);
  });

  // The two cutscenes are in neither list, which is easy to read as an oversight in both.
  // It is the same decision twice: nothing to cancel, and Start should pause.
  it('leaves the cutscenes out of both lists', () => {
    for (const state of ['intro', 'between'] as GameState[]) {
      expect(isMenuState(state), `${state} is a menu`).toBe(false);
    }
    expect(isPausable('intro')).toBe(false);
    expect(isPausable('between')).toBe(true);
  });
});

/**
 * The port's own half. The live game cannot ask these: its states ARE its screens, drawn by
 * a dispatch that covers all of them. Here a state is a scene, six states have no scene
 * yet, and a back route into one of those six would be a button that leads nowhere.
 */
describe('every route this port can take leads to a screen that exists', () => {
  it('never sends a ported screen back to an unported one', () => {
    const broken = Object.entries(BACK_TARGET)
      .filter(([from]) => SCENE_FOR_STATE[from as GameState])
      .filter(([, to]) => !SCENE_FOR_STATE[to])
      .map(([from, to]) => `${from} -> ${to}`);
    expect(broken).toEqual([]);
  });

  it('has a scene to freeze for every mid-run state', () => {
    expect(PAUSABLE.filter((s) => !SCENE_FOR_STATE[s])).toEqual([]);
  });

  it('has a scene for the pause menu itself', () => {
    expect(SCENE_FOR_STATE.paused).toBeTruthy();
  });

  /**
   * The states this port does NOT draw, named. Adding a screen without adding its row here
   * fails this, which is a cheap reminder to check the row in `BACK_TARGET` at the same
   * time — the one thing the original bug came from forgetting.
   */
  it('names exactly what is left to port', () => {
    const missing = GAME_STATES.filter((s) => !SCENE_FOR_STATE[s]);
    expect(missing).toEqual(['intro', 'debug', 'learnresult']);
  });
});
