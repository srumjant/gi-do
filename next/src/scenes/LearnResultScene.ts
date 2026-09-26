import Phaser from 'phaser';
import { BASE_W, STEP_MS } from '../config/constants';
import { T, TStr } from '../config/i18n';
import { pickFrom } from '../game/learn/content';
import type { LearnSession } from '../game/learn/types';
import { random } from '../game/random';
import { getSelectedChar, getSkinIndex } from '../game/run';
import { LEARN_FONT, LEARN_FONT_BOLD, LEARN_TEXT_RESOLUTION, preloadLearnFont } from '../gfx/learnFont';
import { LEARN_CONFETTI_COLORS, LEARN_SPARK_TEXTURE, registerLearnTiles } from '../gfx/learnTiles';
import { registerScaledPlayerTextures, scaledPlayerTextureKey } from '../gfx/textures';
import { bindMenuKeys, justDown, type MenuKeys, pressedAny } from '../input/menuKeys';
import { LEARN_RESULT_SCENE_KEY, LEARN_TOWER_SCENE_KEY } from './keys';
import { takeBack } from './navigate';

export interface LearnResultData {
  /** Carried on to the next tower, score and all. */
  session: LearnSession;
  /** What the tower asked, in order. All found: the star is past the fourth gate. */
  found: string[];
  /** The word it spelled, in words mode; otherwise null. */
  word: string | null;
}

/** index.html:2991: the result's deep blue. */
const BACKGROUND = '#1a2a4a';
/** How long the confetti has already been falling when the screen opens. */
const CONFETTI_HEAD_START_MS = 6000;
/** index.html:3000-3010: the baselines of the cheer, what was found, and the score. */
const CHEER_Y = 80;
const FOUND_Y = 130;
const SCORE_Y = 170;
/** index.html:3013-3014: the hero jumping, at scale 3, 220 down, bobbing 5px either way. */
const HERO_SCALE = 3;
const HERO_Y = 220;
const BOB_PX = 5;
/** `Math.sin(animFrame*0.1)`: half a swing is π / 0.1 frames. */
const BOB_HALF_MS = (Math.PI / 0.1) * STEP_MS;
/** index.html:3021: the hint line. */
const HINT_Y = 360;
const CHEER_FONT = { fontFamily: LEARN_FONT_BOLD, fontSize: '28px', color: '#ffdd00', resolution: LEARN_TEXT_RESOLUTION };
const FOUND_FONT = { fontFamily: LEARN_FONT, fontSize: '18px', color: '#ffffff', resolution: LEARN_TEXT_RESOLUTION };
const SCORE_FONT = { fontFamily: LEARN_FONT, fontSize: '14px', color: '#aaddff', resolution: LEARN_TEXT_RESOLUTION };
const HINT_FONT = { fontFamily: LEARN_FONT, fontSize: '12px', color: '#aaddcc', resolution: LEARN_TEXT_RESOLUTION };

/**
 * After a tower: a cheer, what was found, the session's score and the hero jumping, under
 * falling confetti. A port of drawLearnResult (index.html:2989-3023), with the cheer chosen
 * once rather than hard-coded, and the hero the one who climbed. Confirm starts a new tower
 * in the same mode, the session carried on; back goes to the learn menu
 * (game/navigation.ts: `learnresult` goes back to `learnmenu`).
 */
export class LearnResultScene extends Phaser.Scene {
  /** Not `data`: that name is the scene's own DataManager. */
  private result!: LearnResultData;
  private keys!: MenuKeys;
  private leaving = false;

  constructor() {
    super(LEARN_RESULT_SCENE_KEY);
  }

  init(data: LearnResultData): void {
    this.result = data;
    this.leaving = false;
  }

  preload(): void {
    preloadLearnFont(this);
  }

  create(): void {
    registerLearnTiles(this);
    registerScaledPlayerTextures(this, [['jump', HERO_SCALE]]);
    this.cameras.main.setBackgroundColor(BACKGROUND);

    this.add.particles(0, -8, LEARN_SPARK_TEXTURE, {
      x: { min: 0, max: BASE_W },
      frequency: 60,
      lifespan: 9000,
      speedX: { min: -20, max: 20 },
      speedY: { min: 50, max: 90 },
      rotate: { start: 0, end: 360 },
      scale: { min: 1, max: 1.5 },
      tint: LEARN_CONFETTI_COLORS,
      advance: CONFETTI_HEAD_START_MS,
    });

    const cheers = T('learn_cheers');
    const cheer = Array.isArray(cheers) ? pickFrom(cheers, random) : cheers;
    const { session, found, word } = this.result;
    this.add.text(BASE_W / 2, CHEER_Y, cheer, CHEER_FONT).setOrigin(0.5, 1);
    this.add.text(BASE_W / 2, FOUND_Y, `${TStr('learn_found')} ${word ?? found.join(' ')}`, FOUND_FONT).setOrigin(0.5, 1);
    this.add.text(BASE_W / 2, SCORE_Y, `${TStr('score_label')}${session.score}`, SCORE_FONT).setOrigin(0.5, 1);
    this.add.text(BASE_W / 2, HINT_Y, TStr('learn_result_hint'), HINT_FONT).setOrigin(0.5, 1);

    const character = getSelectedChar();
    const hero = this.add
      .image(BASE_W / 2, HERO_Y - BOB_PX, scaledPlayerTextureKey(character, getSkinIndex(character), 'jump', HERO_SCALE))
      .setOrigin(0.5, 0);
    this.tweens.add({ targets: hero, y: HERO_Y + BOB_PX, duration: BOB_HALF_MS, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.keys = bindMenuKeys(this);
  }

  update(): void {
    if (this.leaving) return;
    if (pressedAny(this.keys.confirm, this.keys.enter)) {
      this.leaving = true;
      this.scene.start(LEARN_TOWER_SCENE_KEY, this.result.session satisfies LearnSession);
      return;
    }
    if (justDown(this.keys.back)) {
      this.leaving = true;
      takeBack(this, 'learnresult');
    }
  }
}
