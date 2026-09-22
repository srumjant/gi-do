import Phaser from 'phaser';
import { BASE_W, STEP_HZ } from '../config/constants';
import type { DifficultyKey } from '../config/difficulty';
import { TDiff, TStr } from '../config/i18n';
import type { World } from '../game/types';
import {
  HUD_BOW_TEXTURE,
  HUD_CAT_TEXTURE,
  HUD_HEART_TEXTURE,
  HUD_SUPER_TEXTURE,
  registerHudTextures,
} from '../gfx/textures';

export const HUD_SCENE_KEY = 'Hud';

/**
 * What the HUD needs that it cannot read off the World: which level this is and which
 * difficulty was picked. The live game has both as globals (`currentLevel` and
 * `selectedDifficulty`, index.html:988 and :161) and the HUD line reads them straight
 * off there; this port keeps neither on `World` — `world.level` is the level RECORD
 * and `world.dc` the difficulty RECORD, and neither carries the index or the key the
 * two translation lookups below need. So the scene that chose them hands them over.
 *
 * `world` is a live reference, deliberately. `respawnLevel` mutates the World in place
 * rather than replacing it, so one reference stays correct for the whole run — and the
 * HUD wants the current numbers every frame, not a snapshot of the numbers at launch.
 */
export interface HudData {
  world: World;
  levelIndex: number;
  difficulty: DifficultyKey;
}

/** index.html:1858. Indexed by level, 0-based, so level 0 is `level_1`. */
const LEVEL_NAME_KEYS = ['level_1', 'level_2', 'level_3', 'level_4', 'level_5', 'level_6'];

/** Hearts start here and step right (index.html:1855-1856). */
const HEART_X = 8;
const HEART_Y = 8;
const HEART_STEP = 18;

/** The `∞` that replaces the row when lives are infinite (index.html:1855). */
const INFINITY_GLYPH = '∞';
const INFINITY_X = 28;
const INFINITY_Y = 22;

/** index.html:1857. */
const SCORE_X = BASE_W - 140;
const SCORE_Y = 22;

/** index.html:1859. Not centred — a fixed offset left of centre, as the live game has it. */
const LEVEL_X = BASE_W / 2 - 60;
const LEVEL_Y = 16;

/**
 * The right-hand icon row (index.html:1860-1862). `ICON_START_X` is where the FIRST
 * icon drawn lands, and the cursor walks left by `ICON_STEP` for each icon actually
 * drawn — see `syncIcons`.
 */
const ICON_START_X = BASE_W - 40;
const ICON_STEP = 22;
/** The cat sits two pixels higher than the cape and the bow, and its count higher too. */
const CAT_ICON_Y = 30;
const CAT_COUNT_Y = 48;
const ITEM_ICON_Y = 32;
const BOW_COUNT_Y = 50;
/** Both counts are nudged right of their icon's left edge by the same 2px. */
const COUNT_X_OFFSET = 2;

/** The power-up column under the hearts (index.html:1863-1867). */
const POWERUP_ICON_X = 8;
const POWERUP_LABEL_X = 26;
const POWERUP_Y = 44;
const POWERUP_STEP_Y = 16;

/**
 * `Math.ceil(timer/60)` (index.html:1865-1866). The live game divides by a literal 60
 * because its frame counters ARE its clock; STEP_HZ is that same 60, named.
 */
const FRAMES_PER_SECOND = STEP_HZ;

const INFINITY_FONT = { fontFamily: 'monospace', fontSize: '16px', fontStyle: 'bold', color: '#ffffff' };
const SCORE_FONT = { fontFamily: 'monospace', fontSize: '14px', fontStyle: 'bold', color: '#ffffff' };
/**
 * `'#ffffffaa'` (index.html:1859) — white at two-thirds alpha, passed through as the
 * eight-digit hex the live game writes. Phaser assigns a Text style's `color` straight
 * to the canvas `fillStyle`, which takes `#rrggbbaa` as readily as `#rrggbb`, so unlike
 * the Graphics objects elsewhere in this port there is no colour/alpha split to do.
 */
const LEVEL_FONT = { fontFamily: 'monospace', fontSize: '10px', color: '#ffffffaa' };
const CAT_COUNT_FONT = { fontFamily: 'monospace', fontSize: '8px', fontStyle: 'bold', color: '#ffffff' };
const BOW_COUNT_FONT = { fontFamily: 'monospace', fontSize: '10px', fontStyle: 'bold', color: '#ffffff' };
/** The three power-up glyphs are emoji in `14px serif` (index.html:1865-1867). */
const POWERUP_ICON_FONT = { fontFamily: 'serif', fontSize: '14px' };
const FART_LABEL_FONT = { fontFamily: 'monospace', fontSize: '10px', fontStyle: 'bold', color: '#88cc44' };
const BIG_HEAD_LABEL_FONT = { fontFamily: 'monospace', fontSize: '10px', fontStyle: 'bold', color: '#ff69b4' };
const CHICKEN_LABEL_FONT = { fontFamily: 'monospace', fontSize: '10px', fontStyle: 'bold', color: '#ffffff' };

/** index.html:1865-1867, as codepoints rather than the source's surrogate-pair escapes. */
const FART_GLYPH = '\u{1F4A8}';
const BIG_HEAD_GLYPH = '\u{1F92A}';
const CHICKEN_GLYPH = '\u{1F414}';

/**
 * The numbers, on screen. A scene of its own, running alongside SliceScene.
 *
 * The live HUD is drawn at index.html:1854-1867, immediately after BOTH `ctx.restore()`
 * calls have popped the camera and the screen shake (index.html:1851-1852) — that is,
 * in raw, unzoomed, unscrolled 640x400 canvas space. A concurrent Phaser scene is the
 * same thing: its `cameras.main` is its own, starts at zoom 1 and scroll (0, 0), and
 * this scene never touches it, so every coordinate below is the live coordinate
 * unchanged. SliceScene's `setZoom(ZOOM)` and its per-frame `setScroll` apply to
 * SliceScene's camera and reach nothing in here.
 *
 * Doing it this way also closes off a whole class of bug the live game actually hit.
 * There, everything shares one canvas context, so state left behind by one drawing pass
 * leaks into the next: `bb84c41` fixed a pause overlay that set `ctx.lineWidth = 3` and
 * never put it back, and because the tile loop strokes block borders without setting a
 * width of its own, a single pause left every border in the level fat until something
 * else happened to reset it. Separate scenes cannot do that to each other.
 *
 * READ-ONLY, and that is the rule that matters most here. This scene holds a live
 * reference to the simulation's World and must never assign to it: the moment a HUD can
 * write to the world, nothing the simulation's tests prove about it means anything.
 * Everything below only reads.
 *
 * Every object is created once, in `create()`, and `update()` only positions, re-texts
 * and shows or hides them — the same shape as SliceScene, and for the same reason: a
 * HUD that allocated per frame would be the one thing on screen doing so.
 */
export class HudScene extends Phaser.Scene {
  private world!: World;
  private levelIndex!: number;
  private difficulty!: DifficultyKey;

  /** One image per life, grown on demand — see `heartAt`. */
  private readonly hearts: Phaser.GameObjects.Image[] = [];
  private infinityText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;

  private catIcon!: Phaser.GameObjects.Image;
  private catCount!: Phaser.GameObjects.Text;
  private capeIcon!: Phaser.GameObjects.Image;
  private bowIcon!: Phaser.GameObjects.Image;
  private bowCount!: Phaser.GameObjects.Text;

  private fartIcon!: Phaser.GameObjects.Text;
  private fartLabel!: Phaser.GameObjects.Text;
  private bigHeadIcon!: Phaser.GameObjects.Text;
  private bigHeadLabel!: Phaser.GameObjects.Text;
  private chickenIcon!: Phaser.GameObjects.Text;
  private chickenLabel!: Phaser.GameObjects.Text;

  constructor() {
    super(HUD_SCENE_KEY);
  }

  init(data: HudData): void {
    this.world = data.world;
    this.levelIndex = data.levelIndex;
    this.difficulty = data.difficulty;
  }

  create(): void {
    registerHudTextures(this);

    this.infinityText = this.hudText(INFINITY_X, INFINITY_Y, INFINITY_FONT, INFINITY_GLYPH);
    this.scoreText = this.hudText(SCORE_X, SCORE_Y, SCORE_FONT).setVisible(true);

    // The one line of the HUD that never changes while a level is running, so it is
    // resolved once here rather than re-translated every frame (same call the live game
    // makes at index.html:1859, just not sixty times a second). The port has no language
    // switch yet; when one lands it will need to rebuild this, exactly as the 'Mjäu!'
    // and the '?' glyphs elsewhere in the port will.
    const levelName = TStr(LEVEL_NAME_KEYS[this.levelIndex] ?? LEVEL_NAME_KEYS[0]);
    this.hudText(LEVEL_X, LEVEL_Y, LEVEL_FONT, `${levelName} [${TDiff(this.difficulty)}]`)
      .setVisible(true);

    this.catIcon = this.hudImage(HUD_CAT_TEXTURE);
    this.catCount = this.hudText(0, 0, CAT_COUNT_FONT);
    this.capeIcon = this.hudImage(HUD_SUPER_TEXTURE);
    this.bowIcon = this.hudImage(HUD_BOW_TEXTURE);
    this.bowCount = this.hudText(0, 0, BOW_COUNT_FONT);

    this.fartIcon = this.hudText(POWERUP_ICON_X, 0, POWERUP_ICON_FONT, FART_GLYPH);
    this.fartLabel = this.hudText(POWERUP_LABEL_X, 0, FART_LABEL_FONT);
    this.bigHeadIcon = this.hudText(POWERUP_ICON_X, 0, POWERUP_ICON_FONT, BIG_HEAD_GLYPH);
    this.bigHeadLabel = this.hudText(POWERUP_LABEL_X, 0, BIG_HEAD_LABEL_FONT);
    this.chickenIcon = this.hudText(POWERUP_ICON_X, 0, POWERUP_ICON_FONT, CHICKEN_GLYPH);
    this.chickenLabel = this.hudText(POWERUP_LABEL_X, 0, CHICKEN_LABEL_FONT);
  }

  /**
   * A HUD sprite, hidden until something wants it. `setOrigin(0, 0)` because the live
   * `drawSprite(d, x, y, ...)` (index.html:662-669) treats x and y as the sprite's
   * TOP-LEFT, and every HUD coordinate below is written as that call's argument.
   */
  private hudImage(texture: string): Phaser.GameObjects.Image {
    return this.add.image(0, 0, texture).setOrigin(0, 0).setVisible(false);
  }

  /**
   * A HUD label, hidden until something wants it.
   *
   * `setOrigin(0, 1)` anchors the BOTTOM of the text box, because the live `fillText(s,
   * x, y)` places the text's BASELINE at y, not its top. Bottom is not baseline — it is
   * the descender's depth lower — but it is the closest anchor Phaser offers that does
   * not depend on canvas font metrics its text renderer does not share, and it is the
   * same choice gfx/tiles.ts's block glyphs and SliceScene's 'Mjäu!' already make.
   */
  private hudText(
    x: number,
    y: number,
    style: Phaser.Types.GameObjects.Text.TextStyle,
    text = '',
  ): Phaser.GameObjects.Text {
    return this.add.text(x, y, text, style).setOrigin(0, 1).setVisible(false);
  }

  update(): void {
    this.syncLives();
    // index.html:1857. `T('score')` is the label INCLUDING its trailing space and colon
    // ('PUNKTID: '), so this really is a bare concatenation and not a missing separator.
    this.scoreText.setText(TStr('score') + this.world.score);
    this.syncIcons();
    this.syncPowerups();
  }

  /**
   * Hearts (index.html:1855-1856).
   *
   * `lives === Infinity` is a real difficulty setting, not a debug state —
   * `DIFFICULTY_CONFIG.super_easy.lives` is `Infinity`, and `Infinity - 1` stays
   * `Infinity` under every death (see World.lives in game/types.ts, which explains why
   * the field is a `number` rather than an integer count). So the infinite case draws
   * exactly ONE heart plus an `∞` glyph and does not loop; looping to `lives` would hang
   * the game on the gentlest setting the children have.
   */
  private syncLives(): void {
    const infinite = this.world.lives === Infinity;
    this.infinityText.setVisible(infinite);

    const shown = infinite ? 1 : Math.max(0, this.world.lives);
    for (let i = 0; i < shown; i++) this.heartAt(i).setVisible(true);
    for (let i = shown; i < this.hearts.length; i++) this.hearts[i].setVisible(false);
  }

  /** The heart for life `index`, created the first time that many lives are held. */
  private heartAt(index: number): Phaser.GameObjects.Image {
    const existing = this.hearts[index];
    if (existing) return existing;
    const heart = this.hudImage(HUD_HEART_TEXTURE).setPosition(HEART_X + index * HEART_STEP, HEART_Y);
    this.hearts[index] = heart;
    return heart;
  }

  /**
   * The right-hand icon row: cat, cape, bow (index.html:1860-1862).
   *
   * The cursor is the whole point. `hx` starts at BASE_W-40 and moves left by 22 only
   * for an icon that was actually DRAWN, so the row is right-aligned against a
   * left-growing edge and which power-ups you are holding changes where the others sit:
   * with no cat, the cape takes the cat's place rather than leaving a gap. Reproduced as
   * the live game writes it — a local that the three branches advance — rather than as a
   * filtered list, because the two count labels hang off the cursor at different heights
   * and with different fonts and would not survive being made uniform.
   *
   * The bow is last and does NOT advance the cursor. That is the live code, not an
   * omission: index.html:1862 has no `hx-=22` because nothing follows it.
   */
  private syncIcons(): void {
    const { cat, player } = this.world;
    let hx = ICON_START_X;

    // `cat.hitsLeft > 0` as well as `cat`, because the cat survives its own last scratch
    // by a frame — see CatState.hitsLeft in game/types.ts — and the live HUD hides the
    // icon on that frame while the cat is still bouncing about on screen.
    const showCat = cat !== null && cat.hitsLeft > 0;
    this.catIcon.setVisible(showCat);
    this.catCount.setVisible(showCat);
    if (cat && showCat) {
      this.catIcon.setPosition(hx, CAT_ICON_Y);
      this.catCount.setPosition(hx + COUNT_X_OFFSET, CAT_COUNT_Y).setText(`x${cat.hitsLeft}`);
      hx -= ICON_STEP;
    }

    this.capeIcon.setVisible(player.hasCape);
    if (player.hasCape) {
      this.capeIcon.setPosition(hx, ITEM_ICON_Y);
      hx -= ICON_STEP;
    }

    this.bowIcon.setVisible(player.hasBow);
    this.bowCount.setVisible(player.hasBow);
    if (player.hasBow) {
      this.bowIcon.setPosition(hx, ITEM_ICON_Y);
      this.bowCount.setPosition(hx + COUNT_X_OFFSET, BOW_COUNT_Y).setText(`x${player.bowCharges}`);
    }
  }

  /**
   * The power-up column under the hearts (index.html:1863-1867): the fart and the big
   * head with their remaining seconds, and the chicken ray with its remaining charges.
   *
   * Same order-dependent cursor idea as the icon row, on the other axis: `hudY` starts
   * at 44 and steps down 16 only for a row that was drawn, so a big head held alone sits
   * where the fart would have been.
   *
   * The two timers are frame counters shown as seconds, rounded UP — `Math.ceil`, so a
   * power-up with one frame left still reads '1s' and the display never sits on '0s'.
   * The chicken ray is not a timer at all: it is a charge count, and it is spelled 'x8'
   * rather than '8s' for that reason.
   */
  private syncPowerups(): void {
    const { player } = this.world;
    let hudY = POWERUP_Y;
    hudY = this.powerupRow(this.fartIcon, this.fartLabel, hudY, seconds(player.fartTimer));
    hudY = this.powerupRow(this.bigHeadIcon, this.bigHeadLabel, hudY, seconds(player.bigHeadTimer));
    this.powerupRow(
      this.chickenIcon,
      this.chickenLabel,
      hudY,
      player.chickenRayCharges > 0 ? `x${player.chickenRayCharges}` : null,
    );
  }

  /**
   * One row of that column, returning where the next row goes. `null` means the
   * power-up is not held: the row draws nothing and the cursor does not move.
   */
  private powerupRow(
    icon: Phaser.GameObjects.Text,
    label: Phaser.GameObjects.Text,
    y: number,
    text: string | null,
  ): number {
    const shown = text !== null;
    icon.setVisible(shown);
    label.setVisible(shown);
    if (!shown) return y;
    icon.setY(y);
    label.setY(y).setText(text);
    return y + POWERUP_STEP_Y;
  }
}

/** A frame timer as the live game's `Math.ceil(t/60)+'s'`, or `null` when it is not running. */
function seconds(frames: number): string | null {
  return frames > 0 ? `${Math.ceil(frames / FRAMES_PER_SECOND)}s` : null;
}
