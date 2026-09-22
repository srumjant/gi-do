// The controller, checked without a controller.
//
// Most of what a gamepad does cannot be tested here and no attempt is made to pretend
// otherwise: `samplePad` reads `navigator.getGamepads()` and `padRumble` calls a motor, and
// a stand-in for either would only assert that the stand-in was written to match the code.
// What IS testable is everything on this side of the hardware, and it is the part that has
// been wrong before:
//
//   1. WHO THE PAD IS. `detectPadKind` parses three browsers' spellings of `gamepad.id`,
//      which is a pile of regexes over real strings — one table, one assertion.
//   2. WHAT ITS BUTTONS MEAN. The map is state-dependent ON PURPOSE (button 1 cancels a
//      menu and shoots in play), and flattening it would put the language toggle back
//      under a thumb that lands on it mid-level.
//   3. HOW HARD IT BUZZES. `shakeToRumble` is pure arithmetic and says so in the live
//      source; index.html:3317-3334 tests it there and this is the same test.
//   4. THAT THE WORLD RAISES A BUZZ AT ALL. `World.rumbles` is the channel the five live
//      `padRumble` call sites land on.
import { describe, expect, it } from 'vitest';
import { TILE } from '../src/config/constants';
import { installGlyphs } from '../src/config/glyphs';
import { T } from '../src/config/i18n';
import { bumpBlocksAbove } from '../src/game/player';
import { setRandom } from '../src/game/random';
import { collectPickups, createWorld, stepStars, stepWorld } from '../src/game/world';
import { PICKUP_RUMBLE } from '../src/game/types';
import { emptyInput } from '../src/input/actions';
import { trackKey } from '../src/input/edges';
import {
  detectPadKind,
  PAD_GLYPHS,
  padCodes,
  padGlyph,
  padRumble,
  shakeToRumble,
  type PadCode,
  type PadKind,
  type PadSnapshot,
} from '../src/input/gamepad';
import { headTileRow } from '../src/physics/player';

/**
 * Real `gamepad.id` strings, in the three shapes browsers write them (index.html:3028-3034):
 * Chrome and Edge append `Vendor: 054c Product: 0ce6`, Firefox prepends `054c-0ce6-`, and
 * Safari gives the name alone. Anything unrecognised is Xbox, because the standard gamepad
 * layout the button map assumes is Xbox-shaped.
 */
const PAD_IDS: [string | null | undefined, PadKind][] = [
  ['DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', 'ps'],
  ['Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)', 'xbox'],
  ['Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)', 'nintendo'],
  ['054c-0ce6-DualSense Wireless Controller', 'ps'],
  ['045e-0b12-Xbox Wireless Controller', 'xbox'],
  ['057e-2009-Pro Controller', 'nintendo'],
  ['DualSense Wireless Controller', 'ps'],
  ['Wireless Controller DualShock 4', 'ps'],
  ['PLAYSTATION(R)3 Controller', 'ps'],
  ['Nintendo Switch Pro Controller', 'nintendo'],
  ['Joy-Con (L/R)', 'nintendo'],
  ['Xbox 360 Controller (XInput STANDARD GAMEPAD)', 'xbox'],
  ['Some Generic Pad', 'xbox'],
  ['', 'xbox'],
  [null, 'xbox'],
  [undefined, 'xbox'],
];

function snapshot(buttons: number[], axes: number[] = [0, 0]): PadSnapshot {
  // 16 buttons, the standard gamepad's count, with the listed indices held.
  return { buttons: Array.from({ length: 16 }, (_, i) => buttons.includes(i)), axes };
}

function codes(buttons: number[], axes?: number[]): Record<'play' | 'menu', PadCode[]> {
  const sorted = (context: 'play' | 'menu'): PadCode[] =>
    [...padCodes(snapshot(buttons, axes), context)].sort();
  return { play: sorted('play'), menu: sorted('menu') };
}

describe('which controller it is', () => {
  it('reads the vendor id, then the name, then gives up and says Xbox', () => {
    // One assertion over the table rather than sixteen tests: the interesting thing is
    // that the whole table maps, and a diff here names the id that stopped mapping.
    expect(PAD_IDS.map(([id]) => ({ id, kind: detectPadKind(id) }))).toEqual(
      PAD_IDS.map(([id, kind]) => ({ id, kind })),
    );
  });

  it('gives every kind a glyph for every action', () => {
    // An action with no glyph would print as an empty gap mid-sentence, which is worse
    // than the wrong glyph: there would be nothing on screen to notice.
    expect(
      Object.values(PAD_GLYPHS).every((set) => Object.values(set).every((glyph) => glyph !== '')),
    ).toBe(true);
  });

  it('knows a cross from an A, and that Nintendo swaps them', () => {
    expect([PAD_GLYPHS.ps.confirm, PAD_GLYPHS.xbox.confirm]).toEqual(['✕', 'Ⓐ']);
    // The one that catches a copy-paste: Nintendo's confirm is where Xbox's cancel is.
    expect([PAD_GLYPHS.nintendo.confirm, PAD_GLYPHS.nintendo.back]).toEqual(['Ⓑ', 'Ⓐ']);
  });

  it('resolves the placeholders in the translations, with no pad attached', () => {
    installGlyphs();
    // Xbox until a pad says otherwise — which is the state a keyboard player is in for
    // the whole game, so it is the one that has to look right.
    expect(padGlyph('confirm')).toBe('Ⓐ');
    expect(T('press_start')).toContain('Ⓐ');
    expect(T('press_start')).not.toContain('{A}');
  });
});

describe('what the buttons mean', () => {
  // index.html:3100-3111. The state-dependence below is the live source's own decision and
  // its comments say why; these three are the ones that must not blur together.
  it('makes button 1 cancel a menu and shoot in play', () => {
    expect(codes([1])).toEqual({ play: ['KeyX'], menu: ['Escape'] });
  });

  it('makes Start confirm a menu and pause a run', () => {
    expect(codes([9])).toEqual({ play: ['Escape'], menu: ['Enter'] });
  });

  it('keeps the language and art-style toggles off the pad during play', () => {
    // The whole reason the context exists: △ is where a small child's thumb lands, and
    // live it flipped the game between Estonian and English mid-level (index.html:3104).
    expect(codes([3, 5])).toEqual({ play: [], menu: ['KeyF', 'KeyL'] });
  });

  it('agrees with itself everywhere else', () => {
    // Jump/confirm, shoot, back, and the d-pad: the same in both halves of the game.
    expect(codes([0, 2, 8, 12, 13, 14, 15])).toEqual({
      play: ['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Escape', 'KeyX', 'Space'],
      menu: ['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Escape', 'KeyX', 'Space'],
    });
  });

  it('takes the left stick as a d-pad once it is past the deadzone', () => {
    // index.html:3124-3137. 0.4 is a long way, because a resting stick is not centred.
    expect(codes([], [-0.39, 0.39]).play).toEqual([]);
    expect(codes([], [-0.41, 0]).play).toEqual(['ArrowLeft']);
    expect(codes([], [0.41, 0]).play).toEqual(['ArrowRight']);
    expect(codes([], [0, -1]).play).toEqual(['ArrowUp']);
    expect(codes([], [0, 1]).play).toEqual(['ArrowDown']);
  });

  it('says the same thing once when the stick and the d-pad agree', () => {
    expect(codes([14], [-1, 0]).play).toEqual(['ArrowLeft']);
  });

  it('ignores a pad that reports fewer buttons than a standard one', () => {
    // Not every pad has sixteen. The live loop skips any index past `gp.buttons.length`
    // (index.html:3114); here a short array simply has nothing at those indices.
    expect(padCodes({ buttons: [true, true], axes: [] }, 'menu')).toEqual(
      new Set(['Space', 'Escape']),
    );
  });
});

describe('a button that was already down', () => {
  // The gamepad half of the bug that opened every run with the player jumping by itself.
  // A pad has no auto-repeat flag to catch it with, and needs none: unlike a fresh Phaser
  // Key, a pad button can say whether it is held at the moment the scene starts, and
  // `trackKey` now seeds itself from exactly that. See createPadSource in gamepad.ts.
  it('is not a press, and is still a hold', () => {
    const button = { isDown: true, location: 0 };
    const tracked = trackKey(button);

    // The scene has just started with the button held down from the screen before.
    expect(tracked.poll()).toEqual({ down: true, pressed: false });
    // Let go, and press it properly.
    button.isDown = false;
    expect(tracked.poll()).toEqual({ down: false, pressed: false });
    button.isDown = true;
    expect(tracked.poll()).toEqual({ down: true, pressed: true });
    expect(tracked.poll()).toEqual({ down: true, pressed: false });
  });
});

describe('how hard it buzzes', () => {
  // index.html:3317-3334, and the same six intensities: the live triggerShake call sites
  // are (3,8) for a stomp, (4,10) and (5,10) for a hit, (5,12) for a death, (5,12) and
  // (8,20) for the boss. Nothing in this port calls shakeToRumble yet — there is no screen
  // shake to call it — so this is what keeps the arithmetic honest until there is.
  it('scales a screen shake into motor magnitudes and milliseconds', () => {
    const stomp = shakeToRumble(3, 8);
    expect(stomp.strong).toBeCloseTo(0.3, 5);
    expect(stomp.dur).toBeCloseTo(133.33, 1);

    const death = shakeToRumble(5, 12);
    expect(death.strong).toBeCloseTo(0.5, 5);
    expect(death.dur).toBeCloseTo(200, 5);

    const bossDefeated = shakeToRumble(8, 20);
    expect(bossDefeated.strong).toBeCloseTo(0.8, 5);
    expect(bossDefeated.dur).toBeCloseTo(333.33, 1);
  });

  it('never leaves the [0,1] the actuator accepts', () => {
    // However large or strange a future call site's numbers are.
    expect(shakeToRumble(999, 1)).toMatchObject({ strong: 1, weak: 1 });
    expect(shakeToRumble(-5, -5)).toMatchObject({ strong: 0, weak: 0 });
  });

  it('no-ops rather than throwing when there is no pad to buzz', () => {
    // True in this headless run, and true of most of the game's real playtime. It is
    // reached from ordinary play, so it has to be silent rather than an exception.
    expect(() => padRumble(shakeToRumble(5, 10))).not.toThrow();
  });
});

describe('the rumbles a step raises', () => {
  // index.html:1447, :1448, :1453, :1521 and :1155 — every `padRumble(0,0.35,80)` in the
  // live game, all five identical, all five beside a pickup noise.
  it('buzzes for a bow, a cape, the cat, a star and a rainbow block', () => {
    const bow = createWorld(0, 'normal');
    bow.player.x = bow.bowPickups[0].x;
    bow.player.y = bow.bowPickups[0].y;
    collectPickups(bow);

    const cape = createWorld(0, 'normal');
    cape.player.x = cape.superPickups[0].x;
    cape.player.y = cape.superPickups[0].y;
    collectPickups(cape);

    const cat = createWorld(0, 'normal');
    cat.player.x = cat.catPickup!.x;
    cat.player.y = cat.catPickup!.y;
    collectPickups(cat);

    const star = createWorld(0, 'normal');
    star.stars = [{ x: star.player.x, y: star.player.y, vy: 0, collected: false }];
    stepStars(star);

    setRandom(() => 0.5);
    const block = createWorld(0, 'normal');
    // Where Arcade's separation leaves a player that has just hit the block from below.
    block.player.x = block.rainbowBlocks[0].x * TILE;
    block.player.y = (block.rainbowBlocks[0].y + 1) * TILE;
    bumpBlocksAbove(block, headTileRow(block.player.y));
    setRandom(Math.random);

    expect([bow, cape, cat, star, block].map((world) => world.rumbles)).toEqual([
      [PICKUP_RUMBLE], [PICKUP_RUMBLE], [PICKUP_RUMBLE], [PICKUP_RUMBLE], [PICKUP_RUMBLE],
    ]);
  });

  it('is the live pulse: the light motor only, and briefly', () => {
    expect(PICKUP_RUMBLE).toEqual({ strong: 0, weak: 0.35, dur: 80 });
  });

  it('holds the step just taken and nothing older', () => {
    // The same hygiene `sounds` has, for the same reason: a buzz banked up behind a death
    // would fire in a burst on the respawn. `stepWorld` empties it whatever else it does.
    const world = createWorld(0, 'normal');
    world.rumbles.push(PICKUP_RUMBLE);
    stepWorld(world, emptyInput());
    expect(world.rumbles).toEqual([]);
  });
});
