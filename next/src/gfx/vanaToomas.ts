import type Phaser from 'phaser';
import {
  ARMOUR, armourLeft, TOOMAS_WINDUP_FRAMES, type ArmourPiece, type ToomasFx, type VanaToomasState,
} from '../game/bosses/vanaToomas';
import type { World } from '../game/types';
import { COURSE_SPARK_TEXTURE } from './course';
import { BossShowView } from './bossShow';
import {
  spriteScale, TOOMAS_ARMOUR_TEXTURES, TOOMAS_BODY_TEXTURE, TOOMAS_POLE_TEXTURE, TOOMAS_UNDIES_TEXTURE,
} from './textures';

/** With the other bosses (SliceScene's DEPTH_BOSS), and his effects over everything in the world. */
const DEPTH = 17;
const DEPTH_FX = 22.5;
const SPARKS = [0xffffff, 0xffdd00, 0xc0c8d0];
const DUST = [0x8a7a6a, 0xb8a890, 0xe0d8c8];
/** How high his flag pole goes up in the windup, in pixels. */
const POLE_RAISE = 14;

/**
 * How Vana Toomas looks (his rules are game/bosses/vanaToomas.ts): his body with a layer for
 * each piece of armour he still wears, and his flag pole at his front hand. He bobs as he
 * marches; the pole goes up in the windup and slams down in a puff of dust; a piece knocked
 * off spins away and clatters down; he flashes while he staggers; beaten, he sits down and
 * the pole falls over. Phaser images, tweens and two particle emitters, as the other bosses.
 */
export class VanaToomasView {
  private readonly body: Phaser.GameObjects.Image;
  private readonly armour: Record<ArmourPiece, Phaser.GameObjects.Image>;
  private readonly pole: Phaser.GameObjects.Image;
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly dust: Phaser.GameObjects.Particles.ParticleEmitter;
  /** The state last drawn: a respawn rebuilds the level, and with it a fresh Toomas. */
  private drawn: VanaToomasState | null = null;
  private phase: string | null = null;
  /** How far he has sunk, sitting down once beaten. */
  private readonly sit = { y: 0 };
  /** Beaten, running off in his underpants: how far, how high in his hop, how faded. */
  private readonly flee = { x: 0, y: 0, alpha: 1 };
  /** What he says and how he moves (gfx/bossShow.ts). */
  private readonly show: BossShowView;

  constructor(private readonly scene: Phaser.Scene) {
    const layer = (key: string, depth: number) => {
      const image = scene.add.image(0, 0, key).setOrigin(0.5, 1).setDepth(depth).setVisible(false);
      return image.setScale(spriteScale(image));
    };
    this.pole = layer(TOOMAS_POLE_TEXTURE, DEPTH - 0.2);
    this.body = layer(TOOMAS_BODY_TEXTURE, DEPTH);
    this.armour = {
      helmet: layer(TOOMAS_ARMOUR_TEXTURES.helmet, DEPTH + 0.1),
      plate: layer(TOOMAS_ARMOUR_TEXTURES.plate, DEPTH + 0.1),
      shield: layer(TOOMAS_ARMOUR_TEXTURES.shield, DEPTH + 0.2),
    };
    this.sparks = scene.add.particles(0, 0, COURSE_SPARK_TEXTURE, {
      emitting: false,
      lifespan: 600,
      speed: { min: 60, max: 200 },
      scale: { start: 1.6, end: 0 },
      tint: SPARKS,
    }).setDepth(DEPTH_FX);
    this.dust = scene.add.particles(0, 0, COURSE_SPARK_TEXTURE, {
      emitting: false,
      lifespan: 700,
      speed: { min: 20, max: 90 },
      angle: { min: 180, max: 360 },
      scale: { start: 2.2, end: 0.4 },
      alpha: { start: 0.8, end: 0 },
      tint: DUST,
    }).setDepth(DEPTH_FX);
    this.show = new BossShowView(scene, 'vanaToomas');
  }

  /** Once per rendered frame, after the steps. */
  update(world: World): void {
    const b = world.courseBoss;
    if (!b || b.kind !== 'vanaToomas') {
      this.hideAll();
      this.show.hide();
      return;
    }
    if (b !== this.drawn) this.reset(b);
    const fx = b.fx.splice(0);
    for (const f of fx) this.playFx(b, f);
    if (b.phase !== this.phase) this.changePhase(b);
    this.place(b);
    const armour = ARMOUR.map((piece) => this.armour[piece]);
    this.show.update(world, b, fx.map((f) => f.kind), [this.body, ...armour], this.layers());
  }

  private layers(): Phaser.GameObjects.Image[] {
    return [this.body, this.pole, ...ARMOUR.map((piece) => this.armour[piece])];
  }

  private hideAll(): void {
    for (const image of this.layers()) image.setVisible(false);
  }

  private reset(b: VanaToomasState): void {
    this.drawn = b;
    this.phase = null;
    this.sit.y = 0;
    Object.assign(this.flee, { x: 0, y: 0, alpha: 1 });
    this.scene.tweens.killTweensOf(this.flee);
    this.body.setTexture(TOOMAS_BODY_TEXTURE);
    for (const image of this.layers()) {
      this.scene.tweens.killTweensOf(image);
      image.setVisible(true).setAlpha(1).setAngle(0);
    }
    this.scene.tweens.killTweensOf(this.sit);
  }

  private playFx(b: VanaToomasState, fx: ToomasFx): void {
    if (fx.kind === 'hit') {
      this.sparks.explode(24, fx.x, fx.y);
      if (fx.piece) this.flyOff(b, fx.piece);
    } else if (fx.kind === 'clang') {
      this.sparks.explode(6, fx.x, fx.y);
    } else if (fx.kind === 'stamp') {
      this.dust.explode(16, fx.x, fx.y);
      this.scene.cameras.main.shake(120, 0.004);
    }
  }

  /** A copy of the piece spins off, away from where he faces, and clatters to the floor. */
  private flyOff(b: VanaToomasState, piece: ArmourPiece): void {
    const from = this.armour[piece];
    const flying = this.scene.add.image(from.x, from.y, from.texture.key)
      .setOrigin(0.5, 0.5).setScale(from.scaleX, from.scaleY).setFlipX(from.flipX).setDepth(DEPTH_FX);
    flying.y = from.y - from.displayHeight / 2;
    const away = -b.facing;
    this.scene.tweens.chain({
      targets: flying,
      tweens: [
        { x: flying.x + away * 40, y: flying.y - 36, angle: away * 200, duration: 350, ease: 'Quad.easeOut' },
        { x: flying.x + away * 70, y: b.floorY - 6, angle: away * 400, duration: 450, ease: 'Quad.easeIn' },
        { alpha: 0, duration: 900, delay: 600 },
      ],
      onComplete: () => flying.destroy(),
    });
  }

  private changePhase(b: VanaToomasState): void {
    this.phase = b.phase;
    if (b.phase !== 'defeated') return;
    // Beaten: his flag pole falls over, and with his armour gone he is down to his spotted
    // underpants. He jumps, mortified, then hops off the nearer side and is gone.
    const tweens = this.scene.tweens;
    this.sparks.explode(40, b.x + b.w / 2, b.y + b.h / 2);
    tweens.add({ targets: this.pole, angle: b.facing < 0 ? -80 : 80, duration: 700, ease: 'Quad.easeIn' });
    this.body.setTexture(TOOMAS_UNDIES_TEXTURE);
    const middle = (b.patrol[0] + b.patrol[1] + b.w) / 2;
    const away = b.x + b.w / 2 < middle ? -1 : 1;
    tweens.chain({
      targets: this.flee,
      tweens: [
        { y: -18, duration: 220, ease: 'Quad.easeOut' },
        { y: 0, duration: 220, ease: 'Quad.easeIn' },
        { x: away * 240, alpha: 0, duration: 1800, delay: 500, ease: 'Linear' },
      ],
    });
    tweens.add({ targets: this.flee, y: -8, duration: 140, yoyo: true, repeat: 6, delay: 940, ease: 'Sine.easeOut' });
  }

  private place(b: VanaToomasState): void {
    const cx = b.x + b.w / 2;
    const flip = b.facing > 0;
    const bob = b.phase === 'marching' && Math.floor(b.step / 10) % 2 === 1 ? -1 : 0;
    const feet = b.floorY + bob + this.sit.y;
    const flash = b.phase === 'hurt' && b.timer % 8 < 4 ? 0.35 : 1;
    const left = armourLeft(b);
    if (b.phase === 'defeated') {
      const away = this.flee.x === 0 ? flip : this.flee.x > 0;
      this.body.setPosition(cx + this.flee.x, feet + this.flee.y).setFlipX(away).setAlpha(this.flee.alpha)
        .setVisible(this.flee.alpha > 0.01);
      for (const piece of ARMOUR) this.armour[piece].setVisible(false);
      return;
    }
    this.body.setPosition(cx, feet).setFlipX(flip).setAlpha(flash);
    for (const piece of ARMOUR) {
      this.armour[piece].setPosition(cx, feet).setFlipX(flip).setAlpha(flash).setVisible(left.includes(piece));
    }
    // The pole stands at his front hand; in the windup it goes up, shaking, then comes down.
    const raise = b.phase === 'windup'
      ? Math.min(1, (TOOMAS_WINDUP_FRAMES - b.timer) / 10) * POLE_RAISE + (b.timer % 6 < 3 ? 1 : -1)
      : 0;
    const handX = flip ? b.x + b.w - 3 : b.x + 3;
    this.pole.setOrigin(flip ? 0.9 : 0.1, 1).setFlipX(flip).setPosition(handX, feet - raise).setAlpha(flash);
  }
}
