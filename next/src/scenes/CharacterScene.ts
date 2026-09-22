import Phaser from 'phaser';
import { BASE_W } from '../config/constants';
import { TStr } from '../config/i18n';
import type { Character } from '../game/player';
import { characterAt, characterName, siblingOf, wrapIndex } from '../game/menu';
import { getSkinIndex, setSelectedChar, setSkinIndex, skinsOf, startRun } from '../game/run';
import { createStarField, type StarField, type StarFieldSpec } from '../gfx/starfield';
import { menuPlayerTextureKey, MENU_PORTRAIT_SCALE, registerMenuTextures } from '../gfx/textures';
import { bindMenuKeys, type MenuKeys, justDown, pressedAny } from '../input/menuKeys';
import { CHARACTER_SCENE_KEY, SLICE_SCENE_KEY } from './keys';

/**
 * Where Escape goes. Passed in rather than imported, so this scene knows nothing about
 * what comes before it: `BACK_TARGET` maps `select` to `difficulty` today
 * (index.html:1234), and when the full navigation table lands it will be the table
 * deciding, not this file.
 */
export interface CharacterData {
  back: string;
}

/** index.html:2152. */
const BACKGROUND = '#2a2a5a';
/** index.html:2153 — thirty dots, brighter and faster than the difficulty screen's forty. */
const STARS: StarFieldSpec = {
  count: 30,
  strideX: 73, offsetX: 20,
  strideY: 47, offsetY: 10,
  speed: 0.03, base: 0.3, swing: 0.2,
};

/** index.html:2154. */
const TITLE_Y = 60;
const TITLE_FONT = { fontFamily: 'monospace', fontSize: '28px', fontStyle: 'bold', color: '#ffdd00' };

/**
 * The two panels (index.html:2155-2164). `x` is each panel's anchor, the live `gx`/`dx`,
 * and everything on the panel is an offset from it. Their boxes are 110 wide starting
 * 15 left of the anchor, so the anchor is NOT the centre — the centre is `x + 40`, which
 * is where the live game puts the names.
 *
 * `spriteDy` differs between them, and that is not a typo in the original: Gigi's sprite
 * starts 10 below the anchor and Dodo's 15, because Dodo's art is 12 rows to Gigi's 14
 * and at scale 4 that is 8px less sprite. The extra 5 closes most of that gap — their
 * feet still land 3px apart, which is how the live screen has always looked and is left
 * alone rather than tidied into a difference from the original.
 */
interface Panel {
  character: Character;
  x: number;
  spriteDy: number;
  /** The box, and the name under it, in this character's own colour. */
  color: string;
  fillAlpha: number;
}

const PANEL_Y = 120;
const PANELS: readonly Panel[] = [
  // index.html:2155-2159.
  { character: 'gigi', x: BASE_W / 2 - 130, spriteDy: 10, color: '#ffdd00', fillAlpha: 0.1 },
  // index.html:2160-2164.
  { character: 'dodo', x: BASE_W / 2 + 20, spriteDy: 15, color: '#ff69b4', fillAlpha: 0.1 },
];

const BOX_DX = -15;
const BOX_DY = -10;
const BOX_W = 110;
const BOX_H = 190;
const BOX_LINE_WIDTH = 3;

const SPRITE_DX = 15;
/** Both labels are centred on `x + 40`, the middle of a box that starts at `x - 15`. */
const LABEL_DX = 40;
const NAME_DY = 175;
const SKIN_DY = 192;

const NAME_FONT = { fontFamily: 'monospace', fontSize: '16px', fontStyle: 'bold', color: '#ffffff' };
const SKIN_FONT = { fontFamily: 'monospace', fontSize: '9px', color: '#aaaaaa' };

/** index.html:2165-2166. */
const HINT_Y = 350;
const RESCUE_Y = 375;
const HINT_FONT = { fontFamily: 'monospace', fontSize: '12px', color: '#aaaacc' };
const RESCUE_FONT = { fontFamily: 'monospace', fontSize: '12px', color: '#ffaacc' };

/**
 * Choose your hero. Port of `drawSelect` (index.html:2151-2168) and the input that
 * drives it (index.html:1337-1346).
 *
 * The smallest screen in the plan and the one the children touch every single time.
 * Dodo has been fully ported since Plan 5 — her own sprites, her own skins, and a
 * hitbox of her own (20 tall against Gigi's 24, because her art is 12 rows to Gigi's
 * 14; see `createPlayer` in game/player.ts) — and until this scene there was no way to
 * ask for her.
 *
 * Left and right do not step, they SET: two panels, so the live game assigns 0 or 1
 * outright (index.html:1338-1339) rather than incrementing. Up and down cycle the
 * highlighted character's skin, and only that character's — Gigi's skin and Dodo's are
 * two separate settings, each remembered while you look at the other.
 */
export class CharacterScene extends Phaser.Scene {
  private index = 0;
  private back = '';
  private stars!: StarField;
  private highlight!: Phaser.GameObjects.Graphics;
  private portraits: Phaser.GameObjects.Image[] = [];
  private skinLabels: Phaser.GameObjects.Text[] = [];
  private rescueText!: Phaser.GameObjects.Text;
  private keys!: MenuKeys;

  constructor() {
    super(CHARACTER_SCENE_KEY);
  }

  init(data: CharacterData): void {
    this.back = data.back;
  }

  create(): void {
    // index.html:1334 — confirming a difficulty sets `selectIndex=0`. Same reason as
    // DifficultyScene's: the field initialiser runs once per instance, and Phaser reuses
    // instances, so re-entering would otherwise keep the previous choice's cursor.
    this.index = 0;
    registerMenuTextures(this);
    this.cameras.main.setBackgroundColor(BACKGROUND);

    this.stars = createStarField(this, STARS);
    this.highlight = this.add.graphics();

    this.add.text(BASE_W / 2, TITLE_Y, TStr('choose_hero'), TITLE_FONT).setOrigin(0.5, 1);

    this.portraits = PANELS.map((panel) => this.add
      .image(panel.x + SPRITE_DX, PANEL_Y + panel.spriteDy, this.portraitKey(panel.character))
      .setOrigin(0, 0));

    PANELS.forEach((panel) => {
      // 'GIGI' and 'DODO', not translated — see `characterName` in game/menu.ts.
      this.add
        .text(
          panel.x + LABEL_DX,
          PANEL_Y + NAME_DY,
          characterName(panel.character).toUpperCase(),
          NAME_FONT,
        )
        .setOrigin(0.5, 1);
    });

    // Only the highlighted panel shows its skin name, so these are hidden and shown
    // rather than created on demand.
    this.skinLabels = PANELS.map((panel) => this.add
      .text(panel.x + LABEL_DX, PANEL_Y + SKIN_DY, '', SKIN_FONT)
      .setOrigin(0.5, 1)
      .setVisible(false));

    this.add.text(BASE_W / 2, HINT_Y, TStr('lr_choose'), HINT_FONT).setOrigin(0.5, 1);
    this.rescueText = this.add.text(BASE_W / 2, RESCUE_Y, '', RESCUE_FONT).setOrigin(0.5, 1);

    this.keys = bindMenuKeys(this);
    this.drawChoice();
  }

  update(): void {
    this.stars.update();
    // The live game SETS the index rather than stepping it (index.html:1338-1339).
    if (pressedAny(this.keys.left, this.keys.altLeft)) this.select(0);
    if (pressedAny(this.keys.right, this.keys.altRight)) this.select(1);
    if (pressedAny(this.keys.up, this.keys.altUp)) this.cycleSkin(-1);
    if (pressedAny(this.keys.down, this.keys.altDown)) this.cycleSkin(1);
    if (pressedAny(this.keys.confirm, this.keys.enter)) this.confirm();
    if (justDown(this.keys.back)) this.scene.start(this.back);
  }

  private select(index: number): void {
    if (index === this.index) return;
    this.index = index;
    this.drawChoice();
  }

  /** index.html:1340-1343. Wraps, and moves only the highlighted character's skin. */
  private cycleSkin(delta: number): void {
    const character = this.chosen();
    const skins = skinsOf(character);
    setSkinIndex(character, wrapIndex(getSkinIndex(character), delta, skins.length));
    this.drawChoice();
  }

  /**
   * index.html:1344. Committed to the same run state the live game keeps in
   * `selectedChar`, which is what every sprite lookup in the port already reads
   * (`getPlayerSprites`, and SliceScene's own texture-key resolution). `SliceScene`
   * reads it, and the difficulty chosen on the screen before, when it builds the world.
   *
   * And this is where a RUN begins — level 0, a full set of lives, no score (`startRun`,
   * game/run.ts). The live game does it one screen later, on the way out of the intro
   * (index.html:1347's `currentLevel=0;lives=DC().lives;score=0`); the intro is not ported
   * yet, so this is the last screen before the first level and therefore the place. When
   * IntroScene lands it takes this line with it.
   */
  private confirm(): void {
    setSelectedChar(this.chosen());
    startRun();
    this.scene.start(SLICE_SCENE_KEY);
  }

  private chosen(): Character {
    return characterAt(this.index);
  }

  private portraitKey(character: Character): string {
    return menuPlayerTextureKey(character, getSkinIndex(character), MENU_PORTRAIT_SCALE);
  }

  /** Everything that depends on which panel is highlighted, and on its skin. */
  private drawChoice(): void {
    const panel = PANELS[this.index];
    const color = Phaser.Display.Color.HexStringToColor(panel.color).color;
    this.highlight
      .clear()
      .fillStyle(color, panel.fillAlpha)
      .fillRect(panel.x + BOX_DX, PANEL_Y + BOX_DY, BOX_W, BOX_H)
      .lineStyle(BOX_LINE_WIDTH, color)
      .strokeRect(panel.x + BOX_DX, PANEL_Y + BOX_DY, BOX_W, BOX_H);

    PANELS.forEach((p, i) => {
      this.portraits[i].setTexture(this.portraitKey(p.character));
      const chosen = i === this.index;
      this.skinLabels[i].setVisible(chosen).setText(chosen ? `↑↓ ${skinName(p.character)}` : '');
    });

    // index.html:2166. Whoever you are NOT is the one in the cage.
    this.rescueText.setText(`${TStr('rescue')} ${characterName(siblingOf(this.chosen()))}!`);
  }
}

/**
 * The held skin's name, with the same out-of-range fallback `getPlayerSprites` makes
 * (game/run.ts): a skin index from before a skin existed falls back to the first rather
 * than reading a name off `undefined`.
 */
function skinName(character: Character): string {
  const skins = skinsOf(character);
  return (skins[getSkinIndex(character)] ?? skins[0]).name;
}
