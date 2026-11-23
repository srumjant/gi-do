import type Phaser from 'phaser';
import { currentSpot, QUEEN_H, QUEEN_SIT_H, type DollQueenState, type QueenFx } from '../game/bosses/dollQueen';
import type { World } from '../game/types';
import { COURSE_GLOW_TEXTURE, COURSE_SPARK_TEXTURE, COURSE_TARGET_TEXTURE, TARGET_PX } from './course';
import { BossShowView } from './bossShow';
import { PARASOL_TEXTURE, QUEEN_HEART_TEXTURE, QUEEN_TEXTURE, STAR_TEXTURE, spriteScale } from './textures';

/** With the original boss (SliceScene's DEPTH_BOSS), and her effects over everything in the world. */
const DEPTH = 17;
const DEPTH_FX = 22.5;
const CONFETTI = [0xffdd00, 0xff69b4, 0x88ff88, 0x88ccff, 0xffaa44];
const TEARS = [0x66ccff, 0x99ddff];

/**
 * How the Doll Queen looks (her rules are game/bosses/dollQueen.ts): her sprite, standing, or
 * sitting dizzy with stars going round her head; her parasol, which flies off when her target is
 * shot and pops back when she gets up; a heart for each hit she has left; the round's target
 * with its glow, sinking when it is hit; confetti when she is hit, and a burst when she falls.
 * All of it Phaser images, tweens and one particle emitter.
 */
export class DollQueenView {
  private readonly queen: Phaser.GameObjects.Image;
  private readonly parasol: Phaser.GameObjects.Image;
  private readonly hearts: Phaser.GameObjects.Image[];
  private readonly glow: Phaser.GameObjects.Image;
  private readonly target: Phaser.GameObjects.Image;
  private readonly stars: Phaser.GameObjects.Image[];
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Her tears as she runs off, beaten. */
  private readonly tears: Phaser.GameObjects.Particles.ParticleEmitter;
  /** What she says and how she moves (gfx/bossShow.ts). */
  private readonly show: BossShowView;
  /** The state last drawn: a respawn rebuilds the level, and with it a fresh Queen. */
  private drawn: DollQueenState | null = null;
  private phase: string | null = null;
  private targetUp = false;

  constructor(private readonly scene: Phaser.Scene) {
    const image = (key: string, depth = DEPTH): Phaser.GameObjects.Image => {
      const img = scene.add.image(0, 0, key).setDepth(depth).setVisible(false);
      return img.setScale(spriteScale(img));
    };
    this.queen = image(QUEEN_TEXTURE).setOrigin(0.5, 1);
    this.parasol = image(PARASOL_TEXTURE).setOrigin(0.5, 1);
    this.hearts = [0, 1, 2].map(() => image(QUEEN_HEART_TEXTURE).setScale(0.5));
    this.glow = image(COURSE_GLOW_TEXTURE);
    this.target = image(COURSE_TARGET_TEXTURE).setOrigin(0.5, 0);
    this.stars = [0, 1, 2].map(() => image(STAR_TEXTURE, DEPTH_FX));
    this.sparks = scene.add.particles(0, 0, COURSE_SPARK_TEXTURE, {
      emitting: false,
      lifespan: 1400,
      speed: { min: 80, max: 260 },
      scale: { start: 1.8, end: 0 },
      rotate: { start: 0, end: 360 },
      tint: CONFETTI,
      gravityY: 240,
    }).setDepth(DEPTH_FX);
    this.tears = scene.add.particles(0, 0, COURSE_SPARK_TEXTURE, {
      emitting: false,
      frequency: 50,
      lifespan: 700,
      speedX: { min: -60, max: 60 },
      speedY: { min: -80, max: -30 },
      scale: { start: 1.2, end: 0.4 },
      tint: TEARS,
      gravityY: 400,
    }).setDepth(DEPTH_FX);
    this.show = new BossShowView(scene, 'dollQueen');
    scene.tweens.add({
      targets: this.glow, scale: { from: 0.8, to: 1.35 }, alpha: { from: 1, to: 0.45 },
      duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  /** Once per rendered frame, after the steps. */
  update(world: World): void {
    const q = world.courseBoss;
    if (!q || q.kind !== 'dollQueen') {
      this.hideAll();
      this.show.hide();
      return;
    }
    if (q !== this.drawn) this.reset(q);
    const fx = q.fx.splice(0);
    for (const f of fx) this.playFx(f);
    if (q.phase !== this.phase) this.changePhase(q);
    if (q.targetUp !== this.targetUp) this.changeTarget(q);
    this.place(q, world.animFrame);
    this.show.update(world, q, fx.map((f) => f.kind), [this.queen], [this.queen, this.parasol], this.hearts);
  }

  private hideAll(): void {
    for (const obj of [this.queen, this.parasol, this.glow, this.target, ...this.hearts, ...this.stars]) {
      obj.setVisible(false);
    }
  }

  private reset(q: DollQueenState): void {
    this.drawn = q;
    this.phase = null;
    this.targetUp = false;
    this.scene.tweens.killTweensOf([this.queen, this.parasol, this.target]);
    this.tears.stop();
    this.queen.setVisible(true).setAlpha(1).setAngle(0).setScale(1);
    this.parasol.setVisible(true).setAlpha(1).setAngle(0).setScale(1);
    this.target.setVisible(false);
    this.glow.setVisible(false);
  }

  private playFx(fx: QueenFx): void {
    if (fx.kind === 'hit') this.sparks.explode(30, fx.x, fx.y);
    else if (fx.kind === 'clang') this.sparks.explode(6, fx.x, fx.y);
    else if (fx.kind === 'target') this.sparks.explode(16, fx.x, fx.y);
  }

  private changePhase(q: DollQueenState): void {
    const was = this.phase;
    this.phase = q.phase;
    const tweens = this.scene.tweens;
    if (q.phase === 'dizzy') {
      // The parasol flies off, spinning, and is gone until she gets up.
      tweens.killTweensOf(this.parasol);
      tweens.add({
        targets: this.parasol, y: this.parasol.y - 140, angle: 720, alpha: 0, duration: 900,
        ease: 'Quad.easeOut', onComplete: () => this.parasol.setVisible(false),
      });
    } else if (q.phase === 'shielded' && (was === 'dizzy' || was === 'hurt')) {
      tweens.killTweensOf(this.parasol);
      this.parasol.setVisible(true).setAlpha(1).setAngle(0).setScale(0);
      tweens.add({ targets: this.parasol, scale: 1, duration: 400, ease: 'Back.easeOut' });
    } else if (q.phase === 'hurt') {
      tweens.add({ targets: this.queen, alpha: { from: 0.3, to: 1 }, duration: 100, repeat: 4 });
    } else if (q.phase === 'defeated') {
      // Beaten: her parasol flies off, she spins once, then runs off to the nearer side,
      // hopping and crying, and is gone.
      this.sparks.explode(60, q.x + q.w / 2, q.y + q.h / 2);
      tweens.killTweensOf([this.queen, this.parasol]);
      if (this.parasol.visible) {
        tweens.add({
          targets: this.parasol, y: this.parasol.y - 160, angle: 900, alpha: 0, duration: 1100,
          ease: 'Quad.easeOut', onComplete: () => this.parasol.setVisible(false),
        });
      }
      const middle = (q.patrol[0] + q.patrol[1] + q.w) / 2;
      const away = q.x + q.w / 2 < middle ? -1 : 1;
      const queen = this.queen.setAlpha(1).setScale(1);
      const floor = queen.y;
      tweens.add({
        targets: queen, angle: 360, duration: 500, ease: 'Quad.easeOut',
        onComplete: () => {
          queen.setAngle(0).setFlipX(away > 0);
          this.tears.startFollow(queen, 0, -queen.displayHeight * 0.75);
          this.tears.start();
          tweens.add({ targets: queen, y: floor - 10, duration: 150, yoyo: true, repeat: 6, ease: 'Sine.easeOut' });
          tweens.add({
            targets: queen, x: queen.x + away * 230, alpha: 0, duration: 2100, ease: 'Linear',
            onComplete: () => {
              this.tears.stop();
              queen.setVisible(false);
            },
          });
        },
      });
    }
  }

  private changeTarget(q: DollQueenState): void {
    this.targetUp = q.targetUp;
    const spot = currentSpot(q);
    const x = spot.x + spot.w / 2;
    const y = spot.y + spot.h / 2 - TARGET_PX / 2;
    const tweens = this.scene.tweens;
    tweens.killTweensOf(this.target);
    if (q.targetUp) {
      this.target.setVisible(true).setPosition(x, y).setAlpha(1).setAngle(0).setScale(0);
      tweens.add({ targets: this.target, scale: 1, duration: 350, ease: 'Back.easeOut' });
      tweens.add({
        targets: this.target, angle: { from: -5, to: 5 }, duration: 700, yoyo: true, repeat: -1,
        ease: 'Sine.easeInOut', delay: 350,
      });
      this.glow.setVisible(true).setPosition(x, spot.y + spot.h / 2);
    } else {
      this.glow.setVisible(false);
      tweens.add({
        targets: this.target, y: y + 90, alpha: 0, duration: 600, ease: 'Back.easeIn',
        onComplete: () => this.target.setVisible(false),
      });
    }
  }

  /** Where everything stands this frame. */
  private place(q: DollQueenState, animFrame: number): void {
    if (q.phase === 'defeated') {
      for (const obj of [...this.hearts, ...this.stars]) obj.setVisible(false);
      return;
    }
    const cx = q.x + q.w / 2;
    const sitting = q.phase === 'dizzy';
    this.queen.setPosition(cx, q.floorY).setFlipX(q.facing > 0).setScale(1, sitting ? QUEEN_SIT_H / QUEEN_H : 1);
    const head = q.floorY - (sitting ? QUEEN_SIT_H : QUEEN_H);
    if (q.phase === 'asleep' || q.phase === 'shielded') {
      this.parasol.setPosition(cx + Math.sin(animFrame * 0.05) * 2, head + 8);
    }
    const heartsY = head - (sitting ? 14 : 38);
    this.hearts.forEach((h, i) => {
      h.setVisible(i < q.hp).setPosition(cx + (i - 1) * 12, heartsY);
    });
    this.stars.forEach((s, i) => {
      const a = animFrame * 0.12 + (i * Math.PI * 2) / 3;
      s.setVisible(sitting).setPosition(cx + Math.cos(a) * 20, head - 4 + Math.sin(a) * 5);
    });
  }
}
