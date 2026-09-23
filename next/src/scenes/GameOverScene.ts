import Phaser from 'phaser';
import { startBGM, stopBGM } from '../audio/bgm';
import { BASE_H, BASE_W } from '../config/constants';
import { TStr } from '../config/i18n';
import { BGM_GAMEOVER } from '../data/bgmThemes';
import { createFrameClock, type FrameClock } from '../game/frameClock';
import { bindMenuKeys, type MenuKeys, justDown } from '../input/menuKeys';
import { GAME_OVER_SCENE_KEY, TITLE_SCENE_KEY } from './keys';
import { takeBack } from './navigate';

/**
 * The run's final score, handed over by the scene that ran the level: the World it was read
 * off is gone by the time this screen is up, which is exactly why a results screen should be
 * given a number rather than hold a reference to something still moving.
 */
export interface GameOverData {
  score: number;
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
 * Two different places, which is new. Space and the timer both go to the TITLE
 * (index.html:1349), and Escape goes to mode select (`BACK_TARGET`, :1235) — one screen
 * further in, past the title's press-start. Both of those used to lead to the difficulty
 * screen because neither destination existed in this port, and the scene was handed a
 * `next` to hide that; now the table knows, so it is asked.
 */
export class GameOverScene extends Phaser.Scene {
  private score = 0;
  private clock!: FrameClock;
  private keys!: MenuKeys;
  private leaving = false;

  constructor() {
    super(GAME_OVER_SCENE_KEY);
  }

  init(data: GameOverData): void {
    this.score = data.score;
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
      // index.html:1349's `gameState='title';stopBGM();`. The title is silent until its own
      // confirm starts the menu theme again, which is exactly how the live one sounds.
      stopBGM();
      this.scene.start(TITLE_SCENE_KEY);
      return;
    }
    // index.html:1235 — Escape goes to mode select rather than to the title, so a child who
    // wants another go immediately can skip the press-start. Worth binding now that the two
    // exits lead to different screens; while both landed on the difficulty screen it was a
    // second way to do one thing.
    //
    // No `stopBGM` on this one, and that is the live game: `handleBack` (index.html:1259)
    // touches no audio, so the game-over jingle follows you onto the mode select for as long
    // as it takes to start a level. See navigate.ts.
    if (justDown(this.keys.back)) {
      this.leaving = true;
      takeBack(this, 'gameover');
    }
  }
}
