import Phaser from 'phaser';
import { sfxPickup } from '../audio/sfx';
import { BASE_H, BASE_W } from '../config/constants';
import { TStr } from '../config/i18n';
import { clampIndex } from '../game/menu';
import { MODE_ADVENTURE } from '../game/navigation';
import { GAME_FONT, GAME_FONT_BOLD, GAME_TEXT_RESOLUTION } from '../gfx/gameFont';
import { fitScreenCamera } from '../gfx/render';
import { bindMenuKeys, justDown, type MenuKeys, pressedAny } from '../input/menuKeys';
import { MODE_SELECT_SCENE_KEY, PAUSE_SCENE_KEY, TITLE_SCENE_KEY } from './keys';
import type { ModeSelectData } from './ModeSelectScene';
import { takeBack } from './navigate';

/**
 * Which scene is frozen underneath, so this one can wake it again.
 *
 * It replaces the live `pausePrev` (index.html:1245) and carries less: the live global has
 * to remember which STATE to put back, because pausing overwrote `gameState` and the world
 * would otherwise be drawn as a pause menu. Here the scene underneath was never disturbed —
 * it is still there, still holding its World, merely not being updated — so the only thing
 * worth remembering is its name.
 */
export interface PauseData {
  frozen: string;
}

/** index.html:1903. Dark enough to read over, light enough to see the level through. */
const WASH = 0x000000;
const WASH_ALPHA = 0.72;

/** index.html:1906. */
const TITLE_Y = 90;
const TITLE_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '26px', color: '#ffdd00',
};

/** index.html:1909-1911. Three buttons in a row, the row centred. */
const BUTTON_W = 176;
const BUTTON_H = 54;
const BUTTON_GAP = 16;
const BUTTON_Y = 170;
const BUTTON_COUNT = 3;
const ROW_W = BUTTON_COUNT * BUTTON_W + (BUTTON_COUNT - 1) * BUTTON_GAP;
const ROW_X = (BASE_W - ROW_W) / 2;
/** :1923. The label sits 33 below the button's top edge, on its baseline. */
const LABEL_DY = 33;
const LABEL_FONT = { fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '15px' };

/** :1914-1921. The chosen button is green and lit; the others are barely there. */
const CHOSEN_FILL = 0x88ff88;
const CHOSEN_FILL_ALPHA = 0.16;
const CHOSEN_EDGE_W = 3;
const CHOSEN_EDGE_INSET = 2;
const CHOSEN_COLOR = '#88ff88';
const PLAIN_FILL = 0xffffff;
const PLAIN_FILL_ALPHA = 0.06;
const PLAIN_COLOR = '#cccccc';

/** :1927. */
const HINT_Y = BASE_H - 40;
const HINT_FONT = { fontFamily: GAME_FONT, resolution: GAME_TEXT_RESOLUTION, fontSize: '12px', color: '#aaddcc' };

/** The three buttons, in the order the live game lays them out (index.html:1908, :1288-1290). */
const CONTINUE = 0;
const SWITCH_MODE = 1;
const MAIN_MENU = 2;

/**
 * The pause menu. Port of `drawPauseOverlay` (index.html:1902-1932), `openPause` /
 * `resumeFromPause` (:1246-1247) and the input between them (:1283-1293).
 *
 * ## A parallel scene, and why that is the whole point
 *
 * The live game has one canvas and one draw dispatch keyed on `gameState`, so to draw the
 * frozen level UNDER this menu it has to pretend, for the length of one function call, to
 * still be in the state it paused from (index.html:1653-1658):
 *
 *     const real = gameState;
 *     gameState = pausePrev;
 *     try { drawWorldFrame(); } finally { gameState = real; }
 *     drawPauseOverlay();
 *
 * A try/finally around a global reassignment, so that a throw inside the level's drawing
 * cannot leave the game believing it is playing. This scene is that picture with the
 * pretending removed: Phaser keeps RENDERING a paused scene and stops calling its `update`,
 * so the level under here is not a redrawn snapshot, it IS the level, standing still. There
 * is no `pausePrev` to put back and nothing to unwind on a throw.
 *
 * It renders on top because main.ts lists it last, which is also why it covers the HUD and
 * the two overlays — exactly as the live overlay does, being drawn after `drawWorldFrame`
 * and everything inside it.
 *
 * ## What freezing means
 *
 * SliceScene's fixed-step loop lives in its `update`, and so does every call into Arcade
 * (main.ts's `customUpdate: true` means Arcade steps only from in there). A paused scene's
 * `update` is not called, so the simulation, the bodies, the timers and the cues all stop
 * together and in the same place. Nothing is discarded: the World is the same object it was,
 * and resuming carries on from the frame it stopped on.
 *
 * The music keeps playing, which is the live behaviour (`openPause` touches no audio) and
 * the right one: a pause that also stopped the tune would sound like the game had crashed.
 */
export class PauseScene extends Phaser.Scene {
  private frozen = '';
  private index = CONTINUE;
  private keys!: MenuKeys;
  private leaving = false;
  private buttons!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];

  constructor() {
    super(PAUSE_SCENE_KEY);
  }

  init(data: PauseData): void {
    this.frozen = data.frozen;
    // index.html:1246 — `openPause` sets `pauseIdx=0` every time, so the cursor is on
    // CONTINUE whenever the menu opens rather than on whatever was picked last time.
    this.index = CONTINUE;
    this.leaving = false;
  }

  create(): void {
    fitScreenCamera(this);
    this.add.graphics().fillStyle(WASH, WASH_ALPHA).fillRect(0, 0, BASE_W, BASE_H);
    this.add.text(BASE_W / 2, TITLE_Y, TStr('pause_title'), TITLE_FONT).setOrigin(0.5, 1);

    this.buttons = this.add.graphics();
    this.labels = [TStr('pause_continue'), TStr('pause_switch'), TStr('pause_menu')].map(
      (label, i) => this.add
        .text(buttonX(i) + BUTTON_W / 2, BUTTON_Y + LABEL_DY, label, LABEL_FONT)
        .setOrigin(0.5, 1),
    );

    this.add.text(BASE_W / 2, HINT_Y, TStr('pause_hint'), HINT_FONT).setOrigin(0.5, 1);

    this.keys = bindMenuKeys(this);
    this.drawChoice();
  }

  update(): void {
    if (this.leaving) return;
    // index.html:1284-1285. Clamped, not wrapped — the same rule as the difficulty row, and
    // for the same reason: three buttons side by side, and wrapping would jump the cursor
    // the width of the screen in the direction nobody pressed.
    if (pressedAny(this.keys.left, this.keys.altLeft)) this.move(-1);
    if (pressedAny(this.keys.right, this.keys.altRight)) this.move(1);
    if (pressedAny(this.keys.confirm, this.keys.enter)) this.confirm();
    // index.html:1262 — back on a paused game resumes it, so the button that opened this
    // menu also closes it. The table says so; this asks it rather than assuming.
    if (justDown(this.keys.back)) takeBack(this, 'paused', () => this.resumeGame());
  }

  private move(delta: number): void {
    const next = clampIndex(this.index, delta, BUTTON_COUNT);
    if (next === this.index) return;
    this.index = next;
    this.drawChoice();
  }

  /**
   * index.html:1286-1291, the three buttons and where each one goes.
   *
   * The two that leave take the frozen scene with them rather than leaving it paused behind
   * the next screen forever — and stopping SliceScene fires its SHUTDOWN, which takes the HUD
   * and both overlays with it. The live game has no equivalent because it has no scenes: it
   * simply assigns a new `gameState` and the old one stops being drawn.
   *
   * SWITCH MODE lands on mode select with the cursor on ADVENTURE (`modeIndex=0` at :1289) and
   * MAIN MENU on the title, which is the one screen in the game that is not mid-anything.
   */
  private confirm(): void {
    sfxPickup();
    switch (this.index) {
      case CONTINUE:
        this.resumeGame();
        return;
      case SWITCH_MODE:
        this.leaving = true;
        this.scene.stop(this.frozen);
        this.scene.start(
          MODE_SELECT_SCENE_KEY,
          { index: MODE_ADVENTURE } satisfies ModeSelectData,
        );
        return;
      case MAIN_MENU:
        this.leaving = true;
        this.scene.stop(this.frozen);
        this.scene.start(TITLE_SCENE_KEY);
        return;
    }
  }

  /**
   * index.html:1247's `resumeFromPause`, sound and all. `sfxPickup` fires here even when the
   * exit was Escape rather than CONTINUE, because the live pair plays it on both.
   *
   * Resume first, stop second. Both are queued operations that the scene manager runs in
   * order between frames, so the level is already running again by the time this scene is
   * torn down and there is no frame drawn with neither of them updating.
   */
  private resumeGame(): void {
    if (this.leaving) return;
    this.leaving = true;
    sfxPickup();
    this.scene.resume(this.frozen);
    this.scene.stop();
  }

  /** The one thing on this screen that moves. */
  private drawChoice(): void {
    this.buttons.clear();
    this.labels.forEach((label, i) => {
      const x = buttonX(i);
      const chosen = i === this.index;
      if (chosen) {
        this.buttons
          .fillStyle(CHOSEN_FILL, CHOSEN_FILL_ALPHA)
          .fillRect(x, BUTTON_Y, BUTTON_W, BUTTON_H)
          .lineStyle(CHOSEN_EDGE_W, CHOSEN_FILL)
          .strokeRect(
            x - CHOSEN_EDGE_INSET,
            BUTTON_Y - CHOSEN_EDGE_INSET,
            BUTTON_W + CHOSEN_EDGE_INSET * 2,
            BUTTON_H + CHOSEN_EDGE_INSET * 2,
          );
      } else {
        this.buttons
          .fillStyle(PLAIN_FILL, PLAIN_FILL_ALPHA)
          .fillRect(x, BUTTON_Y, BUTTON_W, BUTTON_H);
      }
      label.setColor(chosen ? CHOSEN_COLOR : PLAIN_COLOR);
    });
  }
}

function buttonX(index: number): number {
  return ROW_X + index * (BUTTON_W + BUTTON_GAP);
}
