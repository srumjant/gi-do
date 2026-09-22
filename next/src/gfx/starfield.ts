import Phaser from 'phaser';
import { BASE_H, BASE_W } from '../config/constants';

/**
 * The drifting dots behind the two choice screens (index.html:2123 and :2153). Same
 * loop both times, different numbers, so it is written once here.
 *
 * No randomness and no per-dot state: position is arithmetic on the dot's index, and
 * brightness is a sine of the frame counter offset by that index, which is what makes
 * the field shimmer rather than blink in unison. Both screens run it at a different
 * count, stride and speed, which is the whole of the difference between them.
 */
export interface StarFieldSpec {
  count: number;
  /** `(i * strideX + offsetX) % BASE_W`, and the same shape down the other axis. */
  strideX: number;
  offsetX: number;
  strideY: number;
  offsetY: number;
  /** `base + sin(frame * speed + i) * swing` — never leaves [base-swing, base+swing]. */
  speed: number;
  base: number;
  swing: number;
}

export interface StarField {
  /** Advances the shimmer by one frame and redraws. */
  update(): void;
}

const DOT = 2;
const WHITE = 0xffffff;

/**
 * Creates the field, drawn into a Graphics of its own so that whatever the scene adds
 * afterwards sits in front of it. It is redrawn whole every frame — forty two-pixel
 * squares, the same work the live game does — rather than kept as forty objects whose
 * alpha is assigned one at a time.
 */
export function createStarField(scene: Phaser.Scene, spec: StarFieldSpec): StarField {
  const graphics = scene.add.graphics();
  // Fixed for the life of the field: only the brightness moves.
  const positions = Array.from({ length: spec.count }, (_, i) => ({
    x: (i * spec.strideX + spec.offsetX) % BASE_W,
    y: (i * spec.strideY + spec.offsetY) % BASE_H,
  }));
  let frame = 0;

  return {
    update(): void {
      frame++;
      graphics.clear();
      positions.forEach((p, i) => {
        const alpha = spec.base + Math.sin(frame * spec.speed + i) * spec.swing;
        graphics.fillStyle(WHITE, alpha).fillRect(p.x, p.y, DOT, DOT);
      });
    },
  };
}
