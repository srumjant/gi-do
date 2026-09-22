import { BASE_H, BASE_W } from '../config/constants';

/**
 * Everything the power-up announcement looks like on one frame, as numbers
 * (index.html:3140-3184). Pure arithmetic over the popup's own countdown and the world's
 * free-running `animFrame`, so it is here rather than in the scene that draws it: the
 * scene is then a list of Phaser calls with no arithmetic to get wrong, and the shape of
 * the animation can be checked without a canvas.
 */
export interface PopupFrame {
  /** 0 at the moment the block was hit, 1 as the last frame ticks away (:3143). */
  progress: number;
  /**
   * The master fade (:3144-3145): up over the first fifth of the countdown, down over
   * the last fifth, flat 1 in between. Everything drawn is multiplied by it.
   */
  alpha: number;
  /** The dim over the whole screen, the live `alpha*0.5` at :3147. */
  dimAlpha: number;
  /** The burst ring, expanding to 180px and fading as it goes (:3151-3153). */
  ringRadius: number;
  ringAlpha: number;
  /** A second ring inside it, drawn only once the outer one has cleared 30px (:3154). */
  innerRingRadius: number;
  showInnerRing: boolean;
  /** The box, scaled from nothing by the entry bounce (:3156-3158). */
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
  /** The pulse on the inner border and the orbiting sparks (:3161). */
  shimmer: number;
  /** The three labels appear only once the box has nearly finished growing (:3165). */
  showText: boolean;
}

/** Where the box and the burst are centred: the middle of the screen (:3153, :3158). */
const CENTRE_X = BASE_W / 2;
const CENTRE_Y = BASE_H / 2;

/** :3151. */
const RING_MAX_RADIUS = 180;
/** :3154. */
const INNER_RING_SCALE = 0.6;
const INNER_RING_FROM = 30;

/** :3157, at full bounce. */
const BOX_W = 240;
const BOX_H = 100;

/** :3165 — below this the box is still visibly growing and the text would jump. */
const TEXT_FROM_BOUNCE = 0.8;

/**
 * The fade in and out are the same expression run against opposite ends of the
 * countdown, each reaching 1 after a fifth of it (:3144).
 */
const FADE_STEEPNESS = 5;

export function popupFrame(timer: number, maxTimer: number, animFrame: number): PopupFrame {
  const remaining = timer / maxTimer;
  const progress = 1 - remaining;
  const enter = Math.min(1, progress * FADE_STEEPNESS);
  const exit = Math.min(1, remaining * FADE_STEEPNESS);
  const alpha = Math.min(enter, exit);

  // Sine-eased on the way in, then held: the box overshoots nothing, it just slows as it
  // reaches full size (:3156). `enter`, not `alpha`, so it does not shrink again on the
  // way out — the live game lets the whole thing fade at full size.
  const bounce = enter < 1 ? Math.sin(enter * Math.PI * 0.5) : 1;
  const boxW = BOX_W * bounce;
  const boxH = BOX_H * bounce;
  const ringRadius = progress * RING_MAX_RADIUS;

  return {
    progress,
    alpha,
    dimAlpha: alpha * 0.5,
    ringRadius,
    ringAlpha: alpha * (1 - progress) * 0.6,
    innerRingRadius: ringRadius * INNER_RING_SCALE,
    showInnerRing: ringRadius > INNER_RING_FROM,
    boxX: CENTRE_X - boxW / 2,
    boxY: CENTRE_Y - boxH / 2,
    boxW,
    boxH,
    shimmer: Math.sin(animFrame * 0.2) * 0.3 + 0.7,
    showText: bounce > TEXT_FROM_BOUNCE,
  };
}

/**
 * The four sparks orbiting the box (index.html:3176-3182), a quarter turn apart, on a
 * circle 10px outside the box's half-width and half-height — which is an ellipse, since
 * the box is not square, and which therefore grows with the box.
 */
export function popupSparks(animFrame: number, boxW: number, boxH: number): { x: number; y: number }[] {
  return [0, 1, 2, 3].map((i) => {
    const angle = animFrame * 0.05 + (i * Math.PI) / 2;
    return {
      x: CENTRE_X + Math.cos(angle) * (boxW / 2 + 10),
      y: CENTRE_Y + Math.sin(angle) * (boxH / 2 + 10),
    };
  });
}
