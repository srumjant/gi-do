import Phaser from 'phaser';
import { sfxPickup } from '../audio/sfx';
import { BASE_H, BASE_W } from '../config/constants';
import { TStr } from '../config/i18n';
import { createFrameClock, type FrameClock } from '../game/frameClock';
import type { LearnMode } from '../game/learn/content';
import { getSkinIndex } from '../game/run';
import { createStarField, type StarField, type StarFieldSpec } from '../gfx/starfield';
import { playerTextureKey, registerTextures } from '../gfx/textures';
import { bindMenuKeys, justDown, type MenuKeys, pressedAny } from '../input/menuKeys';
import { LEARN_MENU_SCENE_KEY, LEARN_TOWER_SCENE_KEY } from './keys';
import type { LearnTowerData } from './LearnTowerScene';
import { takeBack } from './navigate';

/** index.html:2941-2943: the learn menu's night blue and its twinkling stars. */
const BACKGROUND = '#2a3a5a';
const STARS: StarFieldSpec = {
  count: 40,
  strideX: 73, offsetX: 20,
  strideY: 47, offsetY: 10,
  speed: 0.02, base: 0.3, swing: 0.2,
};

interface Card {
  mode: LearnMode;
  label: string;
  desc: string;
  sample: string;
  color: number;
  css: string;
}

// index.html:2955-2973's layout: three 160px cards, 20px apart, 120px down.
const CARD_W = 160;
const CARD_H = 160;
const CARD_GAP = 20;
const CARD_Y = 120;
const HERO_Y = BASE_H - 100;
const HERO_SCALE = 1.5;

const TITLE_FONT = { fontFamily: 'monospace', fontSize: '30px', fontStyle: 'bold', color: '#88ff88' };
const SUBTITLE_FONT = { fontFamily: 'monospace', fontSize: '14px', color: '#aaddcc' };
const LABEL_FONT = { fontFamily: 'monospace', fontSize: '18px', fontStyle: 'bold' };
const SAMPLE_FONT = { fontFamily: 'monospace', fontSize: '24px', fontStyle: 'bold', color: '#ffffff' };
const DESC_FONT = { fontFamily: 'monospace', fontSize: '10px', color: '#aaaaaa' };
const HINT_FONT = { fontFamily: 'monospace', fontSize: '12px', color: '#aaddcc' };

function cardX(i: number): number {
  const total = 3 * CARD_W + 2 * CARD_GAP;
  return (BASE_W - total) / 2 + i * (CARD_W + CARD_GAP);
}

/**
 * The learn menu: letters, syllables or words. A port of drawLearnMenu (index.html:2940),
 * translated. Confirm starts a tower in that mode with a fresh session; back goes to the
 * mode select with the cursor on the learn card (game/navigation.ts's modeCursorFor).
 */
export class LearnMenuScene extends Phaser.Scene {
  private index = 0;
  private cards: Card[] = [];
  private boxes!: Phaser.GameObjects.Graphics;
  private heroes: Phaser.GameObjects.Image[] = [];
  private stars!: StarField;
  private clock!: FrameClock;
  private keys!: MenuKeys;
  private leaving = false;

  constructor() {
    super(LEARN_MENU_SCENE_KEY);
  }

  create(): void {
    this.leaving = false;
    registerTextures(this);
    this.cameras.main.setBackgroundColor(BACKGROUND);
    this.stars = createStarField(this, STARS);

    this.cards = [
      { mode: 'letters', label: TStr('learn_letters'), desc: TStr('learn_letters_d'), sample: 'A B C', color: 0x88ccff, css: '#88ccff' },
      { mode: 'syllables', label: TStr('learn_syllables'), desc: TStr('learn_syllables_d'), sample: 'MA KA', color: 0xffaa66, css: '#ffaa66' },
      { mode: 'words', label: TStr('learn_words'), desc: TStr('learn_words_d'), sample: 'KASS', color: 0xff88cc, css: '#ff88cc' },
    ];

    this.add.text(BASE_W / 2, 60, TStr('learn_title'), TITLE_FONT).setOrigin(0.5, 1);
    this.add.text(BASE_W / 2, 85, TStr('learn_choose'), SUBTITLE_FONT).setOrigin(0.5, 1);

    this.boxes = this.add.graphics();
    this.cards.forEach((card, i) => {
      const x = cardX(i) + CARD_W / 2;
      this.add.text(x, CARD_Y + 35, card.label, { ...LABEL_FONT, color: card.css }).setOrigin(0.5, 1);
      this.add.text(x, CARD_Y + 80, card.sample, SAMPLE_FONT).setOrigin(0.5, 1);
      this.add.text(x, CARD_Y + 115, card.desc, DESC_FONT).setOrigin(0.5, 1);
    });

    // Gigi on the left and Dodo on the right, bobbing (index.html:2976-2979).
    this.heroes = [
      this.add.image(60, HERO_Y, playerTextureKey('gigi', getSkinIndex('gigi'), 'stand'))
        .setOrigin(0, 0).setScale(HERO_SCALE),
      this.add.image(BASE_W - 90, HERO_Y, playerTextureKey('dodo', getSkinIndex('dodo'), 'stand'))
        .setOrigin(0, 0).setScale(HERO_SCALE).setFlipX(true),
    ];

    this.add.text(BASE_W / 2, 350, TStr('learn_menu_hint'), HINT_FONT).setOrigin(0.5, 1);

    this.clock = createFrameClock();
    this.keys = bindMenuKeys(this);
  }

  update(_time: number, delta: number): void {
    const t = this.clock.advance(delta);
    this.stars.update();
    this.drawBoxes();
    const bob = Math.sin(t * 0.06) * 3;
    for (const hero of this.heroes) hero.setY(HERO_Y + bob);

    if (this.leaving) return;
    if (pressedAny(this.keys.left, this.keys.altLeft)) this.index = Math.max(0, this.index - 1);
    if (pressedAny(this.keys.right, this.keys.altRight)) this.index = Math.min(this.cards.length - 1, this.index + 1);
    if (pressedAny(this.keys.confirm, this.keys.enter)) {
      this.leaving = true;
      sfxPickup();
      this.scene.start(LEARN_TOWER_SCENE_KEY, { mode: this.cards[this.index].mode, used: [] } satisfies LearnTowerData);
      return;
    }
    if (justDown(this.keys.back)) {
      this.leaving = true;
      takeBack(this, 'learnmenu');
    }
  }

  private drawBoxes(): void {
    this.boxes.clear();
    this.cards.forEach((card, i) => {
      const x = cardX(i);
      if (i === this.index) {
        this.boxes.fillStyle(card.color, 0x22 / 0xff).fillRect(x, CARD_Y, CARD_W, CARD_H);
        this.boxes.lineStyle(3, card.color).strokeRect(x - 2, CARD_Y - 2, CARD_W + 4, CARD_H + 4);
      } else {
        this.boxes.fillStyle(0xffffff, 0.05).fillRect(x, CARD_Y, CARD_W, CARD_H);
      }
    });
  }
}
