import type Phaser from 'phaser';
import { POWERUP_INFO } from '../data/powerups';
import type { StationKind } from '../data/levels';
import { BLOCK_SIZE, neededTool, TREX_ROUNDS, type TRexFx, type TRexState } from '../game/bosses/tRex';
import type { World } from '../game/types';
import { COURSE_GLOW_TEXTURE, COURSE_SPARK_TEXTURE, COURSE_TARGET_TEXTURE, TARGET_PX } from './course';
import { WORLD_TEXT_RESOLUTION } from './gameFont';
import {
  BOW_TEXTURE, bossTextureKey, CROWN_TEXTURE, spriteScale, STAR_TEXTURE, TOY_BLOCK_TEXTURE,
} from './textures';

/** With the other bosses (SliceScene's DEPTH_BOSS), and his effects over everything in the world. */
const DEPTH = 17;
const DEPTH_FX = 22.5;
const CONFETTI = [0xffdd00, 0xff69b4, 0x88ff88, 0x88ccff, 0xffaa44];
const GOLD = [0xffd23f, 0xfff2a0, 0xcc2233];
const DUST = [0x8a7a6a, 0xb8a890, 0xe0d8c8];
const ROPE = 0x7a5a3a;
/** How far above the hanging block its rope runs across to the target. */
const ROPE_TOP = 40;

/**
 * How the T-Rex looks in his final fight (his rules are game/bosses/tRex.ts): his classic poses
 * (walking, roaring, standing), a crown until a big head smashes it, a bubble over his head with
 * the tool his next hit needs and a glow on that tool's station, the toy block hanging on its
 * rope over the middle of the room from the target by the door, flashing while he staggers, and
 * beaten, shrinking down into a tiny toy. Phaser images, graphics, tweens and particle emitters.
 */
export class TRexView {
  private readonly body: Phaser.GameObjects.Image;
  private readonly crown: Phaser.GameObjects.Image;
  private readonly block: Phaser.GameObjects.Image;
  private readonly target: Phaser.GameObjects.Image;
  private readonly targetGlow: Phaser.GameObjects.Image;
  private readonly rope: Phaser.GameObjects.Graphics;
  private readonly stationGlow: Phaser.GameObjects.Graphics;
  private readonly stars: Phaser.GameObjects.Image[];
  private bubble: Phaser.GameObjects.Container | null = null;
  private bubbleTool: StationKind | null = null;
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly gold: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private drawn: TRexState | null = null;
  private phase: string | null = null;
  private readonly size = { scale: 1 };

  constructor(private readonly scene: Phaser.Scene) {
    const image = (key: string, depth: number) => {
      const im = scene.add.image(0, 0, key).setDepth(depth).setVisible(false);
      return im.setScale(spriteScale(im));
    };
    this.body = image(bossTextureKey('idle'), DEPTH).setOrigin(0.5, 1);
    this.crown = image(CROWN_TEXTURE, DEPTH + 0.1).setOrigin(0.5, 1);
    this.block = image(TOY_BLOCK_TEXTURE, DEPTH + 0.2).setOrigin(0, 0);
    this.targetGlow = image(COURSE_GLOW_TEXTURE, DEPTH - 0.6);
    this.target = image(COURSE_TARGET_TEXTURE, DEPTH - 0.5).setOrigin(0.5, 0);
    this.rope = scene.add.graphics().setDepth(DEPTH - 0.4);
    this.stationGlow = scene.add.graphics().setDepth(DEPTH - 1);
    this.stars = [0, 1, 2].map(() => image(STAR_TEXTURE, DEPTH_FX));
    const burst = (tint: number[], gravityY: number) => scene.add.particles(0, 0, COURSE_SPARK_TEXTURE, {
      emitting: false,
      lifespan: 900,
      speed: { min: 50, max: 200 },
      scale: { start: 1.8, end: 0 },
      rotate: { start: 0, end: 360 },
      gravityY,
      tint,
    }).setDepth(DEPTH_FX);
    this.sparks = burst(CONFETTI, 220);
    this.gold = burst(GOLD, 400);
    this.dust = burst(DUST, 60);
  }

  /** Once per rendered frame, after the steps. */
  update(world: World): void {
    const b = world.courseBoss;
    if (!b || b.kind !== 'tRex') {
      this.hideAll();
      return;
    }
    if (b !== this.drawn) this.reset(b);
    for (const fx of b.fx.splice(0)) this.playFx(fx);
    if (b.phase !== this.phase) this.changePhase(b);
    this.place(b, world.animFrame);
    this.drawBlock(b);
    this.drawHints(world, b);
  }

  private hideAll(): void {
    for (const im of [this.body, this.crown, this.block, this.target, this.targetGlow, ...this.stars]) im.setVisible(false);
    this.rope.clear();
    this.stationGlow.clear();
    this.bubble?.setVisible(false);
  }

  private reset(b: TRexState): void {
    this.drawn = b;
    this.phase = null;
    this.size.scale = 1;
    this.scene.tweens.killTweensOf(this.size);
    this.body.setVisible(true).setAlpha(1).setAngle(0);
    this.crown.setVisible(true);
    const box = b.target;
    this.target.setVisible(true).setPosition(box.x + box.w / 2, box.y + box.h / 2 - TARGET_PX / 2);
    this.targetGlow.setPosition(box.x + box.w / 2, box.y + box.h / 2);
  }

  private playFx(fx: TRexFx): void {
    switch (fx.kind) {
      case 'hit':
        this.sparks.explode(36, fx.x, fx.y);
        this.scene.cameras.main.shake(200, 0.008);
        break;
      case 'crown':
        this.gold.explode(40, fx.x, fx.y);
        this.scene.cameras.main.shake(200, 0.008);
        break;
      case 'smash':
        this.dust.explode(20, fx.x, fx.y);
        this.sparks.explode(10, fx.x, fx.y);
        this.scene.cameras.main.shake(120, 0.005);
        break;
      case 'roar':
      case 'wake':
        this.scene.cameras.main.shake(300, 0.004);
        break;
      case 'drop':
        this.sparks.explode(8, fx.x, fx.y);
        break;
      case 'bonk':
      case 'thud':
        this.dust.explode(6, fx.x, fx.y);
        break;
      case 'dinos':
        this.dust.explode(24, fx.x, fx.y);
        break;
      case 'defeat':
        this.sparks.explode(80, fx.x, fx.y);
        break;
    }
  }

  private changePhase(b: TRexState): void {
    const was = this.phase;
    this.phase = b.phase;
    if (b.phase === 'defeated' && was !== 'defeated') {
      // He shrinks down into a tiny toy T-Rex.
      this.scene.tweens.add({ targets: this.size, scale: 0.25, duration: 1200, ease: 'Back.easeIn' });
    }
  }

  private place(b: TRexState, animFrame: number): void {
    const cx = b.x + b.w / 2;
    const flip = b.facing > 0;
    const pose = b.phase === 'roaring' ? 'roar' : b.phase === 'walking' && Math.floor(b.step / 12) % 2 === 1 ? 'walk' : 'idle';
    this.body.setTexture(bossTextureKey(pose));
    this.body.setScale(spriteScale(this.body) * this.size.scale);
    const shake = b.phase === 'roaring' && animFrame % 4 < 2 ? 1 : 0;
    const flash = b.phase === 'hurt' && b.timer % 8 < 4 ? 0.4 : 1;
    this.body.setPosition(cx + shake, b.floorY).setFlipX(flip).setAlpha(flash);
    // The crown sits on his head, which is at the front of him, until a big head smashes it.
    const crowned = b.round <= TREX_ROUNDS.indexOf('bighead') && b.phase !== 'defeated';
    const headX = flip ? b.x + b.w - 22 : b.x + 22;
    this.crown.setVisible(crowned).setPosition(headX + shake, b.y + 6).setFlipX(flip).setAlpha(flash);
    const dazed = b.phase === 'hurt';
    this.stars.forEach((s, i) => {
      const a = animFrame * 0.12 + (i * Math.PI * 2) / 3;
      s.setVisible(dazed).setPosition(headX + Math.cos(a) * 20, b.y - 2 + Math.sin(a) * 5);
    });
  }

  /** The block on its rope: up over the middle of the room, across, and down to the target. */
  private drawBlock(b: TRexState): void {
    const block = b.block;
    this.rope.clear();
    this.block.setVisible(block.state !== 'gone').setPosition(b.blockX, block.y);
    const bow = neededTool(b) === 'bow';
    this.target.setVisible(b.phase !== 'defeated');
    this.targetGlow.setVisible(bow && block.state === 'hanging');
    if (block.state !== 'hanging') return;
    const top = block.y - ROPE_TOP;
    const bx = b.blockX + BLOCK_SIZE / 2;
    const tx = b.target.x + b.target.w / 2;
    const ty = b.target.y + b.target.h / 2 - TARGET_PX / 2;
    this.rope.lineStyle(1, ROPE, 1)
      .lineBetween(bx, block.y, bx, top)
      .lineBetween(bx, top, tx, top)
      .lineBetween(tx, top, tx, ty);
  }

  /** The bubble over his head with the tool his next hit needs, and a glow on its station. */
  private drawHints(world: World, b: TRexState): void {
    const tool = neededTool(b);
    if (tool !== this.bubbleTool) {
      this.bubble?.destroy();
      this.bubble = tool ? this.makeBubble(tool) : null;
      this.bubbleTool = tool;
    }
    const show = b.phase !== 'asleep' && b.phase !== 'defeated';
    this.bubble?.setVisible(show).setPosition(b.x + b.w / 2, b.y - 26 + Math.sin(world.animFrame * 0.08) * 3);
    this.stationGlow.clear();
    if (!show || !tool || !world.course) return;
    const pulse = 0.35 + 0.25 * Math.sin(world.animFrame * 0.15);
    for (const s of world.course.stations) {
      if (s.kind !== tool || s.cooldown > 0) continue;
      this.stationGlow.lineStyle(2, 0xffee55, pulse).strokeCircle(s.x + 8, s.y + 8, 15);
    }
  }

  private makeBubble(tool: StationKind): Phaser.GameObjects.Container {
    const ring = this.scene.add.graphics();
    ring.fillStyle(0xffffff, 0.85).fillCircle(0, 0, 12);
    ring.lineStyle(2, 0xffcc00, 1).strokeCircle(0, 0, 12);
    let icon: Phaser.GameObjects.GameObject;
    if (tool === 'bow') {
      const im = this.scene.add.image(0, 0, BOW_TEXTURE);
      icon = im.setScale(spriteScale(im));
    } else {
      const info = POWERUP_INFO[tool as keyof typeof POWERUP_INFO];
      icon = this.scene.add.text(0, 0, info.icon, { fontSize: '13px', resolution: WORLD_TEXT_RESOLUTION }).setOrigin(0.5, 0.5);
    }
    return this.scene.add.container(0, 0, [ring, icon]).setDepth(DEPTH_FX);
  }
}
