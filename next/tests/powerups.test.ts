import { beforeEach, describe, expect, it } from 'vitest';
import { setLang } from '../src/config/i18n';
import { POWERUP_INFO, powerupLabel } from '../src/data/powerups';
import { popupFrame, popupSparks } from '../src/gfx/powerupPopup';
import type { PowerupType } from '../src/game/types';
import { loadLegacySection } from './helpers/legacy';

interface LegacyInfo {
  name: Record<string, string>;
  desc: Record<string, string>;
  color: string;
  icon: string;
}

// index.html:1141-1147. The slice runs to the next banner; the three function
// declarations it picks up on the way are never called.
const legacy = loadLegacySection<{ POWERUP_INFO: Record<string, LegacyInfo> }>({
  from: '//  SILLY POWER-UPS',
  to: '//  INIT LEVEL',
  expose: ['POWERUP_INFO'],
});

const TYPES: PowerupType[] = ['fart', 'bighead', 'chicken'];

describe('the power-up table', () => {
  beforeEach(() => setLang('et'));

  it('is the live table, both languages, colours and icons', () => {
    expect(POWERUP_INFO).toEqual(legacy.POWERUP_INFO);
  });

  it('resolves each phrase in the language being played in', () => {
    for (const type of TYPES) {
      setLang('et');
      expect(powerupLabel(type).name).toBe(legacy.POWERUP_INFO[type].name.et);
      expect(powerupLabel(type).desc).toBe(legacy.POWERUP_INFO[type].desc.et);
      setLang('en');
      expect(powerupLabel(type).name).toBe(legacy.POWERUP_INFO[type].name.en);
      expect(powerupLabel(type).desc).toBe(legacy.POWERUP_INFO[type].desc.en);
      // The colour and the icon are not translated.
      expect(powerupLabel(type).color).toBe(legacy.POWERUP_INFO[type].color);
      expect(powerupLabel(type).icon).toBe(legacy.POWERUP_INFO[type].icon);
    }
  });
});

/**
 * The announcement is drawn by a scene, which is not unit-tested; the arithmetic it draws
 * from is here. Every expectation below is index.html:3143-3182 worked out by hand for a
 * 120-frame countdown, which is the only length `giveRandomSillyPowerup` ever sets.
 */
describe('the announcement frame', () => {
  const MAX = 120;

  it('fades in over the first fifth of the countdown and out over the last', () => {
    const cases: [timer: number, alpha: number][] = [
      [120, 0],    // the frame it appears
      [108, 0.5],  // a tenth in, halfway up
      [96, 1],     // a fifth in, fully there
      [60, 1],     // the flat middle
      [24, 1],     // a fifth left, still fully there
      [12, 0.5],   // a tenth left, halfway down
      [0, 0],      // gone
    ];
    for (const [timer, alpha] of cases) {
      expect(popupFrame(timer, MAX, 0).alpha, `timer ${timer}`).toBeCloseTo(alpha);
    }
  });

  it('dims the screen to half the fade', () => {
    expect(popupFrame(60, MAX, 0).dimAlpha).toBeCloseTo(0.5);
    expect(popupFrame(108, MAX, 0).dimAlpha).toBeCloseTo(0.25);
  });

  it('grows the box to 240x100 about the centre of the screen, and leaves it there', () => {
    const cases: [timer: number, width: number][] = [
      [120, 0],
      [96, 240],  // full size by the time the fade reaches 1
      [60, 240],
      [12, 240],  // fading out at full size, not shrinking
    ];
    for (const [timer, width] of cases) {
      const frame = popupFrame(timer, MAX, 0);
      expect(frame.boxW, `timer ${timer}`).toBeCloseTo(width);
      expect(frame.boxH, `timer ${timer}`).toBeCloseTo(width * (100 / 240));
      expect(frame.boxX + frame.boxW / 2).toBeCloseTo(320);
      expect(frame.boxY + frame.boxH / 2).toBeCloseTo(200);
    }
  });

  it('holds the labels back until the box has nearly finished growing', () => {
    expect(popupFrame(106, MAX, 0).showText).toBe(false);
    expect(popupFrame(105, MAX, 0).showText).toBe(true);
    expect(popupFrame(12, MAX, 0).showText).toBe(true);
  });

  it('throws the ring out to 180px, fading as it goes', () => {
    expect(popupFrame(120, MAX, 0).ringRadius).toBeCloseTo(0);
    expect(popupFrame(60, MAX, 0).ringRadius).toBeCloseTo(90);
    expect(popupFrame(0, MAX, 0).ringRadius).toBeCloseTo(180);
    // alpha 1 halfway through, less the (1-progress) fade and the constant 0.6.
    expect(popupFrame(60, MAX, 0).ringAlpha).toBeCloseTo(0.3);
    // The inner ring waits for the outer one to clear 30px, at six-tenths of its radius.
    expect(popupFrame(100, MAX, 0).showInnerRing).toBe(false);
    expect(popupFrame(99, MAX, 0).showInnerRing).toBe(true);
    expect(popupFrame(60, MAX, 0).innerRingRadius).toBeCloseTo(54);
  });

  it('pulses the shimmer on the world clock rather than on the countdown', () => {
    // Sine of animFrame, so it keeps moving while the world behind it is frozen.
    expect(popupFrame(60, MAX, 0).shimmer).toBeCloseTo(0.7);
    expect(popupFrame(60, MAX, Math.PI / 0.4).shimmer).toBeCloseTo(1);
    expect(popupFrame(60, MAX, Math.PI / 0.4 * 3).shimmer).toBeCloseTo(0.4);
  });

  it('puts the four sparks a quarter turn apart, 10px outside the box', () => {
    const sparks = popupSparks(0, 240, 100);
    expect(sparks.map((s) => [Math.round(s.x), Math.round(s.y)])).toEqual([
      [450, 200],
      [320, 260],
      [190, 200],
      [320, 140],
    ]);
  });
});
