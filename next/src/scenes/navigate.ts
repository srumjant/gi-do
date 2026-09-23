import Phaser from 'phaser';
import { sfxPickup } from '../audio/sfx';
import { backFrom, type GameState } from '../game/navigation';
import { PAUSE_SCENE_KEY, SCENE_FOR_STATE } from './keys';
import type { ModeSelectData } from './ModeSelectScene';
import type { PauseData } from './PauseScene';

/**
 * Doing what `backFrom` decided — the effects half of the live `handleBack`
 * (index.html:1259-1272), with the decision left in game/navigation.ts where it can be
 * tested.
 *
 * One function rather than a method on a base class, and one place that knows how a scene
 * is left: eleven screens that each start the next by hand are eleven chances for one of
 * them to forget the sound, or the cursor, or to pause instead of stopping. The live game
 * has exactly one `handleBack` for the same reason.
 */

/**
 * Press back on `state` and let it happen.
 *
 * `onResume` is only ever called for `paused`, and only PauseScene passes it: the pause menu
 * is the one screen whose back does not go anywhere, and the only one that knows which scene
 * is frozen underneath it.
 */
export function takeBack(scene: Phaser.Scene, state: GameState, onResume?: () => void): void {
  const action = backFrom(state);
  switch (action.kind) {
    case 'resume':
      onResume?.();
      return;
    case 'pause':
      openPause(scene);
      return;
    case 'go':
      goToState(scene, action.target, action.modeIndex);
      return;
    case 'none':
      // index.html:1267 — pressed, and this state has nowhere to go. The root, and nothing
      // else; a test says so.
      return;
  }
}

/**
 * Leave for another state's screen, with the sound the live game plays on the way
 * (index.html:1269's `sfxPickup()`).
 *
 * `SCENE_FOR_STATE` is asked rather than a scene key being passed in, so that a route that
 * leads to a screen this port has not built yet is impossible to write rather than merely
 * unlikely — and so the same navigation test that checks the table also checks the routes.
 *
 * ## The one sound, and no others
 *
 * `sfxPickup` is the whole of what back does to the audio, here and in the live game: no
 * `stopBGM`, no theme change. Which has a consequence worth knowing before it is reported as
 * a bug, because it is reproduced rather than introduced. Back out of the game-over screen
 * inside its three-second timer and its jingle follows you onto the mode select; quit to the
 * title from the pause menu and the level's theme follows you there and plays until the
 * title's confirm starts the menu theme over it. Both are what index.html does — `handleBack`
 * (:1259-1272) and the pause menu's exits (:1288-1290) touch no audio at all, and only the
 * timed exits from game over and win call `stopBGM` (:1349, :1352).
 */
export function goToState(scene: Phaser.Scene, target: GameState, modeIndex = 0): void {
  const key = SCENE_FOR_STATE[target];
  if (!key) return;
  sfxPickup();
  // The mode select screen is the one target that arrives with something to say: which card
  // the cursor sits on (index.html:1268). Every other screen sets its own.
  const data: ModeSelectData | undefined = target === 'modeselect'
    ? { index: modeIndex }
    : undefined;
  scene.scene.start(key, data);
}

/**
 * Freeze the game and put the pause menu over it — the live `openPause` (index.html:1246),
 * minus the trick it needs and this does not.
 *
 * The live game has one canvas and one draw dispatch, so to draw the frozen level under the
 * pause menu it temporarily reassigns `gameState` back to `pausePrev` inside a try/finally
 * (index.html:1653-1658) and re-enters its own drawing for a state it is not in. A second
 * scene, running in parallel over a paused one, is that same picture without the lie:
 * Phaser keeps RENDERING a paused scene and only stops calling its `update`, which is
 * exactly and only what pausing means here — the world stays on screen, in place, and stops
 * moving.
 *
 * `pausePrev` has no equivalent either. The live game must remember which state to put back;
 * here the frozen scene is still there, still holding its World, and resuming is telling it
 * to carry on. That is why the scene key goes across to the pause menu: it is the whole of
 * what the live pair of globals carried.
 */
export function openPause(scene: Phaser.Scene): void {
  sfxPickup();
  scene.scene.pause();
  scene.scene.launch(PAUSE_SCENE_KEY, { frozen: scene.scene.key } satisfies PauseData);
}
