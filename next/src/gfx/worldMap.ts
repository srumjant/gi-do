import Phaser from 'phaser';
import { TStr } from '../config/i18n';
import { HOME_THEME, LEVELS, type Villain } from '../data/levels';
import { STAGES } from '../data/stages';
import { villainOf, worldKey, worlds } from '../game/story';
import { GAME_FONT_BOLD, GAME_TEXT_RESOLUTION } from './gameFont';
import { spriteScale, STAR_TEXTURE, VILLAIN_TEXTURES } from './textures';

/**
 * The world map between worlds (docs/superpowers/specs/2026-11-23-story-and-transitions-design.md):
 * round badges on a winding dotted path to the T-Rex's castle and on to a little house, home
 * (docs/superpowers/specs/2026-11-24-home-world-design.md), each in its world's colour with its
 * villain's face and its number, a star on each world already done, the next one pulsing, and
 * the hero walking along the path to it. In the opening, the villain carries the sibling the
 * whole way to the castle while the hero waits at the first world.
 */

/** The badges' places on the 640x400 screen, left to right, winding. */
const SPOTS: ReadonlyArray<readonly [number, number]> = [
  [92, 268], [168, 196], [246, 262], [322, 188], [400, 254], [476, 178], [552, 250],
];
const PANEL = { x: 52, y: 96, w: 536, h: 236 };
const BADGE_R = 25;
const FACE_PX = 34;
/** Over the whole cutscene; the map's headline and the hint go one above it. */
export const WORLD_MAP_DEPTH = 10;
/** Frames the hero takes from one world to the next, and the villain to the castle. */
export const MAP_WALK = 110;
const VILLAIN_TRIP = 220;
const LABEL_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '11px', color: '#5a3a1a',
};

/** A point along the path, `u` from 0 (the first world) to 5 (the castle). */
function along(u: number): { x: number; y: number } {
  const i = Math.max(0, Math.min(SPOTS.length - 2, Math.floor(u)));
  const f = Math.max(0, Math.min(1, u - i));
  const [x0, y0] = SPOTS[i];
  const [x1, y1] = SPOTS[i + 1];
  // A gentle bow between each pair, so the path winds rather than zig-zags.
  const bow = Math.sin(f * Math.PI) * 14 * (i % 2 === 0 ? -1 : 1);
  return { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f + bow };
}

export interface MapPlan {
  /** Worlds done: they get a star. */
  done: number;
  /** The hero walks from this world to `to` (the same for standing still). */
  from: number;
  to: number;
  /** The hero's picture (a texture key) and the scale to draw it at. */
  hero: string;
  heroScale: number;
  /** In the opening: the villain who carries the sibling off to the castle. */
  carrier?: Villain;
  sibling?: string;
  siblingScale?: number;
}

export class WorldMap {
  private readonly root: Phaser.GameObjects.Container;
  private readonly hero: Phaser.GameObjects.Image;
  private readonly carrier?: Phaser.GameObjects.Image;
  private readonly carried?: Phaser.GameObjects.Image;
  /** The T-Rex's castle's stop, where the villain carries the sibling in the opening. */
  private readonly castle: number;

  constructor(scene: Phaser.Scene, private readonly plan: MapPlan) {
    const g = scene.add.graphics();
    // The panel: a sheet of old paper with a dark edge, over a dimmed scene.
    g.fillStyle(0x000000, 0.45).fillRect(0, 0, 640, 400);
    g.fillStyle(0x000000, 0.25).fillRoundedRect(PANEL.x + 4, PANEL.y + 5, PANEL.w, PANEL.h, 14);
    g.fillStyle(0xf4e6c8).fillRoundedRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 14);
    g.lineStyle(3, 0x8a6a3a).strokeRoundedRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 14);
    // The path, in dots.
    g.fillStyle(0xb08a5a);
    for (let u = 0; u <= SPOTS.length - 1; u += 0.06) {
      const p = along(u);
      g.fillCircle(p.x, p.y, 2.2);
    }
    const parts: Phaser.GameObjects.GameObject[] = [g];
    const themes = worlds();
    this.castle = Math.max(0, themes.indexOf(LEVELS.length - 1));
    themes.forEach((theme, i) => {
      const [x, y] = SPOTS[i];
      const badge = scene.add.graphics();
      const bg = LEVELS[theme]?.bg ?? STAGES.find((s) => s.theme === theme)?.level.bg ?? '#88ccff';
      const colour = Phaser.Display.Color.HexStringToColor(bg).color;
      const ring = i === SPOTS.length - 1 ? 0xffd23f : 0xffffff;
      if (theme === HOME_THEME) {
        // Home: a little house, a red roof over it.
        badge.fillStyle(0x000000, 0.2).fillRect(x - 20, y - 7, 44, 32);
        badge.fillStyle(colour).fillRect(x - 22, y - 10, 44, 32);
        badge.lineStyle(3, ring).strokeRect(x - 22, y - 10, 44, 32);
        badge.fillStyle(0xc0504a).fillTriangle(x - 28, y - 10, x + 28, y - 10, x, y - 34);
      } else {
        badge.fillStyle(0x000000, 0.2).fillCircle(x + 2, y + 3, BADGE_R);
        badge.fillStyle(colour).fillCircle(x, y, BADGE_R);
        badge.lineStyle(3, ring).strokeCircle(x, y, BADGE_R);
      }
      parts.push(badge);
      const villain = villainOf(theme);
      if (villain) {
        const face = scene.add.image(x, y + 2, VILLAIN_TEXTURES[villain]).setFlipX(false);
        const fit = Math.min(FACE_PX / face.height, (FACE_PX + 8) / face.width);
        face.setScale(fit).setAlpha(i < plan.done ? 0.45 : 1);
        parts.push(face);
      }
      // The name under a low badge and over a high one, so it never sits on the path; and
      // inside the panel at its ends.
      const high = i % 2 === 1;
      const label = scene.add.text(x, high ? y - BADGE_R - 12 : y + BADGE_R + 13, `${i + 1}. ${TStr(worldKey(i))}`, LABEL_FONT)
        .setOrigin(0.5, 0.5);
      const half = label.width / 2 + 8;
      label.setX(Math.max(PANEL.x + half, Math.min(PANEL.x + PANEL.w - half, x)));
      parts.push(label);
      if (i < plan.done) {
        const star = scene.add.image(x + BADGE_R - 4, y - BADGE_R + 4, STAR_TEXTURE);
        star.setScale(spriteScale(star) * 1.6);
        parts.push(star);
      }
      if (i === plan.to && plan.carrier === undefined) {
        // The world the hero is off to: it pulses.
        scene.tweens.add({ targets: badge, alpha: 0.6, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    });
    if (plan.carrier) {
      this.carrier = scene.add.image(0, 0, VILLAIN_TEXTURES[plan.carrier]).setOrigin(0.5, 1);
      this.carrier.setScale(Math.min(30 / this.carrier.height, 40 / this.carrier.width));
      parts.push(this.carrier);
      if (plan.sibling) {
        this.carried = scene.add.image(0, 0, plan.sibling).setOrigin(0.5, 1).setScale(plan.siblingScale ?? 1);
        parts.push(this.carried);
      }
    }
    this.hero = scene.add.image(0, 0, plan.hero).setOrigin(0.5, 1).setScale(plan.heroScale);
    parts.push(this.hero);
    this.root = scene.add.container(0, 0, parts).setDepth(WORLD_MAP_DEPTH).setVisible(false);
    this.update(0);
  }

  setVisible(visible: boolean): this {
    this.root.setVisible(visible);
    return this;
  }

  /** `t`: frames since the map came up. */
  update(t: number): void {
    const { from, to } = this.plan;
    const f = Math.min(1, t / MAP_WALK);
    const p = along(from + (to - from) * f);
    const walking = f < 1 && from !== to;
    const bob = walking ? -Math.abs(Math.sin(t * 0.3)) * 3 : 0;
    this.hero.setPosition(p.x, p.y - BADGE_R + 8 + bob).setFlipX(to < from);
    if (this.carrier) {
      const u = Math.min(this.castle, (t / VILLAIN_TRIP) * this.castle);
      const c = along(u);
      const hop = -Math.abs(Math.sin(t * 0.25)) * 3;
      this.carrier.setPosition(c.x + 14, c.y - 6 + hop).setFlipX(true);
      this.carried?.setPosition(c.x + 14, c.y - 6 + hop - this.carrier.displayHeight + 4);
    }
  }
}
