/**
 * Every state the game can be in, and the way out of each one.
 *
 * Port of index.html:1230-1272 — `BACK_TARGET`, `PAUSABLE`, `LEARN_STATES` and
 * `handleBack`. The live comment above the table is the reason it exists, and it is worth
 * having here in full (index.html:1230-1232):
 *
 * > Every state must have a way out. Before this existed, Escape was handled in 7 of 15
 * > states, so picking a character locked the player into the adventure with no exit at
 * > all on a controller.
 *
 * That is a bug that shipped, to children, on a controller with no keyboard anywhere near
 * it. It is not the kind of bug a spot check finds: seven of the states worked perfectly.
 * What finds it is asking the question of the WHOLE set at once, which is what the live
 * game's own `testBackNav` (index.html:3232-3262) does and what tests/navigation.test.ts
 * does here.
 *
 * ## Why this is data and not a method on each scene
 *
 * A scene that knows where its own Escape goes is a scene that can be written without one.
 * Eleven files, eleven chances to forget, and nothing anywhere that can be asked "is every
 * screen reachable backwards?" — which is exactly the shape the original bug had. As one
 * table it is a single object a test can iterate, and adding a screen without adding its
 * row is a test failure rather than a child stuck on a sofa.
 *
 * No Phaser here, and no scene keys either: this is the live game's state vocabulary, and
 * the port's map from these names to its own scenes lives next to the scenes, in
 * src/scenes/keys.ts. Which keeps this file testable in node and keeps the question it
 * answers ("where does back go from here?") separate from the question the scenes answer
 * ("which class draws that?").
 */

/**
 * The live `gameState` values, all sixteen — exactly the set `testBackNav` calls `ALL`
 * (index.html:3233-3235).
 *
 * Two of them have no scene in this port: `intro` and `debug` are not ported. They are in
 * the union anyway, because the TABLE is what is being ported and a half-copied table is the
 * thing the live comment warns about. Their rows cost nothing.
 */
export type GameState =
  | 'title'
  | 'modeselect'
  | 'difficulty'
  | 'select'
  | 'intro'
  | 'playing'
  | 'dead'
  | 'between'
  | 'levelcomplete'
  | 'gameover'
  | 'win'
  | 'debug'
  | 'learnmenu'
  | 'learnletters'
  | 'learnresult'
  | 'paused';

/** The same sixteen as a list, for the tests that must run over every one of them. */
export const GAME_STATES: readonly GameState[] = [
  'title', 'modeselect', 'difficulty', 'select', 'intro', 'playing', 'dead',
  'between', 'levelcomplete', 'gameover', 'win', 'debug', 'learnmenu',
  'learnletters', 'learnresult', 'paused',
];

/**
 * Where Escape goes from each state (index.html:1233-1236), verbatim.
 *
 * `title` is absent because it is the root and has nowhere further back — that is what
 * `handleBack` returning false means, and it is the ONLY state allowed to be missing from
 * here without being pausable instead.
 */
export const BACK_TARGET: Readonly<Partial<Record<GameState, GameState>>> = {
  modeselect: 'title',
  difficulty: 'modeselect',
  select: 'difficulty',
  intro: 'select',
  gameover: 'modeselect',
  win: 'modeselect',
  debug: 'title',
  learnmenu: 'modeselect',
  learnletters: 'learnmenu',
  learnresult: 'learnmenu',
};

/**
 * The states where back opens the pause menu instead of leaving (index.html:1240), with
 * the live reason at :1238-1239: "Mid-run states open the pause menu instead of quitting
 * outright: Select is easy to hit by accident and binning a run for it would be its own
 * clunk."
 *
 * Note what is in here besides `playing`. `dead` is the ninety frames after a death, and
 * `levelcomplete` the two hundred after a rescue — both are the world standing frozen with
 * a label over it, and both are moments a child might well reach for the button. `between`
 * is the eight-second cutscene, which is the longest single stretch of the game with
 * nothing to do in it. A pause menu that covered only the frames where the player can
 * actually move would be missing three of the four places a hand goes wandering.
 */
export const PAUSABLE: readonly GameState[] = ['playing', 'dead', 'between', 'levelcomplete'];

/**
 * index.html:1241, verbatim — including `learnsyllables`, which is NOT a `GameState` here.
 *
 * That is not a transcription slip in either direction. `learnsyllables` appears exactly
 * once in the whole live source, in this array: nothing ever assigns it to `gameState`, so
 * it is a state that was planned and never built, and `testBackNav`'s own list of every
 * state leaves it out. It is copied anyway because this array is live DATA rather than a
 * summary of it, and because the day somebody builds that screen the missing `BACK_TARGET`
 * row is the bug this whole file exists to prevent. A test names it, so it cannot quietly
 * become real without anyone noticing.
 */
export const LEARN_STATES: readonly string[] = [
  'learnmenu', 'learnletters', 'learnsyllables', 'learnresult',
];

/**
 * "Is the player in a menu rather than mid-run?" — index.html:1254-1257, and the live
 * comment at :1249-1253 on what it decides:
 *
 * > Drives two things: which gamepad buttons mean cancel/confirm, and whether the language
 * > toggle works at all. That toggle sits on button 3 — triangle on a DualSense, right
 * > where a small child's thumb lands — so leaving it live during play let them flip the
 * > whole game between Estonian and English mid-level by accident.
 *
 * In this port it decides the first of those two: which `PadContext` a screen binds its
 * keys in (input/menuKeys.ts's `padContextFor`), and therefore whether Ⓑ means back or
 * shoot and whether Start means confirm or pause. There is no language toggle yet.
 *
 * The list is NOT the complement of `PAUSABLE`, and the gap between them is deliberate:
 * `intro` and `between` are in neither. They are cutscenes — nothing to cancel and nothing
 * to shoot — and they take the play mapping so that Start pauses them rather than
 * confirming something.
 */
export const MENU_STATES: readonly GameState[] = [
  'title', 'modeselect', 'difficulty', 'select', 'learnmenu', 'learnresult',
  'gameover', 'win', 'debug', 'paused',
];

/** The two cards on the mode select screen, in the order it draws them (index.html:1978-1981). */
export const MODE_ADVENTURE = 0;
export const MODE_LEARN = 1;

/** Does back open the pause menu here, rather than leave? */
export function isPausable(state: GameState): boolean {
  return PAUSABLE.indexOf(state) >= 0;
}

/** Is this a menu rather than a run? See MENU_STATES. */
export function isMenuState(state: GameState): boolean {
  return MENU_STATES.indexOf(state) >= 0;
}

/**
 * Which card the mode select screen opens on when it is returned to (index.html:1268's
 * `modeIndex = LEARN_STATES.indexOf(gameState)>=0 ? 1 : 0`).
 *
 * Small, and worth porting exactly. Backing out of the learn screens onto a menu whose
 * cursor has silently jumped to ADVENTURE means pressing back and then confirm — the two
 * most natural buttons in the world — puts a child who wanted out of the letters into a
 * level instead. The cursor returning to where they were is what makes back feel like
 * back.
 */
export function modeCursorFor(from: GameState): number {
  return LEARN_STATES.indexOf(from) >= 0 ? MODE_LEARN : MODE_ADVENTURE;
}

/**
 * What pressing back does, as a value rather than as an effect.
 *
 * `resume` and `pause` name the two halves of the live pause pair (`resumeFromPause` and
 * `openPause`, index.html:1246-1247); `go` is a state change, carrying the mode cursor the
 * live code sets on its way (:1268); `none` is `handleBack` returning false — pressed, but
 * this state has nowhere to go.
 */
export type BackAction =
  | { kind: 'resume' }
  | { kind: 'pause' }
  | { kind: 'go'; target: GameState; modeIndex: number }
  | { kind: 'none' };

/**
 * Port of `handleBack` (index.html:1259-1272), with the key reading left to the caller.
 *
 * Three cases, and the ORDER is the behaviour:
 *
 *   1. Already paused? Unpause. Back closes the menu it opened, so the same button both
 *      opens and closes it and a child never has to find a different one.
 *   2. Mid-run? Open the pause menu rather than quit (see PAUSABLE).
 *   3. Otherwise look the state up in BACK_TARGET and go there, or do nothing if there is
 *      no row — which is `title` alone.
 *
 * The live function also plays a sound and writes globals; both belong to the caller. What
 * is here is the decision, which is the part that can be wrong in a way nobody sees until
 * a child is stuck.
 */
export function backFrom(state: GameState): BackAction {
  if (state === 'paused') return { kind: 'resume' };
  if (isPausable(state)) return { kind: 'pause' };
  const target = BACK_TARGET[state];
  if (!target) return { kind: 'none' };
  return { kind: 'go', target, modeIndex: modeCursorFor(state) };
}
