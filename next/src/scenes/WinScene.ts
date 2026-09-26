import Phaser from 'phaser';
import { BASE_H, BASE_W } from '../config/constants';
import { getDifficulty } from '../config/difficulty';
import { capitals, TDiff, TStr } from '../config/i18n';
import { startBGM, stopBGM } from '../audio/bgm';
import { sfxWin } from '../audio/sfx';
import { BGM_WIN } from '../data/bgmThemes';
import { createFrameClock, type FrameClock } from '../game/frameClock';
import { characterName, siblingOf } from '../game/menu';
import type { Character } from '../game/player';
import { random } from '../game/random';
import { getSelectedChar, getSkinIndex } from '../game/run';
import { GAME_FONT, GAME_FONT_BOLD, GAME_TEXT_RESOLUTION } from '../gfx/gameFont';
import {
  registerScaledPlayerTextures,
  registerWinHeartTexture,
  scaledPlayerTextureKey,
  WIN_HEART_TEXTURE,
} from '../gfx/textures';
import { bindMenuKeys, type MenuKeys, justDown } from '../input/menuKeys';
import { TITLE_SCENE_KEY, WIN_SCENE_KEY } from './keys';
import { takeBack } from './navigate';

/** The finished run's score. See GameOverData. */
export interface WinData {
  score: number;
}

/** index.html:1352. Five seconds, or Space. */
const AUTO_EXIT = 300;

/** index.html:2448. */
const BACKGROUND = '#112244';

/** index.html:2453-2455, :2459 — absolute baselines, not offsets from the centre. */
const SAVED_Y = 90;
const BEST_Y = 130;
const SUMMARY_Y = 160;
const HINT_Y = 330;

const SAVED_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '28px', color: '#ff69b4',
};
const BEST_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '18px', color: '#ffdd00',
};
const SUMMARY_FONT = { fontFamily: GAME_FONT, resolution: GAME_TEXT_RESOLUTION, fontSize: '14px', color: '#aaddff' };
const HINT_FONT = { fontFamily: GAME_FONT, resolution: GAME_TEXT_RESOLUTION, fontSize: '12px', color: '#ffffff' };

/** The two of them standing together (index.html:2457). Scale 4, and the sibling sits lower. */
const PORTRAIT_SCALE = 4;
const HERO_X = BASE_W / 2 - 45;
const HERO_Y = 180;
const SIBLING_X = BASE_W / 2 + 10;
const SIBLING_Y = 195;

/** The row of five bobbing hearts (index.html:2458), drawn over both of them. */
const HEART_COUNT = 5;
const HEART_X = BASE_W / 2 - 60;
const HEART_STEP = 30;
const HEART_Y = 175;
const HEART_BOB = 10;

/** index.html:2449-2451. Fifteen squares every tenth frame, from the top half of the screen. */
const CONFETTI_COLOURS = ['#ff3355', '#ffdd00', '#33ff88', '#3388ff', '#ff69b4'];
const CONFETTI_EVERY = 10;
const CONFETTI_PER_BURST = 15;
const CONFETTI_SIZE = 4;
/** Its own gravity, and nothing to do with the world's — this is a firework, not a body. */
const CONFETTI_GRAVITY = 0.1;
/** `pt.life/40` as an alpha, with life starting somewhere in 30..55 (index.html:1157). */
const CONFETTI_FADE = 40;

interface Confetto {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  colour: number;
}

/**
 * The last level is finished. Port of `drawWin` (index.html:2447-2460) and the state that
 * runs it (:1352).
 *
 * Reached from SliceScene by way of `finishLevel` (game/run.ts) saying `'game-won'` — that
 * is, the rescue on level 6 with no level 7 behind it. Fourteen lines of live drawing, of
 * which four are a confetti cannon.
 *
 * ## The confetti
 *
 * The live win screen is the one place in the game that spawns particles from the DRAW
 * function and steps them there too (index.html:2449-2451): a burst every tenth frame, its
 * own gravity of 0.1, and an alpha of `life/40`. It is not the world's particle system —
 * that one is per-level and is not ported at all — and it does not survive this screen, so
 * it lives here, in the screen, as thirty lines rather than as an engine.
 *
 * It also cannot be a Phaser particle emitter without becoming a different thing: the
 * numbers above are the live game's and the whole point of them is that this looks like the
 * screen the children already know.
 *
 * ## Where it goes afterwards
 *
 * The same answer as GameOverScene, and now the same two answers: `title` on Space or on the
 * timer (:1352), `modeselect` on Escape (:1235). Both used to lead to the difficulty screen
 * because neither of those screens existed in this port.
 */
export class WinScene extends Phaser.Scene {
  private score = 0;
  private clock!: FrameClock;
  private keys!: MenuKeys;
  private leaving = false;
  /** The frame the confetti was last stepped on, so it steps once per frame, not per render. */
  private lastFrame = 0;
  private confetti: Confetto[] = [];
  private sparks!: Phaser.GameObjects.Graphics;
  private hearts: Phaser.GameObjects.Image[] = [];

  constructor() {
    super(WIN_SCENE_KEY);
  }

  init(data: WinData): void {
    this.score = data.score;
    this.leaving = false;
    this.lastFrame = 0;
    this.confetti = [];
  }

  create(): void {
    registerScaledPlayerTextures(this, [['stand', PORTRAIT_SCALE]]);
    registerWinHeartTexture(this);

    this.cameras.main.setBackgroundColor(BACKGROUND);
    // index.html:1350's `sfxWin();startBGM(BGM_WIN);`, in that order — the fanfare fires
    // over the first moments of the theme rather than before it. Both sit on the live line
    // that enters this state, which is the same moment SliceScene starts this scene.
    //
    // Note there is a SECOND sfxWin two hundred frames earlier: the rescue itself
    // (index.html:1631, the `win` cue) plays one and then stops the music. So finishing
    // the last level really does sound the fanfare twice, and the second one is the one
    // that arrives with the music.
    sfxWin();
    startBGM(BGM_WIN);
    this.clock = createFrameClock();
    this.keys = bindMenuKeys(this);

    // Created first, so it sits behind every word and both portraits: the live game draws
    // the particles immediately after the background fill and before anything else.
    this.sparks = this.add.graphics();

    const hero: Character = getSelectedChar();
    const sibling = siblingOf(hero);
    // index.html:2452-2454. 'GIGI IS SAVED!' is the rescued sibling; '<hero> is the best!'
    // is whoever did the rescuing. Neither name is translated — see game/menu.ts.
    this.line(SAVED_Y, SAVED_FONT, characterName(sibling).toUpperCase() + TStr('is_saved'));
    this.line(BEST_Y, BEST_FONT, capitals(characterName(hero)) + TStr('is_the_best'));
    // :2455. Four fragments run together, and both labels carry their own punctuation.
    const summary = TStr('difficulty_label') + TDiff(getDifficulty())
      + TStr('final_score') + this.score;
    this.line(SUMMARY_Y, SUMMARY_FONT, summary);

    this.portrait(hero, HERO_X, HERO_Y);
    this.portrait(sibling, SIBLING_X, SIBLING_Y);

    this.hearts = [];
    for (let i = 0; i < HEART_COUNT; i++) {
      this.hearts.push(
        this.add.image(HEART_X + i * HEART_STEP, HEART_Y, WIN_HEART_TEXTURE).setOrigin(0, 0),
      );
    }

    this.line(HINT_Y, HINT_FONT, TStr('press_play_again'));
  }

  private line(
    y: number,
    style: Phaser.Types.GameObjects.Text.TextStyle,
    text: string,
  ): Phaser.GameObjects.Text {
    return this.add.text(BASE_W / 2, y, text, style).setOrigin(0.5, 1);
  }

  private portrait(character: Character, x: number, y: number): Phaser.GameObjects.Image {
    const key = scaledPlayerTextureKey(character, getSkinIndex(character), 'stand', PORTRAIT_SCALE);
    return this.add.image(x, y, key).setOrigin(0, 0);
  }

  update(_time: number, delta: number): void {
    if (this.leaving) return;
    const t = this.clock.advance(delta);

    // The confetti and the hearts are frame-counted, so they advance once per elapsed frame
    // rather than once per render — the same reason the exit above is.
    for (let frame = this.lastFrame + 1; frame <= t; frame++) this.stepConfetti(frame);
    this.lastFrame = t;
    this.drawConfetti();
    for (let i = 0; i < this.hearts.length; i++) {
      this.hearts[i].setY(HEART_Y + Math.sin(t * 0.08 + i) * HEART_BOB);
    }

    if (t >= AUTO_EXIT || justDown(this.keys.confirm)) {
      this.leaving = true;
      stopBGM(); // index.html:1352, the same exit GameOverScene takes
      this.scene.start(TITLE_SCENE_KEY);
      return;
    }
    // index.html:1235, and no `stopBGM` with it — `handleBack` touches no audio, so the win
    // theme carries on over the mode select. See GameOverScene and navigate.ts.
    if (justDown(this.keys.back)) {
      this.leaving = true;
      takeBack(this, 'win');
    }
  }

  /**
   * One frame of confetti: a burst every tenth, then everything already in the air moves,
   * falls a little faster and ages by one (index.html:2449-2451).
   *
   * The live game spawns BEFORE it draws and steps AFTER, so a square is drawn once at the
   * position it was spawned at. Same here: this runs, then `drawConfetti`.
   */
  private stepConfetti(frame: number): void {
    if (frame % CONFETTI_EVERY === 0) {
      this.burst(random() * BASE_W, random() * BASE_H * 0.5, pick(CONFETTI_COLOURS));
    }
    for (const c of this.confetti) {
      c.x += c.vx;
      c.y += c.vy;
      c.vy += CONFETTI_GRAVITY;
      c.life--;
    }
    this.confetti = this.confetti.filter((c) => c.life > 0);
  }

  /**
   * Port of `spawnParticles` (index.html:1157), for the one caller that is on this screen.
   * Fifteen squares thrown out in a full circle at speed 1..4, biased upward by the `-2` on
   * `vy`, each living 30..55 frames. `maxLife` and `size` are in the live literal and are
   * never read by this screen's drawing, so they are not here.
   */
  private burst(x: number, y: number, colour: number): void {
    for (let i = 0; i < CONFETTI_PER_BURST; i++) {
      const angle = random() * Math.PI * 2;
      const speed = 1 + random() * 3;
      this.confetti.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 30 + random() * 25,
        colour,
      });
    }
  }

  private drawConfetti(): void {
    this.sparks.clear();
    for (const c of this.confetti) {
      // `globalAlpha = life/40` with life starting above 40 is simply opaque: canvas clamps
      // it, and so does Phaser. The clamp is the live behaviour, not a rounding of it.
      this.sparks
        .fillStyle(c.colour, Math.min(1, c.life / CONFETTI_FADE))
        .fillRect(c.x, c.y, CONFETTI_SIZE, CONFETTI_SIZE);
    }
  }
}

/** One of the five confetti colours, as the number Phaser's Graphics takes. */
function pick(colours: readonly string[]): number {
  const hex = colours[Math.floor(random() * colours.length)] ?? colours[0];
  return Phaser.Display.Color.HexStringToColor(hex).color;
}
