/**
 * The on-screen buttons for phones and tablets: the live game's (index.html:19-47, :53-67,
 * :1083-1102), which the port had left out, so on a touch screen nothing got past the title.
 *
 * Each button presses the key the live game's pressed, as a real KeyboardEvent on `window`,
 * which is where Phaser's keyboard listens. So every scene that reads the keyboard (the menus,
 * the levels, pause, the cutscenes) works from the buttons as it is, with no scene knowing
 * about touch. That is the reason this is a few DOM buttons over the game rather than Phaser
 * pointer input in every scene: the live game's buttons sat outside its canvas the same way.
 *
 * Pointer events, so a finger and a mouse both work, each button on its own pointer, so a
 * thumb can hold right while the other jumps. Sliding a finger off a button lets it go. The
 * port's Escape (back in the menus, pause in a level) gets a small button the live game did
 * not need. Shown only on a coarse pointer (index.html's CSS).
 */

export interface TouchKey {
  key: string;
  code: string;
  keyCode: number;
}

/** Each button's id in index.html, and the key it presses. */
export const TOUCH_BUTTONS: Readonly<Record<string, TouchKey>> = {
  'btn-left': { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  'btn-right': { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  'btn-up': { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  'btn-down': { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  'btn-jump': { key: ' ', code: 'Space', keyCode: 32 },
  'btn-shoot': { key: 'x', code: 'KeyX', keyCode: 88 },
  'btn-ok': { key: 'Enter', code: 'Enter', keyCode: 13 },
  'btn-back': { key: 'Escape', code: 'Escape', keyCode: 27 },
};

/**
 * The shortest a press lasts, in milliseconds. The game reads the keys once a frame and sees a
 * press as a key down this frame that was up the last (input/edges.ts), so a tap whose up comes
 * within the same frame as its down never happens at all (browser, 2026-11-23: a quick tap on OK
 * left the title where it was). Five frames is shorter than any finger's tap.
 */
export const MIN_PRESS_MS = 80;

/**
 * A key press as a real KeyboardEvent. Phaser matches keys on `keyCode` (KeyboardPlugin), and a
 * script cannot count on setting that through the event's options: Firefox ignores it there,
 * and so may other browsers, which left the buttons pressing nothing. So the event is made with
 * the standard `key` and `code`, and `keyCode` and `which` are put on it directly.
 */
export function keyEvent(type: 'keydown' | 'keyup', k: TouchKey): KeyboardEvent {
  const event = new KeyboardEvent(type, { key: k.key, code: k.code, bubbles: true, cancelable: true });
  Object.defineProperty(event, 'keyCode', { get: () => k.keyCode });
  Object.defineProperty(event, 'which', { get: () => k.keyCode });
  return event;
}

function send(type: 'keydown' | 'keyup', k: TouchKey): void {
  window.dispatchEvent(keyEvent(type, k));
}

export function installTouchControls(): void {
  for (const [id, k] of Object.entries(TOUCH_BUTTONS)) {
    const button = document.getElementById(id);
    if (!button) continue;
    let down = false;
    let downAt = 0;
    let letGo: number | undefined;
    const press = (e: Event) => {
      e.preventDefault();
      if (letGo !== undefined) {
        // Pressed again before a short tap's release went out: it is still down, so carry on.
        window.clearTimeout(letGo);
        letGo = undefined;
      } else if (down) {
        return;
      } else {
        send('keydown', k);
      }
      down = true;
      downAt = performance.now();
      button.classList.add('pressed');
    };
    const release = (e?: Event) => {
      e?.preventDefault();
      if (!down || letGo !== undefined) return;
      button.classList.remove('pressed');
      const up = () => {
        down = false;
        letGo = undefined;
        send('keyup', k);
      };
      const held = performance.now() - downAt;
      if (held >= MIN_PRESS_MS) up();
      else letGo = window.setTimeout(up, MIN_PRESS_MS - held);
    };
    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('pointerleave', release);
    // No long-press menu, no double-tap zoom, and never the keyboard focus (Space would press it).
    button.addEventListener('contextmenu', (e) => e.preventDefault());
    button.tabIndex = -1;
  }
  // A finger dragged across the controls must not scroll or zoom the page.
  document.getElementById('touch-controls')?.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
}
