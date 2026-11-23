import type Phaser from 'phaser';
import { rockWarning, type PteroFx, type PterodactylState } from '../game/bosses/pterodactyl';
import type { World } from '../game/types';
import { COURSE_SPARK_TEXTURE } from './course';
import { BossShowView } from './bossShow';
import { PTERO_DOWN_TEXTURE, PTERO_UP_TEXTURE, QUEEN_HEART_TEXTURE, spriteScale } from './textures';

/** With the other bosses (SliceScene's DEPTH_BOSS), and her effects over everything in the world. */
const DEPTH = 17;
const DEPTH_FX = 22.5;
const FEATHERS = [0x7a4a8a, 0xa77bb5, 0xd9c3e0, 0xd04060];
const SPARKS = [0xffdd00, 0xffffff, 0xff8a2a];

/**
 * How the Pterodactyl looks (her rules are game/bosses/pterodactyl.ts): wings flapping as she
 * flies; a shadow on the floor under her while a rock is on its way; a heart for each landing
 * she can still take; sparks when the hero lands on her and she shoots up out of sight; a
 * tumble and a burst of feathers when she is beaten. Phaser images, a Graphics, tweens and two
 * particle emitters, as the Doll Queen's view.
 */
export class PterodactylView {
  private readonly bird: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Graphics;
  private readonly hearts: Phaser.GameObjects.Image[];
  private readonly feathers: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  /** What she says and how she moves (gfx/bossShow.ts). */
  private readonly show: BossShowView;
  /** The state last drawn: a respawn rebuilds the level, and with it a fresh Pterodactyl. */
  private drawn: PterodactylState | null = null;
  private phase: string | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    this.bird = scene.add.image(0, 0, PTERO_UP_TEXTURE).setOrigin(0.5, 0.5).setDepth(DEPTH).setVisible(false);
    this.bird.setScale(spriteScale(this.bird));
    this.shadow = scene.add.graphics().setDepth(DEPTH - 1);
    this.hearts = [0, 1, 2].map(() => {
      const heart = scene.add.image(0, 0, QUEEN_HEART_TEXTURE).setDepth(DEPTH).setVisible(false);
      return heart.setScale(spriteScale(heart) * 0.5);
    });
    this.feathers = scene.add.particles(0, 0, COURSE_SPARK_TEXTURE, {
      emitting: false,
      lifespan: 1600,
      speed: { min: 40, max: 160 },
      scale: { start: 2, end: 0.5 },
      rotate: { start: 0, end: 720 },
      tint: FEATHERS,
      gravityY: 60,
    }).setDepth(DEPTH_FX);
    this.sparks = scene.add.particles(0, 0, COURSE_SPARK_TEXTURE, {
      emitting: false,
      lifespan: 700,
      speed: { min: 60, max: 200 },
      scale: { start: 1.6, end: 0 },
      tint: SPARKS,
    }).setDepth(DEPTH_FX);
    this.show = new BossShowView(scene, 'pterodactyl');
  }

  /** Once per rendered frame, after the steps. */
  update(world: World): void {
    const b = world.courseBoss;
    if (!b || b.kind !== 'pterodactyl') {
      this.hideAll();
      this.show.hide();
      return;
    }
    if (b !== this.drawn) this.reset(b);
    const fx = b.fx.splice(0);
    for (const f of fx) this.playFx(f);
    if (b.phase !== this.phase) this.changePhase(b);
    this.place(b);
    this.show.update(world, b, fx.map((f) => f.kind), [this.bird], [this.bird], this.hearts);
  }

  private hideAll(): void {
    this.scene.tweens.killTweensOf(this.bird);
    this.bird.setVisible(false);
    this.shadow.clear();
    for (const h of this.hearts) h.setVisible(false);
  }

  private reset(b: PterodactylState): void {
    this.drawn = b;
    this.phase = null;
    this.scene.tweens.killTweensOf(this.bird);
    this.bird.setVisible(true).setAlpha(1).setAngle(0);
  }

  private playFx(fx: PteroFx): void {
    if (fx.kind === 'hit') {
      this.sparks.explode(24, fx.x, fx.y);
      this.feathers.explode(10, fx.x, fx.y);
    } else if (fx.kind === 'bounce') {
      this.sparks.explode(6, fx.x, fx.y);
    }
  }

  private changePhase(b: PterodactylState): void {
    this.phase = b.phase;
    if (b.phase !== 'defeated') return;
    // Down she tumbles in a cloud of feathers, sits there dazed a moment, then flaps off home,
    // up and away, wobbling.
    const tweens = this.scene.tweens;
    const bird = this.bird.setAlpha(1);
    tweens.killTweensOf(bird);
    tweens.add({
      targets: bird, y: b.floorY - 12, angle: 540, duration: 900, ease: 'Quad.easeIn',
      onComplete: () => {
        this.feathers.explode(70, bird.x, bird.y);
        this.scene.cameras.main.shake(150, 0.005);
        bird.setAngle(0);
        tweens.add({
          targets: bird, x: bird.x + b.facing * 260, y: bird.y - 320, alpha: 0, duration: 2200, delay: 600,
          ease: 'Sine.easeIn',
          onUpdate: () => bird.setTexture(Math.floor(this.scene.time.now / 90) % 2 ? PTERO_DOWN_TEXTURE : PTERO_UP_TEXTURE),
          onComplete: () => bird.setVisible(false),
        });
        tweens.add({ targets: bird, angle: { from: -12, to: 12 }, duration: 260, yoyo: true, repeat: 8, delay: 600 });
      },
    });
  }

  private place(b: PterodactylState): void {
    const g = this.shadow.clear();
    if (b.phase === 'defeated') {
      for (const h of this.hearts) h.setVisible(false);
      return;
    }
    const cx = b.x + b.w / 2;
    const wingsDown = Math.floor(b.flap / 8) % 2 === 1;
    this.bird
      .setTexture(wingsDown ? PTERO_DOWN_TEXTURE : PTERO_UP_TEXTURE)
      .setPosition(cx, b.y + b.h / 2)
      .setFlipX(b.facing > 0)
      .setAlpha(b.phase === 'hurt' && b.timer % 8 < 4 ? 0.4 : 1);
    if (rockWarning(b)) {
      // The rock's shadow, darkening as it comes.
      const strength = 1 - Math.max(0, b.dropTimer) / 40;
      g.fillStyle(0x000000, 0.15 + strength * 0.3).fillEllipse(cx, b.floorY - 1, 18 + strength * 8, 5);
    }
    this.hearts.forEach((h, i) => {
      h.setVisible(b.phase !== 'hurt' && i < b.hp).setPosition(cx + (i - 1) * 12, b.y - 10);
    });
  }
}
