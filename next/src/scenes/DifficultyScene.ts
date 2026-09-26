import Phaser from 'phaser';
import { BASE_W } from '../config/constants';
import { DIFFICULTY_CONFIG, DIFF_KEYS, setDifficulty } from '../config/difficulty';
import { capitals, TDiff, TStr } from '../config/i18n';
import { clampIndex, difficultyAt, difficultyLines } from '../game/menu';
import { getSkinIndex } from '../game/run';
import { GAME_FONT, GAME_FONT_BOLD, GAME_TEXT_RESOLUTION } from '../gfx/gameFont';
import { fitScreenCamera } from '../gfx/render';
import { createStarField, type StarField, type StarFieldSpec } from '../gfx/starfield';
import { menuPlayerTextureKey, MENU_PREVIEW_SCALE, registerMenuTextures } from '../gfx/textures';
import { bindMenuKeys, justDown, type MenuKeys, pressedAny } from '../input/menuKeys';
import { CHARACTER_SCENE_KEY, DIFFICULTY_SCENE_KEY } from './keys';
import { takeBack } from './navigate';

/** index.html:2122. */
const BACKGROUND = '#1a1a3a';
/** index.html:2123. */
const STARS: StarFieldSpec = {
  count: 40,
  strideX: 67, offsetX: 10,
  strideY: 43, offsetY: 5,
  speed: 0.02, base: 0.2, swing: 0.15,
};

/** index.html:2124. */
const TITLE_Y = 55;
const TITLE_FONT = { fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '26px', color: '#ffdd00' };

/**
 * index.html:2126-2128. Four cards, 130 apart, the row centred by starting half a card
 * in: `startX = (BASE_W - DIFF_KEYS.length*130)/2 + 65`. Each x is the card's CENTRE —
 * every string on a card is drawn centred on it, the live `textAlign='center'` set at
 * the title and not cleared until the function ends — and `CARD_Y` is the baseline of
 * the difficulty's name, not the top of its box.
 */
const CARD_STEP = 130;
const CARD_Y = 130;
const CARD_START_X = (BASE_W - DIFF_KEYS.length * CARD_STEP) / 2 + CARD_STEP / 2;

/** The highlight round the chosen card (index.html:2129), relative to that card. */
const BOX_DX = -55;
const BOX_DY = -20;
const BOX_W = 110;
const BOX_H = 220;
const BOX_LINE_WIDTH = 3;
/** `cfg.color+'22'` — the card's own colour at alpha 0x22, as the fraction Phaser takes. */
const BOX_FILL_ALPHA = 0x22 / 0xff;

/**
 * index.html:2132-2139. The first line sits 30 below the name and each one after is 18
 * lower — see `difficultyLines` in game/menu.ts, which is where the discovery that the
 * live game's apparently conditional offsets are a plain 18px ladder is written down.
 */
const LINE_DY = 30;
const LINE_STEP = 18;
const NAME_FONT = { fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '14px' };
const LINE_FONT = { fontFamily: GAME_FONT, resolution: GAME_TEXT_RESOLUTION, fontSize: '10px', color: '#aaaacc' };
/**
 * The widest a line may be: the highlight's width, less a little air. Capitals in the game's
 * font run wider than the live game's lowercase monospace, and a line wider than this is
 * shrunk to fit instead of running into the next card.
 */
const LINE_MAX_W = BOX_W - 6;

/**
 * The little Gigi under the chosen card (index.html:2140-2143). 10px lower than the live
 * game's 115, where she covered the sixth line (super easy's speed) and it could not be read.
 */
const PREVIEW_DY = 125;

/** index.html:2146. */
const HINT_Y = 370;
const HINT_FONT = { fontFamily: GAME_FONT, resolution: GAME_TEXT_RESOLUTION, fontSize: '12px', color: '#aaaacc' };

/**
 * Pick a difficulty. Port of `drawDifficulty` (index.html:2121-2149) and the input that
 * drives it (index.html:1331-1336).
 *
 * This is the screen that makes `super_easy` exist. Everything behind it — a cape at
 * spawn, a cape that catches you over a pit, four in ten enemies never spawning, an
 * extra pickup every twenty tiles, `lives: Infinity` — has been ported and covered by
 * tests since Plan 5 and has never once been reachable in a browser, because
 * `SliceScene` named 'normal' in its own source. Almost nothing below is new behaviour.
 * It is a way in.
 *
 * It booted the port for one plan, until the title screen and mode select landed in front
 * of it. It is now the third screen a child sees and the first one that decides anything
 * about the run.
 *
 * Same discipline as HudScene: every object is built once in `create()`, and the frame
 * loop only re-positions and re-styles. The cards' text never changes — only the
 * highlight and the preview move — so the per-frame work is the star field and two
 * objects.
 */
export class DifficultyScene extends Phaser.Scene {
  private index = 0;
  private stars!: StarField;
  /** Behind the card text, so it is created before it: at depth 0, creation is order. */
  private highlight!: Phaser.GameObjects.Graphics;
  private preview!: Phaser.GameObjects.Image;
  private keys!: MenuKeys;

  constructor() {
    super(DIFFICULTY_SCENE_KEY);
  }

  create(): void {
    fitScreenCamera(this);
    // index.html:1324 — entering this state sets `diffIndex=0`. The field initialiser
    // above runs once per scene INSTANCE, and Phaser reuses instances across restarts,
    // so without this a finished run returns to the last difficulty picked rather than
    // to the first card.
    this.index = 0;
    registerMenuTextures(this);
    this.cameras.main.setBackgroundColor(BACKGROUND);

    this.stars = createStarField(this, STARS);
    this.highlight = this.add.graphics();

    this.add.text(BASE_W / 2, TITLE_Y, TStr('select_diff'), TITLE_FONT).setOrigin(0.5, 1);

    DIFF_KEYS.forEach((key, i) => {
      const x = cardX(i);
      this.add
        .text(x, CARD_Y, TDiff(key), { ...NAME_FONT, color: DIFFICULTY_CONFIG[key].color })
        .setOrigin(0.5, 1);
      // Fixed at create: which lines a card has depends only on its record, and a
      // record does not change while the screen is up.
      difficultyLines(key).forEach((line, row) => {
        const text = this.add.text(x, CARD_Y + LINE_DY + row * LINE_STEP, capitals(line), LINE_FONT).setOrigin(0.5, 1);
        if (text.width > LINE_MAX_W) text.setScale(LINE_MAX_W / text.width);
      });
    });

    // Always Gigi, whoever ends up being played: the character has not been chosen yet,
    // and index.html:2142 reaches straight for GIGI_SKINS. The skin is whichever one was
    // last picked on the screen AFTER this one, which on a first run is the first.
    this.preview = this.add
      .image(0, 0, menuPlayerTextureKey('gigi', getSkinIndex('gigi'), MENU_PREVIEW_SCALE))
      .setOrigin(0.5, 0);

    this.add.text(BASE_W / 2, HINT_Y, TStr('lr_choose'), HINT_FONT).setOrigin(0.5, 1);

    this.keys = bindMenuKeys(this);
    this.drawChoice();
  }

  update(): void {
    this.stars.update();
    if (pressedAny(this.keys.left, this.keys.altLeft)) this.move(-1);
    if (pressedAny(this.keys.right, this.keys.altRight)) this.move(1);
    if (pressedAny(this.keys.confirm, this.keys.enter)) this.confirm();
    // `BACK_TARGET` sends `difficulty` to `modeselect` (index.html:1234). This screen was
    // the root of the port until the title landed and had nowhere to go back to; now it has
    // two screens in front of it and the table is what knows that.
    if (justDown(this.keys.back)) takeBack(this, 'difficulty');
  }

  private move(delta: number): void {
    const next = clampIndex(this.index, delta, DIFF_KEYS.length);
    if (next === this.index) return;
    this.index = next;
    this.drawChoice();
  }

  /**
   * index.html:1334. The choice is committed here, into the same module-level run state
   * the live game keeps in `selectedDifficulty` — `SliceScene` reads it back out when it
   * builds the world, and hands it to the HUD for its label.
   *
   * ## Where the audio unlock went
   *
   * This confirm used to carry `ensureAudio(); startBGM(BGM_TITLE);`, because a browser will
   * not start an AudioContext outside a user gesture and this was the first confirm a child
   * could make in a port that booted here. The live game spends that gesture on the title
   * screen's confirm (index.html:1313) and so, now, does this port — TitleScene has those
   * two lines, and this screen's comment for them was always written as a loan.
   *
   * Which leaves this line silent, and that is live too: index.html:1334 plays no confirm
   * sound, unlike the mode select before it (:1323's `ensureAudio();sfxPickup();`). The
   * menu theme that started at the title is still playing over this screen.
   */
  private confirm(): void {
    setDifficulty(difficultyAt(this.index));
    this.scene.start(CHARACTER_SCENE_KEY);
  }

  /** The two things on this screen that depend on which card is chosen. */
  private drawChoice(): void {
    const key = difficultyAt(this.index);
    const color = Phaser.Display.Color.HexStringToColor(DIFFICULTY_CONFIG[key].color).color;
    const x = cardX(this.index);
    this.highlight
      .clear()
      .fillStyle(color, BOX_FILL_ALPHA)
      .fillRect(x + BOX_DX, CARD_Y + BOX_DY, BOX_W, BOX_H)
      .lineStyle(BOX_LINE_WIDTH, color)
      .strokeRect(x + BOX_DX, CARD_Y + BOX_DY, BOX_W, BOX_H);
    this.preview.setPosition(x, CARD_Y + PREVIEW_DY);
  }
}

function cardX(index: number): number {
  return CARD_START_X + index * CARD_STEP;
}
