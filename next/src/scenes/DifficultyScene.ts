import Phaser from 'phaser';
import { BASE_W } from '../config/constants';
import { DIFFICULTY_CONFIG, DIFF_KEYS, setDifficulty } from '../config/difficulty';
import { TDiff, TStr } from '../config/i18n';
import { clampIndex, difficultyAt, difficultyLines } from '../game/menu';
import { getSkinIndex } from '../game/run';
import { createStarField, type StarField, type StarFieldSpec } from '../gfx/starfield';
import { menuPlayerTextureKey, MENU_PREVIEW_SCALE, registerMenuTextures } from '../gfx/textures';
import { bindMenuKeys, type MenuKeys, pressedAny } from '../input/menuKeys';
import { CHARACTER_SCENE_KEY, type CharacterData } from './CharacterScene';

export const DIFFICULTY_SCENE_KEY = 'Difficulty';

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
const TITLE_FONT = { fontFamily: 'monospace', fontSize: '26px', fontStyle: 'bold', color: '#ffdd00' };

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
const NAME_FONT = { fontFamily: 'monospace', fontSize: '14px', fontStyle: 'bold' };
const LINE_FONT = { fontFamily: 'monospace', fontSize: '10px', color: '#aaaacc' };

/** The little Gigi under the chosen card (index.html:2140-2143). */
const PREVIEW_DY = 115;

/** index.html:2146. */
const HINT_Y = 370;
const HINT_FONT = { fontFamily: 'monospace', fontSize: '12px', color: '#aaaacc' };

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
 * Boots first, for now. The title and mode select are Task 4 of this plan and land in
 * front of it; until then this is where the game starts, which is a step up from
 * starting mid-level on a difficulty nobody chose.
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
        this.add.text(x, CARD_Y + LINE_DY + row * LINE_STEP, line, LINE_FONT).setOrigin(0.5, 1);
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

  /**
   * No `back` here, deliberately. `BACK_TARGET` sends `difficulty` to `modeselect`
   * (index.html:1234) and mode select does not exist yet — so Escape on this screen has
   * nowhere to go, exactly as Escape on the live title screen has nowhere to go.
   * `handleBack` returning false for a state with no target is the live game's own
   * answer to that (index.html:1267). The screen after this one CAN come back here,
   * which is the half of the table that matters while this is the root.
   */
  update(): void {
    this.stars.update();
    if (pressedAny(this.keys.left, this.keys.altLeft)) this.move(-1);
    if (pressedAny(this.keys.right, this.keys.altRight)) this.move(1);
    if (pressedAny(this.keys.confirm, this.keys.enter)) this.confirm();
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
   */
  private confirm(): void {
    setDifficulty(difficultyAt(this.index));
    this.scene.start(CHARACTER_SCENE_KEY, { back: DIFFICULTY_SCENE_KEY } satisfies CharacterData);
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
