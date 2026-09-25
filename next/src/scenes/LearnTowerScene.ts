import Phaser from 'phaser';
import { playCue } from '../audio/cues';
import { STEP_MS, TILE } from '../config/constants';
import { createClimb, stepClimb } from '../game/learn/climb';
import type { LearnMode } from '../game/learn/content';
import {
  LEARN_ZOOM, MAP_COLS, settleCenter, starBox, storeyView, T_EMPTY, towerTileFaces, WALL,
} from '../game/learn/tower';
import type { Climb, ClimbEvent, ClimbMove } from '../game/learn/types';
import type { Character } from '../game/player';
import { getSelectedChar, getSkinIndex } from '../game/run';
import { blockTextureKey, LEARN_TILES_KEY, registerLearnTiles, toPhaserData } from '../gfx/learnTiles';
import { playerTextureKey, registerTextures, STAR_TEXTURE } from '../gfx/textures';
import { createControls, type Controls } from '../input/controls';
import { bindBackKey, justDown, type MenuKey, padContextFor } from '../input/menuKeys';
import { createBodyMover } from '../physics/player';
import { applyTileFaces, applyTileFacesAt } from '../physics/tiles';
import { LEARN_HUD_SCENE_KEY, LEARN_TOWER_SCENE_KEY } from './keys';
import type { LearnHudData } from './LearnHudScene';
import { takeBack } from './navigate';

export interface LearnTowerData {
  mode: LearnMode;
  /** What this round has asked: the same array from tower to tower, emptied by pickTargets when a round ends. */
  used: string[];
}

/** A plain sky until Part 2's castle backdrop. */
const SKY = '#7ec0ee';
/** The sprite draws 2px larger than the hitbox on every side, as in SliceScene. */
const PLAYER_DRAW_INSET = 2;
const POSES = ['stand', 'run', 'jump'] as const;
const FOLLOW_LERP = 0.15;
/** The camera centres this far above the hero: more of the climb above than below. */
const FOLLOW_ABOVE = 48;
const PAN_MS = 600;
/** After the star, a new tower in the same mode. Part 2 puts the result screen here. */
const NEXT_TOWER_MS = 2000;
const DEPTH_BLOCK = 5;
const DEPTH_STAR = 6;
const DEPTH_PLAYER = 10;
const LETTER_FONT = {
  fontFamily: '"Trebuchet MS", system-ui, sans-serif',
  fontSize: '20px',
  fontStyle: 'bold',
  color: '#8a4b00',
};
const LETTER_RESOLUTION = 3;
/** How white the right block's hint glow gets at its brightest. */
const GLOW_ALPHA = 0.55;

/**
 * One learn tower. The rules are game/learn/ (tested there); this scene is the engine side:
 * a real tilemap drawn from the tower's own tileset, which Arcade also collides against,
 * with planks colliding only from above; the adventure's Arcade mover, which reports the row
 * a head hit for the climb to pick the letter; the same fixed 60Hz step as SliceScene; and a
 * camera that follows the hero inside the current storey's bounds and pans to the next.
 *
 * Back goes to the learn menu (game/navigation.ts: `learnletters` is not pausable).
 */
export class LearnTowerScene extends Phaser.Scene {
  private mode: LearnMode = 'letters';
  private used: string[] = [];
  private character: Character = 'gigi';
  private skin = 0;
  private climb!: Climb;
  private layer!: Phaser.Tilemaps.TilemapLayer;
  private move!: ClimbMove;
  /** One container per block (picture + letter), per storey. */
  private blocks: Phaser.GameObjects.Container[][] = [];
  private playerImage!: Phaser.GameObjects.Image;
  /** The point the camera follows: the hero's centre. */
  private readonly follow = { x: 0, y: 0 };
  private controls!: Controls;
  private backKey!: MenuKey;
  private accumulator = 0;
  private leaving = false;

  constructor() {
    super(LEARN_TOWER_SCENE_KEY);
  }

  init(data: LearnTowerData): void {
    this.mode = data?.mode ?? 'letters';
    this.used = data?.used ?? [];
    this.blocks = [];
    this.accumulator = 0;
    this.leaving = false;
  }

  create(): void {
    registerTextures(this);
    registerLearnTiles(this);
    this.cameras.main.setBackgroundColor(SKY);

    this.character = getSelectedChar();
    this.skin = getSkinIndex(this.character);
    this.climb = createClimb(this.mode, this.used, this.character);

    this.layer = this.buildLayer();
    // The side walls are world edges too: above the last storey they stand only BATTLEMENTS
    // high, lower than a jump, and nothing else would keep the hero on the roof.
    this.move = createBodyMover(this, this.climb.player, {
      layer: this.layer,
      edges: {
        width: MAP_COLS * TILE,
        height: this.climb.layout.rows * TILE,
        left: true,
        right: true,
        up: false,
        down: false,
      },
    });
    this.buildBlocks();
    this.buildStar();
    this.playerImage = this.add.image(0, 0, this.poseKey()).setOrigin(0, 0).setDepth(DEPTH_PLAYER);
    this.syncPlayer();

    const cam = this.cameras.main;
    cam.setZoom(LEARN_ZOOM);
    this.boundToStorey(0);
    const start = settleCenter(storeyView(this.climb.layout, 0));
    cam.centerOn(start.x, start.y);
    // lerpX 0: the camera never moves sideways; the bounds are exactly the view's width.
    cam.startFollow(this.follow, true, 0, FOLLOW_LERP, 0, FOLLOW_ABOVE);

    // Made here, not earlier: the pad half seeds itself from what is held right now, so the
    // button that chose the exercise does not also jump.
    this.controls = createControls(this);
    this.backKey = bindBackKey(this, padContextFor('learnletters'));

    this.scene.launch(LEARN_HUD_SCENE_KEY, { climb: this.climb } satisfies LearnHudData);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scene.stop(LEARN_HUD_SCENE_KEY));
  }

  update(_time: number, delta: number): void {
    if (this.leaving) return;
    if (justDown(this.backKey)) {
      this.leaving = true;
      takeBack(this, 'learnletters');
      return;
    }
    // The same fixed step as SliceScene: never more than five steps' worth of time banked.
    this.accumulator = Math.min(this.accumulator + delta, STEP_MS * 5);
    while (this.accumulator >= STEP_MS) {
      stepClimb(this.climb, this.controls.read(), this.move);
      for (const event of this.climb.events.splice(0)) this.apply(event);
      for (const cue of this.climb.sounds.splice(0)) playCue(cue, 0);
      this.accumulator -= STEP_MS;
    }
    this.syncPlayer();
  }

  private buildLayer(): Phaser.Tilemaps.TilemapLayer {
    const tilemap = this.make.tilemap({
      data: toPhaserData(this.climb.layout.map),
      tileWidth: TILE,
      tileHeight: TILE,
    });
    const tileset = tilemap.addTilesetImage(LEARN_TILES_KEY, LEARN_TILES_KEY, TILE, TILE, 0, 0);
    if (!tileset) throw new Error('the tower tileset is not a texture');
    // `false`: the CPU layer, the only kind Arcade collides against (as physics/tiles.ts).
    const layer = tilemap.createLayer(0, tileset, 0, 0, false);
    if (!layer || !('culledTiles' in layer)) throw new Error('the tower tilemap has no layer 0');
    applyTileFaces(layer, towerTileFaces);
    return layer;
  }

  private buildBlocks(): void {
    this.blocks = this.climb.layout.storeys.map((st) => st.blocks.map((b) => {
      const x = (b.col + WALL) * TILE;
      const y = st.ceilingRows[0] * TILE;
      const picture = this.add.image(0, 0, blockTextureKey(b.width)).setOrigin(0, 0);
      // The hint: white over the gold, faded in and out once the right block should glow.
      // Fading the block itself would show the gold letter tile underneath, gold on gold.
      const glow = this.add.rectangle(0, 0, b.width * TILE, 2 * TILE, 0xffffff).setOrigin(0, 0).setAlpha(0);
      const letter = this.add
        .text((b.width * TILE) / 2, TILE + 1, b.letter, LETTER_FONT)
        .setOrigin(0.5, 0.5)
        .setResolution(LETTER_RESOLUTION);
      return this.add.container(x, y, [picture, glow, letter])
        .setDepth(DEPTH_BLOCK)
        .setData('x', x)
        .setData('glow', glow);
    }));
  }

  private buildStar(): void {
    const box = starBox(this.climb.layout);
    const star = this.add
      .image(box.x + box.w / 2, box.y + box.h / 2, STAR_TEXTURE)
      .setScale(3)
      .setDepth(DEPTH_STAR);
    this.tweens.add({ targets: star, y: star.y - 4, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private apply(event: ClimbEvent): void {
    switch (event.type) {
      case 'tiles':
        for (const cell of event.cells) this.setTile(cell.col, cell.row, cell.code);
        return;
      case 'bump-right':
        this.blocks[event.storey][event.block].setVisible(false);
        return;
      case 'bump-wrong':
        this.shake(this.blocks[event.storey][event.block]);
        return;
      case 'hint':
        this.tweens.add({
          targets: this.blocks[event.storey][event.block].getData('glow'),
          alpha: GLOW_ALPHA, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
        return;
      case 'rearm':
        this.blocks[event.storey][event.block].setVisible(true);
        return;
      case 'gate-closed':
        for (const box of this.blocks[event.storey]) {
          this.tweens.killTweensOf([box, box.getData('glow')]);
          box.setVisible(false);
        }
        return;
      case 'storey':
        this.panToStorey(event.storey);
        return;
      case 'finished':
        this.time.delayedCall(NEXT_TOWER_MS, () => {
          this.scene.restart({ mode: this.mode, used: this.used } satisfies LearnTowerData);
        });
        return;
    }
  }

  /** Mirrors a map edit on the Phaser layer, collision included. */
  private setTile(col: number, row: number, code: number): void {
    if (code === T_EMPTY) {
      this.layer.removeTileAt(col, row, true, true);
      return;
    }
    this.layer.putTileAt(code, col, row, true);
    applyTileFacesAt(this.layer, col, row, towerTileFaces);
  }

  private shake(box: Phaser.GameObjects.Container): void {
    const x = box.getData('x') as number;
    this.tweens.killTweensOf(box);
    box.setX(x);
    this.tweens.add({ targets: box, x: x + 3, duration: 40, yoyo: true, repeat: 3, onComplete: () => box.setX(x) });
  }

  /**
   * Into storey `s`: bounds off (they would clamp the pan, and follow waits while a pan
   * runs), pan to where the camera will settle, and bound it to the new storey when the pan
   * ends. Follow picks up from there.
   */
  private panToStorey(s: number): void {
    const cam = this.cameras.main;
    const target = settleCenter(storeyView(this.climb.layout, s));
    cam.removeBounds();
    cam.pan(target.x, target.y, PAN_MS, 'Sine.easeInOut', true, (_camera: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      if (progress === 1) this.boundToStorey(s);
    });
  }

  private boundToStorey(s: number): void {
    const view = storeyView(this.climb.layout, s);
    this.cameras.main.setBounds(view.x, view.y, view.width, view.height);
  }

  private syncPlayer(): void {
    const p = this.climb.player;
    this.playerImage
      .setTexture(this.poseKey())
      .setPosition(p.x - PLAYER_DRAW_INSET, p.y - PLAYER_DRAW_INSET)
      .setFlipX(p.facing < 0);
    this.follow.x = p.x + p.w / 2;
    this.follow.y = p.y + p.h / 2;
  }

  private poseKey(): string {
    return playerTextureKey(this.character, this.skin, POSES[this.climb.player.frame]);
  }
}
