import type Phaser from 'phaser';
import type { ChefFx, PizzaChefState } from '../game/bosses/pizzaChef';
import type { EnemyProjectile, World } from '../game/types';
import { sfxCluck } from '../audio/sfx';
import { BossShowView } from './bossShow';
import { COURSE_SPARK_TEXTURE } from './course';
import { CHEF_CHICKEN_TEXTURE, CHEF_HAT_TEXTURE, CHEF_PEEL_TEXTURE, CHEF_TEXTURE,
  spriteScale, STAR_TEXTURE,
} from './textures';

/** With the other bosses (SliceScene's DEPTH_BOSS), and his effects over everything in the world. */
const DEPTH = 17;
const DEPTH_FX = 22.5;
const FLOUR = [0xffffff, 0xf4efe4, 0xe8e0d0];
const FEATHERS = [0xffffff, 0xfafafa, 0xffe0a0];
const SAUCE = [0xcc2a2a, 0xffd84a, 0xc88a3a];
const DUST = [0x8a7a6a, 0xb8a890, 0xe0d8c8];
const SHADOW = 0x000000;

/**
 * Where the middle of an image turned `angle` degrees goes for it to rest on the floor at `floorY`.
 * Shared with gfx/yeti.ts.
 */
export function restingOn(image: Phaser.GameObjects.Image, floorY: number, angle: number): number {
  const a = (Math.abs(angle) * Math.PI) / 180;
  return floorY - (image.displayHeight / 2) * Math.cos(a) - (image.displayWidth / 2) * Math.sin(a);
}

/**
 * How the Pizza Chef looks (his rules are game/bosses/pizzaChef.ts): the cook with his peel at
 * his front hand, or the big chicken in a chef's hat a ray makes of him. The peel tips forward
 * as he tosses a pizza and swings when he bats a ray away; turning into a chicken and back is
 * a puff of flour; a hit is a burst of feathers; dazed, stars go round his head; a giant he
 * calls arrives in a puff of dust; his pizzas cast a shadow on the floor and splat where they
 * land; beaten, he flops over bare-headed and his hat rolls away. Phaser images, tweens and
 * particle emitters, as the other bosses.
 */
export class PizzaChefView {
  private readonly body: Phaser.GameObjects.Image;
  private readonly peel: Phaser.GameObjects.Image;
  private readonly stars: Phaser.GameObjects.Image[];
  private readonly shadows: Phaser.GameObjects.Graphics;
  private readonly flour: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly feathers: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly sauce: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly dust: Phaser.GameObjects.Particles.ParticleEmitter;
  /** The state last drawn: a respawn rebuilds the level, and with it a fresh chef. */
  private drawn: PizzaChefState | null = null;
  private phase: string | null = null;
  /** The pizzas in the air last frame, and where each was: one gone has landed. */
  private pizzas = new Map<EnemyProjectile, { x: number; y: number }>();
  /** How far over he has flopped, once beaten; how far the peel is swung. */
  private readonly sit = { angle: 0 };
  private readonly swing = { angle: 0 };
  /** Beaten, a chicken running off clucking: how far, how high in its hop, how faded. */
  private readonly flee = { x: 0, y: 0, alpha: 1 };
  /** What he says and how he moves (gfx/bossShow.ts). */
  private readonly show: BossShowView;

  constructor(private readonly scene: Phaser.Scene) {
    const image = (key: string, depth: number) => {
      const im = scene.add.image(0, 0, key).setOrigin(0.5, 1).setDepth(depth).setVisible(false);
      return im.setScale(spriteScale(im));
    };
    this.peel = image(CHEF_PEEL_TEXTURE, DEPTH - 0.2);
    this.body = image(CHEF_TEXTURE, DEPTH);
    this.stars = [0, 1, 2].map(() => image(STAR_TEXTURE, DEPTH_FX).setOrigin(0.5, 0.5));
    this.shadows = scene.add.graphics().setDepth(DEPTH - 1);
    const burst = (tint: number[], lifespan: number, gravityY: number) => scene.add.particles(0, 0, COURSE_SPARK_TEXTURE, {
      emitting: false,
      lifespan,
      speed: { min: 30, max: 140 },
      scale: { start: 2, end: 0.3 },
      alpha: { start: 0.9, end: 0 },
      gravityY,
      tint,
    }).setDepth(DEPTH_FX);
    this.flour = burst(FLOUR, 900, -20);
    this.feathers = burst(FEATHERS, 1200, 60);
    this.sauce = burst(SAUCE, 500, 200);
    this.dust = burst(DUST, 700, 0);
    this.show = new BossShowView(scene, 'pizzaChef');
  }

  /** Once per rendered frame, after the steps. */
  update(world: World): void {
    const b = world.courseBoss;
    if (!b || b.kind !== 'pizzaChef') {
      this.hideAll();
      this.show.hide();
      return;
    }
    if (b !== this.drawn) this.reset(b);
    const fx = b.fx.splice(0);
    for (const f of fx) this.playFx(b, f);
    if (b.phase !== this.phase) this.changePhase(b);
    this.place(b, world.animFrame);
    this.show.update(world, b, fx.map((f) => f.kind), [this.body], [this.body, this.peel]);
    this.drawPizzas(world, b);
  }

  private hideAll(): void {
    for (const im of [this.body, this.peel, ...this.stars]) im.setVisible(false);
    this.shadows.clear();
  }

  private reset(b: PizzaChefState): void {
    this.drawn = b;
    this.phase = null;
    this.sit.angle = 0;
    this.swing.angle = 0;
    Object.assign(this.flee, { x: 0, y: 0, alpha: 1 });
    this.scene.tweens.killTweensOf(this.flee);
    this.pizzas.clear();
    for (const im of [this.body, this.peel]) {
      this.scene.tweens.killTweensOf(im);
      im.setVisible(true).setAlpha(1).setAngle(0);
    }
    this.scene.tweens.killTweensOf(this.sit);
    this.scene.tweens.killTweensOf(this.swing);
  }

  private playFx(b: PizzaChefState, fx: ChefFx): void {
    switch (fx.kind) {
      case 'poof':
        this.flour.explode(30, fx.x, fx.y);
        break;
      case 'hit':
        this.feathers.explode(36, fx.x, fx.y);
        this.flour.explode(12, fx.x, fx.y);
        this.scene.cameras.main.shake(160, 0.006);
        break;
      case 'bonk':
        this.flour.explode(6, fx.x, fx.y);
        break;
      case 'swat':
        this.flour.explode(8, fx.x, fx.y);
        this.swingPeel(-70);
        break;
      case 'throw':
        this.swingPeel(-35);
        break;
      case 'giant':
        this.dust.explode(20, fx.x, fx.y);
        this.scene.cameras.main.shake(120, 0.004);
        break;
      case 'defeat':
        this.flour.explode(60, fx.x, fx.y);
        this.feathers.explode(20, fx.x, fx.y);
        this.hatRollsOff(b);
        break;
      default:
        break;
    }
  }

  /** The peel tips toward the hero and back. */
  private swingPeel(angle: number): void {
    this.scene.tweens.killTweensOf(this.swing);
    this.swing.angle = 0;
    this.scene.tweens.add({ targets: this.swing, angle, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
  }

  /** His hat tumbles off behind him and rolls away along the floor. */
  private hatRollsOff(b: PizzaChefState): void {
    const away = -b.facing;
    const hat = this.scene.add.image(b.x + b.w / 2, b.y + 6, CHEF_HAT_TEXTURE).setOrigin(0.5, 0.5).setDepth(DEPTH_FX);
    hat.setScale(spriteScale(hat)).setFlipX(b.facing > 0);
    this.scene.tweens.chain({
      targets: hat,
      tweens: [
        { x: hat.x + away * 24, y: hat.y - 20, angle: away * 120, duration: 300, ease: 'Quad.easeOut' },
        { x: hat.x + away * 40, y: b.floorY - 4, angle: away * 240, duration: 350, ease: 'Quad.easeIn' },
        { x: hat.x + away * 110, angle: away * 720, duration: 1200, ease: 'Quad.easeOut' },
      ],
    });
  }

  private changePhase(b: PizzaChefState): void {
    const was = this.phase;
    this.phase = b.phase;
    const key = b.phase === 'chicken' || b.phase === 'defeated' ? CHEF_CHICKEN_TEXTURE : CHEF_TEXTURE;
    this.body.setTexture(key).setScale(spriteScale(this.body));
    if (b.phase === 'defeated' && was !== 'defeated') {
      // Beaten, he is a chicken for good: his peel falls over and off he runs, clucking and
      // shedding feathers, off the nearer side.
      const tweens = this.scene.tweens;
      tweens.add({ targets: this.peel, angle: b.facing < 0 ? -85 : 85, duration: 700, ease: 'Quad.easeIn' });
      const middle = (b.patrol[0] + b.patrol[1] + b.w) / 2;
      const away = b.x + b.w / 2 < middle ? -1 : 1;
      tweens.add({ targets: this.flee, x: away * 260, alpha: 0, duration: 2000, delay: 700, ease: 'Quad.easeIn' });
      tweens.add({
        targets: this.flee, y: -10, duration: 120, yoyo: true, repeat: 9, delay: 700, ease: 'Sine.easeOut',
        onRepeat: () => {
          if (Math.random() < 0.4) sfxCluck();
          this.feathers.explode(3, this.body.x, this.body.y - this.body.displayHeight / 2);
        },
      });
    }
  }

  private place(b: PizzaChefState, animFrame: number): void {
    const cx = b.x + b.w / 2;
    const flip = b.facing > 0;
    const chicken = b.phase === 'chicken';
    const moving = chicken || b.phase === 'returning';
    const bob = moving && Math.floor(b.step / (chicken ? 4 : 10)) % 2 === 1 ? -2 : 0;
    const feet = b.floorY + bob;
    const dazed = b.phase === 'hurt';
    // Running out of time as a chicken, he flickers: about to pop back.
    const flicker = chicken && b.timer < 90 && b.timer % 8 < 4 ? 0.5 : 1;
    this.body.setFlipX(flip).setAlpha(flicker);
    if (b.phase === 'defeated') {
      // A chicken, running off.
      const away = this.flee.x === 0 ? flip : this.flee.x > 0;
      this.body.setOrigin(0.5, 1).setPosition(cx + this.flee.x, b.floorY + this.flee.y).setAngle(0)
        .setFlipX(away).setAlpha(this.flee.alpha).setVisible(this.flee.alpha > 0.01);
    } else {
      this.body.setOrigin(0.5, 1).setPosition(cx, feet).setAngle(dazed ? Math.sin(animFrame * 0.25) * 6 : 0);
    }
    this.stars.forEach((s, i) => {
      const a = animFrame * 0.12 + (i * Math.PI * 2) / 3;
      s.setVisible(dazed).setPosition(cx + Math.cos(a) * 18, b.floorY - 50 + Math.sin(a) * 5);
    });
    if (b.phase === 'defeated') return;
    // The peel stands at his front hand; not a chicken's.
    this.peel.setVisible(!chicken);
    const handX = flip ? b.x + b.w - 5 : b.x + 5;
    this.peel.setOrigin(0.5, 1).setFlipX(flip).setPosition(handX, feet - 20)
      .setAngle((flip ? -1 : 1) * this.swing.angle);
  }

  /** A shadow on the floor under each pizza in the air; a splat where one came down. */
  private drawPizzas(world: World, b: PizzaChefState): void {
    this.shadows.clear();
    const now = new Map<EnemyProjectile, { x: number; y: number }>();
    for (const s of world.enemyProjectiles) {
      if (s.type !== 'pizza') continue;
      now.set(s, { x: s.x, y: s.y });
      const height = Math.max(0, b.floorY - (s.y + 8));
      const r = Math.max(2, 6 - height / 24);
      this.shadows.fillStyle(SHADOW, 0.35).fillEllipse(s.x + 4, b.floorY - 1, r * 2, r * 0.8);
    }
    for (const [s, at] of this.pizzas) {
      if (!now.has(s)) this.sauce.explode(14, at.x + 4, Math.min(at.y + 4, b.floorY - 2));
    }
    this.pizzas = now;
  }
}
