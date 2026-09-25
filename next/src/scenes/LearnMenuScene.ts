import Phaser from 'phaser';
import { BASE_H, BASE_W } from '../config/constants';
import { TStr } from '../config/i18n';
import { createFrameClock, type FrameClock } from '../game/frameClock';
import type { LearnMode } from '../game/learn/content';
import { clampIndex } from '../game/menu';
import { getSkinIndex } from '../game/run';
import { createStarField, type StarField, type StarFieldSpec } from '../gfx/starfield';
import { registerScaledPlayerTextures, scaledPlayerTextureKey } from '../gfx/textures';
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
  /** index.html:2953-2955: the label, the highlight's fill and its border. */
  color: string;
}

/** index.html:2946-2949. */
const TITLE_Y = 60;
const SUBTITLE_Y = 85;

/** index.html:2957-2961: three 160px cards, 20px apart, 120px down, centred as a row. */
const CARD_COUNT = 3;
const CARD_W = 160;
const CARD_H = 160;
const CARD_GAP = 20;
const CARD_Y = 120;
const CARD_START_X = (BASE_W - (CARD_COUNT * CARD_W + (CARD_COUNT - 1) * CARD_GAP)) / 2;
/** index.html:2968-2973: each card's three lines, as baselines below its top. */
const LABEL_DY = 35;
const SAMPLE_DY = 80;
const DESC_DY = 115;

/** index.html:2962-2967. */
const BOX_OUTSET = 2;
const BOX_LINE_WIDTH = 3;
/** `opt.color+'22'`, as the fraction Phaser takes. */
const BOX_FILL_ALPHA = 0x22 / 0xff;
const IDLE_FILL = 0xffffff;
const IDLE_FILL_ALPHA = 0.05;

/** index.html:2977-2980: both at scale 3, bobbing together; Dodo faces Gigi. */
const HERO_SCALE = 3;
const GIGI_X = 60;
const DODO_X = BASE_W - 90;
const HERO_Y = BASE_H - 100;
const BOB_SPEED = 0.06;
const BOB_AMPLITUDE = 3;

/**
 * index.html:2982-2985 draws two lines, the keys at 340 and "ESC = tagasi" at 365. The
 * port's one line (i18n.ts's `learn_menu_hint`) sits between them.
 */
const HINT_Y = 350;

const TITLE_FONT = { fontFamily: 'monospace', fontSize: '30px', fontStyle: 'bold', color: '#88ff88' };
const SUBTITLE_FONT = { fontFamily: 'monospace', fontSize: '14px', color: '#aaddcc' };
const LABEL_FONT = { fontFamily: 'monospace', fontSize: '18px', fontStyle: 'bold' };
const SAMPLE_FONT = { fontFamily: 'monospace', fontSize: '24px', fontStyle: 'bold', color: '#ffffff' };
const DESC_FONT = { fontFamily: 'monospace', fontSize: '10px', color: '#aaaaaa' };
const HINT_FONT = { fontFamily: 'monospace', fontSize: '12px', color: '#aaddcc' };

function cardX(i: number): number {
  return CARD_START_X + i * (CARD_W + CARD_GAP);
}

/**
 * The learn menu: letters, syllables or words. A port of drawLearnMenu (index.html:2940-2987)
 * and the input that drives it (updateLearn's `learnmenu` branch, :2645-2656), translated.
 * Confirm starts a tower in that mode with a fresh session; back goes to the mode select
 * with the cursor on the learn card (game/navigation.ts's modeCursorFor).
 */
export class LearnMenuScene extends Phaser.Scene {
  /**
   * The chosen card. A field, so it outlives `create()` (Phaser reuses the instance): the
   * live `learnMenuIdx` is kept across a tower and back. `update` resets it on the way out.
   */
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
    registerScaledPlayerTextures(this, [['stand', HERO_SCALE]]);
    this.cameras.main.setBackgroundColor(BACKGROUND);
    this.stars = createStarField(this, STARS);

    this.cards = [
      { mode: 'letters', label: TStr('learn_letters'), desc: TStr('learn_letters_d'), sample: 'A B C', color: '#88ccff' },
      { mode: 'syllables', label: TStr('learn_syllables'), desc: TStr('learn_syllables_d'), sample: 'MA KA', color: '#ffaa66' },
      { mode: 'words', label: TStr('learn_words'), desc: TStr('learn_words_d'), sample: 'KASS', color: '#ff88cc' },
    ];

    this.add.text(BASE_W / 2, TITLE_Y, TStr('learn_title'), TITLE_FONT).setOrigin(0.5, 1);
    this.add.text(BASE_W / 2, SUBTITLE_Y, TStr('learn_choose'), SUBTITLE_FONT).setOrigin(0.5, 1);

    this.boxes = this.add.graphics();
    this.cards.forEach((card, i) => {
      const x = cardX(i) + CARD_W / 2;
      this.add.text(x, CARD_Y + LABEL_DY, card.label, { ...LABEL_FONT, color: card.color }).setOrigin(0.5, 1);
      this.add.text(x, CARD_Y + SAMPLE_DY, card.sample, SAMPLE_FONT).setOrigin(0.5, 1);
      this.add.text(x, CARD_Y + DESC_DY, card.desc, DESC_FONT).setOrigin(0.5, 1);
    });

    // Gigi is the bare GIGI_STAND/GIGI_P (index.html:2978), the Classic skin whichever was
    // chosen, and Dodo the chosen skin (:2979): the asymmetry the title and the mode select
    // reproduce too.
    this.heroes = [
      this.add.image(GIGI_X, HERO_Y, scaledPlayerTextureKey('gigi', 0, 'stand', HERO_SCALE)).setOrigin(0, 0),
      this.add.image(DODO_X, HERO_Y, scaledPlayerTextureKey('dodo', getSkinIndex('dodo'), 'stand', HERO_SCALE))
        .setOrigin(0, 0)
        .setFlipX(true),
    ];

    this.add.text(BASE_W / 2, HINT_Y, TStr('learn_menu_hint'), HINT_FONT).setOrigin(0.5, 1);

    this.clock = createFrameClock();
    this.keys = bindMenuKeys(this);
    this.drawBoxes();
  }

  update(_time: number, delta: number): void {
    const t = this.clock.advance(delta);
    this.stars.update();
    const bob = Math.sin(t * BOB_SPEED) * BOB_AMPLITUDE;
    for (const hero of this.heroes) hero.setY(HERO_Y + bob);

    if (this.leaving) return;
    if (pressedAny(this.keys.left, this.keys.altLeft)) this.move(-1);
    if (pressedAny(this.keys.right, this.keys.altRight)) this.move(1);
    // index.html:2648-2654. No sound: the live confirm is silent.
    if (pressedAny(this.keys.confirm, this.keys.enter)) {
      this.leaving = true;
      this.scene.start(LEARN_TOWER_SCENE_KEY, { mode: this.cards[this.index].mode, used: [] } satisfies LearnTowerData);
      return;
    }
    if (justDown(this.keys.back)) {
      this.leaving = true;
      // The mode select opens this menu on its first card (index.html:1325's
      // `learnMenuIdx=0`); back from a tower finds it where it was, because handleBack
      // (:1259-1272) does not touch it. Back to the mode select is the only way out of learn
      // mode, so the reset is made here, on the way out.
      this.index = 0;
      takeBack(this, 'learnmenu');
    }
  }

  private move(delta: number): void {
    const next = clampIndex(this.index, delta, this.cards.length);
    if (next === this.index) return;
    this.index = next;
    this.drawBoxes();
  }

  /** index.html:2962-2967. Drawn at create and when the choice moves; nothing else changes it. */
  private drawBoxes(): void {
    this.boxes.clear();
    this.cards.forEach((card, i) => {
      const x = cardX(i);
      if (i !== this.index) {
        this.boxes.fillStyle(IDLE_FILL, IDLE_FILL_ALPHA).fillRect(x, CARD_Y, CARD_W, CARD_H);
        return;
      }
      const color = Phaser.Display.Color.HexStringToColor(card.color).color;
      this.boxes
        .fillStyle(color, BOX_FILL_ALPHA)
        .fillRect(x, CARD_Y, CARD_W, CARD_H)
        .lineStyle(BOX_LINE_WIDTH, color)
        .strokeRect(x - BOX_OUTSET, CARD_Y - BOX_OUTSET, CARD_W + 2 * BOX_OUTSET, CARD_H + 2 * BOX_OUTSET);
    });
  }
}
