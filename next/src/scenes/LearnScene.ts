import Phaser from 'phaser';
import { BASE_H, BASE_W } from '../config/constants';
import { TStr } from '../config/i18n';
import { createStarField, type StarField, type StarFieldSpec } from '../gfx/starfield';
import { bindMenuKeys, justDown, type MenuKeys, pressedAny } from '../input/menuKeys';
import { LEARN_SCENE_KEY } from './keys';
import { takeBack } from './navigate';

/** The difficulty screen's night sky, so this reads as a screen of the same game. */
const BACKGROUND = '#1a1a3a';
const STARS: StarFieldSpec = {
  count: 40,
  strideX: 67, offsetX: 10,
  strideY: 43, offsetY: 5,
  speed: 0.02, base: 0.2, swing: 0.15,
};

const ICON_Y = 130;
const TITLE_Y = 190;
const BODY_Y = 220;
const HINT_Y = BASE_H - 40;

const ICON_FONT = { fontFamily: 'serif', fontSize: '64px' };
const TITLE_FONT = {
  fontFamily: 'monospace', fontSize: '22px', fontStyle: 'bold', color: '#88ffbb',
};
const BODY_FONT = { fontFamily: 'monospace', fontSize: '12px', color: '#aaaacc' };
const HINT_FONT = { fontFamily: 'monospace', fontSize: '12px', color: '#ffdd00' };

/**
 * Learn mode, which is not ported: a screen that admits it.
 *
 * It stands in for the live `learnmenu` — that is the state it answers to in
 * `SCENE_FOR_STATE` (scenes/keys.ts) — and it exists because the mode select screen offers
 * two things and a child will press both. A card that silently does nothing is read as a
 * broken game; a card that leads somewhere that says "not yet" is read as a promise, which
 * is what it is. The letters and syllables behind the real `learnmenu` are a second game's
 * worth of work (index.html's LEARN MODE section) and belong to their own plan.
 *
 * Nothing here is ported from anything, so there are no line references to check. What IS
 * live is the way out: `learnmenu` goes back to `modeselect` with the cursor on the learn
 * card rather than on adventure (index.html:1268), which is the one rule in the navigation
 * table that exists purely for learn mode — and the one most easily dropped on the way,
 * which is exactly how the bug that table prevents happened in the first place.
 */
export class LearnScene extends Phaser.Scene {
  private stars!: StarField;
  private keys!: MenuKeys;
  private leaving = false;

  constructor() {
    super(LEARN_SCENE_KEY);
  }

  create(): void {
    this.leaving = false;
    this.cameras.main.setBackgroundColor(BACKGROUND);
    this.stars = createStarField(this, STARS);

    this.line(ICON_Y, ICON_FONT, '📚');
    this.line(TITLE_Y, TITLE_FONT, TStr('learn_soon'));
    this.line(BODY_Y, BODY_FONT, TStr('learn_soon_d'));
    // `{B}` resolves to the connected pad's cancel glyph, the same machinery the title's
    // `{A}` uses (config/glyphs.ts).
    this.line(HINT_Y, HINT_FONT, TStr('back_hint'));

    this.keys = bindMenuKeys(this);
  }

  private line(
    y: number,
    style: Phaser.Types.GameObjects.Text.TextStyle,
    text: string,
  ): Phaser.GameObjects.Text {
    return this.add.text(BASE_W / 2, y, text, style).setOrigin(0.5, 1);
  }

  /**
   * Confirm goes back too, not only cancel. Everywhere else in the game the big button means
   * "yes, this one" and there is nothing here to say yes to, so the alternative is a screen
   * where the button a child has pressed on every other screen does nothing at all.
   */
  update(): void {
    this.stars.update();
    if (this.leaving) return;
    if (justDown(this.keys.back) || pressedAny(this.keys.confirm, this.keys.enter)) {
      this.leaving = true;
      takeBack(this, 'learnmenu');
    }
  }
}
