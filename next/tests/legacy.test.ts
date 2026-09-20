import { describe, expect, it } from 'vitest';
import { loadLegacySection, DOM_STUB } from './helpers/legacy';

describe('legacy harness', () => {
  it('reads scalars declared before the first section banner', () => {
    const x = loadLegacySection({
      to: '//  DIFFICULTY CONFIGURATION',
      prelude: DOM_STUB,
      expose: ['BASE_W', 'BASE_H', 'ZOOM'],
    });
    expect(x.BASE_W).toBe(640);
    expect(x.BASE_H).toBe(400);
    expect(x.ZOOM).toBe(1.5);
  });

  it('reads a banner-delimited section', () => {
    const x = loadLegacySection({
      from: '//  CONSTANTS & HELPERS',
      to: '//  FELT STYLE',
      expose: ['TILE', 'GRAVITY'],
    });
    expect(x.TILE).toBe(16);
    expect(x.GRAVITY).toBe(0.4);
  });

  it('throws a useful error when a marker is missing', () => {
    expect(() =>
      loadLegacySection({ from: '//  NO SUCH SECTION', expose: ['TILE'] }),
    ).toThrow(/NO SUCH SECTION/);
  });
});
