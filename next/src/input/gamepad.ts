import type { GlyphAction } from '../config/i18n';
import type { RumbleCue, World } from '../game/types';
import type { ReadableKey } from './edges';

/**
 * The controller: who it is, what its buttons mean, and how it buzzes.
 *
 * Port of index.html:3025-3138 — `CONTROLLER IDENTITY` and `GAMEPAD SUPPORT`, which are
 * two sections in the live source and one subject.
 *
 * No Phaser here. The Gamepad API is a browser API, not a Phaser one, and the live game
 * reaches for `navigator.getGamepads()` directly; going through Phaser's own gamepad
 * plugin would add a second source of truth for what a button is doing and tie the pad to
 * a scene, which is exactly what it must not be (see `createPadSource`).
 */

/* ────────────────────────── who the controller is ────────────────────────── */

export type PadKind = 'xbox' | 'ps' | 'nintendo';

/**
 * index.html:3035. There is no official controller-type API, so `gamepad.id` is all there
 * is, and every browser writes it differently (the live comment at :3028-3034 has the
 * three spellings). These are the USB vendor ids of Sony, Microsoft and Nintendo, which
 * both Chrome's `Vendor: 054c` and Firefox's leading `054c-0ce6-` carry.
 */
const PAD_VENDORS: Record<string, PadKind> = {
  '054c': 'ps',
  '045e': 'xbox',
  '057e': 'nintendo',
};

/** index.html:3036-3040, verbatim. */
export const PAD_GLYPHS: Record<PadKind, Record<GlyphAction, string>> = {
  xbox: { confirm: 'Ⓐ', back: 'Ⓑ', shoot: 'Ⓧ', pause: '☰' },
  ps: { confirm: '✕', back: '○', shoot: '□', pause: 'OPTIONS' },
  nintendo: { confirm: 'Ⓑ', back: 'Ⓐ', shoot: 'Ⓨ', pause: '+' },
};

/**
 * index.html:3041. Module state on purpose, and not a scene's: one document has one
 * controller in its hands, whichever screen is up, and the glyph resolver that reads this
 * (config/glyphs.ts) is installed once at boot. `samplePad` below is the only writer.
 */
let padKind: PadKind = 'xbox';
let padLastId = '';

/**
 * Port of index.html:3043-3052. Vendor id first — from either the Chrome or the Firefox
 * spelling — then keywords, then Xbox, because the "standard gamepad" layout the whole
 * button map below assumes IS Xbox-shaped, so it is the safest thing to be wrong about.
 */
export function detectPadKind(id: string | null | undefined): PadKind {
  const s = (id ?? '').toLowerCase();
  const vendor = s.match(/vendor:\s*([0-9a-f]{4})/) ?? s.match(/^([0-9a-f]{4})-[0-9a-f]{4}/);
  const known = vendor ? PAD_VENDORS[vendor[1]] : undefined;
  if (known) return known;
  if (/dualsense|dualshock|playstation|sony/.test(s)) return 'ps';
  if (/nintendo|switch|joy-?con|pro controller/.test(s)) return 'nintendo';
  if (/xbox|xinput|microsoft/.test(s)) return 'xbox';
  return 'xbox';
}

/**
 * index.html:3054. The live version is `(PAD_GLYPHS[padKind]||PAD_GLYPHS.xbox)[slot]||''`;
 * both of those fallbacks are unreachable here because `padKind` is a union and every kind
 * defines every action, which the types say and a test checks.
 */
export function padGlyph(action: GlyphAction): string {
  return PAD_GLYPHS[padKind][action];
}

/** For tests, and for anyone who wants to know what is plugged in. */
export function currentPadKind(): PadKind {
  return padKind;
}

/* ─────────────────────────────── haptics ─────────────────────────────── */

/**
 * Port of index.html:3056-3066. A screen shake, in the units `triggerShake` takes, as a
 * haptic pulse: intensity (3 to 8 at the live call sites) becomes motor magnitudes, and
 * duration — in frames at 60fps — becomes milliseconds.
 *
 * Pure arithmetic, which is the whole point of its existing separately from `padRumble`:
 * the conversion can be checked on a bench with no controller in the room, and the live
 * game checks it there too (index.html:3317-3334).
 *
 * NOTHING IN THIS PORT CALLS IT YET. Its caller live is `triggerShake`
 * (index.html:1001-1005) and this port has no screen shake at all, so this is the input
 * half of a feature whose visual half does not exist. It is here, and tested, so that the
 * shake work has only a camera left to build.
 */
export function shakeToRumble(intensity: number, duration: number): RumbleCue {
  const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
  return {
    strong: clamp01(intensity / 10),
    weak: clamp01(intensity / 16),
    dur: (duration * 1000) / 60,
  };
}

/** What `playEffect` wants, spelled out so that reaching it needs no `any`. */
interface RumblePad {
  vibrationActuator?: {
    playEffect(
      type: string,
      params: { duration: number; strongMagnitude: number; weakMagnitude: number },
    ): unknown;
  };
}

/**
 * Port of index.html:3068-3079. The first connected pad that has a motor gets the pulse
 * and the rest are left alone — one child, one controller.
 *
 * No-ops on a pad without haptics, in a browser that rejects the effect, and (the common
 * case by far) with no controller attached at all. It is reached from ordinary play, so
 * every one of those has to be silent rather than an exception.
 */
export function padRumble(cue: RumbleCue): void {
  for (const gp of connectedPads()) {
    const actuator = (gp as unknown as RumblePad).vibrationActuator;
    if (!actuator) continue;
    try {
      actuator.playEffect('dual-rumble', {
        duration: cue.dur,
        strongMagnitude: cue.strong,
        weakMagnitude: cue.weak,
      });
    } catch {
      // A browser that knows `playEffect` but not `dual-rumble` throws. Nothing to do.
    }
    return;
  }
}

/**
 * The other end of `World.rumbles`, and the exact shape of `playSounds` in audio/cues.ts:
 * play what the step raised, then empty the list. Drained inside the fixed-step loop for
 * the same reason the sounds are — see SliceScene.
 */
export function playRumbles(world: World): void {
  for (const cue of world.rumbles) padRumble(cue);
  world.rumbles.length = 0;
}

/* ────────────────────────────── the buttons ────────────────────────────── */

/**
 * The key codes the pad synthesises. The live game has no notion of a gamepad action at
 * all: `pollGamepad` writes straight into the same `keys`/`justPressed` maps the keyboard
 * listeners write into (index.html:3119-3121), so a pad button IS a key press. This port
 * keeps that, because it is what makes the pad free — every screen that already reads a
 * key gets the pad with it, and nothing has to be told twice which button confirms.
 */
export type PadCode =
  | 'Space'
  | 'Escape'
  | 'Enter'
  | 'KeyX'
  | 'KeyL'
  | 'KeyF'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight';

/**
 * Which half of the game is reading. The live game asks `isMenuState()` (index.html:3099,
 * :1254-1257) once per poll; this port has no single game state to ask, so the context is
 * fixed when the source is made — by the scene that makes it, which knows perfectly well
 * whether it is a menu. Only one input-reading scene is ever running (the menus hand over
 * with `scene.start`, which stops the one before), so the two can never disagree.
 */
export type PadContext = 'play' | 'menu';

/** A pad as this module reads it: pressed flags and stick axes, nothing else. */
export interface PadSnapshot {
  buttons: readonly boolean[];
  axes: readonly number[];
}

/** index.html:3125. Big, because a resting stick is not perfectly centred. */
const DEADZONE = 0.4;

/**
 * Port of the button map at index.html:3100-3111, INCLUDING the parts that depend on
 * whether a menu is up. That state-dependence is deliberate and is documented as such in
 * the live source; it is not an accident to be tidied away:
 *
 *   - Button 1 (○ on a DualSense, Ⓑ on an Xbox pad) is cancel in menus and shoot during
 *     play — the universal console convention.
 *   - Button 9 (OPTIONS / ☰) is confirm in menus and pause during a run, because Start is
 *     where a thumb goes looking for pause.
 *   - Buttons 3 (△ / Ⓨ) and 5 (R1 / RB) are menu-only, and that is the whole reason the
 *     context exists. They toggle the language and the art style, and a small child's
 *     thumb lands on △ constantly, which used to flip the game between Estonian and
 *     English mid-level (index.html:3104-3107, :1249-1253).
 *
 * Three of these codes have no consumer in this port yet: nothing reads `Escape` during
 * play (there is no pause screen) and nothing reads `KeyL` or `KeyF` at all (no language
 * or art-style toggle). They are mapped anyway. The map is the live game's and the
 * screens that read them are coming; leaving holes in it would only mean rediscovering
 * which button was supposed to do what.
 */
function buttonCode(index: number, context: PadContext): PadCode | null {
  const menu = context === 'menu';
  switch (index) {
    case 0: return 'Space';
    case 1: return menu ? 'Escape' : 'KeyX';
    case 2: return 'KeyX';
    case 3: return menu ? 'KeyL' : null;
    case 5: return menu ? 'KeyF' : null;
    case 8: return 'Escape';
    case 9: return menu ? 'Enter' : 'Escape';
    case 12: return 'ArrowUp';
    case 13: return 'ArrowDown';
    case 14: return 'ArrowLeft';
    case 15: return 'ArrowRight';
    default: return null;
  }
}

/**
 * Everything the pad is holding down, as key codes. Pure — a snapshot in, a set out — so
 * the map above can be checked without a controller.
 *
 * The left stick is folded in beside the d-pad (index.html:3124-3137) rather than kept
 * apart: pushing the stick left and holding d-pad left are the same thing to everyone
 * involved, and a union is how you say so. The live game keeps separate previous-state
 * slots for the two and can therefore have one release cancel the other's hold; this
 * cannot, which is a difference and an improvement.
 */
export function padCodes(snapshot: PadSnapshot, context: PadContext): Set<PadCode> {
  const held = new Set<PadCode>();
  snapshot.buttons.forEach((pressed, index) => {
    if (!pressed) return;
    const code = buttonCode(index, context);
    if (code) held.add(code);
  });
  const horizontal = snapshot.axes[0] ?? 0;
  const vertical = snapshot.axes[1] ?? 0;
  if (horizontal < -DEADZONE) held.add('ArrowLeft');
  if (horizontal > DEADZONE) held.add('ArrowRight');
  if (vertical < -DEADZONE) held.add('ArrowUp');
  if (vertical > DEADZONE) held.add('ArrowDown');
  return held;
}

/* ──────────────────────────── reading the pad ──────────────────────────── */

function connectedPads(): Gamepad[] {
  // `navigator` is an unresolved identifier under the node test runner, and `getGamepads`
  // is missing in older browsers; neither may be assumed.
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  if (!nav?.getGamepads) return [];
  return Array.from(nav.getGamepads()).filter(
    (pad): pad is Gamepad => pad !== null && pad.connected,
  );
}

/**
 * The first connected pad, as a snapshot (index.html:3086-3090). Returns null when there
 * is no controller, which is most of the time.
 *
 * This is also where the controller identifies itself: a new `id` re-runs `detectPadKind`,
 * which is what puts a ✕ where the Ⓐ was when a DualSense is picked up. Checked on every
 * sample, exactly as live — a pad swapped mid-game is a pad swapped mid-game.
 */
export function samplePad(): PadSnapshot | null {
  const gp = connectedPads()[0];
  if (!gp) return null;
  if (gp.id !== padLastId) {
    padLastId = gp.id;
    padKind = detectPadKind(gp.id);
  }
  return {
    buttons: gp.buttons.map((button) => button.pressed),
    axes: Array.from(gp.axes),
  };
}

/**
 * A pad, dressed as keys.
 *
 * `key(code)` hands back something that satisfies `ReadableKey` — the three fields
 * edges.ts reads off a Phaser Key — so a pad button goes through `trackKey` and `pollAll`
 * unchanged, and the rising edges the simulation is driven by are computed by the same
 * code for both sources. One mechanism, used twice: a second way of detecting a press
 * would be a second way for it to land on the wrong step.
 *
 * ## What "pressed" means for a button that is already down
 *
 * The keyboard's answer is `isCarriedHold`: a Phaser Key that has just been made reads as
 * up however hard the key is held, and the only evidence that it was already down is that
 * the first `keydown` it sees carries the browser's `repeat` flag. That is why the level
 * used to open with the player jumping by itself, having been started by a Space that was
 * still down.
 *
 * A gamepad has no auto-repeat and no events, so there is no repeat flag to ask about —
 * and none is needed, because it can answer the question the keyboard could not:
 * `navigator.getGamepads()` reports what is held RIGHT NOW, at any moment, including the
 * moment a scene starts. So the fix the keyboard could not use works perfectly here. The
 * source refreshes as it is built, `trackKey` seeds its previous step from the button's
 * current state, and a button still held from the screen before is simply already down.
 * Confirming the character screen with Ⓐ therefore starts the level with no jump in it,
 * and holding Ⓐ on the difficulty screen does not skip the character screen half a second
 * later.
 *
 * `location` is 0 because a pad button is not the left or right copy of a modifier, and
 * `originalEvent` is absent because there is no DOM event behind it — which makes
 * `isCarriedHold` false for every pad key, correctly: the seeding has already dealt with
 * the carried hold, and a button held since a real press must go on reading as held.
 */
export interface PadSource {
  /** Re-reads the hardware. Called once at the top of each read of this source. */
  refresh(): void;
  /** A virtual key for one of the codes this pad synthesises. */
  key(code: PadCode): ReadableKey;
}

export function createPadSource(context: PadContext): PadSource {
  let held: ReadonlySet<PadCode> = new Set();
  const refresh = (): void => {
    const snapshot = samplePad();
    held = snapshot ? padCodes(snapshot, context) : new Set();
  };
  // Before any key is made from it, so that what is already held is already known.
  refresh();
  return {
    refresh,
    key(code: PadCode): ReadableKey {
      return {
        get isDown(): boolean {
          return held.has(code);
        },
        location: 0,
      };
    },
  };
}
