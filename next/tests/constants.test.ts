import { describe, expect, it } from 'vitest';
import { loadLegacySection, DOM_STUB } from './helpers/legacy';
import {
  BASE_W, BASE_H, ZOOM, VIEW_W, VIEW_H, TILE, GRAVITY, ENEMY_SCALE,
} from '../src/config/constants';

describe('constants match the live game', () => {
  it('matches the view constants', () => {
    const x = loadLegacySection({
      to: '//  DIFFICULTY CONFIGURATION',
      prelude: DOM_STUB,
      expose: ['BASE_W', 'BASE_H', 'ZOOM', 'VIEW_W', 'VIEW_H'],
    });
    expect(BASE_W).toBe(x.BASE_W);
    expect(BASE_H).toBe(x.BASE_H);
    expect(ZOOM).toBe(x.ZOOM);
    expect(VIEW_W).toBe(x.VIEW_W);
    expect(VIEW_H).toBe(x.VIEW_H);
  });

  it('matches the world constants', () => {
    const x = loadLegacySection({
      from: '//  CONSTANTS & HELPERS',
      to: '//  FELT STYLE',
      expose: ['TILE', 'GRAVITY', 'ENEMY_SCALE'],
    });
    expect(TILE).toBe(x.TILE);
    expect(GRAVITY).toBe(x.GRAVITY);
    expect(ENEMY_SCALE).toBe(x.ENEMY_SCALE);
  });

  it('derives the view size from the zoom rather than hardcoding it', () => {
    expect(VIEW_W).toBe(BASE_W / ZOOM);
    expect(VIEW_H).toBe(BASE_H / ZOOM);
  });
});
