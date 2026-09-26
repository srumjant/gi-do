import Phaser from 'phaser';
import { BASE_H, BASE_W } from '../config/constants';
import { TStr } from '../config/i18n';
import { getRescueSprites, isLastLevel } from '../game/run';
import type { World } from '../game/types';
import { GAME_FONT, GAME_FONT_BOLD, GAME_TEXT_RESOLUTION } from '../gfx/gameFont';
import { fitScreenCamera } from '../gfx/render';
import { LEVEL_OVERLAY_SCENE_KEY } from './keys';

/**
 * The same live reference to the simulation's World the HUD and the power-up announcement
 * are handed, under the same rule: this scene READS it and never writes to it. `levelIndex`
 * comes across for the same reason the HUD needs it — the World knows its level RECORD but
 * not its number, and the rescue line asks whether this was the last one.
 */
export interface LevelOverlayData {
  world: World;
  levelIndex: number;
}

/** index.html:1898 and :1899 — both wash the whole screen, at different alphas. */
const BLACK = 0x000000;
const RESCUE_DIM = 0.4;
const DEATH_DIM = 0.3;

/** index.html:1898. Both lines are centred, one above the middle and one below. */
const RESCUE_TITLE_DY = -10;
const RESCUE_SUB_DY = 20;
const RESCUE_TITLE_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '24px', color: '#ff69b4',
};
const RESCUE_SUB_FONT = { fontFamily: GAME_FONT, resolution: GAME_TEXT_RESOLUTION, fontSize: '14px', color: '#ffffff' };

/** index.html:1899. One line, dead centre. */
const DEATH_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '20px', color: '#ff3333',
};

/**
 * The two things the live game draws OVER the frozen world rather than instead of it:
 * 'Oops!' while you are waiting to respawn, and '<SIBLING> IS SAFE!' while the level you
 * just finished is still on screen behind it (index.html:1898-1899).
 *
 * A scene, and a parallel one, because that is what those two lines are. They sit at the
 * very bottom of `drawWorldFrame`, after the world, after the camera transforms have been
 * popped and after the HUD — so they are unzoomed, unscrolled 640x400 drawing that falls
 * across the hearts and the score as well. A concurrent Phaser scene listed after HudScene
 * in main.ts is exactly that, and it means SliceScene does not have to learn to draw in
 * screen space just for two labels. The same arrangement PowerupPopupScene already uses,
 * and for the same reasons.
 *
 * Launched once with the level and left running, rather than started at the moment a child
 * dies: there is nothing to build when the surprise comes, only something to show. Its
 * whole update is two booleans read off the World.
 *
 * What it does NOT do is decide anything. The respawn is `stepWorld`'s (world.ts, the dead
 * branch) and the level advance is SliceScene's; this scene is a label that appears while
 * they are happening. That matters because both of those are timed, and a screen that
 * counted its own frames would drift away from the countdown it is captioning.
 */
export class LevelOverlayScene extends Phaser.Scene {
  private world!: World;
  private levelIndex!: number;
  private dim!: Phaser.GameObjects.Graphics;
  private rescueTitle!: Phaser.GameObjects.Text;
  private rescueSub!: Phaser.GameObjects.Text;
  private deathText!: Phaser.GameObjects.Text;

  constructor() {
    super(LEVEL_OVERLAY_SCENE_KEY);
  }

  init(data: LevelOverlayData): void {
    this.world = data.world;
    this.levelIndex = data.levelIndex;
  }

  create(): void {
    fitScreenCamera(this);
    this.dim = this.add.graphics().setVisible(false);

    // index.html:1898's `getRescueSprites().name.toUpperCase()+T('is_safe')`. Resolved at
    // create rather than per frame: the sibling cannot change during a level, and neither
    // can which level this is. `is_safe` starts with its own space, like every other label
    // in i18n.ts that follows a name, so this really is a bare concatenation.
    const sibling = getRescueSprites().name.toUpperCase();
    this.rescueTitle = this.centred(RESCUE_TITLE_DY, RESCUE_TITLE_FONT, sibling + TStr('is_safe'));
    // 'Next world...' or 'You did it!', decided by whether there is a level after this one.
    const closing = isLastLevel(this.levelIndex) ? 'you_did_it' : 'next_world';
    this.rescueSub = this.centred(RESCUE_SUB_DY, RESCUE_SUB_FONT, TStr(closing));
    this.deathText = this.centred(0, DEATH_FONT, TStr('oops'));
  }

  /** A line centred on the screen, `dy` from the middle, hidden until something wants it. */
  private centred(
    dy: number,
    style: Phaser.Types.GameObjects.Text.TextStyle,
    text: string,
  ): Phaser.GameObjects.Text {
    return this.add
      .text(BASE_W / 2, BASE_H / 2 + dy, text, style)
      .setOrigin(0.5, 1)
      .setVisible(false);
  }

  update(): void {
    const { won, dead } = this.world;
    this.rescueTitle.setVisible(won);
    this.rescueSub.setVisible(won);
    // A death during the rescue freeze is not possible — `stepWorld` returns before
    // anything can hurt the player once `won` is set — so these two never overlap, and the
    // wash below can simply pick whichever is showing.
    this.deathText.setVisible(dead);

    this.dim.setVisible(won || dead);
    if (!won && !dead) return;
    this.dim
      .clear()
      .fillStyle(BLACK, won ? RESCUE_DIM : DEATH_DIM)
      .fillRect(0, 0, BASE_W, BASE_H);
  }
}
