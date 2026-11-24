import Phaser from 'phaser';
import { TILE } from '../config/constants';
import {
  TILE_CRACKED, TILE_GATE, TILE_ICE, TILE_LAVA, TILE_PLANK, TILE_SPRING, TILE_WATER, type StationKind,
} from '../data/levels';
import { POWERUP_INFO } from '../data/powerups';
import {
  BRUSH_R, BUBBLE_W, TAP_WARN_FRAMES, tapWarning, ventWarning, type CourseState, type StationState, type TargetState,
} from '../game/course';
import type { EnemyState, World } from '../game/types';
import { WORLD_TEXT_RESOLUTION } from './gameFont';
import { BOW_TEXTURE, DROP_TEXTURE, DUCK_TEXTURE, SUPER_TEXTURE, spriteScale } from './textures';

/**
 * How the obstacle course looks and what Phaser does for it (the rules are game/course.ts):
 *
 *   - its own tiles — cracked blocks, springs, planks — are a Phaser TilemapLayer on a tileset
 *     baked at boot, so smashing a block or laying a plank is a `removeTileAt`/`putTileAt`;
 *   - every bit of show is a Phaser particle emitter or tween: chunks off a smashed block,
 *     dust off a plank, confetti off a target, a station popping back, a flag going up;
 *   - the giant is an Arcade STATIC body, collided against the player's body by Arcade itself
 *     (physics/player.ts's `solids`), so it stops you the way a wall does.
 */

export const COURSE_TILES_TEXTURE = 'course-tiles';
/** The same tiles, but a gate is the home world's shower curtain. */
const COURSE_TILES_HOME_TEXTURE = 'course-tiles-home';
/** The home world's soap dish, its bubbles, and its toilet brush. */
const COURSE_SOAP_TEXTURE = 'course-soap';
const COURSE_BUBBLE_TEXTURE = 'course-bubble';
const COURSE_BRUSH_TEXTURE = 'course-brush';
export const COURSE_SPARK_TEXTURE = 'course-spark';
export const COURSE_TARGET_TEXTURE = 'course-target';
export const COURSE_GLOW_TEXTURE = 'course-glow';
/** The bullseye's diameter, and how far its post runs down into the chasm below it. */
export const TARGET_PX = 24;
const POST_PX = 72;
const GLOW_PX = 48;
const COURSE_FLAG_TEXTURE = 'course-flag';
const COURSE_POLE_TEXTURE = 'course-pole';
/** The home world's checkpoint, and its dripping taps. */
const COURSE_POTTY_TEXTURE = 'course-potty';
const COURSE_TAP_TEXTURE = 'course-tap';
const TAP_GREY = 0x7a8090;

/** One tileset frame per tile code, so a map cell's code IS its frame. 0..12. */
const FRAMES = TILE_WATER + 1;
const SPARK_PX = 3;

const CRACKED_FILL = 0xb58b62;
const CRACK_LINE = 0x4a2e18;
const SPRING_BASE = 0x666677;
const SPRING_COIL = 0xdddddd;
const SPRING_PAD = 0xff4466;
const WOOD = 0xb5773a;
const WOOD_LIGHT = 0xd99a58;
const WOOD_DARK = 0x7a4a20;
const FLAG_DOWN = 0x999999;
const FLAG_UP = 0xff3355;

const GATE_BAR = 0x555566;
const GATE_SHINE = 0x9a9ab0;

const CONFETTI = [0xffdd00, 0xff69b4, 0x88ff88, 0x88ccff, 0xffaa44];

const DEPTH_COURSE_TILES = 1;
const DEPTH_COURSE_THINGS = 9;
const DEPTH_COURSE_FX = 22.5;

/** Draws into a throwaway Graphics and bakes it, once (the same guard as gfx/learnTiles.ts). */
function bake(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({}, false);
  draw(g);
  g.generateTexture(key, width, height);
  g.destroy();
}

function drawCracked(g: Phaser.GameObjects.Graphics, x: number): void {
  g.fillStyle(CRACKED_FILL).fillRect(x, 0, TILE, TILE);
  g.fillStyle(0xffffff, 0.18).fillRect(x, 0, TILE, 1).fillRect(x, 0, 1, TILE);
  g.fillStyle(0x000000, 0.25).fillRect(x, TILE - 1, TILE, 1).fillRect(x + TILE - 1, 0, 1, TILE);
  // A zigzag crack, so it reads as "this one breaks" next to a plain brick.
  g.lineStyle(1, CRACK_LINE).beginPath();
  g.moveTo(x + 3, 1).lineTo(x + 7, 6).lineTo(x + 5, 9).lineTo(x + 10, 14).lineTo(x + 12, 15);
  g.moveTo(x + 7, 6).lineTo(x + 12, 4);
  g.strokePath();
}

function drawSpring(g: Phaser.GameObjects.Graphics, x: number): void {
  g.fillStyle(SPRING_BASE).fillRect(x + 1, 12, TILE - 2, 4);
  g.lineStyle(2, SPRING_COIL).beginPath();
  g.moveTo(x + 3, 12).lineTo(x + 13, 9).lineTo(x + 3, 7).lineTo(x + 13, 5);
  g.strokePath();
  g.fillStyle(SPRING_PAD).fillRect(x, 2, TILE, 3);
  g.fillStyle(0xffffff, 0.5).fillRect(x + 1, 2, TILE - 2, 1);
}

function drawPlank(g: Phaser.GameObjects.Graphics, x: number): void {
  g.fillStyle(WOOD).fillRect(x, 0, TILE, 8);
  g.fillStyle(WOOD_LIGHT).fillRect(x, 0, TILE, 2);
  g.fillStyle(WOOD_DARK).fillRect(x, 7, TILE, 1);
  g.fillStyle(0x000000, 0.3).fillRect(x + 3, 3, 1, 1).fillRect(x + 12, 3, 1, 1);
  // Ropes down to the next plank's edge, so a run of them reads as one bridge.
  g.fillStyle(0x6b4a2a).fillRect(x, 8, 1, 4).fillRect(x + TILE - 1, 8, 1, 4);
}

/** A gate's bars: three iron bars and a crossbar, over a shadow so the way reads as shut. */
/** The home world's water: a warm bath, light blue (the foam goes on its top row only: CourseView). */
function drawBathWater(g: Phaser.GameObjects.Graphics, x: number): void {
  g.fillStyle(0x5ab0e0).fillRect(x, 0, TILE, TILE);
  g.fillStyle(0x6abde6).fillRect(x, 6, TILE, 2);
}

/** The home world's gate: a pale blue shower curtain, two folds, a bubble pattern. */
function drawCurtain(g: Phaser.GameObjects.Graphics, x: number): void {
  g.fillStyle(0x9fd8f0).fillRect(x, 0, TILE, TILE);
  g.fillStyle(0x7ec0e0).fillRect(x + 3, 0, 2, TILE).fillRect(x + 10, 0, 2, TILE);
  g.fillStyle(0xffffff, 0.8).fillCircle(x + 7.5, 5, 1.5).fillCircle(x + 13.5, 11, 1.5).fillCircle(x + 1.5, 12, 1);
}

function drawGate(g: Phaser.GameObjects.Graphics, x: number): void {
  g.fillStyle(0x000000, 0.25).fillRect(x, 0, TILE, TILE);
  for (const bx of [2, 7, 12]) {
    g.fillStyle(GATE_BAR).fillRect(x + bx, 0, 3, TILE);
    g.fillStyle(GATE_SHINE).fillRect(x + bx, 0, 1, TILE);
  }
  g.fillStyle(GATE_BAR).fillRect(x, 6, TILE, 2);
}

const LAVA = 0xff6a1a;
const LAVA_DEEP = 0xc8320f;
const LAVA_BRIGHT = 0xffd04a;
const EMBERS = [0xffd04a, 0xff8a2a, 0xff4a1a];

/** Lava: hot orange over a deeper red, with bright bubbles, so it reads as "don't". */
function drawLava(g: Phaser.GameObjects.Graphics, x: number): void {
  g.fillStyle(LAVA_DEEP).fillRect(x, 0, TILE, TILE);
  g.fillStyle(LAVA).fillRect(x, 0, TILE, 10);
  g.fillStyle(LAVA_BRIGHT).fillRect(x, 0, TILE, 2);
  g.fillStyle(LAVA_BRIGHT).fillCircle(x + 4, 5, 1.5).fillCircle(x + 11, 7, 2);
}

const ICE = 0xbfe6ff;
const ICE_TOP = 0xeaf8ff;
const ICE_DEEP = 0x8cc4e8;
const WATER = 0x1f4f8a;
const WATER_TOP = 0x3f7fc0;
const WATER_RIPPLE = 0x9fd0ff;
const SPRAY = [0xffffff, 0x9fd0ff, 0x3f7fc0];

/** Ice: pale blue, a bright top, two white glints: it reads as slippery. */
function drawIce(g: Phaser.GameObjects.Graphics, x: number): void {
  g.fillStyle(ICE).fillRect(x, 0, TILE, TILE);
  g.fillStyle(ICE_DEEP).fillRect(x, TILE - 3, TILE, 3);
  g.fillStyle(ICE_TOP).fillRect(x, 0, TILE, 3);
  g.fillStyle(0xffffff).fillRect(x + 3, 5, 4, 1).fillRect(x + 4, 6, 2, 1).fillRect(x + 10, 9, 3, 1);
}

/** Icy water: deep blue with a lighter surface and a ripple, so it reads as cold and deep. */
function drawWater(g: Phaser.GameObjects.Graphics, x: number): void {
  g.fillStyle(WATER).fillRect(x, 0, TILE, TILE);
  g.fillStyle(WATER_TOP).fillRect(x, 0, TILE, 4);
  g.fillStyle(WATER_RIPPLE).fillRect(x + 2, 1, 4, 1).fillRect(x + 9, 2, 5, 1);
}

/** Every texture the course draws with. Cheap, and safe to call on every level start. */
export function registerCourseTextures(scene: Phaser.Scene): void {
  const tilesets = [
    [COURSE_TILES_TEXTURE, drawGate, drawWater],
    [COURSE_TILES_HOME_TEXTURE, drawCurtain, drawBathWater],
  ] as const;
  for (const [key, gate, water] of tilesets) {
    bake(scene, key, TILE * FRAMES, TILE, (g) => {
      drawCracked(g, TILE_CRACKED * TILE);
      drawSpring(g, TILE_SPRING * TILE);
      drawPlank(g, TILE_PLANK * TILE);
      gate(g, TILE_GATE * TILE);
      drawLava(g, TILE_LAVA * TILE);
      drawIce(g, TILE_ICE * TILE);
      water(g, TILE_WATER * TILE);
    });
  }
  // A white soap dish with a pink bar of soap in it.
  bake(scene, COURSE_SOAP_TEXTURE, 24, 9, (g) => {
    g.fillStyle(0xe8ecf0).fillRoundedRect(0, 4, 24, 5, { tl: 1, tr: 1, bl: 3, br: 3 });
    g.fillStyle(0xff9ad0).fillRoundedRect(5, 0, 14, 6, 2);
    g.fillStyle(0xffffff).fillCircle(8, 1.5, 1.5).fillCircle(16, 2, 1);
  });
  // A soap bubble: see-through, a white rim, a shine.
  bake(scene, COURSE_BUBBLE_TEXTURE, BUBBLE_W, BUBBLE_W, (g) => {
    const r = BUBBLE_W / 2;
    g.fillStyle(0xcfefff, 0.35).fillCircle(r, r, r - 1);
    g.lineStyle(1.5, 0xffffff, 0.9).strokeCircle(r, r, r - 1);
    g.fillStyle(0xffffff, 0.85).fillEllipse(r - 6, r - 7, 7, 4);
    g.fillStyle(0xffb0e0, 0.5).fillEllipse(r + 6, r + 7, 6, 3);
  });
  // A toilet brush, spun round its middle: a white handle, a dark blue bristle head at one end.
  bake(scene, COURSE_BRUSH_TEXTURE, BRUSH_R * 2, 12, (g) => {
    g.fillStyle(0xe8ecf0).fillRect(0, 4, BRUSH_R * 2 - 24, 4);
    g.fillStyle(0x9aa4b0).fillRect(BRUSH_R * 2 - 26, 3, 3, 6);
    g.fillStyle(0x3a5ab0).fillEllipse(BRUSH_R * 2 - 12, 6, 24, 12);
    g.lineStyle(1, 0x6a8ae0);
    for (let x = BRUSH_R * 2 - 21; x < BRUSH_R * 2 - 3; x += 4) g.lineBetween(x, 1, x, 11);
  });
  bake(scene, COURSE_SPARK_TEXTURE, SPARK_PX, SPARK_PX, (g) => {
    g.fillStyle(0xffffff).fillRect(0, 0, SPARK_PX, SPARK_PX);
  });
  // A big bullseye on a tall striped post: the post rises out of the chasm, so the target
  // stands in the open where a child at the edge can see it, not on the far side off screen.
  bake(scene, COURSE_TARGET_TEXTURE, TARGET_PX, TARGET_PX + POST_PX, (g) => {
    const c = TARGET_PX / 2;
    for (let y = TARGET_PX - 4; y < TARGET_PX + POST_PX; y += 8) {
      g.fillStyle(0xffffff).fillRect(c - 2, y, 4, 4);
      g.fillStyle(0xff3344).fillRect(c - 2, y + 4, 4, 4);
    }
    g.fillStyle(0x000000, 0.35).fillCircle(c, c + 1, c);
    const rings = [0xff3344, 0xffffff, 0xff3344, 0xffffff, 0xff3344];
    rings.forEach((color, i) => g.fillStyle(color).fillCircle(c, c, c - 1 - i * 2.2));
    g.fillStyle(0xffdd00).fillCircle(c, c, 2.5);
  });
  bake(scene, COURSE_GLOW_TEXTURE, GLOW_PX, GLOW_PX, (g) => {
    const c = GLOW_PX / 2;
    for (let r = c; r > 0; r -= 2) g.fillStyle(0xffee55, 0.08).fillCircle(c, c, r);
  });
  bake(scene, COURSE_POLE_TEXTURE, 3, TILE * 3, (g) => {
    g.fillStyle(0xdddddd).fillRect(0, 0, 3, TILE * 3);
    g.fillStyle(0xffcc00).fillCircle(1.5, 1.5, 1.5);
  });
  bake(scene, COURSE_FLAG_TEXTURE, 12, 9, (g) => {
    g.fillStyle(0xffffff).fillTriangle(0, 0, 12, 4.5, 0, 9);
  });
  // The home world's checkpoint: a little pink potty.
  bake(scene, COURSE_POTTY_TEXTURE, 16, 12, (g) => {
    g.fillStyle(0xff8fc0).fillRoundedRect(2, 3, 12, 9, { tl: 1, tr: 1, bl: 4, br: 4 });
    g.fillStyle(0xffd0e6).fillRect(0, 2, 16, 3);
    g.fillStyle(0xc05a90).fillRect(14, 4, 2, 4);
    g.fillStyle(0xffffff, 0.6).fillRect(4, 6, 2, 4);
  });
  // A tap out of the wall, its spout over the middle of the tile, a blue cold-water handle.
  bake(scene, COURSE_TAP_TEXTURE, TILE, TILE, (g) => {
    g.fillStyle(0xb8c0c8).fillRect(0, 5, 10, 4).fillRect(6, 9, 4, 6);
    g.fillStyle(0xeef2f6).fillRect(0, 5, 10, 1).fillRect(6, 9, 1, 6);
    g.fillStyle(0x5ab0ff).fillRect(2, 1, 6, 3);
    g.fillStyle(TAP_GREY).fillRect(4, 3, 2, 2);
  });
}

/** The course's tiles only, as Phaser data: every other code is drawn by gfx/tiles.ts. */
function courseOnly(code: number): number {
  return code === TILE_CRACKED || code === TILE_SPRING || code === TILE_PLANK || code === TILE_GATE
    || code === TILE_LAVA || code === TILE_ICE || code === TILE_WATER ? code : -1;
}

interface StationView {
  readonly station: () => StationState;
  readonly box: Phaser.GameObjects.Container;
  shown: boolean;
}

interface FlagView {
  readonly x: number;
  /** The flag's cloth, or the home world's potty. */
  readonly cloth: Phaser.GameObjects.Image;
  readonly top: number;
  raised: boolean;
  readonly potty: boolean;
}

interface TargetView {
  readonly target: () => TargetState;
  readonly image: Phaser.GameObjects.Image;
  readonly glow: Phaser.GameObjects.Image;
  readonly restY: number;
  hit: boolean;
}

export class CourseView {
  private readonly layer: Phaser.Tilemaps.TilemapLayer;
  /** The Arcade static bodies giants stand in. Handed to the player's mover as a solid. */
  readonly giants: Phaser.Physics.Arcade.StaticGroup;
  private readonly giantZones = new Map<EnemyState, Phaser.GameObjects.Zone>();
  private readonly stations: StationView[];
  private readonly flags: FlagView[];
  private readonly targets: TargetView[];
  private readonly chunks: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly dust: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Embers off the lava, a splash when someone falls in, a burst from an erupting vent. */
  private readonly embers: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Spray when someone falls into icy water. */
  private readonly spray: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Vents glowing before they erupt, redrawn every frame. */
  private readonly ventGlow: Phaser.GameObjects.Graphics;
  /** Every lava cell, for the embers to rise from: the lava never moves. */
  private readonly lavaCells: Array<{ x: number; y: number }> = [];
  /** The home world's taps, each with the drop that swells at its spout before it falls. */
  private readonly taps: Array<{ x: number; y: number; drop: Phaser.GameObjects.Image }> = [];
  /** Its toilet brushes, one image each, turned every frame; and a pool of bubble images. */
  private readonly brushes: Phaser.GameObjects.Image[] = [];
  private readonly bubbles: Phaser.GameObjects.Image[] = [];
  /** Its rubber ducks, drawn at twice the bathroom's decor ducks, their backs where a rider stands. */
  private readonly ducks: Phaser.GameObjects.Image[] = [];
  private drawnCourse: CourseState | null = null;
  private drawnVersion = -1;
  private lastRoar = -999;

  constructor(private readonly scene: Phaser.Scene, world: World) {
    registerCourseTextures(scene);
    const course = world.course;
    if (!course) throw new Error('a CourseView needs a level with a course');

    const tilemap = scene.make.tilemap({
      data: world.map.map((row) => row.map(courseOnly)),
      tileWidth: TILE,
      tileHeight: TILE,
    });
    // At home a gate is a shower curtain.
    const tiles = world.level.home ? COURSE_TILES_HOME_TEXTURE : COURSE_TILES_TEXTURE;
    const tileset = tilemap.addTilesetImage(tiles, tiles, TILE, TILE, 0, 0);
    if (!tileset) throw new Error('the course tileset is not a texture');
    const layer = tilemap.createLayer(0, tileset, 0, 0, false);
    if (!layer || !('culledTiles' in layer)) throw new Error('the course tilemap has no layer 0');
    this.layer = layer.setDepth(DEPTH_COURSE_TILES);
    this.drawnCourse = course;
    this.drawnVersion = course.mapVersion;

    this.giants = scene.physics.add.staticGroup();

    this.targets = course.targets.map((t, i) => {
      // The bullseye's centre on the box's, which sits at chest height.
      const cx = t.box.x + t.box.w / 2;
      const cy = t.box.y + t.box.h / 2;
      const glow = scene.add.image(cx, cy, COURSE_GLOW_TEXTURE).setDepth(DEPTH_COURSE_THINGS);
      const image = scene.add
        .image(cx, cy - TARGET_PX / 2, COURSE_TARGET_TEXTURE)
        .setOrigin(0.5, 0)
        .setDepth(DEPTH_COURSE_THINGS);
      const view = { target: () => this.currentCourse().targets[i], image, glow, restY: image.y, hit: false };
      this.idleTarget(view);
      return view;
    });

    this.stations = course.stations.map((s, i) => ({
      station: () => this.currentCourse().stations[i],
      box: this.stationBox(s.kind, s.x + TILE / 2, s.y + TILE / 2),
      shown: true,
    }));

    this.flags = course.flags.map((f) => {
      const x = f.x * TILE + TILE / 2;
      const groundY = f.y * TILE;
      if (world.level.home) {
        // The home world's checkpoints are potties: grey until reached.
        const potty = scene.add.image(x, groundY, COURSE_POTTY_TEXTURE).setOrigin(0.5, 1)
          .setTint(FLAG_DOWN).setDepth(DEPTH_COURSE_THINGS);
        return { x: f.x, cloth: potty, top: groundY, raised: false, potty: true };
      }
      scene.add.image(x, groundY, COURSE_POLE_TEXTURE).setOrigin(0.5, 1).setDepth(DEPTH_COURSE_THINGS);
      const cloth = scene.add
        .image(x + 1, groundY - 4, COURSE_FLAG_TEXTURE)
        .setOrigin(0, 1)
        .setTint(FLAG_DOWN)
        .setDepth(DEPTH_COURSE_THINGS);
      return { x: f.x, cloth, top: groundY - TILE * 3 + 10, raised: false, potty: false };
    });

    for (let i = 0; i < course.ducks.length; i++) {
      const duck = scene.add.image(0, 0, DUCK_TEXTURE).setOrigin(0, 0).setDepth(DEPTH_COURSE_THINGS);
      this.ducks.push(duck.setScale(spriteScale(duck) * 2));
    }
    for (const s of course.soaps) {
      scene.add.image(s.x * TILE + TILE / 2, s.y * TILE, COURSE_SOAP_TEXTURE).setOrigin(0.5, 1).setDepth(DEPTH_COURSE_THINGS);
    }
    for (const b of course.brushes) {
      this.brushes.push(scene.add.image(b.x, b.y, COURSE_BRUSH_TEXTURE).setOrigin(0.5, 0.5).setDepth(DEPTH_COURSE_THINGS));
    }
    for (const t of course.taps) {
      scene.add.image(t.x * TILE, t.y * TILE, COURSE_TAP_TEXTURE).setOrigin(0, 0).setDepth(DEPTH_COURSE_THINGS);
      const drop = scene.add.image(t.x * TILE + TILE / 2, (t.y + 1) * TILE - 1, DROP_TEXTURE)
        .setOrigin(0.5, 0).setDepth(DEPTH_COURSE_THINGS).setVisible(false);
      this.taps.push({ x: t.x, y: t.y, drop });
    }

    this.chunks = scene.add.particles(0, 0, COURSE_SPARK_TEXTURE, {
      emitting: false,
      lifespan: 900,
      speedX: { min: -90, max: 90 },
      speedY: { min: -180, max: -40 },
      scale: { min: 1.2, max: 2.4 },
      rotate: { start: 0, end: 360 },
      tint: [CRACKED_FILL, CRACK_LINE, 0xd6b089],
      gravityY: 600,
    }).setDepth(DEPTH_COURSE_FX);
    this.sparks = scene.add.particles(0, 0, COURSE_SPARK_TEXTURE, {
      emitting: false,
      lifespan: 1200,
      speed: { min: 60, max: 200 },
      scale: { start: 1.6, end: 0 },
      rotate: { start: 0, end: 360 },
      tint: CONFETTI,
      gravityY: 220,
    }).setDepth(DEPTH_COURSE_FX);
    this.dust = scene.add.particles(0, 0, COURSE_SPARK_TEXTURE, {
      emitting: false,
      lifespan: 500,
      speedX: { min: -40, max: 40 },
      speedY: { min: -40, max: 0 },
      scale: { start: 1.4, end: 0 },
      tint: [0xe8d2a8, 0xffffff],
      alpha: { start: 0.9, end: 0 },
    }).setDepth(DEPTH_COURSE_FX);
    this.embers = scene.add.particles(0, 0, COURSE_SPARK_TEXTURE, {
      emitting: false,
      lifespan: 900,
      speedX: { min: -20, max: 20 },
      speedY: { min: -90, max: -30 },
      scale: { start: 1.3, end: 0 },
      tint: EMBERS,
      gravityY: 40,
    }).setDepth(DEPTH_COURSE_FX);
    this.spray = scene.add.particles(0, 0, COURSE_SPARK_TEXTURE, {
      emitting: false,
      lifespan: 700,
      speedX: { min: -60, max: 60 },
      speedY: { min: -200, max: -80 },
      scale: { start: 1.5, end: 0.2 },
      tint: SPRAY,
      gravityY: 500,
    }).setDepth(DEPTH_COURSE_FX);
    this.ventGlow = scene.add.graphics().setDepth(DEPTH_COURSE_TILES + 0.5);
    // A bath's foam, along its top row only (the tileset draws every water cell the same).
    if (world.level.home) {
      const foam = scene.add.graphics().setDepth(DEPTH_COURSE_TILES + 0.4);
      world.map.forEach((row, ty) => row.forEach((code, tx) => {
        if (code !== TILE_WATER || world.map[ty - 1]?.[tx] === TILE_WATER) return;
        const x = tx * TILE;
        const y = ty * TILE;
        foam.fillStyle(0x9fd8f0).fillRect(x, y, TILE, 4);
        foam.fillStyle(0xffffff, 0.9).fillCircle(x + 3, y + 2, 2).fillCircle(x + 9, y + 1.5, 1.5).fillCircle(x + 13, y + 2.5, 2);
      }));
    }
    world.map.forEach((row, ty) => row.forEach((code, tx) => {
      // Only the surface: the top cell of each run of lava.
      if (code === TILE_LAVA && world.map[ty - 1]?.[tx] !== TILE_LAVA) this.lavaCells.push({ x: tx, y: ty });
    }));
  }

  /** The course the World holds NOW: a respawn replaces it with a fresh one. */
  private currentCourse(): CourseState {
    return this.drawnCourse as CourseState;
  }

  /**
   * A station: the bow and the cape are the adventure's own pickup sprites, the three silly
   * ones the emoji their announcement shows. All in a coloured bubble that bobs.
   */
  private stationBox(kind: StationKind, x: number, y: number): Phaser.GameObjects.Container {
    const color = kind === 'bow' ? 0xffcc66 : kind === 'cape' ? 0xff6688
      : Phaser.Display.Color.HexStringToColor(POWERUP_INFO[kind].color).color;
    const bubble = this.scene.add.graphics();
    bubble.fillStyle(color, 0.35).fillCircle(0, 0, 11);
    bubble.lineStyle(1, 0xffffff, 0.8).strokeCircle(0, 0, 11);
    let icon: Phaser.GameObjects.GameObject;
    if (kind === 'bow' || kind === 'cape') {
      const image = this.scene.add.image(0, 0, kind === 'bow' ? BOW_TEXTURE : SUPER_TEXTURE);
      icon = image.setScale(spriteScale(image));
    } else {
      icon = this.scene.add
        .text(0, 0, POWERUP_INFO[kind].icon, { fontSize: '13px', resolution: WORLD_TEXT_RESOLUTION })
        .setOrigin(0.5, 0.5);
    }
    const box = this.scene.add.container(x, y, [bubble, icon]).setDepth(DEPTH_COURSE_THINGS);
    this.scene.tweens.add({
      targets: box, y: y - 3, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    return box;
  }

  /** The player's mover collides with these; this is where a giant's bump turns into a roar. */
  onGiantBump(world: World): void {
    if (world.animFrame - this.lastRoar < 50) return;
    this.lastRoar = world.animFrame;
    world.sounds.push('boss-roar');
    this.scene.cameras.main.shake(160, 0.006);
  }

  /** Once per rendered frame, after the steps: bring the picture up to what the World says. */
  update(world: World): void {
    const course = world.course;
    if (!course) return;
    if (course !== this.drawnCourse || course.mapVersion !== this.drawnVersion) {
      this.drawnCourse = course;
      this.drawnVersion = course.mapVersion;
      this.syncLayer(world);
    }
    this.playFx(course);
    this.syncStations();
    this.syncTargets();
    this.syncFlags(world);
    this.syncGiants(world);
    this.syncLava(world, course);
    this.syncTaps(world, course);
    this.syncBubbles(course);
    course.brushes.forEach((b, i) => this.brushes[i]?.setRotation(b.angle));
    // A duck's back is four of its eight rows down; it bobs, and faces the way it drifts.
    course.ducks.forEach((d, i) => this.ducks[i]
      ?.setPosition(d.x, d.y - 16 + Math.sin(world.animFrame * 0.08 + i) * 1.2)
      .setFlipX(d.dir < 0));
  }

  /**
   * The bubbles: each grows out of its soap dish as it starts to rise, sways a little, and is
   * drawn from its top, where a rider stands, so the hero's feet are on it (game/course.ts).
   */
  private syncBubbles(course: CourseState): void {
    course.bubbles.forEach((b, i) => {
      let image = this.bubbles[i];
      if (!image) {
        image = this.scene.add.image(0, 0, COURSE_BUBBLE_TEXTURE).setOrigin(0.5, 0).setDepth(DEPTH_COURSE_THINGS);
        this.bubbles[i] = image;
      }
      const size = Math.min(BUBBLE_W, 8 + (b.from - b.y)) / BUBBLE_W;
      image.setVisible(true).setScale(size)
        .setPosition(b.x + BUBBLE_W / 2 + Math.sin((b.age + i * 20) * 0.08) * 1.5, b.y - 1);
    });
    for (let i = course.bubbles.length; i < this.bubbles.length; i++) this.bubbles[i].setVisible(false);
  }

  /** A drop swells at a tap's spout while it wobbles, then lets go (game/course.ts). */
  private syncTaps(world: World, course: CourseState): void {
    course.taps.forEach((t, i) => {
      const view = this.taps[i];
      if (!view) return;
      const swelling = tapWarning(t);
      view.drop.setVisible(swelling);
      if (!swelling) return;
      const k = 1 - t.timer / TAP_WARN_FRAMES;
      view.drop.setScale(spriteScale(view.drop) * (0.3 + 0.7 * k))
        .setX(view.x * TILE + TILE / 2 + Math.sin(world.animFrame * 0.8) * k);
    });
  }

  /** Vents glow before they erupt; now and then an ember rises off lava near the hero. */
  private syncLava(world: World, course: CourseState): void {
    const g = this.ventGlow.clear();
    for (const v of course.vents) {
      if (!ventWarning(v)) continue;
      const pulse = 0.45 + Math.sin(world.animFrame * 0.4) * 0.25;
      g.fillStyle(LAVA_BRIGHT, pulse).fillCircle(v.x * TILE + TILE / 2, v.y * TILE + 2, 7);
    }
    if (this.lavaCells.length === 0 || world.animFrame % 10 !== 0) return;
    const px = world.player.x / TILE;
    const near = this.lavaCells.filter((c) => Math.abs(c.x - px) < 16);
    const cell = near[Math.floor(Math.random() * near.length)];
    if (cell) this.embers.explode(2, cell.x * TILE + Math.random() * TILE, cell.y * TILE + 2);
  }

  /** Puts and removes only the cells that changed, so Phaser re-uploads almost nothing. */
  private syncLayer(world: World): void {
    for (let ty = 0; ty < world.map.length; ty++) {
      const row = world.map[ty];
      for (let tx = 0; tx < row.length; tx++) {
        const want = courseOnly(row[tx]);
        const have = this.layer.getTileAt(tx, ty, true)?.index ?? -1;
        if (want === have) continue;
        if (want === -1) this.layer.removeTileAt(tx, ty);
        else this.layer.putTileAt(want, tx, ty);
      }
    }
  }

  private playFx(course: CourseState): void {
    for (const fx of course.fx.splice(0)) {
      switch (fx.kind) {
        case 'smash': this.chunks.explode(6, fx.x, fx.y); break;
        case 'plank': this.dust.explode(5, fx.x, fx.y); break;
        case 'gate': this.chunks.explode(4, fx.x, fx.y); break;
        case 'splash': (fx.water ? this.spray : this.embers).explode(24, fx.x, fx.y); break;
        case 'vent': this.embers.explode(12, fx.x, fx.y); break;
        case 'drip': this.spray.explode(6, fx.x, fx.y); break;
        case 'pop': this.spray.explode(10, fx.x, fx.y); break;
        case 'target': this.sparks.explode(40, fx.x, fx.y); break;
        case 'flag': this.sparks.explode(24, fx.x, fx.y); break;
        case 'spring': this.dust.explode(8, fx.x, fx.y); break;
        case 'station': this.sparks.explode(10, fx.x, fx.y); break;
      }
    }
  }

  private syncStations(): void {
    for (const view of this.stations) {
      const show = view.station().cooldown === 0;
      if (show === view.shown) continue;
      view.shown = show;
      if (show) {
        view.box.setVisible(true).setScale(0);
        this.scene.tweens.add({ targets: view.box, scale: 1, duration: 350, ease: 'Back.easeOut' });
      } else {
        view.box.setVisible(false);
      }
    }
  }

  /**
   * What a target does until it is hit: a wobble, and a glow behind it that breathes, so it
   * reads as the thing to aim at from across the screen.
   */
  private idleTarget(view: TargetView): void {
    view.image.setPosition(view.image.x, view.restY).setScale(1).setAlpha(1).setAngle(0);
    view.glow.setVisible(true).setScale(1).setAlpha(0.9);
    this.scene.tweens.add({
      targets: view.image, angle: { from: -5, to: 5 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    this.scene.tweens.add({
      targets: view.glow, scale: { from: 0.8, to: 1.35 }, alpha: { from: 1, to: 0.45 },
      duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  private syncTargets(): void {
    for (const view of this.targets) {
      const hit = view.target().hit;
      if (hit === view.hit) continue;
      view.hit = hit;
      this.scene.tweens.killTweensOf([view.image, view.glow]);
      if (hit) {
        view.image.setAngle(0);
        view.glow.setVisible(false);
        // Spun round, then sunk back into the chasm while the bridge comes down.
        this.scene.tweens.chain({
          targets: view.image,
          tweens: [
            { scaleX: { from: 1, to: -1 }, duration: 140, yoyo: true, repeat: 2 },
            { y: view.restY + TARGET_PX + POST_PX, alpha: 0, duration: 700, ease: 'Back.easeIn' },
          ],
        });
      } else {
        // A respawn put it back.
        this.idleTarget(view);
      }
    }
  }

  private syncFlags(world: World): void {
    const reached = world.checkpoint?.x ?? -1;
    for (const view of this.flags) {
      const raised = view.x <= reached;
      if (raised === view.raised) continue;
      view.raised = raised;
      this.scene.tweens.killTweensOf(view.cloth);
      if (view.potty) {
        // A potty reached: its own colours, and a hop.
        if (raised) {
          view.cloth.clearTint();
          this.scene.tweens.add({ targets: view.cloth, y: view.top - 6, duration: 160, yoyo: true, ease: 'Quad.easeOut' });
        } else {
          view.cloth.setTint(FLAG_DOWN).setY(view.top);
        }
        continue;
      }
      view.cloth.setTint(raised ? FLAG_UP : FLAG_DOWN);
      if (raised) {
        this.scene.tweens.add({ targets: view.cloth, y: view.top, duration: 700, ease: 'Cubic.easeOut' });
      }
    }
  }

  /**
   * One static body per standing giant, built when the giant streams in and destroyed when
   * it stops being one — turned into a chicken, or thrown away by a respawn.
   */
  private syncGiants(world: World): void {
    const standing = new Set(world.enemies.filter((e) => e.alive && e.type === 'giant'));
    for (const [enemy, zone] of this.giantZones) {
      if (standing.has(enemy)) continue;
      // A ray made a chicken of him: a burst of confetti and a puff where he stood.
      if (enemy.alive && enemy.isChicken) {
        this.sparks.explode(30, zone.x, zone.y);
        this.dust.explode(24, zone.x, zone.y + zone.height / 2);
      }
      this.giants.remove(zone, true, true);
      this.giantZones.delete(enemy);
    }
    for (const enemy of standing) {
      if (this.giantZones.has(enemy)) continue;
      const zone = this.scene.add.zone(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, enemy.w, enemy.h);
      this.scene.physics.add.existing(zone, true);
      this.giants.add(zone);
      this.giantZones.set(enemy, zone);
    }
  }
}
