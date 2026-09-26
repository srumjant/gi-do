import Phaser from 'phaser';
import { TStr } from '../config/i18n';

/** How long the pointer rests before the button fades: 3 seconds, like a video player's controls. */
const IDLE_MS = 3000;

/**
 * The full-screen button: the live game's, in the top-right corner (index.html:17-18, :52,
 * :1105-1129), with Phaser's Scale Manager doing the work instead of the browser's
 * prefixed calls.
 *
 * - A click goes full screen or back. Esc leaves too, as the browser always allows, and the
 *   icon follows the Scale Manager's enter and leave events, so it is right after an Esc.
 * - What goes full screen is the game's container, `#game` (main.ts's `fullscreenTarget`).
 *   The button lives inside it, so it is still there to click back out.
 * - It fades while the pointer rests, and comes back when it moves. The live button stayed,
 *   but there the canvas stopped at twice its size and the corner was usually empty. Here
 *   the canvas fills the window, and full screen on a 16:10 screen puts the corner over the
 *   HUD. Children on the keyboard or a pad never see it; a parent's mouse brings it back.
 * - It never keeps the keyboard focus: a focused button is pressed by Space, the jump key.
 * - A browser with no full-screen support (an iPhone) gets no button at all.
 *
 * The live game also turns a phone to landscape on the way in (:1122). That belongs with the
 * touch controls, which the port does not have yet.
 */
export function installFullscreenButton(game: Phaser.Game): void {
  const button = document.getElementById('fullscreen');
  if (!(button instanceof HTMLButtonElement) || !game.device.fullscreen.available) return;
  const scale = game.scale;

  const label = (): void => {
    const on = scale.isFullscreen;
    button.classList.toggle('on', on);
    button.title = TStr(on ? 'fullscreen_off' : 'fullscreen_on');
    button.setAttribute('aria-label', button.title);
  };
  scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, label);
  scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, label);

  button.addEventListener('click', () => {
    scale.toggleFullscreen();
    button.blur();
  });

  let timer = 0;
  const wake = (): void => {
    button.classList.remove('idle');
    window.clearTimeout(timer);
    timer = window.setTimeout(() => button.classList.add('idle'), IDLE_MS);
  };
  window.addEventListener('pointermove', wake);
  window.addEventListener('pointerdown', wake);

  label();
  button.hidden = false;
  wake();
}
