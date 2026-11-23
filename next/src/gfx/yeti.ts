import type Phaser from 'phaser';
import { ICICLE_DROP, type YetiFx, type YetiState } from '../game/bosses/yeti';
import type { EnemyProjectile, World } from '../game/types';
import { COURSE_SPARK_TEXTURE } from './course';
import { restingOn } from './pizzaChef';
import { ICICLE_TEXTURE, spriteScale, STAR_TEXTURE, YETI_ROAR_TEXTURE, YETI_TEXTURE } from './textures';

/** With the other bosses (SliceScene's DEPTH_BOSS), and his effects over everything in the world. */
const DEPTH = 17;
const DEPTH_FX = 22.5;
const SNOW = [0xffffff, 0xeaf6ff, 0xbfe6ff];
const SHARDS = [0xffffff, 0xbfe6ff, 0x8cc4e8];
const SHADOW = 0x000000;
/** Hanging icicles start to shake this many frames before they let go. */
const SHAKE_FRAMES = 24;

/**
 * How the Yeti looks (his rules are game/bosses/yeti.ts): roaring and shaking as he winds up,
 * leaning into a charge with snow spraying from his feet, a burst of snow and a shaking room
 * at the slam, stars round his head while he sits dizzy, flashing as he shakes off a hit,
 * flopped over once beaten. The icicles his slams bring down hang from the ceiling over their
 * shadows, shake, and shatter where they land. Phaser images, tweens and particle emitters, as
 * the other bosses.
 */
export class YetiView {
  private readonly body: Phaser.GameObjects.Image;
  private readonly stars: Phaser.GameObjects.Image[];
  private readonly hanging: Phaser.GameObjects.Image[] = [];
  private readonly shadows: Phaser.GameObjects.Graphics;
  private readonly snow: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly shards: Phaser.GameObjects.Particles.ParticleEmitter;
  /** The state last drawn: a respawn rebuilds the level, and with it a fresh Yeti. */
  private drawn: YetiState | null = null;
  private phase: string | null = null;
  /** The icicles falling last frame, and where each was: one gone has shattered. */
  private falling = new Map<EnemyProjectile, { x: number; y: number }>();
  private readonly flop = { angle: 0 };

  constructor(private readonly scene: Phaser.Scene) {
    this.body = scene.add.image(0, 0, YETI_TEXTURE).setOrigin(0.5, 1).setDepth(DEPTH).setVisible(false);
    this.body.setScale(spriteScale(this.body));
    this.stars = [0, 1, 2].map(() => {
      const star = scene.add.image(0, 0, STAR_TEXTURE).setDepth(DEPTH_FX).setVisible(false);
      return star.setScale(spriteScale(star));
    });
    this.shadows = scene.add.graphics().setDepth(DEPTH - 1);
    this.snow = scene.add.particles(0, 0, COURSE_SPARK_TEXTURE, {
      emitting: false,
      lifespan: 700,
      speed: { min: 30, max: 160 },
      scale: { start: 2, end: 0.3 },
      alpha: { start: 0.9, end: 0 },
      gravityY: 120,
      tint: SNOW,
    }).setDepth(DEPTH_FX);
    this.shards = scene.add.particles(0, 0, COURSE_SPARK_TEXTURE, {
      emitting: false,
      lifespan: 600,
      speedX: { min: -90, max: 90 },
      speedY: { min: -160, max: -40 },
      scale: { start: 1.4, end: 0.2 },
      gravityY: 500,
      tint: SHARDS,
    }).setDepth(DEPTH_FX);
  }

  /** Once per rendered frame, after the steps. */
  update(world: World): void {
    const b = world.courseBoss;
    if (!b || b.kind !== 'yeti') {
      this.hideAll();
      return;
    }
    if (b !== this.drawn) this.reset(b);
    for (const fx of b.fx.splice(0)) this.playFx(fx);
    if (b.phase !== this.phase) this.changePhase(b);
    this.place(b, world.animFrame);
    this.drawIcicles(world, b);
  }

  private hideAll(): void {
    this.body.setVisible(false);
    for (const im of [...this.stars, ...this.hanging]) im.setVisible(false);
    this.shadows.clear();
  }

  private reset(b: YetiState): void {
    this.drawn = b;
    this.phase = null;
    this.flop.angle = 0;
    this.falling.clear();
    this.scene.tweens.killTweensOf(this.flop);
    this.body.setVisible(true).setAlpha(1).setAngle(0);
  }

  private playFx(fx: YetiFx): void {
    switch (fx.kind) {
      case 'slam':
        this.snow.explode(36, fx.x, fx.y);
        this.scene.cameras.main.shake(260, 0.01);
        break;
      case 'hit':
        this.snow.explode(30, fx.x, fx.y);
        this.scene.cameras.main.shake(160, 0.006);
        break;
      case 'roar':
      case 'wake':
        this.snow.explode(8, fx.x, fx.y + 6);
        break;
      case 'bonk':
      case 'thud':
        this.snow.explode(6, fx.x, fx.y);
        break;
    }
  }

  private changePhase(b: YetiState): void {
    this.phase = b.phase;
    if (b.phase !== 'defeated') return;
    this.snow.explode(50, b.x + b.w / 2, b.y + b.h / 2);
    this.scene.tweens.add({ targets: this.flop, angle: 84, duration: 600, ease: 'Bounce.easeOut' });
  }

  private place(b: YetiState, animFrame: number): void {
    const cx = b.x + b.w / 2;
    const roaring = b.phase === 'windup';
    this.body.setTexture(roaring ? YETI_ROAR_TEXTURE : YETI_TEXTURE).setScale(spriteScale(this.body));
    const shake = roaring ? (animFrame % 4 < 2 ? 1 : -1) : 0;
    const charging = b.phase === 'charging';
    const bob = charging && Math.floor(b.step / 5) % 2 === 1 ? -2 : 0;
    const dizzy = b.phase === 'dizzy';
    let angle = 0;
    if (charging) angle = b.facing * 10;
    else if (dizzy) angle = Math.sin(animFrame * 0.2) * 7;
    else if (b.phase === 'defeated') angle = this.flop.angle;
    const flash = b.phase === 'hurt' && b.timer % 8 < 4 ? 0.4 : 1;
    this.body.setAlpha(flash).setFlipX(b.facing > 0).setAngle(angle);
    if (b.phase === 'defeated') {
      // Flopped over about his middle, resting on the floor rather than half through it.
      this.body.setOrigin(0.5, 0.5).setPosition(cx, restingOn(this.body, b.floorY, angle));
    } else {
      this.body.setOrigin(0.5, 1).setPosition(cx + shake, b.floorY + bob);
    }
    if (charging && animFrame % 3 === 0) this.snow.explode(2, b.facing > 0 ? b.x : b.x + b.w, b.floorY - 2);
    this.stars.forEach((s, i) => {
      const a = animFrame * 0.12 + (i * Math.PI * 2) / 3;
      s.setVisible(dizzy).setPosition(cx + Math.cos(a) * 20, b.y - 4 + Math.sin(a) * 5);
    });
  }

  /** Icicles hanging over their shadows, shaking before they let go; a shatter where one lands. */
  private drawIcicles(world: World, b: YetiState): void {
    this.shadows.clear();
    const top = b.floorY - ICICLE_DROP;
    b.icicles.forEach((ic, i) => {
      const im = this.hanging[i] ?? this.newIcicle(i);
      const shake = ic.timer < SHAKE_FRAMES && world.animFrame % 4 < 2 ? 1 : 0;
      im.setVisible(true).setPosition(ic.x + 4 + shake, top);
      this.shadows.fillStyle(SHADOW, 0.3).fillEllipse(ic.x + 4, b.floorY - 1, 10, 3);
    });
    for (let i = b.icicles.length; i < this.hanging.length; i++) this.hanging[i].setVisible(false);
    const now = new Map<EnemyProjectile, { x: number; y: number }>();
    for (const s of world.enemyProjectiles) {
      if (s.type !== 'icicle') continue;
      now.set(s, { x: s.x, y: s.y });
      const r = Math.max(3, 5 + (s.y - top) / 40);
      this.shadows.fillStyle(SHADOW, 0.35).fillEllipse(s.x + 4, b.floorY - 1, r * 2, r * 0.7);
    }
    for (const [s, at] of this.falling) {
      if (!now.has(s)) this.shards.explode(12, at.x + 4, Math.min(at.y + 8, b.floorY - 2));
    }
    this.falling = now;
  }

  private newIcicle(i: number): Phaser.GameObjects.Image {
    const im = this.scene.add.image(0, 0, ICICLE_TEXTURE).setOrigin(0.5, 0).setDepth(DEPTH - 0.5);
    im.setScale(spriteScale(im));
    this.hanging[i] = im;
    return im;
  }
}
