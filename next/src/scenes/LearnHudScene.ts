import Phaser from 'phaser';
import { BASE_W } from '../config/constants';
import { TStr } from '../config/i18n';
import type { LearnMode } from '../game/learn/content';
import { LEARN_HUD_H } from '../game/learn/tower';
import type { Climb } from '../game/learn/types';
import { LEARN_FONT_BOLD, LEARN_TEXT_RESOLUTION, preloadLearnFont } from '../gfx/learnFont';
import { LEARN_HUD_STAR_TEXTURE, registerTextures } from '../gfx/textures';
import { LEARN_HUD_SCENE_KEY } from './keys';

export interface LearnHudData {
  /** A live reference; the HUD only reads it. */
  climb: Climb;
}

const PROMPT: Record<LearnMode, string> = {
  letters: 'learn_find_letter',
  syllables: 'learn_find_syllable',
  words: 'learn_find_letters',
};
const PROMPT_FONT = { fontFamily: LEARN_FONT_BOLD, fontSize: '12px', color: '#ffdd00', resolution: LEARN_TEXT_RESOLUTION };
const TARGET_FONT = { fontFamily: LEARN_FONT_BOLD, fontSize: '26px', color: '#ffffff', resolution: LEARN_TEXT_RESOLUTION };
const SPEAK_FONT = { fontFamily: LEARN_FONT_BOLD, fontSize: '12px', color: '#aaddff', resolution: LEARN_TEXT_RESOLUTION };
/** Where the prompt's and the target's baselines sit in the band. */
const PROMPT_BOTTOM = 16;
const TARGET_BOTTOM = 44;
/** The first star slot's centre, and the step to the next. */
const STAR_X = 22;
const STAR_Y = 22;
const STAR_STEP = 26;
const UNSOLVED_ALPHA = 0.28;
/** Shown instead of a target once the hero is on the roof. */
const ROOF_MARK = '★';
/** Words mode: a cell per letter, the found ones green and the one to find framed. */
const WORD_CELL = 26;
const FOUND_COLOR = '#88ff88';
const FRAME_COLOR = 0xffdd00;
const FRAME_H = 32;
/** The speaker hint's right edge. */
const SPEAK_RIGHT = BASE_W - 12;
/** A right answer's star flies to its slot this fast, and the slot bounces this much when it lands. */
const FLY_MS = 700;
const LAND_SCALE = 1.4;
const LAND_MS = 120;

/**
 * What to find, and one star per gate, lit as each right answer's star flies in. A parallel
 * scene over the tower, like the adventure's HudScene; no score during the climb, because a
 * number means nothing to a pre-reader. Words mode shows the whole word, found letters green
 * and the one to find framed. The speaker hint says X asks the voice again.
 */
export class LearnHudScene extends Phaser.Scene {
  private climb!: Climb;
  /** The target, in letters and syllables mode. */
  private target: Phaser.GameObjects.Text | null = null;
  /** The word's letters and the frame, in words mode. */
  private letters: Phaser.GameObjects.Text[] = [];
  private frame: Phaser.GameObjects.Rectangle | null = null;
  /** What the word display last showed, so it is redrawn only when that changes. */
  private shown = '';
  private stars: Phaser.GameObjects.Image[] = [];
  /** Stars sent flying so far; the next one goes to this slot. */
  private sent = 0;

  constructor() {
    super(LEARN_HUD_SCENE_KEY);
  }

  init(data: LearnHudData): void {
    this.climb = data.climb;
    this.target = null;
    this.letters = [];
    this.frame = null;
    this.shown = '';
    this.stars = [];
    this.sent = 0;
  }

  preload(): void {
    preloadLearnFont(this);
  }

  create(): void {
    registerTextures(this);
    const { layout } = this.climb;
    this.add.graphics().fillStyle(0x000000, 0.45).fillRect(0, 0, BASE_W, LEARN_HUD_H);
    this.add.text(BASE_W / 2, PROMPT_BOTTOM, TStr(PROMPT[layout.mode]), PROMPT_FONT).setOrigin(0.5, 1);
    if (layout.mode === 'words' && layout.word) {
      this.buildWord(layout.word);
    } else {
      this.target = this.add.text(BASE_W / 2, TARGET_BOTTOM, '', TARGET_FONT).setOrigin(0.5, 1);
    }
    this.add.text(SPEAK_RIGHT, LEARN_HUD_H / 2, TStr('learn_speak'), SPEAK_FONT).setOrigin(1, 0.5);
    this.stars = this.climb.gates.map((_, i) => this.add
      .image(STAR_X + i * STAR_STEP, STAR_Y, LEARN_HUD_STAR_TEXTURE)
      .setAlpha(UNSOLVED_ALPHA));
  }

  update(): void {
    const { layout, storey, gates } = this.climb;
    this.target?.setText(storey < layout.storeys.length ? layout.storeys[storey].target : ROOF_MARK);
    if (this.frame) {
      const shown = `${storey}:${gates.map((g) => (g.solved ? 1 : 0)).join('')}`;
      if (shown !== this.shown) {
        this.shown = shown;
        this.showWord();
      }
    }
  }

  /**
   * A right answer's star, flying from where its block was (screen px) to its slot, which
   * lights as it lands. One per solved gate: a block bumped again after a re-arm sends none.
   */
  flyStar(x: number, y: number): void {
    const solved = this.climb.gates.filter((g) => g.solved).length;
    if (this.sent >= solved || this.sent >= this.stars.length) return;
    const slot = this.stars[this.sent++];
    const star = this.add.image(x, y, LEARN_HUD_STAR_TEXTURE);
    this.tweens.add({
      targets: star,
      x: slot.x,
      y: slot.y,
      duration: FLY_MS,
      ease: 'Cubic.easeInOut',
      onComplete: () => {
        star.destroy();
        slot.setAlpha(1);
        this.tweens.add({ targets: slot, scale: LAND_SCALE, duration: LAND_MS, yoyo: true });
      },
    });
  }

  private buildWord(word: string): void {
    const chars = [...word];
    const left = BASE_W / 2 - ((chars.length - 1) * WORD_CELL) / 2;
    this.letters = chars.map((ch, i) => this.add
      .text(left + i * WORD_CELL, TARGET_BOTTOM, ch, TARGET_FONT)
      .setOrigin(0.5, 1));
    this.frame = this.add
      .rectangle(left, TARGET_BOTTOM + 2, WORD_CELL - 2, FRAME_H)
      .setOrigin(0.5, 1)
      .setStrokeStyle(2, FRAME_COLOR);
  }

  /** Found letters green, the rest white, and the frame on the one to find; none on the roof. */
  private showWord(): void {
    const { storey, gates } = this.climb;
    this.letters.forEach((t, i) => t.setColor(gates[i].solved ? FOUND_COLOR : TARGET_FONT.color));
    const current = this.letters[storey];
    this.frame?.setVisible(current !== undefined);
    if (current) this.frame?.setX(current.x);
  }
}
