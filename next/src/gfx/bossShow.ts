import Phaser from 'phaser';
import { DIFFICULTY_CONFIG } from '../config/difficulty';
import { TStr } from '../config/i18n';
import type { Villain } from '../data/levels';
import type { CourseBoss } from '../game/bosses';
import { createBossShow, stepBossShow, type BossLook, type BossShowState } from '../game/bossShow';
import { villainKey } from '../game/story';
import type { World } from '../game/types';
import { GAME_FONT_BOLD, WORLD_TEXT_RESOLUTION } from './gameFont';
import { redKey, shutKey, whiteKey } from './textures';

/**
 * The boss show on screen (its rules are game/bossShow.ts), shared by the six boss views: the
 * speech bubble over the boss, the name banner at its entrance, a white and a red copy laid
 * over its body for the flash and the anger, its eyes shut, and the bob, squash and wobble.
 *
 * The look is laid over wherever the view put the boss's pictures this frame, and taken off
 * again as soon as the scene has drawn (the scene's RENDER event), so a view's own placing,
 * phase changes and tweens see their own values and nothing piles up frame after frame.
 * Pictures, tweens and text only: nothing is redrawn every frame (the bubble is drawn once per
 * line), which keeps it cheap on a TV.
 */

/** Over everything in the world, the boss's own effects included. */
const DEPTH_TALK = 24;
const BUBBLE_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: WORLD_TEXT_RESOLUTION, fontSize: '9px', color: '#222222',
};
const BANNER_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: WORLD_TEXT_RESOLUTION, fontSize: '24px', color: '#ff3333',
  stroke: '#000000', strokeThickness: 4,
};
const BUBBLE_PAD_X = 6;
const BUBBLE_PAD_Y = 3;
const TAIL = 6;
/** How far above the boss's head the tail's tip is. */
const ABOVE_HEAD = 6;
/** The banner's top, below the top of the camera's view. */
const BANNER_TOP = 16;
/** The HUD's strip along the top of the view, which the bubble stays below. */
const HUD_STRIP = 26;

interface Applied {
  part: Phaser.GameObjects.Image;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  angle: number;
}

/** Something the bubble goes over: a picture, or a group of them (the T-Rex's tool bubble). */
type Anchor = Phaser.GameObjects.Image | Phaser.GameObjects.Container;

interface Overlay {
  white: Phaser.GameObjects.Image;
  red: Phaser.GameObjects.Image;
}

export class BossShowView {
  private show: BossShowState = createBossShow();
  private drawn: CourseBoss | null = null;
  private readonly bubble: Phaser.GameObjects.Graphics;
  /** The bubble's tail, apart from its box: the box keeps inside the view, the tail points at the boss. */
  private readonly tail: Phaser.GameObjects.Graphics;
  private readonly words: Phaser.GameObjects.Text;
  private readonly banner: Phaser.GameObjects.Text;
  private readonly overlays = new Map<Phaser.GameObjects.Image, Overlay>();
  private applied: Applied[] = [];
  private shut: Array<{ body: Phaser.GameObjects.Image; key: string }> = [];
  private shownLine: string | null = null;
  private bubbleH = 0;

  constructor(private readonly scene: Phaser.Scene, kind: Villain) {
    this.bubble = scene.add.graphics().setDepth(DEPTH_TALK).setVisible(false);
    this.tail = scene.add.graphics().setDepth(DEPTH_TALK + 0.05).setVisible(false)
      .fillStyle(0xffffff).lineStyle(1.5, 0x222222)
      .fillTriangle(-4, -TAIL - 1.5, 4, -TAIL - 1.5, 0, 0)
      .lineBetween(-4, -TAIL, 0, 0).lineBetween(4, -TAIL, 0, 0);
    this.words = scene.add.text(0, 0, '', BUBBLE_FONT).setOrigin(0.5, 0.5).setDepth(DEPTH_TALK + 0.1).setVisible(false);
    this.banner = scene.add.text(0, 0, TStr(villainKey(kind)), BANNER_FONT)
      .setOrigin(0.5, 0).setDepth(DEPTH_TALK + 0.2).setVisible(false);
    const events = scene.events;
    events.on(Phaser.Scenes.Events.RENDER, this.restore, this);
    events.once(Phaser.Scenes.Events.SHUTDOWN, () => events.off(Phaser.Scenes.Events.RENDER, this.restore, this));
  }

  /**
   * Once per rendered frame, after the view has placed the boss. `bodies` get the flash, the red
   * and the eyes; `parts` (the bodies and whatever they carry) move with the bob, squash and wobble;
   * the bubble goes over the highest of the parts and of `over` (a boss's hearts, say).
   */
  update(
    world: World,
    boss: CourseBoss,
    events: readonly string[],
    bodies: readonly Phaser.GameObjects.Image[],
    parts: readonly Phaser.GameObjects.Image[],
    over: readonly Anchor[] = [],
  ): void {
    if (boss !== this.drawn) {
      // A respawn builds a fresh boss: a fresh show with it.
      this.drawn = boss;
      this.show = createBossShow();
      this.shownLine = null;
    }
    const hints = world.dc === DIFFICULTY_CONFIG.super_easy || world.dc === DIFFICULTY_CONFIG.easy;
    const frame = stepBossShow(this.show, {
      boss, events, frame: world.animFrame, heroDead: world.dead, heroHasCape: world.player.hasCape, hints,
    });
    // Beaten, the bubble follows the boss's own body as it goes, not the pieces flying off it.
    this.talk(frame.line, boss, this.show.beaten ? bodies : [...parts, ...over]);
    this.showBanner(frame.look.banner);
    if (this.show.beaten) {
      // The view plays its own defeat from here.
      this.hideOverlays();
      return;
    }
    this.lay(frame.look, bodies, parts);
  }

  /** Everything hidden: the view has no boss to show. */
  hide(): void {
    this.bubble.setVisible(false);
    this.tail.setVisible(false);
    this.words.setVisible(false);
    this.banner.setVisible(false);
    this.hideOverlays();
  }

  private lay(look: BossLook, bodies: readonly Phaser.GameObjects.Image[], parts: readonly Phaser.GameObjects.Image[]): void {
    this.applied = parts.filter((p) => p.visible).map((part) => ({
      part, x: part.x, y: part.y, scaleX: part.scaleX, scaleY: part.scaleY, angle: part.angle,
    }));
    for (const a of this.applied) {
      a.part.setPosition(a.x, a.y + look.dy).setScale(a.scaleX * look.sx, a.scaleY * look.sy).setAngle(a.angle + look.angle);
    }
    const textures = this.scene.textures;
    for (const body of bodies) {
      const key = body.texture.key;
      if (look.eyesShut && body.visible && textures.exists(shutKey(key))) {
        this.shut.push({ body, key });
        body.setTexture(shutKey(key));
      }
      this.overlay(body, key, look);
    }
  }

  /** The white and the red copy of a body, matched to it this frame. */
  private overlay(body: Phaser.GameObjects.Image, key: string, look: BossLook): void {
    let o = this.overlays.get(body);
    if (!o) {
      const copy = (depth: number) => this.scene.add.image(0, 0, body.texture.key).setDepth(depth).setVisible(false);
      o = { red: copy(body.depth + 0.01), white: copy(body.depth + 0.02) };
      this.overlays.set(body, o);
    }
    const textures = this.scene.textures;
    for (const [image, texture, alpha] of [[o.white, whiteKey(key), look.flash], [o.red, redKey(key), look.red]] as const) {
      const a = alpha * body.alpha;
      if (!body.visible || a <= 0.01 || !textures.exists(texture)) {
        image.setVisible(false);
        continue;
      }
      image.setTexture(texture).setVisible(true).setAlpha(a)
        .setOrigin(body.originX, body.originY).setPosition(body.x, body.y)
        .setScale(body.scaleX, body.scaleY).setAngle(body.angle).setFlip(body.flipX, body.flipY);
    }
  }

  private hideOverlays(): void {
    for (const o of this.overlays.values()) {
      o.white.setVisible(false);
      o.red.setVisible(false);
    }
  }

  /** After the scene has drawn: every picture back where its view put it. */
  private restore(): void {
    for (const a of this.applied) a.part.setPosition(a.x, a.y).setScale(a.scaleX, a.scaleY).setAngle(a.angle);
    this.applied = [];
    for (const s of this.shut) s.body.setTexture(s.key);
    this.shut = [];
  }

  /** The bubble: drawn once when a line comes, then only moved with the boss. */
  private talk(line: string | null, boss: CourseBoss, anchors: readonly Anchor[]): void {
    if (line !== this.shownLine) {
      this.shownLine = line;
      if (line === null) {
        this.bubble.setVisible(false);
        this.tail.setVisible(false);
        this.words.setVisible(false);
      } else {
        this.words.setText(TStr(line)).setVisible(true);
        const w = this.words.width + 2 * BUBBLE_PAD_X;
        const h = this.words.height + 2 * BUBBLE_PAD_Y;
        this.bubbleH = h;
        this.bubble.clear().setVisible(true)
          .fillStyle(0xffffff).lineStyle(1.5, 0x222222)
          .fillRoundedRect(-w / 2, -TAIL - h, w, h, 4).strokeRoundedRect(-w / 2, -TAIL - h, w, h, 4);
        this.tail.setVisible(true);
      }
    }
    if (line === null) return;
    // Over the boss's head, kept inside the camera's view.
    const view = this.scene.cameras.main.worldView;
    const half = this.words.width / 2 + BUBBLE_PAD_X + 2;
    let top = Infinity;
    let centre = boss.x + boss.w / 2;
    for (const a of anchors) {
      if (!a.visible || a.alpha <= 0) continue;
      const bounds = a.getBounds();
      if (bounds.top < top) [top, centre] = [bounds.top, bounds.centerX];
    }
    if (top === Infinity) top = boss.y;
    if (!this.show.beaten) {
      // Over the boss; but over its picture when the picture is off somewhere of its own (the poo
      // flying out of the toilet).
      centre = boss.x + boss.w / 2;
      const body = anchors[0];
      if (body?.visible) {
        const drawnAt = body.getBounds().centerX;
        if (Math.abs(drawnAt - centre) > 24) centre = drawnAt;
      }
    }
    const tip = Math.max(view.x + 10, Math.min(view.right - 10, centre));
    const x = Math.max(view.x + half, Math.min(view.right - half, tip));
    const y = Math.max(view.y + HUD_STRIP + this.bubbleH + TAIL, top - ABOVE_HEAD);
    this.tail.setPosition(tip, y);
    this.bubble.setPosition(x, y);
    this.words.setPosition(x, y - TAIL - this.bubbleH / 2);
  }

  private showBanner(alpha: number): void {
    if (alpha <= 0) {
      this.banner.setVisible(false);
      return;
    }
    const view = this.scene.cameras.main.worldView;
    this.banner.setVisible(true).setAlpha(alpha).setPosition(view.centerX, view.y + BANNER_TOP);
  }
}
