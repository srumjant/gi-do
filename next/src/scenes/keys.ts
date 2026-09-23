import type { GameState } from '../game/navigation';

/**
 * Every scene's name, in one file, and which of the live game's states each one answers to.
 *
 * They started out next to the classes that use them, one `export const` per scene file,
 * and that worked for as long as the screens formed a straight line: difficulty, then
 * character, then the level. The run loop closes the line into a ring — the level ends at
 * the game-over screen, which goes back to the difficulty screen, which eventually starts
 * the level again — and a ring of scene files importing each other's constants is a ring of
 * ES modules importing each other. That resolves, today, because every one of those names is
 * read inside a method rather than at module scope; it resolves right up until somebody
 * writes a `const TARGETS = { ... }` at the top of a file and gets `undefined` for one entry
 * on a Tuesday.
 *
 * A name is not behaviour and does not belong to a class. Keeping the thirteen of them here
 * costs one import per scene and makes the cycle impossible rather than merely unlikely.
 *
 * The navigation table itself is NOT here, and that is the one thing this file's earlier
 * comment got wrong. `BACK_TARGET` is a map from live state to live state — `select` to
 * `difficulty` — and it belongs with the other rules about how the game behaves, in
 * src/game/navigation.ts, where it can be tested without a browser. What belongs here is
 * the far duller half: which of this port's scenes draws which of those states.
 */

/** The first screen a child sees (index.html's `title`). Boots. */
export const TITLE_SCENE_KEY = 'Title';
/** Adventure or learn (`modeselect`). */
export const MODE_SELECT_SCENE_KEY = 'ModeSelect';
/** Learn mode, which is not ported: a screen that says so (stands in for `learnmenu`). */
export const LEARN_SCENE_KEY = 'Learn';
/** Pick a difficulty (`difficulty`). */
export const DIFFICULTY_SCENE_KEY = 'Difficulty';
/** Pick a character and a skin (`select`). */
export const CHARACTER_SCENE_KEY = 'Character';
/** The level itself (`playing`, and the frozen `dead` and `levelcomplete` inside it). */
export const SLICE_SCENE_KEY = 'Slice';
/** Lives, score, level name and power-ups. Runs alongside the level. */
export const HUD_SCENE_KEY = 'Hud';
/** The two overlays the live game draws over the frozen world (index.html:1898-1899). */
export const LEVEL_OVERLAY_SCENE_KEY = 'LevelOverlay';
/** The silly power-up announcement. Runs alongside the level, in front of the HUD. */
export const POWERUP_POPUP_SCENE_KEY = 'PowerupPopup';
/** The between-level cutscene (`between`). */
export const BETWEEN_SCENE_KEY = 'Between';
/** Out of lives (`gameover`). */
export const GAME_OVER_SCENE_KEY = 'GameOver';
/** The last level is finished (`win`). */
export const WIN_SCENE_KEY = 'Win';
/** The pause menu (`paused`), over a frozen game scene rather than instead of it. */
export const PAUSE_SCENE_KEY = 'Pause';

/**
 * Which scene draws which live state.
 *
 * Three states map to SliceScene, because in the live game they are one screen with the
 * simulation stopped: `dead` and `levelcomplete` are the frozen world with a label over it,
 * and the label is a scene of its own already (LevelOverlayScene). Four states map to
 * nothing at all — `intro` and `debug` are not ported, and `learnletters`/`learnresult` sit
 * behind the one placeholder that stands in for the whole of learn mode.
 *
 * The gaps are what makes this worth writing down. A `BACK_TARGET` row pointing at a state
 * with no scene would be a back button that leads nowhere, and the test that checks for
 * that needs something to check against — which is this, rather than a reading of eleven
 * scene files.
 */
export const SCENE_FOR_STATE: Readonly<Partial<Record<GameState, string>>> = {
  title: TITLE_SCENE_KEY,
  modeselect: MODE_SELECT_SCENE_KEY,
  difficulty: DIFFICULTY_SCENE_KEY,
  select: CHARACTER_SCENE_KEY,
  playing: SLICE_SCENE_KEY,
  dead: SLICE_SCENE_KEY,
  levelcomplete: SLICE_SCENE_KEY,
  between: BETWEEN_SCENE_KEY,
  gameover: GAME_OVER_SCENE_KEY,
  win: WIN_SCENE_KEY,
  learnmenu: LEARN_SCENE_KEY,
  paused: PAUSE_SCENE_KEY,
};
