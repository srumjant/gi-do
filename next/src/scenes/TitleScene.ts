import Phaser from 'phaser';
import { startBGM } from '../audio/bgm';
import { ensureAudio } from '../audio/context';
import { BASE_H, BASE_W } from '../config/constants';
import { TStr } from '../config/i18n';
import { BGM_TITLE } from '../data/bgmThemes';
import { createFrameClock, type FrameClock } from '../game/frameClock';
import { MODE_ADVENTURE } from '../game/navigation';
import { getSkinIndex } from '../game/run';
import {
  cloudTextureKey,
  registerScaledPlayerTextures,
  registerTitleTextures,
  scaledPlayerTextureKey,
  type TitleCastMember,
  titleTextureKey,
  TITLE_CLOUD_SCALE,
} from '../gfx/textures';
import { bindMenuKeys, type MenuKeys, pressedAny } from '../input/menuKeys';
import { MODE_SELECT_SCENE_KEY, TITLE_SCENE_KEY } from './keys';
import type { ModeSelectData } from './ModeSelectScene';

/** index.html:1938-1939. Sky, a band of grass, and a darker line along the top of it. */
const SKY = '#88ccff';
const GROUND_COLOR = 0x44aa44;
const GROUND_EDGE_COLOR = 0x2d8a2d;
const GROUND_H = 60;
const GROUND_Y = BASE_H - GROUND_H;
const GROUND_EDGE_H = 4;

/** index.html:1940. Four of them, each drawn 24 left of its listed centre, at alpha .85. */
const CLOUD_X = [80, 200, 400, 520];
const CLOUD_DX = -24;
const CLOUD_Y = 52;
const CLOUD_ALPHA = 0.85;

/** index.html:1941-1943, :1956, :1961 — five centred lines above the two heroes. */
const TITLE_Y = 120;
const SUBTITLE_Y = 150;
const WORLDS_Y = 172;
const CONTROLS_Y = 195;
const MODES_Y = 210;
const TITLE_FONT = {
  fontFamily: 'monospace', fontSize: '36px', fontStyle: 'bold', color: '#e03030',
};
const SUBTITLE_FONT = { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' };
const WORLDS_FONT = { fontFamily: 'monospace', fontSize: '11px', color: '#dddddd' };
const CONTROLS_FONT = { fontFamily: 'monospace', fontSize: '10px', color: '#333333' };
const MODES_FONT = {
  fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color: '#64ff96',
};

/** index.html:1955. The one that blinks, and the reason the screen does not look frozen. */
const START_Y = BASE_H - 15;
const START_FONT = {
  fontFamily: 'monospace', fontSize: '16px', fontStyle: 'bold', color: '#ffdd00',
};
/** `Math.floor(animFrame/30)%2===0` — half a second on, half a second off. */
const BLINK_FRAMES = 30;

/** index.html:1959-1960. A slow pulse between alpha 0.3 and 0.9, not a blink. */
const MODES_PULSE_BASE = 0.6;
const MODES_PULSE_SWING = 0.3;
const MODES_PULSE_SPEED = 0.06;

/** index.html:1944-1946. Both stand ON the grass, so both are placed by their feet. */
const HERO_SCALE = 3;
const GIGI_X = BASE_W / 2 - 50;
const DODO_X = BASE_W / 2 + 15;

/** index.html:1947. The bob every loitering creature shares. */
const BOB_SPEED = 0.05;
const BOB_AMPLITUDE = 3;

/**
 * One of the seven creatures along the bottom (index.html:1948-1954).
 *
 * `standing` ones are placed by their feet on the grass; the two that fly are placed by
 * their top edge at a fixed height, which is how the live game writes them — it subtracts
 * the sprite height for the first kind and not for the second.
 *
 * `bob` is which of the three the creature does: none, the shared sine, or its absolute
 * value, which turns a hover into a hop (the bouncer, :1949).
 */
interface Loiterer {
  type: TitleCastMember;
  x: number;
  y: number;
  standing: boolean;
  bob: 'none' | 'sine' | 'hop';
  flip?: boolean;
  alpha?: number;
}

const LOITERERS: readonly Loiterer[] = [
  { type: 'doll', x: 40, y: GROUND_Y, standing: true, bob: 'sine' },
  { type: 'bouncer', x: 90, y: GROUND_Y, standing: true, bob: 'hop' },
  // :1950. Hovering, half-transparent, and the only one placed by its top edge on the left.
  { type: 'ghost', x: 140, y: BASE_H - 90, standing: false, bob: 'sine', alpha: 0.7 },
  { type: 'car', x: 440, y: GROUND_Y, standing: true, bob: 'none' },
  { type: 'cannon', x: 490, y: GROUND_Y, standing: true, bob: 'none' },
  { type: 'bat', x: 530, y: BASE_H - 85, standing: false, bob: 'sine', flip: true },
  { type: 'dino', x: 570, y: GROUND_Y, standing: true, bob: 'sine', flip: true },
];

/**
 * The first screen of the game. Port of `drawTitle` (index.html:1937-1963) and the input
 * that drives it (:1312-1317).
 *
 * It boots, which is the point of it. Until now this port started on the difficulty screen —
 * a list of four words and no way to know what the game was — because the title had not been
 * written yet, and a child who opened it was already halfway into a run before anything had
 * said hello.
 *
 * ## Where the sound comes from
 *
 * A browser will not start an AudioContext outside a user gesture, so every sound in the
 * game — the jump, the coin, all six level themes — waits on one keypress. The live game
 * spends that keypress here, on the title's confirm (index.html:1313's `ensureAudio();
 * startBGM(BGM_TITLE);`), and so does this port now. DifficultyScene held those two lines
 * while it was the boot screen and its comment said it would hand them over when the title
 * landed; this is that.
 *
 * It is the right screen for it because it is the one screen nobody can get past without
 * confirming. Every route into the rest of the game goes through this button, including both
 * ends of a finished run — the game-over and win screens come back HERE (index.html:1349,
 * :1352), not to the menus behind it — so there is no way to be deep in the game with the
 * context still locked.
 *
 * ## What is NOT drawn
 *
 * index.html:1957 prints `L = English   F = kangas` along the bottom: the language toggle and
 * the felt art style. This port has neither key, so the line is left out rather than
 * advertising two buttons that do nothing. It goes back in with whichever plan adds them.
 */
export class TitleScene extends Phaser.Scene {
  private clock!: FrameClock;
  private keys!: MenuKeys;
  private leaving = false;
  private start!: Phaser.GameObjects.Text;
  private modes!: Phaser.GameObjects.Text;
  private creatures: Phaser.GameObjects.Image[] = [];

  constructor() {
    super(TITLE_SCENE_KEY);
  }

  create(): void {
    this.leaving = false;
    this.creatures = [];
    registerTitleTextures(this);
    registerScaledPlayerTextures(this, [['stand', HERO_SCALE]]);
    this.cameras.main.setBackgroundColor(SKY);

    this.add
      .graphics()
      .fillStyle(GROUND_COLOR)
      .fillRect(0, GROUND_Y, BASE_W, GROUND_H)
      .fillStyle(GROUND_EDGE_COLOR)
      .fillRect(0, GROUND_Y, BASE_W, GROUND_EDGE_H);

    for (const x of CLOUD_X) {
      this.add
        .image(x + CLOUD_DX, CLOUD_Y, cloudTextureKey(TITLE_CLOUD_SCALE))
        .setOrigin(0, 0)
        .setAlpha(CLOUD_ALPHA);
    }

    this.line(TITLE_Y, TITLE_FONT, TStr('title'));
    this.line(SUBTITLE_Y, SUBTITLE_FONT, TStr('subtitle'));
    this.line(WORLDS_Y, WORLDS_FONT, TStr('worlds'));
    this.line(CONTROLS_Y, CONTROLS_FONT, TStr('controls'));
    // index.html:1961. Both modes are named under the title now that neither is behind a
    // hidden hotkey — the live comment at :1958 says exactly that.
    this.modes = this.line(MODES_Y, MODES_FONT, `🎮 ${TStr('mode_adventure')}   📚 ${TStr('mode_learn')}`);

    // index.html:1944-1946. Gigi is drawn from the bare GIGI_STAND constant — the Classic
    // skin, whichever skin was last chosen — while Dodo is drawn from the chosen one. That
    // asymmetry is in the live source and is reproduced rather than tidied: this screen is
    // the one the children know by heart.
    this.hero(GIGI_X, 'gigi', 0);
    this.hero(DODO_X, 'dodo', getSkinIndex('dodo'));

    for (const loiterer of LOITERERS) {
      this.creatures.push(
        this.add
          .image(loiterer.x, loiterer.y, titleTextureKey(loiterer.type))
          // Standing ones are anchored by their feet, which is the live
          // `y - spriteH(spr, 2)` said the other way round; the two fliers by their top edge.
          .setOrigin(0, loiterer.standing ? 1 : 0)
          .setFlipX(loiterer.flip === true)
          .setAlpha(loiterer.alpha ?? 1),
      );
    }

    // `press_start` carries a `{A}` that resolves to the connected controller's confirm
    // glyph — Ⓐ, ✕ or Ⓑ depending on what is plugged in (config/glyphs.ts). Resolved here,
    // once, which is the whole reason the resolver is installed at boot rather than by a
    // scene: this is the first string in the game that needs it.
    this.start = this.line(START_Y, START_FONT, TStr('press_start'));

    this.clock = createFrameClock();
    this.keys = bindMenuKeys(this);
  }

  private line(
    y: number,
    style: Phaser.Types.GameObjects.Text.TextStyle,
    text: string,
  ): Phaser.GameObjects.Text {
    return this.add.text(BASE_W / 2, y, text, style).setOrigin(0.5, 1);
  }

  /** One of the two on the grass, standing on it. */
  private hero(x: number, character: 'gigi' | 'dodo', skinIndex: number): void {
    this.add
      .image(x, GROUND_Y, scaledPlayerTextureKey(character, skinIndex, 'stand', HERO_SCALE))
      .setOrigin(0, 1);
  }

  /**
   * No Escape here, and nothing to bind it to. `title` is the root of the navigation table
   * (game/navigation.ts): it has no `BACK_TARGET` row, so `backFrom('title')` is the one
   * state in the game that answers "nowhere to go" — the live `handleBack` returning false
   * (index.html:1267). A key that provably does nothing is not worth binding.
   */
  update(_time: number, delta: number): void {
    const t = this.clock.advance(delta);

    // index.html:1947. One sine for the whole cast, so they bob together.
    const bob = Math.sin(t * BOB_SPEED) * BOB_AMPLITUDE;
    LOITERERS.forEach((loiterer, i) => {
      const dy = loiterer.bob === 'none' ? 0 : loiterer.bob === 'hop' ? Math.abs(bob) : bob;
      this.creatures[i].setY(loiterer.y + dy);
    });

    this.start.setVisible(Math.floor(t / BLINK_FRAMES) % 2 === 0);
    this.modes.setAlpha(MODES_PULSE_BASE + Math.sin(t * MODES_PULSE_SPEED) * MODES_PULSE_SWING);

    if (this.leaving) return;
    if (pressedAny(this.keys.confirm, this.keys.enter)) this.confirm();
  }

  /**
   * index.html:1313, in the live order: open the audio context, start the menu theme, then
   * go. `BGM_TITLE` plays across mode select, the difficulty screen and the character screen
   * alike, and is replaced by the level's own theme when a level starts.
   *
   * `modeIndex` goes across as ADVENTURE because the live line sets `modeIndex=0` outright.
   * Coming back to mode select from elsewhere can ask for the other card — that is what
   * `modeCursorFor` is for — but arriving from the title always lands on the game.
   */
  private confirm(): void {
    this.leaving = true;
    ensureAudio();
    startBGM(BGM_TITLE);
    this.scene.start(MODE_SELECT_SCENE_KEY, { index: MODE_ADVENTURE } satisfies ModeSelectData);
  }
}
