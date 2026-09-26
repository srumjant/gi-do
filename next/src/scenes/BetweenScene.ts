import Phaser from 'phaser';
import { BASE_H, BASE_W } from '../config/constants';
import { T, TStr } from '../config/i18n';
import { LEVELS, LEVEL_NAME_KEYS } from '../data/levels';
import { createFrameClock, type FrameClock } from '../game/frameClock';
import { siblingOf } from '../game/menu';
import type { Character } from '../game/player';
import {
  getCurrentLevel,
  getKidnapper,
  getPlayerSprites,
  getRescueSprites,
  getSelectedChar,
  getSkinIndex,
  type Kidnapper,
  kidnapperIndex,
} from '../game/run';
import { GAME_FONT, GAME_FONT_BOLD, GAME_TEXT_RESOLUTION } from '../gfx/gameFont';
import {
  KIDNAPPER_SCALE,
  kidnapperTextureKey,
  registerKidnapperTextures,
  registerScaledPlayerTextures,
  scaledPlayerTextureKey,
} from '../gfx/textures';
import {
  bindMenuKeys, justDown, type MenuKeys, padContextFor, pressedAny,
} from '../input/menuKeys';
import { BETWEEN_SCENE_KEY } from './keys';
import { takeBack } from './navigate';

/**
 * Where to go when the cutscene is over. Passed in rather than imported, the same
 * arrangement `CharacterData.back` uses and for the same reason: this screen has no opinion
 * about what follows it, and the scene that sent it here does.
 */
export interface BetweenData {
  next: string;
}

/**
 * The live `betweenTimer` thresholds (index.html:1351, :2308-2377). Frames, at 60Hz.
 *
 * `AUTO_EXIT` is checked with `>`, and the timer starts at 0 and is incremented BEFORE the
 * check, so the first frame drawn is t=1 and the last is t=480 — eight seconds exactly.
 * `SKIPPABLE_AFTER` is the same shape: two seconds of cutscene that a hand on the Space bar
 * cannot skip past, which is what stops the confirm that started the level from also
 * skipping the cutscene at the end of it.
 */
const AUTO_EXIT = 480;
const SKIPPABLE_AFTER = 120;
/** t at which the snatch begins, and how far into it the carrying-off starts (:2318, :2322). */
const GRAB_AT = 130;
const CARRY_AFTER = 90;
/** The headline flies in from t=220 and takes 25 frames to reach full size (:2353-2355). */
const HEADLINE_AT = 220;
const HEADLINE_GROW = 25;
/** The skip hint fades in after a second (:2372). */
const HINT_AT = 60;

/** index.html:2303. The ground is a flat band across the bottom, the sky is the rest. */
const GROUND_H = 70;
const GROUND_Y = BASE_H - GROUND_H;

/** index.html:2305. Everything in the scene is placed relative to where the hero stands. */
const HERO_X = 120;
/** The sibling stands this far right of the hero, and five pixels lower (:2311). */
const SIBLING_DX = 60;
const SIBLING_DY = 5;

/** The scales the cutscene draws at (:2310-2311, :2326, :2333, :2325). */
const CUTSCENE_SCALE = 3;
const CARRIED_SCALE = 2;

const HEART_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '12px', color: '#ff69b4',
};
const CONFUSED_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '12px', color: '#ff3333',
};
const OH_NO_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '14px', color: '#ff3333',
};
const HELP_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '10px', color: '#3388ff',
};
const BUBBLE_FONT = { fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '10px' };
const HINT_FONT = { fontFamily: GAME_FONT, resolution: GAME_TEXT_RESOLUTION, fontSize: '10px', color: '#ffffff' };
/** Both headline lines are black-outlined; the thickness is the live `ctx.lineWidth` (:2358). */
const HEADLINE_STROKE = { stroke: '#000000', strokeThickness: 3 };
const HEADLINE_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '28px', color: '#ff3333',
  ...HEADLINE_STROKE,
};
const SUBHEAD_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '16px', color: '#ffdd00',
  ...HEADLINE_STROKE,
};

/** The speech bubble (:2337-2341): white, dark outline, 150 wide, a tail on the left. */
const BUBBLE_W = 150;
const BUBBLE_H = 25;
const BUBBLE_FILL = 0xffffff;
const BUBBLE_LINE = 0x333333;
const BUBBLE_LINE_WIDTH = 2;

/** Drawing order, which four sprites overlap in the carry-off (:2332-2343). */
const DEPTH_ACTOR = 0;
const DEPTH_CARRIED = 1;
const DEPTH_BUBBLE = 2;
const DEPTH_LABEL = 3;

/**
 * The between-level cutscene: the sibling you have just rescued is snatched again, by a
 * different villain each time, and the game tells you which world you are going to.
 *
 * Port of the NORMAL branch of `drawBetween` (index.html:2300-2369) plus the shared skip
 * hint (:2371-2377) and the state that drives them (:1351).
 *
 * ## The half that is not here
 *
 * `drawBetween` is 209 lines and the plan asked whether it is two separable things. It is,
 * but not the two it guessed: it is not a results card and a level-intro card, it is ONE
 * cutscene with TWO ENTIRELY SEPARATE BRANCHES, chosen by `isBossLevel` at :2177. The
 * branch above this one (:2182-2299) is more than half of the function and a different
 * scene altogether — a boss intro, with storm clouds, lightning, a hero walking forward,
 * the boss entering behind a speech bubble, the sibling in a cage and a headline reading
 * FINAL BATTLE — and it plays in exactly one place, on the way into level 6.
 *
 * It is deliberately not ported yet, and the reason is not its size. It announces a boss
 * that this port does not have: `World` has no boss, `checkRescue`'s `canRescue` is a
 * hard-coded `true` where the live game asks `!boss||bossDefeated`, and level 6 today is a
 * level with a rescue at the end of it and nothing guarding it. A cutscene promising a
 * final battle before a level with no final battle in it is a worse thing to ship than the
 * ordinary cutscene, which is true — a kidnapper does take the sibling into level 6, the
 * `KIDNAPPERS` table has an entry for it (game/run.ts's getKidnapper), and nothing about
 * it lies. The boss intro belongs with the boss, in the plan that adds one; the branch goes
 * back in at the top of `update` below, on `isLastLevel(this.levelIndex)` (game/run.ts).
 *
 * ## The clock
 *
 * A `FrameClock`, not a counter incremented per rendered frame. Every threshold above is a
 * raw frame count taken from a game that runs off bare `requestAnimationFrame`, so on a
 * 120Hz screen all of them would arrive twice as fast and the eight-second cutscene would
 * last four. See game/frameClock.ts.
 */
export class BetweenScene extends Phaser.Scene {
  private next = '';
  private clock!: FrameClock;
  private keys!: MenuKeys;
  /** Set once the exit has been taken, so a long rendered frame cannot take it twice. */
  private leaving = false;

  /** The level being walked INTO — `currentLevel` has already been stepped on (run.ts). */
  private levelIndex = 0;
  private kidnapper!: Kidnapper;
  /** Where the villain's feet are: the ground, less its own height at its own scale. */
  private villainY = 0;
  /** The hero's top-left, and the two sprite heights the sibling's placing is measured in. */
  private heroY = 0;
  private siblingH = 0;

  private hero!: Phaser.GameObjects.Image;
  private sibling!: Phaser.GameObjects.Image;
  private carried!: Phaser.GameObjects.Image;
  private villain!: Phaser.GameObjects.Image;

  private hearts!: Phaser.GameObjects.Text;
  private confused!: Phaser.GameObjects.Text;
  private ohNo!: Phaser.GameObjects.Text;
  private help!: Phaser.GameObjects.Text;
  private bubble!: Phaser.GameObjects.Graphics;
  private taunt!: Phaser.GameObjects.Text;
  private headline!: Phaser.GameObjects.Container;
  private hint!: Phaser.GameObjects.Text;

  constructor() {
    super(BETWEEN_SCENE_KEY);
  }

  init(data: BetweenData): void {
    this.next = data.next;
    this.leaving = false;
  }

  create(): void {
    registerScaledPlayerTextures(this, [['stand', CUTSCENE_SCALE], ['jump', CARRIED_SCALE]]);
    registerKidnapperTextures(this);

    this.clock = createFrameClock();
    // The PLAY mapping, not the menu one, and that is the live game's own answer: `between`
    // is not in `isMenuState` (index.html:1254-1257, ported as MENU_STATES). It reads like a
    // menu — one button, one thing to do — and it is a cutscene inside a run, so Ⓑ does
    // nothing rather than backing out, and Start pauses instead of skipping. Ⓐ still skips,
    // because button 0 synthesises Space in both mappings.
    this.keys = bindMenuKeys(this, padContextFor('between'));
    this.levelIndex = getCurrentLevel();
    this.kidnapper = getKidnapper(this.levelIndex);

    const hero: Character = getSelectedChar();
    const sibling = siblingOf(hero);
    const heroSprite = getPlayerSprites().stand;
    const siblingSprite = getRescueSprites().sprite;
    this.heroY = GROUND_Y - heroSprite.length * CUTSCENE_SCALE;
    // :2333 measures the CARRIED sibling's position off the STAND sprite's height, not the
    // jump sprite it then draws. Reproduced as written; the two differ by a row.
    this.siblingH = siblingSprite.length * CARRIED_SCALE;
    this.villainY = GROUND_Y - this.kidnapper.s.length * KIDNAPPER_SCALE;

    this.drawBackdrop();

    this.hero = this.actor(hero, 'stand', CUTSCENE_SCALE, DEPTH_ACTOR);
    this.sibling = this.actor(sibling, 'stand', CUTSCENE_SCALE, DEPTH_ACTOR);
    this.villain = this.add
      .image(0, 0, kidnapperTextureKey(kidnapperIndex(this.levelIndex)))
      .setOrigin(0, 0)
      .setDepth(DEPTH_ACTOR)
      .setVisible(false);
    this.carried = this.actor(sibling, 'jump', CARRIED_SCALE, DEPTH_CARRIED);

    this.bubble = this.add.graphics().setDepth(DEPTH_BUBBLE).setVisible(false);
    this.taunt = this.label({ ...BUBBLE_FONT, color: this.kidnapper.color });
    this.taunt.setDepth(DEPTH_BUBBLE);
    this.hearts = this.label(HEART_FONT, '♥ ♥ ♥');
    this.confused = this.label(CONFUSED_FONT, '???');
    this.ohNo = this.label(OH_NO_FONT, TStr('oh_no'));
    this.help = this.label(HELP_FONT, TStr('help_cry'));

    this.headline = this.buildHeadline();
    this.hint = this.add
      .text(BASE_W / 2, BASE_H - 10, TStr('press_space'), HINT_FONT)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_LABEL)
      .setVisible(false);
  }

  /**
   * The next level's own two colours, painted flat: its sky over its ground
   * (index.html:2302-2303). Not its parallax and not its tiles — the cutscene is a preview
   * of the palette, which is as much of a level as a cutscene can show.
   */
  private drawBackdrop(): void {
    const level = LEVELS[this.levelIndex];
    this.add
      .graphics()
      .fillStyle(colour(level.bg))
      .fillRect(0, 0, BASE_W, BASE_H)
      .fillStyle(colour(level.groundColor))
      .fillRect(0, GROUND_Y, BASE_W, GROUND_H)
      .setDepth(-1);
  }

  /** One of the cutscene's people, hidden until the phase that wants them. */
  private actor(
    character: Character,
    pose: 'stand' | 'jump',
    scale: number,
    depth: number,
  ): Phaser.GameObjects.Image {
    const key = scaledPlayerTextureKey(character, getSkinIndex(character), pose, scale);
    return this.add.image(0, 0, key).setOrigin(0, 0).setDepth(depth).setVisible(false);
  }

  /**
   * A shouted line. All five are centred on a point and sit above whoever says them, which
   * is `textAlign='center'` plus a baseline — `setOrigin(0.5, 1)`, the same bottom-anchored
   * approximation the HUD and the tile glyphs already use.
   */
  private label(
    style: Phaser.Types.GameObjects.Text.TextStyle,
    text = '',
  ): Phaser.GameObjects.Text {
    return this.add
      .text(0, 0, text, style)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_LABEL)
      .setVisible(false);
  }

  /**
   * The two headline lines, in a Container.
   *
   * The live game rotates and scales the CANVAS about a point and then draws both lines at
   * (0,0) and (0,35) inside that transform (index.html:2354-2367), so the second line
   * swings with the first rather than beside it. A Container is the same thing: its
   * children are positioned in its own space, and rotating it rotates the pair.
   *
   * `setOrigin(0.5, 0.5)` rather than the (0.5, 1) every other label here uses, because
   * this is the one place the live game sets `textBaseline='middle'` (:2359).
   */
  private buildHeadline(): Phaser.GameObjects.Container {
    const sibName = getRescueSprites().name.toUpperCase();
    const nextName = TStr(LEVEL_NAME_KEYS[this.levelIndex] ?? LEVEL_NAME_KEYS[0]);
    const title = this.add
      .text(0, 0, sibName + TStr('sib_stolen_again'), HEADLINE_FONT)
      .setOrigin(0.5, 0.5);
    const sub = this.add
      .text(0, 35, `${TStr('keep_going')} → ${nextName}`, SUBHEAD_FONT)
      .setOrigin(0.5, 0.5);
    return this.add
      .container(BASE_W / 2, BASE_H / 2 - 50, [title, sub])
      .setDepth(DEPTH_LABEL)
      .setVisible(false);
  }

  update(_time: number, delta: number): void {
    if (this.leaving) return;

    /**
     * Pause, before the clock is advanced.
     *
     * `between` is in `PAUSABLE` (index.html:1240), which is easy to read as an oddity and is
     * not one: this is the longest stretch of the game with nothing to do in it, eight
     * seconds of someone else's story, and it is exactly when a small hand goes looking for
     * a button. `takeBack` freezes this scene and puts the menu over it, and because the
     * clock has not been advanced yet, the cutscene resumes on the frame it stopped on
     * rather than eight seconds further along.
     */
    if (justDown(this.keys.back)) {
      takeBack(this, 'between');
      return;
    }

    const t = this.clock.advance(delta);

    // index.html:1351. Eight seconds, or two seconds in with Space or Enter — and Enter as
    // well as Space here, unlike the game-over and win screens, which take Space alone.
    const skipped = t > SKIPPABLE_AFTER
      && pressedAny(this.keys.confirm, this.keys.enter);
    if (t > AUTO_EXIT || skipped) {
      this.leaving = true;
      this.scene.start(this.next);
      return;
    }

    this.drawTogether(t);
    this.drawSnatch(t);
    this.drawHeadline(t);

    // :2372-2376. A slow pulse between alpha 0.1 and 0.5, not a blink.
    this.hint.setVisible(t > HINT_AT).setAlpha(0.3 + Math.sin(t * 0.06) * 0.2);
  }

  /** Phase one (index.html:2308-2314): the two of them together, bobbing, and three hearts. */
  private drawTogether(t: number): void {
    const together = t < GRAB_AT;
    this.hearts.setVisible(together);
    if (!together) return;

    const bob = Math.sin(t * 0.12) * 3;
    this.hero.setVisible(true).setPosition(HERO_X, this.heroY + bob);
    this.sibling
      .setVisible(true)
      .setPosition(HERO_X + SIBLING_DX, this.heroY + SIBLING_DY + Math.sin(t * 0.15) * 2);
    this.hearts.setPosition(HERO_X + 45, this.heroY - 10 + bob);
  }

  /**
   * Phase two (index.html:2316-2350): the villain swoops in from the right, and from
   * `CARRY_AFTER` frames later runs off to the right with the sibling under one arm.
   *
   * The hero stops bobbing the moment this starts — :2319 redraws it at a flat `heroY` —
   * and that is the whole of the animation's acting: everything happy about the scene stops
   * at once.
   */
  private drawSnatch(t: number): void {
    const grabbing = t >= GRAB_AT;
    this.villain.setVisible(grabbing);
    this.carried.setVisible(false);
    this.confused.setVisible(false);
    this.bubble.setVisible(false);
    this.taunt.setVisible(false);
    this.help.setVisible(false);
    this.ohNo.setVisible(false);
    if (!grabbing) return;

    this.hero.setVisible(true).setPosition(HERO_X, this.heroY);
    const grabT = t - GRAB_AT;

    if (grabT < CARRY_AFTER) {
      // Swooping in, facing left — the enemy art faces left already, so `fl` true at :2325
      // is the flip, matching SliceScene's own `setFlipX` convention for enemies.
      this.villain
        .setFlipX(true)
        .setPosition(BASE_W + 20 - grabT * 4, this.villainY + Math.sin(t * 0.3) * 2);
      this.sibling.setVisible(true).setPosition(HERO_X + SIBLING_DX, this.heroY + SIBLING_DY);
      this.confused.setVisible(grabT > 40).setPosition(HERO_X + 75, this.heroY - 5);
    } else {
      this.sibling.setVisible(false);
      const runX = HERO_X + SIBLING_DX + (grabT - CARRY_AFTER) * 3;
      const bounce = Math.abs(Math.sin(t * 0.15)) * 4;
      this.villain.setFlipX(false).setPosition(runX, this.villainY + bounce);
      this.carried
        .setVisible(true)
        .setPosition(runX + 10, this.villainY - this.siblingH + 5 + bounce);
      if (grabT < 200) this.drawTaunt(runX);
      // :2343. Twenty frames on, ten off — a cry, not a steady label.
      this.help
        .setVisible(grabT % 30 < 20)
        .setPosition(runX + 20, this.villainY - this.siblingH - 5);
    }

    this.ohNo.setVisible(grabT > 50).setPosition(HERO_X + 15, this.heroY - 15);
  }

  /**
   * The villain's speech bubble (index.html:2337-2341). It keeps pace with the villain
   * until the villain would carry it off the right-hand edge, at which point the `Math.min`
   * pins it and the tail slides along underneath — which is the live behaviour, not a
   * rounding artefact.
   */
  private drawTaunt(runX: number): void {
    const x = Math.min(runX - 10, BASE_W - 160);
    const y = this.villainY - 35;
    this.bubble
      .setVisible(true)
      .clear()
      .fillStyle(BUBBLE_FILL)
      .lineStyle(BUBBLE_LINE_WIDTH, BUBBLE_LINE)
      .beginPath();
    this.bubble.moveTo(x, y);
    this.bubble.lineTo(x + BUBBLE_W, y);
    this.bubble.lineTo(x + BUBBLE_W, y + BUBBLE_H);
    this.bubble.lineTo(x + 25, y + BUBBLE_H);
    this.bubble.lineTo(x + 15, y + BUBBLE_H + 10);
    this.bubble.lineTo(x + 10, y + BUBBLE_H);
    this.bubble.lineTo(x, y + BUBBLE_H);
    this.bubble.closePath();
    this.bubble.fillPath();
    this.bubble.strokePath();
    this.taunt.setVisible(true).setPosition(x + 75, y + 16).setText(this.tauntLine());
  }

  /**
   * Which of the five taunts this level gets (index.html:2336's
   * `(currentLevel-1)%phrases.length`).
   *
   * The `-1` is not an off-by-one to fix: `currentLevel` has already been stepped to the
   * level being walked INTO, so subtracting one names the level just finished, and the
   * first cutscene of a run — after level 1, walking into level 2 — gets phrase 0.
   *
   * Resolved per frame rather than at create because it costs nothing and because `T`
   * returns whatever the current language holds; the port has no language switch yet, but
   * this is one of the few strings that would notice.
   */
  private tauntLine(): string {
    const phrases = T('dino_between');
    if (!Array.isArray(phrases) || phrases.length === 0) return '';
    const index = (this.levelIndex - 1) % phrases.length;
    return phrases[index] ?? phrases[0];
  }

  /**
   * The headline (index.html:2352-2368): it grows from nothing over 25 frames and then
   * rocks gently from side to side for as long as the cutscene lasts.
   */
  private drawHeadline(t: number): void {
    const shown = t >= HEADLINE_AT;
    this.headline.setVisible(shown);
    if (!shown) return;
    this.headline
      .setScale(Math.min(1, (t - HEADLINE_AT) / HEADLINE_GROW))
      .setRotation(Math.sin(t * 0.03) * 0.1);
  }
}

/** A level record's `'#rrggbb'` as the number Phaser's Graphics takes. */
function colour(hex: string): number {
  return Phaser.Display.Color.HexStringToColor(hex).color;
}
