/**
 * Every scene's name, in one file.
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
 * A name is not behaviour and does not belong to a class. Keeping the eight of them here
 * costs one import per scene and makes the cycle impossible rather than merely unlikely.
 *
 * It is also where Task 3's navigation table will go when it lands — the live `BACK_TARGET`
 * (index.html:1233-1236) is a map from state name to state name, which in this port is a map
 * from one of these to another.
 */

/** Pick a difficulty (index.html's `difficulty` state). Boots first, for now. */
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
