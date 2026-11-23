import Phaser from 'phaser';
import { capitals } from '../config/i18n';
import { powerupLabel } from '../data/powerups';
import type { PowerupType, World } from '../game/types';
import { GAME_FONT, GAME_FONT_BOLD, GAME_TEXT_RESOLUTION } from '../gfx/gameFont';
import { POPUP_CENTRE_X, POPUP_CENTRE_Y, popupFrame, popupSparks } from '../gfx/powerupPopup';
import { fitScreenCamera } from '../gfx/render';
import { POWERUP_POPUP_SCENE_KEY } from './keys';

/**
 * The same live reference to the simulation's World that the HUD is handed, and under
 * the same rule: this scene READS it and never writes to it. See HudScene's HudData.
 */
export interface PowerupPopupData {
  world: World;
}

/** What the whole announcement is laid out around: up top, over play that goes on. */
const CENTRE_X = POPUP_CENTRE_X;
const CENTRE_Y = POPUP_CENTRE_Y;

/** index.html:3168, :3171, :3173 — offsets from the centre, not absolute coordinates. */
const ICON_DY = -20;
const NAME_DY = 15;
const DESC_DY = 35;

const ICON_FONT = { fontFamily: 'serif', resolution: GAME_TEXT_RESOLUTION, fontSize: '36px', color: '#ffffff' };
const NAME_FONT = { fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '20px' };
const DESC_FONT = { fontFamily: GAME_FONT, resolution: GAME_TEXT_RESOLUTION, fontSize: '12px', color: '#ffffff' };

/** :3159 — the box is black, nearly opaque. */
const BLACK = 0x000000;
const BOX_FILL_ALPHA = 0.85;

const RING_LINE_WIDTH = 3;
const BOX_LINE_WIDTH = 3;
/** :3162-3163 — the second, thinner border, inset and pulsing. */
const INNER_BORDER_WIDTH = 1;
const INNER_BORDER_INSET = 3;

/** :3181. Four pixels square, centred on the orbit point. */
const SPARK_SIZE = 4;

/**
 * The power-up announcement: `drawPowerupPopup`, index.html:3140-3184.
 *
 * Taking a power-up (a rainbow block, or a course's station the first time) sets
 * `world.powerupPopup`. The live game froze the whole world for its 120 frames
 * (index.html:1276); the port does not any more, so this is a banner up top over play that
 * carries on, with no dim over the screen.
 *
 * A scene of its own, listed after HudScene in main.ts, because the live game draws the
 * popup AFTER the whole frame including the HUD (index.html:3455 is
 * `update();draw();drawPowerupPopup();`, and the HUD is drawn inside `draw()` at
 * :1854-1867). So the box sits in front of everything, the hearts and the score included. Phaser renders scenes in the order main.ts lists them, which is the
 * same mechanism the HUD already relies on to sit in front of the world.
 *
 * It runs for the whole level rather than being launched when a popup appears: every
 * object is made once in `create()` and `update()` only shows, moves and re-texts them,
 * the same shape as the HUD. There is nothing to construct at the moment of the surprise.
 *
 * `world.animFrame` drives the shimmer and the orbiting sparks.
 */
export class PowerupPopupScene extends Phaser.Scene {
  private world!: World;
  private graphics!: Phaser.GameObjects.Graphics;
  private iconText!: Phaser.GameObjects.Text;
  private nameText!: Phaser.GameObjects.Text;
  private descText!: Phaser.GameObjects.Text;

  /**
   * Which power-up the three labels are currently spelled for. The text and the name's
   * colour are rewritten when this changes and on no other frame — a Text re-renders its
   * texture when either is assigned, and a popup is on screen for 120 frames.
   */
  private shown: PowerupType | null = null;
  /** The record's colour as Phaser wants it, resolved alongside `shown`. */
  private color = 0xffffff;

  constructor() {
    super(POWERUP_POPUP_SCENE_KEY);
  }

  init(data: PowerupPopupData): void {
    this.world = data.world;
    // This scene is relaunched per level onto the same instance, and `create` below makes
    // three fresh, EMPTY labels. Left as it was, `shown` would still name the power-up the
    // previous level's labels were spelled for, and `retext` — which is a no-op when the
    // type has not changed — would leave the new ones blank for the same power-up twice in
    // a row. See the field's own comment.
    this.shown = null;
  }

  create(): void {
    fitScreenCamera(this);
    // Added before the labels, so the labels draw in front of the box rather than under
    // it — inside one scene, creation order is what decides that.
    this.graphics = this.add.graphics();

    // `textBaseline='middle'` for the emoji (index.html:3166) and the default
    // `'alphabetic'` for the two lines below it (:3169), which is the bottom-anchored
    // approximation the rest of the port makes — see HudScene's `hudText`.
    this.iconText = this.label(CENTRE_X, CENTRE_Y + ICON_DY, ICON_FONT, 0.5);
    this.nameText = this.label(CENTRE_X, CENTRE_Y + NAME_DY, NAME_FONT, 1);
    this.descText = this.label(CENTRE_X, CENTRE_Y + DESC_DY, DESC_FONT, 1);
  }

  private label(
    x: number,
    y: number,
    style: Phaser.Types.GameObjects.Text.TextStyle,
    originY: number,
  ): Phaser.GameObjects.Text {
    // `textAlign='center'` throughout (index.html:3166), hence the 0.5 across.
    return this.add.text(x, y, '', style).setOrigin(0.5, originY).setVisible(false);
  }

  update(): void {
    const popup = this.world.powerupPopup;
    if (!popup) {
      // index.html:3141. Nothing to announce: the scene is still here, drawing nothing.
      if (this.shown !== null) this.hide();
      return;
    }

    this.retext(popup.type);
    const frame = popupFrame(popup.timer, popup.maxTimer, this.world.animFrame);

    this.graphics
      .clear()
      // :3151-3154. The burst, thrown outwards and fading as it goes.
      .lineStyle(RING_LINE_WIDTH, this.color, frame.ringAlpha)
      .strokeCircle(CENTRE_X, CENTRE_Y, frame.ringRadius);
    if (frame.showInnerRing) {
      this.graphics.strokeCircle(CENTRE_X, CENTRE_Y, frame.innerRingRadius);
    }

    this.graphics
      // :3159-3160. The box: a near-opaque black panel in the power-up's own colour.
      .fillStyle(BLACK, frame.alpha * BOX_FILL_ALPHA)
      .fillRect(frame.boxX, frame.boxY, frame.boxW, frame.boxH)
      .lineStyle(BOX_LINE_WIDTH, this.color, frame.alpha)
      .strokeRect(frame.boxX, frame.boxY, frame.boxW, frame.boxH)
      // :3162-3163. The inner border, pulsing on the shimmer.
      .lineStyle(INNER_BORDER_WIDTH, this.color, frame.alpha * frame.shimmer)
      .strokeRect(
        frame.boxX + INNER_BORDER_INSET,
        frame.boxY + INNER_BORDER_INSET,
        frame.boxW - INNER_BORDER_INSET * 2,
        frame.boxH - INNER_BORDER_INSET * 2,
      );

    // :3176-3182. Four sparks going round the box on the same shimmer.
    this.graphics.fillStyle(this.color, frame.alpha * frame.shimmer);
    for (const spark of popupSparks(this.world.animFrame, frame.boxW, frame.boxH)) {
      this.graphics.fillRect(
        spark.x - SPARK_SIZE / 2,
        spark.y - SPARK_SIZE / 2,
        SPARK_SIZE,
        SPARK_SIZE,
      );
    }

    // :3165. The labels wait for the box to have very nearly finished growing.
    for (const text of [this.iconText, this.nameText, this.descText]) {
      text.setVisible(frame.showText).setAlpha(frame.alpha);
    }
  }

  /** Spells the three labels for `type`, if they are not already spelled for it. */
  private retext(type: PowerupType): void {
    if (this.shown === type) return;
    const label = powerupLabel(type);
    this.shown = type;
    this.color = Phaser.Display.Color.HexStringToColor(label.color).color;
    this.iconText.setText(label.icon);
    // :3170. The name is in the power-up's colour; the description stays white.
    this.nameText.setText(capitals(label.name)).setColor(label.color);
    this.descText.setText(capitals(label.desc));
  }

  private hide(): void {
    this.shown = null;
    this.graphics.clear();
    this.iconText.setVisible(false);
    this.nameText.setVisible(false);
    this.descText.setVisible(false);
  }
}
