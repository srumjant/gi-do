import Phaser from 'phaser';
import { BASE_W } from '../config/constants';
import { TStr } from '../config/i18n';
import type { LearnMode } from '../game/learn/content';
import { LEARN_HUD_H } from '../game/learn/tower';
import type { Climb } from '../game/learn/types';
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
const PROMPT_FONT = { fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color: '#ffdd00' };
const TARGET_FONT = { fontFamily: 'monospace', fontSize: '26px', fontStyle: 'bold', color: '#ffffff' };
/** Where the prompt's and the target's baselines sit in the band. */
const PROMPT_BOTTOM = 16;
const TARGET_BOTTOM = 44;
const STAR_X = 12;
const STAR_Y = 12;
const STAR_STEP = 26;
const UNSOLVED_ALPHA = 0.28;
/** Shown instead of a target once the hero is on the roof. */
const ROOF_MARK = '★';

/**
 * What to find, and one star per gate, filling in as gates are solved. A parallel scene
 * over the tower, like the adventure's HudScene; no score during the climb, because a
 * number means nothing to a pre-reader.
 *
 * Part 2 of the learn tower adds the word display for words mode and the speaker.
 */
export class LearnHudScene extends Phaser.Scene {
  private climb!: Climb;
  private target!: Phaser.GameObjects.Text;
  private stars: Phaser.GameObjects.Image[] = [];

  constructor() {
    super(LEARN_HUD_SCENE_KEY);
  }

  init(data: LearnHudData): void {
    this.climb = data.climb;
  }

  create(): void {
    registerTextures(this);
    this.add.graphics().fillStyle(0x000000, 0.45).fillRect(0, 0, BASE_W, LEARN_HUD_H);
    this.add.text(BASE_W / 2, PROMPT_BOTTOM, TStr(PROMPT[this.climb.layout.mode]), PROMPT_FONT).setOrigin(0.5, 1);
    this.target = this.add.text(BASE_W / 2, TARGET_BOTTOM, '', TARGET_FONT).setOrigin(0.5, 1);
    this.stars = this.climb.gates.map((_, i) => this.add
      .image(STAR_X + i * STAR_STEP, STAR_Y, LEARN_HUD_STAR_TEXTURE)
      .setOrigin(0, 0));
  }

  update(): void {
    const { layout, storey, gates } = this.climb;
    this.target.setText(storey < layout.storeys.length ? layout.storeys[storey].target : ROOF_MARK);
    const solved = gates.filter((g) => g.solved).length;
    this.stars.forEach((star, i) => star.setAlpha(i < solved ? 1 : UNSOLVED_ALPHA));
  }
}
