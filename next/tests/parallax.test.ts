import { describe, expect, it } from 'vitest';
import { loadLegacySection } from './helpers/legacy';
import { LEVELS } from '../src/data/levels';
import { PARALLAX } from '../src/data/parallax';

// Stop at drawParallax, NOT at the next banner. The text between PARALLAX and the
// SILLY POWER-UPS banner also contains the keyboard/touch input setup, which calls
// window.addEventListener at evaluation time and throws in the VM. Narrowing to the
// data keeps the slice free of anything that needs a DOM.
const legacy = loadLegacySection({
  from: '//  PARALLAX BACKGROUNDS',
  to: 'function drawParallax',
  expose: ['PARALLAX'],
});

describe('parallax table matches the live game', () => {
  it('is identical', () => {
    expect(PARALLAX).toEqual(legacy.PARALLAX);
  });

  it('covers every level', () => {
    LEVELS.forEach((_, i) => {
      expect(PARALLAX[i], `level ${i} has no parallax entry`).toBeDefined();
      expect(PARALLAX[i].layers.length).toBeGreaterThan(0);
      expect(PARALLAX[i].bg2).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  it('orders layers back to front by scroll speed', () => {
    for (const { layers } of Object.values(PARALLAX)) {
      for (let i = 1; i < layers.length; i++) {
        expect(layers[i].speed).toBeGreaterThanOrEqual(layers[i - 1].speed);
      }
    }
  });
});
