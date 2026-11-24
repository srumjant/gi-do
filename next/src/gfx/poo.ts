import type Phaser from 'phaser';
import { sfxFlush } from '../audio/sfx';
import {
  POO_SPAT_FRAMES, POO_W, SPIT_FLIGHT, SUCK_FRAMES, type PooFx, type PooState,
} from '../game/bosses/poo';
import type { World } from '../game/types';
import { BossShowView } from './bossShow';
import { COURSE_GLOW_TEXTURE, COURSE_SPARK_TEXTURE } from './course';
import {
  BATHTUB_TEXTURE, DUCK_TEXTURE, FLUSH_BUTTON_TEXTURE, FLY_TEXTURE, LID_TEXTURE, POO_TEXTURE, QUEEN_HEART_TEXTURE, spriteScale, TOILET_TEXTURE,
} from './textures';

/** With the other bosses (SliceScene's DEPTH_BOSS), his effects over everything in the world. */
const DEPTH = 17;
const DEPTH_FX = 22.5;
/** The bathroom's things: in front of the wall, behind the hero and the poo. */
const DEPTH_DECOR = 3;
const STINK = [0x8fcf4a, 0xc8f080, 0x4f7f24];
const SPLAT = [0x7b4a1e, 0xb07a3c, 0x3d2410];
const WATER = [0x7ec8f0, 0xbfe6ff, 0xffffff];
const FLIES = 3;
/**
 * The giant toilet at 3: 48 wide, 60 tall. Its tank's front is at its middle; its bowl's rim 42
 * up, the water just under it; the bowl's opening, in front of where the open lid stands, 15
 * left of its middle.
 */
const RIM_UP = 42;
const BOWL_UP = 36;
const BOWL_LEFT = 15;
/**
 * The lid covers the whole seat, from the bowl's front to the tank, hinged at its back end on
 * the rim at the tank's front. It opens 45 degrees (owner, 2026-11-24), and lies just behind the
 * toilet, so its back corner tucks under the tank's edge as it tips up.
 */
const LID_HINGE = 0;
const LID_OPEN = 45;
/** The flush button sits on top of the tank, this far right of the toilet's middle, 60 up. */
const BUTTON_RIGHT = 12;
const TANK_UP = 60;
/** The pull into the toilet, as parts of it: along the floor, then lifted over the rim, then round and down the bowl. */
const LIFT_AT = 0.3;
const SINK_AT = 0.55;
/** How much of him goes down with each flush, by the end of the whirl. */
const SWALLOWED = 0.45;

/**
 * How Härra Kaka looks (his rules are game/bosses/poo.ts): his sprite, stretching as he hops,
 * dragged long toward the toilet as the flush sucks him in and flat where he is spat back out;
 * flies buzzing round his head, a heart for each flush left; a puff of green at every plop;
 * the bathroom's bathtub with its rubber ducks and its giant toilet, whose lid springs open when
 * the hero lands on the glowing red flush button on top of its tank; the boss show (gfx/bossShow.ts); and at
 * the end, a whirl in the bowl, a swoosh, and he is flushed away for good. Phaser images, tweens
 * and particle emitters, as the other bosses.
 */
export class PooView {
  private readonly body: Phaser.GameObjects.Image;
  private readonly hearts: Phaser.GameObjects.Image[];
  private readonly flies: Phaser.GameObjects.Image[];
  private readonly toilet: Phaser.GameObjects.Image;
  /** The lid on the toilet's rim, hinged at the tank; and the flush button on the tank, glowing to be pressed. */
  private readonly lid: Phaser.GameObjects.Image;
  private readonly button: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly bathtub: Phaser.GameObjects.Image;
  private readonly ducks: Phaser.GameObjects.Image[];
  private readonly stink: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly splat: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly water: Phaser.GameObjects.Particles.ParticleEmitter;
  /** What he says and how he moves. */
  private readonly show: BossShowView;
  /** The state last drawn: a respawn rebuilds the level, and with it a fresh poo. */
  private drawn: PooState | null = null;
  private phase: string | null = null;
  /** Beaten: where the flush has him, and whether he is gone. */
  private readonly flush = { x: 0, y: 0, angle: 0, scale: 1 };
  private flushed = false;

  constructor(private readonly scene: Phaser.Scene) {
    const image = (key: string, depth: number) => {
      const im = scene.add.image(0, 0, key).setDepth(depth).setVisible(false);
      return im.setScale(spriteScale(im));
    };
    this.toilet = image(TOILET_TEXTURE, DEPTH_DECOR).setOrigin(0.5, 1);
    this.glow = image(COURSE_GLOW_TEXTURE, DEPTH_DECOR + 0.05);
    // Behind the toilet, and behind the poo whirling in its bowl.
    this.lid = image(LID_TEXTURE, DEPTH_DECOR - 0.2).setOrigin(1, 1);
    this.button = image(FLUSH_BUTTON_TEXTURE, DEPTH_DECOR + 0.2).setOrigin(0.5, 1);
    scene.tweens.add({
      targets: this.glow, scale: { from: 0.5, to: 0.85 }, alpha: { from: 0.9, to: 0.4 },
      duration: 550, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    this.bathtub = image(BATHTUB_TEXTURE, DEPTH_DECOR).setOrigin(0.5, 1);
    this.ducks = [0, 1, 2].map(() => image(DUCK_TEXTURE, DEPTH_DECOR + 0.1).setOrigin(0.5, 1));
    this.body = image(POO_TEXTURE, DEPTH).setOrigin(0.5, 1);
    this.hearts = [0, 1, 2].map(() => image(QUEEN_HEART_TEXTURE, DEPTH).setScale(0.5));
    this.flies = Array.from({ length: FLIES }, () => image(FLY_TEXTURE, DEPTH + 0.2).setOrigin(0.5, 0.5).setScale(1.5));
    const burst = (tint: number[], lifespan: number, gravityY: number, speed: number) => scene.add.particles(0, 0, COURSE_SPARK_TEXTURE, {
      emitting: false,
      lifespan,
      speed: { min: speed * 0.3, max: speed },
      scale: { start: 2, end: 0.3 },
      alpha: { start: 0.9, end: 0 },
      gravityY,
      tint,
    }).setDepth(DEPTH_FX);
    this.stink = burst(STINK, 900, -30, 70);
    this.splat = burst(SPLAT, 700, 300, 180);
    this.water = burst(WATER, 900, 200, 160);
    this.show = new BossShowView(scene, 'poo');
  }

  /** Once per rendered frame, after the steps. */
  update(world: World): void {
    const b = world.courseBoss;
    if (!b || b.kind !== 'poo') {
      this.hideAll();
      this.show.hide();
      return;
    }
    if (b !== this.drawn) this.reset(b);
    const fx = b.fx.splice(0);
    for (const f of fx) this.playFx(f);
    if (b.phase !== this.phase) this.changePhase(b);
    this.place(b, world.animFrame);
    this.show.update(world, b, fx.map((f) => f.kind), [this.body], [this.body], this.hearts);
  }

  private hideAll(): void {
    for (const im of [this.body, this.toilet, this.lid, this.button, this.glow, this.bathtub, ...this.ducks, ...this.hearts, ...this.flies]) im.setVisible(false);
  }

  private reset(b: PooState): void {
    this.drawn = b;
    this.phase = null;
    this.flushed = false;
    this.scene.tweens.killTweensOf([this.flush, ...this.flies]);
    this.body.setVisible(true).setAlpha(1).setAngle(0).setDepth(DEPTH);
    for (const f of this.flies) f.setAlpha(1);
    // The bathroom: the bathtub just inside the door with two ducks on its rim and one on the
    // floor, the giant toilet at the far end, before the cage's step.
    const tubX = b.patrol[0] - 6;
    this.bathtub.setVisible(true).setPosition(tubX, b.floorY);
    const rim = b.floorY - this.bathtub.displayHeight + 3;
    this.ducks[0].setVisible(true).setPosition(tubX - 18, rim);
    this.ducks[1].setVisible(true).setPosition(tubX + 14, rim).setFlipX(true);
    this.ducks[2].setVisible(true).setPosition(tubX + 52, b.floorY);
    this.toilet.setVisible(true).setPosition(b.toiletX, b.floorY);
    // The lid lies along the rim, hinged at its back end just in front of the tank.
    this.scene.tweens.killTweensOf(this.lid);
    this.lid.setVisible(true).setAngle(0).setPosition(b.toiletX - LID_HINGE, b.floorY - RIM_UP);
    this.scene.tweens.killTweensOf(this.button);
    this.button.setVisible(true).setScale(spriteScale(this.button)).setPosition(b.toiletX + BUTTON_RIGHT, b.floorY - TANK_UP);
    this.glow.setVisible(true).setPosition(b.toiletX + BUTTON_RIGHT, b.floorY - TANK_UP - 3);
  }

  private playFx(fx: PooFx): void {
    switch (fx.kind) {
      case 'press': {
        // The button goes down, the lid springs up and stands open against the tank, throwing the
        // hero, and the super flush roars. The lid stays open until he has been spat back out.
        const tweens = this.scene.tweens;
        const pressedY = spriteScale(this.button) * 0.4;
        tweens.killTweensOf([this.lid, this.button]);
        this.button.setScale(spriteScale(this.button));
        tweens.add({ targets: this.button, scaleY: pressedY, duration: 80, yoyo: true, hold: 250, ease: 'Quad.easeOut' });
        tweens.add({ targets: this.lid, angle: LID_OPEN, duration: 160, delay: 60, ease: 'Back.easeOut' });
        sfxFlush();
        this.water.explode(30, this.toilet.x - BOWL_LEFT, this.toilet.y - BOWL_UP);
        this.scene.cameras.main.shake(160, 0.003);
        break;
      }
      case 'hit':
        // A piece of him goes down the bowl.
        this.water.explode(24, this.toilet.x - BOWL_LEFT, this.toilet.y - BOWL_UP);
        this.splat.explode(14, this.toilet.x - BOWL_LEFT, this.toilet.y - BOWL_UP);
        break;
      case 'spit':
        // Out he comes, in a spray of water, and the lid slams shut behind him.
        this.water.explode(20, this.toilet.x - BOWL_LEFT, this.toilet.y - BOWL_UP);
        this.scene.tweens.killTweensOf(this.lid);
        this.scene.tweens.add({ targets: this.lid, angle: 0, duration: 300, delay: 250, ease: 'Bounce.easeOut' });
        break;
      case 'plop':
        this.stink.explode(14, fx.x, fx.y - 4);
        this.scene.cameras.main.shake(90, 0.003);
        break;
      case 'wake':
        this.stink.explode(20, fx.x, fx.y);
        break;
      case 'thud':
        this.splat.explode(5, fx.x, fx.y);
        break;
      default:
        break;
    }
  }

  private changePhase(b: PooState): void {
    const was = this.phase;
    this.phase = b.phase;
    if (b.phase !== 'defeated') return;
    // Beaten: the last of him, already whirling in the bowl, goes round once more and down for
    // good, and the lid comes down after him.
    const tweens = this.scene.tweens;
    const bowlX = this.toilet.x - BOWL_LEFT;
    const bowlY = b.floorY - BOWL_UP;
    const fromBowl = was === 'sucked';
    Object.assign(this.flush, fromBowl
      ? { x: bowlX, y: bowlY + 6, angle: this.body.angle, scale: (b.w / POO_W) * (1 - SWALLOWED) }
      : { x: b.x + b.w / 2, y: b.floorY, angle: 0, scale: b.w / POO_W });
    tweens.chain({
      targets: this.flush,
      tweens: [
        ...(fromBowl ? [] : [
          { y: b.floorY - 4, duration: 500, ease: 'Sine.easeInOut' },
          { x: bowlX, y: bowlY - 46, duration: 500, ease: 'Quad.easeOut' },
          { y: bowlY + 4, duration: 300, ease: 'Quad.easeIn' },
        ]),
        {
          // Down into the bowl: behind the toilet now, so its front hides him as he sinks.
          angle: 900, scale: 0, y: bowlY + 8, duration: 1100, ease: 'Quad.easeIn',
          onStart: () => {
            this.body.setDepth(DEPTH_DECOR - 0.1);
            sfxFlush();
            this.water.explode(40, bowlX, bowlY);
            this.scene.cameras.main.shake(400, 0.004);
          },
        },
      ],
      onComplete: () => {
        this.flushed = true;
        this.water.explode(20, bowlX, bowlY);
        tweens.add({ targets: this.lid, angle: 0, duration: 300, ease: 'Bounce.easeOut' });
      },
    });
    // The flies, left with nothing to buzz round, fly off.
    this.flies.forEach((f, i) => {
      tweens.add({ targets: f, x: f.x + (i - 1) * 90, y: f.y - 140, alpha: 0, duration: 1800, delay: 2300 + i * 120 });
    });
  }

  /** Where everything stands this frame. */
  private place(b: PooState, animFrame: number): void {
    const base = spriteScale(this.body);
    if (b.phase === 'defeated') {
      this.glow.setVisible(false);
      // Turning about his middle, so a whirl in the bowl stays in the bowl.
      const h = this.body.height * base * this.flush.scale;
      this.body.setVisible(!this.flushed).setOrigin(0.5, 0.5).setPosition(this.flush.x, this.flush.y - h / 2)
        .setAngle(this.flush.angle).setScale(base * this.flush.scale);
      for (const h of this.hearts) h.setVisible(false);
      return;
    }
    const cx = b.x + b.w / 2;
    const size = b.w / POO_W;
    const sucked = b.phase === 'sucked';
    const flying = b.phase === 'spat' && POO_SPAT_FRAMES - b.timer < SPIT_FLIGHT;
    const squashed = b.phase === 'spat' && !flying;
    const bowlX = this.toilet.x - BOWL_LEFT;
    const bowlY = this.toilet.y - BOWL_UP;
    // His height at his size, before any stretch: the in-air parts turn him about his middle.
    const h = this.body.height * base * size;
    this.body.setVisible(true).setFlipX(b.facing > 0).setDepth(DEPTH);
    if (sucked) {
      const k = 1 - b.timer / SUCK_FRAMES;
      if (k < LIFT_AT) {
        // Dragged along the floor, leaning toward the toilet.
        this.body.setOrigin(0.5, 1).setPosition(cx, b.floorY)
          .setAngle(12 + Math.sin(animFrame * 0.6) * 6).setScale(base * size * 1.3, base * size * 0.8);
      } else if (k < SINK_AT) {
        // Pulled up off the floor and over the rim, stretched long and turning.
        const u = (k - LIFT_AT) / (SINK_AT - LIFT_AT);
        this.body.setOrigin(0.5, 0.5)
          .setPosition(cx + (bowlX - cx) * u, b.floorY - h / 2 + (bowlY - h * 0.3 - (b.floorY - h / 2)) * u - 34 * Math.sin(Math.PI * u))
          .setAngle(u * 360).setScale(base * size * 0.8, base * size * 1.3);
      } else {
        // Round and round and down the bowl, behind its front, a piece of him going with each turn.
        const u = (k - SINK_AT) / (1 - SINK_AT);
        const left = 1 - SWALLOWED * u;
        this.body.setDepth(DEPTH_DECOR - 0.1).setOrigin(0.5, 0.5)
          .setPosition(bowlX, bowlY - h * 0.3 + u * 8).setAngle(360 + u * 1080).setScale(base * size * left);
        if (animFrame % 3 === 0) {
          const a = animFrame * 0.5;
          this.water.explode(2, bowlX + Math.cos(a) * 10, bowlY + Math.sin(a) * 3);
        }
      }
    } else if (flying) {
      // Spat back out of the bowl, up in an arc and down where he lands.
      const u = (POO_SPAT_FRAMES - b.timer) / SPIT_FLIGHT;
      this.body.setDepth(u < 0.15 ? DEPTH_DECOR - 0.1 : DEPTH).setOrigin(0.5, 0.5)
        .setPosition(bowlX + (cx - bowlX) * u, bowlY - h * 0.3 + (b.floorY - h / 2 - (bowlY - h * 0.3)) * u - 70 * Math.sin(Math.PI * u))
        .setAngle(-u * 540).setScale(base * size);
      if (POO_SPAT_FRAMES - b.timer === SPIT_FLIGHT - 1) this.splat.explode(20, cx, b.floorY - 4);
    } else {
      // Stretched by the speed of a hop; flat where he has landed, spat out.
      const stretch = b.hop === 'air' && b.phase === 'hopping' ? 1 + Math.min(0.18, Math.abs(b.vy) * 0.035) : 1;
      const sx = squashed ? 1.4 : 1 / stretch;
      const sy = squashed ? 0.45 : stretch;
      this.body.setOrigin(0.5, 1).setPosition(cx, b.y + b.h).setAngle(0).setScale(base * size * sx, base * size * sy);
    }
    this.glow.setVisible(b.phase === 'hopping' || b.phase === 'spat');
    const bounds = this.body.getBounds();
    const top = bounds.top;
    this.hearts.forEach((heart, i) => {
      heart.setVisible(i < b.hp && b.phase === 'hopping').setPosition(cx + (i - 1) * 12, top - 16);
    });
    // Three flies, round and round his head, wherever it is.
    this.flies.forEach((f, i) => {
      const a = animFrame * 0.15 + (i * Math.PI * 2) / FLIES;
      f.setVisible(true).setPosition(bounds.centerX + Math.cos(a) * b.w * 0.55, top - 4 + Math.sin(a * 1.7) * 6)
        .setFlipX(Math.sin(a) > 0);
    });
  }
}

