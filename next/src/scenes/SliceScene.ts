import Phaser from 'phaser';
import { startBGM } from '../audio/bgm';
import { playSounds } from '../audio/cues';
import { BASE_H, BASE_W, STEP_MS, VIEW_H, VIEW_W, ZOOM } from '../config/constants';
import { getDifficulty, type DifficultyKey } from '../config/difficulty';
import { T, TStr } from '../config/i18n';
import { PARALLAX, type ParallaxLayer } from '../data/parallax';
import type { SpriteData } from '../data/sprites';
import { isFinalLevel } from '../game/boss';
import type { Character, PlayerMove } from '../game/player';
import {
  finishLevel,
  getCurrentLevel,
  getPlayerSprites,
  getRescueSprites,
  getRunTotals,
  getSelectedChar,
  getSkinIndex,
} from '../game/run';
import { createWorld, rescueSpot, stepWorld } from '../game/world';
import type { EnemyState, World } from '../game/types';
import { BOSS_BAR_BACK, bossBarColor } from '../gfx/bossBar';
import { cloudPosition, cloudScale, drawRidges, drawSky } from '../gfx/parallax';
import {
  type BlockView,
  createRainbowBlocks,
  drawStaticTiles,
  updateBumpedBlocks,
  updateRainbowBlocks,
} from '../gfx/tiles';
import {
  ARROW_TEXTURE,
  BIG_HEAD_SCALE,
  bigHeadRows,
  bossTextureKey,
  type BossPose,
  BOW_TEXTURE,
  CAPE_TEXTURE,
  CAT_SCRATCH_TEXTURE,
  CAT_TEXTURE,
  CHICKEN_ARROW_TEXTURE,
  cloudTextureKey,
  enemyTextureKey,
  FIREBALL_TEXTURE,
  playerBodyTextureKey,
  playerHeadTextureKey,
  PLAYER_SCALE,
  playerTextureKey,
  registerTextures,
  STAR_TEXTURE,
  SUPER_TEXTURE,
} from '../gfx/textures';
import type { InputState } from '../input/actions';
import { createControls, type Controls } from '../input/controls';
import { playRumbles } from '../input/gamepad';
import { createEnemyBodies, type EnemyBodies } from '../physics/enemy';
import { createPlayerMove } from '../physics/player';
import { createCollisionLayer, syncCollisionLayer } from '../physics/tiles';
import type { BetweenData } from './BetweenScene';
import type { GameOverData } from './GameOverScene';
import type { HudData } from './HudScene';
import {
  BETWEEN_SCENE_KEY,
  DIFFICULTY_SCENE_KEY,
  GAME_OVER_SCENE_KEY,
  HUD_SCENE_KEY,
  LEVEL_OVERLAY_SCENE_KEY,
  POWERUP_POPUP_SCENE_KEY,
  SLICE_SCENE_KEY,
  WIN_SCENE_KEY,
} from './keys';
import type { LevelOverlayData } from './LevelOverlayScene';
import type { PowerupPopupData } from './PowerupPopupScene';
import type { WinData } from './WinScene';

/**
 * Where a finished run goes back to — won or lost.
 *
 * The live game sends both endings to `title` on the key press or the timer running out
 * (index.html:1349, :1352) and to `modeselect` on Escape (`BACK_TARGET`, :1233-1236).
 * Neither of those two screens is ported yet, so both routes lead to the difficulty screen,
 * which is this port's root: the first scene in main.ts's list and the one Escape already
 * has nowhere to go back from. When the title and mode select land, this is what they
 * replace.
 */
const AFTER_RUN = DIFFICULTY_SCENE_KEY;

/**
 * Half the difference between the canvas and the zoomed view. See setScroll below —
 * the correction for Phaser zooming about the camera centre rather than its top-left.
 */
const CAMERA_PIVOT_X = (BASE_W - VIEW_W) / 2;
const CAMERA_PIVOT_Y = (BASE_H - VIEW_H) / 2;

/**
 * The sprite draws 2px larger than the hitbox on every side (index.html:1848:
 * `drawSprite(spr,p.x-2,p.y-2,ps.palette,2,p.facing<0)`, because the hitbox itself is
 * inset from the sprite by `w = spriteW - 4`, `h = spriteH - 4`, player.ts:35-36). Not
 * cosmetic — get this wrong and the art sits 2px off the hitbox, which reads as a
 * collision bug.
 */
const PLAYER_DRAW_INSET = 2;

/** `player.frame`: 0 stand, 1 run, 2 jump (types.ts, index.html:1424-1429). */
const PLAYER_POSES = ['stand', 'run', 'jump'] as const;

/** Cloud alpha (index.html:1681: `ctx.globalAlpha=0.75`). */
const CLOUD_ALPHA = 0.75;

/**
 * The live game's draw order (index.html:1697-1848), as Phaser depths.
 *
 * Phaser renders by depth first and by creation order only to break ties, and almost
 * everything below is created LAZILY — the first frame a star exists, an arrow is
 * fired, an enemy streams in. Creation order is therefore nothing like draw order: a
 * star knocked out of a block halfway through the level would be created after the
 * player and, on insertion order alone, would hang in FRONT of them. Naming the bands
 * explicitly is what keeps the pickups behind the cat, the cat behind the enemies,
 * and the cape behind the player whatever order the simulation produces them in.
 *
 * The background (sky, hills, clouds, tiles, the `?` and `!` glyphs) is left at the
 * default depth 0 and so stays underneath all of it.
 */
const DEPTH_PICKUP_GLOW = 10;
const DEPTH_PICKUP = 11;
const DEPTH_CAT = 12;
/**
 * The three bands the sibling occupies, after the cat and BEFORE the enemies and the boss
 * (index.html:1733-1756, with :1758 and :1768 after it) — so an enemy wandering past the
 * end of the level walks in front of them, not behind.
 *
 * Three rather than one because the cage is drawn in two halves with the sibling between:
 * the tinted pane goes down first and the bars over the top (index.html:1741 and :1746-
 * :1750). Painting the pane on top instead would tint the sibling it is meant to sit
 * behind, which is exactly the kind of difference a child notices and cannot name.
 */
const DEPTH_RESCUE_CAGE_BACK = 13;
const DEPTH_RESCUE = 14;
/** The bars, and the cry over them (index.html:1752, :1755). */
const DEPTH_RESCUE_FRONT = 15;
const DEPTH_ENEMY = 16;
/**
 * The cannon's muzzle flash (index.html:1764), which the live source draws inside the
 * enemy loop right after each enemy's own sprite. A Graphics has one depth for everything
 * on it, so all the flashes share this band just above the enemies — which differs from
 * the live order only if a cannon is ever drawn on top of another enemy's flash, and
 * nothing in the level data places two enemies in the same few pixels.
 */
const DEPTH_ENEMY_FX = 16.5;
/** The boss, after every ordinary enemy (index.html:1768) and in front of all of them. */
const DEPTH_BOSS = 17;
/**
 * The boss's own health bar and taunt, which the live source draws after its sprite and
 * — unlike the glow and the scar above them — outside the hurt flash's `globalAlpha`
 * (index.html:1807-1819). A band of their own so they cannot end up behind the 72px
 * sprite they are labelling.
 */
const DEPTH_BOSS_BAR = 18;
/** Fireballs (index.html:1827-1828), between the boss and the player's own arrows. */
const DEPTH_ENEMY_PROJECTILE = 19;
const DEPTH_ARROW = 20;
/** The trail is drawn after its arrow (index.html:1832-1833), so it sits on top. */
const DEPTH_ARROW_TRAIL = 21;
const DEPTH_CAPE = 22;
const DEPTH_PLAYER = 23;

/** The four pickup glows (index.html:1699, 1704, 1709-1710, 1717), as colour + alpha. */
const STAR_GLOW = { color: 0xffdd00, alpha: 0.2 };
const BOW_GLOW = { color: 0xffc832, alpha: 0.18 };
const SUPER_GLOW = { color: 0xff6400, alpha: 0.18 };
const SUPER_INNER_GLOW = { color: 0xffc832, alpha: 0.1 };
const CAT_GLOW = { color: 0x6464b4, alpha: 0.2 };

/** The two arrow trails (index.html:1832-1833). */
const CHICKEN_TRAIL = { color: 0xffff64, alpha: 0.3 };
const ARROW_TRAIL = { color: 0xffc864, alpha: 0.4 };
/** A fireball's own trail (index.html:1828), 4x4 behind the direction of travel. */
const FIREBALL_TRAIL = { color: 0xff6400, alpha: 0.3 };

/**
 * The cannon's flash (index.html:1764's `rgba(255,150,0,0.5)`), a 5px disc 10px to the
 * side of its centre.
 *
 * IT IS NOT A WARNING, whatever "telegraph" suggests. The live condition is
 * `shootTimer > shootInterval - 5` and `shootTimer` counts DOWN, reloading to
 * `shootInterval` on the frame it fires — so the five frames it covers are the firing
 * frame and the four after it. A muzzle flash, drawn behind a fireball that has already
 * left. Read it as a warning and you would draw it before the shot, which would make the
 * cannon a fairer enemy than the original's.
 *
 * (One live quirk rides along with that and is reproduced by simply following the rule: a
 * cannon's randomised first `shootTimer` is 60-119, so on any difficulty whose interval is
 * below about 120 — every one but super_easy's 200 — a freshly spawned cannon may already
 * satisfy the test and flash once before it has fired anything at all.)
 */
const CANNON_FLASH = { color: 0xff9600, alpha: 0.5 };
const CANNON_FLASH_RADIUS = 5;
const CANNON_FLASH_OFFSET_X = 10;
/** The five frames the flash covers, counting from the shot (index.html:1764). */
const CANNON_FLASH_FRAMES = 5;

/**
 * The angry glow behind the boss's eyes once it is down to half health
 * (index.html:1795-1800). The alpha is not this constant — it breathes on a sine, and
 * this is only the colour — so it is spelled out at the draw site rather than carried
 * here as a Tint like the ones above.
 */
const BOSS_EYE_COLOR = 0xff3200;
/** The scar it carries below three-quarter health (index.html:1804). */
const BOSS_SCAR = { color: 0x642814, alpha: 0.4 };
/** The in-world bar's height (index.html:1809). Its colours are gfx/bossBar.ts's. */
const BOSS_BAR_HEIGHT = 6;
/** The bar sits twelve pixels above the boss's head, and does NOT wobble with it. */
const BOSS_BAR_OFFSET_Y = 12;
/** index.html:1818's `bold 8px monospace` in white, centred over the boss. */
const BOSS_TAUNT_FONT = {
  fontFamily: 'monospace', fontSize: '8px', fontStyle: 'bold', color: '#ffffff',
};
const BOSS_TAUNT_OFFSET_Y = 18;

/**
 * index.html:1726's `bold 7px monospace` in `#aabbcc`. Origin (0, 1) rather than
 * (0, 0) because the live `fillText` places the text's BASELINE at `cat.y-4`, not its
 * top — anchoring the bottom is the closest Phaser equivalent that does not depend on
 * canvas font metrics Phaser's text renderer does not share (same reasoning as the
 * `?` glyph in gfx/tiles.ts).
 */
const MEOW_FONT = { fontFamily: 'monospace', fontSize: '7px', fontStyle: 'bold', color: '#aabbcc' };

/**
 * The cage the sibling is held in until the boss falls (index.html:1738-1750). It is
 * pinned to the sibling's UNBOBBED corner, 8px out on both axes, so the cage holds still
 * while the child inside it moves — which is what makes the bobbing read as trapped
 * rather than as the whole picture wobbling.
 */
const CAGE_W = 40;
const CAGE_H = 50;
const CAGE_OFFSET = 8;
/** index.html:1741's `rgba(50,40,30,0.3)`. */
const CAGE_BACK = { color: 0x32281e, alpha: 0.3 };
/** The five uprights (index.html:1747) and the two rails (:1749-1750), both at lineWidth 2. */
const CAGE_BARS = 5;
const CAGE_BAR_SPACING = 10;
const CAGE_BAR_OFFSET_X = 2;
const CAGE_BAR_WIDTH = 2;
const CAGE_BAR_COLOR = 0x888888;
const CAGE_RAIL_COLOR = 0x999999;

/**
 * The two things the sibling calls out, and they are NOT one label with two skins: the
 * caged cry is `bold 7px` blue 12px over their head and blinks on an 80-frame cycle
 * (index.html:1752), the free call is `bold 8px` pink 8px over it on a 120-frame one
 * (:1755). Same origin reasoning as MEOW_FONT above — the live `fillText` places a
 * baseline, so the bottom is what gets anchored.
 */
const RESCUE_CRY_FONT = { fontFamily: 'monospace', fontSize: '7px', fontStyle: 'bold', color: '#3388ff' };
const RESCUE_CRY_OFFSET_Y = 12;
const RESCUE_CALL_FONT = { fontFamily: 'monospace', fontSize: '8px', fontStyle: 'bold', color: '#ff69b4' };
const RESCUE_CALL_OFFSET_Y = 8;
/** Both are drawn at `rX-2` (index.html:1752, :1755), not at the sibling's own left edge. */
const RESCUE_TEXT_OFFSET_X = 2;

/** One cloud's fixed tile position plus the Image drawing it. */
interface CloudView {
  readonly tx: number;
  readonly ty: number;
  readonly image: Phaser.GameObjects.Image;
}

/**
 * The vertical slice: the first Phaser-facing code in this port, and the validation
 * gate for the whole migration. Driven by the pure simulation in src/game/ and drawn
 * with the kids' actual pixel art, the real tile grid, and a scrolling parallax sky
 * now that Plan 3 has a texture pipeline — still no felt shading (deferred), no HUD,
 * no sound. It exists to answer one question (does the port feel the same as the
 * live game?), so every hour spent making it prettier is an hour not spent on that.
 *
 * The scene is deliberately thin: build the background, the tile map and the player
 * image once in `create()`, advance the simulation at a fixed rate in `update()`, and
 * copy simulation state onto Phaser objects in `syncSprites()`. It never mutates
 * `world` except by calling `stepWorld`, and it never drives the camera itself —
 * Phaser's camera is only ever told where the simulation's camera already is.
 */
export class SliceScene extends Phaser.Scene {
  private world!: World;
  private controls!: Controls;
  private playerImage!: Phaser.GameObjects.Image;
  /** The two halves the player splits into while a big head is running. */
  private headImage!: Phaser.GameObjects.Image;
  private bodyImage!: Phaser.GameObjects.Image;
  private capeImage!: Phaser.GameObjects.Image;
  private readonly enemyImages: Phaser.GameObjects.Image[] = [];
  private readonly starImages: Phaser.GameObjects.Image[] = [];
  private readonly bowImages: Phaser.GameObjects.Image[] = [];
  private readonly superImages: Phaser.GameObjects.Image[] = [];
  private readonly arrowImages: Phaser.GameObjects.Image[] = [];
  private readonly fireballImages: Phaser.GameObjects.Image[] = [];
  /**
   * The boss: one Image for the sprite, and three overlays the live source draws around
   * it. Two Graphics rather than one because the hurt flash covers the glow and the scar
   * but NOT the health bar — the live `ctx.globalAlpha=1` at index.html:1807 lands
   * between them.
   */
  private bossImage!: Phaser.GameObjects.Image;
  private bossFxGraphics!: Phaser.GameObjects.Graphics;
  private bossBarGraphics!: Phaser.GameObjects.Graphics;
  private bossTaunt!: Phaser.GameObjects.Text;
  /** At most one of each exists at a time, so none of these needs a pool. */
  private catPickupImage!: Phaser.GameObjects.Image;
  private catImage!: Phaser.GameObjects.Image;
  private catScratchImage!: Phaser.GameObjects.Image;
  private meowText!: Phaser.GameObjects.Text;
  /**
   * The sibling at the end of the level, and everything drawn around them: the cage's
   * backing pane, its bars, and the two things they call out. Two Graphics because the
   * sibling is drawn BETWEEN the pane and the bars, and two Texts because the caged cry
   * and the free call differ in every respect — see the fonts above.
   */
  private rescueImage!: Phaser.GameObjects.Image;
  private cageBackGraphics!: Phaser.GameObjects.Graphics;
  private cageBarsGraphics!: Phaser.GameObjects.Graphics;
  private rescueCryText!: Phaser.GameObjects.Text;
  private rescueCallText!: Phaser.GameObjects.Text;
  /** The pickup haloes, the arrow trails and the cannons' flashes: shapes, redrawn each frame. */
  private glowGraphics!: Phaser.GameObjects.Graphics;
  private arrowTrailGraphics!: Phaser.GameObjects.Graphics;
  private enemyFxGraphics!: Phaser.GameObjects.Graphics;
  /** The two kinds of block that can be bumped from below, and the bricks they become. */
  private questionBlocks: BlockView[] = [];
  private rainbowBlocks: BlockView[] = [];
  private rainbowGraphics!: Phaser.GameObjects.Graphics;
  private bumpedGraphics!: Phaser.GameObjects.Graphics;
  /**
   * The same tiles again, as geometry Arcade can separate against rather than as a
   * picture — invisible, and drawing nothing. See src/physics/tiles.ts.
   */
  private collisionLayer!: Phaser.Tilemaps.TilemapLayer;
  /**
   * The player's Arcade body, as the one function the simulation is allowed to see of
   * it: move, separate, report back. See src/physics/player.ts.
   */
  private movePlayer!: PlayerMove;
  /**
   * The ground patrols' Arcade bodies — the same arrangement, plus the lifecycle the
   * player's singleton does not need: enemies stream in and a respawn throws them all
   * away. See src/physics/enemy.ts.
   */
  private enemyBodies!: EnemyBodies;
  private hillsGraphics: Phaser.GameObjects.Graphics | undefined;
  private parallaxLayers: readonly ParallaxLayer[] = [];
  private clouds: CloudView[] = [];
  private accumulator = 0;
  /**
   * Which level this is. `create` already has it as a local; it is kept because `update`
   * needs it too — a `music-level` cue (a respawn restarting the level's theme) says WHICH
   * theme only by being this scene's, since a World does not know its own index. See
   * audio/cues.ts.
   */
  private levelIndex = 0;
  /** Set once this level's ending has been acted on — see `leaveIfRunOver`. */
  private leaving = false;

  constructor() {
    super(SLICE_SCENE_KEY);
  }

  create(): void {
    this.resetForNewLevel();
    // Which level, and what the run brings into it. `getCurrentLevel` was a hard-coded 0
    // here until the run loop landed; it now moves because `finishLevel` (game/run.ts)
    // moved it, and `getRunTotals` is the lives and score the last level ended with — a
    // fresh run's `startRun` having just set them to the difficulty's lives and zero.
    const levelIndex = getCurrentLevel();
    this.levelIndex = levelIndex;
    // What the two choice screens decided, read back out of the run state they wrote
    // to — the port's equivalents of the live game's `selectedDifficulty`
    // (index.html:161) and `selectedChar` (:988), which is where the live game reads
    // them from too. Named rather than inlined into createWorld because the HUD needs
    // the difficulty to label itself, and a HUD that said 'Normal' over a world built
    // on some other record would be worse than no HUD at all. Neither is re-asked
    // between levels: both were chosen once, before the run, and nothing here writes them.
    const difficulty: DifficultyKey = getDifficulty();
    const character: Character = getSelectedChar();
    this.world = createWorld(levelIndex, difficulty, character, getRunTotals());

    registerTextures(this);

    this.createParallax(levelIndex);

    this.questionBlocks = drawStaticTiles(this, this.world);
    const rainbow = createRainbowBlocks(this, this.world);
    this.rainbowBlocks = rainbow.blocks;
    this.rainbowGraphics = rainbow.graphics;
    // Created after both of those on purpose — see updateBumpedBlocks in gfx/tiles.ts.
    // Every tile layer sits at depth 0, where creation order alone decides what covers
    // what, and a bumped block's brick has to cover the block that was drawn there.
    this.bumpedGraphics = this.add.graphics();
    // Built from the very same `world.map` those three just drew, and kept in step with
    // it by `syncCollisionLayer` in update() below. The player stands on it, and so do the
    // doll, the car, the dino, the penguin and any chicken a ray makes of one; the bats,
    // the bouncer and every projectile still move themselves, deliberately.
    this.collisionLayer = createCollisionLayer(this, this.world);
    this.movePlayer = createPlayerMove(this, this.world, this.collisionLayer);
    this.enemyBodies = createEnemyBodies(this, this.world, this.collisionLayer);

    this.glowGraphics = this.add.graphics().setDepth(DEPTH_PICKUP_GLOW);
    this.arrowTrailGraphics = this.add.graphics().setDepth(DEPTH_ARROW_TRAIL);
    this.enemyFxGraphics = this.add.graphics().setDepth(DEPTH_ENEMY_FX);

    // Built on every level, not only the last one. `world.boss` is null on the other five
    // and `syncBoss` simply hides all four objects — which costs one `setVisible(false)`
    // a frame and removes the whole class of bug where a per-level conditional build
    // leaves the scene without something it later reaches for.
    this.bossImage = this.hiddenImage(bossTextureKey('idle'), DEPTH_BOSS);
    this.bossFxGraphics = this.add.graphics().setDepth(DEPTH_BOSS);
    this.bossBarGraphics = this.add.graphics().setDepth(DEPTH_BOSS_BAR);
    this.bossTaunt = this.add
      .text(0, 0, '', BOSS_TAUNT_FONT)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_BOSS_BAR)
      .setVisible(false);

    this.catPickupImage = this.hiddenImage(CAT_TEXTURE, DEPTH_PICKUP);
    this.catImage = this.hiddenImage(CAT_TEXTURE, DEPTH_CAT);
    this.catScratchImage = this.hiddenImage(CAT_SCRATCH_TEXTURE, DEPTH_CAT);
    // Resolved once: the port has no language switch yet, so unlike the live game's
    // per-frame `T('meow')` there is nothing to re-read (same as gfx/tiles.ts's glyphs).
    this.meowText = this.add
      .text(0, 0, TStr('meow'), MEOW_FONT)
      .setOrigin(0, 1)
      .setDepth(DEPTH_CAT)
      .setVisible(false);

    // The sibling. Their texture is resolved once, here, and never swapped: which
    // character is waiting at the end and in which skin is settled before the run starts
    // and cannot change inside a level — unlike the player's pose, which is re-resolved
    // every frame just below. `rescueTextureKey` at the foot of this file is where the
    // "other character" rule is read, out of game/run.ts rather than worked out again.
    this.rescueImage = this.hiddenImage(rescueTextureKey(), DEPTH_RESCUE);
    this.cageBackGraphics = this.add.graphics().setDepth(DEPTH_RESCUE_CAGE_BACK);
    this.cageBarsGraphics = this.add.graphics().setDepth(DEPTH_RESCUE_FRONT);
    this.rescueCryText = this.rescueLabel(TStr('help_cry'), RESCUE_CRY_FONT);
    this.rescueCallText = this.rescueLabel(TStr('help_npc'), RESCUE_CALL_FONT);

    const { player } = this.world;
    this.capeImage = this.hiddenImage(CAPE_TEXTURE, DEPTH_CAPE);
    this.playerImage = this.add
      .image(
        player.x - PLAYER_DRAW_INSET,
        player.y - PLAYER_DRAW_INSET,
        resolvePlayerTextureKey(player.frame),
      )
      .setOrigin(0, 0)
      .setDepth(DEPTH_PLAYER);
    this.bodyImage = this.hiddenImage(playerBodyTextureKey(...currentSkin(), 'stand'), DEPTH_PLAYER);
    this.headImage = this.hiddenImage(playerHeadTextureKey(...currentSkin(), 'stand'), DEPTH_PLAYER);

    this.cameras.main.setZoom(ZOOM);

    // Keyboard and controller, read as one value per fixed step. Made HERE, in create(),
    // and not earlier: the pad half seeds itself from what is held the moment it is built,
    // which is what stops the Ⓐ that confirmed the character screen from also jumping.
    this.controls = createControls(this);

    // The numbers, on a scene of their own, running alongside this one. `launch` rather
    // than `start`: this scene keeps running. It draws on top because main.ts lists it
    // after this one and Phaser renders scenes in that order — launching does not
    // reorder them — and it escapes the `setZoom` above because a scene's camera is its
    // own. `world` goes across as a live reference; the HUD only ever reads it.
    this.scene.launch(HUD_SCENE_KEY, {
      world: this.world,
      levelIndex,
      difficulty,
    } satisfies HudData);

    // The two labels the live game lays over the FROZEN world — 'Oops!' while you wait to
    // respawn and '<SIBLING> IS SAFE!' after a rescue (index.html:1898-1899). Same
    // arrangement as the HUD: a parallel scene, a live reference to the World, read-only.
    this.scene.launch(LEVEL_OVERLAY_SCENE_KEY, {
      world: this.world,
      levelIndex,
    } satisfies LevelOverlayData);

    // And the power-up announcement, in front of even the HUD — see main.ts's scene list
    // and PowerupPopupScene itself. Launched here rather than when a rainbow block is hit
    // because it is the world it watches, not an event it is sent: bumping the block sets
    // `world.powerupPopup` deep inside the simulation, which knows nothing of scenes.
    this.scene.launch(POWERUP_POPUP_SCENE_KEY, {
      world: this.world,
    } satisfies PowerupPopupData);

    // The last line of `initLevel` (index.html:1209), and the reason each level sounds
    // different: theme 0-5 IS the level index. Down here rather than up beside
    // `createWorld` because that is where the live source has it — after everything else
    // the level needs is built.
    //
    // A run's first level starts the music a moment after DifficultyScene's confirm opened
    // the AudioContext; a later level starts it after the rescue's `music-stop` and a
    // silent cutscene. A RESPAWN does not come through here at all — the scene is not
    // restarted, the World is rebuilt in place — which is why `respawnLevel` raises a
    // `music-level` cue of its own (game/world.ts).
    startBGM(levelIndex);

    // All three of them run alongside this scene and hold a reference to THIS World, so all
    // three have to go when it does — whether it is going to the next level, to the win
    // screen or to game over. Hung off SHUTDOWN rather than written out at each of those
    // three exits so that a fourth cannot forget: leaving without this leaves the HUD and
    // the overlays painted over whatever comes next, still reading a World nobody is
    // stepping. `once`, and re-armed by the next `create`.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.stop(HUD_SCENE_KEY);
      this.scene.stop(LEVEL_OVERLAY_SCENE_KEY);
      this.scene.stop(POWERUP_POPUP_SCENE_KEY);
    });
  }

  /**
   * Phaser reuses the scene INSTANCE across restarts, and this scene now restarts — once
   * per level, where before it was created once per page load and a death only ever mutated
   * its World in place (`respawnLevel`). Everything it caches between frames therefore has
   * to be emptied here, at the top of `create`, or level 2 begins holding level 1's
   * destroyed Images.
   *
   * The image pools are the sharp edge: `pooledImage` hands back `pool[i]` if it exists, so
   * a stale entry is a destroyed object that will never draw again and will never be
   * replaced — a level whose stars are simply missing, with nothing in the console about it.
   * The accumulator matters for a subtler reason: left as it was, the time that elapsed
   * during the cutscene would be spent stepping the new level before its first frame is
   * ever shown.
   */
  private resetForNewLevel(): void {
    this.enemyImages.length = 0;
    this.starImages.length = 0;
    this.bowImages.length = 0;
    this.superImages.length = 0;
    this.arrowImages.length = 0;
    this.fireballImages.length = 0;
    this.questionBlocks = [];
    this.rainbowBlocks = [];
    this.clouds = [];
    this.parallaxLayers = [];
    this.hillsGraphics = undefined;
    this.accumulator = 0;
    this.leaving = false;
  }

  /**
   * A world image that starts hidden and is positioned by `syncSprites` on the first
   * frame the thing it draws exists. The texture passed is only a starting point for
   * the ones that later swap it (the player's halves, an arrow slot that changes
   * between an arrow and a chicken).
   */
  private hiddenImage(texture: string, depth: number): Phaser.GameObjects.Image {
    return this.add.image(0, 0, texture).setOrigin(0, 0).setDepth(depth).setVisible(false);
  }

  /**
   * One of the sibling's two cries, hidden until `syncRescue` blinks it on. Same
   * bottom-anchored origin as the cat's meow, and for the same reason (see MEOW_FONT):
   * the live `fillText` places a baseline, not a top edge. Resolved once, like every
   * other label in this port — there is no language switch to re-read for.
   */
  private rescueLabel(
    text: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
  ): Phaser.GameObjects.Text {
    return this.add
      .text(0, 0, text, style)
      .setOrigin(0, 1)
      .setDepth(DEPTH_RESCUE_FRONT)
      .setVisible(false);
  }

  /**
   * The image for slot `index` of a pool, created on first use. Every image in a
   * given pool draws the same kind of thing, so a slot is not tied to a particular
   * star or arrow — `hideSurplus` below parks whatever the simulation is not using
   * this frame, and a shorter list next frame (a respawn empties them all) simply
   * leaves more of the pool hidden.
   */
  private pooledImage(
    pool: Phaser.GameObjects.Image[],
    index: number,
    texture: string,
    depth: number,
  ): Phaser.GameObjects.Image {
    const existing = pool[index];
    if (existing) return existing;
    const image = this.hiddenImage(texture, depth);
    pool[index] = image;
    return image;
  }

  /**
   * Builds the sky, the parallax hill layers, and the clouds — everything
   * `drawParallax` and the live game's cloud block draw BEFORE the world's own
   * `ctx.scale(ZOOM)` (index.html:1044-1072, 1681-1682), i.e. unzoomed and independent of
   * camera scroll. `PARALLAX[levelIndex]` mirrors the live game's own guard
   * (`if(!pd)return`, index.html:1045): the one level this slice runs (0) has an
   * entry, but a level that did not would simply get no sky, hills or clouds rather
   * than a crash — `hillsGraphics` stays undefined and `clouds` stays empty, both
   * read defensively in `syncSprites` below.
   */
  private createParallax(levelIndex: number): void {
    const parallax = PARALLAX[levelIndex];
    if (!parallax) return;

    const sky = this.add.graphics();
    this.setupFixedLayer(sky);
    drawSky(sky, this.world.level.bg, parallax.bg2);

    const hills = this.add.graphics();
    this.setupFixedLayer(hills);
    this.hillsGraphics = hills;
    this.parallaxLayers = parallax.layers;

    this.clouds = this.world.level.clouds.map(([tx, ty]) => {
      const image = this.add
        .image(0, 0, cloudTextureKey(cloudScale(tx)))
        .setOrigin(0, 0)
        .setAlpha(CLOUD_ALPHA);
      this.setupFixedLayer(image);
      return { tx, ty, image };
    });
  }

  /**
   * Puts a Graphics or Image on the fixed background layer (sky, hills, clouds). All
   * three render through the SAME shared main camera as the world (tiles, player,
   * enemies) — there is no second camera — but must not scroll or zoom with it,
   * matching the live game drawing them before its own `ctx.scale(ZOOM)`
   * (index.html:1044-1072, 1681-1682). `scrollFactor(0)` handles the scroll half. The
   * other half is zoom: Phaser zooms every object about the camera's CENTRE —
   * including scrollFactor(0) ones — while the live drawing is unzoomed and
   * top-left-anchored, so positioning at (CAMERA_PIVOT_X, CAMERA_PIVOT_Y) and scaling
   * by 1/ZOOM cancels the shared camera's zoom back out. After this,
   * `positionFixedLayer(obj, 0, 0)` — its position immediately below — lands on the
   * same screen pixel the live canvas's raw (0, 0) would.
   */
  private setupFixedLayer(obj: Phaser.GameObjects.Graphics | Phaser.GameObjects.Image): void {
    obj.setScale(1 / ZOOM).setScrollFactor(0);
    this.positionFixedLayer(obj, 0, 0);
  }

  /**
   * Moves a fixed-background-layer object (`setupFixedLayer` above) so that the
   * given RAW, unzoomed pixel coordinate — exactly the live formulas in
   * gfx/parallax.ts, unchanged — lands on the same screen pixel the live canvas
   * would put it on. The sky and hills Graphics only ever need this once, at (0, 0):
   * their own drawn path already covers the full raw coordinate range on its own.
   * Each cloud Image needs it called again every frame, with that cloud's current
   * `cloudPosition`, since an Image — unlike a Graphics path — has only the one
   * position to carry its drift.
   */
  private positionFixedLayer(
    obj: Phaser.GameObjects.Graphics | Phaser.GameObjects.Image,
    rawX: number,
    rawY: number,
  ): void {
    obj.setPosition(rawX / ZOOM + CAMERA_PIVOT_X, rawY / ZOOM + CAMERA_PIVOT_Y);
  }

  /**
   * The fixed step, and the one place in this port where Arcade's clock is set.
   *
   * The accumulator is the single deliberate break from bug-compatibility in the whole
   * migration: index.html runs its simulation straight off `requestAnimationFrame`, so on
   * a 120Hz screen the live game runs at double speed. This runs STEP_MS's worth of
   * simulation per STEP_MS of real time whatever the display does.
   *
   * Arcade has to be inside that loop or the fix is undone for the bodies alone. Left to
   * itself it steps once per RENDERED frame (it listens to the scene's UPDATE event), so
   * on that same 120Hz screen the player and the patrolling enemies would move twice for
   * every one step everything else took — exactly the bug, reintroduced for exactly the
   * entities that have bodies, and found by a child on a fast laptop rather than by a
   * test. So `customUpdate: true` in main.ts unhooks it, and each mover steps its own body
   * from inside `stepWorld` — `stepPlayer` for the player, `stepEnemy` for each ground
   * patroller — once per iteration of this loop, with Arcade's own fixed delta. Every body
   * integrates exactly once per pass through this `while`; see stepBodyAlone in
   * physics/body.ts for how one body is stepped without dragging the rest along.
   *
   * Driving it from in there rather than from out here buys one more thing worth having:
   * the frames the simulation does NOT run — dead, won, or frozen behind a power-up
   * announcement — do not step Arcade either, so a frozen world really is frozen instead
   * of leaving the player coasting behind the popup.
   */
  update(_time: number, delta: number): void {
    // Clamp so a backgrounded tab does not produce a hundred catch-up steps at once.
    this.accumulator = Math.min(this.accumulator + delta, STEP_MS * 5);
    while (this.accumulator >= STEP_MS) {
      stepWorld(this.world, this.readInput(), this.movePlayer, this.enemyBodies.move);
      // Everything that step made a noise about, played now, before the next one clears
      // the list. INSIDE the loop for the same reason as the three calls below it: a slow
      // rendered frame takes several steps, and draining only after them all would play
      // the last step's coin and silently drop the two before it. It is also what keeps a
      // frozen frame honest — a dead or won step raises nothing and clears anything left,
      // so a death cannot bank up a burst of stomps to fire on the respawn.
      playSounds(this.world, this.levelIndex);
      // The same arrangement for the other device, drained in the same place and for the
      // same reason: a slow rendered frame that takes three steps should buzz for each
      // star, and a frozen step should leave nothing banked up. See World.rumbles.
      playRumbles(this.world);
      // Also INSIDE the loop. A death inside this step replaces `world.enemies` with an
      // empty array (world.ts's respawnLevel), and the bodies of the enemies that were in
      // it are still in Arcade's world, still being stepped and still separating against
      // the level. Left until after the loop, the next step in this same rendered frame
      // would run with the dead attempt's collision still standing in it.
      this.enemyBodies.reap();
      // INSIDE the loop, not after it. A bumped block and a respawn both rewrite
      // `world.map`, and the collision layer is a copy of that map rather than a view of
      // it — and the player now separates against the layer rather than reading the map.
      // Left outside, a map change made by one fixed step would not reach the geometry
      // until after every other step in this rendered frame had already collided against
      // the stale copy. Nothing in the current tile vocabulary can show that (3, 5 and 2
      // are all solid, so a bump changes no collision), which is exactly why it is worth
      // being explicit before something can.
      syncCollisionLayer(this.collisionLayer, this.world);
      this.accumulator -= STEP_MS;
      // Also INSIDE the loop, and for the third version of the same reason: this `while`
      // can run several steps in one rendered frame, and both of the endings below are
      // "the step on which a countdown reached zero". Checked after the loop instead, a
      // frame that stepped twice would count the rescue's last frame down to -1 and could
      // hand `finishLevel` a second level advance for the one level that was finished.
      if (this.leaveIfRunOver()) return;
    }
    this.syncSprites();
  }

  /**
   * The three ways a level ends, and the only place in the port that decides what follows
   * one. Returns true once this scene is on its way out, which ends the fixed-step loop
   * above with it.
   *
   * Ported from the two live state branches that do this — index.html:1350's
   * `levelcomplete` (count down, then advance or win) and the tail of :1348's `dead` (out of
   * lives, so game over). The countdowns themselves are the World's and run in `stepWorld`;
   * what is here is only what happens at the end of one, because that is the part a single
   * level cannot know.
   *
   * `leaving` is not defensive. `this.scene.start` is QUEUED — Phaser runs it between
   * frames, not inside this call — so without the flag a rendered frame that had already
   * decided to leave could decide again.
   */
  private leaveIfRunOver(): boolean {
    if (this.leaving) return true;
    const { won, stateTimer, gameOver, score, lives } = this.world;

    if (won && stateTimer <= 0) {
      this.leaving = true;
      // Banks this level's lives and score into the run and steps `currentLevel` on, so the
      // cutscene and the level after it are both about the NEXT world (game/run.ts).
      const outcome = finishLevel({ lives, score });
      if (outcome === 'next-level') {
        this.scene.start(BETWEEN_SCENE_KEY, { next: SLICE_SCENE_KEY } satisfies BetweenData);
      } else {
        this.scene.start(WIN_SCENE_KEY, { score, next: AFTER_RUN } satisfies WinData);
      }
      return true;
    }

    if (gameOver) {
      this.leaving = true;
      // Nothing is banked: the run is over, and the next one starts from `startRun`. The
      // score goes across as a number because the World it came off is about to be dropped.
      this.scene.start(GAME_OVER_SCENE_KEY, { score, next: AFTER_RUN } satisfies GameOverData);
      return true;
    }

    return false;
  }

  private readInput(): InputState {
    return this.controls.read();
  }

  /**
   * Copies simulation state onto every image the world draws — pickups, the cat,
   * arrows, the player, the enemies — and tells Phaser's camera where the
   * simulation's camera already is. The per-entity passes are split into the methods
   * below in the live game's own draw order (index.html:1697-1848); the order they
   * run in here does not decide what covers what, though: that is the depth bands at
   * the top of this file.
   *
   * `world.camera` is simulation state —
   * enemy spawning reads it, and it is compared frame by frame against the live game
   * in the test suite — so this scene follows it rather than driving it: no
   * `startFollow`, ever. Two cameras with different following behaviour would
   * silently disagree, and the one the tests check would not be the one on screen.
   *
   * `Math.round` matches the live game, which rounds only at draw time
   * (index.html:1686) while keeping the camera sub-pixel in logic.
   */
  private syncSprites(): void {
    const { enemies, camera, animFrame } = this.world;

    this.syncPickups();
    this.syncCat();
    this.syncRescue();
    this.syncBoss();
    this.syncEnemyProjectiles();
    this.syncArrows();
    this.syncPlayer();

    // Cleared here and filled from inside the loop below, exactly as the live draw code
    // paints each cannon's flash from inside its own `enemies.forEach`.
    this.enemyFxGraphics.clear();
    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      const image = this.enemyImages[i] ?? this.createEnemyImage(enemy);
      this.enemyImages[i] = image;
      this.syncEnemyImage(image, enemy, animFrame);
      this.drawCannonFlash(enemy);
    }
    // `world.enemies` only ever grows WITHIN a level, but a respawn replaces it with
    // an empty array (world.ts's respawnLevel) — and without this, every enemy from
    // the failed attempt stayed painted where it was, frozen, for the rest of the run.
    hideSurplus(this.enemyImages, enemies.length);

    // Parallax: the ridge and clouds scroll at their own rate from world.camera.x,
    // independent of the world's own camera (see the fixed-layer helpers above). The
    // sky is static and was drawn once in create().
    if (this.hillsGraphics) {
      drawRidges(this.hillsGraphics, this.parallaxLayers, camera.x);
    }
    for (const cloud of this.clouds) {
      const pos = cloudPosition(cloud.tx, cloud.ty, camera.x, animFrame);
      this.positionFixedLayer(cloud.image, pos.x, pos.y);
    }

    // The only two tiles the static pass in create() cannot draw for good — see
    // gfx/tiles.ts. A block bumped from below becomes a plain brick until a respawn
    // brings it back, and the rainbow blocks cycle their hue every frame. Everything
    // else the tile grid draws was drawn once, in create(), and is left alone.
    //
    // The bumped pass runs first so that a block spent this frame is already out of the
    // rainbow list by the time the animated pass below walks it.
    updateBumpedBlocks(this.bumpedGraphics, this.world, this.questionBlocks, this.rainbowBlocks);
    updateRainbowBlocks(this.rainbowGraphics, this.rainbowBlocks, animFrame);

    // Phaser zooms about the camera's CENTRE; the live game zooms about the top-left
    // (`ctx.scale(ZOOM); ctx.translate(-camera.x, -camera.y)`, index.html:1686). Same
    // visible size either way — 426.7 x 266.7 — but Phaser's view sits half the
    // difference down and to the right, so the simulation's camera position has to be
    // biased back by that much for the two to show the same region. Measured in the
    // browser: without this the view started at world (106.7, 199.7) while the
    // simulation said (0, 133.3), which put the player off-screen to the left.
    this.cameras.main.setScroll(
      Math.round(camera.x) - CAMERA_PIVOT_X,
      Math.round(camera.y) - CAMERA_PIVOT_Y,
    );
  }

  /**
   * Stars and the three pickups (index.html:1697-1721). All four bob on a sine of
   * `animFrame`, and no two use the same one: the star's is shared by every star
   * (amplitude 3, no phase term, so they rise and fall together), while the bow,
   * super and cat each add `x * 0.1` to the phase so two of them on screen drift
   * apart. Amplitudes are 3, 4, 5 and 4 respectively, and the star alone draws at
   * scale 1.5 — these are four separate expressions in the live source, not one
   * expression with parameters, and they are kept separate here for the same reason.
   *
   * A collected pickup draws nothing at all, halo included: the live game's `return`
   * is above the glow, not between it and the sprite.
   *
   * The haloes are the `ctx.arc` fills those same lines paint under each sprite. The
   * live game's sparkle PARTICLES are not here — the port has no particle system yet
   * (particles are pure presentation and live outside the simulation), so the pickups
   * glow and bob but do not give off sparks.
   */
  private syncPickups(): void {
    const { stars, bowPickups, superPickups, catPickup, animFrame } = this.world;
    const glow = this.glowGraphics;
    glow.clear();

    const starBob = Math.sin(animFrame * 0.12) * 3;
    const starRadius = 8 + Math.sin(animFrame * 0.15) * 3;
    for (let i = 0; i < stars.length; i++) {
      const star = stars[i];
      const image = this.pooledImage(this.starImages, i, STAR_TEXTURE, DEPTH_PICKUP);
      image.setVisible(!star.collected);
      if (star.collected) continue;
      image.setPosition(star.x, star.y + starBob);
      fillCircle(glow, STAR_GLOW, star.x + 5, star.y + 5 + starBob, starRadius);
    }
    hideSurplus(this.starImages, stars.length);

    const bowRadius = 16 + Math.sin(animFrame * 0.1) * 3;
    for (let i = 0; i < bowPickups.length; i++) {
      const bow = bowPickups[i];
      const image = this.pooledImage(this.bowImages, i, BOW_TEXTURE, DEPTH_PICKUP);
      image.setVisible(!bow.collected);
      if (bow.collected) continue;
      const bob = Math.sin(animFrame * 0.08 + bow.x * 0.1) * 4;
      image.setPosition(bow.x, bow.y + bob);
      fillCircle(glow, BOW_GLOW, bow.x + 8, bow.y + 8 + bob, bowRadius);
    }
    hideSurplus(this.bowImages, bowPickups.length);

    const superRadius = 18 + Math.sin(animFrame * 0.09) * 4;
    for (let i = 0; i < superPickups.length; i++) {
      const cape = superPickups[i];
      const image = this.pooledImage(this.superImages, i, SUPER_TEXTURE, DEPTH_PICKUP);
      image.setVisible(!cape.collected);
      if (cape.collected) continue;
      const bob = Math.sin(animFrame * 0.07 + cape.x * 0.1) * 5;
      image.setPosition(cape.x, cape.y + bob);
      // Two circles, the inner one at 60% of the outer's radius (index.html:1709-1710).
      fillCircle(glow, SUPER_GLOW, cape.x + 8, cape.y + 8 + bob, superRadius);
      fillCircle(glow, SUPER_INNER_GLOW, cape.x + 8, cape.y + 8 + bob, superRadius * 0.6);
    }
    hideSurplus(this.superImages, superPickups.length);

    const showCatPickup = catPickup !== null && !catPickup.collected;
    this.catPickupImage.setVisible(showCatPickup);
    if (catPickup && showCatPickup) {
      const bob = Math.sin(animFrame * 0.08 + catPickup.x * 0.1) * 4;
      this.catPickupImage.setPosition(catPickup.x, catPickup.y + bob);
      // The one halo that is not centred on the sprite's own middle: +12 in y, not +8
      // (index.html:1717), which puts it around the cat's body rather than its ears.
      const radius = 20 + Math.sin(animFrame * 0.1) * 3;
      fillCircle(glow, CAT_GLOW, catPickup.x + 8, catPickup.y + 12 + bob, radius);
    }
  }

  /**
   * The cat companion, its "Mjäu!" and its claw mark (index.html:1723-1730).
   *
   * The cat does not bob: it is already bouncing, in the simulation. It does flip,
   * on `facing < 0` — the player's convention, not the enemies' — and `facing` is the
   * direction of its last bounce REVERSAL rather than of its current travel, so it
   * spends whole swings pointing the way it came (see CatState in game/types.ts).
   *
   * The claw mark appears only for the first ten frames of the thirty-frame scratch
   * cooldown (`scratchTimer > 20`), and at a fixed -5/-5 from the victim's centre
   * rather than centred on it.
   */
  private syncCat(): void {
    const { cat, animFrame } = this.world;
    if (!cat) {
      this.catImage.setVisible(false);
      this.catScratchImage.setVisible(false);
      this.meowText.setVisible(false);
      return;
    }

    this.catImage.setVisible(true).setPosition(cat.x, cat.y).setFlipX(cat.facing < 0);

    // Forty frames of meowing out of every two hundred (index.html:1726).
    this.meowText.setVisible(animFrame % 200 < 40).setPosition(cat.x, cat.y - 4);

    const scratching = cat.scratchTimer > 20 && cat.scratchTarget !== null;
    this.catScratchImage.setVisible(scratching);
    if (cat.scratchTarget && scratching) {
      this.catScratchImage.setPosition(cat.scratchTarget.x - 5, cat.scratchTarget.y - 5);
    }
  }

  /**
   * The sibling you came for (index.html:1733-1756) — the whole point of the game, and
   * until now the one thing at the end of a level this port did not draw at all. Walking
   * into the empty air still won, so the bug was invisible to every test in the suite and
   * obvious to the first person who looked at the screen.
   *
   * TWO BRANCHES, in the live source's own order, and they are not one branch with
   * parameters. Caged while the boss is alive on the final level; free otherwise, and
   * only once there is no boss left to fight. With a boss still standing on a level that
   * is somehow not the final one, NEITHER runs and nothing is drawn — no level in this
   * port can reach that, and the live `if/else if` is reproduced rather than flattened so
   * that it stays true if one ever does.
   *
   * The two bobs differ (0.08 caged against 0.05 free) and so do the two blinks (50
   * frames in every 80 against 80 in every 120): the trapped sibling is more agitated
   * than the freed one and calls out more often. That is the live game's, and it is the
   * difference between the two halves of this scene. Do not unify them.
   *
   * What bobs is the SPRITE only. The cage, both cries and the position the rescue
   * actually triggers at are all pinned to the unbobbed `spot`, exactly as the live
   * source pins them to `rY` rather than `rY+bob`.
   */
  private syncRescue(): void {
    const { boss, bossDefeated, level, animFrame } = this.world;
    const back = this.cageBackGraphics;
    const bars = this.cageBarsGraphics;
    back.clear();
    bars.clear();

    const caged = boss !== null && boss.alive && isFinalLevel(level);
    const free = !caged && (!boss || bossDefeated);
    this.rescueImage.setVisible(caged || free);
    this.rescueCryText.setVisible(false);
    this.rescueCallText.setVisible(false);
    if (!caged && !free) return;

    // The one derivation of where the sibling is, shared with the check that hands the
    // level to the next one (game/world.ts). Read per frame rather than cached in
    // `create` for the same reason that function resolves it per call.
    const spot = rescueSpot(this.world);
    const textX = spot.x - RESCUE_TEXT_OFFSET_X;

    if (!caged) {
      this.rescueImage.setPosition(spot.x, spot.y + Math.sin(animFrame * 0.05) * 2);
      this.rescueCallText
        .setVisible(animFrame % 120 < 80)
        .setPosition(textX, spot.y - RESCUE_CALL_OFFSET_Y);
      return;
    }

    this.rescueImage.setPosition(spot.x, spot.y + Math.sin(animFrame * 0.08) * 2);
    this.rescueCryText
      .setVisible(animFrame % 80 < 50)
      .setPosition(textX, spot.y - RESCUE_CRY_OFFSET_Y);

    const cageX = spot.x - CAGE_OFFSET;
    const cageY = spot.y - CAGE_OFFSET;
    fillRect(back, CAGE_BACK, cageX, cageY, CAGE_W, CAGE_H);
    // Five uprights, then the two rails in their own slightly lighter grey.
    //
    // THE LAST UPRIGHT HANGS OFF THE END, and that is not a mistake here. Five bars at
    // `cageX + i*10 + 2` land at 2, 12, 22, 32 and 42 across a cage only 40 wide, so the
    // fifth one stands 2px BEYOND the right edge and past the ends of both rails. It is
    // plainly visible in the live game and it is index.html:1747's own arithmetic; do not
    // tidy it into four bars or shrink the spacing to make it fit.
    bars.lineStyle(CAGE_BAR_WIDTH, CAGE_BAR_COLOR, 1);
    for (let i = 0; i < CAGE_BARS; i++) {
      const barX = cageX + i * CAGE_BAR_SPACING + CAGE_BAR_OFFSET_X;
      bars.lineBetween(barX, cageY, barX, cageY + CAGE_H);
    }
    bars.lineStyle(CAGE_BAR_WIDTH, CAGE_RAIL_COLOR, 1);
    bars.lineBetween(cageX, cageY, cageX + CAGE_W, cageY);
    bars.lineBetween(cageX, cageY + CAGE_H, cageX + CAGE_W, cageY + CAGE_H);
  }

  /**
   * The boss (index.html:1768-1825): one sprite, an angry glow, a scar, a health bar over
   * its head and a taunt over that.
   *
   * WHICH POSE IS A THREE-WAY PICK ON STATE, in the live source's own order, and the
   * order is what makes it readable: roaring beats charging, charging beats walking, and
   * anything else is the idle. Each pose also has its OWN WOBBLE — a sine of the free
   * clock whose frequency climbs as the boss gets more agitated (0.08 idle, 0.12 walking,
   * 0.25 roaring, 0.4 charging) — so the boss visibly winds up before it commits, which
   * is the only warning a child gets.
   *
   * The walking branch is the odd one. It fires on `|boss.vx| > 0.1 OR chargeTimer > 120`,
   * i.e. also while the boss is standing perfectly still in the last second before a
   * charge, and only THEN does `boss.frame` pick between the idle and the walk sprite. So
   * the two-frame cycle the simulation has been counting all along (BossState.frameTimer)
   * is visible in exactly one of the four states.
   *
   * The hurt flash is `hurtTimer % 4 < 2` at half alpha (index.html:1772) — two frames on,
   * two frames off, a hard strobe rather than a fade — and it covers the sprite, the glow
   * and the scar but NOT the health bar or the taunt, because the live
   * `ctx.globalAlpha = 1` sits between them (index.html:1807).
   *
   * `bfl = boss.facing > 0` flips on facing RIGHT: the boss art faces left by default,
   * the same convention the enemies use and the opposite of the player's.
   *
   * The live source's particles — roar shockwave rings, charge dust, and the explosion
   * that goes on popping after the boss is dead (index.html:1780-1788, :1823) — are not
   * here. This port has no particle system at all (see `syncPickups` above for the same
   * note about the pickup sparkles), and adding one for the boss alone is a different
   * task from the boss.
   */
  private syncBoss(): void {
    const { boss, animFrame } = this.world;
    const fx = this.bossFxGraphics;
    const bar = this.bossBarGraphics;
    fx.clear();
    bar.clear();

    if (!boss || !boss.alive) {
      this.bossImage.setVisible(false);
      this.bossTaunt.setVisible(false);
      return;
    }

    const flip = boss.facing > 0;
    const flashing = boss.hurtTimer > 0 && boss.hurtTimer % 4 < 2;
    const alpha = flashing ? 0.5 : 1;

    let pose: BossPose = 'idle';
    let wobble = Math.sin(animFrame * 0.08) * 2;
    if (boss.roarTimer > 0) {
      pose = 'roar';
      wobble = Math.sin(animFrame * 0.25) * 3;
    } else if (boss.charging) {
      pose = 'charge';
      wobble = Math.sin(animFrame * 0.4) * 4;
    } else if (Math.abs(boss.vx) > 0.1 || boss.chargeTimer > 120) {
      pose = boss.frame === 0 ? 'idle' : 'walk';
      wobble = Math.sin(animFrame * 0.12) * 2;
    }

    const drawY = boss.y + wobble;
    this.bossImage
      .setTexture(bossTextureKey(pose))
      .setPosition(boss.x, drawY)
      .setFlipX(flip)
      .setAlpha(alpha)
      .setVisible(true);

    fx.setAlpha(alpha);
    // The eyes light up at half health and grow at a quarter (index.html:1795-1800). Two
    // overlapping circles rather than one per eye: the live code draws at .65/.55 of the
    // width facing one way and .35/.45 the other, which is a pair of blobs that merge
    // into a scowl rather than two separate eyes.
    if (boss.hp <= boss.maxHp * 0.5) {
      const intensity = 0.2 + Math.sin(animFrame * 0.15) * 0.15;
      const radius = boss.hp <= boss.maxHp * 0.25 ? 8 : 5;
      const eyeY = drawY + boss.h * 0.22;
      fx.fillStyle(BOSS_EYE_COLOR, intensity);
      fx.fillCircle(boss.x + (flip ? boss.w * 0.65 : boss.w * 0.35), eyeY, radius);
      fx.fillCircle(boss.x + (flip ? boss.w * 0.55 : boss.w * 0.45), eyeY, radius);
    }
    // One short diagonal scratch, from three-quarter health onward (index.html:1803-1805).
    // Note `<` where the eye glow above uses `<=`; it is the live asymmetry.
    if (boss.hp < boss.maxHp * 0.75) {
      fx.lineStyle(1, BOSS_SCAR.color, BOSS_SCAR.alpha);
      fx.beginPath();
      fx.moveTo(boss.x + boss.w * 0.3, drawY + boss.h * 0.5);
      fx.lineTo(boss.x + boss.w * 0.4, drawY + boss.h * 0.6);
      fx.strokePath();
    }

    // The bar over its head (index.html:1808-1813) — as wide as the boss itself, and
    // positioned from `boss.y` rather than `drawY`, so it holds still while the boss
    // wobbles underneath it. That is the live code: `hbY = boss.y - 12`, with no wobble
    // term anywhere in it.
    const barY = boss.y - BOSS_BAR_OFFSET_Y;
    bar.fillStyle(BOSS_BAR_BACK, 1).fillRect(boss.x, barY, boss.w, BOSS_BAR_HEIGHT);
    bar.fillStyle(bossBarColor(boss.hp, boss.maxHp), 1);
    bar.fillRect(
      boss.x + 1,
      barY + 1,
      (boss.w - 2) * (boss.hp / boss.maxHp),
      BOSS_BAR_HEIGHT - 2,
    );
    bar.lineStyle(1, 0x000000, 1).strokeRect(boss.x, barY, boss.w, BOSS_BAR_HEIGHT);

    // The taunt (index.html:1815-1819): one of three phrases, on for 100 frames out of
    // every 180 and off for the other 80, advancing to the next phrase each cycle. Both
    // numbers come off the same free-running clock, so it is on screen more than half the
    // time — the boss is meant to be mouthy.
    const showTaunt = animFrame % 180 < 100;
    this.bossTaunt.setVisible(showTaunt);
    if (showTaunt) {
      const phrases = T('boss_taunt');
      const list = Array.isArray(phrases) ? phrases : [phrases];
      const index = Math.floor(animFrame / 180) % list.length;
      this.bossTaunt
        .setText(list[index])
        .setPosition(boss.x + boss.w / 2, boss.y - BOSS_TAUNT_OFFSET_Y);
    }
  }

  /**
   * Fireballs (index.html:1827-1828) — the boss's and the cannon's, drawn by the same
   * pool because the live draw code does not distinguish them.
   *
   * NEVER FLIPPED, unlike every other projectile in the game: the live call passes a
   * literal `false` for the flip, so a fireball travelling left draws the same way round
   * as one travelling right. The 4x4 trail behind it is what shows the direction instead.
   *
   * The flicker is a sine of `animFrame` OFFSET BY THE FIREBALL'S OWN X, exactly like the
   * enemy wobble, so two fireballs from one volley pulse out of phase with each other
   * rather than as a single flashing pair.
   *
   * The trail goes on `arrowTrailGraphics`, which `syncArrows` CLEARS — so this must run
   * before it, and it does (see `syncSprites`). One Graphics for both kinds of trail
   * because they are the same kind of thing drawn a few depth bands apart, and a Graphics
   * has one depth: the fireball's smear therefore sits at the arrow trail's depth rather
   * than at its own, which is invisible in practice (nothing is ever between them) and
   * the alternative is a second Graphics for four pixels.
   */
  private syncEnemyProjectiles(): void {
    const { enemyProjectiles, animFrame } = this.world;
    const trails = this.arrowTrailGraphics;

    for (let i = 0; i < enemyProjectiles.length; i++) {
      const shot = enemyProjectiles[i];
      const image = this.pooledImage(
        this.fireballImages,
        i,
        FIREBALL_TEXTURE,
        DEPTH_ENEMY_PROJECTILE,
      );
      const flicker = Math.sin(animFrame * 0.3 + shot.x) * 0.3;
      image
        .setPosition(shot.x, shot.y)
        .setAlpha(0.8 + flicker * 0.2)
        .setVisible(true);
      const trailX = shot.vx > 0 ? shot.x - 4 : shot.x + 10;
      fillRect(trails, FIREBALL_TRAIL, trailX, shot.y + 2, 4, 4);
    }
    hideSurplus(this.fireballImages, enemyProjectiles.length);
  }

  /**
   * Arrows and chicken rays (index.html:1831-1834). One pool for both: the same slot
   * draws an arrow one frame and a chicken the next as the list shifts, so the
   * texture is set per frame rather than at creation.
   *
   * The two differ in more than the sprite. The chicken is lifted 4px
   * (`a.y-4`), draws at 1.5 to the arrow's 2, and trails a 4x3 yellow smear at y;
   * the arrow trails a 6x2 orange one at y+1. Both trails sit BEHIND the direction of
   * travel, which is why the x offset flips with `a.vx` — and the two offsets are not
   * mirror images of each other (`-4`/`+12` against `-6`/`+14`), because the sprite's
   * own width differs on each side.
   */
  private syncArrows(): void {
    const { arrows } = this.world;
    const trails = this.arrowTrailGraphics;
    trails.clear();

    for (let i = 0; i < arrows.length; i++) {
      const arrow = arrows[i];
      const texture = arrow.isChicken ? CHICKEN_ARROW_TEXTURE : ARROW_TEXTURE;
      const image = this.pooledImage(this.arrowImages, i, texture, DEPTH_ARROW);
      image.setTexture(texture).setVisible(true).setFlipX(arrow.vx < 0);

      if (arrow.isChicken) {
        image.setPosition(arrow.x, arrow.y - 4);
        const x = arrow.vx > 0 ? arrow.x - 4 : arrow.x + 12;
        fillRect(trails, CHICKEN_TRAIL, x, arrow.y, 4, 3);
      } else {
        image.setPosition(arrow.x, arrow.y);
        const x = arrow.vx > 0 ? arrow.x - 6 : arrow.x + 14;
        fillRect(trails, ARROW_TRAIL, x, arrow.y + 1, 6, 2);
      }
    }
    hideSurplus(this.arrowImages, arrows.length);
  }

  /**
   * The player, their cape and their big head (index.html:1838-1848).
   *
   * All three are inside ONE gate: `p.invincible<=0||Math.floor(animFrame/3)%2===0`.
   * While the window a cape bought is running, the player does not flash a different
   * colour — they are simply not drawn, for three frames out of every six, cape and
   * all.
   *
   * The big head is not the player scaled up. It is the sprite cut in half: the top
   * `bigHeadRows` rows drawn at BIG_HEAD_SCALE, the rest still at PLAYER_SCALE, with
   * the body dropped by the head's original height so its feet stay put and the head
   * centred over it and lifted clear. Those two halves are pre-baked textures — see
   * registerPlayerTextures in gfx/textures.ts for why they are not sliced here.
   */
  private syncPlayer(): void {
    const { player, animFrame } = this.world;
    const drawn = player.invincible <= 0 || Math.floor(animFrame / 3) % 2 === 0;
    const bigHead = player.bigHeadTimer > 0;
    const flip = player.facing < 0;

    // The cape hangs off the BACK, so its x offset swaps with facing — and the two
    // offsets are measured from opposite edges (index.html:1839).
    this.capeImage.setVisible(drawn && player.hasCape);
    if (drawn && player.hasCape) {
      const x = player.facing > 0 ? player.x - 8 : player.x + player.w - 4;
      const wobble = Math.sin(animFrame * 0.15) * 2;
      this.capeImage.setPosition(x, player.y + 6 + wobble).setFlipX(flip);
    }

    this.playerImage.setTexture(resolvePlayerTextureKey(player.frame));
    this.playerImage.setPosition(player.x - PLAYER_DRAW_INSET, player.y - PLAYER_DRAW_INSET);
    // Sprites face right by default; flip to face left (index.html:1848: `p.facing<0`).
    this.playerImage.setFlipX(flip);
    this.playerImage.setVisible(drawn && !bigHead);

    this.bodyImage.setVisible(drawn && bigHead);
    this.headImage.setVisible(drawn && bigHead);
    if (!bigHead) return;

    const [character, skinIndex] = currentSkin();
    const pose = PLAYER_POSES[player.frame];
    const sprite = resolvePlayerSprite(player.frame);
    const headRows = bigHeadRows(sprite);
    const columns = sprite[0].length;

    const bodyX = player.x - PLAYER_DRAW_INSET;
    const bodyY = player.y - PLAYER_DRAW_INSET + headRows * PLAYER_SCALE;
    this.bodyImage
      .setTexture(playerBodyTextureKey(character, skinIndex, pose))
      .setPosition(bodyX, bodyY)
      .setFlipX(flip);

    this.headImage
      .setTexture(playerHeadTextureKey(character, skinIndex, pose))
      .setPosition(
        bodyX + (columns * PLAYER_SCALE - columns * BIG_HEAD_SCALE) / 2,
        bodyY - headRows * BIG_HEAD_SCALE,
      )
      .setFlipX(flip);
  }

  /**
   * `world.enemies` starts empty and grows as the camera streams the level in — three
   * enemies already exist after the very first simulation step (doll@15, doll@28 and
   * car@40 all fall inside the 640px-wide spawn window at camera x=0), and more stream
   * in later. Images are created lazily, one per new array slot, rather than assuming
   * any fixed count up front. Whatever state it is created in is overwritten
   * immediately by `syncEnemyImage` right below, in the same pass.
   */
  private createEnemyImage(enemy: EnemyState): Phaser.GameObjects.Image {
    return this.add
      .image(enemy.x, enemy.y, enemyTextureKey(enemy.type))
      .setOrigin(0, 0)
      .setDepth(DEPTH_ENEMY);
  }

  /**
   * Port of the enemy branch of index.html:1759-1763. `fl = e.vx>0` — enemy sprites
   * face left by default (the opposite of the player's convention above), so the
   * flip is on moving RIGHT, not left. For a GHOST that flip is the only thing `vx`
   * is for: the simulation writes it ±0.1 every frame purely so this line turns the
   * sprite toward the player (game/enemy.ts).
   */
  private syncEnemyImage(image: Phaser.GameObjects.Image, enemy: EnemyState, animFrame: number): void {
    // Re-resolved every frame, not set once at creation, because an enemy's TYPE can
    // change under it: a chicken ray rewrites `e.type` to 'chicken' (game/enemy.ts's
    // chickenify), and the live game looks the sprite up by type on every frame it
    // draws (index.html:1760's `getEnemySpriteInfo(e.type)`). Fix the texture at
    // creation instead and a converted doll goes on being a doll for ever.
    image.setTexture(enemyTextureKey(enemy.type));
    image.setFlipX(enemy.vx > 0);

    if (!enemy.alive) {
      if (enemy.squashTimer <= 0) {
        image.setVisible(false);
        return;
      }
      // Squashed: flattened to 30% height, dropped so the flattened image still sits
      // on the ground it died on, fading out over the same half-second the squash
      // timer counts down from (index.html:1762). `setOrigin(0,0)` (set at creation)
      // makes `y` the sprite's top edge, so scaling Y down from there is the same
      // squash-toward-the-top the live canvas gets from
      // `ctx.translate(e.x,e.y+e.h*.7);ctx.scale(1,.3)`.
      image.setVisible(true);
      image.setPosition(enemy.x, enemy.y + enemy.h * 0.7);
      image.setScale(1, 0.3);
      image.setAlpha(enemy.squashTimer / 30);
      return;
    }

    // Alive: a per-enemy vertical wobble driven by the free-running animFrame counter
    // plus its own x, so enemies bob out of sync with each other (index.html:1763).
    // This is draw-time-only, same as the live game — it is never stored in the
    // simulation.
    const wobble = Math.sin(animFrame * 0.15 + enemy.x);
    image.setVisible(true);
    image.setScale(1, 1);
    // A living GHOST is translucent and breathes (index.html:1761): `.6 + sin(f*.08)*.2`,
    // so it runs between 0.4 and 0.8 and never reaches solid. Off the SHARED animFrame
    // with no per-ghost offset, exactly like its drift, so every ghost on screen pulses
    // together. Everything else draws at 1.
    image.setAlpha(enemy.type === 'ghost' ? 0.6 + Math.sin(animFrame * 0.08) * 0.2 : 1);
    image.setPosition(enemy.x, enemy.y + wobble);
  }

  /**
   * The cannon's muzzle flash (index.html:1764) — see CANNON_FLASH above for why it is a
   * flash and not a warning, and for the live quirk that can make a newly spawned cannon
   * show one before its first shot.
   *
   * Aimed at the PLAYER's current side, re-evaluated every frame it is drawn, not at the
   * side the shot actually went: the live line reads `player.x > e.x` here, independently
   * of the `dir` the simulation used when it fired. Walk past a cannon in the four frames
   * after it shoots and its flash swaps sides while the fireball carries on the other way.
   * Faithful, and quite visible if you look for it.
   */
  private drawCannonFlash(enemy: EnemyState): void {
    if (enemy.type !== 'cannon' || !enemy.alive) return;
    if (enemy.shootTimer <= enemy.shootInterval - CANNON_FLASH_FRAMES) return;
    const dir = this.world.player.x > enemy.x ? 1 : -1;
    fillCircle(
      this.enemyFxGraphics,
      CANNON_FLASH,
      enemy.x + enemy.w / 2 + dir * CANNON_FLASH_OFFSET_X,
      enemy.y + enemy.h / 2,
      CANNON_FLASH_RADIUS,
    );
  }
}

/**
 * Resolves the texture key for the player's current pose, mirroring the character
 * and skin lookup `getPlayerSprites` itself does (game/run.ts:116-123) rather than
 * calling it: that function returns resolved sprite/palette data for the canvas
 * pipeline, but every combination it could return was already rasterised once, at
 * boot, by `registerTextures` — so this only needs the same character/skin lookup to
 * pick the matching pre-baked key, not the sprite data behind it.
 */
function resolvePlayerTextureKey(frame: number): string {
  return playerTextureKey(...currentSkin(), PLAYER_POSES[frame]);
}

/** Who is being played and in which skin — the lookup the keys above are built from. */
function currentSkin(): [Character, number] {
  const character = getSelectedChar();
  return [character, getSkinIndex(character)];
}

/**
 * The sibling's standing sprite, as a texture key.
 *
 * gfx/textures.ts registers no rescue texture of its own, and its comment says why: the
 * sibling is the OTHER character's player art at the same scale 2 the player draws at
 * (index.html:1744, :1754, both `drawSprite(rsSpr.sprite,...,2,false)`), so
 * `registerPlayerTextures` has already baked it — both characters, every skin. Verified
 * against that function rather than taken on trust; it really does walk `CHARACTERS`,
 * not just the selected one.
 *
 * Which character that is comes from `getRescueSprites`, the one place the "always the
 * other one" rule is written (game/run.ts), and the skin from `getSkinIndex`, which
 * holds a skin per character whether or not they are the one being played — so the
 * sibling wears the outfit the character screen picked for them.
 */
function rescueTextureKey(): string {
  const { character } = getRescueSprites();
  return playerTextureKey(character, getSkinIndex(character), 'stand');
}

/**
 * The sprite GRID behind the current pose, which the big head needs as well as the
 * texture: its two halves are placed from the sprite's row and column counts
 * (index.html:1842-1845), and those are a property of the art, not of the texture
 * key. Written as the live game's own three-way pick (index.html:1838) rather than
 * indexing an array, so it allocates nothing on a frame.
 */
function resolvePlayerSprite(frame: number): SpriteData {
  const sprites = getPlayerSprites();
  if (frame === 0) return sprites.stand;
  if (frame === 1) return sprites.run;
  return sprites.jump;
}

/** Parks every image in a pool from `used` onwards — see `pooledImage`. */
function hideSurplus(pool: readonly Phaser.GameObjects.Image[], used: number): void {
  for (let i = used; i < pool.length; i++) pool[i].setVisible(false);
}

interface Tint {
  readonly color: number;
  readonly alpha: number;
}

/** `ctx.fillStyle='rgba(...)'; ctx.arc(...); ctx.fill()`, as Graphics takes it. */
function fillCircle(g: Phaser.GameObjects.Graphics, tint: Tint, x: number, y: number, r: number): void {
  g.fillStyle(tint.color, tint.alpha).fillCircle(x, y, r);
}

/** `ctx.fillStyle='rgba(...)'; ctx.fillRect(...)`, as Graphics takes it. */
function fillRect(
  g: Phaser.GameObjects.Graphics,
  tint: Tint,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  g.fillStyle(tint.color, tint.alpha).fillRect(x, y, w, h);
}
