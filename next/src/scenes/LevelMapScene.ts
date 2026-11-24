import Phaser from 'phaser';
import { getCurrentTheme, startBGM } from '../audio/bgm';
import { sfxPickup } from '../audio/sfx';
import { BASE_H, BASE_W } from '../config/constants';
import { prompt } from '../config/glyphs';
import { TStr } from '../config/i18n';
import { BGM_TITLE } from '../data/bgmThemes';
import { STAGES } from '../data/stages';
import { createFrameClock, type FrameClock } from '../game/frameClock';
import { mapOpensOn, stageAt, worldLevels } from '../game/levelPick';
import { clampIndex } from '../game/menu';
import { getSelectedChar, getSkinIndex, pickedStage, startPicked } from '../game/run';
import { villainOf, worldKey, worlds } from '../game/story';
import { GAME_FONT_BOLD, GAME_TEXT_RESOLUTION } from '../gfx/gameFont';
import { fitScreenCamera } from '../gfx/render';
import {
  menuPlayerTextureKey, MENU_PREVIEW_SCALE, registerMenuTextures, registerTextures, VILLAIN_TEXTURES,
} from '../gfx/textures';
import { WORLD_MAP_DEPTH, WorldMap } from '../gfx/worldMap';
import { bindMenuKeys, justDown, type MenuKeys, pressedAny } from '../input/menuKeys';
import { LEVEL_MAP_SCENE_KEY, SLICE_SCENE_KEY } from './keys';
import { takeBack } from './navigate';

/** The mode screen's sky and grass. */
const SKY = '#88ccff';
const GROUND_COLOR = 0x44aa44;
const GROUND_EDGE_COLOR = 0x2d8a2d;
const GROUND_H = 60;
const GROUND_Y = BASE_H - GROUND_H;
const GROUND_EDGE_H = 4;
const HEADING_Y = 62;
const HEADING_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '26px', color: '#e03030',
};
const HINT_Y = BASE_H - 14;
const HINT_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '12px', color: '#ffdd00',
};
/** The menu's hero picture is baked at twice size; this draws it the cutscene's size on the map. */
const HERO_SCALE = 0.8;
/** A third of a second from one world to the next. */
const WALK_FRAMES = 20;

/** The box of a world's levels, over the map. */
const BOX_DEPTH = WORLD_MAP_DEPTH + 2;
const BOX = { x: 80, y: 102, w: 480, h: 208 };
const BOX_TITLE_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '18px', color: '#5a3a1a',
};
const CARD_W = 136;
const CARD_H = 116;
const CARD_GAP = 16;
const CARD_Y = BOX.y + 68;
const NAME_STRIP = 30;
const FACE_Y = 44;
const FACE_PX = 56;
const NUMBER_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '40px', color: '#ffffff',
  stroke: '#000000', strokeThickness: 5,
};
const NAME_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '11px', color: '#ffffff',
  align: 'center', wordWrap: { width: CARD_W - 8 },
};
const ARROW_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '16px', color: '#ffd23f',
  stroke: '#5a3a1a', strokeThickness: 3,
};

/**
 * The level map (docs/superpowers/specs/2026-11-24-level-pick-design.md): the story's world map
 * over the menu's sky, the hero walking from world to world on ◀ ▶; OK opens a box of that
 * world's three levels, each in its own colour, the fight with its villain's face; OK on one
 * plays it on its own (game/run.ts's `startPicked`), and the level's end comes back here.
 * What the map decides is in game/levelPick.ts.
 */
export class LevelMapScene extends Phaser.Scene {
  private clock!: FrameClock;
  private keys!: MenuKeys;
  private map!: WorldMap;
  private hint!: Phaser.GameObjects.Text;
  /** The world the hero stands on, or is walking to. */
  private world = 0;
  /** A press made while the hero walks: -1, 1, or 0 for none. Walked when they arrive. */
  private queued = 0;
  private card = 0;
  private box?: Phaser.GameObjects.Container;
  private cardEdges?: Phaser.GameObjects.Graphics;
  private cardArrow?: Phaser.GameObjects.Text;
  private cardX0 = 0;
  private leaving = false;

  constructor() {
    super(LEVEL_MAP_SCENE_KEY);
  }

  init(): void {
    this.leaving = false;
    this.queued = 0;
    this.card = 0;
    this.box = undefined;
    this.cardEdges = undefined;
    this.cardArrow = undefined;
    this.world = mapOpensOn(pickedStage());
  }

  create(): void {
    fitScreenCamera(this);
    registerMenuTextures(this);
    // The villains' faces, which a level registers too: the map must not depend on one having run.
    registerTextures(this);
    // The menu's tune: still playing when the hero screen hands over, started again after a level.
    if (getCurrentTheme() !== BGM_TITLE) startBGM(BGM_TITLE);
    this.cameras.main.setBackgroundColor(SKY);
    this.add.graphics().fillStyle(GROUND_COLOR).fillRect(0, GROUND_Y, BASE_W, GROUND_H)
      .fillStyle(GROUND_EDGE_COLOR).fillRect(0, GROUND_Y, BASE_W, GROUND_EDGE_H);
    this.add.text(BASE_W / 2, HEADING_Y, TStr('mode_pick'), HEADING_FONT).setOrigin(0.5, 1);

    const hero = getSelectedChar();
    this.map = new WorldMap(this, {
      done: 0, from: this.world, to: this.world,
      hero: menuPlayerTextureKey(hero, getSkinIndex(hero), MENU_PREVIEW_SCALE),
      heroScale: HERO_SCALE, dim: false,
    }).setVisible(true);
    this.hint = this.add.text(BASE_W / 2, HINT_Y, prompt('prompt_map_world'), HINT_FONT)
      .setOrigin(0.5, 1).setDepth(BOX_DEPTH + 1);
    this.clock = createFrameClock();
    this.keys = bindMenuKeys(this);
  }

  update(_time: number, delta: number): void {
    const t = this.clock.advance(delta);
    this.map.update(t);
    this.cardArrow?.setY(CARD_Y - 6 + Math.sin(t * 0.15) * 3);
    if (this.leaving) return;
    // Every key read every frame: an edge left unread fires on a later frame (input/menuKeys.ts).
    const left = pressedAny(this.keys.left, this.keys.altLeft);
    const right = pressedAny(this.keys.right, this.keys.altRight);
    const confirm = pressedAny(this.keys.confirm, this.keys.enter);
    const back = justDown(this.keys.back);
    const step = right ? 1 : left ? -1 : 0;
    if (this.box) this.inBox(step, confirm, back);
    else this.onMap(t, step, confirm, back);
  }

  private onMap(t: number, step: number, confirm: boolean, back: boolean): void {
    if (step !== 0) this.queued = step;
    if (this.queued !== 0 && !this.map.walking(t)) {
      const next = clampIndex(this.world, this.queued, worlds().length);
      this.queued = 0;
      if (next !== this.world) {
        this.world = next;
        this.map.walkTo(next, t, WALK_FRAMES);
      }
    }
    if (confirm) {
      this.openBox();
    } else if (back) {
      this.leaving = true;
      takeBack(this, 'levelmap');
    }
  }

  private inBox(step: number, confirm: boolean, back: boolean): void {
    if (step !== 0) {
      const next = clampIndex(this.card, step, worldLevels()[this.world].length);
      if (next !== this.card) {
        this.card = next;
        this.drawCards();
      }
    }
    if (confirm) {
      this.leaving = true;
      sfxPickup();
      startPicked(stageAt(this.world, this.card));
      this.scene.start(SLICE_SCENE_KEY);
    } else if (back) {
      this.closeBox();
    }
  }

  /** The world's levels, as cards: each in its level's colour, its name under it. */
  private openBox(): void {
    sfxPickup();
    this.queued = 0;
    this.card = 0;
    const levels = worldLevels()[this.world];
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.45).fillRect(0, 0, BASE_W, BASE_H);
    g.fillStyle(0x000000, 0.25).fillRoundedRect(BOX.x + 4, BOX.y + 5, BOX.w, BOX.h, 12);
    g.fillStyle(0xf4e6c8).fillRoundedRect(BOX.x, BOX.y, BOX.w, BOX.h, 12);
    g.lineStyle(3, 0x8a6a3a).strokeRoundedRect(BOX.x, BOX.y, BOX.w, BOX.h, 12);
    const parts: Phaser.GameObjects.GameObject[] = [g];
    parts.push(this.add.text(BASE_W / 2, BOX.y + 32, `${this.world + 1}. ${TStr(worldKey(this.world))}`, BOX_TITLE_FONT)
      .setOrigin(0.5, 1));
    const row = levels.length * CARD_W + (levels.length - 1) * CARD_GAP;
    this.cardX0 = (BASE_W - row) / 2;
    levels.forEach((stageIndex, i) => {
      const stage = STAGES[stageIndex];
      const x = this.cardX0 + i * (CARD_W + CARD_GAP);
      const mid = x + CARD_W / 2;
      const card = this.add.graphics();
      card.fillStyle(Phaser.Display.Color.HexStringToColor(stage.level.bg).color).fillRect(x, CARD_Y, CARD_W, CARD_H);
      card.fillStyle(0x000000, 0.55).fillRect(x, CARD_Y + CARD_H - NAME_STRIP, CARD_W, NAME_STRIP);
      parts.push(card);
      // The fight shows who it is against; the other two, their number.
      const villain = stage.level.ending === 'boss' ? stage.level.course?.boss?.kind ?? villainOf(stage.theme) : null;
      if (villain) {
        const face = this.add.image(mid, CARD_Y + FACE_Y, VILLAIN_TEXTURES[villain]);
        parts.push(face.setScale(Math.min(FACE_PX / face.height, (FACE_PX + 16) / face.width)));
      } else {
        parts.push(this.add.text(mid, CARD_Y + FACE_Y, String(i + 1), NUMBER_FONT).setOrigin(0.5, 0.5));
      }
      parts.push(this.add.text(mid, CARD_Y + CARD_H - NAME_STRIP / 2, TStr(stage.nameKey), NAME_FONT).setOrigin(0.5, 0.5));
    });
    this.cardEdges = this.add.graphics();
    this.cardArrow = this.add.text(0, CARD_Y - 6, '▼', ARROW_FONT).setOrigin(0.5, 1);
    parts.push(this.cardEdges, this.cardArrow);
    this.box = this.add.container(0, 0, parts).setDepth(BOX_DEPTH);
    this.drawCards();
    this.hint.setText(prompt('prompt_map_level'));
  }

  private closeBox(): void {
    sfxPickup();
    this.box?.destroy();
    this.box = undefined;
    this.cardEdges = undefined;
    this.cardArrow = undefined;
    this.hint.setText(prompt('prompt_map_world'));
  }

  /** The chosen card: a thick yellow edge and the arrow over it; the others a thin white one. */
  private drawCards(): void {
    if (!this.cardEdges) return;
    this.cardEdges.clear();
    const count = worldLevels()[this.world].length;
    for (let i = 0; i < count; i++) {
      const x = this.cardX0 + i * (CARD_W + CARD_GAP);
      const chosen = i === this.card;
      const grow = chosen ? 3 : 0;
      this.cardEdges.lineStyle(chosen ? 4 : 2, chosen ? 0xffd23f : 0xffffff, chosen ? 1 : 0.8)
        .strokeRect(x - grow, CARD_Y - grow, CARD_W + grow * 2, CARD_H + grow * 2);
    }
    this.cardArrow?.setX(this.cardX0 + this.card * (CARD_W + CARD_GAP) + CARD_W / 2);
  }
}
