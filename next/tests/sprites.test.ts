import { describe, expect, it } from 'vitest';
import { loadLegacySection, legacySectionSource } from './helpers/legacy';
import * as ported from '../src/data/sprites';
import type { SpriteData, Palette } from '../src/data/sprites';

const NAMES = [
  'GIGI_STAND', 'GIGI_RUN', 'GIGI_JUMP', 'GIGI_P',
  'GIGI_TRUCK_STAND', 'GIGI_TRUCK_RUN', 'GIGI_TRUCK_JUMP', 'GIGI_TRUCK_P',
  'DODO_STAND', 'DODO_RUN', 'DODO_JUMP', 'DODO_P',
  'DODO_ELSA_STAND', 'DODO_ELSA_RUN', 'DODO_ELSA_JUMP', 'DODO_ELSA_P',
  'DOLL_S', 'DOLL_P', 'CAR_S', 'CAR_P', 'DINO_S', 'DINO_P',
  'GHOST_S', 'GHOST_P', 'BAT_S', 'BAT_P', 'CANNON_S', 'CANNON_P',
  'FIREBALL_S', 'FIREBALL_P', 'BOUNCER_S', 'BOUNCER_P',
  'PENGUIN_S', 'PENGUIN_P', 'ICEBAT_S', 'ICEBAT_P',
  'BOSS_IDLE', 'BOSS_WALK', 'BOSS_CHARGE', 'BOSS_ROAR', 'BOSS_P',
  'STAR_S', 'STAR_P', 'HEART_S', 'HEART_P', 'BOW_S', 'BOW_P',
  'ARROW_S', 'ARROW_P', 'SUPER_S', 'SUPER_P', 'CAPE_S', 'CAPE_P',
  'CAT_S', 'CAT_P', 'CAT_SCRATCH_S', 'CAT_SCRATCH_P',
  'CHICKEN_S', 'CHICKEN_P',
  'CLOUD_S', 'CLOUD_P',
  'GIGI_SKINS', 'DODO_SKINS', 'KIDNAPPERS',
];

const legacy = loadLegacySection({
  from: '//  SPRITES',
  to: '//  LEVELS',
  expose: NAMES,
});

const legacySpritesSource = () => legacySectionSource('//  SPRITES', '//  LEVELS');

describe('sprite data matches the live game', () => {
  for (const name of NAMES) {
    it(`${name} is identical`, () => {
      expect((ported as Record<string, unknown>)[name]).toEqual(legacy[name]);
    });
  }

  // NAMES is hand-written, so it cannot catch its own omissions — the first draft of
  // this plan silently missed CHICKEN_S, CHICKEN_P and KIDNAPPERS. Derive the expected
  // set from the live file instead, so a sprite the kids add later cannot be dropped
  // on the floor without a test going red.
  it('exports every constant the live SPRITES section declares', () => {
    const declared = [...legacySpritesSource().matchAll(/^const ([A-Z][A-Z0-9_]*)\s*=/gm)]
      .map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(60);
    for (const name of declared) {
      expect((ported as Record<string, unknown>)[name], `${name} not exported`)
        .toBeDefined();
    }
  });
});

// The live game's own testSprites checks, ported. They catch the mistake that
// actually happens when the kids ask for a new character: a row of the wrong
// width, or a pixel referencing a palette slot that was never defined.
function isSprite(v: unknown): v is SpriteData {
  return Array.isArray(v) && Array.isArray(v[0]);
}

describe('sprite integrity', () => {
  const sprites = Object.entries(ported).filter(
    (e): e is [string, SpriteData] => isSprite(e[1]),
  );

  it('finds sprites to check', () => {
    expect(sprites.length).toBeGreaterThan(20);
  });

  for (const [name, data] of sprites) {
    it(`${name}: every row is the same width`, () => {
      const width = data[0].length;
      for (const row of data) expect(row.length).toBe(width);
    });
  }

  const PAIRS: Array<[string, SpriteData, Palette]> = [
    ['GIGI_STAND', ported.GIGI_STAND, ported.GIGI_P],
    ['GIGI_RUN', ported.GIGI_RUN, ported.GIGI_P],
    ['GIGI_JUMP', ported.GIGI_JUMP, ported.GIGI_P],
    ['DODO_STAND', ported.DODO_STAND, ported.DODO_P],
    ['DODO_RUN', ported.DODO_RUN, ported.DODO_P],
    ['DODO_JUMP', ported.DODO_JUMP, ported.DODO_P],
    ['BOSS_IDLE', ported.BOSS_IDLE, ported.BOSS_P],
    ['BOSS_WALK', ported.BOSS_WALK, ported.BOSS_P],
    ['BOSS_CHARGE', ported.BOSS_CHARGE, ported.BOSS_P],
    ['BOSS_ROAR', ported.BOSS_ROAR, ported.BOSS_P],
    ['CAT_S', ported.CAT_S, ported.CAT_P],
  ];

  for (const [name, data, palette] of PAIRS) {
    it(`${name}: every index exists in its palette`, () => {
      for (const row of data) {
        for (const index of row) {
          if (index === 0) continue;
          expect(palette[index], `${name} uses index ${index}`).toBeDefined();
        }
      }
    });
  }
});
