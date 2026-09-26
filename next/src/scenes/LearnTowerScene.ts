import Phaser from 'phaser';
import { playEffect } from '../audio/cues';
import { hush, speak } from '../audio/voice';
import { MAX_STEPS_PER_FRAME, STEP_MS, TILE } from '../config/constants';
import { createClimb, stepClimb } from '../game/learn/climb';
import {
  CEILING, LEARN_ZOOM, MAP_COLS, settleCenter, starBox, storeyView, T_BRICK, T_EMPTY, towerTileFaces, WALL,
} from '../game/learn/tower';
import type { Climb, ClimbEvent, ClimbMove, LearnSession } from '../game/learn/types';
import { type Character, PLAYER_DRAW_INSET } from '../game/player';
import { getSelectedChar, getSkinIndex } from '../game/run';
import {
  blockTextureKey, LEARN_BRICK, LEARN_SPARK_TEXTURE, LEARN_TILES_TEXTURE, registerLearnTiles, toPhaserData,
} from '../gfx/learnTiles';
import { LEARN_STAR_TEXTURE, PLAYER_POSES, playerTextureKey, registerTextures } from '../gfx/textures';
import { createControls, type Controls } from '../input/controls';
import { padRumble } from '../input/gamepad';
import { bindBackKey, justDown, type MenuKey, padContextFor } from '../input/menuKeys';
import { createBodyMover } from '../physics/player';
import { applyTileFaces, applyTileFacesAt } from '../physics/tiles';
import { LEARN_HUD_SCENE_KEY, LEARN_RESULT_SCENE_KEY, LEARN_TOWER_SCENE_KEY } from './keys';
import type { LearnHudData, LearnHudScene } from './LearnHudScene';
import type { LearnResultData } from './LearnResultScene';
import { takeBack } from './navigate';

/** A plain sky until the castle backdrop. */
const SKY = '#7ec0ee';
const FOLLOW_LERP = 0.15;
/** The camera centres this far above the hero: more of the climb above than below. */
const FOLLOW_ABOVE = 48;
const PAN_MS = 600;
/**
 * Fast first, like the spring the pan follows: a right answer starts both on the same step,
 * and a camera that eased in fell behind the hero's head. The roof's pan is the shortest,
 * and with an ease-in the head rose 15px into the HUD band there.
 */
const PAN_EASE = 'Sine.easeOut';
/** After the star, the result screen. */
const RESULT_DELAY_MS = 2000;
const DEPTH_BLOCK = 5;
const DEPTH_STAR = 6;
const DEPTH_PLAYER = 10;
const DEPTH_EFFECTS = 20;
const LETTER_FONT = {
  fontFamily: '"Trebuchet MS", system-ui, sans-serif',
  fontSize: '20px',
  fontStyle: 'bold',
  color: '#8a4b00',
};
const LETTER_RESOLUTION = 3;
/** The star floats up and down this far, this slowly. */
const STAR_BOB_PX = 4;
const STAR_BOB_MS = 800;
/** A wrong block shakes sideways this far, this fast, this many times. */
const SHAKE_PX = 3;
const SHAKE_MS = 40;
const SHAKE_REPEATS = 3;
/** The right block, and the star, pop: they swell to this and fade out, this fast. */
const POP_SCALE = 1.6;
const POP_MS = 220;
/** Sparks from a popped block, chunks from each brick a trapdoor knocks out, confetti from the star. */
const SPARKS = 16;
const CHUNKS_PER_BRICK = 4;
const CONFETTI = 60;
/** The live learn mode's celebration colours (index.html:2719). */
const CONFETTI_COLORS = [0xffdd00, 0xff69b4, 0x88ff88, 0x88ccff, 0xffaa44];
/**
 * The hint: Phaser's Glow round the right block, breathing, and the block swelling and
 * settling with it, so it moves as well as shines. White over the gold alone was too faint
 * to find (1.24:1).
 */
const HINT_GLOW_COLOR = 0xffffff;
const HINT_GLOW_STRENGTH = 6;
const HINT_GLOW_DISTANCE = 8;
const HINT_PULSE_SCALE = 1.12;
const HINT_PULSE_MS = 450;

/**
 * A letter block on screen: its container (picture and letter), centred on the block so it
 * pops and pulses from the middle; the picture, which carries the hint's glow; and where it
 * rests, for the shake.
 */
interface BlockView {
  box: Phaser.GameObjects.Container;
  picture: Phaser.GameObjects.Image;
  restX: number;
  glow: Phaser.Filters.Glow | null;
}

/**
 * One learn tower. The rules are game/learn/ (tested there); this scene is the engine side:
 * a real tilemap drawn from the tower's own tileset, which Arcade also collides against,
 * with planks colliding only from above; the general Arcade mover (physics/player.ts's
 * createBodyMover), which reports the row a head hit for the climb to pick the letter; the
 * same fixed 60Hz step as SliceScene; a camera that follows the hero inside the current
 * storey's bounds and pans to the next; and the climb's cues, played: sounds, buzzes, the
 * voice and the effects. The star ends it, and the result screen follows.
 *
 * Back goes to the learn menu (game/navigation.ts: `learnletters` is not pausable).
 */
export class LearnTowerScene extends Phaser.Scene {
  private session: LearnSession = { mode: 'letters', used: [], score: 0 };
  private character: Character = 'gigi';
  private skin = 0;
  private climb!: Climb;
  private layer!: Phaser.Tilemaps.TilemapLayer;
  private move!: ClimbMove;
  /** One view per block, per storey. */
  private blocks: BlockView[][] = [];
  private star!: Phaser.GameObjects.Image;
  private playerImage!: Phaser.GameObjects.Image;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private chunks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** The point the camera follows: the hero's centre. */
  private readonly follow = { x: 0, y: 0 };
  /** The storey the camera is panning or bound to, so a pan already under way is not restarted. */
  private viewStorey = 0;
  private controls!: Controls;
  private backKey!: MenuKey;
  private accumulator = 0;
  private leaving = false;

  constructor() {
    super(LEARN_TOWER_SCENE_KEY);
  }

  init(data: Partial<LearnSession>): void {
    // The learn menu starts a session and the result screen carries it on. Started bare, from
    // a console, a tower is a letters one.
    this.session = { mode: data?.mode ?? 'letters', used: data?.used ?? [], score: data?.score ?? 0 };
    this.blocks = [];
    this.viewStorey = 0;
    this.accumulator = 0;
    this.leaving = false;
  }

  create(): void {
    registerTextures(this);
    registerLearnTiles(this);
    this.cameras.main.setBackgroundColor(SKY);

    this.character = getSelectedChar();
    this.skin = getSkinIndex(this.character);
    this.climb = createClimb(this.session.mode, this.session.used, this.character);

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
    this.star = this.buildStar();
    this.playerImage = this.add.image(0, 0, this.poseKey()).setOrigin(0, 0).setDepth(DEPTH_PLAYER);
    this.syncPlayer();
    this.buildEffects();

    const cam = this.cameras.main;
    cam.setZoom(LEARN_ZOOM);
    this.boundToStorey(0);
    // startFollow snaps the scroll to the follow point and clamps it to the bounds, so this
    // is also the first frame's position: storey 0 always fits, and its top is pinned.
    // lerpX 0: the camera never moves sideways; the bounds are exactly the view's width.
    cam.startFollow(this.follow, true, 0, FOLLOW_LERP, 0, FOLLOW_ABOVE);

    // Made here, not earlier: the pad half seeds itself from what is held right now, so the
    // button that chose the exercise does not also jump.
    this.controls = createControls(this);
    this.backKey = bindBackKey(this, padContextFor('learnletters'));

    this.scene.launch(LEARN_HUD_SCENE_KEY, { climb: this.climb } satisfies LearnHudData);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.stop(LEARN_HUD_SCENE_KEY);
      hush();
    });
  }

  update(_time: number, delta: number): void {
    if (this.leaving) return;
    if (justDown(this.backKey)) {
      this.leaving = true;
      takeBack(this, 'learnletters');
      return;
    }
    // The same fixed step as SliceScene, with the same ceiling on the time banked.
    this.accumulator = Math.min(this.accumulator + delta, STEP_MS * MAX_STEPS_PER_FRAME);
    while (this.accumulator >= STEP_MS) {
      stepClimb(this.climb, this.controls.read(), this.move);
      for (const event of this.climb.events.splice(0)) this.apply(event);
      for (const cue of this.climb.sounds.splice(0)) playEffect(cue);
      for (const cue of this.climb.rumbles.splice(0)) padRumble(cue);
      for (const line of this.climb.speech.splice(0)) speak(line.text, line.when);
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
    const tileset = tilemap.addTilesetImage(LEARN_TILES_TEXTURE, LEARN_TILES_TEXTURE, TILE, TILE, 0, 0);
    if (!tileset) throw new Error('the tower tileset is not a texture');
    // `false`: the CPU layer, the only kind Arcade collides against (as physics/tiles.ts).
    const layer = tilemap.createLayer(0, tileset, 0, 0, false);
    if (!layer || !('culledTiles' in layer)) throw new Error('the tower tilemap has no layer 0');
    applyTileFaces(layer, towerTileFaces);
    return layer;
  }

  private buildBlocks(): void {
    this.blocks = this.climb.layout.storeys.map((st) => st.blocks.map((b) => {
      const w = b.width * TILE;
      const h = CEILING * TILE;
      const x = (b.col + WALL) * TILE + w / 2;
      const y = st.ceilingRows[0] * TILE + h / 2;
      const picture = this.add.image(0, 0, blockTextureKey(b.width));
      const letter = this.add.text(0, 1, b.letter, LETTER_FONT).setOrigin(0.5, 0.5).setResolution(LETTER_RESOLUTION);
      const box = this.add.container(x, y, [picture, letter]).setDepth(DEPTH_BLOCK);
      return { box, picture, restX: x, glow: null };
    }));
  }

  private buildStar(): Phaser.GameObjects.Image {
    const box = starBox(this.climb.layout);
    const star = this.add.image(box.x + box.w / 2, box.y + box.h / 2, LEARN_STAR_TEXTURE).setDepth(DEPTH_STAR);
    this.tweens.add({
      targets: star, y: star.y - STAR_BOB_PX, duration: STAR_BOB_MS, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    return star;
  }

  /**
   * Three emitters, idle until something explodes them, all from one white spark tinted per
   * use: the popped block's sparkle, a knocked-out brick's chunks, and the star's confetti.
   */
  private buildEffects(): void {
    this.sparks = this.add.particles(0, 0, LEARN_SPARK_TEXTURE, {
      emitting: false,
      lifespan: 600,
      speed: { min: 60, max: 180 },
      scale: { start: 1.5, end: 0 },
      tint: [0xffffff, 0xffdd00, 0x88ff88],
      gravityY: 200,
    }).setDepth(DEPTH_EFFECTS);
    this.chunks = this.add.particles(0, 0, LEARN_SPARK_TEXTURE, {
      emitting: false,
      lifespan: 900,
      speedX: { min: -70, max: 70 },
      speedY: { min: -150, max: -40 },
      scale: { min: 1.5, max: 2.5 },
      rotate: { start: 0, end: 360 },
      tint: LEARN_BRICK,
      gravityY: 600,
    }).setDepth(DEPTH_EFFECTS);
    this.confetti = this.add.particles(0, 0, LEARN_SPARK_TEXTURE, {
      emitting: false,
      lifespan: 1600,
      speed: { min: 80, max: 240 },
      angle: { min: 200, max: 340 },
      rotate: { start: 0, end: 360 },
      tint: CONFETTI_COLORS,
      gravityY: 250,
    }).setDepth(DEPTH_EFFECTS);
  }

  private apply(event: ClimbEvent): void {
    switch (event.type) {
      case 'tiles':
        for (const cell of event.cells) this.setTile(cell.col, cell.row, cell.code);
        return;
      case 'bump-right':
        this.sendStar(this.blocks[event.storey][event.block]);
        this.pop(this.blocks[event.storey][event.block]);
        // Now, not when the hero reaches the next storey: they spring up through the HUD band
        // otherwise. Every counted bump carries them there (tests/learnJumps.test.ts).
        this.panToStorey(event.storey + 1);
        return;
      case 'bump-wrong':
        this.shake(this.blocks[event.storey][event.block]);
        return;
      case 'hint':
        this.showHint(this.blocks[event.storey][event.block]);
        return;
      case 'rearm':
        this.blocks[event.storey][event.block].box.setVisible(true);
        this.panToStorey(event.storey);
        return;
      case 'gate-closed':
        // The wrong letters go with the rest of the ceiling, which is brick now. The right
        // one is already popping out of sight, and cutting its pop short would show.
        this.climb.layout.storeys[event.storey].blocks.forEach((b, i) => {
          if (b.correct) return;
          const view = this.blocks[event.storey][i];
          this.stopTweens(view);
          view.box.setVisible(false);
        });
        return;
      case 'storey':
        if (event.storey !== this.viewStorey) this.panToStorey(event.storey);
        return;
      case 'finished':
        this.session.score += this.climb.score;
        this.tweens.killTweensOf(this.star);
        this.confetti.explode(CONFETTI, this.star.x, this.star.y);
        this.tweens.add({ targets: this.star, scale: POP_SCALE, alpha: 0, duration: POP_MS });
        this.time.delayedCall(RESULT_DELAY_MS, () => {
          this.scene.start(LEARN_RESULT_SCENE_KEY, {
            session: this.session,
            found: this.climb.layout.storeys.map((st) => st.target),
            word: this.climb.layout.word,
          } satisfies LearnResultData);
        });
        return;
      default:
        // A ClimbEvent this switch does not know fails the build here, not silently in play.
        event satisfies never;
    }
  }

  /**
   * Mirrors a map edit on the Phaser layer, collision included. Both calls are needed:
   * putTileAt sets a tile's collision from the layer's collideIndexes, which this layer does
   * not use (its collision is per tile and per side), so it leaves the tile colliding on no
   * side; applyTileFacesAt then sets the tower's sides and recalculates the faces around it.
   *
   * A brick knocked out of the map, which only an opening trapdoor does (its side columns),
   * breaks into chunks.
   */
  private setTile(col: number, row: number, code: number): void {
    if (code === T_EMPTY) {
      if (this.layer.getTileAt(col, row)?.index === T_BRICK) {
        this.chunks.explode(CHUNKS_PER_BRICK, (col + 0.5) * TILE, (row + 0.5) * TILE);
      }
      this.layer.removeTileAt(col, row, true, true);
      return;
    }
    this.layer.putTileAt(code, col, row, false);
    applyTileFacesAt(this.layer, col, row, towerTileFaces);
  }

  /** The right block pops: it swells and fades in a burst of sparks, and hides until a re-arm brings it back. */
  private pop(view: BlockView): void {
    const { box } = view;
    this.stopTweens(view);
    this.sparks.explode(SPARKS, box.x, box.y);
    this.tweens.add({
      targets: box, scale: POP_SCALE, alpha: 0, duration: POP_MS, ease: 'Quad.easeOut',
      onComplete: () => box.setVisible(false).setScale(1).setAlpha(1),
    });
  }

  /** The HUD's star for a right answer flies from the block: its centre, in screen px. */
  private sendStar({ box }: BlockView): void {
    const cam = this.cameras.main;
    const hud = this.scene.get(LEARN_HUD_SCENE_KEY) as LearnHudScene;
    hud.flyStar((box.x - cam.worldView.x) * cam.zoom, (box.y - cam.worldView.y) * cam.zoom);
  }

  private shake({ box, restX }: BlockView): void {
    this.tweens.killTweensOf(box);
    box.setX(restX);
    this.tweens.add({
      targets: box, x: restX + SHAKE_PX, duration: SHAKE_MS, yoyo: true, repeat: SHAKE_REPEATS,
      onComplete: () => box.setX(restX),
    });
  }

  /** The hint, on the right block. Under the canvas renderer there are no filters, and the pulse alone shows it. */
  private showHint(view: BlockView): void {
    const glow = view.picture.enableFilters().filters?.internal
      .addGlow(HINT_GLOW_COLOR, 0, 0, 1, false, 10, HINT_GLOW_DISTANCE) ?? null;
    if (glow) {
      // Pads the picture's framebuffer by the glow's reach, so the glow is not cut off at its edges.
      glow.setPaddingOverride(null);
      this.tweens.add({
        targets: glow, outerStrength: HINT_GLOW_STRENGTH, duration: HINT_PULSE_MS, yoyo: true, repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    view.glow = glow;
    this.tweens.add({
      targets: view.box, scale: HINT_PULSE_SCALE, duration: HINT_PULSE_MS, yoyo: true, repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** Stops a block's shake or hint, and puts it back as it rests. */
  private stopTweens(view: BlockView): void {
    this.tweens.killTweensOf(view.box);
    if (view.glow) {
      this.tweens.killTweensOf(view.glow);
      view.glow.outerStrength = 0;
    }
    view.box.setPosition(view.restX, view.box.y).setScale(1);
  }

  /**
   * Into storey `s`: bounds off (they would clamp the pan, and follow waits while a pan
   * runs), pan to where the camera will settle, and bound it to the new storey when the pan
   * ends. Follow picks up from there.
   */
  private panToStorey(s: number): void {
    this.viewStorey = s;
    const cam = this.cameras.main;
    const target = settleCenter(storeyView(this.climb.layout, s));
    cam.removeBounds();
    cam.pan(target.x, target.y, PAN_MS, PAN_EASE, true, (_camera: Phaser.Cameras.Scene2D.Camera, progress: number) => {
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
    return playerTextureKey(this.character, this.skin, PLAYER_POSES[this.climb.player.frame]);
  }
}
