import { describe, expect, it } from 'vitest';
import { bakeScale, planSprite } from '../src/gfx/rasterise';
import type { Palette, SpriteData } from '../src/data/sprites';

// 2 rows x 3 cols: transparent corners, one solid cell of each of two palette colours.
const SPRITE: SpriteData = [
  [0, 1, 2],
  [1, 0, 2],
];
const PALETTE: Palette = { 1: '#ff0000', 2: '#00ff00' };

function cellAt(cells: ReturnType<typeof planSprite>['cells'], row: number, col: number, scale: number) {
  return cells.find((cell) => cell.x === col * scale && cell.y === row * scale);
}

describe('planSprite', () => {
  it('sizes the plan at cols*scale by rows*scale', () => {
    const plan = planSprite(SPRITE, PALETTE, 3);
    expect(plan.width).toBe(3 * 3); // 3 cols
    expect(plan.height).toBe(2 * 3); // 2 rows
  });

  it('leaves an index-0 cell untouched', () => {
    const plan = planSprite(SPRITE, PALETTE, 2);
    expect(cellAt(plan.cells, 0, 0, 2)).toBeUndefined();
    expect(cellAt(plan.cells, 1, 1, 2)).toBeUndefined();
  });

  it('paints a non-zero index in its palette colour', () => {
    const plan = planSprite(SPRITE, PALETTE, 2);
    expect(cellAt(plan.cells, 0, 1, 2)).toMatchObject({ color: '#ff0000', size: 2 });
    expect(cellAt(plan.cells, 0, 2, 2)).toMatchObject({ color: '#00ff00', size: 2 });
    expect(cellAt(plan.cells, 1, 0, 2)).toMatchObject({ color: '#ff0000', size: 2 });
  });

  it('does not throw on an index missing from the palette', () => {
    const oddSprite: SpriteData = [[9]];
    expect(() => planSprite(oddSprite, PALETTE, 1)).not.toThrow();
    expect(planSprite(oddSprite, PALETTE, 1).cells).toHaveLength(1);
  });
});

describe('bakeScale', () => {
  it('bakes a whole scale as it is', () => {
    expect([1, 2, 4, 6].map(bakeScale)).toEqual([1, 2, 4, 6]);
  });

  it('bakes a fraction at one pixel a cell, so no cell edge falls between pixels', () => {
    expect([1.5, 1.8].map(bakeScale)).toEqual([1, 1]);
    const plan = planSprite(SPRITE, PALETTE, bakeScale(1.8));
    const whole = (n: number): boolean => Number.isInteger(n);
    expect(plan.cells.every((cell) => whole(cell.x) && whole(cell.y) && whole(cell.size))).toBe(true);
  });
});
