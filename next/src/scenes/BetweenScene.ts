import Phaser from 'phaser';
import { BASE_H, BASE_W } from '../config/constants';
import { prompt } from '../config/glyphs';
import { T, TStr } from '../config/i18n';
import { HOME_THEME, type Villain } from '../data/levels';
import { PARALLAX } from '../data/parallax';
import { snatcher, STAGES, type Stage } from '../data/stages';
import { createFrameClock, type FrameClock } from '../game/frameClock';
import { siblingOf } from '../game/menu';
import { fill, scriptFor, transitionInto, type Line, type Script, type Transition } from '../game/story';
import type { Character } from '../game/player';
import {
  getCurrentLevel,
  getCurrentStage,
  getKidnapper,
  getPlayerSprites,
  getRescueSprites,
  getSelectedChar,
  getSkinIndex,
  type Kidnapper,
  kidnapperIndex,
} from '../game/run';
import { GAME_FONT_BOLD, GAME_TEXT_RESOLUTION } from '../gfx/gameFont';
import { drawRidges, drawSky, drawWallpaper } from '../gfx/parallax';
import { fitScreenCamera } from '../gfx/render';
import { WORLD_MAP_DEPTH, WorldMap } from '../gfx/worldMap';
import {
  KIDNAPPER_SCALE,
  registerTextures,
  kidnapperTextureKey,
  registerKidnapperTextures,
  registerScaledPlayerTextures,
  scaledPlayerTextureKey,
  FLYING_VILLAINS,
  PROFILE_VILLAINS,
  spriteScale,
  STAR_TEXTURE,
  TOILET_TEXTURE,
  VILLAIN_COLORS,
  VILLAIN_TEXTURES,
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
  /** The opening, before the first level: the first villain snatches the sibling, then the map. */
  opening?: boolean;
}

/**
 * The live `betweenTimer` thresholds (index.html:1351, :2308-2377). Frames, at 60Hz.
 *
 * `AUTO_EXIT` is checked with `>`, and the timer starts at 0 and is incremented BEFORE the
 * check, so the first frame drawn is t=1 and the last is t=480 — eight seconds exactly.
 * The live game also let nothing skip it for two seconds; here a press works from the second
 * the prompt shows (HINT_AT), and a press held over from the level does not count (menuKeys'
 * edges), which is what that wait was for.
 */
const AUTO_EXIT = 480;
/** t at which the snatch begins, and how far into it the carrying-off starts (:2318, :2322). */
const GRAB_AT = 130;
const CARRY_AFTER = 90;
/** The headline flies in from t=220 and takes 25 frames to reach full size (:2353-2355). */
const HEADLINE_AT = 220;
const HEADLINE_GROW = 25;
/** The skip hint fades in after a second (:2372). */
const HINT_AT = 60;

/**
 * The story's timelines (docs/superpowers/specs/2026-11-23-story-and-transitions-design.md),
 * in frames: when the snatch starts, when its headline comes, when the map comes up, when it
 * all ends. A press moves on a beat: to the map, and from the map out. It works from the moment
 * the prompt shows (the owner, 2026-11-23: the prompt came up a second before a press did
 * anything).
 */
const STORY_TIMES = {
  opening: { grabAt: 100, headlineAt: 9999, mapAt: 330, exit: 630 },
  worldChange: { grabAt: 190, headlineAt: 300, mapAt: 430, exit: 700 },
  chase: { grabAt: 9999, headlineAt: 110, mapAt: 9999, exit: AUTO_EXIT },
} as const;
const CLASSIC_TIMES = { grabAt: GRAB_AT, headlineAt: HEADLINE_AT, mapAt: 9999, exit: AUTO_EXIT };
/** Where the beaten boss sits, dazed, while the two have their moment. */
const BEATEN_X = 470;
/** The beaten boss owns up from here to the snatch. */
const BEATEN_SAYS_AT = 40;
/**
 * Into the home world (docs/superpowers/specs/2026-11-24-home-world-design.md) the scene cuts
 * from the castle to home at the snatch, through black. The toilet stands at home, drawn twice
 * its size so Härra Kaka fits in its bowl: he grows up out of the bowl (POP_FRAMES), hops down
 * to the floor (HOP_FRAMES), and goes over to the sibling.
 */
const CUT_FRAMES = 20;
const HOME_TOILET_X = 540;
const HOME_TOILET_SCALE = 2;
/** The bowl's middle, and its rim's height over the floor, at that size (TOILET_S: the seat is columns 0-9, the rim row 6). */
const HOME_BOWL_X = HOME_TOILET_X - 18;
const HOME_RIM_UP = 84;
const POP_FRAMES = 30;
const HOP_FRAMES = 16;

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
/** Big enough for a child to find, and outlined so it reads on snow as well as at night. */
const HINT_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '14px', color: '#ffffff',
  stroke: '#000000', strokeThickness: 3,
};
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
  /** The stage being walked INTO: its theme picks the kidnapper, its level the colours. */
  private stage!: Stage;
  /** Set when the level just finished ended in a chase: whose chase it is. */
  private chase: Villain | null = null;
  private runner?: Phaser.GameObjects.Image;
  private kidnapper!: Kidnapper;
  /**
   * Who snatches the sibling into this theme, when it is not a chase: the theme's own villain
   * (data/stages.ts's snatcher), or null for the original game's kidnapper.
   */
  private snatching: Villain | null = null;
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

  /** The story's beat (game/story.ts), or null for the original game's kidnapper cutscene. */
  private transition: Transition | null = null;
  private script: Script = {};
  private opening = false;
  private times: { grabAt: number; headlineAt: number; mapAt: number; exit: number } = CLASSIC_TIMES;
  /** Frames skipped by a press, added to the clock. */
  private skipped = 0;
  /** The boss just beaten, sitting dazed, and what it says. */
  private beaten?: Phaser.GameObjects.Image;
  private beatenStars: Phaser.GameObjects.Image[] = [];
  private beatenBubble?: Phaser.GameObjects.Graphics;
  private beatenSays?: Phaser.GameObjects.Text;
  private map?: WorldMap;
  private mapHeadline?: Phaser.GameObjects.Container;
  /** Into the home world: the castle until the snatch, then home. */
  private homeCut = false;
  /** The snatching villain's scale as drawn, which Härra Kaka grows to out of the toilet. */
  private villainBase = 1;
  private away: Array<Phaser.GameObjects.Graphics | Phaser.GameObjects.Image> = [];
  private home: Array<Phaser.GameObjects.Graphics | Phaser.GameObjects.Image> = [];
  private cutShade?: Phaser.GameObjects.Rectangle;


  constructor() {
    super(BETWEEN_SCENE_KEY);
  }

  init(data: BetweenData): void {
    this.next = data.next;
    this.leaving = false;
    this.opening = data.opening ?? false;
    this.skipped = 0;
  }

  create(): void {
    fitScreenCamera(this);
    registerScaledPlayerTextures(this, [['stand', CUTSCENE_SCALE], ['jump', CARRIED_SCALE]]);
    registerKidnapperTextures(this);
    // The villains and the stars, which a level registers too: the cutscene must not depend on
    // one having run (the opening comes before any).
    registerTextures(this);

    this.clock = createFrameClock();
    // The PLAY mapping, not the menu one, and that is the live game's own answer: `between`
    // is not in `isMenuState` (index.html:1254-1257, ported as MENU_STATES). It reads like a
    // menu — one button, one thing to do — and it is a cutscene inside a run, so Ⓑ does
    // nothing rather than backing out, and Start pauses instead of skipping. Ⓐ still skips,
    // because button 0 synthesises Space in both mappings.
    this.keys = bindMenuKeys(this, padContextFor('between'));
    this.levelIndex = getCurrentLevel();
    this.stage = getCurrentStage();
    const finished = this.opening ? undefined : STAGES[this.levelIndex - 1];
    this.chase = finished?.level.ending === 'chase' ? finished.level.villain ?? 'dollQueen' : null;
    this.transition = transitionInto(this.levelIndex, this.opening);
    this.script = this.transition ? scriptFor(this.transition) : {};
    this.times = this.transition ? STORY_TIMES[this.transition.kind] : CLASSIC_TIMES;
    this.kidnapper = getKidnapper(this.stage.theme);
    this.snatching = this.chase ? null : snatcher(this.stage);

    const hero: Character = getSelectedChar();
    const sibling = siblingOf(hero);
    const heroSprite = getPlayerSprites().stand;
    const siblingSprite = getRescueSprites().sprite;
    this.heroY = GROUND_Y - heroSprite.length * CUTSCENE_SCALE;
    // :2333 measures the CARRIED sibling's position off the STAND sprite's height, not the
    // jump sprite it then draws. Reproduced as written; the two differ by a row.
    this.siblingH = siblingSprite.length * CARRIED_SCALE;
    this.villainY = GROUND_Y - this.kidnapper.s.length * KIDNAPPER_SCALE;
    // A villain on foot runs as tall as the Queen does here (drawn big, at 4, she shrinks to
    // three quarters), whatever it was drawn at; the Pterodactyl needs her wings spread wider
    // than the sibling she carries.
    const villainScale = (v: Villain) => (FLYING_VILLAINS.has(v)
      ? 1.6
      : (0.75 * this.textures.getFrame(VILLAIN_TEXTURES.dollQueen).height) / this.textures.getFrame(VILLAIN_TEXTURES[v]).height);

    this.homeCut = this.transition?.kind === 'worldChange' && this.stage.theme === HOME_THEME;
    this.away = this.drawBackdrop(finished?.theme ?? this.stage.theme);
    this.home = [];
    this.cutShade = undefined;
    if (this.homeCut) {
      this.home = this.drawHome();
      for (const o of this.home) o.setVisible(false);
      this.cutShade = this.add.rectangle(0, 0, BASE_W, BASE_H, 0x000000).setOrigin(0, 0)
        .setDepth(DEPTH_LABEL + 0.5).setAlpha(0);
    }

    this.hero = this.actor(hero, 'stand', CUTSCENE_SCALE, DEPTH_ACTOR);
    this.sibling = this.actor(sibling, 'stand', CUTSCENE_SCALE, DEPTH_ACTOR);
    this.villain = this.add
      .image(0, 0, kidnapperTextureKey(kidnapperIndex(this.stage.theme)))
      .setOrigin(0, 0)
      .setDepth(DEPTH_ACTOR)
      .setVisible(false);
    if (this.snatching) {
      this.villain.setTexture(VILLAIN_TEXTURES[this.snatching]).setScale(villainScale(this.snatching));
      this.villainBase = this.villain.scaleX;
      // On foot, on the ground; a flier a little above it, the sibling hanging below.
      this.villainY = GROUND_Y - this.villain.displayHeight - (FLYING_VILLAINS.has(this.snatching) ? 34 : 0);
    }
    this.carried = this.actor(sibling, 'jump', CARRIED_SCALE, DEPTH_CARRIED);
    if (this.chase) {
      this.runner = this.add
        .image(0, 0, VILLAIN_TEXTURES[this.chase])
        .setOrigin(0.5, 1)
        .setScale(villainScale(this.chase))
        // A villain drawn in profile faces left; this one is off to the right.
        .setFlipX(PROFILE_VILLAINS.has(this.chase))
        .setDepth(DEPTH_ACTOR)
        .setVisible(false);
    }

    this.bubble = this.add.graphics().setDepth(DEPTH_BUBBLE).setVisible(false);
    this.taunt = this.label({
      ...BUBBLE_FONT, color: this.snatching ? VILLAIN_COLORS[this.snatching] : this.kidnapper.color,
    });
    this.taunt.setDepth(DEPTH_BUBBLE);
    this.hearts = this.label(HEART_FONT, '♥ ♥ ♥');
    this.confused = this.label(CONFUSED_FONT, '???');
    this.ohNo = this.label(OH_NO_FONT, TStr('oh_no'));
    this.help = this.label(HELP_FONT, TStr('help_cry'));

    this.headline = this.buildHeadline();
    this.hint = this.add
      .text(BASE_W / 2, BASE_H - 10, prompt('prompt_next'), HINT_FONT)
      .setOrigin(0.5, 1)
      // Over the map too, so the prompt is never under its dim.
      .setDepth(WORLD_MAP_DEPTH + 1)
      .setVisible(false);

    const t = this.transition;
    if (t?.kind === 'worldChange') {
      // The boss just beaten sits to one side, dazed, stars round its head.
      this.beaten = this.add.image(BEATEN_X, GROUND_Y, VILLAIN_TEXTURES[t.beaten])
        .setOrigin(0.5, 1).setScale(villainScale(t.beaten) * 0.85).setAngle(-6).setDepth(DEPTH_ACTOR).setVisible(false);
      this.beatenStars = [0, 1, 2].map(() => {
        const star = this.add.image(0, 0, STAR_TEXTURE).setDepth(DEPTH_BUBBLE).setVisible(false);
        return star.setScale(spriteScale(star));
      });
      this.beatenBubble = this.add.graphics().setDepth(DEPTH_BUBBLE).setVisible(false);
      this.beatenSays = this.label({ ...BUBBLE_FONT, color: VILLAIN_COLORS[t.beaten] }, this.say(this.script.beaten));
      this.beatenSays.setDepth(DEPTH_BUBBLE);
    }
    if (t?.kind === 'opening' || t?.kind === 'worldChange') {
      const heroKey = scaledPlayerTextureKey(hero, getSkinIndex(hero), 'stand', CUTSCENE_SCALE);
      const siblingKey = scaledPlayerTextureKey(sibling, getSkinIndex(sibling), 'jump', CARRIED_SCALE);
      this.map = new WorldMap(this, {
        done: t.world,
        from: t.kind === 'opening' ? 0 : t.world - 1,
        to: t.world,
        hero: heroKey,
        heroScale: 0.55,
        carrier: t.kind === 'opening' ? t.villain : undefined,
        sibling: siblingKey,
        siblingScale: 0.5,
      });
      this.mapHeadline = this.buildLines(this.say(this.script.mapTitle), this.say(this.script.mapSub), 46).setDepth(WORLD_MAP_DEPTH + 1);
    }
  }

  /** A line of the story in words: its key's text with the names put in, in capitals. */
  private say(line?: Line): string {
    if (!line) return '';
    return fill(TStr(line.key), {
      villain: line.villainKey ? TStr(line.villainKey) : undefined,
      sibling: getRescueSprites().name.toUpperCase(),
      worldNumber: line.worldNumber,
      world: line.worldKey ? TStr(line.worldKey) : undefined,
    });
  }

  /** A two-line headline, the big line red and the second yellow, both outlined. */
  private buildLines(title: string, sub: string, y: number): Phaser.GameObjects.Container {
    const big = this.add.text(0, 0, title, HEADLINE_FONT).setOrigin(0.5, 0.5);
    const small = this.add.text(0, 30, sub, SUBHEAD_FONT).setOrigin(0.5, 0.5);
    return this.add.container(BASE_W / 2, y, [big, small]).setDepth(DEPTH_LABEL + 1).setVisible(false);
  }

  /**
   * The next level's own two colours, painted flat: its sky over its ground
   * (index.html:2302-2303). Not its parallax and not its tiles — the cutscene is a preview
   * of the palette, which is as much of a level as a cutscene can show.
   */
  private drawBackdrop(theme: number): Phaser.GameObjects.Graphics[] {
    // The world's own sky and hills, as its levels draw them (gfx/parallax.ts), then its ground
    // (the owner, 2026-11-23: a flat colour looked plain).
    const level = STAGES.find((s) => s.theme === theme)?.level ?? this.stage.level;
    const parallax = PARALLAX[theme];
    const sky = this.add.graphics().setDepth(-3);
    // A world indoors (home) has its wallpaper for a sky.
    if (level.indoors) drawWallpaper(sky, level.bg);
    else drawSky(sky, level.bg, parallax?.bg2 ?? level.bg);
    const drawn = [sky];
    if (parallax) {
      const ridges = this.add.graphics().setDepth(-2);
      drawRidges(ridges, parallax.layers, 0);
      drawn.push(ridges);
    }
    drawn.push(this.add
      .graphics()
      .fillStyle(colour(level.groundColor))
      .fillRect(0, GROUND_Y, BASE_W, GROUND_H)
      .fillStyle(colour(level.groundTop))
      .fillRect(0, GROUND_Y, BASE_W, 6)
      .setDepth(-1));
    return drawn;
  }

  /** Home: the next level's wallpaper and floor, and the toilet Härra Kaka comes up out of. */
  private drawHome(): Array<Phaser.GameObjects.Graphics | Phaser.GameObjects.Image> {
    const level = this.stage.level;
    const wall = this.add.graphics().setDepth(-3);
    drawWallpaper(wall, level.bg);
    const floor = this.add.graphics()
      .fillStyle(colour(level.groundColor)).fillRect(0, GROUND_Y, BASE_W, GROUND_H)
      .fillStyle(colour(level.groundTop)).fillRect(0, GROUND_Y, BASE_W, 6)
      .setDepth(-1);
    const toilet = this.add.image(HOME_TOILET_X, GROUND_Y, TOILET_TEXTURE).setOrigin(0.5, 1).setDepth(DEPTH_ACTOR + 0.5);
    toilet.setScale(spriteScale(toilet) * HOME_TOILET_SCALE);
    return [wall, floor, toilet];
  }

  /**
   * Härra Kaka coming for the sibling at home: growing up out of the bowl, behind its front, then
   * a hop down to the floor in front of the toilet, then over to the sibling on foot.
   */
  private outOfTheToilet(grabT: number): void {
    const rimY = GROUND_Y - HOME_RIM_UP;
    let cx: number;
    let bottom: number;
    let size = 1;
    if (grabT < POP_FRAMES) {
      const k = grabT / POP_FRAMES;
      size = 0.4 + 0.6 * k;
      cx = HOME_BOWL_X;
      bottom = rimY + 24 - 60 * k;
    } else if (grabT < POP_FRAMES + HOP_FRAMES) {
      const f = (grabT - POP_FRAMES) / HOP_FRAMES;
      cx = HOME_BOWL_X - 60 * f;
      bottom = rimY - 36 + (GROUND_Y - rimY + 36) * f - 30 * Math.sin(Math.PI * f);
    } else {
      // Quick enough to reach the sibling as the carrying-off starts (CARRY_AFTER).
      cx = HOME_BOWL_X - 60 - (grabT - POP_FRAMES - HOP_FRAMES) * 5.5;
      bottom = GROUND_Y;
    }
    this.villain.setScale(this.villainBase * size).setFlipX(false)
      .setDepth(grabT < POP_FRAMES ? DEPTH_ACTOR : DEPTH_CARRIED);
    this.villain.setPosition(cx - this.villain.displayWidth / 2, bottom - this.villain.displayHeight);
  }

  /** Into the home world: through black from the castle to home as Härra Kaka comes. */
  private syncHomeCut(t: number): void {
    if (!this.homeCut) return;
    const at = this.times.grabAt;
    for (const o of this.away) o.setVisible(t < at);
    for (const o of this.home) o.setVisible(t >= at);
    this.cutShade?.setAlpha(Math.max(0, 1 - Math.abs(t - at) / CUT_FRAMES));
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
    const nextName = TStr(this.stage.nameKey);
    const story = this.script.headline;
    const titleText = story ? this.say(story) : this.chase ? TStr('follow_them') : sibName + TStr('sib_stolen_again');
    const title = this.add.text(0, 0, titleText, HEADLINE_FONT).setOrigin(0.5, 0.5);
    const sub = this.add
      .text(0, 35, `${TStr('keep_going')} → ${nextName}`, SUBHEAD_FONT)
      .setOrigin(0.5, 0.5);
    const parts: Phaser.GameObjects.GameObject[] = [title, sub];
    const t = this.transition;
    if (t?.kind === 'chase') {
      // The world's levels: the ones done gold, the next one white, the boss's a red ring.
      const dots = this.add.graphics();
      for (let i = 1; i <= t.levels; i++) {
        const x = (i - (t.levels + 1) / 2) * 26;
        if (i < t.level) dots.fillStyle(0xffd23f).fillCircle(x, 66, 8).lineStyle(2, 0x000000).strokeCircle(x, 66, 8);
        else if (i === t.level) dots.fillStyle(0xffffff).fillCircle(x, 66, 8).lineStyle(2, 0x000000).strokeCircle(x, 66, 8);
        else dots.fillStyle(0x000000, 0.35).fillCircle(x, 66, 8).lineStyle(3, 0xff3333).strokeCircle(x, 66, 8);
      }
      parts.push(dots);
    }
    // The snatch's headline sits high, out of the way of the villain running off below it.
    const y = t?.kind === 'worldChange' ? 70 : BASE_H / 2 - 50;
    return this.add
      .container(BASE_W / 2, y, parts)
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

    const t = this.clock.advance(delta) + this.skipped;
    const { mapAt, exit } = this.times;

    // A press moves on a beat: on to the map, and from the map (or a chase) out. It works from
    // the moment the prompt shows, a second in (the live game waited two, with the prompt
    // already up: the owner found it did nothing).
    const pressed = t > HINT_AT && pressedAny(this.keys.confirm, this.keys.enter);
    if (pressed && this.map && t < mapAt) {
      this.skipped += mapAt - t;
      return;
    }
    if (t > exit || pressed) {
      this.leaving = true;
      this.scene.start(this.next);
      return;
    }

    this.syncHomeCut(t);
    if (this.map && t >= mapAt) {
      this.drawMap(t - mapAt);
    } else if (this.chase) {
      this.drawChase(t);
      this.drawHeadline(t);
    } else {
      this.drawTogether(t);
      this.drawBeaten(t);
      this.drawSnatch(t);
      this.drawHeadline(t);
    }

    // :2372-2376. A slow pulse between alpha 0.1 and 0.5, not a blink. It names the button in
    // the child's hands, and follows them if they change device.
    const hint = prompt('prompt_next');
    if (this.hint.text !== hint) this.hint.setText(hint);
    this.hint.setVisible(t > HINT_AT).setAlpha(0.45 + Math.sin(t * 0.06) * 0.25);
  }

  /** The map: everything else away, the hero walking on to the next world (gfx/worldMap.ts). */
  private drawMap(m: number): void {
    for (const obj of [this.hero, this.sibling, this.carried, this.villain, this.hearts, this.confused,
      this.ohNo, this.help, this.bubble, this.taunt, this.headline, ...this.beatenStars]) obj.setVisible(false);
    this.beaten?.setVisible(false);
    this.beatenBubble?.setVisible(false);
    this.beatenSays?.setVisible(false);
    this.map?.setVisible(true).update(m);
    this.mapHeadline?.setVisible(true).setScale(Math.min(1, m / HEADLINE_GROW)).setRotation(Math.sin(m * 0.03) * 0.06);
  }

  /** The boss just beaten, sitting dazed to one side, owning up: the T-Rex sent it. */
  private drawBeaten(t: number): void {
    if (!this.beaten) return;
    // Home: the T-Rex stayed at his castle.
    if (this.homeCut && t >= this.times.grabAt) {
      this.beaten.setVisible(false);
      for (const star of this.beatenStars) star.setVisible(false);
      this.beatenBubble?.setVisible(false);
      this.beatenSays?.setVisible(false);
      return;
    }
    this.beaten.setVisible(true).setAngle(-6 + Math.sin(t * 0.08) * 4);
    const head = this.beaten.y - this.beaten.displayHeight;
    this.beatenStars.forEach((star, i) => {
      const a = t * 0.12 + (i * Math.PI * 2) / 3;
      star.setVisible(true).setPosition(BEATEN_X + Math.cos(a) * 22, head + 4 + Math.sin(a) * 5);
    });
    const says = t >= BEATEN_SAYS_AT && t < this.times.grabAt + 60;
    this.beatenBubble?.setVisible(says);
    this.beatenSays?.setVisible(says);
    if (says && this.beatenBubble && this.beatenSays) {
      this.drawBubble(this.beatenBubble, this.beatenSays, BEATEN_X - 40, head - 40);
    }
  }

  /** A speech bubble sized to its words, its tail down at the left, the words inside. */
  private drawBubble(g: Phaser.GameObjects.Graphics, text: Phaser.GameObjects.Text, left: number, top: number): void {
    const w = Math.max(BUBBLE_W, text.width + 20);
    const x = Math.max(4, Math.min(left, BASE_W - w - 4));
    g.clear().fillStyle(BUBBLE_FILL).lineStyle(BUBBLE_LINE_WIDTH, BUBBLE_LINE).beginPath();
    g.moveTo(x, top);
    g.lineTo(x + w, top);
    g.lineTo(x + w, top + BUBBLE_H);
    g.lineTo(x + 25, top + BUBBLE_H);
    g.lineTo(x + 15, top + BUBBLE_H + 10);
    g.lineTo(x + 10, top + BUBBLE_H);
    g.lineTo(x, top + BUBBLE_H);
    g.closePath();
    g.fillPath();
    g.strokePath();
    text.setPosition(x + w / 2, top + 16);
  }

  /**
   * After a chase level: the villain runs across with the sibling held up, calling for help,
   * and the hero after them, both gone before the headline says to follow.
   */
  private drawChase(t: number): void {
    const runner = this.runner;
    if (!runner) return;
    const bob = Math.abs(Math.sin(t * 0.3)) * 4;
    const runnerX = 170 + t * 2.4;
    // A flying villain goes over the hero's head with the sibling hanging below; one on foot
    // runs with them held up.
    const flying = this.chase !== null && FLYING_VILLAINS.has(this.chase);
    const feet = flying ? GROUND_Y - 80 - bob * 2 : GROUND_Y - bob;
    runner.setVisible(true).setPosition(runnerX, feet);
    const top = feet - runner.displayHeight;
    const siblingY = flying ? feet - 4 : top - this.siblingH + 8;
    this.carried.setVisible(true).setPosition(runnerX - 12, siblingY);
    this.help.setVisible(t % 60 < 40).setPosition(runnerX, (flying ? top : siblingY) - 4);
    this.hero.setVisible(true).setPosition(30 + t * 2.4, this.heroY - bob);
    this.hearts.setVisible(false);
    this.sibling.setVisible(false);
    this.villain.setVisible(false);
  }

  /** Phase one (index.html:2308-2314): the two of them together, bobbing, and three hearts. */
  private drawTogether(t: number): void {
    const together = t < this.times.grabAt;
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
    const grabbing = t >= this.times.grabAt;
    this.villain.setVisible(grabbing);
    this.carried.setVisible(false);
    this.confused.setVisible(false);
    this.bubble.setVisible(false);
    this.taunt.setVisible(false);
    this.help.setVisible(false);
    this.ohNo.setVisible(false);
    if (!grabbing) return;

    this.hero.setVisible(true).setPosition(HERO_X, this.heroY);
    const grabT = t - this.times.grabAt;

    // A theme's own villain drawn in profile faces left already: coming in it is as drawn, and
    // turns to run off. The original kidnappers face right, so it is the other way round.
    const profile = this.snatching !== null && PROFILE_VILLAINS.has(this.snatching);
    if (grabT < CARRY_AFTER) {
      // Swooping in, facing left — the enemy art faces left already, so `fl` true at :2325
      // is the flip, matching SliceScene's own `setFlipX` convention for enemies.
      if (this.homeCut) {
        this.outOfTheToilet(grabT);
      } else {
        this.villain
          .setFlipX(this.snatching === null)
          .setPosition(BASE_W + 20 - grabT * 4, this.villainY + Math.sin(t * 0.3) * 2);
      }
      this.sibling.setVisible(true).setPosition(HERO_X + SIBLING_DX, this.heroY + SIBLING_DY);
      this.confused.setVisible(grabT > 40).setPosition(HERO_X + 75, this.heroY - 5);
    } else {
      this.sibling.setVisible(false);
      const runX = HERO_X + SIBLING_DX + (grabT - CARRY_AFTER) * 3;
      const bounce = Math.abs(Math.sin(t * 0.15)) * 4;
      this.villain.setFlipX(profile).setPosition(runX, this.villainY + bounce);
      // Held up on top, or, from a flier, hanging below her.
      const flying = this.snatching !== null && FLYING_VILLAINS.has(this.snatching);
      this.carried
        .setVisible(true)
        .setPosition(runX + 10, flying
          ? this.villainY + this.villain.displayHeight - 6 + bounce
          : this.villainY - this.siblingH + 5 + bounce);
      if (grabT < 200) this.drawTaunt(runX);
      // :2343. Twenty frames on, ten off — a cry, not a steady label.
      // From a flier the sibling hangs below her, so the cry goes beside them, out from under
      // her speech bubble.
      this.help
        .setVisible(grabT % 30 < 20)
        .setPosition(runX + (flying ? 46 : 20), flying
          ? this.villainY + this.villain.displayHeight + this.siblingH / 2
          : this.villainY - this.siblingH - 5);
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
    // The story's line (the T-Rex wants the sibling), or the original game's taunts.
    this.taunt.setVisible(true).setText(this.script.grab ? this.say(this.script.grab) : this.tauntLine());
    this.bubble.setVisible(true);
    this.drawBubble(this.bubble, this.taunt, runX - 10, this.villainY - 35);
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
    const at = this.times.headlineAt;
    const shown = t >= at;
    this.headline.setVisible(shown);
    if (!shown) return;
    this.headline
      .setScale(Math.min(1, (t - at) / HEADLINE_GROW))
      .setRotation(Math.sin(t * 0.03) * 0.1);
  }
}

/** A level record's `'#rrggbb'` as the number Phaser's Graphics takes. */
function colour(hex: string): number {
  return Phaser.Display.Color.HexStringToColor(hex).color;
}
