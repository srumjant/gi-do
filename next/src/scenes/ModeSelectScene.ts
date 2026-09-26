import Phaser from 'phaser';
import { ensureAudio } from '../audio/context';
import { sfxPickup } from '../audio/sfx';
import { BASE_H, BASE_W } from '../config/constants';
import { TStr } from '../config/i18n';
import { createFrameClock, type FrameClock } from '../game/frameClock';
import { MODE_ADVENTURE, MODE_LEARN } from '../game/navigation';
import { getSkinIndex } from '../game/run';
import { GAME_FONT, GAME_FONT_BOLD, GAME_TEXT_RESOLUTION } from '../gfx/gameFont';
import { menuPlayerTextureKey, MENU_PREVIEW_SCALE, registerMenuTextures } from '../gfx/textures';
import { bindMenuKeys, justDown, type MenuKeys, pressedAny } from '../input/menuKeys';
import { DIFFICULTY_SCENE_KEY, LEARN_MENU_SCENE_KEY, MODE_SELECT_SCENE_KEY } from './keys';
import { takeBack } from './navigate';

/**
 * Which card the cursor starts on. Handed over rather than remembered, because the answer
 * depends on where you came from: the title always opens on ADVENTURE (index.html:1313),
 * and backing out of learn mode opens on LEARN (:1268, `modeCursorFor` in
 * game/navigation.ts).
 */
export interface ModeSelectData {
  index: number;
}

/** index.html:1966-1968 — the title screen's sky and grass, without the felt tinting. */
const SKY = '#88ccff';
const GROUND_COLOR = 0x44aa44;
const GROUND_EDGE_COLOR = 0x2d8a2d;
const GROUND_H = 60;
const GROUND_Y = BASE_H - GROUND_H;
const GROUND_EDGE_H = 4;

/**
 * index.html:1969-1972. Three clouds, each drawn as three overlapping ellipses, drifting on
 * a sine so slow (0.004 per frame) that one cycle takes about twenty-six seconds. `+ cx` in
 * the phase is what stops the three moving as one.
 */
const CLOUD_X = [100, 300, 520];
const CLOUD_Y = 54;
const CLOUD_DRIFT_SPEED = 0.004;
const CLOUD_DRIFT = 4;
const CLOUD_FILL = 0xffffff;
const CLOUD_ALPHA = 0.7;
/** Canvas takes radii, Phaser takes diameters: 25x15 and 15x10 become these. */
const CLOUD_MAIN = { dx: 0, dy: 0, w: 50, h: 30 };
const CLOUD_PUFFS = [{ dx: -15, dy: 8, w: 30, h: 20 }, { dx: 15, dy: 8, w: 30, h: 20 }];

/** index.html:1975-1976. */
const HEADING_Y = 50;
const HEADING_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '26px', color: '#e03030',
};

/** index.html:1982. The card geometry, from which every label on a card is an offset. */
const CARD_W = 250;
const CARD_H = 170;
const CARD_GAP = 30;
const CARD_TOP = 95;
/** :1986 — the pair is centred, so the left card starts a card and half a gap left of centre. */
const CARD_LEFT = BASE_W / 2 - (CARD_W + CARD_GAP / 2);

/** :1985. The chosen card breathes, ±3px around its resting size. */
const PULSE_SPEED = 0.09;
const PULSE_AMPLITUDE = 3;

/** :1988-1992. */
const GLOW_INSET = 6;
const GLOW_FILL = 0xffffff;
const GLOW_ALPHA = 0.35;
const CARD_FILL = 0x000000;
const CARD_FILL_ALPHA_ON = 0.82;
const CARD_FILL_ALPHA_OFF = 0.45;
const CARD_EDGE_OFF = 0xffffff;
const CARD_EDGE_ALPHA_OFF = 0.3;
const CARD_EDGE_W_ON = 3;
const CARD_EDGE_W_OFF = 2;

/** :1993-2000. Everything on an unchosen card is dimmed together. */
const CARD_ALPHA_OFF = 0.65;
const ICON_DY = 52;
const NAME_DY = 110;
const DESC_DY = 134;
const ICON_FONT = { fontFamily: 'serif', fontSize: '48px' };
const NAME_FONT = { fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '19px' };
const DESC_FONT = { fontFamily: GAME_FONT, resolution: GAME_TEXT_RESOLUTION, fontSize: '11px' };
const NAME_COLOR_OFF = '#cccccc';
const DESC_COLOR_ON = '#ffffff';
const DESC_COLOR_OFF = '#999999';

/** :2002-2006. Two arrows, pointing INWARD at the chosen card from just outside it. */
const ARROW_DX = 16;
const ARROW_DY = 5;
const ARROW_FONT = { fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '14px' };

/** :2009-2011. Whoever you would be playing, standing on the grass under the cards. */
const HERO_X = BASE_W / 2 - 15;

/** :2013-2015. */
const HINT_Y = BASE_H - 14;
const HINT_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '12px', color: '#ffdd00',
};
const BLINK_FRAMES = 30;

/**
 * One of the two cards (index.html:1978-1981).
 *
 * `col` is in the live table and is never drawn with — the box is black, the border and the
 * name take `glow`, and the emoji renders in its own colours whatever fill is set. It is
 * kept because it is each mode's identity colour and because a table that quietly drops a
 * field is a table somebody has to diff against the original.
 */
interface ModeCard {
  icon: string;
  name: string;
  desc: string;
  col: string;
  glow: string;
}

/**
 * Adventure or learn. Port of `drawModeSelect` (index.html:1965-2018) and the input that
 * drives it (:1318-1329).
 *
 * ## Learn mode
 *
 * The second card opens the learn menu (LearnMenuScene): letters, syllables or words, each
 * a tower to climb.
 *
 * Its way back is wired as well: `learnmenu` goes back to `modeselect` with the cursor
 * on the learn card (game/navigation.ts's `modeCursorFor`), which is the one live rule in
 * this area that exists purely for learn mode and the one most easily left out.
 */
export class ModeSelectScene extends Phaser.Scene {
  private index = MODE_ADVENTURE;
  private clock!: FrameClock;
  private keys!: MenuKeys;
  private leaving = false;
  private cards: readonly ModeCard[] = [];
  private clouds!: Phaser.GameObjects.Graphics;
  private boxes!: Phaser.GameObjects.Graphics;
  private icons: Phaser.GameObjects.Text[] = [];
  private names: Phaser.GameObjects.Text[] = [];
  private descs: Phaser.GameObjects.Text[] = [];
  private arrowIn!: Phaser.GameObjects.Text;
  private arrowOut!: Phaser.GameObjects.Text;
  private hero!: Phaser.GameObjects.Image;
  private hint!: Phaser.GameObjects.Text;

  constructor() {
    super(MODE_SELECT_SCENE_KEY);
  }

  init(data: ModeSelectData): void {
    // Phaser reuses the scene instance, so the cursor has to be set from the data every
    // time rather than left where the last visit put it. `?? MODE_ADVENTURE` covers a start
    // with no data at all, which is what a hand-driven console session does.
    this.index = data?.index ?? MODE_ADVENTURE;
    this.leaving = false;
  }

  create(): void {
    registerMenuTextures(this);
    this.cameras.main.setBackgroundColor(SKY);

    // index.html:1979-1980. Read here rather than at module scope because `TStr` answers in
    // whichever language is current, and a module-level table would freeze the first one.
    this.cards = [
      {
        icon: '🎮',
        name: TStr('mode_adventure'),
        desc: TStr('mode_adventure_d'),
        col: '#e03030',
        glow: '#ff8866',
      },
      {
        icon: '📚',
        name: TStr('mode_learn'),
        desc: TStr('mode_learn_d'),
        col: '#22aa66',
        glow: '#88ffbb',
      },
    ];

    this.add
      .graphics()
      .fillStyle(GROUND_COLOR)
      .fillRect(0, GROUND_Y, BASE_W, GROUND_H)
      .fillStyle(GROUND_EDGE_COLOR)
      .fillRect(0, GROUND_Y, BASE_W, GROUND_EDGE_H);

    this.clouds = this.add.graphics();
    this.boxes = this.add.graphics();

    this.add.text(BASE_W / 2, HEADING_Y, TStr('choose_mode'), HEADING_FONT).setOrigin(0.5, 1);

    this.icons = this.cards.map((card) => this.add
      .text(0, 0, card.icon, { ...ICON_FONT, color: card.col })
      // :1994's `textBaseline='middle'`, the one place on this screen that is not a baseline.
      .setOrigin(0.5, 0.5));
    this.names = this.cards.map((card) => this.add.text(0, 0, card.name, NAME_FONT).setOrigin(0.5, 1));
    this.descs = this.cards.map((card) => this.add.text(0, 0, card.desc, DESC_FONT).setOrigin(0.5, 1));

    this.arrowIn = this.add.text(0, 0, '▶', ARROW_FONT).setOrigin(0.5, 1);
    this.arrowOut = this.add.text(0, 0, '◀', ARROW_FONT).setOrigin(0.5, 1);

    // index.html:2010. Gigi for adventure, Dodo for learn — not a choice of character, just
    // a face on the card you are looking at. Gigi comes from the bare constant (the Classic
    // skin) and Dodo from the chosen skin, the same asymmetry the title screen has.
    this.hero = this.add.image(HERO_X, GROUND_Y, this.heroKey()).setOrigin(0, 1);

    this.hint = this.add.text(BASE_W / 2, HINT_Y, TStr('mode_hint'), HINT_FONT).setOrigin(0.5, 1);

    this.clock = createFrameClock();
    this.keys = bindMenuKeys(this);
  }

  update(_time: number, delta: number): void {
    const t = this.clock.advance(delta);
    this.drawClouds(t);
    this.drawCards(t);
    this.hint.setVisible(Math.floor(t / BLINK_FRAMES) % 2 === 0);

    if (this.leaving) return;
    // index.html:1319-1320. Left and right SET the card rather than stepping to it: with two
    // of them, pressing left twice must not walk off anywhere.
    if (pressedAny(this.keys.left, this.keys.altLeft)) this.select(MODE_ADVENTURE);
    if (pressedAny(this.keys.right, this.keys.altRight)) this.select(MODE_LEARN);
    if (pressedAny(this.keys.confirm, this.keys.enter)) this.confirm();
    if (justDown(this.keys.back)) {
      this.leaving = true;
      takeBack(this, 'modeselect');
    }
  }

  private select(index: number): void {
    if (index === this.index) return;
    this.index = index;
    this.hero.setTexture(this.heroKey());
  }

  /**
   * index.html:1322-1327. `ensureAudio()` again, and not a leftover: the live game opens the
   * context on this confirm as well as on the title's. It costs nothing when the context is
   * already open and it is the one screen a child can reach without the title's confirm —
   * the pause menu's SWITCH MODE lands here directly.
   *
   * No `startBGM` to go with it, which is also live: the theme the title started is still
   * playing, and restarting it here would begin the same tune again half a second in.
   */
  private confirm(): void {
    this.leaving = true;
    ensureAudio();
    sfxPickup();
    this.scene.start(this.index === MODE_ADVENTURE ? DIFFICULTY_SCENE_KEY : LEARN_MENU_SCENE_KEY);
  }

  private heroKey(): string {
    const character = this.index === MODE_ADVENTURE ? 'gigi' : 'dodo';
    const skin = character === 'gigi' ? 0 : getSkinIndex('dodo');
    return menuPlayerTextureKey(character, skin, MENU_PREVIEW_SCALE);
  }

  /** index.html:1969-1972. Three ellipses per cloud, redrawn every frame as they drift. */
  private drawClouds(t: number): void {
    this.clouds.clear().fillStyle(CLOUD_FILL, CLOUD_ALPHA);
    for (const cx of CLOUD_X) {
      const dy = Math.sin(t * CLOUD_DRIFT_SPEED + cx) * CLOUD_DRIFT;
      for (const puff of [CLOUD_MAIN, ...CLOUD_PUFFS]) {
        this.clouds.fillEllipse(cx + puff.dx, CLOUD_Y + dy + puff.dy, puff.w, puff.h);
      }
    }
  }

  /**
   * index.html:1983-2007. The chosen card grows and shrinks by three pixels, and because
   * every label is positioned from the card's own box, they all move with it — which is why
   * this repositions rather than only recolours.
   */
  private drawCards(t: number): void {
    this.boxes.clear();
    this.cards.forEach((card, i) => {
      const chosen = i === this.index;
      const pulse = chosen ? Math.sin(t * PULSE_SPEED) * PULSE_AMPLITUDE : 0;
      const x = CARD_LEFT + i * (CARD_W + CARD_GAP) - pulse / 2;
      const y = CARD_TOP - pulse / 2;
      const w = CARD_W + pulse;
      const h = CARD_H + pulse;
      const glow = Phaser.Display.Color.HexStringToColor(card.glow).color;

      if (chosen) {
        this.boxes
          .fillStyle(GLOW_FILL, GLOW_ALPHA)
          .fillRect(x - GLOW_INSET, y - GLOW_INSET, w + GLOW_INSET * 2, h + GLOW_INSET * 2);
      }
      this.boxes
        .fillStyle(CARD_FILL, chosen ? CARD_FILL_ALPHA_ON : CARD_FILL_ALPHA_OFF)
        .fillRect(x, y, w, h)
        .lineStyle(
          chosen ? CARD_EDGE_W_ON : CARD_EDGE_W_OFF,
          chosen ? glow : CARD_EDGE_OFF,
          chosen ? 1 : CARD_EDGE_ALPHA_OFF,
        )
        .strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

      const alpha = chosen ? 1 : CARD_ALPHA_OFF;
      const mid = x + w / 2;
      this.icons[i].setPosition(mid, y + ICON_DY).setAlpha(alpha);
      this.names[i]
        .setPosition(mid, y + NAME_DY)
        .setAlpha(alpha)
        .setColor(chosen ? card.glow : NAME_COLOR_OFF);
      this.descs[i]
        .setPosition(mid, y + DESC_DY)
        .setAlpha(alpha)
        .setColor(chosen ? DESC_COLOR_ON : DESC_COLOR_OFF);

      if (!chosen) return;
      // :2004-2005. `▶` sits left of the card and `◀` right of it, so they point at it.
      this.arrowIn.setPosition(x - ARROW_DX, y + h / 2 + ARROW_DY).setColor(card.glow);
      this.arrowOut.setPosition(x + w + ARROW_DX, y + h / 2 + ARROW_DY).setColor(card.glow);
    });
  }
}
