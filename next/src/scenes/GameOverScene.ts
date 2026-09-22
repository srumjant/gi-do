import Phaser from 'phaser';
import { startBGM, stopBGM } from '../audio/bgm';
import { BASE_H, BASE_W } from '../config/constants';
import { TStr } from '../config/i18n';
import { BGM_GAMEOVER } from '../data/bgmThemes';
import { createFrameClock, type FrameClock } from '../game/frameClock';
import { bindMenuKeys, type MenuKeys, justDown } from '../input/menuKeys';
import { GAME_OVER_SCENE_KEY } from './keys';

/**
 * The run's final score, and where to go when the screen is done with. Both handed over by
 * the scene that ran the level: the World it read the score off is gone by the time this
 * screen is up, which is exactly why a results screen should be given a number rather than
 * hold a reference to something still moving.
 */
export interface GameOverData {
  score: number;
  next: string;
}

/** index.html:1349. Three seconds, or Space — whichever comes first. */
const AUTO_EXIT = 180;

/** index.html:2442-2444. A near-black wash and three centred lines. */
const BACKGROUND = '#220000';
const TITLE_DY = -20;
const SCORE_DY = 20;
const HINT_DY = 50;

const TITLE_FONT = {
  fontFamily: 'monospace', fontSize: '32px', fontStyle: 'bold', color: '#ff3333',
};
const SCORE_FONT = { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' };
const HINT_FONT = { fontFamily: 'monospace', fontSize: '12px', color: '#ffffff' };

/**
 * Out of lives. Port of `drawGameOver` (index.html:2441-2445) and the state that runs it
 * (:1349).
 *
 * Five lines of live drawing, and the smallest screen in the port — the work in it is all
 * on the other side: `stepWorld`'s dead branch sets `world.gameOver` when the respawn
 * countdown runs out with nothing left (index.html:1348), and SliceScene reads it and comes
 * here.
 *
 * ## Where it goes afterwards
 *
 * The live game goes to `title` on Space or on the timer running out (:1349), and to
 * `modeselect` on Escape (`BACK_TARGET`, :1235). Neither screen exists in this port yet, so
 * both routes lead to the difficulty screen instead, which is this port's root — the first
 * screen in main.ts's scene list and the one with nowhere further back to go. `next` is
 * passed in rather than imported so that when the title and mode select land, the
 * navigation table decides this and not this file.
 *
 * Escape is not bound at all here, for the same reason DifficultyScene does not bind it:
 * both exits would go to the same place, and a second way to do the one thing the timer
 * already does on its own is not worth the line.
 */
export class GameOverScene extends Phaser.Scene {
  private score = 0;
  private next = '';
  private clock!: FrameClock;
  private keys!: MenuKeys;
  private leaving = false;

  constructor() {
    super(GAME_OVER_SCENE_KEY);
  }

  init(data: GameOverData): void {
    this.score = data.score;
    this.next = data.next;
    this.leaving = false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND);
    // index.html:1348's `startBGM(BGM_GAMEOVER)`, which the live game plays on the line
    // that ENTERS this state — the same moment SliceScene reads `world.gameOver` and
    // starts this scene. The level's own music was stopped by the death ninety frames ago
    // (playerDie, game/player.ts), so this lands in a silence rather than over anything.
    startBGM(BGM_GAMEOVER);
    this.clock = createFrameClock();
    this.keys = bindMenuKeys(this);

    this.line(TITLE_DY, TITLE_FONT, TStr('game_over'));
    // `score_label` carries its own trailing space and colon, so this is a bare
    // concatenation and not a missing separator — the same shape the HUD's score uses.
    this.line(SCORE_DY, SCORE_FONT, TStr('score_label') + this.score);
    this.line(HINT_DY, HINT_FONT, TStr('press_retry'));
  }

  private line(
    dy: number,
    style: Phaser.Types.GameObjects.Text.TextStyle,
    text: string,
  ): Phaser.GameObjects.Text {
    return this.add.text(BASE_W / 2, BASE_H / 2 + dy, text, style).setOrigin(0.5, 1);
  }

  update(_time: number, delta: number): void {
    if (this.leaving) return;
    // Space alone, not Enter: index.html:1349 checks `justPressed['Space']` and nothing
    // else. The between-level cutscene takes both; these two end screens take one.
    if (this.clock.advance(delta) >= AUTO_EXIT || justDown(this.keys.confirm)) {
      this.leaving = true;
      // index.html:1349's `gameState='title';stopBGM();`. The screen this returns to is
      // silent until the next confirm unlocks and starts the menu theme again
      // (DifficultyScene) — exactly as the live title screen is.
      stopBGM();
      this.scene.start(this.next);
    }
  }
}
